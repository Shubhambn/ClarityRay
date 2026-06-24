<div align='center'>

# ClarityRay

**Browser-native chest X-ray screening. No uploads. No servers. No compromise.**

`License: MIT` &nbsp; `TypeScript: strict` &nbsp; `ONNX Runtime Web` &nbsp; `Next.js 16` &nbsp; `Python 3.10+` &nbsp; `FastAPI`

Browser-based multi-disease screening with local ONNX inference and safety-first result translation.  
Model publishing is spec-driven — new compliant models can be onboarded without any runtime code changes.

</div>

ClarityRay lets a user upload a chest X-ray in the browser and receive a screening-oriented AI result with a heatmap and safety disclaimer. The key decision is architectural: inference runs entirely in ONNX Runtime Web on-device — never on a server. It is built for researchers, clinicians, and patients.

> Every analysis runs entirely in your browser.  
> The model runs in WebAssembly. Your scan never leaves your device.  
> Not "privacy-first" as a marketing claim — as a hard architectural constraint.

In medical AI, privacy is not a feature toggle. It is part of trust, adoption, and compliance posture from day one.

---

## Demo Flow

```text
1. Open /models → browse published AI models
2. Select a model → click 'Use for Analysis'
3. Open /analysis → model downloads to your browser (once, then cached)
4. Upload a chest X-ray (PNG or JPEG)
5. Inference runs locally in ~3–8 seconds (WebAssembly)
6. View findings with confidence scores, heatmap, and safety disclaimer
7. Result adapts to your role: researcher / clinician / patient
```

Zero network requests happen during steps 4–7. Scan pixels never leave browser memory.

---

## What's Inside

### Browser Inference Engine

The runtime reads a `clarity.json` spec, preprocesses the uploaded image into an NCHW `Float32Array`, and runs ONNX inference in-browser via WebAssembly. Sessions are cached in memory, model binaries are cached via the Cache API and IndexedDB, and first-load model fetches are reused. Model integrity is checked with SHA-256 when a hash is present in the spec. Raw model outputs are postprocessed with softmax and mapped to screening-safe messaging.

### Three-Persona Result View

ClarityRay has three personas: **researcher**, **doctor**, and **patient**. Researchers see technical detail — thresholds, metadata, and system logs. Doctors see structured interpretation language with confidence context. Patients see plain-language output with a mandatory non-diagnostic notice and no technical probability details.

### Model Platform

Each model is defined by a `clarity.json` contract and discovered through the model registry. The manifest is loaded dynamically from `/api/models/manifest` (FastAPI → Supabase), or falls back to the static `/models/manifest.json` when the backend is unavailable. The browser loads model artifacts once and reuses local cache on subsequent runs.

**Bundled demo models** (`public/models/`):

| Model | Input | Output |
|---|---|---|
| `densenet121-chest` | RGB 224×224 | Binary screening (Normal / Lung Cancer) |
| `efficientnetb0-pediatric-chest` | RGB 320×320 | Binary screening |
| `densenet121-cxr-suspicious` | Grayscale 224×224 | Binary suspicious-finding screening |

These bundled models work with **no backend or Supabase** — they are served from the `public/` directory and loaded via the static manifest fallback.

### clarity CLI (converter)

The converter package (`converter/`) turns model artifacts into a validated ONNX package with a generated spec. The current entrypoint is `clarityray upload`, which handles conversion, validation, packaging, and optional registration. The pipeline is designed for researcher-owned model publishing workflows.

---

## Architecture

Three systems, one invariant: patient data never reaches a server.

