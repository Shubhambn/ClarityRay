"""Data structures for conversion specifications."""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from typing import Sequence

import onnx
from jsonschema import Draft7Validator

from .errors import ShapeMismatchError, ValidationError


IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]
DEFAULT_DISCLAIMER = "This is a screening tool. Results require review by a qualified physician."


@dataclass(slots=True)
class ConversionSpec:
    source_path: str
    output_path: str
    model_format: str
    input_shape: Sequence[int] | None = None


def _schema_path() -> Path:
    return Path(__file__).resolve().parents[2] / "clarity-schema.json"


def _load_schema(schema: dict[str, Any] | None) -> dict[str, Any]:
    if schema is not None:
        return schema
    with _schema_path().open("r", encoding="utf-8") as fh:
        return json.load(fh)


def _read_tensor_shape(value_info: onnx.ValueInfoProto, field_name: str) -> list[int]:
    dims = value_info.type.tensor_type.shape.dim
    shape: list[int] = []
    for idx, dim in enumerate(dims):
        if dim.HasField("dim_value") and dim.dim_value > 0:
            shape.append(int(dim.dim_value))
            continue
        raise ValidationError(
            message=(
                f"Could not resolve a positive dimension for '{field_name}' at index {idx}. "
                "All dimensions must be concrete positive integers to satisfy the schema."
            ),
            fix_hint="Export the ONNX model with concrete static dimensions and regenerate the spec.",
        )
    return shape


def _infer_normalization(input_shape: list[int]) -> dict[str, list[float]]:
    channels = input_shape[-3] if len(input_shape) >= 3 else None
    if channels == 3:
        return {"mean": IMAGENET_MEAN, "std": IMAGENET_STD}
    if channels == 1:
        return {"mean": [0.0], "std": [1.0]}
    return {"mean": [0.0], "std": [1.0]}


def _format_validation_path(error: Any) -> str:
    path = [str(piece) for piece in error.absolute_path]
    if error.validator == "required":
        match = re.search(r"'([^']+)' is a required property", error.message)
        if match:
            path.append(match.group(1))
    return ".".join(path) if path else "$"


def _validate_schema(instance: dict[str, Any], schema: dict[str, Any]) -> None:
    validator = Draft7Validator(schema)
    errors = sorted(validator.iter_errors(instance), key=lambda e: list(e.absolute_path))
    if not errors:
        return

    details = "\n".join(f"- {_format_validation_path(err)}: {err.message}" for err in errors)
    raise ValidationError(
        message=f"Schema validation failed for the following fields:\n{details}",
        fix_hint="Correct the listed fields and regenerate the specification.",
    )


def _compute_sha256(path: str) -> str:
    hasher = hashlib.sha256()
    with Path(path).open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def generate_spec(
    onnx_path: str,
    model_id: str,
    classes: list[str],
    bodypart: str,
    modality: str,
    version: str = "1.0.0",
    *,
    schema: dict[str, Any] | None = None,
    disclaimer: str | None = None,
) -> dict[str, Any]:
    """Generate a schema-valid ClarityRay specification from an ONNX model."""
    model = onnx.load(onnx_path)

    if not model.graph.input:
        raise ValidationError(
            message="The ONNX model has no graph input tensors.",
            fix_hint="Ensure the exported ONNX graph includes at least one input tensor.",
        )
    if not model.graph.output:
        raise ValidationError(
            message="The ONNX model has no graph output tensors.",
            fix_hint="Ensure the exported ONNX graph includes at least one output tensor.",
        )

    input_shape = _read_tensor_shape(model.graph.input[0], "input.shape")
    output_shape = _read_tensor_shape(model.graph.output[0], "output.shape")
    output_count = output_shape[-1]

    if output_count != len(classes):
        raise ShapeMismatchError(
            message=(
                f"Output count mismatch: model output reports {output_count} classes, "
                f"but received {len(classes)} class labels."
            ),
            fix_hint="Update the classes list or export a model with matching output class count.",
        )

    schema_dict = _load_schema(schema)
    spec: dict[str, Any] = {
        "id": model_id,
        "name": model_id,
        "version": version,
        "certified": False,
        "bodypart": bodypart,
        "modality": modality,
        "model": {"file": onnx_path, "format": "onnx"},
        "integrity": {"sha256": _compute_sha256(onnx_path)},
        "input": {
            "shape": input_shape,
            "layout": "NCHW",
            "normalize": _infer_normalization(input_shape),
        },
        "output": {
            "shape": output_shape,
            "classes": classes,
            "activation": "softmax",
        },
        "safety": {
            "tier": "screening",
            "disclaimer": disclaimer or DEFAULT_DISCLAIMER,
        },
        "thresholds": {
            "possible_finding": 0.5,
            "low_confidence": 0.25,
            "validation_status": "unvalidated",
        },
    }

    _validate_schema(spec, schema_dict)
    return spec
