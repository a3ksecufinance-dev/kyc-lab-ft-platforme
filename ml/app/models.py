"""
Gestion des modèles ML — Isolation Forest + XGBoost.

Cycle de vie :
  1. Au démarrage : charger les modèles depuis /app/models/ (joblib)
  2. Si aucun modèle : entraîner sur l'historique DB et sauvegarder
  3. Score final = combinaison pondérée (60% XGBoost + 40% IsoForest)
  4. Réentraînement : endpoint POST /retrain (admin only)
"""

import joblib
import numpy as np
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional
import structlog
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from sqlalchemy import text

log = structlog.get_logger()


class MlModelManager:
    """Singleton gérant le cycle de vie des modèles."""

    def __init__(self, models_dir: Path):
        self.models_dir = models_dir
        self.models_dir.mkdir(parents=True, exist_ok=True)

        self.iso_forest: Optional[IsolationForest] = None
        self.scaler: Optional[StandardScaler] = None
        self.xgb_model = None          # XGBClassifier (chargé si dispo)
        self.xgb_available = False
        self.model_version: str = "untrained"
        self.trained_at: Optional[datetime] = None
        self.training_samples: int = 0

    # ─── Chargement ───────────────────────────────────────────────────────────

    def load(self) -> bool:
        """Charge les modèles depuis le disque. Retourne True si succès."""
        iso_path    = self.models_dir / "isolation_forest.joblib"
        scaler_path = self.models_dir / "scaler.joblib"
        meta_path   = self.models_dir / "metadata.joblib"

        if not iso_path.exists() or not scaler_path.exists():
            log.info("Aucun modèle trouvé sur disque")
            return False

        try:
            self.iso_forest = joblib.load(iso_path)
            self.scaler     = joblib.load(scaler_path)

            if meta_path.exists():
                meta = joblib.load(meta_path)
                self.model_version    = meta.get("version", "v1")
                self.trained_at       = meta.get("trained_at")
                self.training_samples = meta.get("samples", 0)

            # XGBoost optionnel
            xgb_path = self.models_dir / "xgboost.joblib"
            if xgb_path.exists():
                self.xgb_model     = joblib.load(xgb_path)
                self.xgb_available = True
                log.info("XGBoost chargé", version=self.model_version)

            log.info("Modèles chargés", version=self.model_version, samples=self.training_samples)
            return True

        except Exception as e:
            log.error("Erreur chargement modèles", error=str(e))
            return False

    # ─── Entraînement ─────────────────────────────────────────────────────────

    def train(self, features_matrix: np.ndarray, labels: Optional[np.ndarray] = None) -> dict:
        """
        Entraîne Isolation Forest (toujours) + XGBoost (si labels fournis).

        features_matrix : (n_samples, 20) — matrice de features
        labels          : (n_samples,) binaire — 1=suspect, 0=normal (optionnel)
        """
        n_samples = len(features_matrix)
        log.info("Démarrage entraînement", n_samples=n_samples, has_labels=labels is not None)

        if n_samples < 50:
            raise ValueError(f"Pas assez de données pour entraîner ({n_samples} < 50 minimum)")

        # ── Normalisation ──────────────────────────────────────────────────────
        self.scaler = StandardScaler()
        X_scaled = self.scaler.fit_transform(features_matrix)

        # ── Isolation Forest ──────────────────────────────────────────────────
        # contamination : proportion estimée d'anomalies dans le dataset
        # Pour AML : ~2-5% de transactions suspectes est une estimation réaliste
        contamination = min(
            max(0.01, (np.sum(labels) / n_samples) if labels is not None else 0.02),
            0.1
        )
        self.iso_forest = IsolationForest(
            n_estimators=200,
            contamination=contamination,
            max_samples="auto",
            random_state=42,
            n_jobs=-1,
        )
        self.iso_forest.fit(X_scaled)

        # ── XGBoost (supervisé) ───────────────────────────────────────────────
        xgb_result = {}
        if labels is not None and np.sum(labels) >= 10:
            try:
                from xgboost import XGBClassifier
                from sklearn.model_selection import cross_val_score

                scale_pos_weight = (n_samples - np.sum(labels)) / max(np.sum(labels), 1)
                self.xgb_model = XGBClassifier(
                    n_estimators=300,
                    max_depth=6,
                    learning_rate=0.05,
                    subsample=0.8,
                    colsample_bytree=0.8,
                    scale_pos_weight=scale_pos_weight,  # gère le déséquilibre classes
                    random_state=42,
                    eval_metric="aucpr",                # AUC-PR mieux qu'AUC-ROC pour déséquilibré
                    use_label_encoder=False,
                    n_jobs=-1,
                )
                self.xgb_model.fit(X_scaled, labels)
                self.xgb_available = True

                # Validation croisée
                cv_scores = cross_val_score(
                    self.xgb_model, X_scaled, labels,
                    cv=5, scoring="roc_auc", n_jobs=-1
                )
                xgb_result = {
                    "xgb_cv_auc_mean": round(float(cv_scores.mean()), 4),
                    "xgb_cv_auc_std":  round(float(cv_scores.std()),  4),
                    "xgb_positive_samples": int(np.sum(labels)),
                }
                log.info("XGBoost entraîné", **xgb_result)

            except ImportError:
                log.warning("XGBoost non disponible — Isolation Forest seul")
            except Exception as e:
                log.error("Erreur XGBoost", error=str(e))

        # ── Sauvegarde ────────────────────────────────────────────────────────
        version = f"v{datetime.now().strftime('%Y%m%d_%H%M')}"
        self.model_version    = version
        self.trained_at       = datetime.now()
        self.training_samples = n_samples

        joblib.dump(self.iso_forest, self.models_dir / "isolation_forest.joblib")
        joblib.dump(self.scaler,     self.models_dir / "scaler.joblib")
        joblib.dump({
            "version":    version,
            "trained_at": self.trained_at,
            "samples":    n_samples,
        }, self.models_dir / "metadata.joblib")

        if self.xgb_available:
            joblib.dump(self.xgb_model, self.models_dir / "xgboost.joblib")

        result = {
            "version":         version,
            "samples":         n_samples,
            "contamination":   round(contamination, 4),
            **xgb_result,
        }
        log.info("Modèles sauvegardés", **result)
        return result

    # ─── Inférence ────────────────────────────────────────────────────────────

    def score(self, features: np.ndarray) -> dict:
        """
        Score une transaction. Retourne un dict avec :
          - ml_score (0-100) : score de risque ML
          - anomaly_score    : score brut Isolation Forest (-1 à 1)
          - xgb_proba        : probabilité XGBoost (0-1) si disponible
          - is_anomaly        : True si détecté comme anomalie
          - model_version    : version utilisée
        """
        if self.iso_forest is None or self.scaler is None:
            # Pas de modèle entraîné — score neutre
            return {
                "ml_score":      0,
                "anomaly_score": 0.0,
                "xgb_proba":     None,
                "is_anomaly":    False,
                "model_version": "untrained",
                "explanation":   "Modèle non entraîné",
            }

        X = features.reshape(1, -1)
        X_scaled = self.scaler.transform(X)

        # Isolation Forest
        # score_samples retourne entre -1 (anomalie) et 0 (normal)
        anomaly_score = float(self.iso_forest.score_samples(X_scaled)[0])
        iso_suspicious = anomaly_score < -0.1

        # XGBoost
        xgb_proba = None
        xgb_suspicious = False
        if self.xgb_available and self.xgb_model is not None:
            xgb_proba = float(self.xgb_model.predict_proba(X_scaled)[0][1])
            xgb_suspicious = xgb_proba > 0.6

        # Score combiné (0-100)
        # Isolation Forest : normaliser [-1, 0] → [100, 0]
        iso_score = max(0, min(100, int((-anomaly_score) * 100)))

        if self.xgb_available and xgb_proba is not None:
            # 60% XGBoost + 40% Isolation Forest
            ml_score = int(xgb_proba * 60 + (iso_score / 100) * 40)
        else:
            ml_score = iso_score

        is_anomaly = xgb_suspicious or (iso_suspicious and ml_score > 50)

        return {
            "ml_score":      ml_score,
            "anomaly_score": round(anomaly_score, 4),
            "xgb_proba":     round(xgb_proba, 4) if xgb_proba is not None else None,
            "is_anomaly":    is_anomaly,
            "model_version": self.model_version,
            "explanation":   _build_explanation(features, ml_score, iso_suspicious, xgb_proba),
        }

    @property
    def is_ready(self) -> bool:
        return self.iso_forest is not None and self.scaler is not None


