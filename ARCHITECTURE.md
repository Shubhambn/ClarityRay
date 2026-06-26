# ClarityRay — Architecture Reference

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [Repository Structure](#3-repository-structure)
4. [System Architecture](#4-system-architecture)
5. [Data Flow Pipelines](#5-data-flow-pipelines)
6. [Frontend Architecture](#6-frontend-architecture)
7. [Backend Architecture](#7-backend-architecture)
8. [ML / Inference Pipeline](#8-ml--inference-pipeline)
9. [Model Publishing Pipeline](#9-model-publishing-pipeline)
10. [Database & Storage](#10-database--storage)
11. [API Reference](#11-api-reference)
12. [Configuration](#12-configuration)
13. [Architecture Invariants](#13-architecture-invariants)
14. [Development Guide](#14-development-guide)

---

## 1. Project Overview

ClarityRay is a **privacy-first, browser-local medical imaging AI platform**. Researchers publish ONNX models with a structured spec contract (`clarity.json`). Clinicians and patients run inference entirely inside the browser — scan pixels never leave the device.

**Core pillars:**

| Pillar | Implementation |
|--------|---------------|
| Privacy | Inference runs in-browser via ONNX Runtime Web (WebAssembly). No scan data is ever sent to any server. |
| Spec-driven | All model behaviour (labels, normalization, thresholds, task type) is declared in `clarity.json`. Runtime reads the spec; no model-specific code is ever hardcoded. |
| Persona-aware | Three output personas — `researcher`, `doctor`, `patient` — control what result text is shown and at what verbosity. |
| Extensibility | Researchers push new models with the `clarityray` CLI; they appear on the platform without any frontend code changes. |
| Safety | Every result carries an explicit safety tier, disclaimer, and is gated behind a consent modal. Raw probabilities are never exposed to the `patient` persona. |

---

## 2. Technology Stack

### Frontend

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 16.2.1 |
| UI Library | React | 19.2.4 |
| Language | TypeScript (strict) | 5.x |
| Styling | TailwindCSS + PostCSS | 4.2.2 |
| Inference Engine | ONNX Runtime Web (WASM) | 1.24.3 |
| Unit Tests | Vitest + JSDOM | 4.1.9 / 29.1.1 |
| E2E Tests | Playwright | 1.54.2 |

### Backend

| Layer | Technology |
|-------|-----------|
| Framework | FastAPI (Python 3.10+) |
| Server | Uvicorn (ASGI) |
| Database | Supabase (Postgres) |
| DB Driver | psycopg |
| Rate Limiting | slowapi |
| Config | python-dotenv |

### Converter / CLI

| Layer | Technology |
|-------|-----------|
| CLI Framework | Typer |
| Model Format | ONNX 1.14+ |
| Validation | ONNX Runtime 1.16+ |
| Schema | jsonschema 4.0+ |
| Optional: PyTorch | PyTorch 2.0+ |
| Optional: Keras | TensorFlow 2.12+ |
| Upload | Hugging Face Hub |

---

## 3. Repository Structure

```
ClarityRay/
│
├── app/                        # Next.js App Router pages
│   ├── page.tsx                # Landing page
│   ├── layout.tsx              # Root layout (PersonaProvider, TopBar, fonts)
│   ├── globals.css             # CSS custom properties, dark theme
│   ├── error.tsx               # Error boundary
│   ├── not-found.tsx           # 404 page
│   ├── analysis/
│   │   ├── page.tsx            # Core inference UI
│   │   └── layout.tsx
│   ├── models/
│   │   ├── page.tsx            # Model browser
│   │   └── [slug]/page.tsx     # Model detail + selection
│   ├── onboarding/page.tsx     # 3-step persona setup
│   └── api/                    # Next.js API routes (proxy to FastAPI)
│       └── models/
│           ├── manifest/route.ts
│           ├── route.ts
│           └── [slug]/
│               ├── route.ts
│               └── spec/route.ts
│
├── components/                 # React components
│   ├── analysis/
│   │   ├── SystemPanel.tsx     # Persona-aware result display
│   │   ├── LogPanel.tsx        # Real-time event log
│   │   └── ResultOverlay.tsx   # Heatmap overlay on scan image
│   ├── models/
│   │   └── ModelCard.tsx       # Model browser card
│   ├── nav/
│   │   └── TopBar.tsx          # Global nav + privacy badge
│   ├── ConsentModal.tsx        # Safety consent gate
│   ├── UploadZone.tsx          # Drag-and-drop upload (PNG/JPEG)
│   ├── ContrastViewer.tsx      # Contrast/edge overlay viewer
│   ├── GradCAMViewer.tsx       # Grad-CAM attention map viewer
│   ├── ResultsPanel.tsx        # Result summary panel
│   ├── ServiceWorkerRegistrar.tsx
│   └── ui/                     # Base UI primitives
│       ├── button.tsx
│       ├── card.tsx
│       ├── input.tsx
│       ├── layout.tsx
│       └── toggle.tsx
│
├── hooks/
│   └── useClarityRay.ts        # Core inference state machine hook
│
├── lib/                        # Core libraries & business logic
│   ├── clarity/
│   │   ├── types.ts            # ClaritySpec interface + runtime validator
│   │   ├── manifest.ts         # Model registry fetch with static fallback
│   │   ├── specLoader.ts       # clarity.json spec fetcher
│   │   ├── loader.ts           # Model binary downloader + Cache API
│   │   ├── cache.ts            # Cache API helpers
│   │   ├── db.ts               # IndexedDB storage utilities
│   │   ├── hash.ts             # SHA-256 integrity verification
│   │   ├── preprocess.ts       # Image → Float32Array tensor
│   │   ├── run.ts              # ONNX Runtime Web + worker management
│   │   ├── postprocess.ts      # Logits → SafeResult (persona-aware)
│   │   ├── stateMachine.ts     # Status transition logic
│   │   ├── occlusion.ts        # Occlusion sensitivity heatmap
│   │   └── __tests__/          # Unit tests
│   ├── persona/
│   │   └── context.tsx         # Persona context provider
│   ├── api/
│   │   └── client.ts           # Backend fetch calls (metadata only)
│   ├── server/
│   │   ├── staticModels.ts     # Static bundled model registry
│   │   └── supabase.ts         # Supabase client
│   └── utils.ts
│
├── workers/
│   └── inference.worker.ts     # ONNX Runtime Web — offloaded inference
│
├── public/
│   └── models/                 # Bundled/static model artifacts
│       ├── manifest.json       # Static model registry (API fallback)
│       ├── densenet121-chest/
│       │   ├── model.onnx
│       │   └── clarity.json
│       ├── densenet121-cxr-suspicious/
│       ├── resnet50-cxr-suspicious/
│       └── brain-ctscan-cancer/
│
├── api/                        # FastAPI backend
│   ├── main.py                 # App bootstrap, CORS, rate limiting
│   ├── config.py               # Configuration management
│   ├── deps.py                 # FastAPI dependencies
│   ├── requirements.txt
│   ├── seed.py                 # DB seeding from bundled specs
│   ├── .env.example
│   ├── routes/
│   │   └── models.py           # All model endpoints
│   └── services/
│       ├── storage.py          # Supabase operations
│       └── validation.py       # Model validation checks
│
├── converter/                  # clarityray CLI tool
│   ├── pyproject.toml
│   └── clarityray/
│       ├── cli.py              # CLI entry (upload, validate)
│       ├── convert.py          # Framework conversion pipeline
│       ├── converters/
│       │   ├── pytorch.py
│       │   ├── keras.py
│       │   └── passthrough.py
│       ├── detect.py           # Auto-detect model framework
│       ├── spec.py             # clarity.json generator
│       ├── validate.py         # ONNX + schema validation
│       ├── upload.py           # HuggingFace upload + Supabase register
│       └── errors.py
│
├── supabase/
│   ├── migrations/             # Ordered DB migrations
│   │   ├── 001_create_models.sql
│   │   ├── 002_indexes.sql
│   │   ├── 003_allow_validation_failed_status.sql
│   │   ├── 004_minimal_model_registry.sql
│   │   ├── 005_model_task_validation.sql
│   │   └── 006_clarity_spec_json.sql
│   └── seed.sql
│
├── tests/                      # Test configuration
├── .github/                    # GitHub Actions CI/CD
├── clarity-schema.json         # JSON Schema for clarity.json
├── AGENTS.md                   # Architecture invariants (machine-readable)
├── next.config.ts              # COOP/COEP headers, rewrites
├── tsconfig.json
├── vitest.config.ts
├── playwright.config.ts
└── package.json
```

---

## 4. System Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                          BROWSER (Client)                            │
│                                                                      │
│  ┌──────────────┐   ┌─────────────────────────────────────────────┐ │
│  │ Next.js App  │   │          Inference Subsystem                 │ │
│  │  (UI Layer)  │   │                                              │ │
│  │              │   │  ┌──────────────┐   ┌────────────────────┐  │ │
│  │  /           │   │  │ Main Thread  │   │   Web Worker       │  │ │
│  │  /analysis   │◄──┤  │              │──►│                    │  │ │
│  │  /models     │   │  │ preprocess() │   │ ONNX Runtime WASM  │  │ │
│  │  /onboarding │   │  │ postprocess()│◄──│ session.run()      │  │ │
│  │              │   │  └──────────────┘   └────────────────────┘  │ │
│  └──────┬───────┘   │                                              │ │
│         │           │  ┌──────────────┐   ┌────────────────────┐  │ │
│         │           │  │  Cache API   │   │    IndexedDB       │  │ │
│         │           │  │ model.onnx   │   │  model metadata    │  │ │
│         │           │  └──────────────┘   └────────────────────┘  │ │
│         │           └─────────────────────────────────────────────┘ │
│         │                                                            │
│         │  localStorage: persona, consent, selected_model           │
└─────────┼────────────────────────────────────────────────────────────┘
          │ metadata only (no scan data ever)
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Next.js API Routes (proxy layer)                 │
│              /api/models/manifest  /api/models/[slug]               │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      FastAPI Backend (Python)                        │
│                                                                      │
│   GET /manifest        GET /models        POST /models/register      │
│   GET /models/{slug}   GET /health                                   │
│                                                                      │
│   ┌─────────────────┐          ┌──────────────────────────────────┐ │
│   │  Supabase Postgres│◄───────│  services/storage.py             │ │
│   │  models table    │         │  services/validation.py          │ │
│   └─────────────────┘         └──────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   Hugging Face (Model CDN)                           │
│                                                                      │
│   clarityray-{slug}/model.onnx                                       │
│   clarityray-{slug}/clarity.json                                     │
└─────────────────────────────────────────────────────────────────────┘
                              ▲
                              │
┌─────────────────────────────────────────────────────────────────────┐
│                    clarityray CLI (Converter)                         │
│                                                                      │
│   detect framework → convert to ONNX → generate spec →              │
│   validate → upload to HuggingFace → register in Supabase           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 5. Data Flow Pipelines

### 5.1 — Inference Pipeline (User Upload → Result)

```
User uploads PNG/JPEG
        │
        ▼
ConsentModal.check(localStorage['clarityray_consent_v1'])
        │ accepted
        ▼
useClarityRay (state machine)
        │
        ├─── idle
        ├─── loading_manifest  →  fetchManifest()
        │                           tries: GET /api/models/manifest
        │                           fallback: /public/models/manifest.json
        ├─── loading_spec      →  fetchSpec(slug)
        │                           downloads clarity.json
        ├─── downloading_model →  loadModel(spec)
        │                           downloads model.onnx
        │                           caches in Cache API + IndexedDB
        ├─── verifying_model   →  verifyHash(bytes, spec.sha256)
        ├─── ready             ←──────────────────────────────────────┐
        │                                                             │
        ├─── processing        →  preprocessImage(file, spec)        │
        │                           canvas decode                     │
        │                           resize → [224, 224]               │
        │                           normalize (mean/std or none)      │
        │                           → Float32Array [1, C, H, W]       │
        │                                                             │
        │                       →  runInference(tensor, spec)         │
        │                           postMessage() to Web Worker       │
        │                           Worker: session.run(tensor)       │
        │                           → Float32Array raw logits          │
        │                                                             │
        │                       →  postprocess(logits, spec, persona) │
        │                           softmax / sigmoid activation       │
        │                           apply thresholds                  │
        │                           generate persona-specific text    │
        │                           → SafeResult                      │
        │                                                             │
        └─── complete          →  render SystemPanel + ResultOverlay  │
                                  optional: generateOcclusionHeatmap()│
                                  (re-runs inference per grid cell)   │
                                         └────────────────────────────┘
```

### 5.2 — Model Publishing Pipeline (Researcher CLI)

```
Researcher
    │
    ▼
clarityray upload ./my-model-dir \
    --classes "Normal,Pneumonia" \
    --bodypart chest \
    --modality xray \
    --task binary
    │
    ├── 1. detect.detect_framework()
    │       sniffs .pt / .h5 / .onnx files
    │
    ├── 2. convert.convert_to_onnx()
    │       pytorch  → torch.onnx.export()
    │       keras    → tf2onnx
    │       onnx     → passthrough
    │
    ├── 3. spec.generate_spec()
    │       writes clarity.json from CLI args + model introspection
    │
    ├── 4. validate.validate_onnx()
    │       shape checks, op compatibility, schema validation
    │
    ├── 5. upload.upload_to_hf()
    │       pushes model.onnx + clarity.json to HuggingFace repo
    │       repo: clarityray-{slug}
    │
    └── 6. upload.register_in_supabase()
            POST /models/register  (X-API-Key header)
            creates DB row: status = 'draft'
                │
                ▼
        Admin sets status = 'published'
        Model appears in /models browser immediately
```

### 5.3 — Persona-Aware Result Display

```
SafeResult
    │
    ├── persona = 'researcher'
    │     → raw probabilities (e.g. 0.87)
    │     → class names + confidence scores
    │     → inference timing, model slug
    │
    ├── persona = 'doctor'
    │     → clinical interpretation
    │     → threshold labels (e.g. "Finding detected")
    │     → safety tier + disclaimer
    │
    └── persona = 'patient'
          → plain language (no raw numbers)
          → "Possible finding detected — consult a doctor"
          → full disclaimer always shown
          → raw probabilities NEVER shown
```

---

## 6. Frontend Architecture

### Pages

| Route | File | Purpose |
|-------|------|---------|
| `/` | `app/page.tsx` | Landing page, hero, feature highlights |
| `/analysis` | `app/analysis/page.tsx` | Core inference UI |
| `/models` | `app/models/page.tsx` | Model browser with filtering |
| `/models/[slug]` | `app/models/[slug]/page.tsx` | Model detail + selection |
| `/onboarding` | `app/onboarding/page.tsx` | 3-step persona setup |

### State Management

State is local — no global state library. Three mechanisms:

| Mechanism | What it stores |
|-----------|----------------|
| `useClarityRay` hook | Inference pipeline state machine |
| `PersonaContext` (React Context) | Active persona (`researcher` / `doctor` / `patient`) |
| `localStorage` | Persisted persona, consent, and selected model slug |

### Core Hook: `useClarityRay`

`hooks/useClarityRay.ts` is the heart of the frontend. It owns:

- State machine transitions (`idle → loading_manifest → ... → complete`)
- Model manifest fetching with API-first / static fallback
- Spec fetching and validation
- Model binary downloading, hashing, and caching
- Orchestrating preprocess → inference → postprocess
- Exposing `runAnalysis(file)` and `status` to the UI

### Inference State Machine

```
idle
 └─► loading_manifest
      └─► loading_spec
           └─► downloading_model
                └─► verifying_model
                     └─► ready
                          └─► processing
                               ├─► complete
                               └─► error
```

Any step can transition to `error`. `ready` is the stable waiting state after model load.

### Component Tree (Analysis Page)

```
app/analysis/page.tsx
├── ConsentModal          (blocks until accepted)
├── UploadZone            (drag/drop, PNG/JPEG only)
├── components/analysis/
│   ├── SystemPanel       (persona-aware result text)
│   ├── LogPanel          (real-time event log with timings)
│   └── ResultOverlay     (heatmap canvas over scan)
├── ContrastViewer        (edge overlay)
└── GradCAMViewer         (attention map)
```

### Key Library Files

| File | Role |
|------|------|
| `lib/clarity/types.ts` | `ClaritySpec` TypeScript interface + runtime validator with detailed error messages |
| `lib/clarity/preprocess.ts` | Canvas-based image decode → resize → normalize → NCHW Float32Array |
| `lib/clarity/run.ts` | Worker channel management, ONNX session caching, main-thread fallback |
| `lib/clarity/postprocess.ts` | Activation functions, threshold application, persona text generation |
| `lib/clarity/occlusion.ts` | Grid-based occlusion sensitivity (re-runs inference per cell) |
| `lib/clarity/loader.ts` | Fetch model binary, verify hash, store in Cache API + IndexedDB |
| `lib/clarity/manifest.ts` | Fetch manifest from API, fall back to `/public/models/manifest.json` |

---

## 7. Backend Architecture

### FastAPI App (`api/`)

```
api/main.py
├── CORS middleware          (ALLOWED_ORIGINS from env)
├── Rate limiting (slowapi)  (per-IP on expensive endpoints)
├── /health
└── /models router (api/routes/models.py)
    ├── GET  /manifest
    ├── GET  /models
    ├── GET  /models/{slug}
    ├── GET  /models/{slug}/status
    └── POST /models/register    (API key gated)
```

### Services

| Service | File | Responsibility |
|---------|------|---------------|
| Storage | `services/storage.py` | Supabase CRUD for models and model_versions |
| Validation | `services/validation.py` | Checks publication readiness (URLs present, version set) |

### Static Fallback

If Supabase is unavailable or unconfigured, `main.py` falls back to reading `public/models/manifest.json` directly. This keeps the platform functional without a database.

---

## 8. ML / Inference Pipeline

### Model Format

All models are served as **ONNX** (Open Neural Network Exchange). This enables framework-agnostic browser inference via ONNX Runtime Web.

### Preprocessing (`lib/clarity/preprocess.ts`)

```
Input: File (PNG/JPEG)
    │
    ├─ Decode via HTMLCanvasElement
    ├─ Resize to spec.input.shape [H, W]  (bilinear via canvas)
    ├─ Extract pixel data (Uint8ClampedArray RGBA)
    ├─ Normalize:
    │    none      → values in [0, 255]
    │    grayscale → single channel mean
    │    mean/std  → (pixel/255 - mean) / std  per channel
    └─ Layout: HWC → NCHW  [1, C, H, W]
Output: Float32Array
```

### Inference (`workers/inference.worker.ts` + `lib/clarity/run.ts`)

- ONNX Runtime Web session is created once and cached per model slug
- Inference is executed in a Web Worker to avoid blocking the UI thread
- If the worker fails, `run.ts` falls back to main-thread inference
- SharedArrayBuffer (enabled by COOP/COEP headers) is used when available for zero-copy transfer

### Postprocessing (`lib/clarity/postprocess.ts`)

```
Input: Float32Array (raw logits)
    │
    ├─ Activation:
    │    softmax  → multinomial probability distribution
    │    sigmoid  → independent per-class probabilities
    │    none     → raw values
    │
    ├─ Threshold application:
    │    possible_finding  (default 0.5)  → "Finding detected"
    │    low_confidence    (default 0.25) → "Low confidence result"
    │
    ├─ Task routing:
    │    binary      → single positive/negative result
    │    multilabel  → multiple findings possible
    │    multiclass  → top-k classes
    │    regression  → scalar output
    │    segmentation/ detection → reserved
    │
    └─ Persona text generation:
         researcher → raw probabilities + class names + timing
         doctor     → clinical labels + safety tier
         patient    → plain language + mandatory disclaimer
Output: SafeResult
```

### Explainability

| Method | File | Technique |
|--------|------|-----------|
| Occlusion Sensitivity | `lib/clarity/occlusion.ts` | Grid-based: mask each cell, rerun inference, map delta |
| Contrast Overlay | `components/ContrastViewer.tsx` | Synthetic luminance/edge (not ML-derived) |
| Grad-CAM | `components/GradCAMViewer.tsx` | Attention map visualization |

### Bundled Demo Models

| Slug | Architecture | Task | Input |
|------|-------------|------|-------|
| `densenet121-chest` | DenseNet-121 | Binary: Normal / Lung Cancer | RGB 224×224 |
| `densenet121-cxr-suspicious` | DenseNet-121 | Binary: suspicious finding | RGB 224×224 |
| `resnet50-cxr-suspicious` | ResNet-50 | Binary: suspicious finding | RGB 224×224 |
| `brain-ctscan-cancer` | CNN | Binary: cancer screening | RGB 224×224 |

---

## 9. Model Publishing Pipeline

### `clarity.json` Spec Contract

Every model has a `clarity.json` that the runtime reads. It is the single source of truth for model behaviour — no runtime code is model-specific.

```jsonc
{
  "slug": "densenet121-chest",
  "name": "DenseNet-121 Chest X-Ray",
  "version": "1.0.0",
  "task": "binary",
  "safety_tier": "screening",
  "certified": false,          // NEVER set to true (platform policy)
  "input": {
    "shape": [1, 3, 224, 224],
    "normalization": {
      "type": "mean_std",
      "mean": [0.485, 0.456, 0.406],
      "std":  [0.229, 0.224, 0.225]
    }
  },
  "output": {
    "activation": "softmax",
    "classes": ["Normal", "Lung Cancer"],
    "thresholds": {
      "possible_finding": 0.5,
      "low_confidence": 0.25
    }
  },
  "artifacts": {
    "model_url": "https://huggingface.co/...",
    "sha256": "abc123..."
  },
  "metadata": {
    "bodypart": "chest",
    "modality": "xray",
    "author": "...",
    "license": "..."
  }
}
```

The JSON Schema for this contract lives at `clarity-schema.json` and is used by both the converter CLI (`clarityray validate`) and the FastAPI backend on registration.

### CLI Commands

```bash
# Validate an existing ONNX model + spec
clarityray validate ./my-model

# Convert, validate, upload, and register
clarityray upload ./my-model \
  --classes "Normal,Pneumonia" \
  --bodypart chest \
  --modality xray \
  --task binary \
  --api-url https://your-api.com \
  --api-key $CLARITY_API_KEY
```

---

## 10. Database & Storage

### Supabase Postgres Schema

```sql
-- Core model registry
CREATE TABLE models (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text UNIQUE NOT NULL,
  name        text NOT NULL,
  description text,
  modality    text,
  bodypart    text,
  status      text NOT NULL DEFAULT 'draft',  -- 'draft' | 'published'
  created_at  timestamptz DEFAULT now()
);

-- Version-pinned artifacts
CREATE TABLE model_versions (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id  uuid REFERENCES models(id) ON DELETE CASCADE,
  version   text NOT NULL,
  clarity_url text,    -- URL to clarity.json on HuggingFace
  model_url   text,    -- URL to model.onnx on HuggingFace
  created_at  timestamptz DEFAULT now(),
  UNIQUE(model_id, version)
);
```

Migrations are in `supabase/migrations/` and applied in numbered order (001–006).

### Browser Storage

| Storage | Contents | Persistence |
|---------|----------|-------------|
| **Cache API** | `model.onnx` binaries | Survives tab/browser close |
| **IndexedDB** | Model metadata, spec cache | Survives tab/browser close |
| **localStorage** | `clarityray_selected_model`, `clarityray_persona_v1`, `clarityray_consent_v1` | Survives tab/browser close |

---

## 11. API Reference

### Next.js Proxy Routes

These routes proxy to FastAPI and exist to keep the backend URL out of client bundles.

| Method | Route | Proxies To |
|--------|-------|-----------|
| GET | `/api/models/manifest` | `GET /manifest` |
| GET | `/api/models` | `GET /models` |
| GET | `/api/models/[slug]` | `GET /models/{slug}` |
| GET | `/api/models/[slug]/spec` | fetches `clarity_url` from DB |

### FastAPI Endpoints

#### `GET /health`
```json
{ "status": "ok", "published_models": 4 }
```

#### `GET /manifest`
Returns all published models as a flat dict keyed by slug.
```json
{
  "models": {
    "densenet121-chest": { /* ClaritySpec */ }
  }
}
```

#### `GET /models`
Paginated list with optional filters.

Query params:
- `bodypart` — chest, brain, bone, …
- `modality` — xray, ct, mri, ultrasound, …
- `task` — binary, multilabel, multiclass, regression, segmentation, detection
- `validation_status` — unvalidated, validated
- `page` (default 1) / `limit` (default 20, max 50)

#### `GET /models/{slug}`
Single model detail including artifact URLs and validation status.

#### `GET /models/{slug}/status`
```json
{
  "slug": "densenet121-chest",
  "published": true,
  "model_url_present": true,
  "clarity_url_present": true,
  "version_set": true
}
```

#### `POST /models/register`
Called by the `clarityray` CLI after upload.
Requires `X-API-Key` header if `CLARITY_API_KEY` is set in env.
```json
{
  "slug": "my-model",
  "name": "My Model",
  "clarity_url": "https://huggingface.co/...",
  "model_url": "https://huggingface.co/...",
  "version": "1.0.0"
}
```

---

## 12. Configuration

### Frontend Environment (`.env.local`)

| Variable | Purpose | Default |
|----------|---------|---------|
| `NEXT_PUBLIC_API_URL` | FastAPI base URL | `http://localhost:8000` |

### Backend Environment (`api/.env`)

| Variable | Purpose | Required |
|----------|---------|---------|
| `PORT` | Uvicorn listen port | No (default 8000) |
| `SUPABASE_URL` | Supabase project URL | No (uses static fallback) |
| `SUPABASE_SERVICE_KEY` | Supabase service role key | No |
| `CLARITY_API_KEY` | Gate for `/models/register` | No (open if unset) |
| `ALLOWED_ORIGINS` | CORS origins (comma-separated) | No |

### Critical Next.js Config (`next.config.ts`)

```ts
// COOP/COEP headers are REQUIRED for SharedArrayBuffer (WASM inference)
// Do NOT remove these headers
headers: [
  { key: 'Cross-Origin-Opener-Policy',   value: 'same-origin' },
  { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
]
```

---

## 13. Architecture Invariants

These rules are defined in `AGENTS.md` and must never be violated:

1. **No scan data to server** — Scan pixels never leave the browser. Inference is always local. `lib/api/client.ts` must only ever carry metadata.

2. **No model-specific code** — Labels, normalization values, thresholds, and class names must come from `clarity.json`. They must never be hardcoded in TypeScript.

3. **No certified models** — `clarity.json` files must never have `"certified": true`. This is a platform safety policy.

4. **COOP/COEP headers must stay** — `next.config.ts` cross-origin isolation headers are required for SharedArrayBuffer and WASM. Do not remove them.

5. **No raw probabilities to patients** — The `patient` persona must never see raw float probabilities. Only plain-language descriptions and mandatory disclaimers.

6. **Consent on every mount** — `/analysis` must read `localStorage['clarityray_consent_v1']` on every page mount and show the consent modal if not set.

7. **TypeScript strict mode** — Run `npx tsc --noEmit` after any TypeScript change. Strict mode is enforced.

8. **Separation of concerns in analysis page** — `app/analysis/page.tsx` must not import from `lib/api/client.ts` or any auth utilities.

---

## 14. Development Guide

### Running the Full Stack

```bash
# 1. Install frontend dependencies
npm install

# 2. Start Next.js dev server (port 3000)
npm run dev

# 3. In a second terminal — start FastAPI backend (port 8000)
cd api
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# 4. (Optional) Seed the database
cd api
python seed.py
```

### Running Tests

```bash
# Unit tests (Vitest)
npm test

# Unit tests in watch mode
npm run test:watch

# E2E tests (Playwright, headless)
npm run test:e2e

# E2E tests with browser visible
npm run test:e2e:headed

# TypeScript type check
npx tsc --noEmit
```

### Publishing a Model (Converter CLI)

```bash
# Install converter (PyTorch optional dep)
cd converter
pip install -e ".[pytorch]"

# Validate an existing model
clarityray validate ./my-model-dir

# Full publish flow
clarityray upload ./my-model-dir \
  --classes "Normal,Disease" \
  --bodypart chest \
  --modality xray \
  --task binary
```

### Adding a Bundled (Static) Model

1. Create `public/models/{slug}/model.onnx` and `public/models/{slug}/clarity.json`
2. Add the model entry to `public/models/manifest.json`
3. Add the slug to `lib/server/staticModels.ts`
4. Run `npm run dev` and verify it loads on `/models`

### Key Files to Know First

If you're new to this codebase, read these in order:

1. `AGENTS.md` — invariants you must not break
2. `lib/clarity/types.ts` — the `ClaritySpec` contract everything depends on
3. `hooks/useClarityRay.ts` — the core inference state machine
4. `lib/clarity/postprocess.ts` — where results become human-readable output
5. `app/analysis/page.tsx` — the main UI that ties it all together
