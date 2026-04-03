## SECTION 1 — PROJECT IDENTITY

ClarityRay is a browser-based chest X-ray screening workflow where users upload an image and receive on-device AI findings with a heatmap and safety disclaimer.  
ClarityRay also operates as a model platform where researchers package ONNX models with `clarity.json`, validate them, and publish selectable models into a library.  
The invariant is that scan inference must run locally and scan image data must never be sent to a server.

## SECTION 2 — CURRENT BUILD STATE

### Phase 1 — Browser ONNX pipeline stabilised

Status: **IN PROGRESS**

Evidence:
- `hooks/useClarityRay.ts` runs model loading, preprocessing, inference, and result handling entirely in client code.
- `lib/clarity/preprocess.ts` builds browser image tensors using the `clarity.json` input shape and normalization.
- `lib/clarity/run.ts` uses `onnxruntime-web` and a client-side session cache.
- `lib/clarity/postprocess.ts` applies output activation and validates probability ranges.
- `components/UploadZone.tsx`, `components/ResultsPanel.tsx`, and `components/GradCAMViewer.tsx` implement upload-to-display UI.
- `app/analysis/page.tsx` includes explicit local-analysis status text and no image-upload API usage for inference.

Remaining:
- `next.config.ts` does not currently set COOP/COEP headers required for optimal SharedArrayBuffer paths.
- Browser capability fallback behavior is present but cross-browser validation evidence is not in the read set.
- Legacy pipeline duplication exists in `lib/models/chestXray/*` and should be retired or isolated after generic runtime hardening.

### Phase 2 — clarity.json spec locked

Status: **IN PROGRESS**

Evidence:
- `clarity-schema.json` exists with strict validation rules, required fields, enums, and `additionalProperties: false`.
- `CLARITY_SPEC.md` defines versioning policy, breaking and non-breaking rules, and migration ownership.
- `public/models/densenet121-chest/clarity.json` exists and conforms to the schema structure.
- `lib/clarity/types.ts` validates schema-compatible data at runtime in TypeScript.

Remaining:
- Spec/version governance is described but automated compatibility tests are not visible in the read set.
- Cross-version loader behavior in runtime is not explicitly version-switched yet.
- Converter validation has one schema drift (`safety.certified` check in converter code) that should be aligned with the current schema.

### Phase 3 — Generic ONNX runtime

Status: **IN PROGRESS**

Evidence:
- `lib/clarity/types.ts` defines and validates generic spec-driven model metadata.
- `lib/clarity/preprocess.ts` uses `spec.input` to preprocess dynamically.
- `lib/clarity/run.ts` resolves model path by `spec.id` and model filename from spec.
- `lib/clarity/postprocess.ts` applies activation from `spec.output.activation`.
- `hooks/useClarityRay.ts` accepts a `ClaritySpec` argument and executes generic pipeline calls.
- `app/analysis/page.tsx` loads selected model and fetches `clarity.json` dynamically before inference.

Remaining:
- Some safety language and result translation still comes through `lib/models/chestXray/postprocess.ts` bridging code.
- Heatmap generation remains model-specific approximation logic in `lib/models/chestXray/heatmap` usage.
- Full removal of legacy hardcoded assumptions needs cleanup passes.

### Phase 4 — converter package

Status: **IN PROGRESS**

Evidence:
 Requested path `converter/` exists at repo root.
 Equivalent package exists at `converter/` with CLI, spec generation, validation, and `pyproject.toml`.
 `converter/clarityray/cli.py` includes convert, validate, and upload workflow commands.
 `converter/clarityray/spec.py` generates schema-validated `clarity.json`.
 `converter/clarityray/validate.py` performs ONNX checks including unsupported browser op screening.

Remaining:
- Converter/runtime schema consistency requires reconciliation around `safety.certified` in validator logic.
- Packaging docs and release process are present in code but not fully integrated into the active root workspace flow.

### Phase 5 — Platform backend + model browser

Status: **IN PROGRESS**

Evidence:
- `api/main.py` exists and wires FastAPI app, CORS, and model routes.
- `app/models/page.tsx` implements model browsing, filtering, and published model selection.
- `app/analysis/page.tsx` pulls selected model metadata via `/api/models/:slug` and then loads its `clarity.json`.
- `supabase/migrations/001_create_models.sql` creates model registry tables.
- `supabase/migrations/002_indexes.sql` and `003_allow_validation_failed_status.sql` evolve query/index and status behavior.
- `utils/api.ts` and `backend/` both exist, indicating parallel API surfaces and ongoing consolidation.

Remaining:
- Active platform architecture has parallel backends (`api/` and retired `backend/`) and needs hard boundary enforcement.
- End-to-end publish pipeline from submission to browser listing is not fully demonstrated in the read set.
- Auth and analysis backend utilities remain present but are explicitly forbidden on analysis inference path.

Current active phase: **Phase 5 — Platform backend + model browser (with Phase 3/4 hardening in parallel)**  
Next immediate task: **Add COOP/COEP headers in `next.config.ts` and run typecheck to preserve browser-runtime correctness for local inference.**

### Detailed phase evidence matrix

