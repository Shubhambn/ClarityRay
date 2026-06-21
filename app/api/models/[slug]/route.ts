import { NextResponse } from 'next/server';

import { getStaticModelBySlug } from '@/lib/server/staticModels';

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

  // Degraded/local mode: no backend configured → serve the on-disk model.
  if (!API_BASE) {
    return staticResponse(slug);
  }

  try {
    const res = await fetch(`${API_BASE}/models/${slug}`, { cache: 'no-store' });
    // If the backend doesn't have the model (e.g. DB not seeded), fall back to
    // the on-disk catalog so bundled/exported models always resolve without a
    // manual DB seed. Only a model absent from BOTH the DB and disk is a real
    // 404. (Anything else that isn't ok — e.g. 503 — also falls back below.)
    if (res.status === 404) {
      const local = getStaticModelBySlug(slug);
      if (local) {
        return NextResponse.json(local);
      }
      const data: unknown = await res.json();
      return NextResponse.json(data, { status: 404 });
    }
    if (!res.ok) {
      return staticResponse(slug);
    }
    const data: unknown = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return staticResponse(slug);
  }
}
