<div align='center'>

# ClarityRay

**Browser-native chest X-ray screening. No uploads. No servers. No compromise.**

`License: MIT` `TypeScript: strict` `ONNX Runtime Web` `Next.js 14` `Python 3.10+`

Browser-based chest X-ray screening with local ONNX inference and safety-first result translation.
Model publishing is spec-driven, so new compliant models can be onboarded without runtime code edits.

</div>

ClarityRay lets a user upload a chest X-ray in the browser and receive a screening-oriented AI result with a heatmap and safety disclaimer. The key decision is architectural: inference runs in ONNX Runtime Web on-device, not on a server. It is built for researchers, clinicians, and patients.

> Every analysis runs entirely in your browser.  
> The model runs in WebAssembly. Your scan never leaves your device.  
> Not 'privacy-first' as a marketing claim — as a hard architectural constraint.

In medical AI, privacy is not a feature toggle. It is part of trust, adoption, and compliance posture from day one.

## Demo

```text
1. Open /models → browse published AI models
2. Select a model → click 'Use for Analysis'
3. Open /analysis → model downloads to your browser (once, then cached)
4. Upload a chest X-ray (PNG or JPEG)
5. Click Analyze → inference runs locally in ~3–8 seconds
6. View findings with confidence scores, heatmap, and safety disclaimer
7. Result adapts to your role: researcher / clinician / patient
```

Zero network requests happen during steps 4–7.

## What's Inside

### Browser Inference Engine

The runtime reads a `clarity.json` spec, preprocesses the uploaded image into an NCHW `Float32Array`, and runs ONNX inference in-browser. Sessions are cached in memory, model binaries are cached via Cache API and IndexedDB, and first-load model fetches are reused. Model integrity is checked with SHA-256 when a hash is present in the spec. Raw model outputs are postprocessed with softmax and mapped to screening-safe messaging.

### Three-Persona Result View

ClarityRay has three personas: researcher, doctor, and patient. Researchers see technical detail such as thresholds, metadata, and system logs. Doctors see structured interpretation language with confidence context. Patients see plain-language output with a mandatory non-diagnostic notice and no technical probability details.

### Model Platform

Each model is defined by a `clarity.json` contract and discovered through the model registry API. Model metadata is stored in Supabase-backed tables and model files are expected to be hosted on CDN-accessible URLs (commonly Hugging Face repos). The browser loads model artifacts once and reuses local cache on later runs. The contract makes the runtime generic across conforming models.

### clarity CLI

The converter package (`converter/clarityray`) turns model artifacts into a validated ONNX package with a generated spec. It supports framework detection and conversion (`.pt/.h5` through conversion helpers), ONNX validation checks, spec generation, and packaging. The current CLI entrypoint is `clarityray upload`, which handles conversion, validation, packaging, and optional registration flow. The pipeline is designed for researcher-owned model publishing workflows.

## Architecture

Three systems, one invariant: patient data never reaches a server.

```text
┌─────────────────────────────────────────────────────────────┐
│  BROWSER (patient data stays here — always)                 │
│                                                             │
│  Next.js App Router                                         │
│  ├── /analysis  → useClarityRay() hook                     │
│  │    ├── preprocessImage()  → Float32Array tensor         │
│  │    ├── runInference()     → ONNX Runtime Web (WASM)     │
│  │    └── postprocess()      → SafeResult                  │
│  ├── /models    → model browser                            │
│  └── /onboarding → persona setup                           │
│                                                             │
│  Cache API + IndexedDB                                      │
│  └── model.onnx cached after first download                │
└──────────────────┬──────────────────────────────────────────┘
									 │ metadata only (no scan data)
									 ▼
┌─────────────────────────────────────────────────────────────┐
│  PLATFORM (metadata + model registry)                       │
│                                                             │
│  FastAPI ── Supabase Postgres                               │
│  GET /models       → list published models                  │
│  GET /models/:slug → model detail + artifact URLs           │
│  POST /models/register → from converter CLI                 │
└──────────────────┬──────────────────────────────────────────┘
									 │ model files served from CDN
									 ▼
┌─────────────────────────────────────────────────────────────┐
│  HUGGING FACE (model file storage)                          │
│                                                             │
│  clarityray-{slug}/                                         │
│  ├── model.onnx      → browser fetches and caches          │
│  └── clarity.json    → model specification contract         │
└─────────────────────────────────────────────────────────────┘
									 ▲
									 │ clarity push ./model-folder
┌─────────────────────────────────────────────────────────────┐
│  RESEARCHER LOCAL MACHINE                                   │
│                                                             │
│  clarity push ./densenet121-chest                          │
│  ├── validate folder (model.onnx + clarity.json)           │
│  ├── upload to HF repo: clarityray-{slug}                  │
│  └── register metadata with platform API                   │
└─────────────────────────────────────────────────────────────┘
```