| File | Exists | Phase tie-in | Evidence summary |
|---|---|---|---|
| `package.json` | Yes | 1,3,5 | Declares `onnxruntime-web`, Next scripts, and frontend runtime dependencies. |
| `next.config.ts` | Yes | 1 | Exists but currently lacks COOP/COEP header configuration. |
| `tsconfig.json` | Yes | 1,3 | Strict TypeScript mode is enabled for runtime safety. |
| `AGENTS.md` | Yes | 1,3,5 | Declares browser-only invariant and forbids analysis path backend imports. |
| `BUILD_PLAN.md` | Yes | 1,2,3,4,5 | Documents phased plan and known implementation gaps. |
| `CLARITY_SPEC.md` | Yes | 2 | Defines current version and breaking/non-breaking policy. |
| `clarity-schema.json` | Yes | 2,3,4 | Declares required and optional `clarity.json` contract fields. |
| `README.md` | Yes | 5 | Describes full-stack shape and current architecture narrative. |
| `app/analysis/page.tsx` | Yes | 1,3,5 | Dynamically loads model details/spec and runs client-only pipeline orchestration. |
| `app/models/page.tsx` | Yes | 5 | Implements published model browsing and filters. |
| `hooks/useClarityRay.ts` | Yes | 1,3 | Executes preprocess, infer, and postprocess with client status transitions. |
| `lib/models/chestXray/config.ts` | Yes | 1 | Legacy model-specific constants remain available. |
| `lib/models/chestXray/preprocess.ts` | Yes | 1 | Legacy model-specific preprocessing exists. |
| `lib/models/chestXray/run.ts` | Yes | 1 | Legacy model-specific ONNX runtime wrapper exists. |
| `lib/models/chestXray/postprocess.ts` | Yes | 1,3 | Legacy postprocess/translation logic is still reused from generic layer. |
| `lib/clarity/types.ts` | Yes | 2,3 | Runtime validator enforces schema-compatible spec contract. |
| `lib/clarity/preprocess.ts` | Yes | 3 | Preprocesses by spec shape/layout/normalization semantics. |
| `lib/clarity/run.ts` | Yes | 3 | Generic model path resolution and session caching by spec id. |
| `lib/clarity/postprocess.ts` | Yes | 3 | Applies configurable activation and validates output range. |
| `components/ConsentModal.tsx` | Yes | 1 | Enforces consent gate and safety text before analysis. |
| `components/UploadZone.tsx` | Yes | 1 | Handles local image file selection, validation, and run action. |
| `components/ResultsPanel.tsx` | Yes | 1 | Renders findings, explanation, and screening disclaimer. |
| `components/GradCAMViewer.tsx` | Yes | 1 | Renders local attention map overlay with warning text. |
| `utils/api.ts` | Yes | 5 | Provides backend API wrappers and token-aware request helper. |
| `utils/auth.ts` | Yes | 5 | Provides local token storage helper functions. |
| `utils/types.ts` | Yes | 5 | Defines backend-oriented auth/user/analysis interfaces. |
| `converter/clarityray/cli.py` | No | 4 | Requested path missing in root and marked `[NOT YET BUILT]`. |
| `converter/clarityray/spec.py` | No | 4 | Requested path missing in root and marked `[NOT YET BUILT]`. |
| `converter/clarityray/validate.py` | No | 4 | Requested path missing in root and marked `[NOT YET BUILT]`. |
| `converter/pyproject.toml` | No | 4 | Requested path missing in root and marked `[NOT YET BUILT]`. |
| `public/models/densenet121-chest/clarity.json` | Yes | 2,3 | Active model spec provides binary class and threshold metadata. |
| `supabase/migrations/001_create_models.sql` | Yes | 5 | Creates base model/version/validation tables. |
| `supabase/migrations/002_indexes.sql` | Yes | 5 | Adds lookup indexes for status/bodypart/modality/current versions. |
| `supabase/migrations/003_allow_validation_failed_status.sql` | Yes | 5 | Extends model status constraint with `validation_failed`. |
| `api/main.py` | Yes | 5 | FastAPI app startup with CORS and model router inclusion. |

### Additional converter evidence from actual workspace location

| File | Exists | Phase tie-in | Evidence summary |
|---|---|---|---|
| `converter/clarityray/cli.py` | Yes | 4 | Implements convert, validate, package, and optional upload flow. |
| `converter/clarityray/spec.py` | Yes | 4 | Generates schema-validated specs with inferred shapes and defaults. |
| `converter/clarityray/validate.py` | Yes | 4 | Validates ONNX structure, shape, ops, runtime finite outputs, and safety fields. |
| `converter/pyproject.toml` | Yes | 4 | Defines `clarityray` package metadata and script entrypoint. |

## SECTION 3 — ARCHITECTURE MAP

### 3A. The invariant

Inference for scan analysis must always execute in the browser and scan image data must never be transmitted to a server.

### 3B. Active code (what runs in production)

```text
app/analysis/page.tsx — loads selected model metadata/spec and orchestrates browser-only analysis UI states.
app/models/page.tsx — displays published models and drives model selection for analysis.
hooks/useClarityRay.ts — main client inference state machine for model load, preprocess, infer, and result mapping.
lib/clarity/types.ts — runtime schema validator and TypeScript contract for clarity.json.
lib/clarity/preprocess.ts — generic spec-driven image preprocessing to tensor.
lib/clarity/run.ts — generic ONNX Runtime Web execution layer with per-model session cache.
lib/clarity/postprocess.ts — output activation and probability safety checks before result translation.
components/UploadZone.tsx — upload and local run trigger UI with validation/error display.
components/ResultsPanel.tsx — result rendering, confidence bars, explanation, and disclaimer display.
components/GradCAMViewer.tsx — local heatmap overlay rendering over source image.
components/ConsentModal.tsx — first-use consent gate stored in localStorage.
public/models/densenet121-chest/clarity.json — active model contract consumed by runtime.
api/main.py — active FastAPI app shell for platform endpoints and health check.
supabase/migrations/001_create_models.sql — baseline model registry schema.
supabase/migrations/002_indexes.sql — model lookup and current-version index tuning.
supabase/migrations/003_allow_validation_failed_status.sql — adds validation_failed model status support.
```

### 3C. Dead code (exists but retired)

```text
backend/ — marked retired in AGENTS.md and must not be wired into new analysis-path code.
utils/api.ts — backend client utility that AGENTS.md forbids importing in app/analysis/page.tsx.
utils/auth.ts — auth token utility that AGENTS.md forbids importing in app/analysis/page.tsx.
src/app/* — scaffold route tree not used as active top-level app route tree per AGENTS.md.
pages/ — legacy/docs area and not active App Router product routes.
```

### 3D. Not yet built

```text
converter/clarityray/cli.py — [NOT YET BUILT] expected in Phase 4 standardized converter location.
converter/clarityray/spec.py — [NOT YET BUILT] expected in Phase 4 standardized converter location.
converter/clarityray/validate.py — [NOT YET BUILT] expected in Phase 4 standardized converter location.
converter/pyproject.toml — [NOT YET BUILT] expected in Phase 4 standardized converter location.
```

