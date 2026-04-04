'use client';

import { useEffect, useMemo, useState } from 'react';
import TopBar from '@/components/nav/TopBar';
import ModelCard, { type ModelCardData } from '@/components/models/ModelCard';

/* ─── Raw API types ─────────────────────────────────────────────────────── */

interface RawVersion {
  version: string;
  file_size_mb?: number;
}

interface RawModelItem {
  slug: string;
  name: string;
  bodypart: string;
  modality: string;
  status: string;
  current_version?: RawVersion | null;
  certified?: boolean;
  output_classes?: string[];
  safety_tier?: string;
}

/* ─── Guards ────────────────────────────────────────────────────────────── */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseItems(payload: unknown): ModelCardData[] {
  if (!isRecord(payload) || !Array.isArray(payload['items'])) {
    throw new Error('Invalid /api/models response shape.');
  }

  return (payload['items'] as unknown[]).flatMap((raw) => {
    if (!isRecord(raw)) return [];

    const slug = typeof raw['slug'] === 'string' ? raw['slug'] : null;
    const name = typeof raw['name'] === 'string' ? raw['name'] : null;
    if (!slug || !name) return [];

    const status = typeof raw['status'] === 'string' ? raw['status'] : '';
    if (status.toLowerCase() !== 'published') return [];

    const bodypart  = typeof raw['bodypart']  === 'string' ? raw['bodypart']  : '';
    const modality  = typeof raw['modality']  === 'string' ? raw['modality']  : '';
    const certified = typeof raw['certified'] === 'boolean' ? raw['certified'] : false;
    const safetyTier = typeof raw['safety_tier'] === 'string' ? raw['safety_tier'] : 'screening';

    const outputClasses: string[] = Array.isArray(raw['output_classes'])
      ? (raw['output_classes'] as unknown[]).filter((c): c is string => typeof c === 'string')
      : [];

    let version: string | undefined;
    let fileSizeMb: number | undefined;
    const cv = raw['current_version'];
    if (isRecord(cv)) {
      if (typeof cv['version'] === 'string') version = cv['version'];
      if (typeof cv['file_size_mb'] === 'number') fileSizeMb = cv['file_size_mb'];
    }

    return [{ slug, name, bodypart, modality, version, fileSizeMb, outputClasses, certified, safetyTier }];
  });
}

/* ─── Skeleton card ─────────────────────────────────────────────────────── */

function SkeletonCard() {
  return <div className="skeleton-card panel" aria-hidden="true" />;
}

/* ─── Filter dropdown ───────────────────────────────────────────────────── */

interface FilterSelectProps {
  id: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
}

function FilterSelect({ id, value, onChange, options, placeholder }: FilterSelectProps) {
  return (
    <div className="filter-select-wrap">
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="filter-select"
        aria-label={placeholder}
      >
        <option value="all">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt.replace(/[-_]/g, ' ')}
          </option>
        ))}
      </select>
      <ChevronIcon />
    </div>
  );
}

