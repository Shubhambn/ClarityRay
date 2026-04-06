"""PyTorch to ONNX conversion backend."""

from collections import OrderedDict
import re

from ..errors import ConversionError


def _extract_unsupported_op_name(error_message: str) -> str:
    patterns = [
        r'Unsupported[^\n]*operator[^\n]*["\']([A-Za-z0-9_:\-.]+)["\']',
        r'operator[^\n]*["\']([A-Za-z0-9_:\-.]+)["\']',
        r"aten::([A-Za-z0-9_:\-.]+)",
    ]
    for pattern in patterns:
        match = re.search(pattern, error_message, flags=re.IGNORECASE)
        if match:
            return match.group(1)
    return "unknown"


def convert_pytorch(model_path: str, input_shape: tuple, output_path: str) -> str:
    try:
        import torch  # type: ignore[import-not-found]
    except ImportError as exc:
        raise ConversionError("PyTorch is not installed. Run: pip install clarityray[pytorch]") from exc

    try:
        model = torch.load(model_path, map_location="cpu")
        if isinstance(model, OrderedDict):
            raise ConversionError(
                "This file is a state dict, not a full model. You need to load it into your model class first."
            )

        model.eval()
        dummy_input = torch.zeros(*input_shape)

        torch.onnx.export(
            model,
            dummy_input,
            output_path,
            opset_version=17,
            input_names=["input"],
            output_names=["output"],
        )
        return output_path
    except RuntimeError as exc:
        message = str(exc)
        lowered = message.lower()

        if "unsupported" in lowered:
            operation_name = _extract_unsupported_op_name(message)
            raise ConversionError(
                "Your model contains an operation that cannot be converted to ONNX.\n"
                f"Operation: {operation_name}\n"
                "Fix: check clarityray.dev/docs/unsupported-ops"
            ) from exc

        if "dynamic" in lowered:
            raise ConversionError("Your model uses dynamic shapes. Export with fixed input shape.") from exc

        raise ConversionError(f"{message}\nDocs: clarityray.dev/docs/unsupported-ops") from exc


def convert_pytorch_to_onnx(source_path: str, output_path: str, input_shape: tuple | None = None) -> str:
    """Compatibility wrapper around ``convert_pytorch``."""
    if input_shape is None:
        raise ConversionError("PyTorch conversion requires an input shape. Example: (1, 3, 224, 224).")
    return convert_pytorch(model_path=source_path, input_shape=input_shape, output_path=output_path)
