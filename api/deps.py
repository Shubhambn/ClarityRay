from __future__ import annotations

from functools import lru_cache

from psycopg import Connection
from psycopg_pool import ConnectionPool

from api.config import get_settings


@lru_cache(maxsize=1)
def get_db_pool() -> ConnectionPool:
    settings = get_settings()
    return ConnectionPool(conninfo=settings.database_url, min_size=1, max_size=10)


def get_db_connection() -> Connection:
    pool = get_db_pool()
    with pool.connection() as conn:
        yield conn
