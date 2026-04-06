## SECTION 1 — PROJECT IDENTITY

ClarityRay is a browser-based chest X-ray screening workflow where users upload an image and receive AI findings plus a heatmap and safety disclaimer.
ClarityRay is also a model platform where researchers package ONNX models with `clarity.json` and publish model metadata for selection in a model library.
The core invariant is that scan inference must run locally in the browser and scan image data must never be sent to a server.

## SECTION 2 — CURRENT BUILD STATE

### Phase 1 — Browser ONNX pipeline stabilised

- Status: **IN PROGRESS**.
- Evidence: `hooks/useClarityRay.ts` runs preprocess, inference, postprocess, and heatmap generation on the client.
- Evidence: `app/analysis/page.tsx` uses `useClarityRay` and shows local-analysis statuses.
- Evidence: `components/UploadZone.tsx`, `components/ResultsPanel.tsx`, and `components/GradCAMViewer.tsx` render upload, findings, and visualization.
- Remaining: `hooks/useClarityRay.ts` has indentation and formatting defects around async transition blocks.
- Remaining: `useClarityRay` initializes through manifest/spec loading and currently depends on `integrity.sha256` that is absent in checked `clarity.json`.

### Phase 2 — clarity.json spec locked

- Status: **IN PROGRESS**.
- Evidence: `clarity-schema.json` defines strict required fields and disallows unknown properties.
- Evidence: `lib/clarity/types.ts` enforces strict runtime validation for known contract fields.
- Evidence: `public/models/densenet121-chest/clarity.json` satisfies current schema-required fields.
- Remaining: Runtime loader expects an integrity block while schema and current spec do not define or include `integrity.sha256`.
- Remaining: Compatibility routing for future spec major versions is not implemented.

### Phase 3 — Generic ONNX runtime

- Status: **IN PROGRESS**.
- Evidence: `lib/clarity/preprocess.ts`, `lib/clarity/run.ts`, and `lib/clarity/postprocess.ts` are model-agnostic and spec-driven.
- Evidence: `hooks/useClarityRay.ts` imports generic runtime modules from `lib/clarity/*`.
- Evidence: `app/analysis/page.tsx` validates fetched specs with `validateSpec` before rendering analysis flow.
- Remaining: `lib/models/chestXray/*` still exists and can drift from generic runtime behavior.
- Remaining: `lib/clarity/manifest.ts` and `lib/clarity/specLoader.ts` use permissive checks and bypass strict validator usage in that path.

### Phase 4 — clarityray-converter pip package

- Status: **IN PROGRESS**.
- Evidence: `converter/pyproject.toml` defines installable `clarityray` package and CLI entrypoint.
- Evidence: `converter/clarityray/cli.py` supports convert, validate, package, and optional upload flow.
- Evidence: `converter/clarityray/spec.py` generates schema-validated specs from ONNX IO metadata.
- Evidence: `converter/clarityray/validate.py` validates loadability, shapes, ops compatibility, inference finiteness, and safety fields.
- Remaining: Converter writes `low_confidence: 0.2`, which differs from active model spec `0.25`.
- Remaining: Upload destination and production distribution process are not documented in converter files read.

### Phase 5 — Platform backend + model browser

- Status: **IN PROGRESS**.
- Evidence: `api/main.py` mounts model routes and a health endpoint with CORS setup.
- Evidence: `app/models/page.tsx` lists and filters published models from `/api/models`.
- Evidence: `app/models/[slug]/page.tsx` fetches model detail and stores selected slug in localStorage for analysis route.
- Evidence: `app/analysis/page.tsx` fetches model detail by selected slug and loads its `clarity_url`.
- Remaining: `public/models/manifest.json` still has placeholder Hugging Face URLs with `YOUR_USERNAME`.
- Remaining: End-to-end runtime integrity check path cannot succeed until specs include aligned integrity metadata.

Current active phase: **Phase 5 — Platform backend + model browser**.

Next immediate task: **Replace placeholder Hugging Face URLs in `public/models/manifest.json` and align runtime integrity expectations with schema/spec content.**

## SECTION 3 — ARCHITECTURE MAP

### 3A. The invariant

Patient scan image data must never leave the browser during inference, and all inference must run locally with ONNX Runtime Web.

### 3B. Active code (what runs in production)

