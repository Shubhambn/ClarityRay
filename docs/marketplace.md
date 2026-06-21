# ClarityRay — Model Marketplace Plan

**Status:** Proposed
**Owner:** TBD
**Last updated:** 2026-06-21

> Goal (confirmed): ClarityRay is a **true, model-agnostic marketplace for
> medical AI models** — a "Play Store for medical models." A model author
> publishes a model and the platform runs it **faithfully** (as the author built
> it) and shows its **real outputs**. The platform must not silently rewrite,
> collapse, or misread a model.

---

## 1. Problem: what's wrong today

The platform looks like a marketplace (a `/models` catalog, publishing flow,
per-model `clarity.json`) but the **inference engine can only run one shape of
model**: a binary `[no_finding, finding]` chest-X-ray screener. Anything richer
is either mangled or discarded.

### 1.1 Binary-only assumptions are hardcoded end-to-end

| Layer | File | Assumption baked in |
|---|---|---|
| Spec | [lib/clarity/types.ts](../lib/clarity/types.ts) (`ClarityOutputSpec`) | `output` has only `classes` + `activation`; no notion of *task type*. |
| Runtime | [lib/clarity/postprocess.ts](../lib/clarity/postprocess.ts) (`translateResults`) | Reads `probabilities[1]` as "the finding" and `probabilities[0]` as "normal". A real 18-label model shows label #1 and **throws away the other 17**. |
| Thresholds | [lib/clarity/types.ts](../lib/clarity/types.ts) (`ClarityThresholdsSpec`) | Single `possible_finding` / `low_confidence` — assumes one score. |
| Export | [scripts/export_cxr_suspicious.py](../scripts/export_cxr_suspicious.py) | Exists *only* to crush multi-label models into the binary shape via a hand-picked finding list + `max()`. |
| Schema | [clarity-schema.json](../clarity-schema.json) | Encodes the binary contract as the only valid shape. |
| UI | [app/analysis/page.tsx](../app/analysis/page.tsx) | Renders a single "finding / no finding" result. |

### 1.2 The double-activation scoring bug (fixed, but symptomatic)

TorchXRayVision models apply sigmoid internally — `model(x)` returns
**probabilities** in `[0, 1]`, not logits. The wrapper treated them as logits,
built `[0, p]`, and the runtime applied **softmax again**:

```
softmax([0, p])[1] = sigmoid(p)   →   p∈[0,1] maps to [0.50, 0.73]
```

So every scan returned "possible suspicious finding" at ~50–73% regardless of
the image (100% false-positive rate). Fixed in
[scripts/export_cxr_suspicious.py](../scripts/export_cxr_suspicious.py) by
converting the probability back to a true logit before stacking. **This bug was
a symptom of the deeper design flaw: the platform forces every model through one
narrow, lossy contract.**

### 1.3 Why this blocks the goal

A marketplace must host models with fundamentally different output contracts:

