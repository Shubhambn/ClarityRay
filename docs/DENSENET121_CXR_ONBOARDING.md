# CXR Suspicious-Finding Models — Operator Guide

How to export, verify, and run the chest X-ray "suspicious finding" screening
demos in ClarityRay. The pipeline is **generic across model families**
(DenseNet121, ResNet50, …); DenseNet121 is the flagship/default. Adding a new
family is a registry entry — see [../scripts/README.md](../scripts/README.md).

> Privacy invariant: image bytes never leave the browser. The export tooling
> here is build-time only; inference runs in-browser via ONNX Runtime Web.

## Why multi-label → binary

TorchXRayVision checkpoints (e.g. `densenet121-res224-all`) are 18-pathology
multi-label sigmoid models with 1-channel `224×224` input. ClarityRay's runtime
expects a binary `[1,2]` screening contract. The exporter wraps the base model:

```
suspicious_logit = max(selected pathology logits)   # Mass, Nodule, Lung Opacity, …
no_finding_logit = 0
out = stack([no_finding_logit, suspicious_logit])   # [N, 2]
```

Softmax over `[0, suspicious_logit]` preserves the runtime's binary/softmax
contract, so no postprocess special-casing is needed. `max` is a simple,
explainable combiner — **not** a calibrated clinical score.

## Why `[1,1,224,224]` grayscale

Chest X-rays are single-channel. The spec declares `[1,1,224,224]`, layout
`NCHW`, `normalize: { mean:[0.5], std:[0.5] }`. The browser preprocessor maps
pixels to `[0,1]` then `(x-0.5)/0.5 → [-1,1]`. This is a **documented
approximation** of TorchXRayVision's native normalization — absolute thresholds
are therefore demo-grade, and every model ships `validation_status: "unvalidated"`.

## Steps

### 1. Install

```bash
pip install torch torchvision torchxrayvision onnx onnxscript onnxruntime numpy jsonschema huggingface_hub
```

> `onnxscript` is required by the ONNX exporter in torch ≥ 2.9.

### 2. Export

```bash
python scripts/export_cxr_suspicious.py --list            # list registered models
python scripts/export_cxr_suspicious.py                   # export the default (densenet121)
python scripts/export_cxr_suspicious.py --model resnet50-cxr-suspicious
python scripts/export_cxr_suspicious.py --all             # export everything registered
```

Each run writes `public/models/<slug>/model.onnx` + `clarity.json` (with a
computed SHA-256, a `source_model` provenance block, and the *actually matched*
pathologies for that checkpoint).

### 3. Verify

```bash
python scripts/test_onnx.py                               # verify all exported models
python scripts/test_onnx.py densenet121-cxr-suspicious    # verify one
```

Asserts output shape `[1,2]`, finite values, and that the on-disk SHA-256 still
matches `clarity.json`.

### 4. (Optional) seed Supabase

Only if running with a database. The app also works fully in degraded/local mode
without one — the Next API routes fall back to the on-disk catalog.

```bash
cd api && python seed.py && cd ..
```

### 5. Run

```bash
cd api && uvicorn main:app --reload   # terminal 1 (optional in degraded mode)
npm run dev                            # terminal 2
```

- `/models` — the model appears via Supabase or the on-disk static fallback.
- `/models/<slug>` — detail page with non-diagnostic "About this model" sections.
- `/analysis` — select the model, upload a chest X-ray, run in-browser. The
  runtime resolves ONNX node names from the session, so the `xray`/`logits`
  graph loads without any hardcoded names.

## Safety wording (non-negotiable)

- Positive class is exactly `"Possible suspicious chest finding"`;
  negative is `"No suspicious chest finding"`.
- No "cancer", "diagnosis", "malignant", "tumor" anywhere in labels.
- `certified` is always `false`.
- Patient persona never sees raw probabilities.

## Limitations

- Normalization is approximate (see above); thresholds are illustrative.
- `max` aggregation has no clinical calibration.
- Available pathologies depend on the downloaded checkpoint — the script records
  the labels actually used.
- **Cannot be claimed:** cancer detection, diagnosis, ruling out disease,
  certified-device status.

See [DENSENET121_CXR_IMPLEMENTATION_NOTES.md](DENSENET121_CXR_IMPLEMENTATION_NOTES.md)
for what changed in the codebase and why.
