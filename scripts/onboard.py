#!/usr/bin/env python3
"""ClarityRay model onboarding tool.

Three entry modes:

  1. Already-ONNX  (most common — use the /contribute UI to generate the config):
       python scripts/onboard.py --onnx ./model.onnx --config ./my-model-config.json

  2. TorchScript .pt file (saved with torch.jit.save):
       python scripts/onboard.py --pt ./model.pt --config ./my-model-config.json

  3. TorchXRayVision checkpoint (delegates to the registered export pipeline):
       python scripts/onboard.py --txrv densenet121-res224-all --slug my-slug [--view multilabel]

In all modes the script:
  - Validates the ONNX model (onnx.checker + ORT smoke test)
  - Computes sha256 and injects it into the spec
  - Writes public/models/<slug>/model.onnx + clarity.json

Pass --seed to also upsert the model into Supabase (calls seed_supabase.py).
Pass --dry-run to preview what would happen without writing any files.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
MODELS_ROOT = REPO_ROOT / "public" / "models"
SCRIPTS_ROOT = Path(__file__).resolve().parent

# Force UTF-8 output on Windows consoles
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
    except (AttributeError, ValueError):
        pass


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _ort_smoke_test(onnx_path: Path, input_shape: list[int]) -> tuple[int, ...]:
    try:
        import numpy as np
        import onnxruntime as ort
    except ImportError as e:
        print(f"  ! {e} — skipping ORT smoke test")
        return ()

    sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    feed = sess.get_inputs()[0].name
    dummy = np.zeros(input_shape, dtype=np.float32)
    out = sess.run(None, {feed: dummy})[0]

    import numpy as np  # noqa: F811 (already imported, but kept for clarity)

    if not np.all(np.isfinite(out)):
        raise SystemExit("ORT smoke test: output contains non-finite values")
    print(f"  ✓ ORT smoke test passed  output_shape={tuple(out.shape)}")
    return tuple(out.shape)


def _validate_and_write(
    onnx_src: Path,
    spec: dict[str, Any],
    out_dir: Path,
    *,
    dry_run: bool = False,
) -> None:
    """Validate ONNX, update spec with sha256, write files."""
    try:
        import onnx

        onnx.checker.check_model(str(onnx_src))
        print("  ✓ onnx.checker passed")
    except ImportError:
        print("  ! onnx package not installed — skipping structural check")

    _ort_smoke_test(onnx_src, spec["input"]["shape"])

    sha = _sha256(onnx_src)
    spec.setdefault("integrity", {})["sha256"] = sha
    spec.setdefault("model", {})["file"] = f"/models/{spec['id']}/model.onnx"
    spec["model"]["format"] = "onnx"
    print(f"  ✓ sha256: {sha[:16]}…")

    if dry_run:
        print(f"\n[dry-run] Would write to {out_dir}/")
        print(json.dumps(spec, indent=2))
        return

    out_dir.mkdir(parents=True, exist_ok=True)
    onnx_dest = out_dir / "model.onnx"
    if onnx_src.resolve() != onnx_dest.resolve():
        shutil.copy2(onnx_src, onnx_dest)
    spec_path = out_dir / "clarity.json"
    spec_path.write_text(json.dumps(spec, indent=2) + "\n", encoding="utf-8")
    print(f"  ✓ wrote {onnx_dest.relative_to(REPO_ROOT)}")
    print(f"  ✓ wrote {spec_path.relative_to(REPO_ROOT)}")


def _load_spec(config_arg: str | None, fallback_slug: str | None) -> dict[str, Any]:
    if not config_arg:
        raise SystemExit("--config is required for this mode")
    path = Path(config_arg).resolve()
    if not path.exists():
        raise SystemExit(f"Config not found: {path}")
    spec: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
    return spec


def _upload_hf(onnx_path: Path, repo_id: str, slug: str, token: str | None) -> str:
    """Upload model.onnx to a HuggingFace repo and return the public download URL."""
    try:
        from huggingface_hub import HfApi  # type: ignore[import-not-found]
    except ImportError:
        raise SystemExit(
            "huggingface_hub not installed.\n"
            "  pip install huggingface_hub\n"
            "Then authenticate:  huggingface-cli login"
        )

    api = HfApi(token=token or None)
    path_in_repo = f"{slug}/model.onnx"
    size_mb = onnx_path.stat().st_size / 1_048_576
    print(f"  → uploading {onnx_path.name} ({size_mb:.1f} MB) → {repo_id}/{path_in_repo} ...")
    api.upload_file(
        path_or_fileobj=str(onnx_path),
        path_in_repo=path_in_repo,
        repo_id=repo_id,
        repo_type="model",
    )
    url = f"https://huggingface.co/{repo_id}/resolve/main/{path_in_repo}"
    print(f"  ✓ HuggingFace URL: {url}")
    return url


def _seed(slug: str) -> None:
    seed_script = SCRIPTS_ROOT / "seed_supabase.py"
    print(f"\n  → Seeding '{slug}' to Supabase ...")
    result = subprocess.run(
        [sys.executable, str(seed_script), "--slug", slug],
        check=False,
    )
    if result.returncode != 0:
        print(f"  ✗ Seeding failed (exit {result.returncode}). Run manually:")
        print(f"    python scripts/seed_supabase.py --slug {slug}")
    else:
        print(f"  ✓ Seeded '{slug}'")


# ─── Entry-mode handlers ──────────────────────────────────────────────────────


def handle_onnx(args: argparse.Namespace) -> None:
    onnx_path = Path(args.onnx).resolve()
    if not onnx_path.exists():
        raise SystemExit(f"ONNX file not found: {onnx_path}")

    spec = _load_spec(args.config, onnx_path.stem)
    if args.slug:
        spec["id"] = args.slug
    slug = spec.get("id") or onnx_path.stem
    spec["id"] = slug

    print(f"\n=== Onboarding ONNX → '{slug}' ===")
    out_dir = MODELS_ROOT / slug
    _validate_and_write(onnx_path, spec, out_dir, dry_run=args.dry_run)

    if args.upload_hf and not args.dry_run:
        hf_url = _upload_hf(out_dir / "model.onnx", args.upload_hf, slug, args.hf_token)
        # Patch the local clarity.json with the HF URL
        spec_path = out_dir / "clarity.json"
        live_spec = json.loads(spec_path.read_text(encoding="utf-8"))
        live_spec.setdefault("model", {})["file"] = hf_url
        spec_path.write_text(json.dumps(live_spec, indent=2) + "\n", encoding="utf-8")
        print(f"  ✓ clarity.json updated with HuggingFace URL")

    if args.seed and not args.dry_run:
        _seed(slug)


def handle_pytorch(args: argparse.Namespace) -> None:
    pt_path = Path(args.pt).resolve()
    if not pt_path.exists():
        raise SystemExit(f"PyTorch file not found: {pt_path}")

    spec = _load_spec(args.config, pt_path.stem)
    if args.slug:
        spec["id"] = args.slug
    slug = spec.get("id") or pt_path.stem
    spec["id"] = slug

    print(f"\n=== Converting PyTorch → ONNX → '{slug}' ===")

    try:
        import torch  # type: ignore[import-not-found]
    except ImportError:
        raise SystemExit("torch is required for --pt mode: pip install torch")

    try:
        model = torch.jit.load(str(pt_path), map_location="cpu")
        print("  ✓ loaded TorchScript model")
    except Exception as exc:
        raise SystemExit(
            f"Could not load '{pt_path.name}' as TorchScript ({exc}).\n\n"
            "For a state-dict .pt, first export to TorchScript:\n"
            "  scripted = torch.jit.trace(model.eval(), dummy_input)\n"
            "  torch.jit.save(scripted, 'model.pt')\n"
            "Or export to ONNX yourself and use --onnx instead."
        )

    model.eval()
    input_shape: list[int] = spec["input"]["shape"]

    out_dir = MODELS_ROOT / slug
    out_dir.mkdir(parents=True, exist_ok=True)
    onnx_path = out_dir / "model.onnx"

    dummy = torch.zeros(*input_shape)
    print(f"  → exporting ONNX (opset 17, input {input_shape}) …")
    torch.onnx.export(
        model,
        dummy,
        str(onnx_path),
        opset_version=17,
        input_names=["input"],
        output_names=["output"],
        dynamo=False,
    )
    print("  ✓ ONNX exported")

    _validate_and_write(onnx_path, spec, out_dir, dry_run=args.dry_run)

    if args.upload_hf and not args.dry_run:
        hf_url = _upload_hf(out_dir / "model.onnx", args.upload_hf, slug, args.hf_token)
        spec_path = out_dir / "clarity.json"
        live_spec = json.loads(spec_path.read_text(encoding="utf-8"))
        live_spec.setdefault("model", {})["file"] = hf_url
        spec_path.write_text(json.dumps(live_spec, indent=2) + "\n", encoding="utf-8")
        print(f"  ✓ clarity.json updated with HuggingFace URL")

    if args.seed and not args.dry_run:
        _seed(slug)


def handle_txrv(args: argparse.Namespace) -> None:
    sys.path.insert(0, str(SCRIPTS_ROOT))
    try:
        from export_cxr_suspicious import MODEL_REGISTRY, export_one  # type: ignore[import-not-found]
    except ImportError as e:
        raise SystemExit(f"Could not import export_cxr_suspicious: {e}")

    key = args.txrv
    if key not in MODEL_REGISTRY:
        print(f"Unknown TorchXRayVision key '{key}'. Available:")
        for k, md in MODEL_REGISTRY.items():
            print(f"  {k}  →  {md.name}")
        raise SystemExit(1)

    model_def = MODEL_REGISTRY[key]
    view = args.view or "multilabel"
    out_dir = export_one(model_def, view=view)

    if args.slug:
        target = MODELS_ROOT / args.slug
        if target != out_dir and not args.dry_run:
            target.mkdir(parents=True, exist_ok=True)
            shutil.copytree(out_dir, target, dirs_exist_ok=True)
            print(f"  ✓ copied to public/models/{args.slug}/")
        slug = args.slug
    else:
        slug = out_dir.name

    if args.upload_hf and not args.dry_run:
        onnx_path = out_dir / "model.onnx"
        hf_url = _upload_hf(onnx_path, args.upload_hf, slug, args.hf_token)
        spec_path = out_dir / "clarity.json"
        live_spec = json.loads(spec_path.read_text(encoding="utf-8"))
        live_spec.setdefault("model", {})["file"] = hf_url
        spec_path.write_text(json.dumps(live_spec, indent=2) + "\n", encoding="utf-8")
        print(f"  ✓ clarity.json updated with HuggingFace URL")

    if args.seed and not args.dry_run:
        _seed(slug)


# ─── CLI ─────────────────────────────────────────────────────────────────────


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )

    src = p.add_mutually_exclusive_group()
    src.add_argument("--onnx", metavar="PATH", help="path to an existing .onnx file")
    src.add_argument("--pt", metavar="PATH", help="path to a TorchScript .pt file")
    src.add_argument(
        "--txrv",
        metavar="KEY",
        help="TorchXRayVision registry key (see export_cxr_suspicious.py --list)",
    )

    p.add_argument(
        "--config",
        metavar="PATH",
        help="clarity.json config from the /contribute UI (required for --onnx and --pt)",
    )
    p.add_argument("--slug", metavar="SLUG", help="override the model slug")
    p.add_argument(
        "--upload-hf",
        metavar="REPO_ID",
        help="upload model.onnx to HuggingFace (e.g. Shub-19/Chest) after writing locally",
    )
    p.add_argument(
        "--hf-token",
        metavar="TOKEN",
        help="HuggingFace write token (default: uses HF_TOKEN env or cached login)",
    )
    p.add_argument(
        "--view",
        choices=["multilabel", "binary"],
        default="multilabel",
        help="export view for --txrv (default: multilabel)",
    )
    p.add_argument(
        "--seed",
        action="store_true",
        help="upsert model into Supabase after writing files",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="print what would happen without writing any files",
    )

    args = p.parse_args()

    if not any([args.onnx, args.pt, args.txrv]):
        p.error("specify one of --onnx, --pt, or --txrv")
    if args.onnx and not args.config:
        p.error("--onnx requires --config")
    if args.pt and not args.config:
        p.error("--pt requires --config")

    return args


def main() -> int:
    args = _parse_args()

    if args.onnx:
        handle_onnx(args)
    elif args.pt:
        handle_pytorch(args)
    else:
        handle_txrv(args)

    if not args.dry_run:
        slug = args.slug or (
            args.config and json.loads(Path(args.config).read_text(encoding="utf-8")).get("id")
        ) or "your-slug"
        print("\nDone. Next steps:")
        if not args.seed:
            print(f"  python scripts/seed_supabase.py --slug {slug}")
        print("  Set status to 'published' in Supabase to make the model visible.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
