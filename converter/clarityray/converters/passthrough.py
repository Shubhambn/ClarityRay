"""Pass-through converter for ONNX artifacts."""

from pathlib import Path
import shutil


def _copy_file(source_path: str, output_path: str) -> str:
    src = Path(source_path)
    dst = Path(output_path)
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
    return str(dst)


def passthrough_onnx(source_path: str, output_path: str) -> str:
    return _copy_file(source_path, output_path)
