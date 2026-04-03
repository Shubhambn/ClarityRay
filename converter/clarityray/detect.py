"""Model format detection helpers."""

from __future__ import annotations

from pathlib import Path

from .errors import UnsupportedFormatError

ZIP_MAGIC = b"PK"
HDF5_MAGIC = b"\x89HDF\r\n\x1a\n"
SUPPORTED_FORMATS_TEXT = (
    "onnx\n"
    "pytorch (.pt/.pth)\n"
    "keras (.h5)\n"
    "tensorflow (.pb or saved_model dir)"
)


def _build_fix_hint(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix in {".pt", ".pth"}:
        return "Install PyTorch support: pip install clarityray[pytorch]"
    if suffix in {".h5", ".pb"}:
        return "Install TensorFlow support: pip install clarityray[keras]"
    if path.is_dir() and (path / "saved_model.pb").exists():
        return "Install TensorFlow support: pip install clarityray[keras]"
    return "Install required converter extras for your model format."


def _raise_unsupported(path: Path) -> None:
    extension = path.suffix.lower() if path.is_file() else "<dir>"
    raise UnsupportedFormatError(
        message=(
            f"Unsupported model format for '{path}'. "
            f"Detected extension: '{extension or '<none>'}'. "
            f"Supported formats:\n{SUPPORTED_FORMATS_TEXT}"
        ),
        fix_hint=_build_fix_hint(path),
    )


def detect_framework(filepath: str) -> str:
    """Detect a model framework from model path and file signatures."""
    path = Path(filepath)

    if not path.exists():
        _raise_unsupported(path)

    if path.is_dir():
        if (path / "saved_model.pb").is_file():
            return "tensorflow"
        _raise_unsupported(path)

    suffix = path.suffix.lower()

    if suffix == ".onnx":
        return "onnx"

    if suffix in {".pt", ".pth"}:
        with path.open("rb") as f:
            if f.read(2) == ZIP_MAGIC:
                return "pytorch"
        _raise_unsupported(path)

    if suffix == ".h5":
        with path.open("rb") as f:
            if f.read(8) == HDF5_MAGIC:
                return "keras"
        _raise_unsupported(path)

    if suffix == ".pb":
        return "tensorflow"

    _raise_unsupported(path)


def detect_format(model_path: str) -> str:
    """Backward-compatible alias for existing CLI/import usage."""
    return detect_framework(model_path)


if __name__ == "__main__":
    import sys

    print(detect_framework(sys.argv[1]))