```
┌─────────────────────────────────────────────────────────────┐
│  BROWSER (patient data stays here — always)                 │
│                                                             │
│  Next.js App Router (port 3000)                             │
│  ├── /              → Landing page                          │
│  ├── /onboarding    → Persona setup                         │
│  ├── /analysis      → useClarityRay() hook                  │
│  │    ├── preprocessImage()  → Float32Array tensor          │
│  │    ├── runInference()     → ONNX Runtime Web (WASM)      │
│  │    └── postprocess()      → SafeResult                   │
│  ├── /models        → Model browser                         │
│  └── /models/[slug] → Model detail + selection              │
│                                                             │
│  Cache API + IndexedDB                                      │
│  └── model.onnx cached after first download                 │
└──────────────────────────────────────────────────────────────┘
                        │ metadata only (no scan data)
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  PLATFORM (metadata + model registry)                       │
│                                                             │
│  FastAPI ── Supabase Postgres (port 8000)                   │
│  GET /health             → Service status + model count     │
│  GET /manifest           → Model registry in ManifestSpec   │
│  GET /models             → List published models            │
│  GET /models/:slug       → Model detail + artifact URLs     │
│  GET /models/:slug/status → Validation status               │
│  POST /models/register   → Register from converter CLI      │
└──────────────────────────────────────────────────────────────┘
                        │ model files served from CDN
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  HUGGING FACE (model file storage)                          │
│                                                             │
│  clarityray-{slug}/                                         │
│  ├── model.onnx      → browser fetches and caches           │
│  └── clarity.json    → model specification contract         │
└─────────────────────────────────────────────────────────────┘
```

---

## Getting Started

### Prerequisites

| Requirement | Version | Purpose |
|---|---|---|
| Node.js | ≥ 18 | Next.js frontend |
| Python | ≥ 3.10 | FastAPI backend + converter tooling |
| pip | any | Python package installation |
| Git | any | Source control |

> **Windows Note:** Use PowerShell. If `python` is not on PATH, use `py` instead. Ensure `pip` is installed and available.

---

### Step 1 — Clone the repository

```bash
git clone https://github.com/Shubhambn/ClarityRay
cd ClarityRay
```

---

### Step 2 — Install frontend dependencies

```bash
npm install
```

---

### Step 3 — Configure frontend environment

Create `.env.local` in the project root (copy from the example):

```bash
# Windows PowerShell
Copy-Item .env.example .env.local

# Linux / macOS
cp .env.example .env.local
```

The default `.env.local` content (no changes needed for local development):

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

> The frontend works without this variable. The inference pipeline is entirely local. The API URL is only used to load the live model registry from Supabase.

---

### Step 4 — Install backend dependencies

```bash
cd api
pip install -r requirements.txt
cd ..
```

**`api/requirements.txt` installs:**
- `fastapi` — API framework
- `uvicorn[standard]` — ASGI server
- `psycopg[binary]` + `psycopg-pool` — Postgres driver (only needed with Supabase)
- `python-dotenv` — `.env` loading
- `slowapi` — rate limiting

---

### Step 5 — Configure backend environment

```bash
# Windows PowerShell
Copy-Item api\.env.example api\.env

# Linux / macOS
cp api/.env.example api/.env
```

Edit `api/.env`:

```env
PORT=8000
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3002

# Optional — leave empty to run in degraded mode (no database)
SUPABASE_URL=
SUPABASE_KEY=

# Optional — set to enable write-endpoint authentication
CLARITY_API_KEY=
```

> **Degraded mode:** If `SUPABASE_URL` and `SUPABASE_KEY` are left empty, the API runs without a database. The frontend will fall back to the static `public/models/manifest.json` and all bundled models work normally.

---

### Step 6 — Run the platform

Open **two terminals** from the project root:

**Terminal 1 — Backend API:**

```bash
cd api
uvicorn main:app --reload --port 8000
```

→ API available at: `http://localhost:8000`  
→ Interactive Swagger docs: `http://localhost:8000/docs`  
→ Health check: `http://localhost:8000/health`

**Terminal 2 — Frontend:**

```bash
npm run dev
```

→ App available at: `http://localhost:3000`

> **Important:** The `api/main.py` imports routes using `from api.routes.models import router`. This means `uvicorn` **must be launched from the project root** (not from inside `api/`). Run `uvicorn api.main:app --reload` if you are calling from the project root, or `uvicorn main:app --reload` from inside the `api/` directory.

---

### Full startup — correct commands

```bash
# From the project root (ClarityRay/)

# Terminal 1: Backend
cd api && uvicorn main:app --reload --port 8000

# Terminal 2: Frontend (in a new terminal, from project root)
npm run dev
```

---

### Troubleshooting: Import error on backend startup

