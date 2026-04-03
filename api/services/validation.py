from __future__ import annotations

import os
import tempfile
from typing import Any

import numpy as np
import onnx
import onnxruntime as ort
from supabase import Client

from api.deps import get_supabase
from api.services.storage import get_storage


def _infer_input_shape(raw_shape: list[Any]) -> list[int]:
    inferred: list[int] = []
    for dim in raw_shape:
        if isinstance(dim, int) and dim > 0:
            inferred.append(dim)
        else:
            inferred.append(1)
    return inferred


def run_background_validation(model_version_id: str, model_id: str, onnx_key: str) -> None:
    supabase: Client = get_supabase()
    storage = get_storage()

    checks: dict[str, Any] = {
        "onnx_checker": False,
        "synthetic_inference_passes": [],
        "errors": [],
    }
    passed = False
    temp_file_path = ""

    try:
        model_bytes = storage.download_bytes(onnx_key)
        with tempfile.NamedTemporaryFile(suffix=".onnx", delete=False) as temp_file:
            temp_file.write(model_bytes)
            temp_file_path = temp_file.name

        onnx.checker.check_model(temp_file_path)
        checks["onnx_checker"] = True

        session = ort.InferenceSession(temp_file_path, providers=["CPUExecutionProvider"])
        input_meta = session.get_inputs()[0]
        concrete_shape = _infer_input_shape(list(input_meta.shape))
        synthetic_input = np.random.rand(*concrete_shape).astype(np.float32)

        pass_results: list[bool] = []
        for _ in range(3):
            outputs = session.run(None, {input_meta.name: synthetic_input})
            pass_results.append(bool(outputs))

        checks["synthetic_inference_passes"] = pass_results
        passed = all(pass_results)
    except Exception as exc:  # noqa: BLE001
        checks["errors"].append(str(exc))
        passed = False
    finally:
        if temp_file_path and os.path.exists(temp_file_path):
            os.remove(temp_file_path)

    supabase.table("validation_runs").insert(
        {
            "model_version_id": model_version_id,
            "passed": passed,
            "checks": checks,
            "onnxruntime_ver": ort.__version__,
        }
    ).execute()

    new_status = "validated" if passed else "validation_failed"
    supabase.table("models").update({"status": new_status}).eq("id", model_id).execute()
