'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ModelCard from '@/components/models/ModelCard';
import {
  BackendError,
  fetchModels,
  type ModelSummary,
} from '@/lib/api/client';

// ─── Constants ────────────────────────────────────────────────────────────────

const BODYPART_OPTIONS = ['all', 'chest', 'brain', 'bone', 'abdomen', 'spine', 'other'] as const;
const MODALITY_OPTIONS = ['all', 'xray', 'ct', 'mri', 'ultrasound', 'pathology', 'other'] as const;
const TASK_OPTIONS = ['all', 'binary', 'multilabel', 'multiclass', 'regression'] as const;
const VALIDATION_OPTIONS = ['all', 'validated', 'unvalidated'] as const;

/** Slugs that exist on disk and always load regardless of backend state. */
const STATIC_SLUGS = new Set([
  'densenet121-chest',
  'densenet121-cxr-suspicious',
  'densenet121-cxr-suspicious-binary',
  'densenet121-nih',
  'brain-ctscan-cancer',
  'resnet50-cxr-suspicious',
]);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isActiveFilter(value: string): boolean {
  return value !== 'all';
}

function toFilters(
  bodypartFilter: string,
  modalityFilter: string,
  taskFilter: string,
  validationFilter: string
): { bodypart?: string; modality?: string; task?: string; validation_status?: string } {
  return {
    bodypart: isActiveFilter(bodypartFilter) ? bodypartFilter : undefined,
    modality: isActiveFilter(modalityFilter) ? modalityFilter : undefined,
    task: isActiveFilter(taskFilter) ? taskFilter : undefined,
    validation_status: isActiveFilter(validationFilter) ? validationFilter : undefined,
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
  return 'Unknown error while loading remote models.';
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

function matchesFilters(
  model: ModelSummary,
  bodypart: string,
  modality: string,
  task: string,
  validation: string
): boolean {
  if (isActiveFilter(bodypart) && model.bodypart.toLowerCase() !== bodypart) return false;
  if (isActiveFilter(modality) && model.modality.toLowerCase() !== modality) return false;
  if (isActiveFilter(task) && (model.task || 'binary').toLowerCase() !== task) return false;
  if (isActiveFilter(validation) && (model.validation_status || 'unvalidated').toLowerCase() !== validation) return false;
  return true;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ label, count }: { label: string; count: number }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        marginBottom: 'var(--space-3)',
      }}
    >
      <span className="label">{label}</span>
      <span className="badge badge-muted">{count}</span>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="models-grid" aria-busy="true" aria-label="Loading remote models">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="panel skeleton" style={{ height: '180px' }} aria-hidden="true" />
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ModelsPage() {
  // Static models — loaded from /api/models (which always falls back to disk)
  const [staticModels, setStaticModels] = useState<ModelSummary[]>([]);
  const [staticLoading, setStaticLoading] = useState<boolean>(true);

  // Backend-only models — the extra ones from Supabase/FastAPI not in static set
  const [backendModels, setBackendModels] = useState<ModelSummary[]>([]);
  const [backendLoading, setBackendLoading] = useState<boolean>(true);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null); // null = pending
  const [backendError, setBackendError] = useState<string | null>(null);

  const [bodypartFilter, setBodypartFilter] = useState<string>('all');
  const [modalityFilter, setModalityFilter] = useState<string>('all');
  const [taskFilter, setTaskFilter] = useState<string>('all');
  const [validationFilter, setValidationFilter] = useState<string>('all');
  const [reloadToken, setReloadToken] = useState<number>(0);

  const requestIdRef = useRef<number>(0);

  const hasActiveFilters = useMemo(
    () =>
      isActiveFilter(bodypartFilter) ||
      isActiveFilter(modalityFilter) ||
      isActiveFilter(taskFilter) ||
      isActiveFilter(validationFilter),
    [bodypartFilter, modalityFilter, taskFilter, validationFilter]
  );

  const retryLoad = useCallback(() => {
    setReloadToken((v) => v + 1);
  }, []);

  // ── Load all models from /api/models (static + Supabase merged by server) ──
  useEffect(() => {
    let active = true;
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;

    async function runLoad(): Promise<void> {
      setStaticLoading(true);
      setBackendLoading(true);
      setBackendError(null);
      setBackendOnline(null);

      // Step 1: Fetch without filters to get ALL available models (static always included)
      try {
        const allModels = await withTimeout(
          fetchModels(),
          12_000,
          'Models request timed out'
        );

        if (!active || requestId !== requestIdRef.current) return;

        // Split into static (bundled) and backend-only (remote from Supabase/FastAPI)
        const statics = allModels.models.filter((m) => STATIC_SLUGS.has(m.slug));
        const remote = allModels.models.filter((m) => !STATIC_SLUGS.has(m.slug));

        setStaticModels(statics);
        setBackendModels(remote);
        setBackendOnline(true);
        setBackendError(null);
      } catch (err: unknown) {
        if (!active || requestId !== requestIdRef.current) return;

        // On any error, we still try to load just the static models via the same endpoint
        // (which always serves them from disk, even when backend is down)
        try {
          const fallback = await fetchModels();
          if (active && requestId === requestIdRef.current) {
            setStaticModels(fallback.models.filter((m) => STATIC_SLUGS.has(m.slug)));
          }
        } catch {
          // Nothing — the /api/models Next.js route always returns something
        }

        if (active && requestId === requestIdRef.current) {
          setBackendModels([]);
          setBackendOnline(false);
          setBackendError(normalizeError(err));
        }
      } finally {
        if (active) {
          setStaticLoading(false);
          setBackendLoading(false);
        }
      }
    }

    void runLoad();

    return () => {
      active = false;
      setStaticLoading(false);
      setBackendLoading(false);
    };
  }, [reloadToken]);

  // ── Apply filters locally — no re-fetch needed ───────────────────────────────
  const filteredStatic = useMemo(
    () =>
      staticModels.filter((m) =>
        matchesFilters(m, bodypartFilter, modalityFilter, taskFilter, validationFilter)
      ),
    [staticModels, bodypartFilter, modalityFilter, taskFilter, validationFilter]
  );

  const filteredBackend = useMemo(
    () =>
      backendModels.filter((m) =>
        matchesFilters(m, bodypartFilter, modalityFilter, taskFilter, validationFilter)
      ),
    [backendModels, bodypartFilter, modalityFilter, taskFilter, validationFilter]
  );

  const noResults =
    !staticLoading &&
    !backendLoading &&
    filteredStatic.length === 0 &&
    filteredBackend.length === 0;

  return (
    <>
      {/* ── Backend status banner ───────────────────────────────────────────── */}
      {backendOnline === false && (
        <div className="backend-offline-banner" role="status" aria-live="polite">
          <p className="backend-offline-banner__title">
            ⚠ Backend API offline — showing bundled models only
          </p>
          <p className="backend-offline-banner__hint mono">
            Start the API:{' '}
            <code>cd api &amp;&amp; uvicorn main:app --reload</code>
            {backendError ? ` — ${backendError}` : ''}
          </p>
        </div>
      )}

      {backendOnline === true && backendModels.length > 0 && (
        <div className="backend-online-banner" role="status">
          <span className="dot-green" aria-hidden="true" />
          <span className="backend-online-banner__text mono">
            Backend connected — {backendModels.length} remote model{backendModels.length !== 1 ? 's' : ''} loaded
          </span>
        </div>
      )}

      <main className="models-page">
        <section className="models-shell">
          {/* ── Header ───────────────────────────────────────────────────────── */}
          <header className="models-header">
            <div>
              <p className="mono label">MODEL LIBRARY</p>
              <h1 className="models-title">Published models</h1>
            </div>
          </header>

          {/* ── Filters ──────────────────────────────────────────────────────── */}
          <div className="filter-row" role="search" aria-label="Filter models">
            <select
              value={bodypartFilter}
              onChange={(e) => setBodypartFilter(e.target.value)}
              className="select"
              aria-label="Filter by bodypart"
            >
              {BODYPART_OPTIONS.map((o) => (
                <option key={o} value={o}>{o === 'all' ? 'All bodyparts' : o}</option>
              ))}
            </select>

            <select
              value={modalityFilter}
              onChange={(e) => setModalityFilter(e.target.value)}
              className="select"
              aria-label="Filter by modality"
            >
              {MODALITY_OPTIONS.map((o) => (
                <option key={o} value={o}>{o === 'all' ? 'All modalities' : o}</option>
              ))}
            </select>

            <select
              value={taskFilter}
              onChange={(e) => setTaskFilter(e.target.value)}
              className="select"
              aria-label="Filter by task"
            >
              {TASK_OPTIONS.map((o) => (
                <option key={o} value={o}>{o === 'all' ? 'All tasks' : o}</option>
              ))}
            </select>

            <select
              value={validationFilter}
              onChange={(e) => setValidationFilter(e.target.value)}
              className="select"
              aria-label="Filter by validation status"
            >
              {VALIDATION_OPTIONS.map((o) => (
                <option key={o} value={o}>{o === 'all' ? 'All validation' : o}</option>
              ))}
            </select>

            {hasActiveFilters && (
              <button
                type="button"
                className="clear-filters-link"
                onClick={() => {
                  setBodypartFilter('all');
                  setModalityFilter('all');
                  setTaskFilter('all');
                  setValidationFilter('all');
                }}
              >
                Clear filters
              </button>
            )}
          </div>

          {/* ── No results ───────────────────────────────────────────────────── */}
          {noResults && (
            <div className="empty-panel panel">
              <div className="empty-icon" aria-hidden="true">🗃️</div>
              <h2 className="empty-title">No models match your filters</h2>
              <p className="empty-subtitle">
                {hasActiveFilters
                  ? 'Try removing some filters to see available models.'
                  : 'No models are available right now.'}
              </p>
              {hasActiveFilters && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setBodypartFilter('all');
                    setModalityFilter('all');
                    setTaskFilter('all');
                    setValidationFilter('all');
                  }}
                >
                  Clear all filters
                </button>
              )}
            </div>
          )}

          {/* ── Bundled / Static Models ───────────────────────────────────────── */}
          {(staticLoading || filteredStatic.length > 0) && (
            <section>
              <SectionLabel
                label="BUNDLED MODELS — available offline, no backend required"
                count={staticLoading ? 3 : filteredStatic.length}
              />

              {staticLoading ? (
                <SkeletonGrid />
              ) : (
                <div className="models-grid" aria-label="Bundled models">
                  {filteredStatic.map((model) => (
                    <ModelCard
                      key={model.slug}
                      model={model}
                      source="bundled"
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* ── Remote / Backend Models ───────────────────────────────────────── */}
          {backendOnline !== false && (
            <section>
              <SectionLabel
                label="REMOTE MODELS — fetched from platform registry"
                count={backendLoading ? 0 : filteredBackend.length}
              />

              {backendLoading ? (
                <SkeletonGrid />
              ) : filteredBackend.length === 0 && !backendLoading ? (
                <div className="remote-empty panel">
                  <p className="mono" style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                    {backendOnline === true
                      ? 'No additional remote models published yet. Use the clarity CLI to publish a model.'
                      : 'Connecting to backend...'}
                  </p>
                  <div
                    style={{
                      marginTop: 'var(--space-3)',
                      padding: 'var(--space-3)',
                      background: 'rgba(34,197,94,0.05)',
                      border: '1px solid var(--border-accent)',
                      borderRadius: 'var(--radius-md)',
                    }}
                  >
                    <p className="label" style={{ marginBottom: 'var(--space-2)' }}>HOW TO PUBLISH A MODEL</p>
                    <p className="mono" style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      1. Train a model and export to ONNX<br />
                      2. <code style={{ color: 'var(--accent-primary)' }}>pip install -e converter/[pytorch]</code><br />
                      3. <code style={{ color: 'var(--accent-primary)' }}>clarityray upload ./model.onnx --classes &quot;Normal,Finding&quot;</code><br />
                      4. Set status to <code style={{ color: 'var(--accent-primary)' }}>published</code> in Supabase
                    </p>
                  </div>
                </div>
              ) : (
                <div className="models-grid" aria-label="Remote models from backend">
                  {filteredBackend.map((model) => (
                    <ModelCard
                      key={model.id || model.slug}
                      model={model}
                      source="remote"
                    />
                  ))}
                </div>
              )}

              {backendOnline === true && (
                <button
                  type="button"
                  className="refresh-btn mono"
                  onClick={retryLoad}
                  title="Refresh model list from backend"
                >
                  ↻ Refresh
                </button>
              )}
            </section>
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
          gap: var(--space-6);
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

        /* ── Banners ── */
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

        .backend-online-banner {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: var(--sp-2, var(--space-2)) var(--sp-6, var(--space-6));
          background: rgba(34,197,94,0.04);
          border-bottom: 1px solid rgba(34,197,94,0.1);
          margin-top: calc(var(--space-16) + var(--space-2));
        }

        .backend-online-banner__text {
          font-size: 12px;
          color: var(--text-secondary);
        }

        /* ── Filters ── */
        .filter-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--space-2);
        }

        .select {
          min-width: 160px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-elevated);
          color: var(--text-primary);
          border-radius: var(--radius-md);
          padding: var(--space-2) var(--space-3);
          font-family: var(--font-ui);
          font-size: 0.875rem;
        }

        .select:focus {
          outline: 1px solid var(--accent-primary);
          outline-offset: 2px;
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
          padding: 0;
        }

        /* ── Grid ── */
        .models-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: var(--space-4);
        }

        /* ── Skeleton ── */
        .skeleton {
          position: relative;
          overflow: hidden;
          opacity: 0.6;
        }

        .skeleton::after {
          content: '';
          position: absolute;
          inset: 0;
          transform: translateX(-100%);
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 255, 255, 0.07),
            transparent
          );
          animation: model-skeleton-shimmer 1.4s infinite;
        }

        @keyframes model-skeleton-shimmer {
          100% { transform: translateX(100%); }
        }

        /* ── Empty / Remote empty ── */
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

        .remote-empty {
          border-left: 3px solid var(--border-subtle);
        }

        /* ── Refresh button ── */
        .refresh-btn {
          margin-top: var(--space-2);
          background: transparent;
          border: 1px solid var(--border-subtle);
          color: var(--text-secondary);
          border-radius: var(--radius-sm);
          padding: 4px 12px;
          font-size: 12px;
          cursor: pointer;
          transition: border-color 0.15s, color 0.15s;
        }

        .refresh-btn:hover {
          border-color: var(--accent-primary);
          color: var(--accent-primary);
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