## SECTION 4 — KEY DECISIONS LOG

### Decision 1: Browser-only inference (not server-side)

The system chose browser-only ONNX inference so user scan processing happens locally in `useClarityRay` and `lib/clarity/*` without upload APIs in analysis flow.  
The alternative was server-side inference using backend endpoints for model execution and result return.  
This choice was made to preserve the privacy invariant and simplify legal/privacy surface for image handling.  
If reversed, the core privacy promise in AGENTS context breaks and forbidden-pattern constraints are violated immediately.

### Decision 2: Retired Express backend

The workspace keeps `backend/` for historical/full-stack work, but AGENTS marks it retired for new user-analysis wiring.  
The alternative was continuing to route active analysis and user flow through Express utilities from `utils/api.ts`.  
This choice was made to avoid architecture drift while platform API consolidates around the current model-library direction.  
If reversed, duplicate backend paths and contradictory architecture assumptions increase integration defects.

### Decision 3: clarity.json spec as the model contract

The product standardized model metadata in `clarity.json` with schema in `clarity-schema.json` and runtime validation in `lib/clarity/types.ts`.  
The alternative was hardcoded paths, labels, normalization, and threshold constants in frontend code.  
This choice was made to support model library growth and reduce runtime coupling to a single checkpoint.  
If reversed, multi-model support fails and unsafe hidden defaults become hard to audit.

### Decision 4: Local conversion (not cloud conversion service)

The converter package design (`clarityray ...` CLI) performs conversion and validation on the researcher machine before submit.  
The alternative was a hosted conversion service that accepts raw model files remotely and performs transformation server-side.  
This choice was made to reduce operational complexity and keep the tooling reproducible by researchers.  
If reversed, platform costs, queueing complexity, and trust requirements increase materially.

### Decision 5: Thresholds live in clarity.json (not hardcoded)

Threshold values are explicitly encoded in `public/models/densenet121-chest/clarity.json` under `thresholds`.  
The alternative was fixed threshold logic baked inside postprocess code for all models.  
This choice was made because threshold calibration is model-dependent and must be versioned with model artifacts.  
If reversed, threshold behavior becomes opaque and model validation provenance is lost.

### Decision 6: TypeScript strict mode throughout

`tsconfig.json` enables `strict: true` and the project context requires regular no-emit type checks.  
The alternative was permissive typing with `any` and weak schema boundaries in runtime pipelines.  
This choice was made to keep medical-screening UI contracts explicit and reduce silent data-shape bugs.  
If reversed, runtime failures from shape/type mismatch become more likely and harder to detect pre-release.

## SECTION 5 — THE ONNX MODEL

File location:
```text
/public/models/densenet121-chest/model.onnx (declared in /public/models/densenet121-chest/clarity.json)
```

Output shape:
```text
[1, 2]
```

Output classes:
```text
["Normal", "Lung Cancer"]
```

Output type (logits or probabilities):
```text
Logits expected from model, then converted to probabilities by softmax activation in runtime postprocess.
```

Input shape:
```text
[1, 3, 224, 224]
```

Input normalization (mean/std values):
```text
mean: [0.485, 0.456, 0.406]
std:  [0.229, 0.224, 0.225]
```

Softmax applied where:
```text
lib/clarity/postprocess.ts -> toProbabilities() -> applyActivation() with activation="softmax"
lib/models/chestXray/postprocess.ts -> softmax() in legacy model-specific path
```

Threshold — possible_finding:
```text
0.5
```

Threshold — low_confidence:
```text
0.25
```

The model is **NOT** the 14-class NIH ChestX-ray14 DenseNet121, and any AI reading this file must not assume 14 output classes.

## SECTION 6 — clarity.json SPEC

`clarity-schema.json` exists.

### Required fields with types

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Non-empty. |
| `name` | `string` | Non-empty. |
| `version` | `string` | Semver pattern. |
| `certified` | `boolean` | Must be `false` by schema const. |
| `bodypart` | `string` | Non-empty. |
| `modality` | `string` | Non-empty. |
| `model` | `object` | Requires `model.file`. |
| `model.file` | `string` | Non-empty. |
| `input` | `object` | Requires `shape` and `normalize`. |
| `input.shape` | `integer[]` | Positive integers. |
| `input.normalize` | `object` | Requires `mean` and `std`. |
| `input.normalize.mean` | `number[]` | Non-empty numeric list. |
| `input.normalize.std` | `number[]` | Non-empty numeric list. |
| `output` | `object` | Requires `classes` and `activation`. |
| `output.classes` | `string[]` | Non-empty strings. |
| `output.activation` | `string` enum | `softmax` or `sigmoid` or `none`. |
| `safety` | `object` | Requires `tier` and `disclaimer`. |
| `safety.tier` | `string` enum | `screening`, `research`, or `investigational`. |
| `safety.disclaimer` | `string` | Non-empty. |

### Optional fields

| Field | Type |
|---|---|
| `model.format` | `string` |
| `input.layout` | `string` |
| `output.shape` | `integer[]` |
| `thresholds` | `object` |
| `thresholds.possible_finding` | `number` in $[0,1]$ |
| `thresholds.low_confidence` | `number` in $[0,1]$ |
| `thresholds.validation_status` | `string` enum (`unvalidated`, `validated`) |

### Fields forbidden to be set by researchers

| Forbidden setting | Why |
|---|---|
| `certified: true` | Schema enforces `certified` const `false` and policy forbids claiming certification. |
| Any undeclared top-level field | `additionalProperties: false` blocks non-schema fields. |
| Any undeclared nested field in strict objects | Nested `additionalProperties: false` blocks out-of-contract metadata. |

### Current spec version

```text
1.0.0 (from CLARITY_SPEC.md policy context and current schema/runtime usage)
```

### Breaking vs non-breaking policy

A breaking change is any schema/runtime change that makes previously valid `clarity.json` fail or alter meaning without migration, such as required-field rename, type change, or optional-to-required promotion.  
A non-breaking change adds optional metadata or improves validation behavior while preserving behavior for older valid files.

## SECTION 7 — DATA FLOW

### Journey 1 — User runs inference on a scan

