"""
Feature engineering pour le scoring AML.

Features extraites de la transaction + contexte client :

  Catégorielles (encodées) :
    - transaction_type  : TRANSFER=0, DEPOSIT=1, WITHDRAWAL=2, PAYMENT=3, EXCHANGE=4
    - channel           : ONLINE=0, MOBILE=1, BRANCH=2, ATM=3, API=4
    - risk_level        : LOW=0, MEDIUM=1, HIGH=2, CRITICAL=3
    - kyc_status        : PENDING=0, IN_REVIEW=1, APPROVED=2, REJECTED=3, EXPIRED=4
    - counterparty_risk : 0 (pays normal) / 1 (pays FATF à risque)

  Numériques :
    - amount_eur        : montant normalisé en EUR
    - hour_of_day       : 0-23
    - day_of_week       : 0-6 (0=lundi)
    - is_weekend        : 0/1
    - customer_risk_score : 0-100
    - monthly_income    : revenu mensuel déclaré
    - amount_to_income_ratio : amount / monthly_income (0 si pas de revenu)
    - pep_status        : 0/1
    - sanction_flag     : 0/1

  Agrégées (calculées sur la DB) :
    - tx_count_24h      : nb transactions sur 24h
    - tx_volume_24h     : volume total sur 24h
    - tx_count_1h       : nb transactions sur 1h (vélocité)
    - tx_volume_1h      : volume sur 1h
    - avg_amount_30d    : montant moyen sur 30 jours
    - amount_vs_avg_ratio : amount / avg_amount_30d (0 si pas d'historique)
    - max_amount_30d    : montant max sur 30 jours
    - is_amount_max     : 1 si amount > max historique

Soit 20 features au total — suffisant pour Isolation Forest et XGBoost
sans overfitting sur un petit dataset.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional
import numpy as np
from sqlalchemy import text
from .database import get_db_engine


# ─── Pays à risque FATF ───────────────────────────────────────────────────────

HIGH_RISK_COUNTRIES = {
    "KP", "IR", "MM", "BY", "RU", "SY", "YE",
    "AF", "LY", "SO", "SS", "CF", "CD", "HT", "CU", "VE",
    "PK", "NG", "ZA",
}

# ─── Encodages catégoriels ────────────────────────────────────────────────────

TX_TYPE_ENC = {"TRANSFER": 0, "DEPOSIT": 1, "WITHDRAWAL": 2, "PAYMENT": 3, "EXCHANGE": 4}
CHANNEL_ENC = {"ONLINE": 0, "MOBILE": 1, "BRANCH": 2, "ATM": 3, "API": 4}
RISK_ENC    = {"LOW": 0, "MEDIUM": 1, "HIGH": 2, "CRITICAL": 3}
KYC_ENC     = {"PENDING": 0, "IN_REVIEW": 1, "APPROVED": 2, "REJECTED": 3, "EXPIRED": 4}

FEATURE_NAMES = [
    "amount_eur",
    "transaction_type",
    "channel",
    "hour_of_day",
    "day_of_week",
    "is_weekend",
    "customer_risk_score",
    "monthly_income",
    "amount_to_income_ratio",
    "pep_status",
    "sanction_flag",
    "counterparty_risk",
    "risk_level",
    "kyc_status",
    "tx_count_24h",
    "tx_volume_24h",
    "tx_count_1h",
    "tx_volume_1h",
    "avg_amount_30d",
    "amount_vs_avg_ratio",
]


@dataclass
class TransactionContext:
    """Contexte complet d'une transaction pour le feature engineering."""
    # Transaction
    transaction_id: str
    customer_id: int
    amount: float
    currency: str
    transaction_type: str
    channel: str
    counterparty_country: Optional[str]
    transaction_date: datetime

    # Customer
    risk_score: int
    risk_level: str
    kyc_status: str
    pep_status: bool
    sanction_status: str
    monthly_income: Optional[float]


