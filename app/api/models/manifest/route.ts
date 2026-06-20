import { readFileSync } from 'fs'
import { join } from 'path'
import { NextResponse } from 'next/server'
import type { ManifestSpec } from '@/lib/clarity/manifest'

// Server-side only: never exposed to the client bundle
const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? ''

export async function GET() {
  // Primary: fetch the dedicated /manifest endpoint on the FastAPI backend.
  // This returns a live view of all published models from Supabase.
  if (API_URL) {
    try {
      const res = await fetch(`${API_URL}/manifest`, {
        next: { revalidate: 60 },
      })
      if (res.ok) {
        const data = await res.json() as ManifestSpec
        // Validate minimal shape before forwarding
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
      // fall through to static manifest
    }
  }

  // Static fallback — always present in the repo for local dev without an API
  try {
    const staticPath = join(process.cwd(), 'public', 'models', 'manifest.json')
    const staticJson = JSON.parse(readFileSync(staticPath, 'utf-8'))
    return NextResponse.json(staticJson)
  } catch {
    return NextResponse.json({ error: 'Manifest unavailable' }, { status: 503 })
  }
}
