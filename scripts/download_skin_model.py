#!/usr/bin/env python3
"""Download HAM10000 skin lesion classifier from HuggingFace and export to ONNX.

Model : marmal88/skin_cancer — EfficientNet trained on HAM10000 (ISIC 2018 Task 3)
Task  : 7-class multiclass dermoscopy classification
Bench : ~83 % balanced accuracy on ISIC 2018 Task 3 test split

HAM10000 classes
  nv    → Melanocytic nevi         (benign)
  mel   → Melanoma                  (malignant)   ← SUSPICIOUS
  bkl   → Benign keratosis          (benign)
  bcc   → Basal cell carcinoma      (malignant)   ← SUSPICIOUS
  akiec → Actinic keratosis          (precancerous) ← SUSPICIOUS
  vasc  → Vascular lesion            (benign)
  df    → Dermatofibroma             (benign)

Output
  public/models/efficientnetb4-skin-ham10000/model.onnx   (overwrites placeholder)
  public/models/efficientnetb4-skin-ham10000/clarity.json (overwrites placeholder)

Prerequisites
  pip install transformers torch onnx onnxruntime numpy

Usage
  python scripts/download_skin_model.py
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

# Windows: force UTF-8 so progress bars don't crash on cp1252 consoles.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
    except (AttributeError, ValueError):
        pass

REPO_ROOT    = Path(__file__).resolve().parents[1]
OUT_DIR      = REPO_ROOT / "public" / "models" / "efficientnetb4-skin-ham10000"
ONNX_OPSET   = 17
HF_MODEL_ID  = "Anwarkh1/Skin_Cancer-Image_Classification"

# Canonical HAM10000 label metadata.
# Keys are lower-cased versions of every known id2label variant across public models.
_LABEL_META: dict[str, dict] = {
    # Short codes (ISIC standard)
    "nv":    {"name": "Melanocytic nevi",     "suspicious": False},
    "mel":   {"name": "Melanoma",              "suspicious": True},
    "bkl":   {"name": "Benign keratosis",      "suspicious": False},
    "bcc":   {"name": "Basal cell carcinoma",  "suspicious": True},
    "akiec": {"name": "Actinic keratosis",     "suspicious": True},
    "vasc":  {"name": "Vascular lesion",       "suspicious": False},
    "df":    {"name": "Dermatofibroma",        "suspicious": False},
    # Anwarkh1/Skin_Cancer-Image_Classification id2label keys
    "benign_keratosis-like_lesions": {"name": "Benign keratosis",      "suspicious": False},
    "basal_cell_carcinoma":          {"name": "Basal cell carcinoma",  "suspicious": True},
    "actinic_keratoses":             {"name": "Actinic keratosis",     "suspicious": True},
    "vascular_lesions":              {"name": "Vascular lesion",       "suspicious": False},
    "melanocytic_nevi":              {"name": "Melanocytic nevi",     "suspicious": False},
    "melanoma":                      {"name": "Melanoma",              "suspicious": True},
    "dermatofibroma":                {"name": "Dermatofibroma",        "suspicious": False},
}

SAFETY_DISCLAIMER = (
    "This is a screening support tool only. It does not diagnose cancer or any disease. "
    "Results require review by a qualified dermatologist. A possible finding does not "
    "confirm malignancy; a no-finding result does not rule out skin cancer."
)


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _resolve_class_info(id2label: dict[int, str]) -> list[dict]:
    """Map HuggingFace id2label → ordered list of {name, suspicious} dicts."""
    result = []
    for i in sorted(id2label.keys()):
        raw = id2label[i]
        key = raw.lower().strip()
        meta = _LABEL_META.get(key)
        if meta:
            result.append({"name": meta["name"], "suspicious": meta["suspicious"]})
        else:
            # Unknown label — keep as-is, non-suspicious by default.
            result.append({"name": raw, "suspicious": False})
    return result


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    onnx_path = OUT_DIR / "model.onnx"
    spec_path = OUT_DIR / "clarity.json"

    # ── 1. Dependency checks ──────────────────────────────────────────────────
    try:
        import torch
    except ImportError:
        print("ERROR: torch not installed.  pip install torch", file=sys.stderr)
        return 1
    try:
        from transformers import AutoModelForImageClassification, AutoImageProcessor
    except ImportError:
        print("ERROR: transformers not installed.  pip install transformers", file=sys.stderr)
        return 1
    try:
        import onnx
        import onnxruntime as ort
        import numpy as np
    except ImportError as exc:
        print(f"ERROR: {exc}  —  pip install onnx onnxruntime numpy", file=sys.stderr)
        return 1

    # ── 2. Download model from HuggingFace ────────────────────────────────────
    print(f"=== Downloading {HF_MODEL_ID} from HuggingFace Hub ===")
    print("    (first run downloads ~100 MB — subsequent runs use the cache)")
    try:
        hf_model   = AutoModelForImageClassification.from_pretrained(HF_MODEL_ID)
        processor  = AutoImageProcessor.from_pretrained(HF_MODEL_ID)
    except Exception as exc:
        print(f"ERROR: could not load model — {exc}", file=sys.stderr)
        print("  Check your internet connection or verify the model ID on HuggingFace.", file=sys.stderr)
        return 1
    hf_model.eval()
    print(f"  - architecture : {hf_model.__class__.__name__}")

    # ── 3. Extract preprocessing parameters from the image processor ──────────
    mean = list(getattr(processor, "image_mean", [0.485, 0.456, 0.406]))
    std  = list(getattr(processor, "image_std",  [0.229, 0.224, 0.225]))
    size_cfg = getattr(processor, "size", {"height": 224, "width": 224})
    # size_cfg may be a plain dict, a SizeDict, or an int depending on transformers version.
    try:
        size_dict = dict(size_cfg)  # works for dict, SizeDict, and mappings
        h = int(size_dict.get("height", size_dict.get("shortest_edge", 224)))
        w = int(size_dict.get("width",  size_dict.get("shortest_edge", 224)))
    except (TypeError, ValueError):
        h = w = int(size_cfg)  # scalar fallback
    input_shape = (1, 3, h, w)
    print(f"  - input shape  : {input_shape}")
    print(f"  - mean / std   : {mean} / {std}")

    # ── 4. Resolve class labels ────────────────────────────────────────────────
    id2label   = getattr(hf_model.config, "id2label", {})
    class_info = _resolve_class_info(id2label) if id2label else list(_LABEL_META.values())
    num_classes = len(class_info)
    print(f"  - classes ({num_classes}) : {[c['name'] for c in class_info]}")

    # ── 5. Wrap model: HF outputs SequenceClassifierOutput; we want raw logits ─
    class LogitsWrapper(torch.nn.Module):
        def __init__(self, model: torch.nn.Module) -> None:
            super().__init__()
            self.model = model

        def forward(self, pixel_values: "torch.Tensor") -> "torch.Tensor":
            return self.model(pixel_values=pixel_values).logits  # [N, C]

    wrapper = LogitsWrapper(hf_model).eval()

    # Sanity-check the wrapper before ONNX export.
    dummy = torch.zeros(*input_shape)
    with torch.no_grad():
        test_out = wrapper(dummy)
    if test_out.shape != torch.Size([1, num_classes]):
        print(f"ERROR: unexpected wrapper output shape {test_out.shape}", file=sys.stderr)
        return 1
    print(f"  - forward pass : OK (shape {tuple(test_out.shape)})")

    # ── 6. Export ONNX with static axes ───────────────────────────────────────
    print(f"  - exporting ONNX (opset {ONNX_OPSET}) ...")
    torch.onnx.export(
        wrapper,
        dummy,
        str(onnx_path),
        opset_version=ONNX_OPSET,
        input_names=["pixel_values"],
        output_names=["logits"],
        dynamic_axes=None,   # static [1,3,H,W] → [1,C]
        dynamo=False,        # legacy tracer; dynamo fails on some attention patterns
    )

    # ── 7. Structural ONNX check ──────────────────────────────────────────────
    onnx.checker.check_model(str(onnx_path))
    print("  - onnx.checker : passed")

    # ── 8. ORT smoke test ─────────────────────────────────────────────────────
    sess      = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    feed_name = sess.get_inputs()[0].name
    ort_out   = sess.run(None, {feed_name: dummy.numpy().astype(np.float32)})[0]
    expected  = (1, num_classes)
    if tuple(ort_out.shape) != expected:
        print(f"ERROR: ORT output shape {ort_out.shape}, expected {expected}", file=sys.stderr)
        return 1
    if not np.all(np.isfinite(ort_out)):
        print("ERROR: ORT output contains non-finite values", file=sys.stderr)
        return 1
    print(f"  - ORT smoke test : passed (shape {tuple(ort_out.shape)})")

    # ── 9. Compute SHA-256 and write clarity.json ──────────────────────────────
    sha = _sha256(onnx_path)
    spec: dict = {
        "id":        "efficientnetb4-skin-ham10000",
        "name":      "Skin Lesion Classifier — HAM10000 (EfficientNet)",
        "version":   "1.0.0",
        "certified": False,
        "bodypart":  "skin",
        "modality":  "dermoscopy",
        "model":     {"file": "model.onnx", "format": "onnx"},
        "integrity": {"sha256": sha},
        "input": {
            "shape":     list(input_shape),
            "layout":    "NCHW",
            "normalize": {"mean": mean, "std": std},
        },
        "output": {
            "task":       "multiclass",
            "shape":      [1, num_classes],
            "classes":    [c["name"] for c in class_info],
            "activation": "softmax",
            "labels":     [
                {"name": c["name"], "suspicious": c["suspicious"]}
                for c in class_info
            ],
        },
        "safety": {
            "tier":       "screening",
            "disclaimer": SAFETY_DISCLAIMER,
        },
        "thresholds": {
            "possible_finding":   0.5,
            "low_confidence":     0.25,
            "validation_status":  "unvalidated",
        },
        "explainability": {
            "enabled":      True,
            "method":       "occlusion_sensitivity",
            "isModelBased": True,
            "isGradCAM":    False,
            "disclaimer":   (
                "Heatmap generated by occlusion sensitivity. Estimates which image "
                "regions affected model confidence by masking patches and re-running inference."
            ),
        },
        "source_model": {
            "family":            hf_model.__class__.__name__,
            "source":            f"HuggingFace: {HF_MODEL_ID} — HAM10000 ISIC 2018 Task 3",
            "selected_findings": [c["name"] for c in class_info if c["suspicious"]],
        },
    }
    spec_path.write_text(json.dumps(spec, indent=2) + "\n", encoding="utf-8")

    size_mb = onnx_path.stat().st_size / (1024 * 1024)
    spec_rel = spec_path.relative_to(REPO_ROOT)
    print(f"\n✓  Done.")
    print(f"   ONNX  : {onnx_path.relative_to(REPO_ROOT)}  ({size_mb:.1f} MB)")
    print(f"   Spec  : {spec_rel}")
    print(f"   SHA256: {sha}")
    print()
    print("── Next steps ───────────────────────────────────────────────────────────")
    print()
    print("1. Register in Supabase (reads credentials from api/.env automatically):")
    print(f"     clarityray register {spec_rel}")
    print()
    print("   Or with explicit HuggingFace-hosted URLs after an HF upload:")
    print(f"     clarityray register {spec_rel} \\")
    print(f"       --model-url https://huggingface.co/YOUR_HF_REPO/resolve/main/{OUT_DIR.name}/model.onnx \\")
    print(f"       --clarity-url https://huggingface.co/YOUR_HF_REPO/resolve/main/{OUT_DIR.name}/clarity.json")
    print()
    print("2. Demo image — place any dermoscopy JPEG/PNG at:")
    print("     public/skin_lesion_demo.jpg")
    print("   Free samples: https://www.isic-archive.com/  (CC BY-NC 4.0)")
    print()
    print("3. Restart the dev server — the model will appear in the marketplace.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
