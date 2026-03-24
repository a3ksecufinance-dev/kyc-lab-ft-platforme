"""
KYC-AML ML Scoring Service — FastAPI

Endpoints :
  POST /score          — scorer une transaction (appelé par Node.js async)
  POST /retrain        — réentraîner les modèles sur l'historique DB
  GET  /model/info     — version, date d'entraînement, métriques
  GET  /health         — health check Docker
  GET  /metrics        — Prometheus metrics
"""

from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import Optional
import numpy as np
import structlog
from fastapi import FastAPI, HTTPException, Header, Depends
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field
from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST

from .config import settings
from .models import get_model_manager
from .features import TransactionContext, extract_features, FEATURE_NAMES
from .database import get_db_engine
from sqlalchemy import text

log = structlog.get_logger()

# ─── Prometheus metrics ───────────────────────────────────────────────────────

SCORE_COUNTER     = Counter("ml_score_requests_total", "Total score requests", ["result"])
SCORE_LATENCY     = Histogram("ml_score_duration_seconds", "Score latency")
HIGH_RISK_COUNTER = Counter("ml_high_risk_total", "Transactions scored high risk")
MODEL_GAUGE       = Gauge("ml_model_version_info", "Model version", ["version"])
RETRAIN_COUNTER   = Counter("ml_retrain_total", "Retrain executions", ["status"])

# ─── Lifecycle ────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    manager = get_model_manager(settings.models_dir)
    loaded  = manager.load()

    if not loaded:
        log.info("Aucun modèle — tentative d'entraînement initial sur l'historique DB")
        try:
            await _train_from_db(manager)
        except Exception as e:
            log.warning("Entraînement initial échoué (DB vide ?)", error=str(e))
            log.info("Service démarré sans modèle — /score retournera score=0")

    if manager.is_ready:
        MODEL_GAUGE.labels(version=manager.model_version).set(1)
        log.info("ML service prêt", version=manager.model_version, samples=manager.training_samples)

    yield
    log.info("ML service arrêté")


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
    docs_url="/docs" if settings.debug else None,
    redoc_url=None,
)

# ─── Auth interne ─────────────────────────────────────────────────────────────

def verify_api_key(x_api_key: str = Header(alias="X-Api-Key")):
    if x_api_key != settings.internal_api_key:
        raise HTTPException(status_code=401, detail="Clé API invalide")

# ─── Schemas ──────────────────────────────────────────────────────────────────

class ScoreRequest(BaseModel):
    # Transaction
    transaction_id:       str
    customer_id:          int
    amount:               float = Field(gt=0)
    currency:             str   = "EUR"
    transaction_type:     str
    channel:              str
    counterparty_country: Optional[str] = None
    transaction_date:     datetime

    # Customer
    customer_risk_score:  int   = Field(ge=0, le=100, default=0)
    customer_risk_level:  str   = "LOW"
    kyc_status:           str   = "APPROVED"
    pep_status:           bool  = False
    sanction_status:      str   = "CLEAR"
    monthly_income:       Optional[float] = None


class ScoreResponse(BaseModel):
    transaction_id:  str
    ml_score:        int            # 0–100
    anomaly_score:   float          # score brut Isolation Forest
    xgb_proba:       Optional[float]
    is_anomaly:      bool
    model_version:   str
    explanation:     str
    features_used:   int = 20
    scored_at:       datetime


class RetrainRequest(BaseModel):
    days_history: int = Field(ge=30, le=730, default=180)
    force:        bool = False      # forcer même si récemment entraîné


class RetrainResponse(BaseModel):
    version:          str
    samples:          int
    contamination:    float
    xgb_cv_auc_mean:  Optional[float] = None
    xgb_cv_auc_std:   Optional[float] = None
    xgb_positive_samples: Optional[int] = None
    duration_seconds: float
    trained_at:       datetime


# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    manager = get_model_manager(settings.models_dir)
    return {
        "status":        "ok",
        "model_ready":   manager.is_ready,
        "model_version": manager.model_version,
        "trained_at":    manager.trained_at.isoformat() if manager.trained_at else None,
    }