This layout enforces privacy at infrastructure boundaries, not by a promise in UI copy. Scan pixels stay inside browser memory during inference and result generation.

## Model Contract

Every model in ClarityRay is described by a `clarity.json` file. This file is what makes inference generic — the runtime reads the spec and runs any conforming model without code changes.

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
| `certified` | boolean | Always `false` — platform policy + schema constraint |
| `thresholds.possible_finding` | number | Probability threshold for possible finding |
| `thresholds.low_confidence` | number | Lower confidence threshold |
| `integrity.sha256` | string | Optional/required-by-policy hash check depending on runtime path |

Adding a model to ClarityRay requires zero code changes — only a `clarity.json` and `model.onnx`.

## Getting Started

### Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | ≥ 18 | For the Next.js frontend |
| Python | ≥ 3.10 | For API and converter tooling |
| Git | any | Source control |

### Clone and install

```bash
git clone https://github.com/Shubhambn/Clarity
cd Clarity

# Frontend
npm install

# Backend API
cd api && pip install -r requirements.txt && cd ..

# Converter CLI (optional — for publishing models)
cd converter && pip install -e '.[pytorch]' && cd ..
```

### Environment setup

```bash
# Frontend (.env.local in project root)
NEXT_PUBLIC_API_URL=http://localhost:8000
```

```bash
# Backend (api/.env)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-role-key
PORT=8000
```

If Supabase is not configured, API routes that depend on DB return a database-unavailable response; frontend development for static/UI flows still works immediately.

### Run in development

```bash
# Terminal 1 — Backend API
cd api && uvicorn main:app --reload

# Terminal 2 — Frontend
npm run dev

# Open http://localhost:3000
```

### Seed the database (first time)

```bash
cd api && python seed.py
```

This inserts the DenseNet121 model into Supabase and sets it up for publication flow in `/models`.

## Publishing a Model

A researcher starts with a trained model file, a Hugging Face account, and a write token if artifacts are being uploaded to HF repos.

### Step 1 — Set credentials

```bash
export HF_USERNAME=your-huggingface-username
export HF_TOKEN=hf_your_write_token
export CORE_API_BASE_URL=http://localhost:8000
```

### Step 2 — Generate the spec interactively

```bash
clarity init ./my-model-folder
```

```text
	clarity init
	────────────────────────────────────────────────
	[1/7] Basic information
	────────────────────────────────────────────────
	Model name          My Pneumonia Classifier
	Model ID / slug     my-pneumonia-classifier
	Version             1.0.0

	[2/7] Input configuration
	────────────────────────────────────────────────
	✓ Shape detected from model   1,3,224,224
	✓ Normalization               ImageNet (3-channel)

	[3/7] Output classes
	────────────────────────────────────────────────
	Output classes (exactly 2)    Normal,Pneumonia
	Activation                    softmax
	...
```

### Step 3 — Push to platform

```bash
clarity push ./my-model-folder
```

```text
	clarity push
	────────────────────────────────────────────────
	✓  model.onnx          89.3MB
	✓  clarity.json        my-pneumonia-classifier
	✓  Classes             Normal · Pneumonia
	✓  Validation          passed

	Uploading to Hugging Face
	Repository: your-username/clarityray-my-pneumonia-classifier
	→ model.onnx ... done
	→ clarity.json ... done

	Registering with ClarityRay platform
	✓  Model ID   [uuid]
	✓  Status     pending

	Model slug    my-pneumonia-classifier
	Model URL     https://huggingface.co/.../model.onnx
	Spec URL      https://huggingface.co/.../clarity.json
```

Set the model to published in Supabase and it immediately appears in the model browser.

## clarity CLI

The `clarity` CLI packages model artifacts for ClarityRay publication workflows.

| Command | Description |
|---|---|
| `clarity push <folder>` | Validate, upload to HF, register with platform |
| `clarity init [folder]` | Interactive wizard to generate `clarity.json` |
| `clarity convert <model>` | Convert `.pt/.h5` to ONNX |
| `clarity validate <folder>` | Validate without uploading |
| `clarity inspect <folder>` | Display parsed `clarity.json` |

```bash
clarity push ./my-model --dry-run     # validate only, no upload
clarity push ./my-model --hf-only     # HF upload, skip platform
clarity push ./my-model --dry-run     # show what would happen
clarity validate ./my-model           # check folder is ready
clarity inspect ./my-model            # pretty-print the spec
```

## Project Structure

