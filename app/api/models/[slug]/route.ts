import { NextResponse } from 'next/server';

import { getStaticModelBySlug } from '@/lib/server/staticModels';
import { fetchModelBySlugFromSupabase } from '@/lib/server/supabase';

const API_BASE = process.env.NEXT_PUBLIC_API_URL;

function staticResponse(slug: string): NextResponse {
  const detail = getStaticModelBySlug(slug);
  if (!detail) {
    return NextResponse.json(
      { error: 'Model not found', slug, status_code: 404 },
      { status: 404 },
    );
  }
  return NextResponse.json(detail);
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const { slug } = await params;

  // 1) Supabase direct — primary source on all deployed environments.
  const supabaseDetail = await fetchModelBySlugFromSupabase(slug);
  if (supabaseDetail) {
    return NextResponse.json(supabaseDetail);
  }

  // 2) FastAPI backend (local dev with python backend running).
  if (API_BASE) {
    try {
      const res = await fetch(`${API_BASE}/models/${slug}`, { cache: 'no-store' });
      if (res.status === 404) {
        const local = getStaticModelBySlug(slug);
        if (local) return NextResponse.json(local);
        return NextResponse.json(await res.json(), { status: 404 });
      }
      if (res.ok) {
        return NextResponse.json(await res.json(), { status: res.status });
      }
    } catch {
      // fall through to static
    }
  }

  // 3) Static on-disk catalog — always available as final fallback.
  return staticResponse(slug);
}
