"""Conversion entry points."""

from .converters.keras import convert_keras_to_onnx
from .converters.passthrough import passthrough_onnx
from .converters.pytorch import convert_pytorch_to_onnx
from .errors import ConversionError
from .spec import ConversionSpec


def convert_model(spec: ConversionSpec) -> str:
    model_format = spec.model_format.lower()
    if model_format == "pytorch":
        return convert_pytorch_to_onnx(spec.source_path, spec.output_path, tuple(spec.input_shape) if spec.input_shape is not None else None)
    if model_format == "keras":
        return convert_keras_to_onnx(spec.source_path, spec.output_path)
    if model_format == "onnx":
        return passthrough_onnx(spec.source_path, spec.output_path)
    raise ConversionError(
        message=f"No converter is available for format '{spec.model_format}'.",
        fix_hint="Set spec.model_format to one of: pytorch, keras, onnx.",
    )
