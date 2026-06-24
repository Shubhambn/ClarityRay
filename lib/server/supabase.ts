/**
 * Server-only Supabase PostgREST client for the model registry.
 *
 * Reads from the platform's own Supabase instance using credentials in
 * SUPABASE_URL + SUPABASE_KEY env vars (server-side only — no NEXT_PUBLIC_
 * prefix, never shipped to the browser).
 *
 * Schema mirrors the project migrations:
 *   001_create_models.sql   — models + model_versions tables
 *   005_model_task_validation.sql — task, validation_status, safety_tier columns
 *
 * When migration 005 has not yet been applied the client detects the
 * "column does not exist" (42703) error and retries with the base schema,
 * filling in safe defaults for the missing columns.
 */

import type { StaticModelSummary, StaticModelDetail, StaticModelsResponse } from './staticModels';

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.SUPABASE_KEY ?? '';

/** True when Supabase credentials are present (env vars set). */
export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

// ---------------------------------------------------------------------------
// Raw DB row types (matching migrations exactly)
// ---------------------------------------------------------------------------

/** model_versions row from 001_create_models.sql + 006_clarity_spec_json.sql */
interface DbModelVersion {
  id: string;
  model_id?: string;
  version: string;
  clarity_url: string;
  model_url: string;      // stored as model_url; FE type calls it onnx_url
  created_at: string;
  /** Full clarity.json stored as JSONB (migration 006). Null on older rows. */
  spec_json?: unknown;
}

/** models row from 001 + 005 migrations. 005 columns are optional — they may
 *  be absent when the migration has not yet been applied to the project DB. */
interface DbModel {
  id: string;
  slug: string;
  name: string;
  description: string | null;   // 001 — nullable
  modality: string | null;       // 001
  bodypart: string | null;       // 001
  status: string;                // 001 — 'draft' | 'published'
  created_at: string;            // 001
  // Migration 005 columns — undefined when migration not yet applied
  task?: string;
  validation_status?: string;
  safety_tier?: string;
  model_versions: DbModelVersion[];  // embedded via PostgREST
}

// ---------------------------------------------------------------------------
// Select clauses
// ---------------------------------------------------------------------------

/** Full select — requires migration 005 + 006 columns to exist. */
const MODEL_SELECT_FULL = [
  'id', 'slug', 'name', 'description',
  'bodypart', 'modality', 'status',
  'task', 'validation_status', 'safety_tier',
  'created_at',
  'model_versions(id,version,clarity_url,model_url,spec_json,created_at)',
].join(',');

/** Base select — works without migration 005 (task/validation/safety omitted). */
const MODEL_SELECT_BASE = [
  'id', 'slug', 'name', 'description',
  'bodypart', 'modality', 'status', 'created_at',
  'model_versions(id,version,clarity_url,model_url,spec_json,created_at)',
].join(',');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function supabaseHeaders(): Record<string, string> {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  };
}

/** PostgREST error code for "column does not exist" (migration not applied). */
function isMissingColumnError(body: unknown): boolean {
  return (
    typeof body === 'object' &&
    body !== null &&
    (body as Record<string, unknown>).code === '42703'
  );
}

/** Convert a DbModel row → StaticModelSummary (the shared frontend shape). */
function toModelSummary(row: DbModel): StaticModelSummary {
  // Sort versions newest-first; the most recent is the "current" version.
  const versions = [...(row.model_versions ?? [])].sort(
    (a, b) => b.created_at.localeCompare(a.created_at),
  );
  const latest = versions[0] ?? null;

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    bodypart: row.bodypart || 'other',
    modality: row.modality || 'other',
    // Default to safe values when migration 005 columns are absent
    task: row.task || 'binary',
    validation_status: row.validation_status || 'unvalidated',
    safety_tier: row.safety_tier || 'screening',
    status: row.status,
    published_at: row.created_at ?? null,
    current_version: latest
      ? {
          id: latest.id,
          version: latest.version,
          onnx_url: latest.model_url,    // DB field is model_url → FE field is onnx_url
          clarity_url: latest.clarity_url,
          file_size_mb: null,
          is_current: true,
        }
      : null,
  };
}

/** Convert a DbModel row → StaticModelDetail (adds `validation: null`). */
function toModelDetail(row: DbModel): StaticModelDetail {
  return { ...toModelSummary(row), validation: null };
}

// ---------------------------------------------------------------------------
// Core fetch helper — with automatic schema fallback
// ---------------------------------------------------------------------------