function ChevronIcon() {
  return (
    <svg
      className="filter-select-chevron"
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
    >
      <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ─── Page ──────────────────────────────────────────────────────────────── */

export default function ModelsPage() {
  const [models, setModels]             = useState<ModelCardData[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [bodypartFilter, setBodypartFilter] = useState('all');
  const [modalityFilter, setModalityFilter] = useState('all');

  const loadModels = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/models', { cache: 'no-store' });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const payload: unknown = await res.json();
      setModels(parseItems(payload));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to fetch models.');
      setModels([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadModels(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Filter options derived from loaded models */
  const bodypartOptions = useMemo(
    () => Array.from(new Set(models.map((m) => m.bodypart).filter(Boolean))).sort(),
    [models],
  );
  const modalityOptions = useMemo(
    () => Array.from(new Set(models.map((m) => m.modality).filter(Boolean))).sort(),
    [models],
  );

  const filtered = useMemo(() => {
    return models.filter((m) => {
      if (bodypartFilter !== 'all' && m.bodypart !== bodypartFilter) return false;
      if (modalityFilter !== 'all' && m.modality !== modalityFilter) return false;
      return true;
    });
  }, [models, bodypartFilter, modalityFilter]);

  const hasActiveFilters = bodypartFilter !== 'all' || modalityFilter !== 'all';

  return (
    <>
      <TopBar />

      <main className="models-page">
        <div className="models-shell">
          {/* Page header */}
          <header className="models-header">
            <div>
              <p className="models-header__eyebrow mono">MODEL LIBRARY</p>
              <h1 className="models-header__title">Published verified models</h1>
            </div>
            <div className="status-dot" aria-hidden="true" />
          </header>

          {/* Filter row */}
          <div className="models-filters" role="search" aria-label="Filter models">
            <FilterSelect
              id="bodypart-filter"
              value={bodypartFilter}
              onChange={setBodypartFilter}
              options={bodypartOptions}
              placeholder="All body parts"
            />
            <FilterSelect
              id="modality-filter"
              value={modalityFilter}
              onChange={setModalityFilter}
              options={modalityOptions}
              placeholder="All modalities"
            />
            {hasActiveFilters && (
              <button
                className="models-filters__clear"
                onClick={() => { setBodypartFilter('all'); setModalityFilter('all'); }}
              >
                Clear filters
              </button>
            )}
          </div>

          {/* Loading — 6 skeleton cards */}
          {loading && (
            <div className="models-grid" aria-busy="true" aria-label="Loading models">
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="models-state panel panel-accent">
              <p className="models-state__title">Failed to load models</p>
              <p className="models-state__body">{error}</p>
              <button className="btn models-state__retry" onClick={() => void loadModels()}>
                Retry
              </button>
            </div>
          )}

          {/* Empty */}
          {!loading && !error && filtered.length === 0 && (
            <div className="models-state panel">
              <p className="models-state__title">No published models match your filters</p>
              {hasActiveFilters && (
                <button
                  className="models-state__clear-link"
                  onClick={() => { setBodypartFilter('all'); setModalityFilter('all'); }}
                >
                  Clear filters
                </button>
              )}
            </div>
          )}

          {/* Model grid */}
          {!loading && !error && filtered.length > 0 && (
            <div className="models-grid" aria-label="Published models">
              {filtered.map((model) => (
                <ModelCard key={model.slug} model={model} />
              ))}
            </div>
          )}
        </div>
      </main>

      <style>{`
        .models-page {
          min-height: 100vh;
          background: var(--bg-base);
          padding-top: 80px;
          padding-bottom: 64px;
        }
        .models-shell {
          width: min(1120px, 100% - 2rem);
          margin-inline: auto;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        /* Header */
        .models-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 4px;
          border-bottom: 1px solid var(--border-subtle);
        }
        .models-header__eyebrow {
          font-size: 10px;
          letter-spacing: 0.1em;
          color: var(--accent-primary);
          margin-bottom: 4px;
        }
        .models-header__title {
          font-family: var(--font-ui);
          font-size: 1.5rem;
          font-weight: 400;
          color: var(--text-primary);
          letter-spacing: -0.02em;
        }

        /* Filters */
        .models-filters {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
        }
        .filter-select-wrap {
          position: relative;
          display: flex;
          align-items: center;
        }
        .filter-select {
          appearance: none;
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          padding: 6px 28px 6px 10px;
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--text-secondary);
          outline: none;
          cursor: pointer;
          transition: border-color var(--transition-base);
        }
        .filter-select:focus {
          border-color: var(--border-accent);
          color: var(--text-primary);
        }
        .filter-select:hover {
          border-color: var(--border-default);
        }
        .filter-select-chevron {
          position: absolute;
          right: 8px;
          pointer-events: none;
          color: var(--text-tertiary);
        }
        .models-filters__clear {
          background: none;
          border: none;
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--accent-primary);
          cursor: pointer;
          padding: 6px 4px;
          opacity: 0.75;
          transition: opacity var(--transition-fast);
        }
        .models-filters__clear:hover {
          opacity: 1;
        }

        /* Grid */
        .models-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }
        @media (max-width: 900px) {
          .models-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 639px) {
          .models-grid { grid-template-columns: 1fr; }
        }

        /* Skeleton card */
        .skeleton-card {
          height: 180px;
          border-radius: var(--radius-lg);
          background: var(--bg-elevated);
          animation: skeleton-pulse 1.6s ease-in-out infinite;
        }
        @keyframes skeleton-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.45; }
        }

        /* State panels */
        .models-state {
          padding: 32px 24px;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 12px;
        }
        .models-state__title {
          font-family: var(--font-ui);
          font-size: 0.9375rem;
          font-weight: 500;
          color: var(--text-primary);
        }
        .models-state__body {
          font-family: var(--font-mono);
          font-size: 12px;
          color: var(--text-secondary);
        }
        .models-state__retry {
          margin-top: 4px;
        }
        .models-state__clear-link {
          background: none;
          border: none;
          font-family: var(--font-mono);
          font-size: 12px;
          color: var(--accent-primary);
          cursor: pointer;
          padding: 0;
          opacity: 0.8;
        }
        .models-state__clear-link:hover { opacity: 1; }
      `}</style>
    </>
  );
}