@app.get("/metrics", response_class=PlainTextResponse)
async def metrics():
    return PlainTextResponse(
        content=generate_latest().decode(),
        media_type=CONTENT_TYPE_LATEST,
    )


@app.get("/model/info")
async def model_info(_: str = Depends(verify_api_key)):
    manager = get_model_manager(settings.models_dir)
    return {
        "is_ready":        manager.is_ready,
        "model_version":   manager.model_version,
        "trained_at":      manager.trained_at.isoformat() if manager.trained_at else None,
        "training_samples": manager.training_samples,
        "xgb_available":   manager.xgb_available,
        "features":        FEATURE_NAMES,
        "thresholds": {
            "anomaly":  settings.anomaly_threshold,
            "xgb":      settings.xgb_threshold,
        },
    }


@app.post("/score", response_model=ScoreResponse)
async def score_transaction(
    req: ScoreRequest,
    _:   str = Depends(verify_api_key),
):
    manager = get_model_manager(settings.models_dir)

    with SCORE_LATENCY.time():
        ctx = TransactionContext(
            transaction_id       = req.transaction_id,
            customer_id          = req.customer_id,
            amount               = req.amount,
            currency             = req.currency,
            transaction_type     = req.transaction_type,
            channel              = req.channel,
            counterparty_country = req.counterparty_country,
            transaction_date     = req.transaction_date,
            risk_score           = req.customer_risk_score,
            risk_level           = req.customer_risk_level,
            kyc_status           = req.kyc_status,
            pep_status           = req.pep_status,
            sanction_status      = req.sanction_status,
            monthly_income       = req.monthly_income,
        )

        features = await extract_features(ctx)
        result   = manager.score(features)

    # Métriques Prometheus
    risk_level = "high" if result["ml_score"] >= 70 else "medium" if result["ml_score"] >= 40 else "low"
    SCORE_COUNTER.labels(result=risk_level).inc()
    if result["is_anomaly"]:
        HIGH_RISK_COUNTER.inc()

    # Mise à jour asynchrone du score ML en DB
    try:
        await _update_ml_score_in_db(
            req.transaction_id,
            result["ml_score"],
            result["is_anomaly"],
            result["explanation"],
        )
    except Exception as e:
        log.error("Erreur mise à jour DB", tx=req.transaction_id, error=str(e))

    log.info(
        "Transaction scorée",
        tx_id=req.transaction_id,
        ml_score=result["ml_score"],
        is_anomaly=result["is_anomaly"],
        model=result["model_version"],
    )

    return ScoreResponse(
        transaction_id = req.transaction_id,
        ml_score       = result["ml_score"],
        anomaly_score  = result["anomaly_score"],
        xgb_proba      = result["xgb_proba"],
        is_anomaly     = result["is_anomaly"],
        model_version  = result["model_version"],
        explanation    = result["explanation"],
        scored_at      = datetime.now(),
    )


