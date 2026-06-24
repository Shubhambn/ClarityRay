from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, HttpUrl

from api.main import (
    _build_model_summary,
    _get_local_manifest,
    _get_local_models,
    _get_models_from_db,
    _supabase_is_configured,
    _supabase_request,
    limiter,
    verify_api_key,
)

router = APIRouter(prefix="/models", tags=["models"])


class RegisterModelRequest(BaseModel):
    slug: str
    name: str
    version: str
    clarity_url: HttpUrl
    model_url: HttpUrl
    spec: dict[str, Any]


def _build_validation_payload(model: dict[str, Any]) -> dict[str, Any]:
    version = model.get("current_version") or {}
    checks = [
        {
            "name": "model_published",
            "passed": model.get("status") == "published",
            "message": "Model has published status",
        },
        {
            "name": "model_url_present",
            "passed": bool(version.get("onnx_url")),
            "message": "Model binary URL (onnx_url) is present",
        },
        {
            "name": "clarity_url_present",
            "passed": bool(version.get("clarity_url")),
            "message": "Model specification URL (clarity_url) is present",
        },
        {
            "name": "version_tagged",
            "passed": bool(version.get("version")),
            "message": "Model version string is set",
        },
    ]
    return {
        "passed": all(c["passed"] for c in checks),
        "ran_at": model.get("published_at"),
        "checks": checks,
    }


async def _get_model_detail_from_db(slug: str) -> dict[str, Any] | None:
    if not _supabase_is_configured():
        return None

    _, _, model_rows = await _supabase_request(
        method="GET",
        table="models",
        query={
            "select": "id,slug,name,bodypart,modality,task,validation_status,safety_tier,status,created_at",
            "slug": f"eq.{slug}",
            "status": "eq.published",
            "limit": "1",
        },
    )
    if not model_rows:
        return None

    model_row = model_rows[0]
    _, _, version_rows = await _supabase_request(
        method="GET",
        table="model_versions",
        query={
            "select": "id,model_id,version,clarity_url,model_url,created_at",
            "model_id": f"eq.{model_row['id']}",
            "order": "created_at.desc",
            "limit": "1",
        },
    )

    version = version_rows[0] if version_rows else None
    base = _build_model_summary(model_row, version)
    base["current_version"]["is_current"] = True
    base["validation"] = _build_validation_payload(base)
    return base


def _get_local_model_detail(slug: str) -> dict[str, Any] | None:
    manifest = _get_local_manifest()
    if not manifest or slug not in manifest.get("models", {}):
        return None

    entry = manifest["models"][slug]
    spec_path = Path(__file__).parent.parent.parent / "public" / "models" / slug / "clarity.json"
    if not spec_path.exists():
        return None

    with open(spec_path, "r", encoding="utf-8") as f:
        spec = json.load(f)

    base = {
        "id": spec["id"],
        "slug": slug,
        "name": spec["name"],
        "bodypart": spec.get("bodypart"),
        "modality": spec.get("modality"),
        "task": spec.get("output", {}).get("task") or "binary",
        "validation_status": spec.get("thresholds", {}).get("validation_status") or "unvalidated",
        "safety_tier": spec.get("safety", {}).get("tier") or "screening",
        "status": "published",
        "published_at": None,
        "current_version": {
            "id": None,
            "version": spec.get("version", "1.0.0"),
            "onnx_url": entry.get("url"),
            "clarity_url": entry.get("spec_url"),
            "file_size_mb": None,
        }
    }
    base["current_version"]["is_current"] = True
    base["validation"] = _build_validation_payload(base)
    return base


async def _get_model_detail(slug: str) -> dict[str, Any] | None:
    try:
        detail = await _get_model_detail_from_db(slug)
        if detail is not None:
            return detail
    except Exception as exc:  # noqa: BLE001
        import logging
        logger = logging.getLogger("clarityray.api")
        logger.warning("Database unavailable, falling back to local model detail for %s: %s", slug, exc)
    return _get_local_model_detail(slug)


