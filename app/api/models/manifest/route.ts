import { readFileSync } from 'fs'
import { join } from 'path'
import { NextResponse } from 'next/server'
import type { ManifestSpec } from '@/lib/clarity/manifest'
import { fetchModelsFromSupabase } from '@/lib/server/supabase'

// Server-side only: never exposed to the client bundle
const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? ''

// The default model slug shown on the analysis page when no model is selected.
const DEFAULT_MODEL_SLUG = 'densenet121-chest'

/**
 * Build a ManifestSpec from Supabase model records merged with the local
 * static manifest. Supabase entries take precedence when the same slug exists
 * in both, but local-only models (not yet seeded to Supabase) are always
 * included so they remain selectable from the model library.
 */
async function buildManifestFromSupabase(): Promise<ManifestSpec | null> {
  const data = await fetchModelsFromSupabase()
  if (!data || data.models.length === 0) return null

  const models: ManifestSpec['models'] = {}
  for (const model of data.models) {
    const v = model.current_version
    if (!v) continue
    models[model.slug] = {
      version: v.version,
      // The spec URL always points to the Supabase-backed spec route so
      // clients never depend on local public/models/<slug>/clarity.json files.
      spec_url: `/api/models/${model.slug}/spec`,
      url: v.onnx_url,
    }
  }

  if (Object.keys(models).length === 0) return null

  // Merge local manifest entries so models that exist on disk but have not
  // yet been seeded to Supabase are still reachable. Supabase wins on conflict.
  try {
    const staticPath = join(process.cwd(), 'public', 'models', 'manifest.json')
    const localManifest = JSON.parse(readFileSync(staticPath, 'utf-8')) as ManifestSpec
    for (const [slug, entry] of Object.entries(localManifest.models)) {
      if (!models[slug]) {
        models[slug] = entry
      }
    }
  } catch {
    // Local manifest unavailable — Supabase-only models remain usable.
  }

  // Pick current_model: prefer the default slug, fall back to the first model.
  const current_model = models[DEFAULT_MODEL_SLUG]
    ? DEFAULT_MODEL_SLUG
    : Object.keys(models)[0]

  return { current_model, version: '1.0.0', models }
}

export async function GET() {
  // 1. Primary: FastAPI backend /manifest endpoint (live Supabase view).
  if (API_URL) {
    try {
      const res = await fetch(`${API_URL}/manifest`, {
        next: { revalidate: 60 },
      })
      if (res.ok) {
        const data = await res.json() as ManifestSpec
        if (
          typeof data.current_model === 'string' &&
          data.current_model.length > 0 &&
          typeof data.models === 'object' &&
          data.models[data.current_model]
        ) {
          return NextResponse.json(data, {
            headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30' },
          })
        }
      }
    } catch {
      // fall through
    }
  }

  // 2. Supabase direct — builds manifest from the model registry.
  //    spec_url for each model points to /api/models/[slug]/spec which reads
  //    spec_json from Supabase, keeping everything off the local filesystem.
  try {
    const supabaseManifest = await buildManifestFromSupabase()
    if (supabaseManifest) {
      return NextResponse.json(supabaseManifest, {
        headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30' },
      })
    }
  } catch {
    // fall through
  }

  // 3. Static fallback — local public/models/manifest.json (local dev only).
  try {
    const staticPath = join(process.cwd(), 'public', 'models', 'manifest.json')
    const staticJson = JSON.parse(readFileSync(staticPath, 'utf-8'))
    return NextResponse.json(staticJson)
  } catch {
    return NextResponse.json({ error: 'Manifest unavailable' }, { status: 503 })
  }
}
