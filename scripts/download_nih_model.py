#!/usr/bin/env python3
"""Download DenseNet121 NIH ChestX-ray14 from TorchXRayVision and export to ONNX.

This is STEP 1 of onboarding a new model through the clarityray converter.
It downloads the NIH-only DenseNet121 checkpoint (14 pathology classes),
wraps it in a passthrough module so the native sigmoid probabilities pass
through unchanged, and exports a static ONNX graph.

The ONNX file is then packaged by the clarityray converter (Step 2).

Output:
    downloads/densenet121-nih/model.onnx   — static ONNX opset-17, input [1,1,224,224]
    downloads/densenet121-nih/classes.txt  — one class label per line

Usage:
    python scripts/download_nih_model.py

Then (Step 2 — converter):
    cd ClarityRay
    clarityray upload downloads/densenet121-nih/model.onnx \\
        --classes "Atelectasis,Consolidation,Infiltration,Pneumothorax,Edema,Emphysema,Fibrosis,Effusion,Pneumonia,Pleural_Thickening,Cardiomegaly,Nodule,Mass,Hernia" \\
        --bodypart chest --modality xray \\
        --task multilabel \\
        --output clarityray-package/densenet121-nih \\
        --no-upload
"""

from __future__ import annotations

import sys
from pathlib import Path

# Windows: force UTF-8 so progress bars with block characters don't crash.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
    except (AttributeError, ValueError):
        pass

REPO_ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = REPO_ROOT / "downloads" / "densenet121-nih"
ONNX_OPSET = 17
INPUT_SHAPE = (1, 1, 224, 224)  # NCHW, grayscale 224x224
# TorchXRayVision DenseNet weights are scaled for raw [0, 255] pixel input.
# The clarityray converter must use mean=[0], std=[0.00392156863] (= 1/255) so
# ClarityRay passes [0, 255] float values instead of [-1, 1] normalized values.
# Using mean=0.5, std=0.5 maps all pixels to ~zero, causing constant output.
XRV_WEIGHTS = "densenet121-res224-nih"


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    onnx_path = OUT_DIR / "model.onnx"
    classes_path = OUT_DIR / "classes.txt"

    print(f"=== Downloading {XRV_WEIGHTS} from TorchXRayVision ===")

    try:
        import torchxrayvision as xrv
    except ImportError:
        print("ERROR: torchxrayvision not installed. Run: pip install torchxrayvision", file=sys.stderr)
        return 1

    try:
        import torch
    except ImportError:
        print("ERROR: torch not installed. Run: pip install torch", file=sys.stderr)
        return 1

    try:
        import onnx
        import onnxruntime as ort
        import numpy as np
    except ImportError as exc:
        print(f"ERROR: missing package — {exc}. Run: pip install onnx onnxruntime numpy", file=sys.stderr)
        return 1

    # 1. Load base model
    print(f"  - loading {XRV_WEIGHTS} ...")
    try:
        try:
            base = xrv.models.get_model(XRV_WEIGHTS, from_hf_hub=True)
        except TypeError:
            base = xrv.models.get_model(XRV_WEIGHTS)
    except Exception as exc:
        print(f"ERROR: could not load model — {exc}", file=sys.stderr)
        return 1

    base.eval()
    all_pathologies = [str(p) for p in base.pathologies]

    # NIH-only checkpoints share the 18-slot TorchXRayVision output space but
    # leave unlearned slots as empty strings. Keep only the valid (non-empty) ones.
    valid_indices = [i for i, p in enumerate(all_pathologies) if p.strip()]
    pathologies = [all_pathologies[i] for i in valid_indices]
    print(f"  - {len(pathologies)} valid pathology classes (filtered from {len(all_pathologies)}): {pathologies}")

    # 2. Selection + passthrough wrapper.
    # TorchXRayVision already applies sigmoid, so model(x) is probabilities in [0,1].
    # We select only the valid output columns so the ONNX graph has shape [N, len(valid)].
    class SelectiveWrapper(torch.nn.Module):
        def __init__(self, model: torch.nn.Module, indices: list[int]) -> None:
            super().__init__()
            self.model = model
            self.register_buffer("indices", torch.tensor(indices, dtype=torch.long))

        def forward(self, x: torch.Tensor) -> torch.Tensor:
            out = self.model(x)  # [N, 18] — all slots, sigmoid already applied
            return out.index_select(1, self.indices)  # [N, len(valid)]

    wrapper = SelectiveWrapper(base, valid_indices).eval()

    # 3. Export ONNX with static axes
    dummy = torch.zeros(*INPUT_SHAPE)
    print(f"  - exporting ONNX (opset {ONNX_OPSET}, input {INPUT_SHAPE}) ...")
    torch.onnx.export(
        wrapper,
        dummy,
        str(onnx_path),
        opset_version=ONNX_OPSET,
        input_names=["xray"],
        output_names=["probs"],
        dynamic_axes=None,
        dynamo=False,
    )

    # 4. Structural check
    onnx.checker.check_model(str(onnx_path))
    print("  - onnx.checker passed")

    # 5. ORT smoke test — assert shape, finite values, and [0,1] range
    sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    feed_name = sess.get_inputs()[0].name
    out = sess.run(None, {feed_name: dummy.numpy().astype(np.float32)})[0]
    expected = (1, len(pathologies))  # len(valid_indices)
    if tuple(out.shape) != expected:
        print(f"ERROR: output shape {tuple(out.shape)}, expected {expected}", file=sys.stderr)
        return 1
    if not np.all(np.isfinite(out)):
        print("ERROR: output contains non-finite values", file=sys.stderr)
        return 1
    if not np.all((out >= 0.0) & (out <= 1.0)):
        print("ERROR: output is not in [0,1] — sigmoid may not be applied", file=sys.stderr)
        return 1
    print(f"  - ORT smoke test passed (output shape {tuple(out.shape)}, values in [0,1])")

    # 6. Write classes.txt
    classes_path.write_text("\n".join(pathologies) + "\n", encoding="utf-8")

    size_mb = onnx_path.stat().st_size / (1024 * 1024)
    print(f"\n✓ Done.")
    print(f"  ONNX : {onnx_path.relative_to(REPO_ROOT)}  ({size_mb:.1f} MB)")
    print(f"  Classes: {classes_path.relative_to(REPO_ROOT)}")
    print()
    print("Next — run the clarityray converter (Step 2):")
    print()
    classes_arg = ",".join(pathologies)
    print(f'  clarityray upload downloads/densenet121-nih/model.onnx \\')
    print(f'    --classes "{classes_arg}" \\')
    print(f'    --bodypart chest --modality xray \\')
    print(f'    --task multilabel \\')
    print(f'    --output clarityray-package/densenet121-nih \\')
    print(f'    --no-upload')
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