@router.get("")
@limiter.limit("100/minute")
async def get_models(
    request: Request,
    bodypart: str | None = None,
    modality: str | None = None,
    task: str | None = None,
    validation_status: str | None = None,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=50),
) -> dict[str, Any]:
    try:
        return await _get_models_from_db(
            bodypart=bodypart,
            modality=modality,
            task=task,
            validation_status=validation_status,
            page=page,
            limit=limit,
        )
    except Exception as exc:  # noqa: BLE001
        import logging
        logger = logging.getLogger("clarityray.api")
        logger.warning("Database unavailable, falling back to local models list: %s", exc)
        return _get_local_models(
            bodypart=bodypart,
            modality=modality,
            task=task,
            validation_status=validation_status,
            page=page,
            limit=limit,
        )


@router.get("/{slug}")
@limiter.limit("100/minute")
async def get_model_by_slug(request: Request, slug: str) -> dict[str, Any]:
    detail = await _get_model_detail(slug)
    if not detail:
        return JSONResponse(status_code=404, content={"error": "Model not found", "slug": slug})
    return detail


@router.get("/{slug}/status")
@limiter.limit("100/minute")
async def get_model_status(request: Request, slug: str) -> dict[str, Any]:
    detail = await _get_model_detail(slug)
    if not detail:
        return JSONResponse(status_code=404, content={"error": "Model not found", "slug": slug})

    return {
        "slug": slug,
        "status": detail["status"],
        "validation_passed": detail["validation"]["passed"],
    }


@router.post("/register", dependencies=[Depends(verify_api_key)])
@limiter.limit("10/minute")
async def register_model(
    request: Request,
    payload: RegisterModelRequest,
    response: Response,
) -> dict[str, Any]:
    if not _supabase_is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": "database unavailable"},
        )

    bodypart = payload.spec.get("bodypart")
    modality = payload.spec.get("modality")
    # Output contract + integrity status, declared by the author in clarity.json.
    # Defaults keep older/binary specs valid and never imply validation.
    spec_output = payload.spec.get("output") or {}
    spec_thresholds = payload.spec.get("thresholds") or {}
    spec_safety = payload.spec.get("safety") or {}
    task = spec_output.get("task") or "binary"
    validation_status = spec_thresholds.get("validation_status") or "unvalidated"
    safety_tier = spec_safety.get("tier") or "screening"

    try:
        _, _, existing_rows = await _supabase_request(
            method="GET",
            table="models",
            query={"select": "id,slug", "slug": f"eq.{payload.slug}", "limit": "1"},
        )

        is_new = not bool(existing_rows)
        if is_new:
            _, _, inserted_rows = await _supabase_request(
                method="POST",
                table="models",
                payload=[
                    {
                        "slug": payload.slug,
                        "name": payload.name,
                        "status": "draft",
                        "bodypart": bodypart,
                        "modality": modality,
                        "task": task,
                        "validation_status": validation_status,
                        "safety_tier": safety_tier,
                    }
                ],
                prefer="return=representation",
            )
            model_id = inserted_rows[0]["id"]
        else:
            model_id = existing_rows[0]["id"]
            await _supabase_request(
                method="PATCH",
                table="models",
                query={"id": f"eq.{model_id}"},
                payload={
                    "name": payload.name,
                    "bodypart": bodypart,
                    "modality": modality,
                    "task": task,
                    "validation_status": validation_status,
                    "safety_tier": safety_tier,
                },
                prefer="return=minimal",
            )

        await _supabase_request(
            method="POST",
            table="model_versions",
            query={"on_conflict": "model_id,version"},
            payload=[
                {
                    "model_id": model_id,
                    "version": payload.version,
                    "clarity_url": str(payload.clarity_url),
                    "model_url": str(payload.model_url),
                }
            ],
            prefer="resolution=merge-duplicates,return=representation",
        )

        response.status_code = status.HTTP_201_CREATED if is_new else status.HTTP_200_OK
        return {
            "model_id": model_id,
            "slug": payload.slug,
            "status": "pending",
            "message": "Model registered" if is_new else "Model updated",
        }
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "Failed to register model", "reason": str(exc)},
        ) from exc