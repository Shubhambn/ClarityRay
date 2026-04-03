'use client';

import Link from 'next/link';
import { Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageContainer } from '@/components/ui/layout';

interface ModelVersion {
  version: string;
  file_size_mb: number;
}

interface ModelItem {
  slug: string;
  name: string;
  bodypart: string;
  modality: string;
  status: string;
  current_version: ModelVersion | null;
}

interface ModelsResponse {
  items: ModelItem[];
}

function toLabel(value: string): string {
  if (!value) {
    return 'Unknown';
  }

  return value
    .split(/[-_\s]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseModelsResponse(payload: unknown): ModelsResponse {
  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    throw new Error('Invalid models response payload.');
  }

  const items: ModelItem[] = payload.items.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    const slug = typeof item.slug === 'string' ? item.slug : null;
    const name = typeof item.name === 'string' ? item.name : null;
    const bodypart = typeof item.bodypart === 'string' ? item.bodypart : '';
    const modality = typeof item.modality === 'string' ? item.modality : '';
    const status = typeof item.status === 'string' ? item.status : '';

    if (!slug || !name) {
      return [];
    }

    let currentVersion: ModelVersion | null = null;
    if (isRecord(item.current_version)) {
      const version = typeof item.current_version.version === 'string' ? item.current_version.version : null;
      const fileSize =
        typeof item.current_version.file_size_mb === 'number' ? item.current_version.file_size_mb : null;

      if (version && fileSize !== null) {
        currentVersion = {
          version,
          file_size_mb: fileSize
        };
      }
    }

    return [
      {
        slug,
        name,
        bodypart,
        modality,
        status,
        current_version: currentVersion
      }
    ];
  });

  return { items };
}

export default function ModelsPage() {
  const [models, setModels] = useState<ModelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [bodypartFilter, setBodypartFilter] = useState('all');
  const [modalityFilter, setModalityFilter] = useState('all');

  useEffect(() => {
    const loadModels = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/models', { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`Failed to load models (${response.status})`);
        }

        const payload: unknown = await response.json();
        const parsed = parseModelsResponse(payload);
        const publishedOnly = parsed.items.filter((model) => model.status.toLowerCase() === 'published');
        setModels(publishedOnly);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to fetch models.';
        setError(message);
        setModels([]);
      } finally {
        setLoading(false);
      }
    };

    void loadModels();
  }, []);

  const bodypartOptions = useMemo(() => {
    return Array.from(new Set(models.map((model) => model.bodypart).filter((value) => value.length > 0))).sort();
  }, [models]);

  const modalityOptions = useMemo(() => {
    return Array.from(new Set(models.map((model) => model.modality).filter((value) => value.length > 0))).sort();
  }, [models]);

  const filteredModels = useMemo(() => {
    const queryValue = query.trim().toLowerCase();

    return models.filter((model) => {
      if (bodypartFilter !== 'all' && model.bodypart !== bodypartFilter) {
        return false;
      }

      if (modalityFilter !== 'all' && model.modality !== modalityFilter) {
        return false;
      }

      if (!queryValue) {
        return true;
      }

      return model.name.toLowerCase().includes(queryValue) || model.slug.toLowerCase().includes(queryValue);
    });
  }, [bodypartFilter, modalityFilter, models, query]);

  return (
    <main className="min-h-screen bg-[var(--off)] py-10">
      <PageContainer>
        <header className="mb-6">
          <h1 className="text-3xl font-light tracking-[-0.8px] text-[var(--ink)]">Model Library</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Browse published screening models and select one for analysis.</p>
        </header>

        <Card className="mb-5 p-4">
          <div className="grid gap-3 md:grid-cols-[1fr_200px_200px]">
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search model name or slug"
                className="h-10 w-full rounded-lg border border-[var(--border)] bg-white pl-9 pr-3 text-sm text-[var(--ink)] outline-none focus:ring-2 focus:ring-[var(--gm)]"
              />
            </div>

            <select
              value={bodypartFilter}
              onChange={(event) => setBodypartFilter(event.target.value)}
              className="h-10 rounded-lg border border-[var(--border)] bg-white px-3 text-sm text-[var(--ink)] outline-none focus:ring-2 focus:ring-[var(--gm)]"
            >
              <option value="all">All body parts</option>
              {bodypartOptions.map((bodypart) => (
                <option key={bodypart} value={bodypart}>
                  {toLabel(bodypart)}
                </option>
              ))}
            </select>

            <select
              value={modalityFilter}
              onChange={(event) => setModalityFilter(event.target.value)}
              className="h-10 rounded-lg border border-[var(--border)] bg-white px-3 text-sm text-[var(--ink)] outline-none focus:ring-2 focus:ring-[var(--gm)]"
            >
              <option value="all">All modalities</option>
              {modalityOptions.map((modality) => (
                <option key={modality} value={modality}>
                  {toLabel(modality)}
                </option>
              ))}
            </select>
          </div>
        </Card>

        {loading ? (
          <Card>
            <p className="text-sm text-[var(--muted)]">Loading models...</p>
          </Card>
        ) : null}

        {error ? (
          <Card>
            <p className="text-sm text-red-600">{error}</p>
            <Button className="mt-3" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </Card>
        ) : null}

        {!loading && !error ? (
          filteredModels.length === 0 ? (
            <Card>
              <p className="text-sm text-[var(--muted)]">No models matched your filters.</p>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredModels.map((model) => (
                <Link key={model.slug} href={`/models/${model.slug}`}>
                  <Card className="h-full cursor-pointer p-4 transition hover:shadow-[0_8px_30px_rgba(0,0,0,0.1)]">
                    <p className="text-lg font-medium text-[var(--ink)]">{model.name}</p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full bg-[var(--gl)] px-2.5 py-1 text-xs font-medium text-[var(--gd)]">
                        {toLabel(model.bodypart)}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                        {toLabel(model.modality)}
                      </span>
                      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                        Published
                      </span>
                    </div>

                    <dl className="mt-4 grid gap-1 text-sm">
                      <div className="flex items-center justify-between">
                        <dt className="text-[var(--muted)]">Version</dt>
                        <dd className="font-medium text-[var(--ink)]">
                          {model.current_version?.version ?? '—'}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between">
                        <dt className="text-[var(--muted)]">File size</dt>
                        <dd className="font-medium text-[var(--ink)]">
                          {model.current_version ? `${model.current_version.file_size_mb.toFixed(2)} MB` : '—'}
                        </dd>
                      </div>
                    </dl>
                  </Card>
                </Link>
              ))}
            </div>
          )
        ) : null}
      </PageContainer>
    </main>
  );
}
