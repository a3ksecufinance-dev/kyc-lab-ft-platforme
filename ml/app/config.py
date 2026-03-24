from pydantic_settings import BaseSettings
from pathlib import Path

class Settings(BaseSettings):
    # App
    app_name: str = "KYC-AML ML Scoring Service"
    app_version: str = "1.0.0"
    debug: bool = False
    host: str = "0.0.0.0"
    port: int = 8000

    # Database (même DB que Node.js)
    database_url: str = "postgresql://kyc_user:kyc_password@postgres:5432/kyc_aml_db"

    # Auth interne (partagé avec Node.js)
    internal_api_key: str = "CHANGEME_internal_ml_key"

    # Modèles
    models_dir: Path = Path("/app/models")
    model_version: str = "v1"

    # Seuils de scoring
    anomaly_threshold: float = -0.1    # Isolation Forest : score < -0.1 = anomalie
    xgb_threshold: float = 0.6         # XGBoost : proba > 0.6 = suspect

    # Feature engineering
    rolling_window_hours: int = 24
    velocity_window_hours: int = 1

    class Config:
        env_file = ".env"
        env_prefix = "ML_"
        case_sensitive = False

settings = Settings()
