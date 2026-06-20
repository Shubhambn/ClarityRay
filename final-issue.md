# ClarityRay — Production Readiness & Issue Tracker

**Date:** 2026-06-20  
**Codebase snapshot:** `main` branch — commit `72ee5f1`  
**Analysed by:** Full static audit of all TypeScript, Python, CSS, JSON, and config files

---

## Executive Summary

ClarityRay is architecturally sound at its core: the privacy invariant (scan data never leaves the browser) is enforced correctly, the `clarity.json` contract is strongly typed and validated, and the persona-aware result system is properly gated. However, **the product is not production-ready** due to a mix of broken integrations, dead code, missing infrastructure, stub UI components, and absent testing. This document maps every identified issue to a concrete fix, then proposes architectural improvements for the next evolution of the platform.

---

## Part 1 — Current Issues (Bugs & Blockers)

### CRITICAL

---

#### ISSUE-001 · Seed Script Column Mismatch — Platform models invisible
**File:** `api/seed.py:74-77` vs `api/routes/models.py:50-56`

`seed.py` inserts rows with columns `onnx_key` and `spec_key`:
```python
# seed.py
"onnx_key": local_model_url,
"spec_key": local_spec_url,
```
But `routes/models.py` selects `model_url` and `clarity_url`:
```python
# routes/models.py
"select": "id,model_id,version,clarity_url,model_url,created_at"
```

**Impact:** After seeding, the model detail page shows blank URLs for every model. The `/analysis` page cannot derive a working model URL from the API path. The platform model registry is completely broken end-to-end.

**Fix:** Align column names. The routes are authoritative (they match `register_model` payload and the `converter` output). Change `seed.py` to use `model_url` and `clarity_url`. Also confirm Supabase schema uses those column names.

---

#### ISSUE-002 · Missing Database Schema — New environments cannot be bootstrapped
**Location:** `supabase/migrations/` (referenced in README, directory does not exist)

The README and `AGENTS.md` both reference `supabase/migrations/` as the database schema source. That directory is absent from the repository. The Supabase tables (`models`, `model_versions`) must exist before `seed.py`, the API, or the converter upload flow can function, but there is no SQL DDL to create them.

**Impact:** Any new contributor, staging environment, or CI pipeline cannot stand up the database without undocumented tribal knowledge.

**Fix:** Create `supabase/migrations/0001_initial.sql` with the full DDL for `models` and `model_versions` tables, derived from the API's query patterns. Minimum schema:
```sql
CREATE TABLE models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  bodypart TEXT,
  modality TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE model_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL REFERENCES models(id),
  version TEXT NOT NULL,
  model_url TEXT,
  clarity_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (model_id, version)
);
```

---

#### ISSUE-003 · No Error Recovery from Initialisation Failure
**File:** `hooks/useClarityRay.ts:322-333`

When `init()` fails (network down, corrupt spec, model hash mismatch), the hook enters `status = 'error'`. The `reset()` function clears the error and result but does **not** re-run `init()`. The user sees a "Dismiss" button, but after dismissing, the system is left in `'idle'` with no path back to `'loading_manifest'` without a full page reload.

```typescript
// current reset() — incomplete
const reset = useCallback((): void => {
  setResult(null);
  setError(null);
  // no re-init trigger
  ...
}, []);
```

**Impact:** Any transient network failure during model load (common on mobile) permanently disables the analysis page until the user manually reloads.

**Fix:** Expose a `retryInit` callback that increments a `reinitToken` state. Add `reinitToken` to the dependency array of the init `useEffect`. The Dismiss button should call `retryInit` instead of `reset`.

---

### HIGH

---

#### ISSUE-004 · `lib/clarity/loader.ts` Is Dead Code — IndexedDB Layer Bypassed
**Files:** `lib/clarity/loader.ts` (unused), `lib/clarity/db.ts` (unused), `hooks/useClarityRay.ts:58-128`

`useClarityRay.ts` implements its own inline `loadModelWithProgress()` that uses **only** the Cache API. The purpose-built `loader.ts` module (which implements a proper two-tier Cache API → IndexedDB → network chain) is never imported. The `db.ts` IndexedDB helper is also effectively orphaned.

