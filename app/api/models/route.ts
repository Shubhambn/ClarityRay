import { NextResponse } from 'next/server';

import {
  getStaticModels,
  type ModelFilters,
  type StaticModelsResponse,
  type StaticModelSummary,
} from '@/lib/server/staticModels';
import { fetchModelsFromSupabase } from '@/lib/server/supabase';

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

/** Merge Supabase/backend results with on-disk models not yet registered in the DB. */
function mergeWithStatic(data: StaticModelsResponse, req: Request): StaticModelsResponse {
  const backendSlugs = new Set((data.models ?? []).map((m) => m.slug));
  const extras = getStaticModels(filtersFromUrl(req.url)).models.filter(
    (m: StaticModelSummary) => !backendSlugs.has(m.slug),
  );
  if (extras.length === 0) return data;
  const models = [...(data.models ?? []), ...extras];
  return { ...data, models, total: models.length };
}

export async function GET(req: Request): Promise<NextResponse> {
  const filters = filtersFromUrl(req.url);

  // 1) Supabase direct — primary source on all deployed environments.
  const supabaseData = await fetchModelsFromSupabase(filters);
  if (supabaseData && supabaseData.models.length > 0) {
    return NextResponse.json(mergeWithStatic(supabaseData, req));
  }

  // 2) FastAPI backend (local dev with python backend running).
  if (API_BASE) {
    try {
      const search = new URL(req.url).search;
      const res = await fetch(`${API_BASE}/models${search}`, { cache: 'no-store' });
      if (res.ok) {
        const data = (await res.json()) as StaticModelsResponse;
        return NextResponse.json(mergeWithStatic(data, req));
      }
    } catch {
      // fall through to static
    }
  }

  // 3) Static on-disk catalog — always available as final fallback.
  return staticResponse(req);
}
