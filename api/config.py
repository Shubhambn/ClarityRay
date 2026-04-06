from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache


@dataclass(frozen=True)
class Settings:
    env: str
    port: int
    database_url: str
    storage_type: str
    base_public_url: str
    nextjs_origin: str


def _get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings(
        env=os.getenv("ENV", "development"),
        port=int(os.getenv("PORT", "8000")),
        database_url=_get_required_env("DATABASE_URL"),
        storage_type=os.getenv("STORAGE_TYPE", "local"),
        base_public_url=os.getenv("BASE_PUBLIC_URL", "http://localhost:3000"),
        nextjs_origin=os.getenv("NEXTJS_ORIGIN", "http://localhost:3000"),
    )
