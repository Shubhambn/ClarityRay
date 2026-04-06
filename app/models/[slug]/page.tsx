'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

import TopBar from '@/components/nav/TopBar';
import {
  BackendError,
  fetchModelBySlug,
  type ModelDetail,
} from '@/lib/api/client';

function normalizeSlug(value: string | string[] | undefined): string {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value[0]?.trim() ?? '';
  }

  return '';
}

function formatDate(value: string | null): string {
  if (!value) {
    return '—';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(date);
}

function statusBadge(status: string): {
  text: string;
  className: string;
} {
  const normalized = status.trim().toLowerCase();

  if (normalized === 'published') {
    return { text: 'PUBLISHED', className: 'badge badge-green' };
  }

  if (normalized === 'validated') {
    return { text: 'VALIDATED', className: 'badge badge-blue' };
  }

  if (normalized === 'pending') {
    return { text: 'PENDING', className: 'badge badge-amber' };
  }

  return {
    text: normalized ? normalized.toUpperCase() : 'UNKNOWN',
    className: 'badge badge-muted',
  };
}

function deriveSafetyTier(model: ModelDetail): string {
  const normalized = model.status.trim().toLowerCase();

  if (normalized === 'validated') {
    return 'validated';
  }

  if (normalized === 'published') {
    return 'screening';
  }

  if (normalized === 'pending') {
    return 'experimental';
  }

  return normalized || 'unclassified';
}

function SkeletonLayout() {
  return (
    <div className="model-detail-grid">
      <section className="model-detail-left">
        <div className="panel skeleton-block skeleton-title" />
        <div className="panel skeleton-block skeleton-badges" />
        <div className="panel skeleton-block skeleton-content" />
      </section>

      <aside className="model-detail-right">
        <div className="panel panel-accent skeleton-block skeleton-action" />
      </aside>
    </div>
  );
}

export default function ModelDetailPage() {
  const params = useParams<{ slug?: string | string[] }>();
  const router = useRouter();
  const slug = normalizeSlug(params?.slug);

  const [model, setModel] = useState<ModelDetail | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [errorStatusCode, setErrorStatusCode] = useState<number | null>(null);
  const [copiedField, setCopiedField] = useState<'model' | 'clarity' | null>(null);

  const loadModel = useCallback(async () => {
    if (!slug) {
      setModel(null);
      setError('Model slug is required');
      setErrorStatusCode(400);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    setErrorStatusCode(null);

    try {
      const detail = await fetchModelBySlug(slug);
      setModel(detail);
    } catch (err: unknown) {
      setModel(null);

      if (err instanceof BackendError) {
        setError(err.message);
        setErrorStatusCode(err.statusCode);
      } else if (err instanceof Error) {
        setError(err.message);
        setErrorStatusCode(null);
      } else {
        setError('Failed to load model');
        setErrorStatusCode(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void loadModel();
  }, [loadModel]);

  const badge = useMemo(() => {
    if (!model) {
      return { text: 'UNKNOWN', className: 'badge badge-muted' };
    }

    return statusBadge(model.status);
  }, [model]);

  const safetyTier = useMemo(() => {
    if (!model) {
      return 'unclassified';
    }

    return deriveSafetyTier(model);
  }, [model]);

  const version = model?.current_version?.version ?? '—';

  const handleSelectModel = (): void => {
    if (!model) {
      return;
    }

    localStorage.setItem('clarityray_selected_model', model.slug);
    localStorage.setItem('clarityray_model_name', model.name);
    if (model.current_version) {
      localStorage.setItem('clarityray_model_version', model.current_version.version);
    }

    router.push('/analysis');
  };

  const handleCopy = async (value: string, field: 'model' | 'clarity'): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField((current) => (current === field ? null : current)), 1200);
    } catch {
      setCopiedField(null);
    }
  };

  return (
    <>
      <TopBar />

      <main className="model-detail-page">
        <div className="model-detail-container">
          {isLoading ? (
            <SkeletonLayout />
          ) : error || !model ? (
            errorStatusCode === 404 ? (
              <section className="panel panel-accent model-detail-error">
                <h1 style={{ fontSize: '24px', marginBottom: 'var(--sp-2, var(--space-2))' }}>
                  Model not found
                </h1>
                <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--sp-4, var(--space-4))' }}>
                  No model with slug "{slug}" exists in the platform.
                </p>
                <Link href="/models" className="btn">
                  ← Back to models
                </Link>
              </section>
            ) : (
              <section className="panel panel-accent model-detail-error">
                <h1 style={{ fontSize: '24px', marginBottom: 'var(--sp-2, var(--space-2))' }}>
                  Failed to load model
                </h1>
                <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--sp-4, var(--space-4))' }}>
                  {error ?? 'Unknown error'}
                </p>
                <button type="button" className="btn btn-primary" onClick={() => void loadModel()}>
                  Retry
                </button>
              </section>
            )
          ) : (
            <div className="model-detail-grid">
              <section className="model-detail-left">
                <Link
                  href="/models"
                  style={{
                    color: 'var(--text-green, var(--text-accent))',
                    marginBottom: 'var(--sp-4, var(--space-4))',
                    display: 'inline-block',
                  }}
                >
                  ← Back to models
                </Link>

                <h1 style={{ fontSize: '24px', marginBottom: 'var(--sp-3, var(--space-3))' }}>
                  {model.name}
                </h1>

                <div
                  style={{
                    display: 'flex',
                    gap: 'var(--sp-2, var(--space-2))',
                    flexWrap: 'wrap',
                    marginBottom: 'var(--sp-4, var(--space-4))',
                  }}
                >
                  <span className={badge.className}>{badge.text}</span>
                  <span className="badge badge-muted">v{version}</span>
                </div>

                <section
                  style={{
                    background: 'rgba(245,158,11,0.06)',
                    border: '1px solid rgba(245,158,11,0.2)',
                    borderLeft: '3px solid var(--status-warn, var(--status-warning))',
                    borderRadius: 'var(--r-lg, var(--radius-lg))',
                    padding: 'var(--sp-4, var(--space-4))',
                    marginBottom: 'var(--sp-4, var(--space-4))',
                  }}
                >
                  <p className="label" style={{ marginBottom: 'var(--sp-2, var(--space-2))' }}>
                    SAFETY DISCLAIMER
                  </p>
                  <p style={{ color: 'var(--text-secondary)' }}>
                    This model is classified as a {safetyTier} tool. Always consult a qualified physician
                    before making medical decisions.
                  </p>
                </section>

                <section className="panel" style={{ marginBottom: 'var(--sp-4, var(--space-4))' }}>
                  <p className="label" style={{ marginBottom: 'var(--sp-3, var(--space-3))' }}>
                    TECHNICAL SPECIFICATIONS
                  </p>

                  <div className="mono model-detail-kv-grid">
                    <span style={{ color: 'var(--text-secondary)' }}>Body Part</span>
                    <span>{model.bodypart || '—'}</span>

                    <span style={{ color: 'var(--text-secondary)' }}>Modality</span>
                    <span>{model.modality || '—'}</span>

                    <span style={{ color: 'var(--text-secondary)' }}>Model Version</span>
                    <span>{model.current_version?.version ?? '—'}</span>

                    <span style={{ color: 'var(--text-secondary)' }}>Published</span>
                    <span>{formatDate(model.published_at)}</span>
                  </div>
                </section>

                {model.validation ? (
                  <section className="panel" style={{ marginBottom: 'var(--sp-4, var(--space-4))' }}>
                    <p className="label" style={{ marginBottom: 'var(--sp-3, var(--space-3))' }}>
                      VALIDATION
                    </p>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--sp-2, var(--space-2))',
                        marginBottom: 'var(--sp-2, var(--space-2))',
                      }}
                    >
                      <span className={model.validation.passed ? 'badge badge-green' : 'badge badge-red'}>
                        {model.validation.passed ? 'PASSED' : 'FAILED'}
                      </span>
                      <span className="mono" style={{ color: 'var(--text-secondary)' }}>
                        Ran at: {formatDate(model.validation.ran_at)}
                      </span>
                    </div>

                    <div className="model-detail-checks-table">
                      {model.validation.checks.map((check) => (
                        <div key={check.name} className="model-detail-check-row mono">
                          <span>{check.name}</span>
                          <span className={check.passed ? 'badge badge-green' : 'badge badge-red'}>
                            {check.passed ? 'PASS' : 'FAIL'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}
              </section>

              <aside className="model-detail-right">
                <section className="panel panel-accent" style={{ marginBottom: 'var(--sp-4, var(--space-4))' }}>
                  <p className="label" style={{ marginBottom: 'var(--sp-2, var(--space-2))' }}>
                    USE THIS MODEL
                  </p>
                  <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--sp-4, var(--space-4))' }}>
                    Select for local analysis on this device
                  </p>

                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ width: '100%' }}
                    onClick={handleSelectModel}
                  >
                    Use for Analysis
                  </button>

                  <div className="panel panel-sm" style={{ marginTop: 'var(--sp-4, var(--space-4))' }}>
                    <p style={{ color: 'var(--text-secondary)' }}>
                      Model runs locally after first download. No patient data is ever transmitted to a
                      server.
                    </p>
                  </div>
                </section>

                {model.current_version ? (
                  <section className="panel">
                    <p className="label" style={{ marginBottom: 'var(--sp-3, var(--space-3))' }}>
                      MODEL URLS
                    </p>

                    <div style={{ display: 'grid', gap: 'var(--sp-3, var(--space-3))' }}>
                      <div className="model-detail-url-row">
                        <div>
                          <p className="label" style={{ marginBottom: 'var(--sp-1, var(--space-1))' }}>
                            model_url
                          </p>
                          <p className="mono model-detail-url-text">{model.current_version.onnx_url}</p>
                        </div>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => void handleCopy(model.current_version?.onnx_url ?? '', 'model')}
                        >
                          {copiedField === 'model' ? 'Copied' : 'Copy'}
                        </button>
                      </div>

                      <div className="model-detail-url-row">
                        <div>
                          <p className="label" style={{ marginBottom: 'var(--sp-1, var(--space-1))' }}>
                            clarity_url
                          </p>
                          <p className="mono model-detail-url-text">{model.current_version.clarity_url}</p>
                        </div>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => void handleCopy(model.current_version?.clarity_url ?? '', 'clarity')}
                        >
                          {copiedField === 'clarity' ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    </div>
                  </section>
                ) : null}
              </aside>
            </div>
          )}
        </div>
      </main>

      <style jsx>{`
        .model-detail-page {
          min-height: 100vh;
          padding-top: var(--topbar-h, 80px);
          padding-bottom: var(--sp-8, var(--space-8));
        }

        .model-detail-container {
          width: min(1160px, calc(100% - 2rem));
          margin: 0 auto;
        }

        .model-detail-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 360px;
          gap: var(--sp-8, var(--space-8));
          align-items: start;
        }

        .model-detail-left,
        .model-detail-right {
          display: grid;
          gap: var(--sp-4, var(--space-4));
        }

        .model-detail-kv-grid {
          display: grid;
          grid-template-columns: minmax(120px, 160px) minmax(0, 1fr);
          row-gap: var(--sp-2, var(--space-2));
          column-gap: var(--sp-3, var(--space-3));
        }

        .model-detail-checks-table {
          border-top: 1px solid var(--border-subtle);
          margin-top: var(--sp-3, var(--space-3));
        }

        .model-detail-check-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--sp-3, var(--space-3));
          padding: var(--sp-2, var(--space-2)) 0;
          border-bottom: 1px solid var(--border-subtle);
        }

        .model-detail-url-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: end;
          gap: var(--sp-3, var(--space-3));
        }

        .model-detail-url-text {
          font-size: 11px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .model-detail-error {
          max-width: 720px;
        }

        .skeleton-block {
          position: relative;
          overflow: hidden;
          background: color-mix(in srgb, var(--bg-panel) 85%, var(--accent-primary) 15%);
          border-color: var(--border-subtle);
        }

        .skeleton-block::after {
          content: '';
          position: absolute;
          top: 0;
          left: -150%;
          width: 120%;
          height: 100%;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 255, 255, 0.08),
            transparent
          );
          animation: model-skeleton 1.2s ease-in-out infinite;
        }

        .skeleton-title {
          height: 68px;
        }

        .skeleton-badges {
          height: 60px;
        }

        .skeleton-content {
          height: 300px;
        }

        .skeleton-action {
          height: 220px;
        }

        @keyframes model-skeleton {
          100% {
            left: 140%;
          }
        }

        @media (max-width: 900px) {
          .model-detail-grid {
            grid-template-columns: minmax(0, 1fr);
          }
        }
      `}</style>
    </>
  );
}
