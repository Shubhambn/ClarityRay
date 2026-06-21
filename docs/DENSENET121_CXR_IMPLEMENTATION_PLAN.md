# DenseNet121 CXR Suspicious-Finding Onboarding — Implementation Plan

> Status: **PLAN ONLY — not yet executed.** This document is the agreed plan of
> record for onboarding a TorchXRayVision DenseNet121 chest X-ray model into
> ClarityRay as a safe binary "suspicious finding" screening demo.
>
> Scope owner: runtime + converter + UI. Privacy invariant (no scan bytes leave
> the browser) is preserved end-to-end.

---

## 0. How to read this plan

The original task brief assumes the codebase is hardcoded for 3-channel
ImageNet/cancer-binary inference and needs broad rewrites. **That assumption is
mostly wrong.** After inspecting the repo, the runtime is already largely
spec-driven. This plan therefore separates:

- **ALREADY DONE** — capabilities that exist; do *not* rewrite, only verify.
- **REAL CHANGE** — concrete edits required for this model to load and run.
- **BLOCKER** — two issues the brief does not mention that *will* break the
  model at runtime if not fixed.
- **POLISH** — wording/UX improvements that are valuable but not load-bearing.

Doing only the REAL CHANGE + BLOCKER items produces a working model. POLISH
items satisfy the full acceptance criteria.

---

## 1. Current-state findings (ground truth from the code)

### Runtime is already channel-generic — ALREADY DONE
- [lib/clarity/preprocess.ts](../lib/clarity/preprocess.ts) already reads
  `[batch, channels, height, width]` from `spec.input.shape`, supports
  `channels === 1` (grayscale via BT.601 luma) and `channels === 3` (RGB),
  validates `mean.length === channels` and `std.length === channels`, and
  writes NCHW. **No hardcoded 224 and no hardcoded ImageNet.** A
  `{ "mean": [0.5], "std": [0.5] }` 1-channel spec already works.
- [lib/clarity/postprocess.ts](../lib/clarity/postprocess.ts) already reads
  `spec.output.classes`, applies `spec.output.activation` (softmax/sigmoid/none),
  uses class index 1 as the "finding" class, and applies `spec.thresholds`.
  Class labels are **not** hardcoded — they come from `clarity.json`.
- [hooks/useClarityRay.ts](../hooks/useClarityRay.ts) is the spec-driven state
  machine: manifest → spec → download → integrity (SHA-256) → worker session →
  preprocess → inference → postprocess. Inference runs in
  [workers/inference.worker.ts](../workers/inference.worker.ts) via
  ONNX Runtime Web. No image bytes touch the network.
- [components/analysis/SystemPanel.tsx](../components/analysis/SystemPanel.tsx)
  is already persona-aware: researcher sees probability bars + thresholds +
  metadata; doctor sees interpretation; **patient does NOT see raw
  probabilities** (only plain language + disclaimer).
- [clarity-schema.json](../clarity-schema.json) already allows 1-channel
  (`shape` is a generic positive-int array), binary `[1,2]` output, the three
  safety tiers, and enforces `certified: const false`.

### Two real blockers the brief omits