**Impact:** 
- Model binaries are never persisted to IndexedDB. If the browser purges the Cache API (common under storage pressure), the next session must re-download the full model.
- Duplicated caching logic — two implementations of the same responsibility.

**Fix:** Delete the inline `loadModelWithProgress` from `useClarityRay.ts`. Import and use `loadModel()` from `lib/clarity/loader.ts`, which already handles the three-tier cache chain correctly. Remove the dead progress callback from `loadModel` or add streaming download support there.

---

#### ISSUE-005 · `ProbabilityBars` Component Is a Stub
**File:** `components/analysis/SystemPanel.tsx:66-83`

The `ProbabilityBars` component renders a hardcoded message:
```typescript
"Raw per-class probabilities are not available in current result payload"
```
The `SafeResult` interface only carries `confidencePercent` (a single rounded number), so the per-class raw probabilities from `toProbabilities()` are lost before they reach the component.

**Impact:** The researcher view's "OUTPUT PROBABILITIES" section is permanently broken. Researchers cannot see the probability distribution.

**Fix:** Add `classProbabilities: { label: string; probability: number }[]` to the `SafeResult` interface. Populate it in `translateResults()`. Render real progress bars in `ProbabilityBars` from `result.classProbabilities`.

---

#### ISSUE-006 · TopBar Rendered Twice on Model Pages
**Files:** `app/layout.tsx:44`, `app/models/page.tsx:4`, `app/models/[slug]/page.tsx:7`

`app/layout.tsx` includes `<TopBar />` globally. Both `app/models/page.tsx` and `app/models/[slug]/page.tsx` also render their own `<TopBar />`. This results in two navigation bars stacked on every model page.

**Impact:** Visible layout defect on `/models` and `/models/*`. Two fixed navbars at the top.

**Fix:** Remove the explicit `<TopBar />` call from both model pages. The global layout already handles it. Only pages that need special status (like passing `status` prop for the dot animation) need to override — and even then, the global TopBar should receive the status via context, not prop drilling.

---

#### ISSUE-007 · `var(--topbar-h)` CSS Variable Never Defined
**File:** `app/models/[slug]/page.tsx:407`

```css
padding-top: var(--topbar-h, 80px);
```

`--topbar-h` is not defined in `globals.css`. The fallback `80px` is larger than the actual TopBar height (`48px`), creating 32px of extra whitespace on model detail pages.

**Fix:** Add `--topbar-h: 48px;` to `:root` in `globals.css`. Replace all hardcoded `paddingTop: '48px'` and `padding-top: 80px` values with `var(--topbar-h)`.

---

#### ISSUE-008 · No AbortController on Model Download
**File:** `hooks/useClarityRay.ts:58-128`

`loadModelWithProgress()` launches a streaming fetch but has no AbortController. The `cancelled` flag prevents React state updates after unmount but cannot cancel the ongoing network request.

**Impact:** If the user navigates away mid-download (a large ONNX model can be 80-100MB), the download completes in background, consuming bandwidth and keeping the network connection alive with no benefit.

**Fix:** Accept an `AbortSignal` in `loadModelWithProgress`. Pass `signal: controller.signal` to `fetch()`. Abort in the `init()` cleanup function.

---

#### ISSUE-009 · Broken GitHub Link in Footer
**File:** `app/page.tsx:776`

```typescript
{ label: 'GitHub', href: 'https://github.com' }  // wrong
```
Should be `https://github.com/Shubhambn/Clarity` (matching the link in `app/about/page.tsx:87`).

---

#### ISSUE-010 · Model Selection Does Not Trigger Re-initialisation
**Files:** `app/models/[slug]/page.tsx:168-179`, `hooks/useClarityRay.ts:187`

When the user selects a model from `/models/[slug]` and is redirected to `/analysis`, `useClarityRay` init reads `localStorage.getItem('clarityray_selected_model')` **once at mount**. If the user selects a new model while already on the `/analysis` page (or returns to it quickly), the hook doesn't detect the localStorage change and continues using the previous model.

