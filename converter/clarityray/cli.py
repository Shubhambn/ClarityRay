"""Command-line interface for clarityray."""

from __future__ import annotations

import json
import re
import shutil
from pathlib import Path
from typing import Any

import onnx
import typer

from .convert import convert_model
from .detect import detect_framework
from .errors import ConversionError, ShapeMismatchError, UnsupportedFormatError, UploadError, ValidationError
from .spec import ConversionSpec, DEFAULT_DISCLAIMER, generate_spec
from .upload import submit
from .validate import validate_onnx

app = typer.Typer(help="ClarityRay converter")

_RULE = "────────────────────"
_BODY_PARTS = {"chest", "brain", "bone", "abdomen", "spine", "other"}
_MODALITIES = {"xray", "ct", "mri", "ultrasound", "pathology", "other"}


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


def _normalize_choice(value: str, allowed: set[str], label: str) -> str:
    normalized = value.strip().lower()
    if normalized not in allowed:
        raise ValueError(f"Invalid {label}: '{value}'.")
    return normalized


@app.command("upload")
def upload_cmd(
    model_path: Path = typer.Argument(..., exists=True, readable=True, resolve_path=True),
    classes: str | None = typer.Option(None, "--classes", help="Comma-separated class names e.g. 'Normal,Pneumonia'"),
    bodypart: str | None = typer.Option(None, "--bodypart", help="Body part: chest, brain, bone, abdomen, spine, other"),
    modality: str | None = typer.Option(None, "--modality", help="Modality: xray, ct, mri, ultrasound, pathology, other"),
    output: Path = typer.Option(Path("./clarityray-package"), "--output", help="Output directory"),
    no_upload: bool = typer.Option(False, "--no-upload", help="Convert and package only, skip submission"),
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
    except ValueError as exc:
        _echo_error(
            str(exc),
            (
                "Provide at least two comma-separated class names.",
                "Use allowed values for bodypart/modality exactly as listed in --help.",
            ),
            "metadata",
        )

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

    model_id = _to_slug(model_path.stem)
    try:
        spec = generate_spec(
            str(onnx_source),
            model_id=model_id,
            classes=class_list,
            bodypart=normalized_bodypart,
            modality=normalized_modality,
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

    spec["model"]["file"] = "model.onnx"
    with spec_path.open("w", encoding="utf-8") as fh:
        json.dump(spec, fh, indent=2)
        fh.write("\n")

    if onnx_source.resolve() != packaged_model_path.resolve():
        shutil.copy2(onnx_source, packaged_model_path)

    upload_result = "skipped (--no-upload)"
    if not no_upload:
        try:
            upload_result = submit(
                package_dir=str(output_dir),
                model_path=str(packaged_model_path),
                spec_path=str(spec_path),
            )
        except UploadError as exc:
            _echo_error(
                str(exc),
                (
                    "Confirm you have internet connectivity and access to the upload endpoint.",
                    "Retry with --no-upload to produce a local package if submission is unavailable.",
                ),
                "upload",
            )

    framework_display = "TensorFlow" if framework == "tensorflow" else framework.capitalize()
    converted_name = packaged_model_path.name

    typer.echo("ClarityRay converter")
    typer.echo(_RULE)
    typer.echo(f"Framework    {framework_display} ✓")
    typer.echo(f"Converted    {converted_name} ✓")
    typer.echo("Validated    all checks passed ✓")
    typer.echo(f"Spec         {spec_path.name} ✓")
    typer.echo(f"Uploaded     {upload_result} ✓")
