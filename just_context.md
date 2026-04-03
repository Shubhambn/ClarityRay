# ClarityRay — Holistic System Context

## 1) Project Overview

ClarityRay is a **monorepo-style full-stack web product** with:
- A Next.js frontend (`app/`) for auth, dashboard, analysis, and settings UX.
- An Express backend (`backend/src/`) for authentication, file upload, job lifecycle, and profile settings.
- A JSON-file persistence layer (`backend/data/db.json`) used as a local dev database.
- A parallel, partly-unwired client-only ONNX inference pipeline (`hooks/useClarityRay.ts`, `lib/models/chestXray/*`, `components/UploadZone.tsx`, `components/ResultsPanel.tsx`, `components/GradCAMViewer.tsx`).

### What this product is *today* (based on running code)
The active user path is **API-backed**:
1. Sign up / login.
2. Upload X-ray to backend.
3. Backend creates async processing job.
4. Frontend polls until completion.
5. Result shown in analysis view + surfaced in dashboard/history.

### Important architecture tension
Repository docs contain two competing narratives:
- **Narrative A (active code):** Full-stack API workflow with JWT and backend queue simulation.
- **Narrative B (partially implemented):** Browser-only ONNX local inference with no backend.

In current routes, Narrative A is what users actually run.

---

## 2) Complete User Flow (step-by-step)

## 2.1 Landing and entry

1. User opens `/`.
2. `app/page.tsx` renders marketing shell + links to auth/dashboard/analysis/settings.
3. Landing cards are driven by `sections/landing/HeroSection.tsx` and `sections/landing/FlowCardsSection.tsx`.

**Data movement:** none (static UI only).

---

## 2.2 Signup / Login flow

### Signup
1. User opens `/auth` (`app/auth/page.tsx`) and selects “Sign up”.
2. Client-side validation checks:
   - name length >= 2
   - email regex
   - password length >= 8
3. Frontend calls `api.signup()` (`utils/api.ts`) -> `POST /api/auth/signup`.
4. Backend route chain:
   - `backend/src/routes/authRoutes.js`
   - `authLimiter` (`rateLimitMiddleware.js`)
   - `validate(signupSchema)` (`validate.js`)
   - `signupController` (`controllers/authController.js`)
   - `signup()` (`services/authService.js`)
5. `signup()`:
   - reads JSON DB (`models/database.js`)
   - checks duplicate email
   - hashes password with `bcryptjs`
   - creates user + default preferences
   - persists to `db.json`
   - creates JWT (`services/tokenService.js`)
6. Frontend stores token in `localStorage` via `setToken()` and navigates to `/dashboard`.

### Login
Same path as signup but calls `POST /api/auth/login` and `login()` service (password compare with bcrypt).

**Data movement:**
- Browser form state -> API JSON payload -> db mutation -> JWT response -> `localStorage`.

---

## 2.3 Auth-protected navigation and session model

Protected pages (`/dashboard`, `/analysis`, `/settings`) are not guarded by server-side middleware in Next.js; instead each page does a client-side token check:
- `getToken()` from `utils/auth.ts`
- if missing token -> `router.replace('/auth')`

Backend-protection is enforced by `requireAuth` middleware (JWT Bearer verification).

**Implication:** route HTML can still render briefly before redirect on client; true authorization is backend-enforced.

---

## 2.4 Analysis upload -> job -> result

1. User opens `/analysis` (`app/analysis/page.tsx`).
2. User selects PNG/JPEG only (frontend MIME check).
3. `Run analysis` triggers `api.uploadAnalysis(file)` -> `POST /api/analysis/upload` (FormData key: `scan`).
4. Backend upload pipeline:
   - `requireAuth`
   - `multer` storage (`uploadMiddleware.js`) to `backend/uploads/`
   - file type allowlist: png/jpeg/jpg/dicom
   - max size 12MB
5. `uploadAnalysisController` calls `createAnalysisJob()` (`analysisService.js`):
   - creates `analysisJobs` record with status `processing`
   - writes DB
   - enqueues async task in in-memory queue (`queueService.js`)
6. Queue simulates processing delay (`setTimeout`) and then `completeJob()`:
   - generates mock confidence/explanation (`mockInference`)
   - creates `results` row
   - updates job status to `completed`
   - writes DB