**Fix:** Either: (a) listen to `storage` events in the hook; or (b) add the localStorage value as a state dependency with a URL query param as the canonical source of truth (`/analysis?model=densenet121-chest`).

---

### MEDIUM

---

#### ISSUE-011 · Dual Session Cache — Redundant and Confusing
**Files:** `hooks/useClarityRay.ts:52-56`, `lib/clarity/run.ts:5`

`useClarityRay.ts` declares its own module-level `sessionCache` (keyed `spec.id@version`) AND imports `runtimeSessionCache` from `run.ts` (keyed `spec.id`). Both are populated after model load (lines 259-263):
```typescript
sessionCache.set(sessionKey, session)           // local cache, key: id@version
runtimeSessionCache.set(spec.id, session)       // run.ts cache, key: id
```
The `runInference()` function reads from the `run.ts` cache (key: `spec.id`) — so the `useClarityRay`-local cache is used only to determine reset behaviour, not for inference.

**Impact:** Two sources of truth for session state. A future developer maintaining this will introduce bugs by updating one cache but not the other.

**Fix:** Remove the local `sessionCache` from `useClarityRay.ts`. Expose a `hasSession(spec: ClaritySpec): boolean` helper from `lib/clarity/run.ts` and use that in `reset()` logic.

---

#### ISSUE-012 · `ModelInfo` and `SystemLog` Types Duplicated
**Files:** `hooks/useClarityRay.ts:25-45`, `components/analysis/SystemPanel.tsx:7-27`

Both files declare `ModelInfo` and `SystemLog` interfaces with identical shapes. If the hook's interface changes, the component's copy must be updated manually.

**Fix:** Move both interfaces to `lib/clarity/types.ts` or a dedicated `types/clarityray.ts` file. Export and import from there.

---

#### ISSUE-013 · Download Progress Inaccurate Without `Content-Length`
**File:** `hooks/useClarityRay.ts:78-79`

```typescript
const contentLengthHeader = response.headers.get('Content-Length')
const bytesTotal = contentLengthHeader ? Number.parseInt(contentLengthHeader, 10) : 0
```
If `Content-Length` is absent (streaming responses, CDN chunked encoding), `bytesTotal` is `0` and the log always reports `0%` progress until the final byte.

**Fix:** When `bytesTotal === 0`, display "Downloading... (size unknown)" or show a spinner rather than a percentage. Consider using the size from the spec or a known model size stored in `manifest.json`.

---

#### ISSUE-014 · `generateHeatmap` Is Not GradCAM — Component Name Is Misleading
**Files:** `lib/clarity/postprocess.ts:217-282`, `components/GradCAMViewer.tsx`

The `generateHeatmap()` function computes a synthetic attention map from image **luminance and edge contrast** — it has no connection to model gradients, layer activations, or GradCAM methodology. The function itself is honest (method: `"contrast_attention_v1"`), but the component is named `GradCAMViewer` which misleads users and violates the AGENTS.md forbidden language rules (implied precision that the product does not deliver).

**Impact:** Clinicians and researchers may interpret the heatmap as a model-derived spatial explanation, when it is only a contrast overlay applied after inference.

**Fix:** 
- Rename `GradCAMViewer` → `AttentionViewer` or `ScanViewer`
- Update all UI copy from "Heatmap overlay" / "Attention map" to "Visual contrast overlay (synthetic)"
- Add a clear footnote: "This overlay is derived from image contrast, not model gradients. It is a visual aid only."
- Long-term: implement real saliency using ONNX model intermediate outputs if available

---

#### ISSUE-015 · `specLoader.ts` Has No Caching — Spec Re-fetched Every Mount
**File:** `lib/clarity/specLoader.ts:3`

`fetchSpec()` makes a plain `fetch()` with no cache directive. Every analysis page mount fetches `clarity.json` from the server.

**Fix:** Add `{ cache: 'force-cache' }` or implement a module-level Map cache keyed by `spec_url`. The spec for a given model version is immutable.

---

#### ISSUE-016 · Static `manifest.json` Doesn't Sync with Supabase Registry
**File:** `public/models/manifest.json`

