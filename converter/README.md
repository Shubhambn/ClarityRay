# clarityray — Convert and validate ML models for browser-native AI inference

`clarityray` is a Python CLI package for taking trained ML models from common training workflows and preparing them for browser execution through an ONNX-based runtime path. It focuses on operational readiness: format detection, conversion routing, validation, metadata generation, and packaging.

The tool is designed for teams that need a repeatable packaging flow instead of one-off scripts. Given a model artifact and clinical metadata, `clarityray` can produce a deployment-ready directory containing an ONNX model (`model.onnx`) and a schema-validated `clarity.json` specification.

Beyond conversion, `clarityray` enforces browser-facing constraints. It validates model structure, checks ONNX operator compatibility for web runtime scenarios, runs inference sanity checks for numeric stability, and surfaces clear fix guidance when packaging fails.

## Features

- Framework detection for ONNX, PyTorch (`.pt`/`.pth`), Keras (`.h5`), and TensorFlow model artifacts (`.pb` or SavedModel directory)
- Conversion routing for PyTorch and Keras flows into ONNX-compatible packaging paths
- ONNX validation pipeline for loadability, shape consistency, operator compatibility, and inference stability
- Automatic `clarity.json` generation with schema validation
- Typer-based CLI for consistent local and CI usage
- Structured error handling with plain-English messages and actionable fix hints

## Installation

Basic install (editable local development):

```bash
pip install -e .
```

Optional extras:

```bash
pip install "clarityray[pytorch]"
pip install "clarityray[keras]"
```

## Quick start

```bash
clarityray upload model.pth \
	--classes "Normal,Pneumonia" \
	--bodypart chest \
	--modality xray
```

## CLI usage

Primary command:

```text
clarityray upload MODEL_PATH [OPTIONS]
```

Key options:

- `--classes` — Comma-separated labels used for output class mapping (for example, `"Normal,Pneumonia"`)
- `--bodypart` — Target body region metadata (`chest`, `brain`, `bone`, `abdomen`, `spine`, `other`)
- `--modality` — Imaging/source modality metadata (`xray`, `ct`, `mri`, `ultrasound`, `pathology`, `other`)
- `--output` — Output package directory (default: `./clarityray-package`)
- `--no-upload` — Run conversion + packaging locally and skip remote submission

## How it works (pipeline)

1. **Detect framework** from path/extension/signature.
2. **Convert to ONNX (if needed)** using the appropriate converter path.
3. **Validate ONNX model** against structural and runtime checks.
4. **Generate `clarity.json`** from model tensors + metadata.
5. **Package files** into a single output directory (`model.onnx` + `clarity.json`).
6. **Upload (optional)** packaged artifacts to a configured endpoint.

## Validation checks

`clarityray` runs multiple checks before a package is considered valid:

- **Model integrity**: verifies the ONNX file can be loaded and passes base ONNX checker validation.
- **Shape matching**: confirms declared input shape and output class count match graph tensor dimensions.
- **Unsupported operators**: detects operators that are unsafe/unsupported for browser ONNX runtime execution.
- **Inference stability**: executes sanity inference runs and fails if outputs contain `NaN` or `Inf` values.

## Project structure

```text
clarityray/
	cli.py
	detect.py
	convert.py
	converters/
	validate.py
	spec.py
	upload.py
	errors.py
```

- `cli.py` — CLI entrypoint and end-to-end orchestration.
- `detect.py` — Framework detection from file paths/signatures.
- `convert.py` — Conversion dispatcher across supported formats.
- `converters/` — Backend-specific converter implementations.
- `validate.py` — ONNX and runtime validation checks.
- `spec.py` — `clarity.json` generation and schema validation.
- `upload.py` — Optional package submission helpers.
- `errors.py` — Domain-specific exception types and fix hints.

## Error handling

The CLI is designed for operator-friendly failures:

- **Plain English errors** for known conversion/validation/upload issues.
- **Fix hints** included with each domain error to reduce debug time.
- **No raw tracebacks for expected user-facing failures**; errors are surfaced as actionable CLI output.

## Example output

After a successful run, your package directory contains:

```text
clarityray-package/
	model.onnx
	clarity.json
```

## Limitations

- Browser ONNX runtimes do not support every ONNX operator.
- Packaging expects concrete/fixed tensor dimensions for reliable validation.
- Source models must be exportable to ONNX-compatible graphs.

## Future improvements

- Expanded framework coverage and broader conversion backends.
- Deeper operator compatibility support for browser runtimes.
- Improved automatic spec inference and richer metadata generation.
