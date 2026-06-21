import { readFileSync, statSync } from 'fs'
import { join } from 'path'

import type { ManifestSpec } from '@/lib/clarity/manifest'

/**
 * Server-only static model catalog (Phase 3 / BLOCKER B).
 *
 * Builds the same JSON shapes the FastAPI `/models` and `/models/{slug}`
 * endpoints return, but sourced from `public/models/manifest.json` plus each
 * model's `clarity.json` read from disk. This lets `/models` and the detail
 * page work in degraded/local mode without Supabase or any backend.
 *
 * This module uses `fs` and must never be imported into client code — only
 * from server route handlers under `app/api/models/`.
 */

const MODELS_DIR = join(process.cwd(), 'public', 'models')

interface ClaritySafety {
  tier?: string
  disclaimer?: string
}

interface ClarityOutput {
  task?: string
  classes?: string[]
}

interface ClarityThresholds {
  validation_status?: string
}

interface ClarityJson {
  id?: string
  name?: string
  version?: string
  bodypart?: string
  modality?: string
  output?: ClarityOutput
  safety?: ClaritySafety
  thresholds?: ClarityThresholds
}

export interface StaticModelVersion {
  id: string
  version: string
  onnx_url: string
  clarity_url: string
  file_size_mb: number | null
  is_current: boolean
}

export interface StaticModelSummary {
  id: string
  slug: string
  name: string
  bodypart: string
  modality: string
  /** Output contract declared in clarity.json (defaults to "binary"). */
  task: string
  /** Calibration/validation status from clarity.json thresholds. */
  validation_status: string
  /** Safety tier from clarity.json safety block. */
  safety_tier: string
  status: string
  published_at: string | null
  current_version: StaticModelVersion | null
}

export interface StaticModelDetail extends StaticModelSummary {
  validation: null
}

export interface StaticModelsResponse {
  models: StaticModelSummary[]
  total: number
  page: number
  limit: number
}

export interface ModelFilters {
  bodypart?: string
  modality?: string
  task?: string
  validation_status?: string
}

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T
  } catch {
    return null
  }
}

function fileSizeMb(modelOnnxPath: string): number | null {
  try {
    const bytes = statSync(modelOnnxPath).size
    return Math.round((bytes / (1024 * 1024)) * 10) / 10
  } catch {
    return null
  }
}

function loadManifest(): ManifestSpec | null {
  return readJson<ManifestSpec>(join(MODELS_DIR, 'manifest.json'))
}

/**
 * Build a single model summary from its manifest entry + clarity.json.
 * Returns null when the model's clarity.json is missing (not yet exported),
 * so the catalog only advertises models that are actually present on disk.
 */
function buildSummary(slug: string, entry: { version: string; url: string; spec_url: string }): StaticModelSummary | null {
  const spec = readJson<ClarityJson>(join(MODELS_DIR, slug, 'clarity.json'))
  if (!spec) return null

  const version = spec.version ?? entry.version ?? '0.0.0'
  const current: StaticModelVersion = {
    id: `${slug}@${version}`,
    version,
    onnx_url: entry.url,
    clarity_url: entry.spec_url,
    file_size_mb: fileSizeMb(join(MODELS_DIR, slug, 'model.onnx')),
    is_current: true,
  }

  return {
    id: spec.id ?? slug,
    slug,
    name: spec.name ?? slug,
    bodypart: spec.bodypart ?? 'other',
    modality: spec.modality ?? 'other',
    // task absent in a spec means binary; mirror the runtime's default so the
    // catalog never mislabels a legacy binary model.
    task: spec.output?.task ?? 'binary',
    validation_status: spec.thresholds?.validation_status ?? 'unvalidated',
    safety_tier: spec.safety?.tier ?? 'screening',
    status: 'published',
    published_at: null,
    current_version: current,
  }
}

function matchesFilters(summary: StaticModelSummary, filters: ModelFilters): boolean {
  if (filters.bodypart && summary.bodypart.toLowerCase() !== filters.bodypart.toLowerCase()) {
    return false
  }
  if (filters.modality && summary.modality.toLowerCase() !== filters.modality.toLowerCase()) {
    return false
  }
  if (filters.task && summary.task.toLowerCase() !== filters.task.toLowerCase()) {
    return false
  }
  if (
    filters.validation_status &&
    summary.validation_status.toLowerCase() !== filters.validation_status.toLowerCase()
  ) {
    return false
  }
  return true
}

/** Build the full models list from disk, optionally filtered. */
export function getStaticModels(filters: ModelFilters = {}): StaticModelsResponse {
  const manifest = loadManifest()
  const models: StaticModelSummary[] = []

  if (manifest && manifest.models) {
    for (const [slug, entry] of Object.entries(manifest.models)) {
      const summary = buildSummary(slug, entry)
      if (summary && matchesFilters(summary, filters)) {
        models.push(summary)
      }
    }
  }

  return { models, total: models.length, page: 1, limit: models.length }
}

/** Build a single model's detail from disk, or null if not found on disk. */
export function getStaticModelBySlug(slug: string): StaticModelDetail | null {
  const manifest = loadManifest()
  const entry = manifest?.models?.[slug]
  if (!entry) return null

  const summary = buildSummary(slug, entry)
  if (!summary) return null

  return { ...summary, validation: null }
}