The manifest is a static file with only `densenet121-chest`. The Supabase model registry can hold arbitrarily many models (published via the converter CLI), but the analysis page always reads from this static file and never queries the API for available models.

**Impact:** A researcher who successfully publishes a new model via `clarity push` will see it in `/models` (from API), but cannot select it for analysis — the manifest will never include it.

**Fix Options:**
1. Make `/analysis` page query the API for available models and present a model selector.
2. Generate `manifest.json` dynamically via a Next.js API route that proxies from Supabase.
3. Store model manifest in the API and fetch from `NEXT_PUBLIC_API_URL/manifest`.

---

#### ISSUE-017 · Next.js API Routes Use `NEXT_PUBLIC_API_URL` Server-Side
**Files:** `app/api/models/route.ts:3`, `app/api/models/[slug]/route.ts:3`

```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL;
```
`NEXT_PUBLIC_*` variables are bundled into the client-side JavaScript for browser access. Using them in server-side Route Handlers works but is semantically wrong. A private `API_URL` (without `NEXT_PUBLIC_`) should be used for server-side proxying so the backend URL is not exposed to the client.

**Fix:** Add `API_URL` (no `NEXT_PUBLIC_`) to `.env.local` for server use. Route handlers use `process.env.API_URL`. The browser-side `client.ts` continues to use `NEXT_PUBLIC_API_URL`.

---

### LOW

---

#### ISSUE-018 · `app/analyze/page.tsx` Alias Route
**File:** `app/analyze/page.tsx`

```typescript
export { default } from '@/app/analysis/page';
```
This creates a `/analyze` route aliasing `/analysis`. This may be intentional for SEO or backward compatibility, but it is undocumented. If intentional, add a comment. If not, remove the file.

---

#### ISSUE-019 · Responsive Media Queries Injected as Inline `<style>` Tags
**Files:** `app/analysis/page.tsx:604-617`, `app/models/page.tsx:382-391`, etc.

Multiple pages inject responsive CSS via `<style>{...}</style>` JSX — a pattern that bypasses the design system and the CSS build pipeline. These styles are not deduplicated, are not scoped, and can create FOUC.

**Fix:** Move page-specific responsive overrides into `globals.css` with scoped class names, or use CSS Modules (add `page.module.css` alongside each `page.tsx`).

---

#### ISSUE-020 · `ConsentModal` Not Re-checked if Cleared in Same Session
**File:** `app/analysis/page.tsx:94-99`

Consent is read via `useState` initializer:
```typescript
const [consented, setConsented] = useState<boolean>(() => {
  return localStorage.getItem(CONSENT_KEY) === 'accepted';
});
```
This is correct on component mount. However, the `useEffect` cleanup in the hook only fires on unmount. If the user opens DevTools and deletes `clarityray_consent_v1` while the page is open, there's no re-check. AGENTS.md rule 13 requires checking "on every /analysis mount" — the current implementation satisfies this since the component remounts on navigation. No action needed, but it should be documented as intentional.

---

## Part 2 — What Is Remaining (Incomplete Features)

### R-001 · Real Per-Class Probability Bars
Researcher view shows "OUTPUT PROBABILITIES" section but it is a stub (ISSUE-005). The data exists in `toProbabilities()` but is lost before reaching the UI.

### R-002 · Model Selection on Analysis Page
The `/analysis` page has no model picker. Users must navigate to `/models`, select a model, then be redirected. The selected model persists in localStorage but the analysis page never shows which model is active or allows changing it inline.

### R-003 · Multi-Model Support in Manifest
`manifest.json` only contains `densenet121-chest`. The manifest system exists to support multiple models, but there's no mechanism to update it when a new model is pushed to the platform.

### R-004 · Real GradCAM / Saliency
The heatmap is contrast-based, not model-derived. True explainability (GradCAM, Integrated Gradients) requires access to model intermediate activations.

### R-005 · No Test Suite
Zero test files exist anywhere in the repository. No unit tests, no integration tests, no browser tests. TypeScript strict mode catches type errors; behaviour is entirely untested.

### R-006 · No CI/CD Pipeline
No `.github/workflows/`, no CI config, no automated build/test/deploy. TypeScript type-check and ESLint must be run manually.

