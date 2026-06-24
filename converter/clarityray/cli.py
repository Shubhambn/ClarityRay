"""Command-line interface for clarityray."""

from __future__ import annotations

import json
import re
import shutil
from pathlib import Path
from typing import Any

import onnx
import typer

import os

from .convert import convert_model
from .detect import detect_framework
from .errors import ConversionError, ShapeMismatchError, UnsupportedFormatError, UploadError, ValidationError
from .spec import ConversionSpec, DEFAULT_DISCLAIMER, generate_spec
from .upload import upload_to_hf, register_in_supabase
from .validate import validate_onnx

app = typer.Typer(help="ClarityRay converter")

_RULE = "--------------------"
_BODY_PARTS = {"chest", "brain", "bone", "abdomen", "spine", "skin", "other"}
_MODALITIES = {"xray", "ct", "mri", "ultrasound", "pathology", "dermoscopy", "other"}
_TASKS = {"binary", "multilabel", "multiclass", "regression", "segmentation", "detection"}
_ACTIVATIONS = {"softmax", "sigmoid", "none"}


@app.callback()
def _root() -> None:
    """Root command group for converter commands."""
    return None


def _sanitize_message(message: str) -> str:
    first_line = (message or "An unexpected error occurred.").strip().splitlines()[0]
    one_line = re.sub(r"\s+", " ", first_line).strip()
    if not one_line:
        one_line = "An unexpected error occurred."
    if not one_line.endswith("."):
        one_line += "."
    return one_line


def _echo_error(message: str, steps: tuple[str, str], docs_page: str) -> None:
    typer.echo(f"ERROR: {_sanitize_message(message)}")
    typer.echo()
    typer.echo("How to fix:")
    typer.echo(f"1. {steps[0]}")
    typer.echo(f"2. {steps[1]}")
    typer.echo()
    typer.echo(f"Docs: clarityray.dev/docs/{docs_page}")
    raise typer.Exit(code=1)


def _to_slug(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower()).strip("-")
    return slug or "model"


def _parse_classes(raw: str) -> list[str]:
    classes = [piece.strip() for piece in raw.split(",") if piece.strip()]
    if len(classes) < 2:
        raise ValueError("Provide at least two class names separated by commas")
    return classes


def _shape_from_value_info(value_info: Any) -> list[Any]:
    dims = []
    for dim in value_info.type.tensor_type.shape.dim:
        if dim.HasField("dim_value"):
            dims.append(int(dim.dim_value))
        elif dim.HasField("dim_param"):
            dims.append(dim.dim_param)
        else:
            dims.append(None)
    return dims


def _build_validation_spec(onnx_path: Path, classes: list[str]) -> dict[str, Any]:
    model = onnx.load(str(onnx_path))
    if not model.graph.input or not model.graph.output:
        raise ValidationError(
            message="The ONNX model must include at least one input and one output tensor.",
            fix_hint="Re-export your model with complete input/output graph tensors.",
        )
    input_shape = _shape_from_value_info(model.graph.input[0])
    return {
        "input": {"shape": input_shape},
        "output": {"classes": classes},
        "safety": {
            "tier": "screening",
            "disclaimer": DEFAULT_DISCLAIMER,
            "certified": False,
        },
    }


_DIAGNOSTIC_TERMS = ("cancer", "diagnos", "malignant", "tumor")


def _suggest_safe_labels(classes: list[str]) -> None:
    """Print a non-fatal suggestion when class labels use diagnostic wording."""
    flagged = [c for c in classes if any(term in c.lower() for term in _DIAGNOSTIC_TERMS)]
    if flagged:
        typer.echo(
            f"SUGGESTION: class label(s) {flagged} use diagnostic wording. "
            "For a screening demo prefer: "
            "'No suspicious chest finding,Possible suspicious chest finding'."
        )
        typer.echo()


def _normalize_choice(value: str, allowed: set[str], label: str) -> str:
    normalized = value.strip().lower()
    if normalized not in allowed:
        raise ValueError(f"Invalid {label}: '{value}'.")
    return normalized