```text
app/analysis/page.tsx — Loads selected model metadata/spec and hosts active analysis states.
app/models/page.tsx — Lists and filters published models for selection.
app/models/[slug]/page.tsx — Shows model metadata and persists selected model slug for analysis.
hooks/useClarityRay.ts — Coordinates local preprocess, inference, postprocess, and heatmap generation.
lib/clarity/types.ts — Strict runtime validator for clarity spec structures.
lib/clarity/preprocess.ts — Converts uploaded images to tensors using spec-defined shape and normalization.
lib/clarity/run.ts — Runs ONNX inference using model metadata and session cache.
lib/clarity/postprocess.ts — Applies activation, thresholds, and screening-safe translation.
lib/clarity/manifest.ts — Fetches model manifest and selects current model entry.
lib/clarity/specLoader.ts — Fetches remote clarity specs.
lib/clarity/loader.ts — Loads, hashes, validates, and caches model binaries.
lib/clarity/cache.ts — Cache API read/write for model binaries.
lib/clarity/db.ts — IndexedDB persistence for model binaries.
lib/clarity/hash.ts — SHA-256 hashing helper for integrity checks.
components/ConsentModal.tsx — Consent gate before user analysis interaction.
components/UploadZone.tsx — PNG/JPEG selection and run trigger.
components/ResultsPanel.tsx — Findings, confidence bars, explanation, and disclaimer rendering.
components/GradCAMViewer.tsx — Heatmap overlay rendering on uploaded image.
next.config.ts — COOP/COEP headers needed for SharedArrayBuffer-compatible browser runtime.
public/models/manifest.json — Manifest describing current model and hosted URLs.
public/models/densenet121-chest/clarity.json — Active model contract metadata.
api/main.py — FastAPI app shell for model APIs and health endpoint.
```

### 3C. Dead code (exists but retired)

```text
backend/ — AGENTS.md marks this Express backend as retired for active product paths.
utils/api.ts — AGENTS.md forbids importing this into app/analysis/page.tsx.
utils/auth.ts — AGENTS.md forbids importing this into app/analysis/page.tsx.
src/app/* — AGENTS.md marks this route tree as scaffold, not active app router.
pages/ — AGENTS.md marks this area as documentation-only.
lib/models/chestXray/* — Legacy model-specific runtime path and not the generic active path.
```

### 3D. Not yet built

All requested files in this generation run exist, so there are no `[NOT YET BUILT]` entries.

## SECTION 4 — KEY DECISIONS LOG

**Decision 1: Browser-only inference (not server-side).**
The system keeps inference in browser runtime modules and UI hooks instead of backend execution endpoints.
This choice exists to preserve privacy guarantees and prevent scan upload during analysis.
If reversed, the core product invariant in `AGENTS.md` would be violated.

**Decision 2: Generic spec-driven runtime (not model-specific constants).**
The active path uses `lib/clarity/*` with `ClaritySpec` fields for shape, labels, activation, and thresholds.
This choice exists to support model portability and avoid hidden assumptions in code.
If reversed, adding or changing models would require code changes and increase mismatch risk.

**Decision 3: Strict schema plus strict runtime validation.**
The project uses `clarity-schema.json` and runtime validators in `lib/clarity/types.ts`.
This choice exists to fail fast on malformed model specs in a safety-sensitive flow.
If reversed, invalid specs could produce unsafe or misleading output mapping.

**Decision 4: Keep retired backend paths detached from analysis route.**
`AGENTS.md` explicitly forbids importing `utils/api.ts` and `utils/auth.ts` in `app/analysis/page.tsx`.
This choice exists to keep analysis independent from legacy auth/upload backend coupling.
If reversed, inactive architecture paths could leak into active browser inference flow.

**Decision 5: Preserve screening-safe language in result translation.**
Result text uses uncertainty language such as "possible finding detected" and "no finding detected" in postprocess output.
This choice exists to avoid definitive diagnosis wording in user-facing output.
If reversed, users could interpret model output as clinical diagnosis.

**Decision 6: Enforce cross-origin isolation headers for runtime compatibility.**
`next.config.ts` sets COOP and COEP headers for all routes.
This choice exists because ONNX Runtime Web scenarios may depend on SharedArrayBuffer-compatible isolation.
If reversed, browser runtime behavior can degrade or fail in stricter environments.

## SECTION 5 — THE ONNX MODEL

```text
File location: /public/models/densenet121-chest/model.onnx (from active clarity.json).
Output shape: [1, 2].
Output classes: ["Normal", "Lung Cancer"].
Output type: logits in model output, then probabilities via softmax in postprocess.
Input shape: [1, 3, 224, 224].
Input normalization: mean [0.485, 0.456, 0.406], std [0.229, 0.224, 0.225].
Softmax applied where: lib/clarity/postprocess.ts via applyActivation("softmax").
Threshold possible_finding: 0.5.
Threshold low_confidence: 0.25.
```

