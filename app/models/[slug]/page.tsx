'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageContainer } from '@/components/ui/layout';

interface ModelVersion {
  version: string;
  file_size_mb?: number;
  clarity_url: string;
  validation_status?: string;
}

interface ModelRecord {
  slug: string;
  name: string;
  bodypart: string;
  modality: string;
  status: string;
}

interface ModelDetailResponse {
  model: ModelRecord;
  current_version: ModelVersion;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toLabel(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function parseModelDetail(payload: unknown): ModelDetailResponse {
  if (!isRecord(payload) || !isRecord(payload.model) || !isRecord(payload.current_version)) {
    throw new Error('Invalid model detail payload.');
  }

  const model = payload.model;
  const currentVersion = payload.current_version;

  if (
    typeof model.slug !== 'string' ||
    typeof model.name !== 'string' ||
    typeof model.bodypart !== 'string' ||
    typeof model.modality !== 'string' ||
    typeof model.status !== 'string'
  ) {
    throw new Error('Model metadata is incomplete.');
  }

  if (typeof currentVersion.version !== 'string' || typeof currentVersion.clarity_url !== 'string') {
    throw new Error('Current version metadata is incomplete.');
  }

  return {
    model: {
      slug: model.slug,
      name: model.name,
      bodypart: model.bodypart,
      modality: model.modality,
      status: model.status
    },
    current_version: {
      version: currentVersion.version,
      clarity_url: currentVersion.clarity_url,
      file_size_mb: typeof currentVersion.file_size_mb === 'number' ? currentVersion.file_size_mb : undefined,
      validation_status:
        typeof currentVersion.validation_status === 'string' ? currentVersion.validation_status : undefined
    }
  };
}

export default function ModelDetailPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = params?.slug;

  const [detail, setDetail] = useState<ModelDetailResponse | null>(null);
  const [specMetadata, setSpecMetadata] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      setLoading(false);
      setError('Missing model slug.');
      return;
    }

    const loadDetail = async () => {
      setLoading(true);
      setError(null);

      try {
        const detailResponse = await fetch(`/api/models/${encodeURIComponent(slug)}`, { cache: 'no-store' });
        if (!detailResponse.ok) {
          throw new Error(`Failed to load model (${detailResponse.status})`);
        }

        const detailPayload: unknown = await detailResponse.json();
        const parsedDetail = parseModelDetail(detailPayload);

        const specResponse = await fetch(parsedDetail.current_version.clarity_url, { cache: 'no-store' });
        if (!specResponse.ok) {
          throw new Error(`Failed to load clarity.json (${specResponse.status})`);
        }

        const specPayload: unknown = await specResponse.json();

        setDetail(parsedDetail);
        setSpecMetadata(specPayload);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to load model details.';
        setError(message);
        setDetail(null);
        setSpecMetadata(null);
      } finally {
        setLoading(false);
      }
    };

    void loadDetail();
  }, [slug]);

  const validationStatus = useMemo(() => {
    if (detail?.current_version.validation_status) {
      return detail.current_version.validation_status;
    }

    if (isRecord(specMetadata) && isRecord(specMetadata.thresholds)) {
      const status = specMetadata.thresholds.validation_status;
      if (typeof status === 'string') {
        return status;
      }
    }

    return 'unknown';
  }, [detail, specMetadata]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[var(--off)] py-10">
        <PageContainer>
          <Card>
            <p className="text-sm text-[var(--muted)]">Loading model details...</p>
          </Card>
        </PageContainer>
      </main>
    );
  }

  if (error || !detail) {
    return (
      <main className="min-h-screen bg-[var(--off)] py-10">
        <PageContainer className="space-y-4">
          <Card>
            <p className="text-sm text-red-600">{error ?? 'Model not found.'}</p>
          </Card>
          <Link href="/models">
            <Button variant="outline">Back to model library</Button>
          </Link>
        </PageContainer>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--off)] py-10">
      <PageContainer className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs text-[var(--muted)]">Model details</p>
            <h1 className="text-3xl font-light tracking-[-0.8px] text-[var(--ink)]">{detail.model.name}</h1>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-[var(--gl)] px-2.5 py-1 text-xs font-medium text-[var(--gd)]">
              {toLabel(detail.model.bodypart)}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
              {toLabel(detail.model.modality)}
            </span>
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
              Published
            </span>
          </div>
        </div>

        <Card>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-[var(--muted)]">Slug</dt>
              <dd className="font-medium text-[var(--ink)]">{detail.model.slug}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Version</dt>
              <dd className="font-medium text-[var(--ink)]">{detail.current_version.version}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Validation status</dt>
              <dd>
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
                  {toLabel(validationStatus)}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">File size</dt>
              <dd className="font-medium text-[var(--ink)]">
                {detail.current_version.file_size_mb !== undefined
                  ? `${detail.current_version.file_size_mb.toFixed(2)} MB`
                  : '—'}
              </dd>
            </div>
          </dl>

          <Button
            className="mt-4"
            onClick={() => {
              window.localStorage.setItem('clarityray_selected_model', detail.model.slug);
              router.push('/analysis');
            }}
          >
            Use this model for analysis
          </Button>
        </Card>

        <Card>
          <h2 className="mb-2 text-base font-medium text-[var(--ink)]">clarity.json metadata</h2>
          <pre className="max-h-[460px] overflow-auto rounded-xl border border-[var(--border)] bg-[#0d1117] p-4 text-xs text-slate-100">
            {JSON.stringify(specMetadata, null, 2)}
          </pre>
        </Card>
      </PageContainer>
    </main>
  );
}