/**
 * Execute a PostgREST query against /rest/v1/models with automatic fallback
 * when migration 005 has not yet been applied.
 *
 * Attempt 1 — full select including task / validation_status / safety_tier.
 * Attempt 2 — if Supabase returns 42703 ("column does not exist"), retry
 *             with the base-only select and drop any 005-column filters so
 *             the query succeeds. UI-level filtering handles task/validation
 *             locally regardless.
 */
async function fetchModelRows(params: URLSearchParams): Promise<DbModel[] | null> {
  // --- Attempt 1: full schema ---
  const fullParams = new URLSearchParams(params);
  fullParams.set('select', MODEL_SELECT_FULL);

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/models?${fullParams.toString()}`,
    { headers: supabaseHeaders(), cache: 'no-store' },
  );

  if (res.ok) {
    const json = (await res.json()) as DbModel[];
    return Array.isArray(json) ? json : null;
  }

  // Parse the error body to decide whether to fall back
  let errBody: unknown;
  try { errBody = await res.json(); } catch { return null; }

  if (!isMissingColumnError(errBody)) return null;

  // Migration 005 not applied — warn once during development
  console.warn(
    '[ClarityRay/supabase] Migration 005 not applied — columns task / ' +
    'validation_status / safety_tier are missing. Retrying with base schema. ' +
    'Run supabase/seed.sql in your Supabase SQL Editor to apply the full schema ' +
    'and seed the model registry.',
  );

  // --- Attempt 2: base schema (drop 005-column filters) ---
  const baseParams = new URLSearchParams(params);
  baseParams.delete('task');
  baseParams.delete('validation_status');
  baseParams.set('select', MODEL_SELECT_BASE);

  const base = await fetch(
    `${SUPABASE_URL}/rest/v1/models?${baseParams.toString()}`,
    { headers: supabaseHeaders(), cache: 'no-store' },
  );
  if (!base.ok) return null;

  const baseJson = (await base.json()) as DbModel[];
  return Array.isArray(baseJson) ? baseJson : null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SupabaseFilters {
  bodypart?: string;
  modality?: string;
  task?: string;
  validation_status?: string;
}

/**
 * Fetch all published models from Supabase with optional filters.
 * Returns null when Supabase is not configured or the request fails.
 * Automatically degrades to base schema if migration 005 is not applied.
 */
export async function fetchModelsFromSupabase(
  filters: SupabaseFilters = {},
): Promise<StaticModelsResponse | null> {
  if (!isSupabaseConfigured()) return null;

  const params = new URLSearchParams();
  params.set('status', 'eq.published');
  params.set('order', 'created_at.desc');
  if (filters.bodypart)          params.set('bodypart', `eq.${filters.bodypart}`);
  if (filters.modality)          params.set('modality', `eq.${filters.modality}`);
  if (filters.task)              params.set('task', `eq.${filters.task}`);
  if (filters.validation_status) params.set('validation_status', `eq.${filters.validation_status}`);

  try {
    const rows = await fetchModelRows(params);
    if (!rows) return null;
    const models = rows.map(toModelSummary);
    return { models, total: models.length, page: 1, limit: models.length };
  } catch {
    return null;
  }
}

/**
 * Fetch a single published model by slug from Supabase.
 * Returns null when not configured, not found, or request fails.
 * Automatically degrades to base schema if migration 005 is not applied.
 */
export async function fetchModelBySlugFromSupabase(
  slug: string,
): Promise<StaticModelDetail | null> {
  if (!isSupabaseConfigured()) return null;

  const params = new URLSearchParams();
  params.set('slug', `eq.${slug}`);
  params.set('status', 'eq.published');
  params.set('limit', '1');

  try {
    const rows = await fetchModelRows(params);
    if (!rows || rows.length === 0) return null;
    return toModelDetail(rows[0]);
  } catch {
    return null;
  }
}

/**
 * Fetch the spec_json (full clarity.json) for a published model's latest
 * version from Supabase (migration 006).
 *
 * Returns the raw JSONB object when present, null otherwise.
 * Callers should pass the result to validateSpec() before use.
 */
export async function fetchSpecFromSupabase(slug: string): Promise<unknown | null> {
  if (!isSupabaseConfigured()) return null;

  const params = new URLSearchParams();
  params.set('slug', `eq.${slug}`);
  params.set('status', 'eq.published');
  params.set('limit', '1');

  try {
    const rows = await fetchModelRows(params);
    if (!rows || rows.length === 0) return null;

    const versions = [...(rows[0].model_versions ?? [])].sort(
      (a, b) => b.created_at.localeCompare(a.created_at),
    );
    const latest = versions[0];
    if (!latest) return null;

    // spec_json is populated by migration 006 + seed; may be null on old rows.
    return latest.spec_json ?? null;
  } catch {
    return null;
  }
}
