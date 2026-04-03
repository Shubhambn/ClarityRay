from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache


@dataclass(frozen=True)
class Settings:
    supabase_url: str
    supabase_key: str
    r2_account_id: str
    r2_access_key_id: str
    r2_secret_access_key: str
    r2_bucket_name: str
    nextjs_origin: str


def _get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings(
        supabase_url=_get_required_env("SUPABASE_URL"),
        supabase_key=_get_required_env("SUPABASE_KEY"),
        r2_account_id=_get_required_env("R2_ACCOUNT_ID"),
        r2_access_key_id=_get_required_env("R2_ACCESS_KEY_ID"),
        r2_secret_access_key=_get_required_env("R2_SECRET_ACCESS_KEY"),
        r2_bucket_name=_get_required_env("R2_BUCKET_NAME"),
        nextjs_origin=os.getenv("NEXTJS_ORIGIN", "http://localhost:3000"),
    )