```text
clarityray/
│
├── app/                          Next.js App Router
│   ├── page.tsx                  Landing page
│   ├── analysis/page.tsx         Core inference UI
│   ├── models/page.tsx           Model browser
│   ├── models/[slug]/page.tsx    Model detail + selection
│   └── onboarding/page.tsx       Persona setup (3-step)
│
├── hooks/
│   └── useClarityRay.ts          Inference state machine
│                                 (the core of the product)
│
├── lib/
│   ├── clarity/
│   │   ├── types.ts              ClaritySpec validator
│   │   ├── preprocess.ts         Image → Float32Array tensor
│   │   ├── run.ts                ONNX Runtime Web execution
│   │   ├── postprocess.ts        Raw output → SafeResult
│   │   └── loader.ts             Download + Cache API
│   ├── persona/
│   │   └── context.tsx           Persona state (researcher/doctor/patient)
│   └── api/
│       └── client.ts             All backend fetch() calls
│
├── components/
│   ├── analysis/
│   │   ├── SystemPanel.tsx       Persona-aware result display
│   │   └── LogPanel.tsx          Real-time system event log
│   ├── models/
│   │   └── ModelCard.tsx         Model browser card
│   ├── nav/
│   │   └── TopBar.tsx            Global navigation
│   └── ConsentModal.tsx          Safety consent gate
│
├── api/                          FastAPI platform backend
│   ├── main.py                   Routes bootstrap + /health
│   └── routes/models.py          /models and /register endpoints
│
├── converter/                    clarity converter tool (pip package)
│   └── clarityray/
│       ├── cli.py                CLI entry point
│       ├── convert.py            Framework conversion pipeline
│       ├── upload.py             Upload/registration integration
│       ├── validate.py           ONNX + schema validation
│       └── spec.py               clarity.json generation
│
├── supabase/migrations/          Database schema
├── public/models/                Local/public model artifacts
│   └── densenet121-chest/
│       ├── model.onnx
│       └── clarity.json
│
├── clarity-schema.json           JSON Schema for clarity.json
├── CLARITY_SPEC.md               Spec versioning policy
└── AGENTS.md                     Architecture invariants
```

## How Inference Works

### Step 1 — Model loading

On first use, `model.onnx` is downloaded from the model URL. The binary is cached in browser storage layers and reused by key URL/version. Later loads skip re-download when cached data is present.

### Step 2 — Preprocessing

The uploaded image is decoded in-browser and sampled through canvas. It is resized to the model input spatial size (for DenseNet121: `224×224`). Pixels are normalized with ImageNet mean/std and written into a `Float32Array` in NCHW layout.

### Step 3 — Inference

An ONNX `InferenceSession` is created from model bytes and cached by model key. A tensor is created from the preprocessed float data. `session.run()` returns raw logits aligned to the class list in `clarity.json` (for DenseNet121: 2 classes).

### Step 4 — Postprocessing

```text
softmax(logits) = exp(logit_i - max) / Σ exp(logit_j - max)
→ [0.13, 0.87]  means 87% probability of class[1] (Lung Cancer)
```

Threshold logic is applied from `thresholds` in spec:

- probability >= 0.5: `Possible Finding`
- probability >= 0.25: `Low Confidence`
- probability < 0.25: `No Finding`

Thresholds are not hardcoded. They come from `clarity.json` so each model can declare its own validated values.

### Step 5 — Result translation

```typescript
interface SafeResult {
	primaryFinding: string
	confidencePercent: number
	safetyTier: 'possible_finding' | 'low_confidence' | 'no_finding'
	plainSummary: string
	disclaimer: string
}
```

## Safety

ClarityRay is a screening tool. It is not a diagnostic device. Every result includes this distinction explicitly.

| What ClarityRay does | What it does not do |
|---|---|
| Runs AI inference locally in the browser | Diagnose disease |
| Shows probability scores with uncertainty | Replace physician review |
| Generates attention heatmaps | Localize disease precisely |
| Applies model-declared thresholds | Self-certify model accuracy |
| Enforces safety tier classification | Provide medical advice |

The safety tier in every `clarity.json` is one of: `screening` / `research` / `investigational`. No model can be marked `certified: true` without platform review. This is enforced at schema level with a `const: false` constraint.

## Development

### Running type checks

```bash
npx tsc --noEmit
npm run lint
npm run build
```

### Architecture invariants

These rules are non-negotiable and documented in `AGENTS.md`. Any PR that violates them should be rejected.

1. Never send scan image bytes to any server
2. Never import `utils/api.ts` in `app/analysis/page.tsx`
3. Never hardcode model labels outside `clarity.json`
4. Never set `certified: true` in any `clarity.json`
5. Always run `npx tsc --noEmit` after TypeScript changes
6. Never remove COOP/COEP headers from `next.config.ts`

### Adding a new page

