'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import TopBar from '@/components/nav/TopBar';
import ModelCard from '@/components/models/ModelCard';
import {
  BackendError,
  checkBackendHealth,
  fetchModels,
  type ModelSummary,
  type ModelsResponse,
} from '@/lib/api/client';

const DEFAULT_LOCAL_SLUG = 'densenet121-chest';
const SELECTED_MODEL_KEY = 'clarityray_selected_model';

const LOCAL_FALLBACK_MODEL: ModelSummary = {
  id: 'densenet121-chest',
  slug: 'densenet121-chest',
  name: 'DenseNet121 Chest X-ray Binary Classifier',
  bodypart: 'chest',
  modality: 'xray',
  status: 'local',
  published_at: null,
  current_version: {
    id: 'densenet121-chest@1.0.0',
    version: '1.0.0',
    onnx_url: '/models/densenet121-chest/model.onnx',
    clarity_url: '/models/densenet121-chest/clarity.json',
    file_size_mb: null,
    is_current: true,
  },
};

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
  if (error instanceof BackendError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error while loading models.';
}

function normalizeModelsForState(models: ModelSummary[]): ModelSummary[] {
  return models.map((model) => ({
    ...model,
    bodypart: model.bodypart == null ? 'other' : model.bodypart,
    modality: model.modality == null ? 'other' : model.modality,
    current_version: model.current_version
      ? {
          ...model.current_version,
          is_current: model.current_version.is_current ?? true,
        }
      : null,
  }));
}

async function fetchModelsWithDeadline(filters: {
  bodypart?: string;
  modality?: string;
}): Promise<ModelsResponse> {
  return await Promise.race<ModelsResponse>([
    fetchModels(filters),
    new Promise<never>((_, reject) => {
      const timeout = setTimeout(() => {
        clearTimeout(timeout);
        reject(new BackendError('Request timed out after 10 seconds', 408, '/models'));
      }, 10_000);
    }),
  ]);
}

export default function ModelsPage() {
  const router = useRouter();

  const [models, setModels] = useState<ModelSummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [backendOnline, setBackendOnline] = useState<boolean>(true);
  const [bodypartFilter, setBodypartFilter] = useState<string>('all');
  const [modalityFilter, setModalityFilter] = useState<string>('all');

  const hasActiveFilters = useMemo(
    () => isActiveFilter(bodypartFilter) || isActiveFilter(modalityFilter),
    [bodypartFilter, modalityFilter]
  );

  const useLocalFallback = useCallback(() => {
    setModels([LOCAL_FALLBACK_MODEL]);
    setError(null);
  }, []);

  const goToLocalAnalysis = useCallback(() => {
    window.localStorage.setItem(SELECTED_MODEL_KEY, DEFAULT_LOCAL_SLUG);
    router.push('/analysis');
  }, [router]);

  const loadModels = useCallback(
    async (options?: { preserveErrorForOffline?: boolean }) => {
      const preserveErrorForOffline = options?.preserveErrorForOffline ?? false;
      setIsLoading(true);
      setError(null);

      try {
        const filters = toFilters(bodypartFilter, modalityFilter);
        const response = await fetchModelsWithDeadline(filters);
        setModels(normalizeModelsForState(response.models));
        console.log('[models] setModels from loadModels:', response.models);
      } catch (err: unknown) {
        const message = normalizeError(err);

        if (!backendOnline && !preserveErrorForOffline) {
          setModels([LOCAL_FALLBACK_MODEL]);
          setError(null);
        } else {
          setModels([]);
          setError(message);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [backendOnline, bodypartFilter, modalityFilter]
  );

  useEffect(() => {
    let cancelled = false;

    async function init(): Promise<void> {
      setIsLoading(true);
      setError(null);

      const health = await checkBackendHealth();
      if (cancelled) return;

      setBackendOnline(health.ok);

      if (!health.ok) {
        setModels([LOCAL_FALLBACK_MODEL]);
      }

      try {
        const filters = toFilters(bodypartFilter, modalityFilter);
        const response = await fetchModelsWithDeadline(filters);
        if (cancelled) return;
        setModels(normalizeModelsForState(response.models));
        console.log('[models] setModels from init:', response.models);
      } catch (err: unknown) {
        if (cancelled) return;

        if (!health.ok) {
          setModels([LOCAL_FALLBACK_MODEL]);
          setError(null);
        } else {
          setModels([]);
          setError(normalizeError(err));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void init();

    return () => {
      cancelled = true;
    };
  }, [bodypartFilter, modalityFilter]);

  return (
    <>
      <TopBar />

      {!backendOnline && (
        <div className="backend-offline-banner" role="status" aria-live="polite">
          <p className="backend-offline-banner__title">⚠ Backend API is offline — showing local models only</p>
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
                <button type="button" className="btn" onClick={() => void loadModels({ preserveErrorForOffline: true })}>
                  Retry
                </button>
                <button type="button" className="btn" onClick={useLocalFallback}>
                  Use local model
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
              <button type="button" className="btn" onClick={goToLocalAnalysis}>
                Use local model
              </button>
            </div>
          )}

          {!isLoading && !error && models.length > 0 && (
            <div className="models-grid" aria-label="Available models">
              {models.map((model) => (
                <ModelCard key={model.id || model.slug} model={model} />
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