7. Frontend polling loop:
   - `setInterval` every 1400ms calls `GET /api/analysis/:id`
   - stops when status no longer `processing`
8. UI renders result cards + confidence bar + disclaimer.

**Data movement:**
- Browser file -> disk (`uploads/`) + `analysisJobs` entry -> async queue -> `results` entry -> polling response -> UI state.

---

## 2.5 Dashboard flow

1. `/dashboard` requests in parallel:
   - `GET /api/user/profile`
   - `GET /api/analysis/history`
2. Backend returns sanitized user + job history with attached result (if available).
3. Frontend computes derived metrics:
   - total analyses
   - in-processing count
   - high-confidence flags (`confidence >= 0.75`)
4. Recent history list renders last jobs.

**Data movement:** persisted DB records -> typed frontend models (`utils/types.ts`) -> derived metrics in React `useMemo`.

---

## 2.6 Settings flow

1. `/settings` loads profile via `GET /api/user/profile`.
2. User edits `name` and preference toggles.
3. Save calls `PUT /api/user/settings`.
4. Backend validates payload (zod), merges preference patch, updates `updatedAt`, persists.
5. Frontend shows success/failure message.

**Data movement:** local React state -> partial update payload -> merged DB user preferences -> response hydration.

---

## 2.7 Onboarding flow status

No explicit onboarding wizard exists.
- “Onboarding” is effectively: signup/login -> dashboard CTA -> analysis.
- No first-run setup checks, tutorial state, role selection, or guided activation.

---

## 2.8 Hidden/background flows (non-obvious but important)

- **In-memory single-worker queue** (`queueService.js`): serializes all jobs in process memory.
- **Health endpoint** (`GET /api/health`): reports queue status.
- **Uploads static serving**: `app.use('/uploads', express.static(...))`.
- **Route aliasing**: `/analyze` re-exports `/analysis` page (`app/analyze/page.tsx`).
- **Legacy/alternate local inference stack** exists but is not wired into active route pages.

---

## 3) Architecture Deep Dive

## 3.1 High-level architecture

- **Architecture style:** Modular monolith (frontend + backend in one repository).
- **Runtime topology:**
  - Next.js app (port 3000 typical)
  - Express API (port 4000 default)
  - Local file DB + upload directory
- **No microservices**, no external queue/cache/database in current implementation.

---

## 3.2 Frontend structure (App Router)

### Primary runtime tree
- `app/layout.tsx` — root metadata and global CSS import.
- `app/page.tsx` — landing page.
- `app/auth/page.tsx` — login/signup.
- `app/dashboard/page.tsx` — profile + history + metrics.
- `app/analysis/page.tsx` — upload/poll/result screen.
- `app/settings/page.tsx` — profile + preference edits.
- `app/analyze/page.tsx` — alias route to analysis page.

### Shared presentation layer
- `layouts/AppShell.tsx` — private-page shell (sidebar/nav/header/logout).
- `components/ui/*` — design-system primitives.
- `sections/landing/*` — landing content blocks.

### Client-side state strategy
- Local component state with hooks (`useState`, `useEffect`, `useMemo`).
- No global state library (Redux/Zustand/etc.).
- Auth token in `localStorage` (`utils/auth.ts`).
- Polling implemented with `setInterval` in `app/analysis/page.tsx`.

### API integration pattern
- Single typed wrapper in `utils/api.ts`:
  - sets JSON header unless `FormData`
  - injects `Authorization: Bearer <token>` if present
  - parses JSON response and throws `Error(message)` on non-OK.

---

## 3.3 Backend structure

### Entry and middleware
- `backend/src/server.js` starts HTTP server.
- `backend/src/app.js` wires middleware + routes:
  - `cors` with `CLIENT_ORIGIN`
  - `helmet`
  - `morgan`
  - `express.json`
  - static `/uploads`
  - global API limiter

### Routing layers
- `routes/authRoutes.js`
- `routes/analysisRoutes.js`
- `routes/userRoutes.js`

### Controllers (HTTP orchestration only)
- `controllers/authController.js`
- `controllers/analysisController.js`
- `controllers/userController.js`