@app.post("/retrain", response_model=RetrainResponse)
async def retrain(
    req: RetrainRequest,
    _:   str = Depends(verify_api_key),
):
    manager = get_model_manager(settings.models_dir)

    # Vérifier si un entraînement récent existe (évite les double-calls)
    if not req.force and manager.trained_at:
        hours_since = (datetime.now() - manager.trained_at).total_seconds() / 3600
        if hours_since < 6:
            raise HTTPException(
                status_code=429,
                detail=f"Modèle entraîné il y a {hours_since:.1f}h — utiliser force=true pour forcer"
            )

    start = datetime.now()
    RETRAIN_COUNTER.labels(status="started").inc()

    try:
        result = await _train_from_db(manager, days=req.days_history)
        RETRAIN_COUNTER.labels(status="success").inc()
        MODEL_GAUGE.labels(version=result["version"]).set(1)

        return RetrainResponse(
            version              = result["version"],
            samples              = result["samples"],
            contamination        = result["contamination"],
            xgb_cv_auc_mean      = result.get("xgb_cv_auc_mean"),
            xgb_cv_auc_std       = result.get("xgb_cv_auc_std"),
            xgb_positive_samples = result.get("xgb_positive_samples"),
            duration_seconds     = (datetime.now() - start).total_seconds(),
            trained_at           = manager.trained_at or datetime.now(),
        )

    except Exception as e:
        RETRAIN_COUNTER.labels(status="error").inc()
        log.error("Erreur réentraînement", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


# ─── Helpers DB ───────────────────────────────────────────────────────────────

async def _train_from_db(manager, days: int = 180) -> dict:
    """
    Charge l'historique DB et entraîne les modèles.
    Utilise les transactions COMPLETED + FLAGGED des N derniers jours.
    """
    from .features import (
        TX_TYPE_ENC, CHANNEL_ENC, RISK_ENC, KYC_ENC, HIGH_RISK_COUNTRIES
    )

    engine = get_db_engine()
    since  = datetime.now() - timedelta(days=days)

    query = text("""
        SELECT
            t.amount::float,
            t.transaction_type,
            t.channel,
            EXTRACT(HOUR  FROM t.transaction_date)        AS hour_of_day,
            EXTRACT(ISODOW FROM t.transaction_date) - 1   AS day_of_week,
            t.counterparty_country,
            t.is_suspicious,
            c.risk_score,
            c.risk_level,
            c.kyc_status,
            c.pep_status,
            c.sanction_status,
            c.monthly_income::float
        FROM transactions t
        JOIN customers c ON c.id = t.customer_id
        WHERE t.created_at >= :since
          AND t.status IN ('COMPLETED', 'FLAGGED', 'BLOCKED')
        ORDER BY t.created_at DESC
        LIMIT 50000
    """)

    with engine.connect() as conn:
        rows = conn.execute(query, {"since": since}).fetchall()

    if len(rows) < 50:
        raise ValueError(f"Historique insuffisant : {len(rows)} transactions (minimum 50)")

    features_list = []
    labels_list   = []

    for row in rows:
        amount      = float(row.amount or 0)
        income      = float(row.monthly_income or 0)
        is_weekend  = 1 if int(row.day_of_week or 0) >= 5 else 0
        cc          = row.counterparty_country

        feat = np.array([
            amount,
            TX_TYPE_ENC.get(row.transaction_type, 0),
            CHANNEL_ENC.get(row.channel, 0),
            int(row.hour_of_day or 0),
            int(row.day_of_week or 0),
            is_weekend,
            int(row.risk_score or 0),
            income,
            (amount / income) if income > 0 else 0.0,
            1 if row.pep_status else 0,
            1 if row.sanction_status == "MATCH" else 0,
            1 if cc and cc in HIGH_RISK_COUNTRIES else 0,
            RISK_ENC.get(row.risk_level, 0),
            KYC_ENC.get(row.kyc_status, 0),
            0, 0, 0, 0, 0, 0,  # agrégés — 0 lors de l'entraînement batch
        ], dtype=np.float64)

        features_list.append(feat)
        labels_list.append(1 if row.is_suspicious else 0)

    X = np.array(features_list)
    y = np.array(labels_list)

    return manager.train(X, y)


async def _update_ml_score_in_db(
    transaction_id: str,
    ml_score: int,
    is_anomaly: bool,
    explanation: str,
) -> None:
    """
    Met à jour le riskScore de la transaction avec le score ML.
    Combine avec le score AML existant (max des deux).
    """
    engine = get_db_engine()
    with engine.connect() as conn:
        # Lire le score AML existant
        row = conn.execute(text("""
            SELECT risk_score, is_suspicious FROM transactions
            WHERE transaction_id = :tx_id
        """), {"tx_id": transaction_id}).fetchone()

        if not row:
            return

        existing_score = int(row.risk_score or 0)
        combined_score = max(existing_score, ml_score)
        new_suspicious = row.is_suspicious or is_anomaly

        # Mettre à jour seulement si le score ML apporte une information
        if ml_score > 0:
            conn.execute(text("""
                UPDATE transactions SET
                    risk_score   = :score,
                    is_suspicious = :suspicious,
                    flag_reason  = CASE
                        WHEN flag_reason IS NULL THEN :explanation
                        ELSE flag_reason || ' | ML: ' || :explanation
                    END
                WHERE transaction_id = :tx_id
            """), {
                "score":       combined_score,
                "suspicious":  new_suspicious,
                "explanation": explanation[:500],
                "tx_id":       transaction_id,
            })
            conn.commit()
