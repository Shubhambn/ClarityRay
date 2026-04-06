'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TopBar from '@/components/nav/TopBar';
import ModelCard from '@/components/models/ModelCard';
import {
  BackendError,
  fetchModels,
  type ModelSummary,
} from '@/lib/api/client';

const BODYPART_OPTIONS = ['all', 'chest', 'brain', 'bone', 'abdomen', 'spine', 'other'] as const;
const MODALITY_OPTIONS = ['all', 'xray', 'ct', 'mri', 'ultrasound', 'pathology', 'other'] as const;

function isActiveFilter(value: string): boolean {
  return value !== 'all';
}

function toFilters(bodypartFilter: string, modalityFilter: string): { bodypart?: string; modality?: string } {
  return {
    bodypart: isActiveFilter(bodypartFilter) ? bodypartFilter : undefined,
    modality: isActiveFilter(modalityFilter) ? modalityFilter : undefined,
  };
}

function normalizeError(error: unknown): string {
  if (error instanceof AggregateError && Array.isArray(error.errors) && error.errors.length > 0) {
    return normalizeError(error.errors[0]);
  }

  if (error instanceof BackendError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error while loading models.';
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    promise
      .then((value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error: unknown) => {
        window.clearTimeout(timeoutId);
        reject(error);
      });
  });
}

async function fetchModelsFromSameOrigin(
  filters: { bodypart?: string; modality?: string },
  signal?: AbortSignal
): Promise<{ models: ModelSummary[] }> {
  const params = new URLSearchParams();
  if (filters.bodypart) {
    params.set('bodypart', filters.bodypart);
  }
  if (filters.modality) {
    params.set('modality', filters.modality);
  }

  const endpoint = `/models${params.toString() ? `?${params.toString()}` : ''}`;
  const response = await fetch(endpoint, { method: 'GET', signal });
  if (!response.ok) {
    throw new BackendError(`Request failed with status ${response.status}`, response.status, endpoint);
  }

  const payload: unknown = await response.json();
  if (typeof payload !== 'object' || payload === null || !Array.isArray((payload as { models?: unknown }).models)) {
    throw new BackendError('Invalid models response', 500, endpoint);
  }

  return { models: (payload as { models: ModelSummary[] }).models };
}