### Services (business logic)
- `services/authService.js`: user creation/login and hash checks.
- `services/tokenService.js`: JWT create/verify.
- `services/analysisService.js`: job creation/history lookup/completion.
- `services/userService.js`: profile read/update.
- `services/queueService.js`: in-memory task queue.

### Persistence
- `models/database.js`: file-backed read/write helpers.
- Physical store: `backend/data/db.json`.

---

## 3.4 Database design and relationships

Current storage is denormalized JSON arrays but follows a relational shape:
- `users`
- `analysisJobs`
- `results`

Relationships represented by foreign-key-like IDs:
- user `id` referenced by jobs/results.
- job `resultId` references one result.

`SCHEMA.md` describes intended relational model (Users, AnalysisJobs, Results) accurately for a future SQL migration.

---

## 3.5 Authentication and authorization model

### AuthN
- Signup/Login returns JWT with claims: `sub`, `email`, `name`, expiry `7d`.
- Token storage: browser `localStorage` key `clarityray_token`.

### AuthZ
- API protected endpoints use `requireAuth` middleware.
- Middleware validates Bearer header and attaches `req.user`.
- Data access filters by `req.user.id` to enforce per-user job/profile isolation.

---

## 3.6 State, caching, and consistency

- **Frontend cache:** none beyond in-memory component state.
- **Backend cache:** none.
- **Queue state:** in-process memory only (`queue` array + `active` flag).
- **Consistency model:** single-process eventual completion for jobs.
- **Failure mode:** process restart loses queue in-flight tasks (persisted jobs remain `processing` unless recovered manually).

---

## 3.7 API design patterns

- REST-ish resource style under `/api`.
- Validation at route boundary with zod + shared `validate()` middleware.
- Error handling centralized in `errorHandler`.
- Upload endpoint returns `202 Accepted` + job payload.
- Polling endpoint by job id returns result embedding.

---

## 4) File / Module Responsibilities

## 4.1 Root and project config

- `package.json`: frontend deps/scripts + proxy backend scripts (`dev:api`, `start:api`).
- `next.config.ts`: minimal Next config (turbopack root).
- `tsconfig.json`: strict TS, alias `@/*` -> both root and `src/*`.
- `eslint.config.mjs`: flat config, explicitly ignores `backend/**`.
- `.eslintrc.json`: legacy config file still present (dual ESLint configs).
- `postcss.config.mjs`: Tailwind v4 PostCSS plugin.
- `.gitignore`: standard ignores including `.env*`, `.next`, `node_modules`.
- `next-env.d.ts`: Next-generated types + route types include.

## 4.2 Active frontend pages

- `app/layout.tsx`: active root layout.
- `app/globals.css`: active design tokens + fonts + base style.
- `app/page.tsx`: landing composition.
- `app/auth/page.tsx`: complete auth UX and token persistence.
- `app/dashboard/page.tsx`: metrics + recent jobs.
- `app/analysis/page.tsx`: upload + polling + result rendering.
- `app/settings/page.tsx`: profile/preferences edit UX.
- `app/analyze/page.tsx`: route alias.

## 4.3 Shared frontend modules

- `utils/api.ts`: typed API client wrapper.
- `utils/auth.ts`: localStorage token helper.
- `utils/types.ts`: domain contracts mirrored from backend.
- `utils/format.ts`: date/percent formatters.
- `utils/routes.ts`: route metadata + private route subset.
- `layouts/AppShell.tsx`: private app chrome with sign-out action.
- `components/ui/*.tsx`: reusable primitives.
- `sections/landing/*.tsx`: landing sections.
- `lib/utils.ts`: className merger utility (`cn`).

## 4.4 Local ONNX pipeline (present but mostly unwired)

- `hooks/useClarityRay.ts`
- `lib/models/chestXray/config.ts`
- `lib/models/chestXray/preprocess.ts`
- `lib/models/chestXray/run.ts`
- `lib/models/chestXray/postprocess.ts`
- `lib/models/chestXray/heatmap.ts`
- `components/UploadZone.tsx`
- `components/ResultsPanel.tsx`
- `components/GradCAMViewer.tsx`

This stack appears intended for browser-only inference but is not imported by active route pages.

## 4.5 Backend modules

