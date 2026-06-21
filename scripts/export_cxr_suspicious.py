#!/usr/bin/env python3
"""Generic exporter for ClarityRay "suspicious finding" screening demos.

This is Phase 1 of docs/DENSENET121_CXR_IMPLEMENTATION_PLAN.md, generalized so it
is NOT tied to a single architecture. A small registry (``MODEL_REGISTRY``)
describes each model; the export pipeline (load -> wrap -> ONNX -> verify ->
sha256 -> clarity.json) is shared. Adding a new model family is a few lines in
the registry, no new code.

What every registered model produces:
  - A ``[N, 2]`` binary output: index 0 = "no suspicious finding",
    index 1 = "possible suspicious finding".
  - A schema-valid ``clarity.json`` next to ``model.onnx`` under
    ``public/models/<slug>/``.

The wrapper turns a multi-label pathology model into the binary contract the
ClarityRay runtime expects:
    suspicious_logit = max(selected pathology logits)
    no_finding_logit = 0
    out = stack([no_finding_logit, suspicious_logit])   # [N, 2]
Softmax over ``[0, suspicious_logit]`` keeps the runtime's binary/softmax
contract intact, so no postprocess special-casing is needed.

Usage:
    python scripts/export_cxr_suspicious.py                 # export default model
    python scripts/export_cxr_suspicious.py --list          # list registry keys
    python scripts/export_cxr_suspicious.py --model resnet50-res512-cxr-suspicious
    python scripts/export_cxr_suspicious.py --all           # export every registered model
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

# Windows consoles default to cp1252, but torchxrayvision's weight-download
# progress bar prints U+2588 block characters. On cp1252 that raises
# UnicodeEncodeError and aborts the export mid-download. Force UTF-8 (with a safe
# fallback) so the exporter runs cleanly cross-platform.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
    except (AttributeError, ValueError):
        pass

# --------------------------------------------------------------------------- #
# Paths
# --------------------------------------------------------------------------- #
REPO_ROOT = Path(__file__).resolve().parents[1]
MODELS_ROOT = REPO_ROOT / "public" / "models"
SCHEMA_PATH = REPO_ROOT / "clarity-schema.json"

# Shared wording. Keep this non-diagnostic: no "cancer", "diagnosis", "tumor".
DEFAULT_CLASSES = ["No suspicious chest finding", "Possible suspicious chest finding"]
DEFAULT_DISCLAIMER = (
    "This tool is for screening support only. It does not diagnose cancer or any "
    "disease. A possible finding requires clinician review. A no finding result "
    "does not rule out disease."
)
ONNX_OPSET = 17


# --------------------------------------------------------------------------- #
# Registry: each entry describes one exportable model. Adding a model = adding
# one ModelDef. The pipeline below is fully generic over these fields.
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class ModelDef:
    """Declarative description of a single suspicious-finding screening model."""

    key: str  # registry key / CLI selector
    slug: str  # output directory under public/models/<slug>/
    name: str  # human-readable display name
    # Loader returns (torch.nn.Module, list[str] pathology labels).
    loader: Callable[[], tuple[Any, list[str]]]
    suspicious_findings: list[str]  # pathology labels to treat as "suspicious"
    channels: int = 1  # 1 = grayscale, 3 = RGB
    input_size: int = 224  # square H == W
    mean: list[float] = field(default_factory=lambda: [0.5])
    std: list[float] = field(default_factory=lambda: [0.5])
    bodypart: str = "chest"
    modality: str = "xray"
    version: str = "1.0.0"
    safety_tier: str = "screening"  # screening | research | investigational
    disclaimer: str = DEFAULT_DISCLAIMER
    family: str = ""  # base architecture family, e.g. "DenseNet121"
    source_description: str = ""  # upstream checkpoint description for provenance

    @property
    def input_shape(self) -> tuple[int, int, int, int]:
        return (1, self.channels, self.input_size, self.input_size)


# --- Loaders ---------------------------------------------------------------- #
def _load_torchxrayvision(xrv_name: str) -> Callable[[], tuple[Any, list[str]]]:
    """Build a loader for a named TorchXRayVision checkpoint."""

    def _loader() -> tuple[Any, list[str]]:
        import torchxrayvision as xrv  # type: ignore[import-not-found]

        try:
            model = xrv.models.get_model(xrv_name, from_hf_hub=True)
        except TypeError:
            # Older torchxrayvision lacks the from_hf_hub kwarg. Fall back to the
            # generic dispatcher (NOT DenseNet directly) so the weights name is
            # routed to the correct architecture, e.g. ResNet for resnet50-*.
            model = xrv.models.get_model(xrv_name)
        model.eval()
        pathologies = [str(p) for p in model.pathologies]
        return model, pathologies

    return _loader


# --- Registry --------------------------------------------------------------- #
# NOTE: these are real TorchXRayVision checkpoints. The pipeline only selects
# the pathologies that actually exist in the loaded checkpoint, so an entry that
# lists a label the weights lack still exports correctly (it just uses fewer).
MODEL_REGISTRY: dict[str, ModelDef] = {
    "densenet121-cxr-suspicious": ModelDef(
        key="densenet121-cxr-suspicious",
        slug="densenet121-cxr-suspicious",
        name="DenseNet121 CXR Suspicious Finding Demo",
        loader=_load_torchxrayvision("densenet121-res224-all"),
        suspicious_findings=["Mass", "Nodule", "Lung Opacity", "Lung Lesion", "Opacity"],
        channels=1,
        input_size=224,
        family="DenseNet121",
        source_description="TorchXRayVision densenet121-res224-all",
    ),
    "resnet50-cxr-suspicious": ModelDef(
        key="resnet50-cxr-suspicious",
        slug="resnet50-cxr-suspicious",
        name="ResNet50 CXR Suspicious Finding Demo",
        loader=_load_torchxrayvision("resnet50-res512-all"),
        suspicious_findings=["Mass", "Nodule", "Lung Opacity", "Lung Lesion", "Opacity"],
        channels=1,
        input_size=512,
        safety_tier="research",
        family="ResNet50",
        source_description="TorchXRayVision resnet50-res512-all",
    ),
}

DEFAULT_MODEL_KEY = "densenet121-cxr-suspicious"


# --------------------------------------------------------------------------- #
# Generic export pipeline
# --------------------------------------------------------------------------- #
def _build_wrapper(base: Any, pathologies: list[str], suspicious_findings: list[str]):
    """Wrap a multi-label pathology model into a binary [N, 2] model."""
    import torch  # type: ignore[import-not-found]

    idx = [i for i, p in enumerate(pathologies) if p in suspicious_findings]
    if not idx:
        raise SystemExit(
            "No suspicious pathologies available in this checkpoint.\n"
            f"  wanted: {suspicious_findings}\n"
            f"  available: {pathologies}"
        )
    matched = [pathologies[i] for i in idx]

    class SuspiciousWrapper(torch.nn.Module):
        def __init__(self, model: Any, indices: list[int]) -> None:
            super().__init__()
            self.model = model
            # register as a buffer so it travels with the graph / export
            self.register_buffer("indices", torch.tensor(indices, dtype=torch.long))

        def forward(self, x: "torch.Tensor") -> "torch.Tensor":
            logits = self.model(x)  # [N, P]
            selected = logits.index_select(1, self.indices)  # [N, k]
            suspicious = selected.max(dim=1).values  # [N]
            no_finding = torch.zeros_like(suspicious)  # [N]
            return torch.stack([no_finding, suspicious], dim=1)  # [N, 2]

    wrapper = SuspiciousWrapper(base, idx).eval()
    return wrapper, matched


def _compute_sha256(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def _build_spec(model_def: ModelDef, sha256: str, matched_findings: list[str]) -> dict[str, Any]:
    """Construct a schema-valid clarity.json dict for a model."""
    source_model: dict[str, Any] | None = None
    if model_def.family or model_def.source_description:
        source_model = {
            "family": model_def.family or model_def.name,
            "source": model_def.source_description or model_def.name,
            "selected_findings": matched_findings,
        }

    return {
        "id": model_def.slug,
        "name": model_def.name,
        "version": model_def.version,
        "certified": False,
        "bodypart": model_def.bodypart,
        "modality": model_def.modality,
        "model": {
            "file": f"/models/{model_def.slug}/model.onnx",
            "format": "onnx",
        },
        "integrity": {"sha256": sha256},
        "input": {
            "shape": list(model_def.input_shape),
            "layout": "NCHW",
            "normalize": {"mean": list(model_def.mean), "std": list(model_def.std)},
        },
        "output": {
            "shape": [1, 2],
            "classes": list(DEFAULT_CLASSES),
            "activation": "softmax",
        },
        "safety": {
            "tier": model_def.safety_tier,
            "disclaimer": model_def.disclaimer,
        },
        "thresholds": {
            "possible_finding": 0.5,
            "low_confidence": 0.25,
            "validation_status": "unvalidated",
        },
        **({"source_model": source_model} if source_model else {}),
    }


def _validate_spec_against_schema(spec: dict[str, Any]) -> None:
    """Validate the generated spec against clarity-schema.json (best effort)."""
    try:
        from jsonschema import Draft7Validator  # type: ignore[import-not-found]
    except ImportError:
        print("  ! jsonschema not installed; skipping schema validation.")
        return

    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    errors = sorted(Draft7Validator(schema).iter_errors(spec), key=lambda e: list(e.absolute_path))
    if errors:
        details = "\n".join(f"    - {'.'.join(str(p) for p in e.absolute_path) or '$'}: {e.message}" for e in errors)
        raise SystemExit(f"clarity.json failed schema validation:\n{details}")
    print("  - clarity.json passes clarity-schema.json")


def export_one(model_def: ModelDef) -> Path:
    """Run the full export pipeline for a single registered model."""
    import torch  # type: ignore[import-not-found]

    print(f"\n=== Exporting '{model_def.key}' ({model_def.name}) ===")
    out_dir = MODELS_ROOT / model_def.slug
    out_dir.mkdir(parents=True, exist_ok=True)
    onnx_path = out_dir / "model.onnx"
    spec_path = out_dir / "clarity.json"

    # 1) load base model + pathology labels
    print("  - loading base model ...")
    base, pathologies = model_def.loader()

    # 2) wrap multi-label -> binary [N, 2]
    wrapper, matched = _build_wrapper(base, pathologies, model_def.suspicious_findings)
    print(f"  - selected suspicious pathologies: {matched}")

    # 3) export ONNX with static axes (schema rejects dynamic dims)
    dummy = torch.zeros(*model_def.input_shape)
    print(f"  - exporting ONNX (opset {ONNX_OPSET}, input shape {model_def.input_shape}) ...")
    torch.onnx.export(
        wrapper,
        dummy,
        str(onnx_path),
        opset_version=ONNX_OPSET,
        input_names=["xray"],
        output_names=["logits"],
        dynamic_axes=None,  # static [1,C,H,W] / [1,2]
        # Use the legacy TorchScript exporter. torch>=2.9 defaults to the dynamo
        # exporter, which fails tracing torchxrayvision's data-dependent
        # warn_normalization branch (GuardOnDataDependentSymNode). The legacy
        # tracer bakes in the concrete branch and yields the static graph we want.
        dynamo=False,
    )

    # 4) structural check
    import onnx  # type: ignore[import-not-found]

    onnx.checker.check_model(str(onnx_path))
    print("  - onnx.checker passed")

    # 5) ORT smoke test — assert [1, 2] and finite
    import numpy as np  # type: ignore[import-not-found]
    import onnxruntime as ort  # type: ignore[import-not-found]

    sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    feed_name = sess.get_inputs()[0].name
    out = sess.run(None, {feed_name: dummy.numpy().astype(np.float32)})[0]
    if tuple(out.shape) != (1, 2):
        raise SystemExit(f"Unexpected ONNX output shape {out.shape}, expected (1, 2)")
    if not np.all(np.isfinite(out)):
        raise SystemExit("ONNX output contains non-finite values")
    print(f"  - ORT smoke test passed (output shape {tuple(out.shape)})")

    # 6) sha256 + spec
    sha = _compute_sha256(onnx_path)
    spec = _build_spec(model_def, sha, matched)
    _validate_spec_against_schema(spec)
    spec_path.write_text(json.dumps(spec, indent=2) + "\n", encoding="utf-8")

    print(f"  - sha256: {sha}")
    print(f"  - wrote {onnx_path.relative_to(REPO_ROOT)}")
    print(f"  - wrote {spec_path.relative_to(REPO_ROOT)}")
    return out_dir


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--model", default=DEFAULT_MODEL_KEY, help=f"registry key (default: {DEFAULT_MODEL_KEY})")
    parser.add_argument("--all", action="store_true", help="export every registered model")
    parser.add_argument("--list", action="store_true", help="list registered model keys and exit")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv if argv is not None else sys.argv[1:])

    if args.list:
        print("Registered models:")
        for key, md in MODEL_REGISTRY.items():
            default = " (default)" if key == DEFAULT_MODEL_KEY else ""
            print(f"  {key}{default}\n      {md.name} -> public/models/{md.slug}/")
        return 0

    if args.all:
        targets = list(MODEL_REGISTRY.values())
    else:
        if args.model not in MODEL_REGISTRY:
            print(f"Unknown model '{args.model}'. Use --list to see options.", file=sys.stderr)
            return 2
        targets = [MODEL_REGISTRY[args.model]]

    for md in targets:
        export_one(md)

    print(f"\nDone. Exported {len(targets)} model(s). Run: python scripts/test_onnx.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
