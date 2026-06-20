import { readFileSync } from 'fs'
import { join } from 'path'
import { NextResponse } from 'next/server'
import type { ManifestSpec } from '@/lib/clarity/manifest'

// Server-side only: never exposed to the client bundle
const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? ''

export async function GET() {
  if (API_URL) {
    try {
      const res = await fetch(`${API_URL}/models?limit=50`, {
        next: { revalidate: 60 },
      })
      if (res.ok) {
        const data = await res.json() as {
          models: Array<{
            slug: string
            current_version: {
              version: string | null
              onnx_url: string | null
              clarity_url: string | null
            } | null
          }>
        }
        const models: ManifestSpec['models'] = {}
        for (const model of data.models ?? []) {
          const v = model.current_version
          if (model.slug && v?.onnx_url && v?.clarity_url && v?.version) {
            models[model.slug] = {
              version: v.version,
              url: v.onnx_url,
              spec_url: v.clarity_url,
            }
          }
        }
        if (Object.keys(models).length > 0) {
          const current_model = Object.keys(models)[0]!
          const manifest: ManifestSpec = { current_model, version: '1.0', models }
          return NextResponse.json(manifest, {
            headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30' },
          })
        }
      }
    } catch {
      // fall through to static manifest
    }
  }

  // Static fallback — always present in the repo
  try {
    const staticPath = join(process.cwd(), 'public', 'models', 'manifest.json')
    const staticJson = JSON.parse(readFileSync(staticPath, 'utf-8'))
    return NextResponse.json(staticJson)
  } catch {
    return NextResponse.json({ error: 'Manifest unavailable' }, { status: 503 })
  }
}