1. `app/analysis/page.tsx` loads and renders analysis shell and consent modal state. **[BROWSER]**  
2. Page reads selected model slug from `localStorage` and requests `/api/models/:slug`. **[SERVER]**  
3. Browser receives model detail payload and extracts `current_version.clarity_url`. **[BROWSER]**  
4. Browser fetches `clarity.json` and validates it with `validateSpec`. **[BROWSER]**  
5. User chooses image in `components/UploadZone.tsx` and triggers `runAnalysis(file)`. **[BROWSER]**  
6. `hooks/useClarityRay.ts` checks file size/type and browser capabilities. **[BROWSER]**  
7. `lib/clarity/preprocess.ts` decodes image and builds tensor from spec shape/normalization. **[BROWSER]**  
8. `lib/clarity/run.ts` loads ONNX session and executes inference via `onnxruntime-web`. **[BROWSER]**  
9. `lib/clarity/postprocess.ts` applies activation and validates probability bounds. **[BROWSER]**  
10. Result is translated into safety messaging and findings list for UI. **[BROWSER]**  
11. `components/ResultsPanel.tsx` renders confidences, explanation, and disclaimer. **[BROWSER]**  
12. `components/GradCAMViewer.tsx` overlays local heatmap on local image URL. **[BROWSER]**  
13. No inference step sends image data to backend endpoints. **[NONE — no network]**

### Journey 2 — Researcher submits a model

1. Researcher runs converter CLI command (`clarityray upload ...`) on local machine. **[LOCAL MACHINE]**  
2. CLI detects framework and converts non-ONNX inputs to ONNX when needed. **[LOCAL MACHINE]**  
3. CLI validates graph tensors, shapes, ops, and finite inference outputs. **[LOCAL MACHINE]**  
4. CLI generates schema-valid `clarity.json` from model metadata and class labels. **[LOCAL MACHINE]**  
5. CLI packages `model.onnx` and `clarity.json` into output directory. **[LOCAL MACHINE]**  
6. CLI optionally submits package to platform endpoint when upload is enabled. **[PLATFORM SERVER]**  
7. Platform persists model/version metadata in model registry tables. **[PLATFORM SERVER]**  
8. Published model assets are hosted for browser fetch via public path/CDN-like static serving. **[CDN]**  
9. Model appears in `/models` listing once status is published. **[PLATFORM SERVER]**

### Journey 3 — User selects a model from the library

1. User opens `/models` and browser requests `/api/models`. **[SERVER]**  
2. `app/models/page.tsx` filters to published models and renders cards client-side. **[BROWSER]**  
3. User selects a model card and navigates to detail/selection path. **[BROWSER]**  
4. Selected model slug is stored in local storage key for analysis flow. **[BROWSER]**  
5. User opens `/analysis`, which reloads selected model metadata and spec. **[BROWSER + SERVER]**  
6. Browser executes inference steps locally using selected model contract. **[BROWSER]**

### Journey checkpoint matrix

| Checkpoint | Journey 1 | Journey 2 | Journey 3 |
|---|---|---|---|
| User interaction starts in browser | Yes | No | Yes |
| Scan image processed in local runtime only | Yes | N/A | Yes (after selection) |
| Platform API metadata request required | Yes | Optional at submit stage | Yes |
| ONNX inference runs in browser | Yes | No | Yes |
| ONNX validation runs in Python runtime | No | Yes | No |
| Model packaging step exists | No | Yes | No |
| Supabase model registry touched | Indirect | Yes | Yes |
| Heatmap generated in browser canvas | Yes | No | Yes |
| Auth dependency required for inference | No | No | No |
| Network-free inference step guarantee | Yes | N/A | Yes |

### Journey 1 deeper browser pipeline checks

1. File bytes remain in browser memory from `UploadZone` handoff through preprocess and inference. **[BROWSER]**  
2. `preprocessImage(file, spec)` creates tensor without backend callbacks. **[BROWSER]**  
3. `runInference(input, spec)` executes through `onnxruntime-web` session APIs. **[BROWSER]**  
4. `postprocess(rawOutput, spec)` computes probabilities without network dependencies. **[BROWSER]**  
5. Heatmap generation uses local canvas math and local image URL objects. **[BROWSER]**  
6. Result strings render in React components from local state only. **[BROWSER]**

### Journey 2 deeper converter checks

1. Converter validates input/output tensor dimensions before packaging. **[LOCAL MACHINE]**  
2. Converter blocks unsupported browser ONNX ops using denylist checks. **[LOCAL MACHINE]**  
3. Converter performs finite-value inference test with Python `onnxruntime`. **[LOCAL MACHINE]**  
4. Converter writes `clarity.json` and ONNX file into package directory. **[LOCAL MACHINE]**  
5. Converter upload is optional and can be skipped for local artifact generation. **[LOCAL MACHINE]**

## SECTION 8 — FORBIDDEN PATTERNS

| Forbidden pattern | Why forbidden | Required alternative |
|---|---|---|
| `fetch()` sending image data to server during analysis | Violates privacy invariant and AGENTS rule. | Keep scan decode, preprocess, and inference entirely browser-local. |
| Import of `utils/api.ts` in `app/analysis/page.tsx` | Couples analysis to retired/forbidden backend path. | Use local runtime modules and model-spec fetch only. |
| Import of `utils/auth.ts` in `app/analysis/page.tsx` | Couples analysis to auth/backend concerns and violates explicit rule. | Keep analysis page independent from backend auth utilities. |
| Hardcoded label arrays outside `clarity.json` (Phase 3+) | Breaks generic runtime and model contract portability. | Read labels from `spec.output.classes`. |
| Hardcoded normalization constants outside `clarity.json` (Phase 3+) | Causes model mismatch and non-portable preprocessing. | Read normalization from `spec.input.normalize`. |
| `certified: true` in any `clarity.json` | Violates schema const and policy safety boundary. | Keep `certified: false` until formal regulated approval path exists. |
| Forbidden safety language phrases in UI text | Creates unsafe diagnostic framing and policy violations. | Use conservative screening phrasing and explicit physician-review language. |
| Assumptions about 14 output classes | Current active model output is binary and generic runtime supports variable class count. | Always derive class count from `spec.output.classes.length`. |