If you see `ModuleNotFoundError: No module named 'api'` when starting uvicorn from inside `api/`, run it from the **project root** instead:

```bash
# From project root — not from inside api/
# uvicorn api.main:app --reload --port 8000
 python -m uvicorn api.main:app --reload --port 8000
```

Or from inside `api/` using a PYTHONPATH override:

```bash
# Windows PowerShell (from project root)
$env:PYTHONPATH="."; cd api; uvicorn main:app --reload

# Linux / macOS (from project root)
PYTHONPATH=. cd api && uvicorn main:app --reload
```

---

## Verify the Setup

Once both services are running:

| Check | URL | Expected |
|---|---|---|
| Frontend loads | `http://localhost:3000` | ClarityRay landing page |
| API health | `http://localhost:8000/health` | `{"status":"ok"}` or `{"status":"degraded"}` |
| API docs | `http://localhost:8000/docs` | Swagger UI |
| Model manifest | `http://localhost:3000/api/models/manifest` | JSON with model list |
| Model browser | `http://localhost:3000/models` | Model cards |
| Analysis page | `http://localhost:3000/analysis` | Inference UI with consent gate |

---

## Seed the Database (Optional)

If you have Supabase configured (`SUPABASE_URL` + `SUPABASE_KEY` in `api/.env`), seed the registry with the bundled DenseNet121 model:

```bash
cd api
python seed.py
```

> **Note:** `seed.py` requires the `supabase` Python client. Install it first:
> ```bash
> pip install supabase
> ```
> Without seeding, the model browser loads models from the static `public/models/manifest.json` fallback instead.

---

## Optional: Install the Converter CLI

The converter is a separate Python package for publishing new models. Install it only if you are developing or packaging models — it is **not required** to run the app.

```bash
cd converter
pip install -e ".[pytorch]"   # with PyTorch conversion support
# or
pip install -e "."             # ONNX-only (no PyTorch)
cd ..
```

### Verify converter installation

```bash
clarityray --help
```

### Validate a bundled model

```bash
python -m clarityray.cli upload ./public/models/densenet121-chest \
  --classes "Normal,Lung Cancer" \
  --bodypart chest \
  --modality xray \
  --no-upload
```

---

## Model Contract

Every model in ClarityRay is described by a `clarity.json` file. This file makes inference generic — the runtime reads the spec and runs any conforming model without code changes.

```json
{
  "id": "densenet121-chest",
  "name": "DenseNet121 Chest X-ray Binary Classifier",
  "version": "1.0.0",
  "certified": false,
  "bodypart": "chest",
  "modality": "xray",
  "model": {
    "file": "/models/densenet121-chest/model.onnx",
    "format": "onnx"
  },
  "integrity": {
    "sha256": "64934b00028b55e1e4f5f6c5b4d0dd3c01793a8bcfbfa3ed98940b357fd7bdef"
  },
  "input": {
    "shape": [1, 3, 224, 224],
    "layout": "NCHW",
    "normalize": {
      "mean": [0.485, 0.456, 0.406],
      "std": [0.229, 0.224, 0.225]
    }
  },
  "output": {
    "shape": [1, 2],
    "classes": ["Normal", "Lung Cancer"],
    "activation": "softmax"
  },
  "thresholds": {
    "possible_finding": 0.5,
    "low_confidence": 0.25,
    "validation_status": "unvalidated"
  },
  "safety": {
    "tier": "screening",
    "disclaimer": "This tool is for screening support only. A possible finding detected result may suggest elevated risk and requires clinician review. A no finding detected result does not rule out disease."
  }
}
```

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique slug used in URLs and CLI |
| `output.classes` | string[] | Exactly 2 for binary classifiers |
| `safety.tier` | enum | `screening` / `research` / `investigational` |
| `certified` | boolean | Always `false` — schema-enforced platform policy |
| `thresholds.possible_finding` | number | Probability threshold for positive screen |
| `thresholds.low_confidence` | number | Lower confidence boundary |
| `integrity.sha256` | string | Optional SHA-256 hash — verified on download if present |

Adding a model requires **zero code changes** — only a `clarity.json` and `model.onnx`.

---

