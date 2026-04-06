import { NextResponse } from 'next/server';

const API_BASE = process.env.NEXT_PUBLIC_API_URL;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  if (!API_BASE) {
    return NextResponse.json(
      { error: 'NEXT_PUBLIC_API_URL is not configured' },
      { status: 503 },
    );
  }

  const { slug } = await params;

  try {
    const res = await fetch(`${API_BASE}/models/${slug}`, { cache: 'no-store' });
    const data: unknown = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { error: 'Backend unavailable' },
      { status: 503 },
    );
  }
}
