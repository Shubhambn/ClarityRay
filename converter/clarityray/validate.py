"""Validation utilities for converted models."""

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy
import onnx

from .errors import ValidationError

_UNSUPPORTED_WEB_OPS = {
    "ATen",
    "DynamicQuantizeLinear",
    "EyeLike",
    "MeanVarianceNormalization",
    "NegativeLogLikelihoodLoss",
    "QLinearMatMul",
}


@dataclass(slots=True)
class ValidationReport:
    passed: bool
    checks: list[dict]
    warnings: list[str]


def _fail(checks: list[dict], name: str, message: str, warnings: list[str]) -> ValidationReport:
    checks.append({"name": name, "passed": False, "message": message})
    return ValidationReport(passed=False, checks=checks, warnings=warnings)


def _pass(checks: list[dict], name: str, message: str) -> None:
    checks.append({"name": name, "passed": True, "message": message})


def _extract_tensor_shape(value_info: Any) -> list[Any]:
    tensor_type = value_info.type.tensor_type
    shape = tensor_type.shape
    dims: list[Any] = []
    for dim in shape.dim:
        if dim.HasField("dim_value"):
            dims.append(int(dim.dim_value))
        elif dim.HasField("dim_param"):
            dims.append(dim.dim_param)
        else:
            dims.append(None)
    return dims


def _output_size(shape: list[Any]) -> Any:
    if not shape:
        return None
    return shape[-1]


def validate_onnx(onnx_path: str, spec: dict) -> ValidationReport:
    checks: list[dict] = []
    warnings: list[str] = []

    # CHECK 1 — Load
    try:
        model = onnx.load(onnx_path)
        onnx.checker.check_model(model)
        _pass(checks, "Load", "Model loaded and basic ONNX validation passed.")
    except Exception:
        return _fail(checks, "Load", "Model file is corrupted or not a valid ONNX file.", warnings)

    # CHECK 2 — Shape verification
    try:
        actual_input_shape = _extract_tensor_shape(model.graph.input[0])
        declared_input_shape = list(spec["input"]["shape"])
        if actual_input_shape != declared_input_shape:
            return _fail(
                checks,
                "Shape verification",
                f"Input shape mismatch. Model expects {actual_input_shape}, spec declares {declared_input_shape}.",
                warnings,
            )

        actual_output_shape = _extract_tensor_shape(model.graph.output[0])
        actual_output_size = _output_size(actual_output_shape)
        declared_class_count = len(spec["output"]["classes"])
        if actual_output_size != declared_class_count:
            return _fail(
                checks,
                "Shape verification",
                f"Output classes mismatch. Model outputs {actual_output_size} values, spec declares {declared_class_count} classes.",
                warnings,
            )

        _pass(checks, "Shape verification", "Model input/output dimensions match the spec.")
    except Exception:
        return _fail(checks, "Shape verification", "Input/output shape metadata is missing or invalid.", warnings)

    # CHECK 3 — Operator compatibility
    found_unsupported = next((node.op_type for node in model.graph.node if node.op_type in _UNSUPPORTED_WEB_OPS), None)
    if found_unsupported is not None:
        return _fail(
            checks,
            "Operator compatibility",
            f"Model uses {found_unsupported}, which is not supported in browser ONNX runtime.",
            warnings,
        )
    _pass(checks, "Operator compatibility", "No unsupported browser ONNX ops found.")

    # CHECK 4 — Inference test
    try:
        import onnxruntime as ort

        session = ort.InferenceSession(onnx_path)
        input_name = session.get_inputs()[0].name
        input_shape = tuple(spec["input"]["shape"])
        for _ in range(3):
            sample = numpy.random.rand(*input_shape).astype(numpy.float32)
            outputs = session.run(None, {input_name: sample})
            if not all(numpy.all(numpy.isfinite(output)) for output in outputs):
                return _fail(
                    checks,
                    "Inference test",
                    "Model produced NaN or Inf values during test inference.",
                    warnings,
                )
        _pass(checks, "Inference test", "Inference outputs are finite across random test runs.")
    except Exception:
        return _fail(checks, "Inference test", "Model produced NaN or Inf values during test inference.", warnings)

    # CHECK 5 — Safety fields
    safety = spec.get("safety", {}) if isinstance(spec, dict) else {}
    tier = safety.get("tier")
    disclaimer = safety.get("disclaimer")
    certified = safety.get("certified")
    if not tier or not isinstance(disclaimer, str) or len(disclaimer) <= 20 or certified is not False:
        return _fail(checks, "Safety fields", "Safety fields incomplete or invalid.", warnings)
    _pass(checks, "Safety fields", "Safety metadata is complete and valid.")

    return ValidationReport(passed=True, checks=checks, warnings=warnings)


def validate_artifact(path: str) -> bool:
    artifact = Path(path)
    if not artifact.exists():
        raise ValidationError(
            message=f"Converted artifact '{path}' was not found.",
            fix_hint="Run conversion first and make sure output_path points to a writable location.",
        )
    if artifact.suffix.lower() != ".onnx":
        raise ValidationError(
            message=f"Artifact '{path}' is not an ONNX file.",
            fix_hint="Use an .onnx output path when converting your model.",
        )
    return True