## Publishing a Model

### Step 1 — Set credentials

```bash
# Windows PowerShell
$env:HF_USERNAME="your-huggingface-username"
$env:HF_TOKEN="hf_your_write_token"
$env:CORE_API_BASE_URL="http://localhost:8000"

# Linux / macOS
export HF_USERNAME=your-huggingface-username
export HF_TOKEN=hf_your_write_token
export CORE_API_BASE_URL=http://localhost:8000
```

### Step 2 — Package and validate

```bash
python -m clarityray.cli upload ./my-model-folder \
  --classes "Normal,Pneumonia" \
  --bodypart chest \
  --modality xray \
  --no-upload   # validate only, skip HF upload
```

### Step 3 — Upload and register

```bash
python -m clarityray.cli upload ./my-model-folder \
  --classes "Normal,Pneumonia" \
  --bodypart chest \
  --modality xray
```

Set the model to `published` status in Supabase and it immediately appears in the model browser.

---

## How Inference Works

### Step 1 — Manifest + spec loading

On mount, the analysis page calls `fetchManifest()`. This first tries `/api/models/manifest` (live from Supabase), then falls back to `/models/manifest.json` (static, always available). The selected model slug is read from `localStorage` (key: `clarityray_selected_model`), defaulting to `densenet121-chest`.

### Step 2 — Model download + cache

`loadModel()` downloads `model.onnx` from the URL in the manifest. The binary is cached in browser storage via the Cache API and IndexedDB. Subsequent loads reuse the cached bytes — no re-download.

### Step 3 — Preprocessing

The uploaded image is decoded in-browser via a canvas. It is resized to the model input spatial size (e.g. `224×224`), normalized with ImageNet mean/std, and written into a `Float32Array` in NCHW layout.

### Step 4 — Inference

An ONNX `InferenceSession` is created from model bytes and cached by model ID. `session.run()` returns raw logits aligned to the class list in `clarity.json`.

### Step 5 — Postprocessing

```
softmax(logits) → [0.13, 0.87]  → 87% probability of class[1] (Lung Cancer)
```

Threshold logic from `thresholds` in spec:

- `probability >= possible_finding (0.5)`: **Possible Finding**
- `probability >= low_confidence (0.25)`: **Low Confidence**
- `probability < low_confidence (0.25)`: **No Finding**

### Step 6 — Result translation

```typescript
interface SafeResult {
  primaryFinding: string          // e.g. "Possible Finding"
  confidencePercent: number       // e.g. 87
  safetyTier: 'possible_finding' | 'low_confidence' | 'no_finding'
  plainSummary: string            // persona-appropriate text
  disclaimer: string              // mandatory safety notice
}
```

---

## Project Structure

