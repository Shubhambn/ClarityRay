#!/usr/bin/env python3
"""Generic ONNX smoke test for any exported ClarityRay model directory.

Phase 1 verification (docs/DENSENET121_CXR_IMPLEMENTATION_PLAN.md), generalized:
it is NOT specific to one model. For each target it reads the model's
``clarity.json``, feeds a zero tensor of the declared ``input.shape``, and
asserts the output's last dimension matches ``len(output.classes)`` and that all
values are finite. It also re-verifies the recorded sha256 if present.

Usage:
    python scripts/test_onnx.py                       # test every model dir
    python scripts/test_onnx.py densenet121-cxr-suspicious   # one slug
    python scripts/test_onnx.py --slug resnet50-cxr-suspicious
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
MODELS_ROOT = REPO_ROOT / "public" / "models"


def _sha256(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def _discover_model_dirs() -> list[Path]:
    return sorted(p.parent for p in MODELS_ROOT.glob("*/model.onnx"))


def test_one(model_dir: Path) -> bool:
    import numpy as np  # type: ignore[import-not-found]
    import onnxruntime as ort  # type: ignore[import-not-found]

    slug = model_dir.name
    onnx_path = model_dir / "model.onnx"
    spec_path = model_dir / "clarity.json"
    print(f"\n=== {slug} ===")

    if not onnx_path.exists():
        print(f"  FAIL: missing {onnx_path.name}")
        return False
    if not spec_path.exists():
        print(f"  FAIL: missing {spec_path.name}")
        return False

    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    input_shape = tuple(spec["input"]["shape"])
    classes = spec["output"]["classes"]
    expected_last = len(classes)

    # integrity check (if recorded)
    recorded = spec.get("integrity", {}).get("sha256")
    if recorded:
        actual = _sha256(onnx_path)
        if actual != recorded:
            print(f"  FAIL: sha256 mismatch\n    spec:  {recorded}\n    file:  {actual}")
            return False
        print("  - sha256 matches clarity.json")

    sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    feed_name = sess.get_inputs()[0].name
    zeros = np.zeros(input_shape, dtype=np.float32)
    out = sess.run(None, {feed_name: zeros})[0]

    ok = True
    if out.shape[-1] != expected_last:
        print(f"  FAIL: output last dim {out.shape[-1]} != {expected_last} classes")
        ok = False
    if not np.all(np.isfinite(out)):
        print("  FAIL: output contains non-finite values")
        ok = False

    if ok:
        print(f"  - input  {input_shape} (feed name '{feed_name}')")
        print(f"  - output {tuple(out.shape)} matches {expected_last} classes, all finite")
        print("  PASS")
    return ok


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("slug", nargs="?", help="model directory slug under public/models/")
    parser.add_argument("--slug", dest="slug_opt", help="alternative way to pass the slug")
    args = parser.parse_args(argv if argv is not None else sys.argv[1:])

    slug = args.slug or args.slug_opt
    if slug:
        dirs = [MODELS_ROOT / slug]
        if not (dirs[0] / "model.onnx").exists():
            print(f"No model.onnx under public/models/{slug}/", file=sys.stderr)
            return 2
    else:
        dirs = _discover_model_dirs()
        if not dirs:
            print("No exported models found under public/models/*/model.onnx", file=sys.stderr)
            return 2

    results = {d.name: test_one(d) for d in dirs}
    passed = sum(results.values())
    print(f"\n{passed}/{len(results)} model(s) passed.")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
