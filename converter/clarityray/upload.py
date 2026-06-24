"""Upload helpers: HuggingFace Hub model hosting + Supabase registry."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import httpx

from .errors import UploadError


# ---------------------------------------------------------------------------
# HuggingFace Hub upload
# ---------------------------------------------------------------------------

def upload_to_hf(
    model_path: str,
    clarity_path: str,
    slug: str,
    *,
    repo_id: str,
    token: str,
    private: bool = False,
) -> dict[str, str]:
    """Upload model.onnx + clarity.json to a HuggingFace Hub model repo.

    Creates the repository if it does not exist. Returns a dict with keys
    'model_url', 'clarity_url', and 'repo_url'.
    """
    try:
        from huggingface_hub import HfApi  # type: ignore[import-not-found]
    except ImportError as exc:
        raise UploadError(
            message="huggingface_hub is not installed.",
            fix_hint="Run: pip install huggingface_hub>=0.20",
        ) from exc

    api = HfApi(token=token)

    try:
        api.create_repo(repo_id=repo_id, repo_type="model", exist_ok=True, private=private)
    except Exception as exc:
        raise UploadError(
            message=f"Could not create HuggingFace repository '{repo_id}': {exc}",
            fix_hint="Check your token has write access and the repo name is valid (owner/repo-name).",
        ) from exc

    model_hf_path = f"{slug}/model.onnx"
    clarity_hf_path = f"{slug}/clarity.json"

    try:
        api.upload_file(
            path_or_fileobj=model_path,
            path_in_repo=model_hf_path,
            repo_id=repo_id,
            repo_type="model",
            commit_message=f"Add {slug} model via ClarityRay converter",
        )
        api.upload_file(
            path_or_fileobj=clarity_path,
            path_in_repo=clarity_hf_path,
            repo_id=repo_id,
            repo_type="model",
            commit_message=f"Add {slug} clarity.json via ClarityRay converter",
        )
    except Exception as exc:
        raise UploadError(
            message=f"HuggingFace upload failed: {exc}",
            fix_hint="Check your token, network connection, and available storage quota.",
        ) from exc

    base = f"https://huggingface.co/{repo_id}/resolve/main"
    return {
        "model_url": f"{base}/{model_hf_path}",
        "clarity_url": f"{base}/{clarity_hf_path}",
        "repo_url": f"https://huggingface.co/{repo_id}",
    }


# ---------------------------------------------------------------------------
# Supabase registry
# ---------------------------------------------------------------------------

def register_in_supabase(
    spec: dict[str, Any],
    *,
    model_url: str,
    clarity_url: str,
    supabase_url: str,
    supabase_key: str,
    timeout_seconds: float = 30.0,
) -> str:
    """Upsert model + model_versions rows in Supabase. Returns the model UUID.

    Schema mirrors 001_create_models.sql (slug, name, description, modality,
    bodypart, status) + 005_model_task_validation.sql (task, validation_status,
    safety_tier) + model_versions (model_id, version, clarity_url, model_url).
    """
    # --- fields from 001_create_models.sql ---
    slug: str = spec.get("id", "unknown")
    name: str = spec.get("name", slug)
    description: str | None = spec.get("description")          # nullable in 001
    modality: str | None = spec.get("modality")
    bodypart: str | None = spec.get("bodypart")
    # status: always 'published' when registered via the converter
    status = "published"

    # --- fields from 005_model_task_validation.sql ---
    output = spec.get("output") or {}
    task: str = output.get("task") or "binary"
    thresholds = spec.get("thresholds") or {}
    validation_status: str = thresholds.get("validation_status") or "unvalidated"
    safety = spec.get("safety") or {}
    safety_tier: str = safety.get("tier") or "screening"

    # --- model_versions fields from 001_create_models.sql ---
    version: str = spec.get("version") or "1.0.0"
    # clarity_url and model_url come from the caller (HF URLs)

    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=representation",
    }
    base = supabase_url.rstrip("/") + "/rest/v1"

    try:
        # 1) Upsert models row — exact columns from 001 + 005 migrations
        models_payload: dict[str, Any] = {
            "slug": slug,
            "name": name,
            "modality": modality,
            "bodypart": bodypart,
            "status": status,
            # 005 additions
            "task": task,
            "validation_status": validation_status,
            "safety_tier": safety_tier,
        }
        if description is not None:
            models_payload["description"] = description

        resp = httpx.post(
            f"{base}/models?on_conflict=slug",
            headers=headers,
            json=[models_payload],
            timeout=timeout_seconds,
        )
        resp.raise_for_status()
        rows = resp.json()

        if not rows:
            # Proxy stripped response body — fall back to a lookup
            fetch = httpx.get(
                f"{base}/models",
                headers={**headers, "Prefer": ""},
                params={"slug": f"eq.{slug}", "select": "id,slug", "limit": "1"},
                timeout=timeout_seconds,
            )
            fetch.raise_for_status()
            rows = fetch.json()

        model_id: str = rows[0]["id"]

        # 2) Upsert model_versions row
        ver_resp = httpx.post(
            f"{base}/model_versions?on_conflict=model_id,version",
            headers={**headers, "Prefer": "resolution=merge-duplicates,return=minimal"},
            json=[{
                "model_id": model_id,
                "version": version,
                "clarity_url": clarity_url,
                "model_url": model_url,
            }],
            timeout=timeout_seconds,
        )
        ver_resp.raise_for_status()
        return model_id

    except httpx.HTTPStatusError as exc:
        detail = exc.response.text[:300]
        raise UploadError(
            message=f"Supabase registration failed ({exc.response.status_code}): {detail}",
            fix_hint=(
                "Ensure SUPABASE_KEY is a service_role key (not publishable) with insert/update rights, "
                "and that migration 005_model_task_validation.sql has been applied."
            ),
        ) from exc
    except httpx.RequestError as exc:
        raise UploadError(
            message=f"Supabase connection error: {exc}",
            fix_hint="Check SUPABASE_URL is correct and you have network access.",

        ) from exc