This model is not a 14-class NIH ChestX-ray14 output contract, and class mapping must follow `clarity.json`.

## SECTION 6 — clarity.json SPEC

`clarity-schema.json` exists and uses JSON Schema draft-07.

### Required fields with types

```text
id: string
name: string
version: string (semver pattern)
certified: boolean (const false)
bodypart: string
modality: string
model: object
model.file: string
input: object
input.shape: integer[] (>= 1)
input.normalize: object
input.normalize.mean: number[]
input.normalize.std: number[]
output: object
output.classes: string[]
output.activation: "softmax" | "sigmoid" | "none"
safety: object
safety.tier: "screening" | "research" | "investigational"
safety.disclaimer: string
```

### Optional fields

```text
model.format
input.layout
output.shape
thresholds
thresholds.possible_finding
thresholds.low_confidence
thresholds.validation_status
```

### Fields forbidden to be set by researchers

```text
certified: true is forbidden because schema enforces certified to false.
Any undeclared top-level field is forbidden because additionalProperties is false.
Any undeclared nested field under strict objects is forbidden because additionalProperties is false.
```

### Current spec version

```text
1.0.0
```

### Breaking vs non-breaking policy

A breaking change makes an older valid `clarity.json` fail validation or change semantics without a compatibility path.
A non-breaking change preserves behavior for old valid specs while adding optional metadata or non-structural improvements.

## SECTION 7 — DATA FLOW

### Journey 1 — User runs inference on a scan

1. [BROWSER] User opens `/analysis` and the page resolves selected model slug from localStorage.
2. [SERVER] Browser requests `/api/models/:slug` to fetch model detail including `clarity_url`.
3. [BROWSER] Browser fetches `clarity.json` from returned URL and validates via `validateSpec` in page flow.
4. [BROWSER] Consent modal blocks interaction until acknowledgment is accepted.
5. [BROWSER] User selects PNG or JPEG in `UploadZone` and triggers `runAnalysis(file)`.
6. [BROWSER] `useClarityRay` transitions status through preprocessing and running phases.
7. [BROWSER] `lib/clarity/preprocess.ts` decodes and normalizes the image into tensor input.
8. [BROWSER] `lib/clarity/run.ts` executes ONNX inference in the browser.
9. [BROWSER] `lib/clarity/postprocess.ts` applies activation and threshold-based safety translation.
10. [BROWSER] `generateHeatmap` creates a local attention visualization.
11. [BROWSER] Results and disclaimer render in `ResultsPanel` and heatmap renders in `GradCAMViewer`.
12. [NONE — no network] Inference math and result derivation stay on-device after model/spec artifacts are loaded.

### Journey 2 — Researcher submits a model

1. [LOCAL MACHINE] Researcher runs `clarityray upload` from converter CLI.
2. [LOCAL MACHINE] CLI detects framework and converts to ONNX when needed.
3. [LOCAL MACHINE] CLI validates ONNX structure, shapes, operator compatibility, and inference finiteness.
4. [LOCAL MACHINE] CLI generates schema-valid `clarity.json` from ONNX metadata and classes.
5. [LOCAL MACHINE] CLI writes package outputs `model.onnx` and `clarity.json`.
6. [PLATFORM SERVER] Optional submit step is attempted unless `--no-upload` is used.
7. [UNKNOWN] Production upload destination and release publication process are not documented in files read.

### Journey 3 — User selects a model from the library

1. [BROWSER] User opens `/models` and browser fetches `/api/models`.
2. [BROWSER] User filters published model cards and opens `/models/[slug]`.
3. [BROWSER] Detail page fetches `/api/models/:slug` and model `clarity.json` metadata.
4. [BROWSER] User selects the model and slug is stored in localStorage.
5. [BROWSER + SERVER] User returns to `/analysis` and selected model detail is re-fetched.
6. [BROWSER] Browser runtime performs local inference path as defined in Journey 1.

## SECTION 8 — FORBIDDEN PATTERNS