```bash
# Create the route
mkdir -p app/new-page
touch app/new-page/page.tsx

# Import TopBar (every page uses this)
import TopBar from '@/components/nav/TopBar'

# Add padding-top for fixed nav
<div style={{ paddingTop: 'var(--topbar-h)' }}>
```

### Testing the inference pipeline

```bash
# Validate a model folder
python -m clarityray.cli upload ./public/models/densenet121-chest --no-upload --classes "Normal,Lung Cancer" --bodypart chest --modality xray

# Type check runtime integration
npx tsc --noEmit
```

## API Reference

The platform API is a FastAPI service that handles model metadata — no inference happens server-side.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Service status + model count/degraded mode |
| GET | `/models` | List published models |
| GET | `/models/:slug` | Single model detail + artifact URLs |
| GET | `/models/:slug/status` | Validation and publication status |
| POST | `/models/register` | Register model from converter flow |

```json
{
	"models": [
		{
			"id": "uuid",
			"slug": "densenet121-chest",
			"name": "DenseNet121 Chest X-Ray",
			"bodypart": "chest",
			"modality": "xray",
			"status": "published",
			"current_version": {
				"version": "1.0.0",
				"onnx_url": "https://huggingface.co/.../model.onnx",
				"clarity_url": "https://huggingface.co/.../clarity.json"
			}
		}
	],
	"total": 1,
	"page": 1,
	"limit": 20
}
```

## Environment Variables

### Frontend (`.env.local`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | No | `http://localhost:8000` | Platform API base URL |

### Backend (`api/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `SUPABASE_URL` | No | — | Supabase project URL |
| `SUPABASE_KEY` | No | — | Supabase service role key |
| `PORT` | No | `8000` | API server port |
| `ALLOWED_ORIGINS` | No | localhost + predefined allowlist | CORS origins list |

If `SUPABASE_URL` is absent, model-listing endpoints return database-unavailable responses; frontend pages can still run local UI and non-DB flows.

### Converter (`.env` or shell)

| Variable | Required | Description |
|---|---|---|
| `HF_USERNAME` | Yes | Hugging Face account username |
| `HF_TOKEN` | Yes | Write-access token from HF settings |
| `CORE_API_BASE_URL` | Yes | Platform API URL for registration |
| `CLARITY_HF_PRIVATE` | No | Private HF repo toggle (if supported by your uploader flow) |

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | Next.js App Router | File-based routing, SSR where useful |
| Inference | ONNX Runtime Web | Run ONNX models in browser WASM |
| Language | TypeScript strict | Catch shape mismatches at compile time |
| Styling | CSS custom properties | Zero runtime overhead, dark theme |
| Backend | FastAPI (Python) | Same language family as converter |
| Database | Supabase Postgres | Managed Postgres with migration support |
| Model storage | Hugging Face | Common model hosting and CDN distribution |
| Converter | Python 3.10+ | ONNX tooling and validation |
| Fonts | DM Sans + DM Mono | UI + system/log text |

## Roadmap

```text
DONE
	✓ Browser-only ONNX inference pipeline
	✓ Three-persona result view
	✓ clarity.json model contract system
	✓ converter CLI for model packaging
	✓ Hugging Face-oriented artifact workflow
	✓ Platform API + Supabase model registry
	✓ Model browser + selection flow
	✓ SHA-256 integrity verification path
	✓ IndexedDB + Cache API model caching

IN PROGRESS
	→ Second model (pneumonia classifier) for spec validation
	→ COOP/COEP header verification across browsers
	→ Better converter UX for guided spec creation

PLANNED
	→ Tauri desktop app (offline, DICOM support)
	→ WebGL backend for ONNX (3–5× faster on supported devices)
	→ Threshold calibration workflow
	→ Regulatory pathway documentation (FDA Pre-Sub)
```

## Contributing

Contributions are welcome across model packaging, bug fixes, documentation, and test coverage. Well-scoped pull requests with clear validation notes are preferred.

Before opening a PR, read `AGENTS.md`. Any change that breaks the privacy invariant (patient scan data leaving the browser during inference) will be declined regardless of other improvements.

Fork the repo, branch from `main`, make changes, run `npx tsc --noEmit` and `npm run build`, then open a PR with a concrete summary of what changed and why.

## License

MIT License. Researchers can use, modify, and extend this codebase in their own work with attribution and license compliance.

## Acknowledgements

ClarityRay builds on ONNX Runtime Web from Microsoft, which makes browser-native model execution practical for real applications. It also depends on Hugging Face infrastructure for model artifact distribution workflows. The project is shaped by the open-source medical AI community and the public model ecosystem that made this tooling direction possible.

Most medical AI never reaches real users not because the models do not work, but because running them is too hard. ClarityRay is an attempt to fix that.

