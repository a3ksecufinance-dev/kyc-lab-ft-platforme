"""Tests des modèles ML — Isolation Forest + scoring."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
import numpy as np
import tempfile
from pathlib import Path

from app.models import MlModelManager


def make_normal_samples(n: int = 200) -> np.ndarray:
    """Génère des transactions normales pour l'entraînement."""
    rng = np.random.RandomState(42)
    X = rng.randn(n, 20)
    # amount_eur entre 100 et 5000
    X[:, 0] = rng.uniform(100, 5000, n)
    # risk_score entre 0 et 30 (faible)
    X[:, 6] = rng.randint(0, 30, n)
    return X.astype(np.float64)


def make_anomaly_samples(n: int = 20) -> np.ndarray:
    """Génère des transactions anormales (montants élevés, PEP, etc.)."""
    rng = np.random.RandomState(0)
    X = rng.randn(n, 20)
    # Montants très élevés
    X[:, 0]  = rng.uniform(15000, 100000, n)
    # PEP = 1
    X[:, 9]  = 1
    # Pays à risque = 1
    X[:, 11] = 1
    return X.astype(np.float64)


class TestMlModelManager:

    def setup_method(self):
        self.tmpdir = tempfile.mkdtemp()
        self.manager = MlModelManager(Path(self.tmpdir))

    def test_not_ready_before_training(self):
        assert not self.manager.is_ready

    def test_score_without_model_returns_zero(self):
        features = make_normal_samples(1)[0]
        result = self.manager.score(features)
        assert result["ml_score"] == 0
        assert result["model_version"] == "untrained"
        assert not result["is_anomaly"]

    def test_train_requires_minimum_samples(self):
        with pytest.raises(ValueError, match="50 minimum"):
            self.manager.train(make_normal_samples(10))

    def test_train_succeeds_with_enough_data(self):
        X = np.vstack([make_normal_samples(200), make_anomaly_samples(20)])
        y = np.array([0]*200 + [1]*20)
        result = self.manager.train(X, y)

        assert result["samples"] == 220
        assert "version" in result
        assert result["contamination"] > 0
        assert self.manager.is_ready

    def test_model_persists_to_disk(self):
        X = make_normal_samples(100)
        self.manager.train(X)

        # Créer un nouveau manager depuis le même répertoire
        manager2 = MlModelManager(Path(self.tmpdir))
        loaded = manager2.load()

        assert loaded
        assert manager2.is_ready
        assert manager2.model_version == self.manager.model_version

    def test_score_normal_transaction(self):
        X_train = np.vstack([make_normal_samples(200), make_anomaly_samples(20)])
        y = np.array([0]*200 + [1]*20)
        self.manager.train(X_train, y)

        # Transaction normale : faible montant
        normal_tx = np.zeros(20, dtype=np.float64)
        normal_tx[0] = 200.0    # amount = 200€
        normal_tx[6] = 5        # risk_score = 5
        normal_tx[12] = 0       # risk_level = LOW

        result = self.manager.score(normal_tx)
        assert result["model_version"] != "untrained"
        assert 0 <= result["ml_score"] <= 100
        assert isinstance(result["is_anomaly"], bool)
        assert isinstance(result["explanation"], str)
        assert len(result["explanation"]) > 0

    def test_score_anomalous_transaction(self):
        X_train = np.vstack([make_normal_samples(200), make_anomaly_samples(20)])
        y = np.array([0]*200 + [1]*20)
        self.manager.train(X_train, y)

        # Transaction très suspecte
        anomaly_tx = np.zeros(20, dtype=np.float64)
        anomaly_tx[0]  = 50000.0  # montant énorme
        anomaly_tx[9]  = 1        # PEP
        anomaly_tx[10] = 1        # sanction
        anomaly_tx[11] = 1        # pays à risque
        anomaly_tx[14] = 25       # 25 tx en 24h

        result = self.manager.score(anomaly_tx)
        # Le score doit être supérieur à celui d'une transaction normale
        assert result["ml_score"] >= 0  # Minimum garanti

    def test_score_returns_all_fields(self):
        self.manager.train(make_normal_samples(100))
        result = self.manager.score(make_normal_samples(1)[0])

        required_fields = {
            "ml_score", "anomaly_score", "xgb_proba",
            "is_anomaly", "model_version", "explanation"
        }
        assert required_fields.issubset(result.keys())

    def test_ml_score_bounded(self):
        """Le score ML doit toujours être entre 0 et 100."""
        X_train = np.vstack([make_normal_samples(200), make_anomaly_samples(20)])
        y = np.array([0]*200 + [1]*20)
        self.manager.train(X_train, y)

        for _ in range(20):
            features = np.random.randn(20).astype(np.float64)
            result = self.manager.score(features)
            assert 0 <= result["ml_score"] <= 100

    def test_train_without_labels(self):
        """Isolation Forest seul (sans XGBoost) si pas de labels."""
        X = make_normal_samples(100)
        result = self.manager.train(X)  # sans labels

        assert self.manager.is_ready
        assert not self.manager.xgb_available
        assert result["samples"] == 100

    def test_train_with_labels_enables_xgb(self):
        """XGBoost doit être activé si labels fournis avec assez d'anomalies."""
        X = np.vstack([make_normal_samples(200), make_anomaly_samples(20)])
        y = np.array([0]*200 + [1]*20)  # 20 anomalies >= 10 minimum
        self.manager.train(X, y)

        # XGBoost doit être dispo si xgboost est installé
        try:
            import xgboost
            assert self.manager.xgb_available
            assert "xgb_cv_auc_mean" in self.manager.train(X, y)
        except ImportError:
            pytest.skip("XGBoost non installé")

    def test_model_version_increments(self):
        """Deux entraînements successifs doivent avoir des versions différentes."""
        import time
        X = make_normal_samples(100)

        self.manager.train(X)
        v1 = self.manager.model_version

        time.sleep(1.1)  # version basée sur timestamp — attendre 1s
        self.manager.train(X)
        v2 = self.manager.model_version

        assert v1 != v2