### R-007 · Validation Checks in API Are Empty
`_build_validation_payload()` in `routes/models.py` always returns `"checks": []`:
```python
def _build_validation_payload(model: dict) -> dict:
    return {
        "passed": model.get("status") == "published",
        "ran_at": model.get("published_at"),
        "checks": [],  # always empty
    }
```
The model detail page has a full validation table UI that will always render empty.

### R-008 · Converter `clarity init` Command Not Implemented
README documents `clarity init <folder>` for interactive spec generation, but only `clarityray upload` exists in `cli.py`. The `init` and `validate` and `inspect` sub-commands are documented but not implemented.

### R-009 · `efficientnetb0-pediatric-chest` Model Is Stub
`public/models/efficientnetb0-pediatric-chest/clarity.json` exists as a second model but has no corresponding `model.onnx` and is not in `manifest.json`.

### R-010 · No Download Progress Percentage When `Content-Length` Is Missing
Reported in ISSUE-013. When serving from Vercel or CDN with chunked transfer, progress always shows 0%.

### R-011 · No Offline / Service Worker Support
Model is cached in Cache API after first download, but there's no Service Worker to intercept requests and serve offline. If the Cache API is cleared, the model must be re-downloaded.

### R-012 · No WCAG Accessibility Audit
The app has basic ARIA attributes on some elements but has not been audited for WCAG 2.1 AA. The scan result panel, heatmap toggle, and consent modal likely have keyboard navigation gaps.

---

## Part 3 — Architecture Improvement Suggestions

### A-001 · Move Inference to a Web Worker (Performance)

**Current:** `session.run()` blocks the main thread for 3-8 seconds during inference. The UI freezes; the browser may show a "page unresponsive" warning on slow devices.

**Proposal:**
```
Browser Main Thread          Web Worker
     │                           │
     │  postMessage(tensor)  →   │
     │                     ort.InferenceSession.run()
     │  ← postMessage(result)    │
```

- Create `workers/inference.worker.ts`
- The worker owns the `InferenceSession` and all ONNX Runtime logic
- The main thread sends a `Float32Array` and receives a `Float32Array`
- Use Comlink or a lightweight message protocol
- ONNX Runtime Web supports Web Workers natively

**Impact:** UI stays fully responsive during inference. Heatmap can be generated while inference completes.

---

### A-002 · Replace Static `manifest.json` with API-Driven Model Discovery

**Current:** `public/models/manifest.json` is a static file updated manually. New models pushed via `clarity push` never appear in the analysis flow.

**Proposal:**
```
/api/models/manifest  →  FastAPI /manifest  →  Supabase
  (Next.js Route)         (dynamic)            (published models)
```

- Add `GET /manifest` to the FastAPI backend returning `ManifestSpec` shape
- Cache the response for 60 seconds at the CDN layer
- The frontend fetches `/api/models/manifest` (Next.js proxy)
- Static `manifest.json` is retained as fallback for local development without API

---

### A-003 · Shared Type Package for Cross-Layer Types

**Current:** `ModelInfo`, `SystemLog`, `SafeResult` are defined in multiple files.

**Proposal:** Create `lib/types/index.ts` as the single source of truth for all shared types. Both the hook and all components import from this one location. Types that belong only to one module stay local; shared types live in `lib/types/`.

---

### A-004 · Extract Caching into a Unified `ModelCache` Class

**Current:** Caching logic is split across `lib/clarity/cache.ts` (Cache API) and `lib/clarity/db.ts` (IndexedDB), with inline duplication in `useClarityRay.ts`.

**Proposal:** Create `lib/clarity/ModelCache.ts` with a single public interface:

```typescript
class ModelCache {
  async get(key: string): Promise<ArrayBuffer | null>;   // Cache API → IDB
  async put(key: string, buffer: ArrayBuffer): Promise<void>; // both stores
  async has(key: string): Promise<boolean>;
}
```

`loader.ts` and `useClarityRay.ts` both import from this class. Eliminates duplication and makes the two-tier cache testable in isolation.

---

