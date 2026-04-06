from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from typing import Any
from urllib import error as urllib_error
from urllib import parse as urllib_parse
from urllib import request as urllib_request

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

logger = logging.getLogger("clarityray.api")

app = FastAPI(title="ClarityRay API", version="1.0.0")

SERVICE_NAME = "clarityray-platform"
DEFAULT_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
    "https://clarityray.vercel.app",
]


def _parse_allowed_origins() -> list[str]:
    configured = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000")
    configured_origins = [origin.strip() for origin in configured.split(",") if origin.strip()]
    ordered_unique = dict.fromkeys([*DEFAULT_ALLOWED_ORIGINS, *configured_origins])
    return list(ordered_unique)


def _get_supabase_credentials() -> tuple[str | None, str | None]:
    return os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY")


def _supabase_is_configured() -> bool:
    supabase_url, supabase_key = _get_supabase_credentials()
    return bool(supabase_url and supabase_key)


def _extract_total_count(headers: dict[str, str]) -> int:
    content_range = headers.get("content-range", "")
    if "/" not in content_range:
        return 0

    total_part = content_range.split("/")[-1].strip()
    try:
        return int(total_part)
    except ValueError:
        return 0


def _sync_supabase_request(
    *,
    method: str,
    table: str,
    query: dict[str, str] | None = None,
    payload: Any | None = None,
    prefer: str | None = None,
) -> tuple[int, dict[str, str], Any]:
    supabase_url, supabase_key = _get_supabase_credentials()
    if not supabase_url or not supabase_key:
        raise RuntimeError("Supabase credentials are not configured")

    base_url = f"{supabase_url.rstrip('/')}/rest/v1/{table}"
    if query:
        encoded_query = urllib_parse.urlencode(query, safe="(),.*")
        url = f"{base_url}?{encoded_query}"
    else:
        url = base_url

    headers: dict[str, str] = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer

    body: bytes | None = None
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")

    request = urllib_request.Request(url=url, data=body, headers=headers, method=method)

    try:
        with urllib_request.urlopen(request, timeout=10) as response:
            response_body = response.read().decode("utf-8")
            parsed_body: Any
            if response_body:
                parsed_body = json.loads(response_body)
            else:
                parsed_body = []
            response_headers = {k.lower(): v for k, v in response.headers.items()}
            return response.status, response_headers, parsed_body
    except urllib_error.HTTPError as exc:
        error_body = exc.read().decode("utf-8")
        raise RuntimeError(f"Supabase HTTP error {exc.code}: {error_body}") from exc
    except urllib_error.URLError as exc:
        raise RuntimeError(f"Supabase connection error: {exc.reason}") from exc


async def _supabase_request(
    *,
    method: str,
    table: str,
    query: dict[str, str] | None = None,
    payload: Any | None = None,
    prefer: str | None = None,
) -> tuple[int, dict[str, str], Any]:
    return await asyncio.to_thread(
        _sync_supabase_request,
        method=method,
        table=table,
        query=query,
        payload=payload,
        prefer=prefer,
    )


def _to_iso8601(timestamp: str | None) -> str | None:
    if not timestamp:
        return None

    dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _build_model_summary(model: dict[str, Any], version: dict[str, Any] | None) -> dict[str, Any]:
    return {
        "id": model["id"],
        "slug": model["slug"],
        "name": model["name"],
        "bodypart": model.get("bodypart"),
        "modality": model.get("modality"),
        "status": model.get("status", "published"),
        "published_at": _to_iso8601(model.get("created_at")),
        "current_version": {
            "id": version.get("id") if version else None,
            "version": version.get("version") if version else None,
            "onnx_url": version.get("model_url") if version else None,
            "clarity_url": version.get("clarity_url") if version else None,
            "file_size_mb": None,
        },
    }


async def _get_models_from_db(
    *,
    bodypart: str | None,
    modality: str | None,
    page: int,
    limit: int,
) -> dict[str, Any]:
    if not _supabase_is_configured():
        raise RuntimeError("Supabase environment variables are missing")

    offset = (page - 1) * limit
    query: dict[str, str] = {
        "select": "id,slug,name,bodypart,modality,status,created_at",
        "status": "eq.published",
        "order": "created_at.desc",
        "limit": str(limit),
        "offset": str(offset),
    }
    if bodypart:
        query["bodypart"] = f"eq.{bodypart}"
    if modality:
        query["modality"] = f"eq.{modality}"

    _, headers, models_data = await _supabase_request(
        method="GET",
        table="models",
        query=query,
        prefer="count=exact",
    )
    total = _extract_total_count(headers)

    if not models_data:
        return {
            "models": [],
            "total": total,
            "page": page,
            "limit": limit,
        }

    model_ids = [model["id"] for model in models_data]
    ids_expr = ",".join(model_ids)
    _, _, versions_data = await _supabase_request(
        method="GET",
        table="model_versions",
        query={
            "select": "id,model_id,version,clarity_url,model_url,created_at",
            "model_id": f"in.({ids_expr})",
            "order": "created_at.desc",
        },
    )

    latest_version_by_model: dict[str, dict[str, Any]] = {}
    for version in versions_data:
        model_id = version["model_id"]
        if model_id not in latest_version_by_model:
            latest_version_by_model[model_id] = version

    models = [
        _build_model_summary(model, latest_version_by_model.get(model["id"]))
        for model in models_data
    ]
    return {
        "models": models,
        "total": total,
        "page": page,
        "limit": limit,
    }


async def _count_published_models() -> int:
    if not _supabase_is_configured():
        raise RuntimeError("Supabase environment variables are missing")

    _, headers, _ = await _supabase_request(
        method="GET",
        table="models",
        query={
            "select": "id",
            "status": "eq.published",
            "limit": "1",
        },
        prefer="count=exact",
    )
    return _extract_total_count(headers)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_parse_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, Any]:
    try:
        models_count = await _count_published_models()
        return {
            "status": "ok",
            "service": SERVICE_NAME,
            "models_count": models_count,
        }
    except Exception as exc:  # noqa: BLE001
        logger.warning("Health check degraded due to database issue: %s", exc)
        return {
            "status": "degraded",
            "service": SERVICE_NAME,
            "error": "database unavailable",
        }


from api.routes.models import router as models_router

app.include_router(models_router)
