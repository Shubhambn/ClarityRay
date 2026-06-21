import { NextResponse } from 'next/server';

import {
  getStaticModels,
  type ModelFilters,
  type StaticModelsResponse,
  type StaticModelSummary,
} from '@/lib/server/staticModels';

const API_BASE = process.env.NEXT_PUBLIC_API_URL;

function filtersFromUrl(url: string): ModelFilters {
  const params = new URL(url).searchParams;
  const filters: ModelFilters = {};
  const bodypart = params.get('bodypart');
  const modality = params.get('modality');
  const task = params.get('task');
  const validationStatus = params.get('validation_status');
  if (bodypart) filters.bodypart = bodypart;
  if (modality) filters.modality = modality;
  if (task) filters.task = task;
  if (validationStatus) filters.validation_status = validationStatus;
  return filters;
}

function staticResponse(req: Request): NextResponse {
  return NextResponse.json(getStaticModels(filtersFromUrl(req.url)));
}

export async function GET(req: Request): Promise<NextResponse> {
  // Degraded/local mode: no backend configured → serve the on-disk catalog.
  if (!API_BASE) {
    return staticResponse(req);
  }

  try {
    const search = new URL(req.url).search;
    const res = await fetch(`${API_BASE}/models${search}`, { cache: 'no-store' });
    // Backend reachable but unable to serve models (e.g. 503 with no DB) →
    // fall back to the static catalog so local models still appear.
    if (!res.ok) {
      return staticResponse(req);
    }
    const data = (await res.json()) as StaticModelsResponse;
    // Union the backend catalog with on-disk models the DB doesn't know about,
    // so bundled/exported models always appear under /models without a DB seed.
    const backendSlugs = new Set((data.models ?? []).map((m) => m.slug));
    const extras = getStaticModels(filtersFromUrl(req.url)).models.filter(
      (m: StaticModelSummary) => !backendSlugs.has(m.slug),
    );
    if (extras.length > 0) {
      const models = [...(data.models ?? []), ...extras];
      return NextResponse.json({ ...data, models, total: models.length });
    }
    return NextResponse.json(data, { status: res.status });
  } catch {
    return staticResponse(req);
  }
}
