# CXR Suspicious-Finding Onboarding — Implementation Notes

What changed in the codebase to onboard the chest X-ray suspicious-finding
screening demos, why, and what remains unvalidated. Built **generically** so the
same pipeline serves multiple model families, not only DenseNet121. Companion to
[DENSENET121_CXR_IMPLEMENTATION_PLAN.md](DENSENET121_CXR_IMPLEMENTATION_PLAN.md)
(the plan of record) and
[DENSENET121_CXR_ONBOARDING.md](DENSENET121_CXR_ONBOARDING.md) (operator guide).

## What changed, by phase

### Phase 1 — Model artifact (generic exporter)
- `scripts/export_cxr_suspicious.py` — registry-driven exporter. A shared
  pipeline (load → wrap multi-label→binary `[1,2]` → ONNX opset 17, input `xray`
  / output `logits` → `onnx.checker` → ORT smoke test → SHA-256 →
  schema-validated `clarity.json`) is driven by a `MODEL_REGISTRY` of declarative
  `ModelDef` entries. Generic over channels (1/3), input size (224/512/…),
  normalization, pathology selection, and safety tier. Registered:
  `densenet121-cxr-suspicious` (default) and `resnet50-cxr-suspicious`.
- `scripts/test_onnx.py` — model-agnostic verifier (shape `[1,2]`, finite,
  SHA-256 match) over any exported model directory.

### Phase 2 — Runtime load (node-name resolution)
- `workers/inference.worker.ts` and `lib/clarity/run.ts` resolve the ONNX
  input/output node names **from the session** (`session.inputNames` /
  `outputNames`), honoring the spec-provided name when it matches and otherwise
  falling back to the first graph name. This makes the runtime model-agnostic —
  the `xray`/`logits` graph loads with no hardcoded names — and is backward
  compatible with existing `input`/`output` models.
- `public/models/manifest.json` gained a `densenet121-cxr-suspicious` entry so
  `/analysis` can select it (the manifest fallback needs no backend).

### Phase 3 — Discoverability without a database
- `lib/server/staticModels.ts` (server-only) builds the `/models` and
  `/models/{slug}` JSON shapes from `public/models/manifest.json` + each
  `clarity.json` on disk. It only advertises models whose `clarity.json` exists,
  so the catalog stays consistent with what `/analysis` can run.
- `app/api/models/route.ts` and `app/api/models/[slug]/route.ts` fall back to the
  static catalog when no backend is configured or the upstream fails/returns 503.
- `lib/api/client.ts` now routes `fetchModels`/`fetchModelBySlug` through the
  same-origin `/api/models*` endpoints — one code path that degrades gracefully.

### Phase 4 — Spec provenance (`source_model`)
- `lib/clarity/types.ts` adds an optional, strict `source_model` block
  (`family`, `source`, optional `selected_findings[]`) and `clarity-schema.json`
  mirrors it. Generic: `selected_findings` is optional so non-pathology models
  fit. The exporter emits it from each `ModelDef`.

### Phase 5 — Safety / persona UX
- `lib/clarity/postprocess.ts` — low-confidence `primaryFinding` is now
  `"Low-confidence suspicious pattern"`; positive/negative findings already come
  from `classes[1]`/`classes[0]`.
- `hooks/useClarityRay.ts` — `ModelInfo` carries `activation` and optional
  `sourceModel`.
- `components/analysis/SystemPanel.tsx` — researcher view surfaces channel mode
  (grayscale/RGB from `inputShape[1]`), the spec activation, and a SOURCE MODEL
  block when present. Patient view refines the closing line to "Please show this
  result to a qualified clinician or radiologist." Patient still sees no raw
  probabilities.
- `components/ConsentModal.tsx` — adds an "unvalidated research demos" line.
- `components/models/ModelCard.tsx` — adds `NOT DIAGNOSTIC` (and `RESEARCH DEMO`
  for research-tier) badges.
- `app/models/[slug]/page.tsx` — adds non-diagnostic "What it does / What it does
  NOT do / Input requirements / Output interpretation / Safety" sections.

### Phase 6 — Converter guardrails (warnings, non-fatal)
- `converter/clarityray/validate.py` — warns on diagnostic wording in class
  labels (`cancer`/`diagnos`/`malignant`/`tumor`), on non-binary output, and on
  `mean`/`std` length not matching channel count.
- `converter/clarityray/cli.py` — suggests safe screening labels when diagnostic
  wording is detected, and echoes validation warnings.
- `converter/clarityray/spec.py` — 1-channel default normalization is now
  `[0.5]/[0.5]` to match the CXR family.

### Phase 7 — Tests & docs
- `lib/clarity/__tests__/preprocess.test.ts` — adds a 1-channel `224×224` case
  (length `50176`); 3-channel path still covered.
- `lib/clarity/__tests__/types.test.ts` — adds `source_model` accept/reject cases.
- README, this notes file, and the onboarding guide.

## Labels used

- `["No suspicious chest finding", "Possible suspicious chest finding"]`
- Selected source pathologies (when present in the checkpoint):
  `Mass`, `Nodule`, `Lung Opacity`, `Lung Lesion`, `Opacity`.

## What is unvalidated / cannot be claimed

- **Normalization** `(x-0.5)/0.5` is an approximation of TorchXRayVision's native
  scaling — absolute probabilities/thresholds are demo-grade only.
- **`max` aggregation** of pathology logits is explainable but uncalibrated.
- **Checkpoint variance** — available pathologies depend on the weights.
- **Cannot be claimed:** cancer detection, diagnosis, malignancy, ruling out
  disease, certified-device status. `certified` stays `false`.

## Future work

- Replicate native TorchXRayVision normalization in the preprocessor or bake it
  into the ONNX graph.
- Native multi-label UI instead of binary collapse.
- Grad-CAM / attribution and threshold calibration.
- Carry input mode + safety tier into `/models` summaries so `ModelCard` can show
  exact input geometry.
