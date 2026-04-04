from __future__ import annotations


class MetadataOnlyBackendError(RuntimeError):
    pass


class R2Storage:
    def __init__(self) -> None:
        raise MetadataOnlyBackendError(
            "Storage service is disabled: ClarityRay backend is metadata-only."
        )


def get_storage() -> R2Storage:
    raise MetadataOnlyBackendError(
        "Storage service is disabled: ClarityRay backend is metadata-only."
    )
