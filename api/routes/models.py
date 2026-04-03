from __future__ import annotations

import json
import re
import time
from pathlib import Path
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, UploadFile
from jsonschema import ValidationError, validate
from supabase import Client

from api.deps import get_supabase
from api.services.storage import get_storage
from api.services.validation import run_background_validation

router = APIRouter(prefix="/models", tags=["models"])

_CACHE_TTL_SECONDS = 300
_model_list_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}

SCHEMA_PATH = Path(__file__).resolve().parents[2] / "clarity-schema.json"
with SCHEMA_PATH.open("r", encoding="utf-8") as schema_file:
    CLARITY_SCHEMA = json.load(schema_file)


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "model"


def _get_cached_models(cache_key: str) -> list[dict[str, Any]] | None:
    cached = _model_list_cache.get(cache_key)
    if not cached:
        return None

    created_at, data = cached
    if time.time() - created_at > _CACHE_TTL_SECONDS:
        _model_list_cache.pop(cache_key, None)
        return None

    return data


def _set_cached_models(cache_key: str, data: list[dict[str, Any]]) -> None:
    _model_list_cache[cache_key] = (time.time(), data)


@router.get("")
def get_models(
    bodypart: str | None = Query(default=None),
    modality: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    supabase: Client = Depends(get_supabase),
) -> dict[str, Any]:
    cache_key = f"{bodypart}:{modality}:{page}:{limit}"
    cached = _get_cached_models(cache_key)
    if cached is not None:
        return {"items": cached, "page": page, "limit": limit, "cached": True}

    query = supabase.table("models").select("*").eq("status", "published")
    if bodypart:
        query = query.eq("bodypart", bodypart)
    if modality:
        query = query.eq("modality", modality)

    start_index = (page - 1) * limit
    end_index = start_index + limit - 1
    models_resp = query.range(start_index, end_index).execute()
    model_rows = models_resp.data or []

    if not model_rows:
        _set_cached_models(cache_key, [])
        return {"items": [], "page": page, "limit": limit, "cached": False}

    model_ids = [row["id"] for row in model_rows]
    versions_resp = (
        supabase.table("model_versions")
        .select("*")
        .in_("model_id", model_ids)
        .eq("is_current", True)
        .execute()
    )

    current_versions = {
        version["model_id"]: version
        for version in (versions_resp.data or [])
    }

    merged = []
    for model in model_rows:
        merged.append(
            {
                **model,
                "current_version": current_versions.get(model["id"]),
            }
        )

    _set_cached_models(cache_key, merged)
    return {"items": merged, "page": page, "limit": limit, "cached": False}


@router.get("/{slug}")
def get_model_by_slug(slug: str, supabase: Client = Depends(get_supabase)) -> dict[str, Any]:
    model_resp = (
        supabase.table("models")
        .select("*")
        .eq("slug", slug)
        .eq("status", "published")
        .limit(1)
        .execute()
    )

    model_rows = model_resp.data or []
    if not model_rows:
        raise HTTPException(status_code=404, detail="Published model not found")

    model = model_rows[0]
    version_resp = (
        supabase.table("model_versions")
        .select("*")
        .eq("model_id", model["id"])
        .eq("is_current", True)
        .limit(1)
        .execute()
    )
    version_rows = version_resp.data or []
    if not version_rows:
        raise HTTPException(status_code=404, detail="Current version not found")

    current_version = version_rows[0]
    storage = get_storage()

    return {
        "model": model,
        "current_version": {
            **current_version,
            "onnx_url": storage.generate_signed_get_url(current_version["onnx_key"], 3600),
            "clarity_url": storage.generate_signed_get_url(current_version["spec_key"], 3600),
        },
    }


