from sqlalchemy import create_engine
from sqlalchemy.pool import QueuePool
from .config import settings
import functools

@functools.lru_cache(maxsize=1)
def get_db_engine():
    """Singleton — connexion PostgreSQL partagée."""
    return create_engine(
        settings.database_url,
        poolclass=QueuePool,
        pool_size=5,
        max_overflow=10,
        pool_pre_ping=True,
        connect_args={"connect_timeout": 5},
    )
