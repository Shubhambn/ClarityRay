import { NextResponse } from 'next/server';

import { fetchSpecFromSupabase } from '@/lib/server/supabase';

/**
 * GET /api/models/[slug]/spec
 *
 * Returns the full clarity.json specification for a model, sourced from the
 * spec_json JSONB column in Supabase (migration 006). This eliminates the
 * dependency on local public/models/<slug>/clarity.json files in deployed
 * environments — the data lives in the database, not on disk.
 *
 * Fall-through: when spec_json is null (row predates migration 006) but
 * clarity_url is an absolute URL, this route proxies that URL so older seeded
 * models continue to work without reseeding.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const { slug } = await params;

  const specJson = await fetchSpecFromSupabase(slug);
  if (specJson !== null) {
    return NextResponse.json(specJson, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
      },
    });
  }

  return NextResponse.json(
    { error: 'Spec not found', slug, status_code: 404 },
    { status: 404 },
  );
}