```
clarityray/
│
├── app/                          Next.js App Router
│   ├── page.tsx                  Landing page
│   ├── analysis/page.tsx         Core inference UI
│   ├── models/page.tsx           Model browser
│   ├── models/[slug]/page.tsx    Model detail + selection
│   ├── onboarding/page.tsx       Persona setup (3-step)
│   ├── api/                      Next.js API routes
│   │   └── models/manifest/      Proxies to FastAPI /manifest
│   ├── error.tsx                 Error boundary
│   └── not-found.tsx             Custom 404
│
├── hooks/
│   └── useClarityRay.ts          Inference state machine (core of product)
│
├── lib/
│   ├── clarity/
│   │   ├── types.ts              ClaritySpec type + validator
│   │   ├── preprocess.ts         Image → Float32Array tensor
│   │   ├── run.ts                ONNX Runtime Web execution + worker
│   │   ├── postprocess.ts        Raw output → SafeResult + heatmap
│   │   ├── loader.ts             Download + Cache API
│   │   ├── manifest.ts           Manifest fetch + fallback
│   │   ├── specLoader.ts         clarity.json fetcher
│   │   ├── stateMachine.ts       Status transition logic
│   │   ├── cache.ts              Cache API helpers
│   │   ├── db.ts                 IndexedDB model storage
│   │   └── hash.ts               SHA-256 integrity check
│   ├── persona/
│   │   └── context.tsx           Persona state (researcher/doctor/patient)
│   └── api/
│       └── client.ts             Backend fetch() calls (metadata only)
│
├── components/
│   ├── analysis/
│   │   ├── SystemPanel.tsx       Persona-aware result display
│   │   ├── LogPanel.tsx          Real-time system event log
│   │   └── ResultOverlay.tsx     Spatial result canvas overlay
│   ├── models/
│   │   └── ModelCard.tsx         Model browser card
│   ├── nav/
│   │   └── TopBar.tsx            Global navigation + privacy badge
│   ├── ConsentModal.tsx          Safety consent gate
│   ├── UploadZone.tsx            File upload dropzone
│   └── ContrastViewer.tsx        Heatmap overlay viewer
│
├── api/                          FastAPI platform backend (metadata only)
│   ├── main.py                   App bootstrap, CORS, rate limiting, routes
│   ├── routes/
│   │   └── models.py             /models and /register endpoints
│   ├── seed.py                   Database seeding script
│   ├── requirements.txt          Python dependencies
│   └── .env.example              Backend env template
│
├── converter/                    clarityray converter tool (pip package)
│   └── clarityray/
│       ├── cli.py                CLI entry point (`clarityray` command)
│       ├── convert.py            Framework conversion pipeline
│       ├── upload.py             Upload/registration integration
│       ├── validate.py           ONNX + schema validation
│       └── spec.py               clarity.json generation
│
├── public/
│   └── models/                   Bundled model artifacts (static fallback)
│       ├── manifest.json         Static model manifest
│       ├── densenet121-chest/    Default model (always available offline)
│       │   ├── model.onnx
│       │   └── clarity.json
│       └── ...                   Other bundled models
│
├── supabase/migrations/          Database schema migrations
├── next.config.ts                COOP/COEP headers (required for WASM)
├── clarity-schema.json           JSON Schema for clarity.json validation
└── AGENTS.md                     Architecture invariants (read before contributing)
```

---

## Environment Variables

### Frontend (`.env.local`, project root)

| Variable | Required | Default | Description |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | No | `http://localhost:8000` | FastAPI platform URL — model registry only |

### Backend (`api/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `8000` | Uvicorn server port |
| `ALLOWED_ORIGINS` | No | `http://localhost:3000` + hardcoded list | CORS allowed origins (comma-separated) |
| `SUPABASE_URL` | No | — | Supabase project URL |
| `SUPABASE_KEY` | No | — | Supabase service role key |
| `CLARITY_API_KEY` | No | — | API key for write endpoints (disabled if absent) |

### Converter (shell or `.env`)

| Variable | Required | Description |
|---|---|---|
| `HF_USERNAME` | Yes (for upload) | Hugging Face account username |
| `HF_TOKEN` | Yes (for upload) | Write-access token from HF settings |
| `CORE_API_BASE_URL` | Yes (for registration) | Platform API URL |

---

## API Reference

The platform API is FastAPI — no inference happens server-side.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Service status + published model count |
| GET | `/manifest` | All published models in ManifestSpec format |
| GET | `/models` | List published models (pagination + filters) |
| GET | `/models/:slug` | Single model detail + artifact URLs |
| GET | `/models/:slug/status` | Validation and publication status |
| POST | `/models/register` | Register model from converter flow (API key required if set) |

**Query parameters for `GET /models`:**

| Parameter | Type | Description |
|---|---|---|
| `bodypart` | string | Filter by body part (e.g. `chest`) |
| `modality` | string | Filter by modality (e.g. `xray`) |
| `task` | string | Filter by task (e.g. `binary`) |
| `validation_status` | string | Filter by validation status |
| `page` | int (≥1) | Pagination page, default `1` |
| `limit` | int (1-50) | Results per page, default `20` |

---

## Development

### Type checking (run after every TypeScript change)

```bash
npx tsc --noEmit
```

### Linting

```bash
npm run lint
```

### Unit tests

```bash
npm test
```

### Production build (verify before deploying)

```bash
npm run build
```

### End-to-end tests

```bash
npm run test:e2e
```

---

## Architecture Invariants

These rules are non-negotiable, documented in [`AGENTS.md`](AGENTS.md). Any PR that violates them is rejected.