async def extract_features(ctx: TransactionContext) -> np.ndarray:
    """
    Extrait le vecteur de 20 features pour une transaction.
    Les features agrégées sont calculées via une requête SQL optimisée.
    """
    # Features temporelles
    dt = ctx.transaction_date
    hour_of_day = dt.hour
    day_of_week = dt.weekday()
    is_weekend   = 1 if day_of_week >= 5 else 0

    # Features client
    monthly_income = ctx.monthly_income or 0.0
    amount_to_income = (ctx.amount / monthly_income) if monthly_income > 0 else 0.0
    pep_status    = 1 if ctx.pep_status else 0
    sanction_flag = 1 if ctx.sanction_status == "MATCH" else 0
    counterparty_risk = 1 if ctx.counterparty_country in HIGH_RISK_COUNTRIES else 0

    # Features catégorielles
    tx_type_enc  = TX_TYPE_ENC.get(ctx.transaction_type, 0)
    channel_enc  = CHANNEL_ENC.get(ctx.channel, 0)
    risk_enc     = RISK_ENC.get(ctx.risk_level, 0)
    kyc_enc      = KYC_ENC.get(ctx.kyc_status, 0)

    # Features agrégées (requête SQL)
    agg = await _fetch_aggregates(ctx.customer_id, ctx.transaction_date, ctx.amount)

    return np.array([
        ctx.amount,                           # amount_eur
        tx_type_enc,                          # transaction_type
        channel_enc,                          # channel
        hour_of_day,                          # hour_of_day
        day_of_week,                          # day_of_week
        is_weekend,                           # is_weekend
        ctx.risk_score,                       # customer_risk_score
        monthly_income,                       # monthly_income
        amount_to_income,                     # amount_to_income_ratio
        pep_status,                           # pep_status
        sanction_flag,                        # sanction_flag
        counterparty_risk,                    # counterparty_risk
        risk_enc,                             # risk_level
        kyc_enc,                              # kyc_status
        agg["tx_count_24h"],                  # tx_count_24h
        agg["tx_volume_24h"],                 # tx_volume_24h
        agg["tx_count_1h"],                   # tx_count_1h
        agg["tx_volume_1h"],                  # tx_volume_1h
        agg["avg_amount_30d"],                # avg_amount_30d
        agg["amount_vs_avg_ratio"],           # amount_vs_avg_ratio
    ], dtype=np.float64)


async def _fetch_aggregates(
    customer_id: int,
    tx_date: datetime,
    current_amount: float,
) -> dict:
    """Requête SQL pour les features agrégées — optimisée avec un seul aller-retour."""
    since_24h = tx_date - timedelta(hours=24)
    since_1h  = tx_date - timedelta(hours=1)
    since_30d = tx_date - timedelta(days=30)

    engine = get_db_engine()
    query = text("""
        SELECT
            COUNT(*) FILTER (WHERE transaction_date >= :since_24h)                AS tx_count_24h,
            COALESCE(SUM(amount) FILTER (WHERE transaction_date >= :since_24h), 0) AS tx_volume_24h,
            COUNT(*) FILTER (WHERE transaction_date >= :since_1h)                 AS tx_count_1h,
            COALESCE(SUM(amount) FILTER (WHERE transaction_date >= :since_1h), 0) AS tx_volume_1h,
            COALESCE(AVG(amount) FILTER (WHERE transaction_date >= :since_30d), 0) AS avg_amount_30d,
            COUNT(*) FILTER (WHERE transaction_date >= :since_30d)                AS count_30d
        FROM transactions
        WHERE customer_id = :customer_id
          AND status != 'PENDING'
    """)

    with engine.connect() as conn:
        row = conn.execute(query, {
            "customer_id": customer_id,
            "since_24h": since_24h,
            "since_1h":  since_1h,
            "since_30d": since_30d,
        }).fetchone()

    tx_count_24h  = int(row.tx_count_24h  or 0)
    tx_volume_24h = float(row.tx_volume_24h or 0)
    tx_count_1h   = int(row.tx_count_1h   or 0)
    tx_volume_1h  = float(row.tx_volume_1h  or 0)
    avg_amount_30d = float(row.avg_amount_30d or 0)
    amount_vs_avg  = (current_amount / avg_amount_30d) if avg_amount_30d > 0 else 0.0

    return {
        "tx_count_24h":       tx_count_24h,
        "tx_volume_24h":      tx_volume_24h,
        "tx_count_1h":        tx_count_1h,
        "tx_volume_1h":       tx_volume_1h,
        "avg_amount_30d":     avg_amount_30d,
        "amount_vs_avg_ratio": min(amount_vs_avg, 100.0),  # cap à 100x
    }