- `backend/src/config/env.js`: env loading + defaults.
- `backend/src/app.js` / `server.js`: app setup and startup.
- `backend/src/routes/*`: endpoint declarations.
- `backend/src/controllers/*`: request/response orchestration.
- `backend/src/services/*`: domain logic.
- `backend/src/middleware/*`: auth, validation, upload, limiter, errors.
- `backend/src/models/database.js`: file DB abstraction.
- `backend/data/db.json`: actual data.
- `backend/uploads/*`: persisted user upload binaries.

## 4.6 Docs and planning artifacts

- `README.md`: full-stack usage and architecture summary.
- `backend/API.md`: endpoint docs.
- `backend/SCHEMA.md`: logical schema.
- `BUILD_PLAN.md`: broader product roadmap (many not implemented).
- `CURRENT_SYSTEM_CONTEXT.md`: claims browser-only ONNX flow; currently not fully aligned with active pages.
- `AGENTS.md`, `CLAUDE.md`: agent/tooling guidance.

## 4.7 Duplicate / placeholder tree

- `src/app/*` contains create-next-app starter scaffold and is not active runtime route tree (active tree is top-level `app/`).
- `src/components`, `src/config`, `src/lib`, `src/styles`, `src/types` are mostly empty placeholders.
- `pages/` is documentation-only per `pages/README.md`.

---

## 5) Environment Variables (.env structure)

## 5.1 Required backend env vars

From `backend/src/config/env.js` and `backend/.env.example`:

```env
PORT=4000
JWT_SECRET=replace-with-a-long-random-secret
CLIENT_ORIGIN=http://localhost:3000
```

### Variable usage map

- `PORT`
  - Used by: `backend/src/config/env.js` -> `env.port`
  - Consumed in: `backend/src/server.js` (`app.listen(env.port)`)
  - Purpose: API server listening port.

- `JWT_SECRET`
  - Used by: `backend/src/config/env.js` -> `env.jwtSecret`
  - Consumed in: `backend/src/services/tokenService.js` (JWT sign/verify)
  - Purpose: signing and validating auth tokens.

- `CLIENT_ORIGIN`
  - Used by: `backend/src/config/env.js` -> `env.clientOrigin`
  - Consumed in: `backend/src/app.js` CORS config
  - Purpose: allowed frontend origin for cross-origin API calls.

## 5.2 Frontend env vars

- `NEXT_PUBLIC_API_URL` (optional but effectively required outside local default)
  - Used by: `utils/api.ts`
  - Default fallback: `http://localhost:4000/api`
  - Purpose: frontend API base URL.

## 5.3 Implicit envs used

- `NODE_ENV`
  - Used by: `backend/src/middleware/errorHandler.js`
  - Purpose: include stack traces in error payloads when `development`.

---

## 6) Identified Issues & Risks

## 6.1 Functional gaps and inconsistencies

1. **Dual architecture drift**
   - Active app uses backend mock inference.
   - Repository also contains browser ONNX pipeline not wired to active pages.
   - Docs conflict, increasing onboarding/debugging friction.

2. **No real ML inference on backend path**
   - `analysisService.js` uses random confidence (`mockInference`) rather than model execution.
   - Product output is currently simulated, not medically meaningful.

3. **DICOM mismatch**
   - Backend upload accepts `application/dicom`.
   - Frontend upload UI accepts only png/jpeg.
   - Browser-only inference docs mention DICOM support, but route UX does not expose it.

4. **No onboarding module**
   - Requested onboarding flow is absent; only direct auth -> dashboard.

5. **Empty/duplicate code trees**
   - `src/app` starter template coexists with active `app/` tree.
   - Risk of confusion and accidental edits in wrong tree.

## 6.2 Security concerns

1. **Weak fallback JWT secret**
   - Default `'dev-secret-change-me'` can be used silently if env missing.
   - Should fail fast in non-dev environments.

2. **Token storage in localStorage**
   - Susceptible to XSS token theft compared to HttpOnly cookies.

3. **No CSRF strategy**
   - Less critical with Bearer token approach, but still no hardening pattern documented.

4. **Upload handling hardening incomplete**
   - MIME-based filtering only; no deep file signature/magic-byte validation.
   - Filename sanitization exists but no antivirus scanning/quarantine.