def _load_platform_supabase() -> tuple[str, str]:
    """Read SUPABASE_URL and a write-capable key from env vars or the platform api/.env file.

    Key resolution order (first non-empty wins):
      1. SUPABASE_SERVICE_KEY  — service_role key; bypasses RLS; needed for inserts
      2. SUPABASE_KEY          — publishable/anon key; read-only via RLS
    """
    url = os.environ.get("SUPABASE_URL", "")
    key = (
        os.environ.get("SUPABASE_SERVICE_KEY", "")
        or os.environ.get("SUPABASE_KEY", "")
    )
    if url and key:
        return url, key

    # Walk up from CWD looking for api/.env (handles running from any subdirectory)
    search = Path.cwd()
    for _ in range(5):
        candidate = search / "api" / ".env"
        if candidate.exists():
            for raw in candidate.read_text(encoding="utf-8").splitlines():
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, _, v = line.partition("=")
                k, v = k.strip(), v.strip().strip('"').strip("'")
                if k == "SUPABASE_URL" and not url:
                    url = v
                elif k == "SUPABASE_SERVICE_KEY" and v:
                    key = v  # service_role takes priority — overwrite anon key
                elif k == "SUPABASE_KEY" and not key:
                    key = v
            break
        parent = search.parent
        if parent == search:
            break
        search = parent

    return url, key