### Forbidden safety language phrases (explicit list)

```text
"direct diagnosis claims"
"definitive finding claims"
"direct patient-disease statements"
"diagnosis"
"confirms"
"shows" (as absolute clinical confirmation)
"definitive diagnosis terms"
"absolute confirmation terms"
```

### Forbidden import and call signatures checklist

```text
app/analysis/page.tsx -> import { api } from '@/utils/api'                [FORBIDDEN]
app/analysis/page.tsx -> import { getToken } from '@/utils/auth'          [FORBIDDEN]
app/analysis/page.tsx -> fetch('/analysis/upload', { body: formData })    [FORBIDDEN]
hooks/useClarityRay.ts -> fetch('http://', { method: 'POST', body: file}) [FORBIDDEN]
lib/clarity/preprocess.ts -> hardcoded mean/std not from spec             [FORBIDDEN in Phase 3+]
lib/clarity/postprocess.ts -> hardcoded class labels                       [FORBIDDEN in Phase 3+]
public/**/clarity.json -> "certified": true                               [FORBIDDEN]
ResultsPanel text -> "diagnosis confirmed"                                 [FORBIDDEN]
ResultsPanel text -> "patient has <disease>"                               [FORBIDDEN]
```

### Allowed replacement patterns checklist

```text
app/analysis/page.tsx -> fetch('/api/models/:slug') for metadata only      [ALLOWED]
hooks/useClarityRay.ts -> preprocessImage(file, spec)                       [ALLOWED]
hooks/useClarityRay.ts -> runInference(input, spec)                         [ALLOWED]
hooks/useClarityRay.ts -> postprocess(rawOutput, spec)                      [ALLOWED]
lib/clarity/postprocess.ts -> toProbabilities(rawOutput, spec)              [ALLOWED]
components/ResultsPanel.tsx -> screening-safe language                      [ALLOWED]
```

## SECTION 9 — COMMANDS

### Development

| Exact command | What it does | When to run it | Directory |
|---|---|---|---|
| `npm run dev` | Starts Next.js development server. | During frontend development. | `/home/shubh/Documents/Clarity` |
| `npm run dev:api` | Starts backend dev server via backend package script. | Only when testing legacy/full-stack API paths. | `/home/shubh/Documents/Clarity` |
| `npm run start:api` | Starts backend production server script. | When validating backend start behavior outside dev mode. | `/home/shubh/Documents/Clarity` |

### Type checking

| Exact command | What it does | When to run it | Directory |
|---|---|---|---|
| `npx tsc --noEmit` | Runs strict TypeScript checks without emitting files. | After every code change touching TS/TSX. | `/home/shubh/Documents/Clarity` |
| `npm run lint` | Runs configured ESLint checks. | Before commit or release candidate prep. | `/home/shubh/Documents/Clarity` |

### Converter

| Exact command | What it does | When to run it | Directory |
|---|---|---|---|
| `pip install -e ".[pytorch]"` | Installs converter package in editable mode with PyTorch extra. | Initial converter environment setup. | `/home/shubh/Documents/Clarity/converter` |
| `clarityray --help` | Lists converter commands and options. | Before running upload/convert commands or checking syntax. | `/home/shubh/Documents/Clarity/converter` |
| `clarityray upload <model_path> --classes "A,B" --bodypart chest --modality xray --output ./clarityray-package --no-upload` | Converts/validates/packages model locally without server submit. | During local packaging and spec-generation validation. | `/home/shubh/Documents/Clarity/converter` |

### Testing

| Exact command | What it does | When to run it | Directory |
|---|---|---|---|
| `[UNKNOWN — file not found]` | No dedicated test script was found in root `package.json`. | Add test runner script before scaling CI coverage. | `/home/shubh/Documents/Clarity` |
| `python -m pytest` | [UNKNOWN — no pytest config read in requested files]. | Use only if converter/backend test suite is added/confirmed. | `/home/shubh/Documents/Clarity/converter` |

### Deployment

| Exact command | What it does | When to run it | Directory |
|---|---|---|---|
| `npm run build` | Produces production Next.js build output. | Before deployment release. | `/home/shubh/Documents/Clarity` |
| `npm run start` | Runs production Next.js server. | Local smoke test of production build. | `/home/shubh/Documents/Clarity` |

### Operational runbooks

#### Development runbook

1. Install node dependencies in repo root before running `npm run dev`.  
2. Start frontend and verify `/analysis` and `/models` routes render without runtime errors.  
3. Keep browser devtools open and confirm inference path performs no image upload calls.  
4. Use sample model selection flow to ensure `clarity.json` fetch and validation complete.  
5. Capture console errors immediately because invalid spec payloads fail fast in validator.

#### Type-check runbook

1. Run `npx tsc --noEmit` after every edit that touches `app/`, `hooks/`, or `lib/`.  
2. Resolve all strict typing issues before proceeding to behavior validation.  
3. Re-run typecheck after any schema or TypeScript interface changes.  
4. Run lint after typecheck to catch style and React hook dependency issues.

#### Converter runbook

1. Enter converter directory under `converter`.  
2. Install editable package with needed extra (`pytorch` or `keras`) before conversion commands.  
3. Use `clarityray --help` to verify CLI is discoverable in current environment.  
4. Run `clarityray upload ... --no-upload` first to validate local packaging.  
5. Inspect generated `clarity.json` and verify schema-required fields before submission.  
6. Run upload mode only after local validation passes cleanly.

#### Testing runbook

1. Add formal `test` scripts to `package.json` because root test command is currently absent.  
2. Add converter unit tests for schema generation and validation error paths.  
3. Add browser integration test for inference flow with local mock image.  
4. Add regression test for class-count mismatch and threshold edge cases.

#### Deployment runbook

1. Run `npm run build` and ensure build completes without route or config errors.  
2. Start production server with `npm run start` and smoke test key pages.  
3. Verify CORS and API endpoints if deploying platform model browser with FastAPI.  
4. Verify model static assets resolve from public path in deployed environment.

### Command failure signatures and first response