5. **No audit logs / auth anomaly detection**
   - Rate limiting exists but no account lockout/backoff by identity.

## 6.3 Scalability and reliability risks

1. **Single-process in-memory queue**
   - No durability, no parallel workers, no retry/backoff metadata.

2. **File JSON DB**
   - Potential race/write corruption under concurrency.
   - No transactions, indexing, or query optimization.

3. **Polling-based status updates**
   - Scales poorly vs push channels (SSE/WebSocket).

4. **No background recovery**
   - Jobs left `processing` after restart are not reconciled.

## 6.4 Code quality / maintainability risks

1. **Backend excluded from frontend ESLint config** (`eslint.config.mjs` ignores `backend/**`).
2. **Two ESLint configs present** (`eslint.config.mjs` + `.eslintrc.json`) may cause tooling ambiguity.
3. **Inconsistent architecture docs** increase cognitive load for new engineers.
4. **Unused helpers/services** (local ONNX modules) create dead-code footprint.

---

## 7) Improvement Suggestions

## 7.1 Architectural consolidation (highest priority)

Choose one explicit product mode and align code/docs:

### Option A — Full-stack API product
- Keep backend architecture.
- Replace `mockInference` with real inference worker (Python service or ONNX runtime service).
- Keep dashboard/history/settings as core enterprise UX.

### Option B — Browser-only local inference product
- Wire `useClarityRay` + `UploadZone` + `ResultsPanel` + `GradCAMViewer` into `app/analysis/page.tsx`.
- Remove backend dependency for inference path.
- Keep backend only if auth/history truly required.

Do not keep both narratives half-active.

## 7.2 Production-grade backend roadmap

1. Replace JSON DB with Postgres (users/jobs/results tables).
2. Replace in-memory queue with Redis + BullMQ.
3. Add worker process deployment unit.
4. Add idempotent job states + retries + dead-letter queue.
5. Move uploads to object storage (S3/R2/GCS) with signed URLs.
6. Add structured logging, tracing, and metrics.

## 7.3 Security hardening

1. Enforce required strong `JWT_SECRET` (no insecure fallback in prod).
2. Move auth to secure HttpOnly cookie strategy (or hardened token storage policy).
3. Add strict CSP and XSS hardening review.
4. Add upload magic-byte validation and malware scanning pipeline.
5. Add per-user brute-force protections and audit events.

## 7.4 Frontend/runtime improvements

1. Add route-level guard abstraction instead of repeated token checks.
2. Replace polling with SSE/WebSocket for job updates.
3. Add robust loading/error empty states shared components.
4. Add integration tests for auth -> upload -> history flow.
5. Clarify active route tree and remove stale `src/app` scaffold.

## 7.5 Data and domain improvements

1. Introduce model provenance fields (model hash, calibration version).
2. Add deterministic confidence threshold policy and clinician-tunable settings.
3. Track result review status (unreviewed/reviewed/escalated).
4. Add report export with immutable audit trail metadata.

## 7.6 Production readiness checklist

- [ ] Single agreed architecture documented and enforced.
- [ ] Real inference integrated (no mock output for production).
- [ ] Durable DB + queue + worker deployed.
- [ ] Secrets management and secure auth policy in place.
- [ ] End-to-end tests and load tests passing.
- [ ] Monitoring/alerting and incident runbooks ready.
- [ ] Data retention/privacy policy implemented.
- [ ] Backup and disaster recovery tested.

---

## 8) Final Summary (Production-readiness assessment)

ClarityRay is a **well-structured MVP codebase** with clear layering, typed frontend contracts, authentication flow, and an async job UX that is good for demos and local development.

However, it is **not production-ready yet** for real clinical deployment because:
- active inference path is mock/random,
- persistence and queue are non-durable,
- security posture needs hardening,
- architecture/docs are split between backend-driven and browser-only modes.

### Overall readiness snapshot
- **Developer demo readiness:** High
- **Internal pilot readiness (non-clinical):** Medium
- **Production clinical readiness:** Low (until inference, reliability, and compliance/security upgrades are completed)

If a new engineer reads this file plus `backend/API.md`, they should be able to:
- run and debug current flows,
- identify active vs dormant modules,
- and execute a confident migration path to a production architecture.