@router.post("/submit")
async def submit_model(
    background_tasks: BackgroundTasks,
    model_file: UploadFile = File(...),
    spec_file: UploadFile = File(...),
    report_file: UploadFile = File(...),
    supabase: Client = Depends(get_supabase),
) -> dict[str, Any]:
    if not model_file.filename or not model_file.filename.lower().endswith(".onnx"):
        raise HTTPException(status_code=400, detail="model_file must be an .onnx file")

    spec_bytes = await spec_file.read()
    try:
        spec_payload = json.loads(spec_bytes.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=400, detail="spec_file must be valid JSON") from exc

    try:
        validate(instance=spec_payload, schema=CLARITY_SCHEMA)
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid clarity spec: {exc.message}") from exc

    report_bytes = await report_file.read()
    try:
        json.loads(report_bytes.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=400, detail="report_file must be valid JSON") from exc

    slug_source = str(spec_payload.get("id") or spec_payload.get("name") or "model")
    slug = _slugify(slug_source)
    version = str(spec_payload["version"])

    model_bytes = await model_file.read()
    if not model_bytes:
        raise HTTPException(status_code=400, detail="model_file is empty")

    storage = get_storage()
    onnx_key = f"models/{slug}/{version}/model.onnx"
    spec_key = f"models/{slug}/{version}/clarity.json"

    storage.upload_bytes(onnx_key, model_bytes, "application/octet-stream")
    storage.upload_bytes(spec_key, spec_bytes, "application/json")

    existing_resp = supabase.table("models").select("id").eq("slug", slug).limit(1).execute()
    existing_rows = existing_resp.data or []

    if existing_rows:
        model_id = existing_rows[0]["id"]
        (
            supabase.table("models")
            .update(
                {
                    "name": str(spec_payload["name"]),
                    "bodypart": str(spec_payload["bodypart"]),
                    "modality": str(spec_payload["modality"]),
                    "status": "pending",
                }
            )
            .eq("id", model_id)
            .execute()
        )
        supabase.table("model_versions").update({"is_current": False}).eq("model_id", model_id).execute()
    else:
        created_model_resp = (
            supabase.table("models")
            .insert(
                {
                    "slug": slug,
                    "name": str(spec_payload["name"]),
                    "bodypart": str(spec_payload["bodypart"]),
                    "modality": str(spec_payload["modality"]),
                    "status": "pending",
                }
            )
            .execute()
        )
        created_models = created_model_resp.data or []
        if not created_models:
            raise HTTPException(status_code=500, detail="Failed to create model record")
        model_id = created_models[0]["id"]

    version_resp = (
        supabase.table("model_versions")
        .insert(
            {
                "model_id": model_id,
                "version": version,
                "onnx_key": onnx_key,
                "spec_key": spec_key,
                "file_size_mb": round(len(model_bytes) / (1024 * 1024), 4),
                "is_current": True,
            }
        )
        .execute()
    )
    created_versions = version_resp.data or []
    if not created_versions:
        raise HTTPException(status_code=500, detail="Failed to create model version record")

    model_version_id = created_versions[0]["id"]
    background_tasks.add_task(run_background_validation, model_version_id, model_id, onnx_key)

    return {"model_id": model_id, "slug": slug, "status": "pending"}


@router.get("/{slug}/status")
def get_model_status(slug: str, supabase: Client = Depends(get_supabase)) -> dict[str, Any]:
    model_resp = supabase.table("models").select("id, slug, status").eq("slug", slug).limit(1).execute()
    model_rows = model_resp.data or []
    if not model_rows:
        raise HTTPException(status_code=404, detail="Model not found")

    model = model_rows[0]

    version_resp = (
        supabase.table("model_versions")
        .select("id")
        .eq("model_id", model["id"])
        .eq("is_current", True)
        .limit(1)
        .execute()
    )
    version_rows = version_resp.data or []

    latest_checks: dict[str, Any] | None = None
    latest_passed: bool | None = None

    if version_rows:
        model_version_id = version_rows[0]["id"]
        run_resp = (
            supabase.table("validation_runs")
            .select("passed, checks, ran_at")
            .eq("model_version_id", model_version_id)
            .order("ran_at", desc=True)
            .limit(1)
            .execute()
        )
        run_rows = run_resp.data or []
        if run_rows:
            latest_passed = bool(run_rows[0]["passed"])
            latest_checks = run_rows[0]["checks"]

    return {
        "slug": model["slug"],
        "status": model["status"],
        "validation_passed": latest_passed,
        "validation_checks": latest_checks,
    }