export default function ModelsPage() {
  const [models, setModels] = useState<ModelSummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [backendOnline, setBackendOnline] = useState<boolean>(true);
  const [bodypartFilter, setBodypartFilter] = useState<string>('all');
  const [modalityFilter, setModalityFilter] = useState<string>('all');
  const [reloadToken, setReloadToken] = useState<number>(0);
  const requestIdRef = useRef<number>(0);

  const hasActiveFilters = useMemo(
    () => isActiveFilter(bodypartFilter) || isActiveFilter(modalityFilter),
    [bodypartFilter, modalityFilter]
  );

  const retryLoad = useCallback(() => {
    setReloadToken((value) => value + 1);
  }, []);

  useEffect(() => {
    let active = true;
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    const controller = new AbortController();
    const timeoutMs = 15_000;
    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    async function runLoad(): Promise<void> {
      setIsLoading(true);
      setError(null);
      setBackendOnline(true);

      try {
        const filters = toFilters(bodypartFilter, modalityFilter);
        const response = await Promise.any([
          withTimeout(fetchModels(filters), timeoutMs, 'Primary models request timed out'),
          fetchModelsFromSameOrigin(filters, controller.signal),
        ]);
        if (!active || requestId !== requestIdRef.current) {
          return;
        }

        setModels(response.models);
        setError(null);
      } catch (err: unknown) {
        if (!active || requestId !== requestIdRef.current) {
          return;
        }

        setBackendOnline(false);
        setModels([]);
        setError(normalizeError(err));
      } finally {
        window.clearTimeout(timeoutId);
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void runLoad();

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeoutId);
      setIsLoading(false);
    };
  }, [bodypartFilter, modalityFilter, reloadToken]);

  return (
    <>
      <TopBar />

      {!backendOnline && (
        <div className="backend-offline-banner" role="status" aria-live="polite">
          <p className="backend-offline-banner__title">⚠ Backend API is offline — remote models unavailable</p>
          <p className="backend-offline-banner__hint mono">Start the API: cd api && uvicorn main:app --reload</p>
        </div>
      )}

      <main className="models-page">
        <section className="models-shell">
          <header className="models-header">
            <div>
              <p className="mono label">MODEL LIBRARY</p>
              <h1 className="models-title">Published models</h1>
            </div>
          </header>

          <div className="filter-row" role="search" aria-label="Filter models">
            <select
              value={bodypartFilter}
              onChange={(event) => setBodypartFilter(event.target.value)}
              className="select"
              aria-label="Filter by bodypart"
            >
              {BODYPART_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option === 'all' ? 'All bodyparts' : option}
                </option>
              ))}
            </select>

            <select
              value={modalityFilter}
              onChange={(event) => setModalityFilter(event.target.value)}
              className="select"
              aria-label="Filter by modality"
            >
              {MODALITY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option === 'all' ? 'All modalities' : option}
                </option>
              ))}
            </select>

            {hasActiveFilters && (
              <button
                type="button"
                className="clear-filters-link"
                onClick={() => {
                  setBodypartFilter('all');
                  setModalityFilter('all');
                }}
              >
                Clear filters
              </button>
            )}
          </div>

          {isLoading && (
            <div className="models-grid" aria-busy="true" aria-label="Loading models">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="panel skeleton" style={{ height: '180px' }} aria-hidden="true" />
              ))}
            </div>
          )}

          {!isLoading && error && (
            <div className="error-panel panel" role="alert">
              <h2 className="error-panel__title">Failed to load models</h2>
              <p className="error-panel__message mono">{error}</p>
              <div className="error-panel__actions">
                <button type="button" className="btn" onClick={retryLoad}>
                  Retry
                </button>
              </div>
            </div>
          )}

          {!isLoading && !error && models.length === 0 && (
            <div className="empty-panel panel">
              <div className="empty-icon" aria-hidden="true">🗃️✕</div>
              <h2 className="empty-title">No models published yet</h2>
              <p className="empty-subtitle">
                Models appear here after being pushed with the clarity CLI and published.
              </p>
            </div>
          )}

          {!isLoading && !error && models.length > 0 && (
            <div className="models-grid" aria-label="Available models">
              {models.map((model) => (
                <ModelCard key={model.id ? model.id : model.slug} model={model} />
              ))}
            </div>
          )}
        </section>
      </main>

      <style>{`
        .models-page {
          min-height: 100vh;
          background: var(--bg-base);
          padding: calc(var(--space-16) + var(--space-4)) var(--space-4) var(--space-8);
        }

        .models-shell {
          width: min(1120px, 100%);
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: var(--space-4);
        }

        .models-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid var(--border-subtle);
          padding-bottom: var(--space-2);
        }

        .models-title {
          font-size: 1.5rem;
          line-height: 1.2;
          font-weight: 600;
          color: var(--text-primary);
        }

        .backend-offline-banner {
          background: rgba(245, 158, 11, 0.08);
          border-bottom: 1px solid rgba(245, 158, 11, 0.2);
          padding: var(--sp-3, var(--space-3)) var(--sp-6, var(--space-6));
          margin-top: calc(var(--space-16) + var(--space-2));
        }

        .backend-offline-banner__title {
          color: var(--status-warning);
          font-size: 0.875rem;
          font-weight: 600;
        }

        .backend-offline-banner__hint {
          margin-top: var(--space-1);
          color: var(--text-secondary);
          font-size: 0.75rem;
        }

        .filter-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--space-2);
        }

        .select {
          min-width: 180px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-elevated);
          color: var(--text-primary);
          border-radius: var(--radius-md);
          padding: var(--space-2) var(--space-3);
          font-family: var(--font-ui);
          font-size: 0.875rem;
        }

        .clear-filters-link {
          border: none;
          background: transparent;
          color: var(--accent-primary);
          font-family: var(--font-mono);
          font-size: 0.75rem;
          cursor: pointer;
          text-decoration: underline;
          text-underline-offset: 3px;
        }

        .models-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: var(--space-4);
        }

        .skeleton {
          position: relative;
          overflow: hidden;
          opacity: 0.75;
        }

        .skeleton::after {
          content: '';
          position: absolute;
          inset: 0;
          transform: translateX(-100%);
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 255, 255, 0.08),
            transparent
          );
          animation: model-skeleton-shimmer 1.4s infinite;
        }

        @keyframes model-skeleton-shimmer {
          100% {
            transform: translateX(100%);
          }
        }

        .error-panel {
          border-left: 3px solid var(--status-danger);
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }

        .error-panel__title {
          font-size: 1rem;
          font-weight: 600;
          color: var(--text-primary);
        }

        .error-panel__message {
          color: var(--status-danger);
          font-size: 0.75rem;
        }

        .error-panel__actions {
          display: flex;
          gap: var(--space-2);
          flex-wrap: wrap;
        }

        .empty-panel {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: var(--space-2);
        }

        .empty-icon {
          font-size: 1.4rem;
          line-height: 1;
          color: var(--text-secondary);
        }

        .empty-title {
          font-size: 1rem;
          font-weight: 600;
          color: var(--text-primary);
        }

        .empty-subtitle {
          color: var(--text-secondary);
          font-size: 0.875rem;
          max-width: 48ch;
        }

        @media (max-width: 768px) {
          .models-page {
            padding: calc(var(--space-16) + var(--space-3)) var(--space-3) var(--space-6);
          }

          .select {
            min-width: 100%;
          }
        }
      `}</style>
    </>
  );
}
