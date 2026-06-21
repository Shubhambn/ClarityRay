# Model export scripts (Phase 1)

Phase 1 of [docs/DENSENET121_CXR_IMPLEMENTATION_PLAN.md](../docs/DENSENET121_CXR_IMPLEMENTATION_PLAN.md),
built **generically** so it serves multiple model families, not one hardcoded
architecture. The export pipeline (load → wrap → ONNX → verify → sha256 →
`clarity.json`) is shared; each model is a single declarative entry in a
registry.

## Scripts

| Script | Purpose |
|---|---|
| [export_cxr_suspicious.py](export_cxr_suspicious.py) | Registry-driven exporter. Wraps a multi-label pathology model into the binary `[1,2]` "suspicious finding" contract, exports ONNX (opset 17, input `xray`, output `logits`), runs `onnx.checker` + an ONNX Runtime smoke test, computes SHA-256, and writes a schema-valid `clarity.json` into `public/models/<slug>/`. |
| [test_onnx.py](test_onnx.py) | Model-agnostic verifier. For any exported dir it reads `clarity.json`, feeds a zero tensor of the declared `input.shape`, and asserts the output's last dim equals `len(output.classes)`, that values are finite, and that the recorded SHA-256 still matches. |

## Install

```bash
pip install torch torchvision torchxrayvision onnx onnxscript onnxruntime numpy jsonschema huggingface_hub
```

> `onnxscript` is required by the ONNX exporter in torch ≥ 2.9.

## Run

```bash
python scripts/export_cxr_suspicious.py --list          # list registered models
python scripts/export_cxr_suspicious.py                 # export the default model
python scripts/export_cxr_suspicious.py --model resnet50-cxr-suspicious
python scripts/export_cxr_suspicious.py --all           # export everything registered
python scripts/test_onnx.py                             # verify all exported models
python scripts/test_onnx.py densenet121-cxr-suspicious  # verify one
```

`--list` and `test_onnx.py` need only numpy/onnxruntime; exporting needs torch +
torchxrayvision.

## Adding a new model

Add one `ModelDef` to `MODEL_REGISTRY` in
[export_cxr_suspicious.py](export_cxr_suspicious.py). No pipeline code changes
are required. The pipeline is generic over:

- **channels** (`1` grayscale or `3` RGB) and square **input_size** (224, 512, …)
- **normalization** (`mean`/`std`, length must equal `channels`)
- **pathology selection** — only labels present in the loaded checkpoint are
  used, so an entry may safely list labels a given checkpoint lacks
- **safety tier**, disclaimer, body part, modality

```python
"my-model-cxr-suspicious": ModelDef(
    key="my-model-cxr-suspicious",
    slug="my-model-cxr-suspicious",
    name="My Model CXR Suspicious Finding Demo",
    loader=_load_torchxrayvision("densenet121-res224-all"),
    suspicious_findings=["Mass", "Nodule", "Lung Opacity"],
    channels=1,
    input_size=224,
),
```

For a non-TorchXRayVision source, supply your own `loader` returning
`(torch.nn.Module, list[str] pathology_labels)`. Everything downstream is shared.

## Invariants (Phase 1)

- Output is always binary `[1,2]`: `["No suspicious chest finding", "Possible suspicious chest finding"]`.
- `certified` is always `false`; `validation_status` is `"unvalidated"`.
- Wording is non-diagnostic — no "cancer", "diagnosis", "tumor", "malignant".
- ONNX is exported with **static** axes (the schema rejects dynamic dims).
- No image bytes leave the browser at runtime — this is build-time tooling only.
