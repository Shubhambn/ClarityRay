"""Upload helpers for converted artifacts."""

from pathlib import Path

import httpx

from .errors import UploadError


DEFAULT_SUBMIT_ENDPOINT = "https://clarityray.vercel.app/api/models/submit"


def upload_artifact(path: str, url: str, timeout_seconds: float = 30.0) -> int:
    file_path = Path(path)
    if not file_path.exists():
        raise UploadError(
            message=f"Cannot upload missing file '{path}'.",
            fix_hint="Run conversion first and confirm the output file exists.",
        )

    try:
        with file_path.open("rb") as fh:
            response = httpx.post(url, files={"file": (file_path.name, fh)}, timeout=timeout_seconds)
        response.raise_for_status()
        return response.status_code
    except httpx.HTTPError as exc:
        raise UploadError(
            message=f"Upload request failed: {exc}",
            fix_hint="Check the endpoint URL and network access, then retry.",
        ) from exc


def submit(
    package_dir: str,
    *,
    model_path: str | None = None,
    spec_path: str | None = None,
    endpoint: str = DEFAULT_SUBMIT_ENDPOINT,
    timeout_seconds: float = 30.0,
) -> str:
    """Submit a packaged model directory and return a model URL."""
    base = Path(package_dir)
    resolved_model = Path(model_path) if model_path is not None else base / "model.onnx"
    resolved_spec = Path(spec_path) if spec_path is not None else base / "clarity.json"

    if not resolved_model.exists():
        raise UploadError(
            message=f"Cannot submit package: missing model file '{resolved_model}'.",
            fix_hint="Generate package files first so model.onnx exists in the output directory.",
        )
    if not resolved_spec.exists():
        raise UploadError(
            message=f"Cannot submit package: missing spec file '{resolved_spec}'.",
            fix_hint="Generate package files first so clarity.json exists in the output directory.",
        )

    try:
        with resolved_model.open("rb") as model_fh, resolved_spec.open("rb") as spec_fh:
            response = httpx.post(
                endpoint,
                files={
                    "model": (resolved_model.name, model_fh, "application/octet-stream"),
                    "spec": (resolved_spec.name, spec_fh, "application/json"),
                },
                timeout=timeout_seconds,
            )
        response.raise_for_status()

        try:
            payload = response.json()
        except ValueError:
            payload = {}

        if isinstance(payload, dict) and isinstance(payload.get("url"), str) and payload["url"].strip():
            return payload["url"].strip()

        location = response.headers.get("location") or response.headers.get("Location")
        if location:
            return location

        return f"https://clarityray.vercel.app/models/{resolved_model.stem}-v1"
    except httpx.HTTPError as exc:
        raise UploadError(
            message=f"Submission failed: {exc}",
            fix_hint="Check your internet connection and try again with --no-upload for local packaging.",
        ) from exc