@app.command("upload")
def upload_cmd(
    model_path: Path = typer.Argument(..., exists=True, readable=True, resolve_path=True),
    classes: str | None = typer.Option(None, "--classes", help="Comma-separated class names e.g. 'Normal,Pneumonia'"),
    bodypart: str | None = typer.Option(None, "--bodypart", help="Body part: chest, brain, bone, abdomen, spine, other"),
    modality: str | None = typer.Option(None, "--modality", help="Modality: xray, ct, mri, ultrasound, pathology, other"),
    output: Path = typer.Option(Path("./clarityray-package"), "--output", help="Output directory"),
    no_upload: bool = typer.Option(False, "--no-upload", help="Convert and package only, skip submission"),
    task: str = typer.Option("binary", "--task", help="Output task: binary, multilabel, multiclass"),
    activation: str | None = typer.Option(None, "--activation", help="Output activation: softmax, sigmoid, none (default: softmax for binary, none for multilabel)"),
    model_id_override: str | None = typer.Option(None, "--id", help="Model slug/id override (default: derived from filename or parent directory)"),
    display_name: str | None = typer.Option(None, "--name", help="Human-readable model name (default: same as id)"),
) -> None:
    output_dir = output.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    converted_temp_path = output_dir / "_converted.onnx"
    packaged_model_path = output_dir / "model.onnx"
    spec_path = output_dir / "clarity.json"

    try:
        framework = detect_framework(str(model_path))
    except UnsupportedFormatError as exc:
        _echo_error(
            str(exc),
            (
                "Use a supported model input (.onnx, .pt/.pth, .h5, or TensorFlow SavedModel).",
                "Install required converter extras and try again.",
            ),
            "supported-formats",
        )

    onnx_source = model_path
    if framework != "onnx":
        try:
            conversion_spec = ConversionSpec(
                source_path=str(model_path),
                output_path=str(converted_temp_path),
                model_format=framework,
                input_shape=(1, 3, 224, 224) if framework == "pytorch" else None,
            )
            convert_model(conversion_spec)
            onnx_source = converted_temp_path
        except ConversionError as exc:
            _echo_error(
                str(exc),
                (
                    "Install the required converter extra for your framework (for example, pytorch or keras).",
                    "Re-export your model with static input dimensions and retry conversion.",
                ),
                "conversion",
            )

    classes_raw = classes if classes is not None else typer.prompt("Classes (comma-separated)")
    bodypart_raw = bodypart if bodypart is not None else typer.prompt("Body part")
    modality_raw = modality if modality is not None else typer.prompt("Modality")

    try:
        class_list = _parse_classes(classes_raw)
        normalized_bodypart = _normalize_choice(bodypart_raw, _BODY_PARTS, "bodypart")
        normalized_modality = _normalize_choice(modality_raw, _MODALITIES, "modality")
        normalized_task = _normalize_choice(task, _TASKS, "task")
        if activation is not None:
            _normalize_choice(activation, _ACTIVATIONS, "activation")
    except ValueError as exc:
        _echo_error(
            str(exc),
            (
                "Provide at least two comma-separated class names.",
                "Use allowed values for bodypart/modality/task/activation exactly as listed in --help.",
            ),
            "metadata",
        )

    _suggest_safe_labels(class_list)

    try:
        validation_spec = _build_validation_spec(onnx_source, class_list)
        validation_report = validate_onnx(str(onnx_source), validation_spec)
    except ValidationError as exc:
        _echo_error(
            str(exc),
            (
                "Ensure the ONNX graph has concrete input/output tensor shapes.",
                "Regenerate the model export and retry packaging.",
            ),
            "validation",
        )

    if not validation_report.passed:
        failed = next((check for check in validation_report.checks if not check.get("passed")), None)
        reason = failed.get("message", "Validation failed.") if failed else "Validation failed."
        _echo_error(
            reason,
            (
                "Fix the validation issue reported above in your model export or class metadata.",
                "Run packaging again after correcting the issue.",
            ),
            "validation",
        )

    for warning in validation_report.warnings:
        typer.echo(f"WARNING: {warning}")

    # Derive model ID: explicit override → parent dir if stem is generic → stem
    stem = model_path.stem
    if model_id_override:
        model_id = _to_slug(model_id_override)
    elif stem.lower() in ("model", "weights", "checkpoint", "model_onnx"):
        model_id = _to_slug(model_path.parent.name)
    else:
        model_id = _to_slug(stem)
    resolved_name = display_name or model_id

    try:
        spec = generate_spec(
            str(onnx_source),
            model_id=model_id,
            classes=class_list,
            bodypart=normalized_bodypart,
            modality=normalized_modality,
            task=normalized_task,
            activation=activation,
        )
    except (ValidationError, ShapeMismatchError) as exc:
        _echo_error(
            str(exc),
            (
                "Make sure your model output size matches the number of class labels.",
                "Regenerate and retry once class metadata and tensors are aligned.",
            ),
            "spec",
        )

    spec["name"] = resolved_name
    spec["model"]["file"] = "model.onnx"
    with spec_path.open("w", encoding="utf-8") as fh:
        json.dump(spec, fh, indent=2)
        fh.write("\n")

    if onnx_source.resolve() != packaged_model_path.resolve():
        shutil.copy2(onnx_source, packaged_model_path)

    framework_display = "TensorFlow" if framework == "tensorflow" else framework.capitalize()
    converted_name = packaged_model_path.name

    typer.echo()
    typer.echo("ClarityRay converter")
    typer.echo(_RULE)
    typer.echo(f"Framework    {framework_display} [ok]")
    typer.echo(f"Converted    {converted_name} [ok]")
    typer.echo("Validated    all checks passed [ok]")
    typer.echo(f"Spec         {spec_path.name} [ok]")
    typer.echo(f"Package      {output_dir} [ok]")

    if no_upload:
        typer.echo()
        typer.echo("Upload skipped (--no-upload). To publish your model, re-run without --no-upload.")
        return

    # ------------------------------------------------------------------ #
    # HuggingFace Hub upload
    # ------------------------------------------------------------------ #
    typer.echo()
    typer.echo("HuggingFace Hub Upload")
    typer.echo(_RULE)
    typer.echo("Create a token at: https://huggingface.co/settings/tokens  (role: write)")
    typer.echo()

    hf_token = os.environ.get("HF_TOKEN") or typer.prompt(
        "HuggingFace token", hide_input=True
    )
    hf_repo = os.environ.get("HF_REPO") or typer.prompt(
        "HuggingFace repository  (e.g. your-username/clarity-models)"
    )

    slug = spec.get("id", model_id)
    typer.echo()
    typer.echo(f"  Uploading '{slug}/model.onnx' → {hf_repo} ...")

    try:
        hf_urls = upload_to_hf(
            str(packaged_model_path),
            str(spec_path),
            slug,
            repo_id=hf_repo,
            token=hf_token,
        )
    except UploadError as exc:
        _echo_error(
            str(exc),
            (
                "Verify your HuggingFace token has write access and the repo name is correct.",
                "Retry with --no-upload to keep the local package and skip publishing.",
            ),
            "upload",
        )

    model_hf_url = hf_urls["model_url"]
    clarity_hf_url = hf_urls["clarity_url"]

    # Patch clarity.json so model.file points to the live HF URL
    spec["model"]["file"] = model_hf_url
    with spec_path.open("w", encoding="utf-8") as fh:
        json.dump(spec, fh, indent=2)
        fh.write("\n")

    typer.echo(f"  Model URL   : {model_hf_url}")
    typer.echo(f"  Spec URL    : {clarity_hf_url}")
    typer.echo(f"  Repo        : {hf_urls['repo_url']}")
    typer.echo()
    typer.echo("HuggingFace Upload [ok]")

    # ------------------------------------------------------------------ #
    # Supabase metadata registration (platform Supabase, read from api/.env)
    # ------------------------------------------------------------------ #
    typer.echo()
    typer.echo("Supabase Metadata Registry")
    typer.echo(_RULE)

    supabase_url, supabase_key = _load_platform_supabase()
    if not supabase_url or not supabase_key:
        typer.echo("  WARNING: SUPABASE_URL / SUPABASE_KEY not found in api/.env or environment.")
        typer.echo("  Skipping Supabase registration. Seed manually with: python scripts/seed_supabase.py")
        typer.echo()
        typer.echo("All done — model is on HuggingFace. Register in Supabase when credentials are available.")
        return

    typer.echo(f"  Using platform Supabase: {supabase_url}")

    try:
        model_uuid = register_in_supabase(
            spec,
            model_url=model_hf_url,
            clarity_url=clarity_hf_url,
            supabase_url=supabase_url,
            supabase_key=supabase_key,
        )
    except UploadError as exc:
        typer.echo(f"  WARNING: Supabase registration failed — {exc}")
        typer.echo("  The publishable key in api/.env may lack write access.")
        typer.echo("  Set SUPABASE_KEY to your service_role key and re-run, or seed manually.")
        typer.echo()
        typer.echo("All done — model is on HuggingFace.")
        return

    typer.echo(f"  Slug        : {slug}")
    typer.echo(f"  Model ID    : {model_uuid}")
    typer.echo(f"  Model URL   : {model_hf_url}")
    typer.echo()
    typer.echo("Supabase Registration [ok]")
    typer.echo()
    typer.echo("All done — your model is live.")


