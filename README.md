# ClarityRay — Full-Stack AI Medical Screening Workspace

ClarityRay is a full-stack product for AI-assisted chest X-ray screening workflows.
It preserves the original landing-page design language (green palette, serif+sans typography, trust-first UI), while extending it into a complete app:

- Authentication (signup/login with JWT)
- Upload → analysis job → async result
- Dashboard history and summary cards
- Profile/settings preferences

> ⚠️ Clinical safety note: This system is for screening support only and not a medical diagnosis.

## Folder structure

```text
.
├── app/                        # Next.js App Router pages
├── components/                 # Reusable UI components
├── layouts/                    # Shared shells (sidebar + top header)
├── pages/                      # Route metadata/config used by UI
├── sections/                   # Landing page sections
├── utils/                      # API client, auth token helpers, types, formatters
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── models/
│   │   ├── middleware/
│   │   ├── config/
│   │   ├── app.js
│   │   └── server.js
│   ├── data/db.json            # Local JSON database
│   ├── uploads/                # Uploaded scans
│   ├── API.md                  # Endpoint reference
│   └── SCHEMA.md               # Database schema design
└── README.md
```

## Product flows implemented

1. **Auth flow**
	- User signs up or logs in.
	- Backend returns JWT token.
	- Frontend stores token in `localStorage` and uses it on API requests.

2. **Analysis flow**
	- User uploads image (`scan`) from `/analysis`.
	- Backend stores file in `backend/uploads`.
	- Backend creates `AnalysisJob` with `processing` status.
	- In-memory queue simulates async processing.
	- Result object is generated and persisted.
	- Frontend polls job endpoint and renders result.

3. **Dashboard flow**
	- Authenticated request fetches user profile and history.
	- Summary cards compute key stats.
	- Recent activity cards render live job status/confidence.

4. **Settings flow**
	- Authenticated request fetches profile/preferences.
	- User updates profile + safety preferences.
	- Backend validates and persists changes.

## API design

Base URL: `http://localhost:4000/api`

- `POST /auth/signup`
- `POST /auth/login`
- `POST /analysis/upload`
- `GET /analysis/:id`
- `GET /analysis/history`
- `GET /user/profile`
- `PUT /user/settings`

Detailed request/response examples are in `backend/API.md`.

## Database design

Logical schema:

- `Users`
- `AnalysisJobs`
- `Results`

Includes IDs, relationships, and timestamps. See `backend/SCHEMA.md`.

## Security implemented

- Password hashing with `bcryptjs`
- JWT auth middleware
- Input validation using `zod`
- Upload validation (type and file size)
- Rate limiting (`express-rate-limit`)
- Secure headers (`helmet`)
- CORS restricted to configured frontend origin

## Scalability path (implemented + next step)

Implemented now:

- Async processing abstraction via `queueService` (in-memory queue)

Recommended production upgrade:

- Replace queue implementation with BullMQ + Redis worker(s)
- Move uploaded files to object storage (S3/R2/GCS)
- Add Redis caching for job/status lookups
- Run workers separately from API process

## Setup

### 1) Install frontend dependencies

```bash
npm install
```

### 2) Install backend dependencies

```bash
npm --prefix backend install
```

### 3) Configure backend env

```bash
cp backend/.env.example backend/.env
```

### 4) Run backend

```bash
npm run dev:api
```

### 5) Run frontend

```bash
npm run dev
```

Then open `http://localhost:3000`.

## Architecture summary

- **Frontend**: Next.js (App Router), React, Tailwind CSS utilities and design tokens from `app/globals.css`.
- **Backend**: Express with modular `routes/controllers/services/models/middleware` layering.
- **Storage**: Local JSON DB + local upload directory for a no-external-dependency dev runtime.
- **Auth**: JWT bearer token.
- **Analysis runtime**: async queued job simulation with persisted results.
