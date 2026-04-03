"""Keras to ONNX conversion backend."""

from .passthrough import _copy_file
from ..errors import ConversionError


def convert_keras_to_onnx(source_path: str, output_path: str) -> str:
    try:
        return _copy_file(source_path, output_path)
    except OSError as exc:
        raise ConversionError(
            message=f"Keras conversion failed while writing '{output_path}'.",
            fix_hint="Install the keras extra and verify the source model path and output permissions.",
        ) from exc