- **Binary** — finding / no finding (current).
- **Multi-label** — N independent findings, each with its own probability
  (most real CXR models, e.g. TorchXRayVision's 18 pathologies).
- **Multi-class** — one label out of N mutually exclusive classes (argmax).
- **Regression / ordinal** — a continuous value or graded score (e.g. severity,
  bone age, cardiothoracic ratio).
- **Segmentation / detection** — pixel masks or bounding boxes (Phase 5).

Today only the first is possible. Everything else is unrepresentable or
silently wrong.

---

## 2. Design principle: faithful by default

The author declares **what their model is**; the platform **dispatches** on that
instead of assuming. Two rules:

1. **Faithful** — the platform renders the model's real output. No silent
   collapsing. Any reshaping (e.g. binary "suspicious" view of a multi-label
   model) is an **explicit, opt-in, labelled** transform, never the default.
2. **Honest about validation** — every model carries its real calibration /
   validation status, surfaced in the UI. "Unvalidated research demo" must never
   look like a cleared diagnostic.

---

## 3. The keystone change: a `task` discriminator

Add a `task` field to the output spec. Everything else dispatches on it.

```jsonc
// clarity.json — output block (new)
"output": {
  "task": "multilabel",            // "binary" | "multilabel" | "multiclass" | "regression"
  "shape": [1, 18],
  "activation": "sigmoid",         // softmax | sigmoid | none
  "classes": ["Atelectasis", "Cardiomegaly", "Mass", "Nodule", ...],

  // per-task fields:
  "labels": {
  "Mass": {
    "threshold": 0.5,
    "suspicious": true
  },
  "Cardiomegaly": {
    "threshold": 0.5,
    "suspicious": false
  }},
  "units": null,                   // regression: e.g. "ratio", "years"
  "range": null                    // regression: [min, max]
}
```

Backward compatibility: a spec with no `task` defaults to `"binary"`, so the
existing `densenet121-chest` model and current `clarity.json` files keep working
unchanged.

---

## 4. Phased implementation

### Phase 1 — Spec + runtime become task-aware *(keystone, backward-compatible)*

**Spec / types**
- [x] Add `task` + per-task fields to `ClarityOutputSpec` in
  [lib/clarity/types.ts](../lib/clarity/types.ts); parse/validate them
  (reuse the existing `parse*` helpers and `checkNoExtraKeys`).
- [x] Make `thresholds` task-aware: keep `possible_finding`/`low_confidence` for
  binary; allow per-label thresholds for multilabel (in `output.labels`).
- [x] Update [clarity-schema.json](../clarity-schema.json) with a discriminated
  union on `task`; default to `binary` when absent.

**Runtime**
- [x] Split [lib/clarity/postprocess.ts](../lib/clarity/postprocess.ts) into
  per-task interpreters returning a common `SafeResult`:
  - `binary` → today's `translateResults` (unchanged behavior).
  - `multilabel` → report **every** label at/over its threshold, ranked by
    probability; aggregate safety tier from the highest-severity hit.
  - `multiclass` → argmax + full class distribution.
  - `regression` → raw value, units, optional range/severity banding.
- [x] `postprocess()` dispatches on `spec.output.task`.

**Tests**
- [x] Unit tests per task in
  [lib/clarity/__tests__/](../lib/clarity/__tests__/) (including the regression
  case that the old binary path discarded extra outputs).

**Exit criteria:** a real 18-label model is interpreted faithfully (all findings
surfaced); existing binary models behave exactly as before; `npm run test` green.

### Phase 2 — Export faithfully, stop rewrapping

- [x] Make passthrough the **default** in
  [scripts/export_cxr_suspicious.py](../scripts/export_cxr_suspicious.py):
  emit the model's native multi-label output + a `task: "multilabel"` spec
  listing all pathologies with per-label thresholds.
- [x] Keep the binary "suspicious" collapse as an **opt-in** variant
  (`--view binary`), clearly labelled as a derived view (written to
  `<slug>-binary/`), retaining the logit-correct math already fixed.
- [x] Update [scripts/test_onnx.py](../scripts/test_onnx.py) to verify output
  shape matches the declared `task`.

**Exit criteria:** re-exporting `densenet121-cxr-suspicious` /
`resnet50-cxr-suspicious` yields faithful multi-label models; the binary view is
reproducible on demand. ✅ Both re-exported as 18-label models (18 distinct
probabilities surfaced, none collapsed); `densenet121-cxr-suspicious-binary`
regenerates the binary view on demand; `test_onnx.py` passes 4/4.

### Phase 3 — UI renders per task

- [x] [app/analysis/page.tsx](../app/analysis/page.tsx) and result components
  ([components/analysis/SystemPanel.tsx](../components/analysis/SystemPanel.tsx))
  branch on `task`:
  - multilabel → ranked `FindingsList` with per-finding confidence (suspicious
    hits colour-coded);
  - multiclass → top class + full distribution bars;
  - regression → `RegressionReadout` (raw value + units + range gauge).
- [x] Persona gating preserved (Researcher sees raw numbers / raw outputs;
  Patient sees plain language; Clinician sees interpretation).
- [x] Source-model / provenance panel generalized: shows task, output count, and
  the curated subset (relabelled from `selected_findings`) when present.

**Exit criteria:** each task type has a faithful, persona-appropriate view. ✅
`result.task` drives the result card and per-persona detail views; binary is
unchanged (defaults when `task` absent). `tsc`, ESLint, and `npm run test`
(109 tests) all green.

### Phase 4 — Marketplace integrity & discovery

- [x] Surface real validation/calibration status per model in `/models` (card)
  and the detail page; `unvalidated` is an unmistakable red **⚠ UNVALIDATED**
  badge + banner. Replaced `ModelCard`'s URL-string-sniffing with real
  `safety_tier` / `validation_status` / `task` from the spec.
- [x] Make `/models` filterable by `task`, `modality`, `bodypart`, validation
  status — in the on-disk fallback
  ([lib/server/staticModels.ts](../lib/server/staticModels.ts)) and the FastAPI
  route ([api/routes/models.py](../api/routes/models.py) +
  [api/main.py](../api/main.py), with migration
  [005_model_task_validation.sql](../supabase/migrations/005_model_task_validation.sql)).
- [x] Document the publishing contract for external authors
  ([docs/publishing.md](publishing.md)) — what a valid `clarity.json` must
  declare per task.

**Exit criteria:** an external author can publish a non-binary model and have it
listed, run, and rendered faithfully without code changes. ✅ Dropping a
`task: "multilabel"` model under `public/models/<slug>/` (+ manifest entry) makes
it appear in `/models` with the right task/validation badges, filterable by task,
runnable in-browser, and rendered via the Phase 3 per-task views — no code
changes. `tsc`, ESLint, `npm run test` (109), and `py_compile` all green.

### Phase 5 — Spatial tasks: segmentation & detection

- [x] Extend the `task` enum + spec with `segmentation` and `detection`, their
  per-task output config (`mask`, `detection`), parsing/validation in
  [lib/clarity/types.ts](../lib/clarity/types.ts), and the discriminated union
  in [clarity-schema.json](../clarity-schema.json).
- [x] Add per-task interpreters in
  [lib/clarity/postprocess.ts](../lib/clarity/postprocess.ts):
  - `segmentation` → per-pixel label map (argmax for softmax; highest
    over-threshold channel otherwise) + per-class pixel coverage; no channel
    discarded.
  - `detection` → fixed `[1, N, K]` boxes, padding rows dropped, coords
    normalized (`xyxy`/`xywh`/`cxcywh`, pixel/normalized), ranked by score.
- [x] Unit tests for both interpreters and the new spec parsing
  ([lib/clarity/__tests__/](../lib/clarity/__tests__/)).
- [x] UI: faithful scan overlay
  ([components/analysis/ResultOverlay.tsx](../components/analysis/ResultOverlay.tsx))
  — colour-coded mask / labelled boxes drawn on the scan, with a Show
  Original/Show Result toggle — plus per-task panels (coverage list / detection
  list) in [SystemPanel.tsx](../components/analysis/SystemPanel.tsx), persona-gated.
- [x] Document the segmentation/detection contract in
  [docs/publishing.md](publishing.md).

**Exit criteria:** a published segmentation or detection model is interpreted
faithfully (every mask channel / box surfaced, nothing collapsed) and its real
spatial output is rendered over the scan, persona-appropriately. ✅ `tsc`,
ESLint (no new findings), `next build`, and `npm run test` (124) all green.
*Note:* no segmentation/detection model is bundled yet (no in-repo exporter, as
with multiclass/regression); the path is exercised by unit tests and activates
automatically when such a model is published.

---

## 5. Out of scope (for now)

- Server-side inference (privacy invariant stands: inference runs in-browser via
  ONNX Runtime Web; the backend serves metadata only).
- Model accuracy/clinical validation itself — the platform reports status, it
  does not certify models.
- A bundled segmentation/detection exporter — Phase 5 ships the spec, runtime,
  and rendering; an exporter would follow once a target checkpoint is chosen.

---

## 6. Risks & invariants

- **Safety-critical output contract.** Changes to `postprocess` directly affect
  what a clinician sees. Every task interpreter needs unit tests and explicit
  disclaimers; never let an unvalidated model render like a cleared device.
- **Backward compatibility.** `task` defaults to `binary`; existing
  `clarity.json` files and the bundled `densenet121-chest` model must keep
  working untouched through Phase 1.
- **Privacy invariant unchanged.** Scan pixels never leave the browser.
- **Faithfulness invariant.** The platform must not collapse or reinterpret a
  model's output except via an explicit, labelled, opt-in transform.

---

## 7. Suggested order of work

1. Phase 1 spec + runtime (keystone; unblocks everything, backward-compatible).
2. Phase 2 faithful export (produces the first real multi-label models).
3. Phase 3 UI (makes faithfulness visible to users).
4. Phase 4 integrity & discovery (makes it a real, browsable marketplace).
5. Phase 5 spatial tasks (segmentation & detection, rendered over the scan).
