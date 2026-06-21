# ClarityRay — Step-by-Step Guide

How to start the project and use the chest X-ray screening demo. Two tracks:

- **Track A — Quick start (5 min):** run the app and use the *already-bundled*
  `densenet121-chest` demo. No Python, no model export, no backend.
- **Track B — The CXR suspicious-finding demo:** export the new
  `densenet121-cxr-suspicious` model, then use it.
- **Track C — (optional) run the metadata backend** for the `/models` library
  with a database.

> **Privacy invariant:** scan images never leave your browser. Inference runs
> in-browser via ONNX Runtime Web (WebAssembly). The backend only serves model
> *metadata* — never image pixels.

---

## 0. Prerequisites

| Tool | Version | Needed for |
|---|---|---|
| Node.js | 20+ (LTS) | Frontend (Tracks A/B/C) |
| npm | bundled with Node | Frontend |
| Python | 3.10+ | Model export (Track B), backend (Track C) |
| A modern browser | Chrome/Edge/Firefox | Running the demo |

Check:

```bash
node --version
npm --version
python --version
```

---

## Track A — Quick start (bundled demo, no Python)

### A1. Install dependencies

```bash
npm install
```

### A2. Start the dev server

```bash
npm run dev
```

Open **http://localhost:3000**.

> The app works with **no backend running**. The model registry pages fall back
> to the on-disk catalog automatically (`public/models/…`), so `/models` and
> `/analysis` work offline.

### A3. Use the demo

1. Go to **http://localhost:3000/onboarding**.
2. **Pick a persona** — Researcher (sees probabilities + metadata), Clinician
   (sees interpretation), or Patient (plain language, no raw numbers).
3. Read the system overview, tick the **safety acknowledgement**, click
   **Begin Analysis**. You land on `/analysis`.
4. The bundled **DenseNet121 Chest X-ray** model loads (downloads once, then
   caches locally; integrity-checked by SHA-256).
5. **Upload a chest X-ray image** (PNG or JPEG).
6. Read the result — possible finding / low confidence / no finding, with a
   confidence percentage and the right detail for your persona.

That's the full local loop. Everything ran in your browser.

---

## Track B — The CXR suspicious-finding demo

This exports the new grayscale `densenet121-cxr-suspicious` model and makes it
selectable. It uses TorchXRayVision weights (first run downloads them).

### B1. Install Python export dependencies

From the project root:

```bash
pip install torch torchvision torchxrayvision onnx onnxruntime numpy jsonschema huggingface_hub
```

> Tip: use a virtual environment — `python -m venv .venv` then activate it
> (`.venv\Scripts\activate` on Windows PowerShell, `source .venv/bin/activate`
> on macOS/Linux).

### B2. Export the model

```bash
python scripts/export_cxr_suspicious.py --list     # see available models
python scripts/export_cxr_suspicious.py            # export the default (densenet121)
```

This writes:

```
public/models/densenet121-cxr-suspicious/model.onnx
public/models/densenet121-cxr-suspicious/clarity.json   # SHA-256 + provenance filled in
```

To export a different family (e.g. the 512px ResNet50): 

```bash
python scripts/export_cxr_suspicious.py --model resnet50-cxr-suspicious
python scripts/export_cxr_suspicious.py --all      # everything in the registry
```

### B3. Verify the export

```bash
python scripts/test_onnx.py                                 # verify all models
python scripts/test_onnx.py densenet121-cxr-suspicious      # verify one
```

You should see output shape `[1, 2]`, finite values, and a SHA-256 match.

### B4. Run and select the model

```bash
npm run dev      # if not already running
```

1. Open **http://localhost:3000/models** — the
   **DenseNet121 CXR Suspicious Finding Demo** card now appears (badges:
   `SCREENING`, `NOT DIAGNOSTIC`).
2. Click it → the detail page shows "What it does / does NOT do / Input
   requirements / Output interpretation / Safety".
3. Click **Use for Analysis** → you're taken to `/analysis` with this model
   selected.
4. Upload a chest X-ray (grayscale 224×224 is the model's native input; any
   PNG/JPEG is accepted and normalized in-browser).
5. As **Researcher**, you'll also see the channel mode (Grayscale), activation,
   and a **SOURCE MODEL** panel (family, source checkpoint, selected pathologies).

> If the card doesn't appear, you haven't run B2 yet — the catalog only lists
> models whose `clarity.json` exists on disk.

---

## Track C — (Optional) run the metadata backend

Only needed if you want the `/models` library served from a database instead of
the on-disk fallback. The analysis path never needs this.

### C1. Install backend dependencies

```bash
cd api
pip install -r requirements.txt
```

### C2. Configure environment

The frontend already points at the backend via `.env.local`
(`NEXT_PUBLIC_API_URL=http://localhost:8000`). For the API itself, copy and edit:

```bash
cp api/.env.example api/.env      # then fill in database/Supabase values
```

Without a database the API returns 503 for `/models` — and the **frontend falls
back to the on-disk catalog automatically**, so the app still works.

### C3. (Optional) seed the database

```bash
cd api && python seed.py && cd ..
```

### C4. Start the API

```bash
cd api
uvicorn main:app --reload        # http://localhost:8000
```

Run `npm run dev` in a second terminal. The frontend now reads `/models` from the
backend, transparently falling back to static if it's unreachable.

---

## Typical full-stack layout (two terminals)

```
Terminal 1:  cd api && uvicorn main:app --reload     # optional metadata backend
Terminal 2:  npm run dev                              # frontend at :3000
```

---

## Verifying your setup (optional gates)

```bash
npx tsc --noEmit     # type-check
npm run lint         # lint
npm run test         # unit tests (vitest) — should report all passing
npm run build        # production build
```

---

## Troubleshooting

| Symptom | Cause / Fix |
|---|---|
| `/models` shows "Backend API is offline" | Expected if no DB; the on-disk fallback still lists local models. Make sure you ran Track B for the new model to appear. |
| New CXR model card missing | Run `python scripts/export_cxr_suspicious.py` (Track B2) — the card only shows once `clarity.json` exists. |
| `/analysis` fails to load the new model | The `model.onnx` isn't exported yet, or the SHA-256 in `clarity.json` doesn't match. Re-run B2 then `python scripts/test_onnx.py`. |
| Export script errors on import | Install the Python deps (Track B1); first run also downloads TorchXRayVision weights. |
| WASM/threading errors in the browser | Use a Chromium-based browser; the app sets COOP/COEP headers for WASM — don't run it behind a proxy that strips them. |
| Port 3000 in use | `npm run dev -- -p 3001`. |

---

## What you can and cannot claim

These are **unvalidated research/screening demos**. They do **not** diagnose
cancer or any disease, do not rule out disease, and are not certified medical
devices. A "no finding" result does not mean an image is normal. Always confirm
with a qualified clinician. See
[docs/DENSENET121_CXR_ONBOARDING.md](docs/DENSENET121_CXR_ONBOARDING.md) and
[docs/DENSENET121_CXR_IMPLEMENTATION_NOTES.md](docs/DENSENET121_CXR_IMPLEMENTATION_NOTES.md)
for details and limitations.
