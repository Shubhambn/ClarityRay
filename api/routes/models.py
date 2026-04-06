from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query, Response, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, HttpUrl

from api.main import _build_model_summary, _get_models_from_db, _supabase_is_configured, _supabase_request

router = APIRouter(prefix="/models", tags=["models"])


class RegisterModelRequest(BaseModel):
    slug: str
    name: str
    version: str
    clarity_url: HttpUrl
    model_url: HttpUrl
    spec: dict[str, Any]


def _build_validation_payload(model: dict[str, Any]) -> dict[str, Any]:
    return {
        "passed": model.get("status") == "published",
        "ran_at": model.get("published_at"),
        "checks": [],
    }


async def _get_model_detail_from_db(slug: str) -> dict[str, Any] | None:
    if not _supabase_is_configured():
        return None

    _, _, model_rows = await _supabase_request(
        method="GET",
        table="models",
        query={
            "select": "id,slug,name,bodypart,modality,status,created_at",
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


async def _get_model_detail(slug: str) -> dict[str, Any] | None:
    return await _get_model_detail_from_db(slug)


@router.get("")
async def get_models(
    bodypart: str | None = None,
    modality: str | None = None,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=50),
) -> dict[str, Any]:
    try:
        return await _get_models_from_db(
            bodypart=bodypart,
            modality=modality,
            page=page,
            limit=limit,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": "database unavailable", "reason": str(exc)},
        ) from exc


@router.get("/{slug}")
async def get_model_by_slug(slug: str) -> dict[str, Any]:
    try:
        detail = await _get_model_detail(slug)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": "database unavailable", "reason": str(exc)},
        ) from exc

    if not detail:
        return JSONResponse(status_code=404, content={"error": "Model not found", "slug": slug})
    return detail


@router.get("/{slug}/status")
async def get_model_status(slug: str) -> dict[str, Any]:
    try:
        detail = await _get_model_detail(slug)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": "database unavailable", "reason": str(exc)},
        ) from exc

    if not detail:
        return JSONResponse(status_code=404, content={"error": "Model not found", "slug": slug})

    return {
        "slug": slug,
        "status": detail["status"],
        "validation_passed": detail["validation"]["passed"],
    }


@router.post("/register")
async def register_model(payload: RegisterModelRequest, response: Response) -> dict[str, Any]:
    if not _supabase_is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": "database unavailable"},
        )

    bodypart = payload.spec.get("bodypart")
    modality = payload.spec.get("modality")

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