@app.command("register")
def register_cmd(
    spec_path: Path = typer.Argument(
        ...,
        resolve_path=True,
        help="Path to an existing clarity.json (or its parent directory).",
    ),
    model_url: str | None = typer.Option(
        None,
        "--model-url",
        help="ONNX URL to store in Supabase. Auto-set to the HuggingFace URL when --hf-repo is given.",
    ),
    clarity_url: str | None = typer.Option(
        None,
        "--clarity-url",
        help="clarity.json URL to store in Supabase. Auto-set to the HuggingFace URL when --hf-repo is given.",
    ),
    hf_token: str | None = typer.Option(
        None,
        "--hf-token",
        envvar="HF_TOKEN",
        help="HuggingFace write token. If omitted, read from HF_TOKEN env var.",
        hide_input=True,
    ),
    hf_repo: str | None = typer.Option(
        None,
        "--hf-repo",
        envvar="HF_REPO",
        help="HuggingFace repository (owner/repo-name). When set, uploads model.onnx + clarity.json before registering.",
    ),
) -> None:
    """Upload an existing clarity.json + model.onnx to HuggingFace, then register in Supabase.

    Designed to be run after the per-model download/export script has produced a
    validated clarity.json and model.onnx. Preserves the hand-crafted spec exactly
    (explainability, source_model, per-label suspicious flags, etc.).

    HuggingFace upload is optional — omit --hf-repo to register with local paths only.
    Supabase credentials are read from api/.env (SUPABASE_URL, SUPABASE_KEY) or env vars.

    Examples:
        # Local registration only (no HF upload):
        clarityray register public/models/efficientnetb4-skin-ham10000/

        # Full pipeline — HF upload then Supabase registration:
        clarityray register public/models/efficientnetb4-skin-ham10000/ \\
            --hf-token hf_xxx --hf-repo owner/clarity-models
    """
    # Accept either a clarity.json file or its parent directory.
    resolved = spec_path
    if resolved.is_dir():
        resolved = resolved / "clarity.json"
    if not resolved.exists():
        typer.echo(f"ERROR: {resolved} not found.", err=True)
        raise typer.Exit(code=1)

    try:
        spec = json.loads(resolved.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        typer.echo(f"ERROR: Could not parse clarity.json — {exc}", err=True)
        raise typer.Exit(code=1)

    slug = spec.get("id") or _to_slug(resolved.parent.name)
    model_dir = resolved.parent
    onnx_path = model_dir / "model.onnx"

    # ── Optional HuggingFace upload ──────────────────────────────────────────
    if hf_repo:
        if not hf_token:
            typer.echo("ERROR: --hf-token (or HF_TOKEN env var) is required when --hf-repo is set.", err=True)
            raise typer.Exit(code=1)
        if not onnx_path.exists():
            typer.echo(f"ERROR: model.onnx not found at {onnx_path}", err=True)
            typer.echo("  Run the download/export script first to produce the ONNX file.", err=True)
            raise typer.Exit(code=1)

        typer.echo()
        typer.echo("HuggingFace Hub Upload")
        typer.echo(_RULE)
        typer.echo(f"  Repo        : {hf_repo}")
        typer.echo(f"  Model file  : {onnx_path.name}  ({onnx_path.stat().st_size / 1024 / 1024:.1f} MB)")
        typer.echo(f"  Spec file   : {resolved.name}")
        typer.echo(f"  Remote path : {slug}/")
        typer.echo()
        typer.echo("  Uploading — this may take a minute ...")

        try:
            hf_urls = upload_to_hf(
                str(onnx_path),
                str(resolved),
                slug,
                repo_id=hf_repo,
                token=hf_token,
            )
        except UploadError as exc:
            _echo_error(
                str(exc),
                (
                    "Verify your HuggingFace token has write access and the repo name is correct (owner/repo).",
                    "Retry with --no-upload to keep the local package and skip HuggingFace.",
                ),
                "upload",
            )

        # Patch clarity.json model.file to the live HF URL so the spec is self-consistent.
        spec["model"]["file"] = hf_urls["model_url"]
        resolved.write_text(json.dumps(spec, indent=2) + "\n", encoding="utf-8")

        resolved_model_url   = model_url   or hf_urls["model_url"]
        resolved_clarity_url = clarity_url or hf_urls["clarity_url"]

        typer.echo(f"  Model URL   : {resolved_model_url}")
        typer.echo(f"  Clarity URL : {resolved_clarity_url}")
        typer.echo(f"  Repo        : {hf_urls['repo_url']}")
        typer.echo()
        typer.echo("HuggingFace Upload [ok]")
    else:
        # No HF upload — fall back to local serving paths.
        resolved_model_url   = model_url   or f"/models/{slug}/model.onnx"
        resolved_clarity_url = clarity_url or f"/models/{slug}/clarity.json"

    # ── Supabase registration ─────────────────────────────────────────────────
    supabase_url, supabase_key = _load_platform_supabase()
    if not supabase_url or not supabase_key:
        typer.echo("ERROR: Supabase credentials not found.", err=True)
        typer.echo("  Add SUPABASE_URL and SUPABASE_KEY to api/.env or set them as environment variables.")
        raise typer.Exit(code=1)

    typer.echo()
    typer.echo("Supabase Metadata Registry")
    typer.echo(_RULE)
    typer.echo(f"  Slug        : {slug}")
    typer.echo(f"  Supabase    : {supabase_url}")
    typer.echo(f"  Model URL   : {resolved_model_url}")
    typer.echo(f"  Clarity URL : {resolved_clarity_url}")
    typer.echo()

    try:
        model_uuid = register_in_supabase(
            spec,
            model_url=resolved_model_url,
            clarity_url=resolved_clarity_url,
            supabase_url=supabase_url,
            supabase_key=supabase_key,
        )
    except UploadError as exc:
        _echo_error(
            str(exc),
            (
                "Ensure SUPABASE_KEY is a service_role key with insert/update rights.",
                "Confirm migration 005_model_task_validation.sql has been applied to your project.",
            ),
            "supabase",
        )

    typer.echo(f"  Model ID    : {model_uuid}")
    typer.echo()
    typer.echo("Supabase Registration [ok]")
    typer.echo()
    typer.echo(f"  '{slug}' is now live in the registry.")
