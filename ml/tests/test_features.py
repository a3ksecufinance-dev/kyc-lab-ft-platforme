"""Tests du feature engineering — vérifie les 20 features."""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
import numpy as np
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch, MagicMock

from app.features import (
    TransactionContext, extract_features, FEATURE_NAMES,
    TX_TYPE_ENC, CHANNEL_ENC, RISK_ENC, KYC_ENC, HIGH_RISK_COUNTRIES,
)


def make_ctx(**kwargs) -> TransactionContext:
    defaults = dict(
        transaction_id="TXN-TEST001",
        customer_id=1,
        amount=500.0,
        currency="EUR",
        transaction_type="TRANSFER",
        channel="ONLINE",
        counterparty_country=None,
        transaction_date=datetime(2024, 6, 1, 10, 0, 0),
        risk_score=10,
        risk_level="LOW",
        kyc_status="APPROVED",
        pep_status=False,
        sanction_status="CLEAR",
        monthly_income=5000.0,
    )
    defaults.update(kwargs)
    return TransactionContext(**defaults)


MOCK_AGG = {
    "tx_count_24h": 2,
    "tx_volume_24h": 1000.0,
    "tx_count_1h": 1,
    "tx_volume_1h": 500.0,
    "avg_amount_30d": 400.0,
    "amount_vs_avg_ratio": 1.25,
}


@pytest.mark.asyncio
async def test_feature_vector_length():
    """Le vecteur doit avoir exactement 20 features."""
    with patch("app.features._fetch_aggregates", new=AsyncMock(return_value=MOCK_AGG)):
        features = await extract_features(make_ctx())
    assert len(features) == 20
    assert len(FEATURE_NAMES) == 20


@pytest.mark.asyncio
async def test_amount_is_first_feature():
    with patch("app.features._fetch_aggregates", new=AsyncMock(return_value=MOCK_AGG)):
        features = await extract_features(make_ctx(amount=12500.0))
    assert features[0] == 12500.0


@pytest.mark.asyncio
async def test_transaction_type_encoding():
    """Chaque type de transaction doit avoir un encodage distinct."""
    for tx_type, expected_enc in TX_TYPE_ENC.items():
        with patch("app.features._fetch_aggregates", new=AsyncMock(return_value=MOCK_AGG)):
            features = await extract_features(make_ctx(transaction_type=tx_type))
        assert features[1] == expected_enc, f"{tx_type} → {features[1]} ≠ {expected_enc}"


@pytest.mark.asyncio
async def test_channel_encoding():
    for channel, expected_enc in CHANNEL_ENC.items():
        with patch("app.features._fetch_aggregates", new=AsyncMock(return_value=MOCK_AGG)):
            features = await extract_features(make_ctx(channel=channel))
        assert features[2] == expected_enc


@pytest.mark.asyncio
async def test_temporal_features():
    """hour_of_day et day_of_week doivent être corrects."""
    # Samedi 15 juin 2024 à 22h
    dt = datetime(2024, 6, 15, 22, 0, 0)  # samedi = weekday() = 5
    with patch("app.features._fetch_aggregates", new=AsyncMock(return_value=MOCK_AGG)):
        features = await extract_features(make_ctx(transaction_date=dt))
    assert features[3] == 22   # hour_of_day
    assert features[4] == 5    # day_of_week (lundi=0, samedi=5)
    assert features[5] == 1    # is_weekend


@pytest.mark.asyncio
async def test_weekday_not_weekend():
    dt = datetime(2024, 6, 10, 9, 0, 0)  # lundi
    with patch("app.features._fetch_aggregates", new=AsyncMock(return_value=MOCK_AGG)):
        features = await extract_features(make_ctx(transaction_date=dt))
    assert features[5] == 0    # is_weekend = 0


@pytest.mark.asyncio
async def test_pep_flag():
    with patch("app.features._fetch_aggregates", new=AsyncMock(return_value=MOCK_AGG)):
        f_pep     = await extract_features(make_ctx(pep_status=True))
        f_non_pep = await extract_features(make_ctx(pep_status=False))
    assert f_pep[9] == 1
    assert f_non_pep[9] == 0


@pytest.mark.asyncio
async def test_sanction_flag():
    with patch("app.features._fetch_aggregates", new=AsyncMock(return_value=MOCK_AGG)):
        f_match = await extract_features(make_ctx(sanction_status="MATCH"))
        f_clear = await extract_features(make_ctx(sanction_status="CLEAR"))
    assert f_match[10] == 1
    assert f_clear[10] == 0


@pytest.mark.asyncio
async def test_high_risk_country():
    for country in ["KP", "IR", "RU"]:
        with patch("app.features._fetch_aggregates", new=AsyncMock(return_value=MOCK_AGG)):
            features = await extract_features(make_ctx(counterparty_country=country))
        assert features[11] == 1, f"{country} devrait être à risque"


@pytest.mark.asyncio
async def test_safe_country():
    with patch("app.features._fetch_aggregates", new=AsyncMock(return_value=MOCK_AGG)):
        features = await extract_features(make_ctx(counterparty_country="FR"))
    assert features[11] == 0


@pytest.mark.asyncio
async def test_amount_to_income_ratio():
    """Ratio montant/revenu : 1000€ / 5000€ = 0.2."""
    with patch("app.features._fetch_aggregates", new=AsyncMock(return_value=MOCK_AGG)):
        features = await extract_features(make_ctx(amount=1000.0, monthly_income=5000.0))
    assert abs(features[8] - 0.2) < 0.001


@pytest.mark.asyncio
async def test_no_income_ratio():
    """Sans revenu déclaré, ratio = 0."""
    with patch("app.features._fetch_aggregates", new=AsyncMock(return_value=MOCK_AGG)):
        features = await extract_features(make_ctx(monthly_income=None))
    assert features[8] == 0.0


@pytest.mark.asyncio
async def test_aggregated_features_passed_through():
    """Les features agrégées doivent être celles retournées par _fetch_aggregates."""
    custom_agg = {
        "tx_count_24h": 15,
        "tx_volume_24h": 75000.0,
        "tx_count_1h": 8,
        "tx_volume_1h": 40000.0,
        "avg_amount_30d": 300.0,
        "amount_vs_avg_ratio": 16.67,
    }
    with patch("app.features._fetch_aggregates", new=AsyncMock(return_value=custom_agg)):
        features = await extract_features(make_ctx())
    assert features[14] == 15       # tx_count_24h
    assert features[15] == 75000.0  # tx_volume_24h
    assert features[16] == 8        # tx_count_1h
    assert features[17] == 40000.0  # tx_volume_1h
    assert features[18] == 300.0    # avg_amount_30d
    assert abs(features[19] - 16.67) < 0.01


@pytest.mark.asyncio
async def test_all_features_are_float():
    """Toutes les features doivent être des float64."""
    with patch("app.features._fetch_aggregates", new=AsyncMock(return_value=MOCK_AGG)):
        features = await extract_features(make_ctx())
    assert features.dtype == np.float64
    assert not np.any(np.isnan(features))
    assert not np.any(np.isinf(features))