1. **Never send scan image bytes to any server** — inference is always browser-local
2. **Never import `utils/api.ts` or `utils/auth.ts`** in `app/analysis/page.tsx`
3. **Never hardcode model labels, paths, or normalization constants** outside `clarity.json`
4. **Never set `certified: true`** in any `clarity.json` — schema-enforced
5. **Always run `npx tsc --noEmit`** after TypeScript changes
6. **Never remove COOP/COEP headers** from `next.config.ts` — required for `SharedArrayBuffer` (WASM)
7. **Never show raw probabilities or thresholds** to the `patient` persona
8. **Consent must be checked on every `/analysis` mount** — read `localStorage['clarityray_consent_v1']`

---

## Safety

ClarityRay is a screening tool. It is not a diagnostic device. Every result includes this distinction explicitly.

| What ClarityRay does | What it does not do |
|---|---|
| Runs AI inference locally in the browser | Diagnose disease |
| Shows probability scores with uncertainty | Replace physician review |
| Generates attention heatmaps | Localize disease precisely |
| Applies model-declared thresholds | Self-certify model accuracy |
| Enforces safety tier classification | Provide medical advice |

The safety tier in every `clarity.json` is one of: `screening` / `research` / `investigational`. No model can be marked `certified: true` without platform review. This is enforced at schema level.

---

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Next.js 16 App Router | File-based routing, SSR where useful |
| Inference | ONNX Runtime Web 1.24 | Browser WASM execution — no server |
| Language | TypeScript strict | Compile-time shape validation |
| Styling | CSS custom properties (`globals.css`) | Zero runtime overhead, dark theme |
| Backend | FastAPI (Python 3.10+) | Metadata registry — no inference |
| Database | Supabase Postgres | Optional — app works without it |
| Model storage | Hugging Face (CDN) | Common model hosting and distribution |
| Converter | Python 3.10+ | ONNX tooling and spec validation |
| Fonts | DM Sans + DM Mono | UI text + system logs/metrics |

---

## Roadmap

```
DONE
  ✓ Browser-only ONNX inference pipeline
  ✓ Three-persona result view (researcher / doctor / patient)
  ✓ clarity.json model contract system + JSON schema
  ✓ converter CLI for model packaging and validation
  ✓ Hugging Face artifact upload workflow
  ✓ FastAPI platform API + Supabase model registry
  ✓ Model browser + selection flow
  ✓ SHA-256 integrity verification (optional, with skip-and-warn)
  ✓ IndexedDB + Cache API model caching
  ✓ Static manifest fallback (works without backend)
  ✓ Heatmap visualization via ContrastViewer
  ✓ Spatial result overlay (segmentation / detection tasks)

IN PROGRESS
  → COOP/COEP header verification across browsers
  → Better converter UX for guided spec creation
  → Additional bundled models for spec validation

PLANNED
  → Tauri desktop app (offline-first, DICOM support)
  → WebGL backend for ONNX (3–5× faster on supported devices)
  → Threshold calibration workflow
  → Regulatory pathway documentation (FDA Pre-Sub)
```

---

## Contributing

Contributions are welcome across model packaging, bug fixes, documentation, and test coverage.

**Before opening a PR:**
1. Read [`AGENTS.md`](AGENTS.md) — all architecture invariants apply
2. Run `npx tsc --noEmit` and confirm zero type errors
3. Run `npm run build` and confirm the production build succeeds
4. Any change that breaks the privacy invariant (scan data leaving the browser during inference) will be declined regardless of other improvements

Fork the repo, branch from `main`, make changes, then open a PR with a concrete summary of what changed and why.

---

## License

MIT License. Researchers can use, modify, and extend this codebase in their own work with attribution and license compliance.

---

## Acknowledgements

ClarityRay builds on [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) from Microsoft, which makes browser-native model execution practical for real applications. It also depends on [Hugging Face](https://huggingface.co) infrastructure for model artifact distribution. The project is shaped by the open-source medical AI community and the public model ecosystem that made this tooling direction possible.

Most medical AI never reaches real users not because the models don't work, but because running them is too hard. ClarityRay is an attempt to fix that.