| Command | Failure signature | First response |
|---|---|---|
| `npm run dev` | Route compile failure in `app/analysis/page.tsx` | Fix TypeScript/React errors and re-run typecheck. |
| `npm run dev` | Runtime fetch failure for `/api/models` | Confirm API route/backend availability and selected model slug. |
| `npx tsc --noEmit` | Type mismatch for `ClaritySpec` fields | Align schema, validator types, and runtime usage. |
| `npm run lint` | Hook dependency warning in `useEffect` | Add explicit dependency or memoization where required. |
| `clarityray upload ...` | Output class mismatch error | Align class list length with model output dimension. |
| `clarityray upload ...` | Unsupported operator compatibility error | Re-export model with browser-compatible operators. |
| `clarityray upload ...` | NaN/Inf inference failure | Re-check model export and numeric stability preprocessing. |
| `npm run build` | Static generation or route import failure | Fix broken imports and validate route tree boundaries. |

## SECTION 10 — KNOWN ISSUES AND RISKS

| Issue name | Current status | Impact if unresolved | Fix or mitigation |
|---|---|---|---|
| COOP/COEP headers for SharedArrayBuffer | **exists** | Some browser/runtime paths for ONNX performance or compatibility may fail or degrade. | Add `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` in `next.config.ts`. |
| IndexedDB quota variance across browsers (Safari vs Chrome) | **not yet addressed** | Model caching reliability and first-load UX can differ across browser families. | Implement quota-aware cache strategy with fallback and clear user messaging per browser. |
| clarity.json spec versioning and backwards compatibility | **exists** | Runtime may reject older specs without a clear migration path. | Add explicit version router in runtime and test fixtures for N-1 compatibility. |
| Regulatory surface (FDA/MDR) if used clinically | **not yet addressed** | Product positioning and liability risk escalate if interpreted as diagnostic software. | Keep screening-only language and define regulatory roadmap milestones before clinical claims. |
| Model threshold values are unvalidated defaults | **exists** | False positives or false negatives can increase due to non-calibrated thresholds. | Require dataset-backed calibration and update `thresholds.validation_status` when validated. |
| ONNX operator support gap between Python `onnxruntime` and browser `onnxruntime-web` | **mitigated (partial)** | A model that passes Python inference can still fail in browser due to unsupported ops. | Keep converter browser-op checks and expand unsupported-op matrix coverage in CI. |

### Risk monitoring checklist

1. Track browser runtime errors specifically tagged by model load and inference state transitions.  
2. Track frequency of spec-validation failures per model version and schema version.  
3. Track percentage of models failing converter operator-compatibility checks.  
4. Track percentage of results using unvalidated thresholds per published model.  
5. Track user-reported confusion events tied to safety disclaimer wording.  
6. Track platform incidents where selected model metadata is missing current version linkage.  
7. Track any code review attempt that introduces analysis-path auth/backend imports.  
8. Track release checklist completion for COOP/COEP headers and cross-browser smoke tests.

### Mitigation priority order

| Priority | Mitigation | Why priority is set |
|---|---|---|
| P0 | Add COOP/COEP headers and verify runtime compatibility | Directly affects browser inference reliability. |
| P0 | Enforce no-image-upload analysis invariant in code review checks | Protects core product promise and privacy model. |
| P1 | Resolve converter/schema drift around `safety.certified` | Prevents packaging/runtime contract mismatch. |
| P1 | Add explicit backward compatibility tests for spec versions | Reduces migration break risk as schema evolves. |
| P2 | Implement cache strategy for browser quota variance | Improves first-load and repeat-load reliability. |
| P2 | Formalize regulatory workstream decision gates | Prevents accidental clinical-claim expansion. |

## SECTION 11 — WHAT TO NEVER DO WHEN EDITING THIS CODEBASE

Never add server-side inference for user scan analysis.  
Never modify the ONNX binary artifact path contract without coordinated spec/runtime updates.  
Never add `fetch()` calls that send image data during analysis flow.  
Never assume 14 output classes in any inference UI or postprocess logic.  
Never set `certified: true` in any `clarity.json`.  
Never remove required COOP/COEP headers once added to `next.config.ts`.  
Never import backend utilities such as `utils/api.ts` or `utils/auth.ts` into `app/analysis/page.tsx`.  
Always run `npx tsc --noEmit` after every substantive change.  
Always validate `clarity.json` changes against `clarity-schema.json`.  
Always read this file before making architectural decisions that affect inference path, model contracts, or safety language.

### Additional imperative guardrails

Never bypass `validateSpec()` when loading model contracts in analysis flow.  
Never suppress schema validation errors with silent fallback behavior.  
Never map model output indexes to labels without using `spec.output.classes`.  
Never add hidden output transformations that are not represented in spec activation settings.  
Never change safety-tier semantics without updating both UI and postprocess translation logic.  
Never remove low-confidence handling paths from postprocess output interpretation.  
Never remove consent gate behavior without replacement safety approval path.  
Never introduce cross-origin third-party scripts that can break strict browser isolation headers.  
Never merge backend architectural changes into analysis route without explicit invariant review.  
Never publish model specs missing thresholds unless intentionally documented for defaults.  
Always keep model selection and analysis execution decoupled from backend auth state.  
Always include a clear disclaimer in all complete and idle result states.  
Always verify `certified` remains false in schema and model specs.  
Always treat heatmap visualization as assistive and non-diagnostic in user text.  
Always keep threshold values versioned with model artifacts and not hidden in code constants.

## SECTION 12 — OPEN QUESTIONS

| Question | Options | What is blocking the decision |
|---|---|---|
| Second ONNX model for Phase 2 spec validation (do you have one?) | Add one additional binary model now, or defer until current model hardening is done. | No second validated model artifact is present in requested read set. |
| Regulatory pathway (FDA Pre-Sub meeting — when?) | Start Pre-Sub planning now, or remain research/screening-only with no clinical pathway yet. | No explicit timeline, owner, or regulatory workstream file was read. |
| Model threshold validation (need real data — when?) | Calibrate thresholds with retrospective dataset now, or keep unvalidated defaults temporarily. | No validation dataset protocol or benchmark report was present in requested files. |
| `clarityray studio` command (Phase 4 extension — prioritised or not?) | Prioritize a richer local studio UX, or keep CLI minimal for packaging only. | No roadmap commitment for this command appears in requested files. |
| Supabase vs self-hosted Postgres for Phase 5 | Continue Supabase-managed path, or migrate to self-hosted Postgres. | Migrations exist but deployment, operations, and cost constraints are not documented in requested files. |