| Forbidden pattern | Why it is forbidden | What to do instead |
|---|---|---|
| `fetch()` sending scan image bytes to server during analysis | This breaks the privacy invariant and AGENTS policy. | Keep decode, preprocessing, inference, and postprocess entirely in browser memory. |
| Importing `utils/api.ts` in `app/analysis/page.tsx` | AGENTS explicitly forbids this path coupling. | Use active runtime modules in `lib/clarity/*` and model metadata APIs only. |
| Importing `utils/auth.ts` in `app/analysis/page.tsx` | AGENTS explicitly forbids this path coupling. | Keep analysis flow auth-independent in active route. |
| Hardcoded labels outside `clarity.json` in generic runtime | This causes class mismatch and breaks model-agnostic behavior. | Read labels from `spec.output.classes` only. |
| Hardcoded normalization constants outside `clarity.json` in generic runtime | This can silently mismatch model preprocessing assumptions. | Read normalization from `spec.input.normalize` and validate dimensions. |
| `certified: true` in any `clarity.json` | Schema and policy disallow researcher-side certification claims. | Keep `certified: false` and represent validation status in approved fields. |
| Definitive diagnosis claims in UI copy | This is unsafe for a screening tool. | Use uncertainty language such as "possible finding" and clinician-review wording. |
| Assuming 14 output classes | Current active spec defines a two-class output. | Always derive output mapping from `spec.output.classes`. |

### Forbidden safety language phrases

- Do not claim direct diagnosis from model output.
- Do not use definitive finding statements implying certainty.
- Do not use direct patient-disease statements.
- Do not use wording like "confirms" or diagnostic "shows" claims.

## SECTION 9 — COMMANDS

### Development

| Command | What it does | When to run it | Directory |
|---|---|---|---|
| `npm run dev` | Starts Next.js app router frontend. | During frontend/runtime development. | `/home/shubh/Documents/Clarity` |
| `npm run dev:api` | Starts retired Express backend workspace process. | Only for explicit legacy backend checks. | `/home/shubh/Documents/Clarity` |
| `npm run start:api` | Starts backend production script from nested backend package. | Only when validating legacy backend start behavior. | `/home/shubh/Documents/Clarity` |

### Type checking

| Command | What it does | When to run it | Directory |
|---|---|---|---|
| `npx tsc --noEmit` | Runs strict TypeScript type checks without emit. | After each TypeScript change. | `/home/shubh/Documents/Clarity` |
| `npm run lint` | Runs ESLint checks. | Before commit or release candidate checks. | `/home/shubh/Documents/Clarity` |

### Converter

| Command | What it does | When to run it | Directory |
|---|---|---|---|
| `pip install -e ".[pytorch]"` | Installs converter package with PyTorch extras. | Before local conversion from PyTorch models. | `/home/shubh/Documents/Clarity/converter` |
| `clarityray --help` | Shows converter CLI options. | Before first conversion/upload run. | `/home/shubh/Documents/Clarity/converter` |
| `clarityray upload <model_path> --classes ... --bodypart ... --modality ...` | Converts, validates, packages, and optionally submits artifacts. | During researcher packaging flow. | `/home/shubh/Documents/Clarity/converter` |

### Testing

| Command | What it does | When to run it | Directory |
|---|---|---|---|
| `[UNKNOWN — no root test script in package.json]` | No frontend test script is currently declared in root scripts. | Add explicit test script before CI test standardization. | `/home/shubh/Documents/Clarity` |
| `python -m pytest` | Executes Python tests when present. | Use only after adding converter/API tests. | `/home/shubh/Documents/Clarity` |

### Deployment

| Command | What it does | When to run it | Directory |
|---|---|---|---|
| `npm run build` | Builds production Next.js bundle. | Before deployment. | `/home/shubh/Documents/Clarity` |
| `npm run start` | Starts production Next.js server. | Local production smoke check. | `/home/shubh/Documents/Clarity` |

## SECTION 10 — KNOWN ISSUES AND RISKS

| Issue name | Current status | Impact if unresolved | Fix or mitigation |
|---|---|---|---|
| Manifest model/spec URLs still placeholders | Exists | Runtime cannot fetch production artifacts from valid hosted paths. | Replace `YOUR_USERNAME` URLs with real hosted artifact URLs in `public/models/manifest.json`. |
| Integrity expectation mismatch (`integrity.sha256`) | Exists | Model loading fails in hook path because expected hash is missing in fetched spec. | Align schema/spec/loader contract for integrity field and keep SHA-256 verification enforced. |
| Legacy and generic runtime coexistence drift | Exists | Behavior can diverge between `lib/models/chestXray/*` and `lib/clarity/*`. | Keep analysis route on generic path and avoid wiring legacy pipeline into active flow. |
| IndexedDB and Cache API quota variance | Not yet addressed | Model caching may be inconsistent across browsers or low-storage devices. | Add quota-aware fallback and cache-eviction/user messaging strategy. |
| Converter threshold defaults differ from active model spec | Exists | Packaged model behavior can vary unexpectedly across tools. | Define threshold governance and align converter defaults with policy or per-model calibration workflow. |
| Regulatory pathway and validation governance not documented in code | Not yet addressed | Clinical interpretation risk remains if messaging expands beyond screening scope. | Keep screening-safe language and define explicit validation/governance artifacts before broader claims. |