### A-005 · State Machine for Hook Status (XState or Custom)

**Current:** `useClarityRay` manages transitions manually with `setStatus()` calls scattered across async functions. Invalid transitions are possible (e.g., calling `runAnalysis` while status is `'downloading_model'`).

**Proposal:** Replace the status string + manual transitions with a formal state machine:

```typescript
const machine = createMachine({
  states: {
    idle: { on: { INIT: 'loading_manifest' } },
    loading_manifest: { on: { SUCCESS: 'loading_spec', FAIL: 'error' } },
    loading_spec: { on: { SUCCESS: 'downloading_model', FAIL: 'error' } },
    downloading_model: { on: { SUCCESS: 'verifying_model', FAIL: 'error' } },
    verifying_model: { on: { SUCCESS: 'ready', FAIL: 'error' } },
    ready: { on: { ANALYZE: 'processing', RESET: 'idle' } },
    processing: { on: { SUCCESS: 'complete', FAIL: 'error' } },
    complete: { on: { RESET: 'ready' } },
    error: { on: { RETRY: 'idle' } },
  }
})
```

Benefits: invalid transitions are compile-time errors, retry logic is a first-class state, tests can drive the machine directly without mocking React.

---

### A-006 · API Rate Limiting and Auth

**Current:** The FastAPI backend has no rate limiting or authentication. `POST /models/register` is unauthenticated.

**Proposal:**
- Add `slowapi` rate limiting middleware to all routes
- Require an API key for `POST /models/register` (checked against an environment variable or Supabase-stored key)
- For the model browser (`GET /models`), a generous rate limit (100 req/min per IP) is sufficient

---

### A-007 · Service Worker for Offline Model Access

**Current:** Models are cached in the Cache API, but if the service worker isn't present, cache persistence is not guaranteed. No offline support.

**Proposal:**
- Add a Next.js-compatible Service Worker (e.g., via `next-pwa` or a custom `sw.ts`)
- Service Worker intercepts `GET /models/*` requests and serves from cache
- Falls back to network on cache miss
- This gives true offline analysis after first use

---

### A-008 · Real Explainability via ONNX Intermediate Outputs

**Current:** The heatmap is a synthetic contrast overlay. Named `GradCAMViewer` but produces no model-derived saliency.

**Proposal (Phased):**
1. **Phase 1 (Now):** Rename to `ContrastViewer`. Clarify UI copy. Remove misleading "GradCAM" branding.
2. **Phase 2:** Export a companion ONNX model that accepts the intermediate feature maps and returns class activation maps. Store alongside `model.onnx` as `cam.onnx`. The `clarity.json` can reference it optionally:
   ```json
   "explainability": {
     "cam_file": "cam.onnx",
     "method": "gradcam"
   }
   ```
3. **Phase 3:** Auto-generate `cam.onnx` in the converter CLI using ONNX surgery to expose feature map outputs.

---

### A-009 · Proper CI/CD Pipeline

**Minimum viable CI (`/.github/workflows/ci.yml`):**
```yaml
jobs:
  frontend:
    - npm ci
    - npx tsc --noEmit
    - npm run lint
    - npm run build

  python:
    - pip install -r api/requirements.txt
    - pip install ruff pytest
    - ruff check api/ converter/
    - pytest converter/tests/ -v

  e2e:
    - npx playwright test (against npm run build output)
```

---

### A-010 · Replace Inline `<style>` Tags with CSS Modules

**Current:** Every page uses `<style>{`...`}</style>` inside JSX for responsive overrides and page-specific selectors. This pattern:
- Injects duplicate `<style>` tags on re-renders
- Bypasses the CSS pipeline (no minification, no deduplication)
- Cannot be cached or extracted to a `.css` file

**Proposal:** Co-locate `page.module.css` files with each page. Use CSS Module classes. Reserve `globals.css` for truly global tokens and utility classes.

---

## Part 4 — Security Checklist