#### BLOCKER A — ONNX input/output node names won't match
- The worker calls `session.run({ [inputName]: tensor })` with `inputName`
  defaulting to `'input'` and `outputName` to `'output'`
  ([lib/clarity/run.ts:135-136](../lib/clarity/run.ts#L135-L136),
  [workers/inference.worker.ts:53-56](../workers/inference.worker.ts#L53-L56)).
- The brief requires the exported model use input name `xray` and output
  `logits`. ONNX Runtime throws if the feed key doesn't match the graph input
  name. The output side is tolerant (falls back to first output key) but the
  **input side is not** — `session.run({ input: ... })` against a graph whose
  input is `xray` will fail.
- There is **no way to declare the input name in `clarity.json` today**:
  `validateSpec` restricts `spec.model` to exactly `["file","format"]`
  ([lib/clarity/types.ts:233](../lib/clarity/types.ts#L233)) and the schema sets
  `additionalProperties: false` on `model`. So a custom input name is currently
  unrepresentable and unroutable.

  **Decision (recommended): make the runtime resolve node names from the
  session itself.** ONNX Runtime Web sessions expose `session.inputNames` and
  `session.outputNames`. Using `session.inputNames[0]` / `session.outputNames[0]`
  is the truly spec-driven, model-agnostic fix and requires no schema/type
  change. (Alternative: export the ONNX with input name `input`/output `output`
  to match current defaults — simpler but ignores the brief's `xray`/`logits`
  requirement and stays fragile for future models.)

#### BLOCKER B — `/models` browser shows nothing in degraded mode
- The `/models` page calls `fetchModels()` →
  [lib/api/client.ts:305](../lib/api/client.ts#L305) → FastAPI `GET /models` →
  [api/routes/models.py:101](../api/routes/models.py#L101) →
  `_get_models_from_db`, which **requires Supabase**. With no Supabase the
  endpoint returns 503 and the page renders "Backend API is offline / Failed to
  load models". So without a database the new model will *not* appear in
  `/models`, violating acceptance criteria ("`/models` shows the demo" + "make
  sure this model can still be tested locally").
- Note: the **analysis** path does NOT depend on Supabase — it uses the
  manifest fallback ([app/api/models/manifest/route.ts](../app/api/models/manifest/route.ts)
  → static [public/models/manifest.json](../public/models/manifest.json)). So
  `/analysis` can run the model from a manifest entry even while `/models` is
  empty. The fix below closes the `/models` gap for local/degraded use.

### Other accurate facts
- The CLI only implements one command: `clarityray upload`
  ([converter/clarityray/cli.py:105](../converter/clarityray/cli.py#L105)).
  The README/brief mention `clarity init/push/convert/validate/inspect` — those
  **do not exist**. Plan treats them as future work, not preconditions.
- `converter/clarityray/spec.py` infers 1-channel normalization as
  `mean:[0.0], std:[1.0]` ([spec.py:60-66](../converter/clarityray/spec.py#L60-L66)),
  not `[0.5]/[0.5]`. Fine for generated specs; our model ships a hand-authored
  spec so this only matters if we later regenerate via CLI.
- `validateSpec` rejects unknown top-level keys, so **adding `source_model`**
  (brief §3) requires editing both
  [lib/clarity/types.ts:383-400](../lib/clarity/types.ts#L383-L400) and
  [clarity-schema.json](../clarity-schema.json), or the spec won't validate and
  the model won't load. This is a REAL CHANGE if we keep `source_model`.

---

## 2. Design decisions

1. **Wrap, don't reinterpret.** TorchXRayVision `densenet121-res224-all` is an
   18-pathology multi-label sigmoid model with 1-channel `224×224` input
   normalized to roughly `[-1024, 1024]` Houndsfield-like scaling via
   `xrv.datasets.normalize`. We wrap it in a small `nn.Module` that:
   - selects the indices of available suspicious pathologies
     (`Mass`, `Nodule`, `Lung Opacity`, `Lung Lesion`, `Opacity`) from
     `model.pathologies`,
   - takes `suspicious_logit = max(selected pathology logits)`,
   - sets `no_finding_logit = 0`,
   - returns `stack([no_finding_logit, suspicious_logit])` shaped `[1, 2]`.
   Softmax over `[0, suspicious_logit]` keeps the runtime's binary/softmax
   contract intact, so **no postprocess special-casing is needed**.

2. **Input contract for the browser.** Spec declares `[1,1,224,224]`, layout
   `NCHW`, `normalize: { mean:[0.5], std:[0.5] }`. The browser preprocessor maps
   pixels to `[0,1]` then `(x-0.5)/0.5 → [-1,1]`. This is an intentional,
   documented approximation of TorchXRayVision's native scaling — it is *not*
   the exact training normalization. This is recorded as an explicit
   unvalidated assumption (see §9). The ONNX wrapper must therefore be exported
   to **expect `[-1,1]`-style input**, i.e. bake the normalization expectation
   into how we validate the wrapper, or accept that absolute thresholds are
   demo-only. We choose: wrapper consumes the tensor as-is and we mark the model
   `validation_status: "unvalidated"`, thresholds are illustrative.

3. **Runtime stays model-agnostic.** Fix BLOCKER A by resolving node names from
   the session, not by hardcoding `xray`/`logits` anywhere in TS.

4. **Safety wording is non-negotiable.** No "cancer", no "diagnosis", no
   "detected disease". Positive class label is exactly
   `"Possible suspicious chest finding"`; negative is
   `"No suspicious chest finding"`.

---

## 3. File-by-file change list

### A. New: export + test scripts
| File | Action | Notes |
|---|---|---|
| `scripts/export_densenet121_cxr_suspicious.py` | **create** | Load TorchXRayVision DenseNet121, select suspicious pathologies, wrap → `[1,2]`, export ONNX opset 17 (input `xray`, output `logits`), `onnx.checker`, ORT smoke test, SHA-256, write `model.onnx` + `clarity.json` into `public/models/densenet121-cxr-suspicious/`. |
| `scripts/test_onnx.py` | **create** | Load the exported ONNX with onnxruntime, feed zeros `[1,1,224,224]`, assert output shape `[1,2]` and finite values. |

### B. New model artifacts
| File | Action | Notes |
|---|---|---|
| `public/models/densenet121-cxr-suspicious/model.onnx` | **generate** | Produced by export script. |
| `public/models/densenet121-cxr-suspicious/clarity.json` | **generate** | Spec from §4; SHA-256 filled by script. |

### C. Runtime (TypeScript) — BLOCKER A fix + optional source_model
| File | Action | Notes |
|---|---|---|
| [workers/inference.worker.ts](../workers/inference.worker.ts) | **edit** | On `RUN_INFERENCE`, prefer `session.inputNames[0]` over the passed `inputName` when the passed name isn't in `session.inputNames`; same for outputs via `session.outputNames[0]`. Keeps existing behavior when names already match. |
| [lib/clarity/run.ts](../lib/clarity/run.ts) | **edit** | Mirror the same resolution in the main-thread fallback (`runInferenceMainThread`). |
| [lib/clarity/types.ts](../lib/clarity/types.ts) | **edit (only if keeping `source_model`)** | Add optional `source_model` to allowed top-level keys + a parser; export `ClaritySourceModelSpec`. |
| [clarity-schema.json](../clarity-schema.json) | **edit (only if keeping `source_model`)** | Add optional `source_model` object (`family`, `source`, `selected_findings[]`). Do not make it required. |

> If we decide `source_model` is not worth the schema churn, drop it from the
> spec in §4 and skip the two edits above. The model loads fine without it.

### D. Manifest + degraded-mode `/models` — BLOCKER B fix
| File | Action | Notes |
|---|---|---|
| [public/models/manifest.json](../public/models/manifest.json) | **edit** | Add a `densenet121-cxr-suspicious` entry under `models`. Keep `current_model` as-is (or switch default — see §7). Enables `/analysis` selection. |
| [app/api/models/route.ts](../app/api/models/route.ts) | **edit** | Add a static fallback: when `NEXT_PUBLIC_API_URL` is unset or the upstream `/models` fetch fails/returns 503, build a `ModelsResponse` from `public/models/manifest.json` + each model's `clarity.json` (read server-side via `fs`), so `/models` lists local models without Supabase. |
| [app/api/models/[slug]/route.ts](../app/api/models/[slug]/route.ts) | **edit** | Same static fallback for the detail endpoint (read the one `clarity.json`). |
| [lib/api/client.ts](../lib/api/client.ts) | **edit** | Point `fetchModels`/`fetchModelBySlug` at the same-origin `/api/models*` routes (which now have the fallback) instead of `API_BASE` directly — or have those routes proxy. Goal: one code path that degrades gracefully. |

> Smaller alternative if we don't want to touch the client: seed Supabase
> (`api/seed.py`) and run with a DB. But acceptance explicitly wants local/
> degraded operation, so the static fallback is the recommended route.

### E. Safety wording / persona polish — POLISH
| File | Action | Notes |
|---|---|---|
| [lib/clarity/postprocess.ts](../lib/clarity/postprocess.ts) | **edit** | `low_confidence` branch `primaryFinding` → `"Low-confidence suspicious pattern"`; ensure positive/negative primaryFinding come from `classes[1]`/`classes[0]` (already do). Optionally add the `technical` object to `SafeResult` (brief §8) — additive, keep `classProbabilities` for back-compat with SystemPanel. |
| [components/analysis/SystemPanel.tsx](../components/analysis/SystemPanel.tsx) | **edit** | Researcher block: surface channel mode (grayscale/RGB from `inputShape[1]`), activation from spec, and `source_model` if present. Patient block already hides probabilities — only refine wording to "Please show this result to a qualified clinician or radiologist." |
| [components/ConsentModal.tsx](../components/ConsentModal.tsx) | **edit** | Add "unvalidated / research demo" line; keep "runs locally, nothing uploaded". |
| [components/models/ModelCard.tsx](../components/models/ModelCard.tsx) | **edit** | Add `Research demo` / `Screening only` / `Not diagnostic` badges; show input mode (Grayscale 224×224) when derivable. |
| [app/models/[slug]/page.tsx](../app/models/[slug]/page.tsx) | **edit** | Add "What it does / What it does NOT do / Input requirements / Output interpretation / Safety" sections with non-diagnostic copy. |
| [app/onboarding/page.tsx](../app/onboarding/page.tsx) | **edit** | Persona explanations + a safety-acknowledgement step. |

### F. Converter guardrails — POLISH
| File | Action | Notes |
|---|---|---|
| [converter/clarityray/validate.py](../converter/clarityray/validate.py) | **edit** | Warn (not fail) when class labels contain `cancer`/`diagnos`/`malignant`/`tumor`; validate `mean.length == channels`; confirm output size `2` for binary; confirm `certified is False`. |
| [converter/clarityray/cli.py](../converter/clarityray/cli.py) | **edit** | When `--classes "Normal,Lung Cancer"`-style input is detected, print a suggestion to use `No suspicious chest finding,Possible suspicious chest finding`. |
| [converter/clarityray/spec.py](../converter/clarityray/spec.py) | **edit (optional)** | 1-channel default normalization → `[0.5]/[0.5]` to match this model family. |

### G. Docs + tests
| File | Action | Notes |
|---|---|---|
| `docs/DENSENET121_CXR_ONBOARDING.md` | **create** | Operator guide (brief §16): why multi-label→binary, why `[1,1,224,224]`, export/test/seed/run steps, safety wording, limitations. |
| `docs/DENSENET121_CXR_IMPLEMENTATION_NOTES.md` | **create** | What changed, why wrapped, labels used, what's unvalidated, what can't be claimed, future work (native multi-label UI, Grad-CAM, threshold calibration). |
| [lib/clarity/__tests__/preprocess.test.ts](../lib/clarity/__tests__/preprocess.test.ts) | **edit** | Add 1-channel case: output length `1*1*224*224`; confirm 3-channel path still passes. |
| [lib/clarity/__tests__/types.test.ts](../lib/clarity/__tests__/types.test.ts) | **edit** | Validate the new spec (shape/channels/mean/std/classes; `source_model` if added). |
| README | **edit** | Add the new model to the model list + a pointer to the onboarding doc. Correct the CLI command list to reflect that only `clarityray upload` exists, or mark the others "planned". |

---

## 4. Target `clarity.json`

`public/models/densenet121-cxr-suspicious/clarity.json` (SHA-256 filled by the
export script). `source_model` is included **only if** §3.C edits land; otherwise
remove that block.

```json
{
  "id": "densenet121-cxr-suspicious",
  "name": "DenseNet121 CXR Suspicious Finding Demo",
  "version": "1.0.0",
  "certified": false,
  "bodypart": "chest",
  "modality": "xray",
  "model": { "file": "/models/densenet121-cxr-suspicious/model.onnx", "format": "onnx" },
  "integrity": { "sha256": "<computed-by-export-script>" },
  "input": {
    "shape": [1, 1, 224, 224],
    "layout": "NCHW",
    "normalize": { "mean": [0.5], "std": [0.5] }
  },
  "output": {
    "shape": [1, 2],
    "classes": ["No suspicious chest finding", "Possible suspicious chest finding"],
    "activation": "softmax"
  },
  "thresholds": { "possible_finding": 0.5, "low_confidence": 0.25, "validation_status": "unvalidated" },
  "safety": {
    "tier": "screening",
    "disclaimer": "This tool is for screening support only. It does not diagnose cancer or any disease. A possible finding requires clinician review. A no finding result does not rule out disease."
  },
  "source_model": {
    "family": "DenseNet121",
    "source": "TorchXRayVision densenet121-res224-all",
    "selected_findings": ["Mass", "Nodule", "Lung Opacity", "Lung Lesion", "Opacity"]
  }
}
```

---

## 5. Export script design (`scripts/export_densenet121_cxr_suspicious.py`)

```text
1. import torch, torchxrayvision as xrv, onnx, onnxruntime, numpy, hashlib, json
2. load model:
     try:    model = xrv.models.get_model("densenet121-res224-all", from_hf_hub=True)
     except: model = xrv.models.DenseNet(weights="densenet121-res224-all")
   model.eval()
3. SUSPICIOUS = ["Mass","Nodule","Lung Opacity","Lung Lesion","Opacity"]
   idx = [i for i,p in enumerate(model.pathologies) if p in SUSPICIOUS]
   assert idx, "no suspicious pathologies available in this checkpoint"
4. class SuspiciousWrapper(nn.Module):
       forward(x):
         logits = base(x)                      # [N, P]
         suspicious = logits[:, idx].max(dim=1).values    # [N]
         no_finding = torch.zeros_like(suspicious)        # [N]
         return torch.stack([no_finding, suspicious], 1)  # [N, 2]
5. dummy = torch.zeros(1,1,224,224)
   torch.onnx.export(wrapper, dummy, out_path, opset_version=17,
       input_names=["xray"], output_names=["logits"],
       dynamic_axes=None)   # static [1,1,224,224] / [1,2] to satisfy spec.py + schema
6. onnx.checker.check_model(out_path)
7. sess = onnxruntime.InferenceSession(out_path)
   out = sess.run(None, {"xray": dummy.numpy()})
   assert out[0].shape == (1,2)
8. sha = sha256(model.onnx)
9. write clarity.json (§4) with integrity.sha256 = sha and selected_findings = [pathologies actually used]
10. print summary (pathologies selected, shapes, sha, output paths)
```

Key correctness points:
- Export with **static** axes so `spec.py::_read_tensor_shape` and the JSON
  schema (`integer minimum 1`) accept the shapes (they reject dynamic dims).
- `selected_findings` written from the *actual* matched pathologies, not the
  wishlist — some checkpoints lack `Lung Lesion`/`Opacity`.

---

## 6. End-to-end data flow (after changes)

```
export script ─► public/models/densenet121-cxr-suspicious/{model.onnx, clarity.json}
                      │
manifest.json (+entry)│
                      ▼
/models  ──(static fallback or Supabase)──► ModelCard ──► /models/[slug] ──► "Use for Analysis"
   sets localStorage clarityray_selected_model = densenet121-cxr-suspicious
                      ▼
/analysis ─► useClarityRay: fetchManifest → fetchSpec(clarity.json) → validateSpec
          → loadModel (download + SHA-256) → loadModelInWorker (ORT session)
          → preprocessImage (1-channel grayscale, (x-0.5)/0.5, NCHW [1,1,224,224])
          → runInference (worker; node names resolved from session)
          → postprocess (softmax over [0, suspicious_logit]; threshold → SafeResult)
          → SystemPanel (persona-specific; patient = no raw probabilities)

Image bytes never leave the browser. Backend serves metadata only.
```

---

## 7. Open decisions to confirm before building

1. **Keep `source_model` in the spec?** Yes → 2 extra edits (types + schema).
   No → simpler, drop the block. *Recommendation: keep it (researcher value),
   it's a small additive schema change.*
2. **Default model.** Leave `current_model: densenet121-chest` (existing demo)
   or switch the manifest default to the new CXR model? *Recommendation: leave
   default; the new model is selectable via `/models`.*
3. **Node-name fix approach.** Resolve from session (recommended) vs. export
   ONNX with `input`/`output` names. *Recommendation: resolve from session — one
   fix covers all future models.*
4. **`/models` degraded fix.** Static fallback in the Next API routes
   (recommended) vs. require Supabase + seed. *Recommendation: static fallback.*

---

## 8. Execution order (phased)

- **Phase 1 — Model artifact (REAL CHANGE):** export script + `clarity.json` +
  `test_onnx.py`. Verify ONNX `[1,2]`. No app changes yet.
- **Phase 2 — Runtime load (BLOCKER A):** node-name resolution in worker +
  fallback. Add manifest entry. Verify `/analysis` runs the model end-to-end
  (it works even before the `/models` fix).
- **Phase 3 — Discoverability (BLOCKER B):** static fallback for `/models` and
  `/models/[slug]`. Verify the card appears and detail page loads with no DB.
- **Phase 4 — Spec extras (REAL CHANGE, conditional):** `source_model` in types
  + schema, if keeping it.
- **Phase 5 — Safety/UX polish (POLISH):** postprocess wording, SystemPanel
  researcher fields, ConsentModal, ModelCard badges, detail page sections,
  onboarding ack step.
- **Phase 6 — Converter guardrails (POLISH):** cancer-wording warnings, channel
  mean/std validation.
- **Phase 7 — Tests + docs:** preprocess/types tests, onboarding doc, impl
  notes, README.
- **Phase 8 — Gates:** `npx tsc --noEmit`, `npm run lint`, `npm run test` (vitest),
  `npm run build`.

---

## 9. Assumptions & unvalidated items (must be recorded in impl notes)

- **Normalization is approximate.** `(x-0.5)/0.5` in the browser is NOT
  TorchXRayVision's native `xrv.datasets.normalize` scaling. Absolute
  probabilities/thresholds are therefore **demo-grade only**;
  `validation_status: "unvalidated"`. Future: replicate native normalization in
  the preprocessor or bake it into the ONNX graph.
- **`max` aggregation** of selected pathology logits is a simple, explainable
  combiner, not a calibrated suspicious-finding score. No clinical meaning.
- **Checkpoint variance.** Available pathologies depend on the downloaded
  weights; the script writes the actually-matched labels.
- **Cannot be claimed:** cancer detection, diagnosis, malignancy, ruling out
  disease, certified-device status.
- **`certified` stays `false`** (schema `const` + `validateSpec` + converter
  check all enforce this).

---

## 10. Commands (run after implementation)

```bash
# 1) model export + test
pip install torch torchvision torchxrayvision onnx onnxruntime numpy huggingface_hub
python scripts/export_densenet121_cxr_suspicious.py
python scripts/test_onnx.py

# 2) (optional) seed Supabase if running with a DB
cd api && python seed.py && cd ..

# 3) run
cd api && uvicorn main:app --reload   # terminal 1 (optional in degraded mode)
npm run dev                            # terminal 2

# 4) gates
npx tsc --noEmit
npm run lint
npm run test
npm run build
```

---

## 11. Acceptance criteria mapping

| Criterion | Satisfied by |
|---|---|
| `model.onnx` + `clarity.json` in `public/models/densenet121-cxr-suspicious/` | Phase 1 |
| ONNX output `[1,2]` | `test_onnx.py` (Phase 1) |
| Input `[1,1,224,224]` | spec §4 + export static axes |
| Preprocess supports 1ch + 3ch | ALREADY DONE (verify in Phase 7 test) |
| `/models` shows the demo (local) | Phase 3 static fallback |
| Detail page non-diagnostic wording | Phase 5 |
| `/onboarding` explains personas | Phase 5 |
| `/analysis` runs locally | Phase 2 |
| Image never uploaded | invariant preserved (worker, no network in §6) |
| No "Cancer detected"; positive = "Possible suspicious chest finding" | spec classes + postprocess wording |
| Patient hides raw probabilities | ALREADY DONE (verify) |
| Researcher sees technicals | ALREADY DONE + Phase 5 additions |
| `npx tsc --noEmit` / `npm run build` pass | Phase 8 |

---

## 12. Invariants honored (no regressions)

- No scan bytes to any server; no inference in FastAPI.
- No model labels hardcoded outside `clarity.json`.
- No hardcoded 3-channel preprocessing (channel count read from spec).
- `certified` never `true`.
- COOP/COEP headers in `next.config.ts` untouched.
- In-browser caching (Cache API + IndexedDB) and worker inference untouched.
- `utils/api` upload utilities never imported into the analysis path.
```