### Decision gates for open questions

| Question | Decision owner | Required evidence before decision | Suggested decision window |
|---|---|---|---|
| Second ONNX model for spec validation | Model/platform lead | One validated second model artifact and matching clarity spec. | Before closing Phase 2. |
| FDA Pre-Sub timing | Product/regulatory lead | Intended use statement, risk class assumption, and validation plan. | Before any clinical-market messaging. |
| Threshold validation timing | ML lead | Dataset protocol and calibration benchmark with confidence intervals. | Before labeling thresholds as validated. |
| `clarityray studio` priority | Product engineering lead | User feedback showing CLI friction and workflow bottlenecks. | After Phase 4 stabilization. |
| Supabase vs self-hosted Postgres | Platform lead | Cost, reliability, compliance, and ops burden comparison. | Before production scale-up in Phase 5. |

## SECTION 13 — CONTEXT FILE METADATA

Generated: **2026-04-03**

Generated from:
```text
/home/shubh/Documents/Clarity/package.json
/home/shubh/Documents/Clarity/next.config.ts
/home/shubh/Documents/Clarity/tsconfig.json
/home/shubh/Documents/Clarity/AGENTS.md
/home/shubh/Documents/Clarity/BUILD_PLAN.md
/home/shubh/Documents/Clarity/CLARITY_SPEC.md
/home/shubh/Documents/Clarity/clarity-schema.json
/home/shubh/Documents/Clarity/README.md
/home/shubh/Documents/Clarity/app/analysis/page.tsx
/home/shubh/Documents/Clarity/app/models/page.tsx
/home/shubh/Documents/Clarity/hooks/useClarityRay.ts
/home/shubh/Documents/Clarity/lib/models/chestXray/config.ts
/home/shubh/Documents/Clarity/lib/models/chestXray/preprocess.ts
/home/shubh/Documents/Clarity/lib/models/chestXray/run.ts
/home/shubh/Documents/Clarity/lib/models/chestXray/postprocess.ts
/home/shubh/Documents/Clarity/lib/clarity/types.ts
/home/shubh/Documents/Clarity/lib/clarity/preprocess.ts
/home/shubh/Documents/Clarity/lib/clarity/run.ts
/home/shubh/Documents/Clarity/lib/clarity/postprocess.ts
/home/shubh/Documents/Clarity/components/ConsentModal.tsx
/home/shubh/Documents/Clarity/components/UploadZone.tsx
/home/shubh/Documents/Clarity/components/ResultsPanel.tsx
/home/shubh/Documents/Clarity/components/GradCAMViewer.tsx
/home/shubh/Documents/Clarity/utils/api.ts
/home/shubh/Documents/Clarity/utils/auth.ts
/home/shubh/Documents/Clarity/utils/types.ts
/home/shubh/Documents/Clarity/public/models/densenet121-chest/clarity.json
/home/shubh/Documents/Clarity/supabase/migrations/001_create_models.sql
/home/shubh/Documents/Clarity/supabase/migrations/002_indexes.sql
/home/shubh/Documents/Clarity/supabase/migrations/003_allow_validation_failed_status.sql
/home/shubh/Documents/Clarity/api/main.py
/home/shubh/Documents/Clarity/converter/clarityray/cli.py
/home/shubh/Documents/Clarity/converter/clarityray/spec.py
/home/shubh/Documents/Clarity/converter/clarityray/validate.py
/home/shubh/Documents/Clarity/converter/pyproject.toml
```

Files not found:
```text
converter/clarityray/cli.py
converter/clarityray/spec.py
converter/clarityray/validate.py
converter/pyproject.toml
```

Next update: **Regenerate after each phase completion, after schema changes, or after inference-path architecture changes.**

How to regenerate: `codex --file generate-context-prompt.md`

### Schema field audit snapshot

| Field path | Required | Type | Constraint summary | Source |
|---|---|---|---|---|
| `id` | Yes | `string` | Non-empty. | `clarity-schema.json` |
| `name` | Yes | `string` | Non-empty. | `clarity-schema.json` |
| `version` | Yes | `string` | Semver regex pattern. | `clarity-schema.json` |
| `certified` | Yes | `boolean` | Const must be `false`. | `clarity-schema.json` |
| `bodypart` | Yes | `string` | Non-empty. | `clarity-schema.json` |
| `modality` | Yes | `string` | Non-empty. | `clarity-schema.json` |
| `model` | Yes | `object` | `additionalProperties: false`. | `clarity-schema.json` |
| `model.file` | Yes | `string` | Non-empty. | `clarity-schema.json` |
| `model.format` | No | `string` | Optional descriptor. | `clarity-schema.json` |
| `input` | Yes | `object` | `shape` and `normalize` required. | `clarity-schema.json` |
| `input.shape` | Yes | `integer[]` | Values must be `>=1`. | `clarity-schema.json` |
| `input.layout` | No | `string` | Optional layout hint. | `clarity-schema.json` |
| `input.normalize` | Yes | `object` | `mean` and `std` required. | `clarity-schema.json` |
| `input.normalize.mean` | Yes | `number[]` | Non-empty list. | `clarity-schema.json` |
| `input.normalize.std` | Yes | `number[]` | Non-empty list. | `clarity-schema.json` |
| `output` | Yes | `object` | `classes` and `activation` required. | `clarity-schema.json` |
| `output.shape` | No | `integer[]` | Optional output shape metadata. | `clarity-schema.json` |
| `output.classes` | Yes | `string[]` | At least one class string. | `clarity-schema.json` |
| `output.activation` | Yes | `enum` | `softmax|sigmoid|none`. | `clarity-schema.json` |
| `safety` | Yes | `object` | `tier` and `disclaimer` required. | `clarity-schema.json` |
| `safety.tier` | Yes | `enum` | `screening|research|investigational`. | `clarity-schema.json` |
| `safety.disclaimer` | Yes | `string` | Non-empty. | `clarity-schema.json` |
| `thresholds` | No | `object` | Optional threshold block. | `clarity-schema.json` |
| `thresholds.possible_finding` | Yes* | `number` | Range `0..1` when block exists. | `clarity-schema.json` |
| `thresholds.low_confidence` | Yes* | `number` | Range `0..1` when block exists. | `clarity-schema.json` |
| `thresholds.validation_status` | Yes* | `enum` | `unvalidated|validated` when block exists. | `clarity-schema.json` |

