from __future__ import annotations

from supabase import Client

from api.deps import get_supabase


class MetadataOnlyBackendError(RuntimeError):
    pass


def run_background_validation(*args: object, **kwargs: object) -> None:
    raise MetadataOnlyBackendError(
        "Inference/validation is disabled: ClarityRay backend is metadata-only."
    )
