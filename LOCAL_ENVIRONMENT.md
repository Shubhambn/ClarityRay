# Local Environment

## Active local app

ClarityRay runs as a browser-only Next.js app. Chest X-ray inference runs in the browser with ONNX Runtime Web, and scan images must not be uploaded to any server.

Required local setup:

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

If port `3000` is already occupied, run:

```bash
npm run dev -- -p 3002
```

Then open:

```text
http://localhost:3002
```

The root `.env.local` file is already created with:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
```

This variable is for the optional model registry API. The active analysis page can load bundled public model files and run inference locally without sending patient images to the API.

## Optional model registry API

The API is metadata-only. It must not run inference or receive scan images.

```bash
cd api
pip install -r requirements.txt
uvicorn main:app --reload
```

The `api/.env` file is already created with safe local defaults:

```bash
PORT=8000
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3002
SUPABASE_URL=
SUPABASE_KEY=
```

With blank Supabase values, API health/model routes run in degraded mode and model-library pages may show the backend/database as unavailable. To use the full model registry, add real Supabase project credentials to `api/.env`.

## Converter CLI

The converter is optional and only needed for packaging or publishing model bundles:

```bash
cd converter
pip install -e ".[pytorch]"
clarityray --help
```

Publishing/upload flows require shell variables such as `HF_USERNAME`, `HF_TOKEN`, and `CORE_API_BASE_URL`. They are not required to run the local analysis app.