## SECTION 11 — WHAT TO NEVER DO WHEN EDITING THIS CODEBASE

- Never add server-side inference for user scan analysis.
- Never send scan pixels or tensors over network requests during analysis.
- Never import `utils/api.ts` into `app/analysis/page.tsx`.
- Never import `utils/auth.ts` into `app/analysis/page.tsx`.
- Never hardcode labels or normalization for generic runtime outside `clarity.json`.
- Never set `certified: true` in any model spec.
- Never assume 14 classes without reading active spec output classes.
- Never remove COOP/COEP headers from `next.config.ts`.
- Never bypass `validateSpec` before using model metadata in analysis route.
- Never use definitive diagnosis language in user-facing result text.
- Always keep inference on-device in browser runtime modules.
- Always run `npx tsc --noEmit` after TypeScript changes.

## SECTION 12 — OPEN QUESTIONS

| Question | Options | What is blocking the decision |
|---|---|---|
| Where should production model/spec artifacts be hosted and versioned? | Option A is Hugging Face model repo with stable paths, and Option B is alternate static hosting with same contract. | `manifest.json` still contains placeholders and no finalized production URL policy file is present. |
| How should integrity metadata be represented in schema and runtime contract? | Option A is add `integrity.sha256` to schema/spec, and Option B is move expected hash to manifest and keep spec schema unchanged. | Current runtime expects integrity in spec while schema and active spec omit it. |
| Should legacy `lib/models/chestXray/*` be removed or frozen? | Option A is fully remove legacy path, and Option B is keep it for reference with explicit non-runtime boundary. | No written deprecation and removal milestone is present in files read. |
| What is the official publish workflow from converter output to model browser availability? | Option A is converter submit API plus platform registry, and Option B is manual artifact upload plus metadata registration. | Upload destination and release runbook are not documented in converter and API files read. |
| What test strategy should be standardized for runtime and converter paths? | Option A is add TS unit and integration tests plus Python validator tests, and Option B is rely on manual smoke checks only. | Root `package.json` has no test script and no shared CI test workflow file was read. |

## SECTION 13 — CONTEXT FILE METADATA

```text
Generated: 2026-04-04
Generated from:
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
  /home/shubh/Documents/Clarity/lib/clarity/types.ts
  /home/shubh/Documents/Clarity/lib/clarity/preprocess.ts
  /home/shubh/Documents/Clarity/lib/clarity/run.ts
  /home/shubh/Documents/Clarity/lib/clarity/postprocess.ts
  /home/shubh/Documents/Clarity/lib/models/chestXray/config.ts
  /home/shubh/Documents/Clarity/lib/models/chestXray/preprocess.ts
  /home/shubh/Documents/Clarity/lib/models/chestXray/run.ts
  /home/shubh/Documents/Clarity/lib/models/chestXray/postprocess.ts
  /home/shubh/Documents/Clarity/components/ConsentModal.tsx
  /home/shubh/Documents/Clarity/components/UploadZone.tsx
  /home/shubh/Documents/Clarity/components/ResultsPanel.tsx
  /home/shubh/Documents/Clarity/components/GradCAMViewer.tsx
  /home/shubh/Documents/Clarity/utils/api.ts
  /home/shubh/Documents/Clarity/utils/auth.ts
  /home/shubh/Documents/Clarity/utils/types.ts
  /home/shubh/Documents/Clarity/converter/clarityray/cli.py
  /home/shubh/Documents/Clarity/converter/clarityray/spec.py
  /home/shubh/Documents/Clarity/converter/clarityray/validate.py
  /home/shubh/Documents/Clarity/converter/pyproject.toml
  /home/shubh/Documents/Clarity/public/models/densenet121-chest/clarity.json
  /home/shubh/Documents/Clarity/supabase/migrations/001_create_models.sql
  /home/shubh/Documents/Clarity/supabase/migrations/002_indexes.sql
  /home/shubh/Documents/Clarity/supabase/migrations/003_allow_validation_failed_status.sql
  /home/shubh/Documents/Clarity/api/main.py
Files not found: None
Next update: Regenerate after phase boundary changes, schema contract changes, or runtime loading-flow changes.
How to regenerate: codex --file generate-context-prompt.md
```

Context file generated.
Sections complete: 13/13
Files read: 35
Files not found: 0
Current phase: Phase 5 — Platform backend + model browser
Next task: Replace placeholder manifest artifact URLs and align integrity metadata between schema, clarity.json, and runtime loader.

./start_api.sh[execute backend]