### Runtime contract implementation audit

| Runtime file | Contract responsibility | Current state |
|---|---|---|
| `lib/clarity/types.ts` | Parse and validate schema-compatible data. | Implemented with strict runtime checks. |
| `lib/clarity/preprocess.ts` | Convert browser image data to model tensor by spec. | Implemented with shape assertions and normalization variants. |
| `lib/clarity/run.ts` | Execute ONNX inference with model path from spec. | Implemented with cache and output resolution logic. |
| `lib/clarity/postprocess.ts` | Convert raw outputs into probability-safe values. | Implemented with activation and bounds assertions. |
| `hooks/useClarityRay.ts` | End-to-end client orchestration and UI status updates. | Implemented with loading, preprocessing, running, complete, and error states. |

### Platform integration audit

| Platform surface | Evidence file | State |
|---|---|---|
| Model list UI | `app/models/page.tsx` | Implemented for published model browsing. |
| Model detail fetch for analysis | `app/analysis/page.tsx` | Implemented using `/api/models/:slug`. |
| FastAPI app shell | `api/main.py` | Implemented with CORS and router inclusion. |
| Model DB schema | `supabase/migrations/*.sql` | Implemented with versions and validation runs tables. |
| Legacy backend coexistence | `backend/` + `utils/api.ts` | Exists and should remain detached from analysis inference path. |


### Requested file audit (from this generation run)

| Requested item | Status | Notes |
|---|---|---|
| `package.json` | Read | Root scripts and dependencies captured. |
| `next.config.ts` | Read | No COOP/COEP headers found. |
| `tsconfig.json` | Read | Strict mode confirmed. |
| `AGENTS.md` | Read | Invariant and forbidden patterns captured. |
| `BUILD_PLAN.md` | Read | Phase narrative and known issues captured. |
| `CLARITY_SPEC.md` | Read | Versioning policy captured. |
| `clarity-schema.json` | Read | Required and optional field sets captured. |
| `README.md` | Read | Current architecture framing captured. |
| `app/analysis/page.tsx` | Read | Client inference orchestration captured. |
| `app/models/page.tsx` | Read | Model library behavior captured. |
| `hooks/useClarityRay.ts` | Read | State machine and inference path captured. |
| `lib/models/chestXray/config.ts` | Read | Legacy labels and threshold constants noted. |
| `lib/models/chestXray/preprocess.ts` | Read | Legacy normalization logic noted. |
| `lib/models/chestXray/run.ts` | Read | Legacy session wrapper noted. |
| `lib/models/chestXray/postprocess.ts` | Read | Legacy translation bridge noted. |
| `lib/clarity/types.ts` | Read | Runtime schema validation captured. |
| `lib/clarity/preprocess.ts` | Read | Generic preprocessing contract captured. |
| `lib/clarity/run.ts` | Read | Generic inference path captured. |
| `lib/clarity/postprocess.ts` | Read | Activation and probability checks captured. |
| `components/ConsentModal.tsx` | Read | Consent gating behavior captured. |
| `components/UploadZone.tsx` | Read | File type and size handling captured. |
| `components/ResultsPanel.tsx` | Read | Display and disclaimer behavior captured. |
| `components/GradCAMViewer.tsx` | Read | Heatmap overlay behavior captured. |
| `utils/api.ts` | Read | Backend API client utility captured. |
| `utils/auth.ts` | Read | Token helper behavior captured. |
| `utils/types.ts` | Read | Backend contracts captured. |
| `converter/clarityray/cli.py` | [NOT YET BUILT] | Equivalent file exists in alternate workspace path. |
| `converter/clarityray/spec.py` | [NOT YET BUILT] | Equivalent file exists in alternate workspace path. |
| `converter/clarityray/validate.py` | [NOT YET BUILT] | Equivalent file exists in alternate workspace path. |
| `converter/pyproject.toml` | [NOT YET BUILT] | Equivalent file exists in alternate workspace path. |
| `public/models/densenet121-chest/clarity.json` | Read | Active model contract captured. |
| `supabase/migrations/` | Read | All listed SQL files were individually read. |
| `api/main.py` | Read | FastAPI app initialization captured. |

### Regeneration quality checklist

1. Read every requested file fully before drafting any section content.  
2. Mark missing requested paths as `[NOT YET BUILT]` without guessing file contents.  
3. Recompute phase status from source evidence instead of carrying previous status forward.  
4. Verify model output class count directly from active `clarity.json` contract.  
5. Verify threshold values from spec file and not from legacy constants.  
6. Verify analysis flow still avoids image upload calls in active route.  
7. Verify forbidden imports remain absent from `app/analysis/page.tsx`.  
8. Verify schema required and optional fields still match current JSON schema.  
9. Verify converter location and path-standardization status each regeneration.  
10. Verify migration list includes all files under `supabase/migrations/`.  
11. Verify command list still matches root scripts and converter entry points.  
12. Verify risk table includes COOP/COEP and ONNX runtime compatibility concerns.  
13. Verify open questions include regulatory and threshold-validation timeline gaps.  
14. Verify metadata block includes complete generated-from file list.  
15. Verify metadata block includes complete files-not-found list from request.  
16. Verify date in metadata reflects generation day.  
17. Verify section headers remain exactly `## SECTION N — NAME`.  
18. Verify no marketing language was introduced in technical sections.  
19. Verify all analysis-inference statements preserve browser-only invariant wording.  
20. Verify terminal summary is printed after file generation completes.