def _build_explanation(
    features: np.ndarray,
    ml_score: int,
    iso_suspicious: bool,
    xgb_proba: Optional[float],
) -> str:
    """Explication lisible du score pour l'analyste."""
    reasons = []

    amount          = features[0]
    tx_count_24h    = features[14]
    tx_volume_24h   = features[15]
    tx_count_1h     = features[16]
    pep_status      = features[9]
    sanction_flag   = features[10]
    counterparty_r  = features[11]
    amount_vs_avg   = features[19]

    if amount >= 10000:    reasons.append(f"montant élevé ({amount:.0f}€)")
    if pep_status:         reasons.append("client PEP")
    if sanction_flag:      reasons.append("statut sanction actif")
    if counterparty_r:     reasons.append("contrepartie pays à risque FATF")
    if tx_count_24h >= 10: reasons.append(f"haute fréquence ({tx_count_24h:.0f} tx/24h)")
    if tx_count_1h >= 5:   reasons.append(f"vélocité élevée ({tx_count_1h:.0f} tx/1h)")
    if amount_vs_avg >= 5: reasons.append(f"montant {amount_vs_avg:.0f}x la moyenne")
    if iso_suspicious:     reasons.append("anomalie détectée par Isolation Forest")

    if not reasons:
        return "Aucune anomalie significative détectée"

    return f"Score ML {ml_score}/100 — " + ", ".join(reasons)


# Instance globale (chargée au démarrage)
_manager: Optional[MlModelManager] = None

def get_model_manager(models_dir: Path) -> MlModelManager:
    global _manager
    if _manager is None:
        _manager = MlModelManager(models_dir)
    return _manager
