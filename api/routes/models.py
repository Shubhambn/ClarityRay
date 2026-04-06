from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Body
from psycopg import Connection
from psycopg.rows import dict_row
from pydantic import BaseModel, HttpUrl

from api.deps import get_db_connection

router = APIRouter(prefix="/models", tags=["models"])


# ─────────────────────────────────────────────
# RESPONSE MODEL
# ─────────────────────────────────────────────
class FlatModelResponse(BaseModel):
    slug: str
    name: str
    version: str
    clarity_url: HttpUrl
    model_url: HttpUrl


# ─────────────────────────────────────────────
# REQUEST MODEL (NEW ✅)
# ─────────────────────────────────────────────
class RegisterModelRequest(BaseModel):
    slug: str
    name: str
    version: str
    clarity_url: HttpUrl
    model_url: HttpUrl


# ─────────────────────────────────────────────
# GET /models
# ─────────────────────────────────────────────
@router.get("", response_model=list[FlatModelResponse])
def get_models(
    bodypart: str | None = Query(default=None),
    modality: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    conn: Connection = Depends(get_db_connection),
) -> list[FlatModelResponse]:
    offset = (page - 1) * limit

    query = """
        SELECT
            m.slug,
            m.name,
            mv.version,
            mv.clarity_url,
            mv.model_url
        FROM models m
        JOIN LATERAL (
            SELECT version, clarity_url, model_url
            FROM model_versions
            WHERE model_id = m.id
            ORDER BY created_at DESC
            LIMIT 1
        ) mv ON TRUE
        WHERE m.status = 'published'
          AND (%(bodypart)s::text IS NULL OR m.bodypart = %(bodypart)s::text)
          AND (%(modality)s::text IS NULL OR m.modality = %(modality)s::text)
        ORDER BY m.created_at DESC
        LIMIT %(limit)s OFFSET %(offset)s
    """

    params = {
        "bodypart": bodypart,
        "modality": modality,
        "limit": limit,
        "offset": offset,
    }

    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(query, params)
        rows = cur.fetchall()

    return [FlatModelResponse(**row) for row in rows]


# ─────────────────────────────────────────────
# GET /models/{slug}
# ─────────────────────────────────────────────
@router.get("/{slug}", response_model=FlatModelResponse)
def get_model_by_slug(
    slug: str,
    conn: Connection = Depends(get_db_connection),
) -> FlatModelResponse:
    query = """
        SELECT
            m.slug,
            m.name,
            mv.version,
            mv.clarity_url,
            mv.model_url
        FROM models m
        JOIN LATERAL (
            SELECT version, clarity_url, model_url
            FROM model_versions
            WHERE model_id = m.id
            ORDER BY created_at DESC
            LIMIT 1
        ) mv ON TRUE
        WHERE m.slug = %(slug)s
          AND m.status = 'published'
        LIMIT 1
    """

    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(query, {"slug": slug})
        row = cur.fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="Published model not found")

    return FlatModelResponse(**row)


# ─────────────────────────────────────────────
# POST /models/register  🔥 CRITICAL
# ─────────────────────────────────────────────
@router.post("/register")
def register_model(
    payload: RegisterModelRequest = Body(...),
    conn: Connection = Depends(get_db_connection),
):
    """
    Register model metadata from CLI
    """

    try:
        with conn.transaction():

            with conn.cursor() as cur:

                # Insert model (or ignore if exists)
                cur.execute("""
                    INSERT INTO models (slug, name, status)
                    VALUES (%s, %s, 'published')
                    ON CONFLICT (slug) DO NOTHING
                    RETURNING id
                """, (payload.slug, payload.name))

                result = cur.fetchone()

                if result:
                    model_id = result[0]
                else:
                    cur.execute(
                        "SELECT id FROM models WHERE slug = %s",
                        (payload.slug,)
                    )
                    model_id = cur.fetchone()[0]

                # Insert version
                cur.execute("""
                    INSERT INTO model_versions (model_id, version, clarity_url, model_url)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (model_id, version) DO NOTHING
                """, (
                    model_id,
                    payload.version,
                    str(payload.clarity_url),
                    str(payload.model_url),
                ))

        return {
            "model_id": str(model_id),
            "status": "registered",
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to register model: {str(e)}"
        )