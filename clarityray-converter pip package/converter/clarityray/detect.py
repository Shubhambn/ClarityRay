"""Model format detection helpers."""

from __future__ import annotations

from pathlib import Path
import sys

from .errors import UnsupportedFormatError

ZIP_MAGIC = b"PK"
HDF5_MAGIC = b"\x89HDF\r\n\x1a\n"
SUPPORTED_FORMATS = "onnx, pytorch (.pt/.pth), keras (.h5), tensorflow (.pb or SavedModel directory)"


def _install_command_for_format(detected_format: str) -> str:
    if detected_format == "pytorch":
        return "pip install -e .[pytorch]"
    if detected_format in {"keras", "tensorflow"}:
        return "pip install -e .[keras]"
    return "pip install -e ."


def _raise_unsupported(path: Path, detected_format: str) -> None:
    extension = path.suffix.lower() if path.is_file() else "<dir>"
    install_cmd = _install_command_for_format(detected_format)
    raise UnsupportedFormatError(
        message=(
            f"Unsupported model format for '{path}'. Found extension: '{extension or '<none>'}'. "
            f"Supported formats: {SUPPORTED_FORMATS}. "
            f"Install command for detected format '{detected_format}': {install_cmd}"
        ),
        fix_hint=install_cmd,
    )


def detect_framework(filepath: str) -> str:
    """Detect a model framework from a path using extension + file signature checks."""
    path = Path(filepath)

    if path.is_dir():
        if (path / "saved_model.pb").is_file():
            return "tensorflow"
        _raise_unsupported(path, "unknown")

    suffix = path.suffix.lower()

    if suffix == ".onnx":
        return "onnx"

    if suffix in {".pt", ".pth"}:
        try:
            with path.open("rb") as f:
                if f.read(2) == ZIP_MAGIC:
                    return "pytorch"
        except OSError:
            pass
        _raise_unsupported(path, "pytorch")

    if suffix == ".h5":
        try:
            with path.open("rb") as f:
                if f.read(8) == HDF5_MAGIC:
                    return "keras"
        except OSError:
            pass
        _raise_unsupported(path, "keras")

    if suffix == ".pb":
        return "tensorflow"

    _raise_unsupported(path, "unknown")


def detect_format(model_path: str) -> str:
    """Backward-compatible alias for existing CLI/import usage."""
    return detect_framework(model_path)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python -m clarityray.detect <path>")
        raise SystemExit(2)
    print(detect_framework(sys.argv[1]))
