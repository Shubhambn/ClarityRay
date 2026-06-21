# ClarityRay — Publishing Contract for Model Authors

**Audience:** external authors publishing a model to the ClarityRay marketplace.
**Last updated:** 2026-06-21

ClarityRay is model-agnostic: you declare **what your model is** and the platform
runs it **faithfully** and renders its **real outputs**. This document is the
contract — what a valid `clarity.json` must declare so your model is listed, run
in-browser, and rendered correctly **without any code changes** on our side.

Publishing a model = shipping two files under `public/models/<slug>/` (or via the
`/models/register` API):

- `model.onnx` — your model, exported to ONNX with **static** input/output shapes.
- `clarity.json` — the spec below. It is validated against
  [clarity-schema.json](../clarity-schema.json) at load time.

> **Privacy invariant:** inference runs entirely in the browser via ONNX Runtime
> Web. Scan pixels never leave the device; the backend serves metadata only.

---

## 1. The `task` discriminator

The `output.task` field tells the platform how to interpret your model. It is the
one field everything dispatches on. If omitted, it defaults to `"binary"`.

| `task` | Output | Activation | Rendered as |
|---|---|---|---|
| `binary` | `[no_finding, finding]` (2 values) | `softmax` | finding / no-finding verdict |
| `multilabel` | N independent probabilities | `sigmoid` or `none`* | ranked findings list |
| `multiclass` | 1-of-N mutually exclusive | `softmax` | top class + distribution |
| `regression` | continuous value(s) | `none` | value + units + range gauge |

\* If your ONNX graph already applies sigmoid and emits probabilities in `[0, 1]`,
declare `activation: "none"` so the runtime does **not** squash them again. Only
declare `sigmoid`/`softmax` when the graph emits raw logits.

---

## 2. Required top-level fields (every task)

```jsonc
{
  "id": "my-model-slug",          // matches the directory name
  "name": "Human-Readable Name",
  "version": "1.0.0",             // semver
  "certified": false,             // must be false (the platform certifies nothing)
  "bodypart": "chest",
  "modality": "xray",
  "model":   { "file": "/models/my-model-slug/model.onnx", "format": "onnx" },
  "integrity": { "sha256": "<64-hex sha256 of model.onnx>" },
  "input": {
    "shape": [1, 1, 224, 224],    // static NCHW, batch = 1
    "layout": "NCHW",
    "normalize": { "mean": [0.5], "std": [0.5] }
  },
  "output":  { /* per-task, see §3 */ },
  "safety":  { "tier": "screening", "disclaimer": "..." },
  "thresholds": { "validation_status": "unvalidated", /* + per §3 */ }
}
```

- **`safety.tier`** — one of `screening` | `research` | `investigational`.
- **`thresholds.validation_status`** — one of `unvalidated` | `validated`.
  Be honest: an `unvalidated` model is shown as an unmistakable **⚠ UNVALIDATED**
  research demo across `/models`, the detail page, and the analysis view. Do not
  claim `validated` without real calibration/validation evidence.

---

## 3. Per-task `output` and `thresholds`

### binary (default)
```jsonc
"output": { "task": "binary", "classes": ["No finding", "Finding"], "activation": "softmax" },
"thresholds": { "possible_finding": 0.5, "low_confidence": 0.25, "validation_status": "unvalidated" }
```
`possible_finding` and `low_confidence` are **required** for binary.

### multilabel
```jsonc
"output": {
  "task": "multilabel",
  "shape": [1, 18],
  "activation": "none",            // graph already emits probabilities
  "classes": ["Atelectasis", "Cardiomegaly", "Mass", ...],   // all N labels
  "labels": [                      // per-label metadata; sparse, keyed by name
    { "name": "Mass",        "threshold": 0.5, "suspicious": true },
    { "name": "Cardiomegaly","threshold": 0.5, "suspicious": true }
  ]
},
"thresholds": { "validation_status": "unvalidated" }   // global thresholds optional
```
- Every label `name` must appear in `output.classes`.
- A label over its `threshold` is reported; `suspicious: true` raises the safety
  tier. Labels you omit from `labels` default to `threshold` = global
  `possible_finding` (or 0.5) and `suspicious: true`.

### multiclass
```jsonc
"output": {
  "task": "multiclass",
  "activation": "softmax",
  "classes": ["Normal", "Bacterial", "Viral"],
  "labels": [ { "name": "Normal", "suspicious": false } ]   // mark benign classes
}
```
The argmax class is the result; classes you mark `suspicious: false` read as
no-finding even when they win.

### regression
```jsonc
"output": {
  "task": "regression",
  "activation": "none",
  "classes": ["Cardiothoracic ratio"],   // one name per regressed quantity
  "units": "ratio",
  "range": [0.0, 1.0],
  "bands": [                              // optional severity banding
    { "max": 0.5,  "tier": "no_finding",       "label": "Normal" },
    { "min": 0.5,  "tier": "possible_finding",  "label": "Enlarged" }
  ]
}
```
The first band whose `[min, max]` window contains the value wins.

---

## 4. Validation before you publish

Run the bundled shape/contract check against your exported model:

```
python scripts/test_onnx.py <your-slug>
```

It verifies the ONNX output shape matches your declared `task` and `classes`,
that `multilabel` + `activation: "none"` already emits values in `[0, 1]`, and
that the recorded `sha256` matches the binary. A model that passes this and
validates against `clarity-schema.json` will be listed, run, and rendered
faithfully — no platform code changes required.