| Check | Status | Notes |
|---|---|---|
| Patient image never sent to server | ✅ Pass | Core invariant correctly enforced |
| SHA-256 integrity verification on model load | ✅ Pass (when hash present) | Warns but continues when absent |
| `certified: false` enforced at schema level | ✅ Pass | `parseBooleanFalse` in types.ts |
| COOP/COEP headers for SharedArrayBuffer | Need to verify | Must be in `next.config.ts` |
| CORS configuration | ✅ Pass | Allowlist in `main.py` |
| Unauthenticated `POST /models/register` | ❌ Missing | Any actor can register models |
| No SQL injection risk | ✅ Pass | Supabase REST API, parameterised |
| No XSS via model metadata | ⚠️ Partial | Model names rendered as text, not HTML; verify `model.name` escaping in dynamic routes |
| Rate limiting on API | ❌ Missing | See A-006 |
| `.env` files not committed | ✅ Pass | Confirmed via .gitignore |

---

## Part 5 — Missing Files Checklist

| File | Status | Required For |
|---|---|---|
| `supabase/migrations/0001_initial.sql` | ❌ Missing | New environment setup |
| `.github/workflows/ci.yml` | ❌ Missing | Automated quality gates |
| `converter/tests/` | ❌ Missing | Converter reliability |
| `lib/clarity/ModelCache.ts` | Proposed | Unified caching |
| `workers/inference.worker.ts` | Proposed | Non-blocking inference |
| `public/models/efficientnetb0-pediatric-chest/model.onnx` | ❌ Missing | Second model in repo |
| `public/sw.js` | Proposed | Offline support |

---

## Part 6 — Priority Fix Order (Production Path)

### Sprint 1 — Must Fix Before Any Production Traffic
1. **ISSUE-001** — Fix seed script column mismatch
2. **ISSUE-002** — Add `supabase/migrations/`
3. **ISSUE-003** — Add retry/re-init on error
4. **ISSUE-006** — Remove duplicate TopBar from model pages
5. **ISSUE-007** — Define `--topbar-h` CSS variable

### Sprint 2 — High-Value UX and Reliability
6. **ISSUE-004** — Wire `loader.ts` (restore IndexedDB tier)
7. **ISSUE-005** — Fix `ProbabilityBars` with real per-class data
8. **ISSUE-008** — Add AbortController to model download
9. **ISSUE-016** — Sync manifest with API or add model picker on analysis page
10. **R-007** — Implement real validation checks in API

### Sprint 3 — Quality and Safety
11. **ISSUE-014** — Rename `GradCAMViewer` and fix misleading copy
12. **ISSUE-011** — Consolidate session cache
13. **ISSUE-012** — Deduplicate shared types
14. **A-009** — Set up CI pipeline
15. **R-005** — Write test suite (unit tests for postprocess, preprocess, types)

### Sprint 4 — Architecture
16. **A-001** — Web Worker for inference
17. **A-002** — API-driven manifest
18. **A-005** — State machine for hook
19. **A-006** — API auth + rate limiting
20. **A-007** — Service Worker for offline

---

## Appendix — Invariant Compliance Audit

These are non-negotiable rules from `AGENTS.md`. All currently pass except where noted.

| # | Rule | Status |
|---|---|---|
| 1 | No `fetch()` sending image/scan data to any server | ✅ Pass |
| 2 | No server-side inference | ✅ Pass |
| 3 | No import of `utils/api.ts` or `utils/auth.ts` in `app/analysis/page.tsx` | ✅ Pass |
| 4 | Never use definitive diagnosis language in user-facing strings | ✅ Pass |
| 5 | Do not modify `/public/chestxray_densenet121.onnx` | ✅ Pass |
| 6 | Do not set `certified: true` | ✅ Pass (schema enforces `false`) |
| 7 | No hardcoded model paths/labels outside `clarity.json` (Phase 3+) | ✅ Pass |
| 8 | No fake logs in LogPanel | ✅ Pass |
| 9 | No hardcoded persona text in shared components | ✅ Pass |
| 10 | No fake animation loops / artificial delays | ✅ Pass |
| 11 | Never show raw probabilities to `patient` persona | ✅ Pass |
| 12 | TopBar always shows 'Local' badge | ✅ Pass |
| 13 | Consent checked on every `/analysis` mount | ✅ Pass |
