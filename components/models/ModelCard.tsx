'use client';

import Link from 'next/link';
import { type ModelSummary } from '@/lib/api/client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ModelCardProps {
  model: ModelSummary;
  /** 'bundled' = served from public/models disk, always available offline.
   *  'remote'  = fetched from backend/Supabase, requires API connectivity.
   *  undefined = source unknown (legacy callers). */
  source?: 'bundled' | 'remote';
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ModelCard({ model, source }: ModelCardProps) {
  const version = model.current_version?.version ?? null;
  const bodypart = model.bodypart.toUpperCase();
  const modality = model.modality.toUpperCase();
  const task = (model.task || 'binary').toUpperCase();
  const safetyTier = (model.safety_tier || 'screening').toUpperCase();
  const isValidated = model.validation_status === 'validated';
  const fileSizeMb = model.current_version?.file_size_mb ?? null;

  return (
    <>
      <Link
        href={`/models/${model.slug}`}
        prefetch={false}
        className="model-card-link"
        aria-label={`View details for ${model.name}`}
      >
        <article className={`panel model-card${source === 'bundled' ? ' model-card--bundled' : ''}`}>
          {/* ── Source tag (top-right corner) ── */}
          {source && (
            <div className="model-card__source-tag">
              {source === 'bundled' ? (
                <span className="source-tag source-tag--bundled" title="Available offline — no backend required">
                  📦 BUNDLED
                </span>
              ) : (
                <span className="source-tag source-tag--remote" title="Fetched from backend registry">
                  ☁ REMOTE
                </span>
              )}
            </div>
          )}

          {/* ── Name + version ── */}
          <div className="model-card__top">
            <h3 className="model-card__name">{model.name}</h3>
            {version ? (
              <span className="badge badge-muted">v{version}</span>
            ) : (
              <span className="badge badge-amber">No version</span>
            )}
          </div>

          {/* ── Metadata badges ── */}
          <div className="model-card__meta">
            <span className="badge badge-blue">{bodypart}</span>
            <span className="badge badge-muted">{modality}</span>
            <span className="badge badge-muted">{task}</span>
          </div>

          {/* ── Validation + safety ── */}
          <div className="model-card__status">
            {isValidated ? (
              <span className="badge badge-green">VALIDATED</span>
            ) : (
              <span className="badge badge-red model-card__unvalidated">⚠ UNVALIDATED</span>
            )}
            <span className="badge badge-muted">{safetyTier}</span>
            <span className="badge badge-muted">NOT DIAGNOSTIC</span>
          </div>

          {/* ── Size + CTA ── */}
          <div className="model-card__bottom">
            {typeof fileSizeMb === 'number' ? (
              <span className="mono model-card__filesize">{`${fileSizeMb.toFixed(1)} MB`}</span>
            ) : source === 'bundled' ? (
              <span className="mono model-card__filesize" style={{ color: 'var(--accent-primary)' }}>
                Cached locally
              </span>
            ) : (
              <span />
            )}
            <span className="model-card__cta">View details →</span>
          </div>
        </article>
      </Link>

      <style>{`
        .model-card-link {
          display: block;
          text-decoration: none;
        }

        .model-card {
          position: relative;
          cursor: pointer;
          transition: border-color var(--transition-base, 0.15s ease);
          display: flex;
          flex-direction: column;
          gap: var(--space-3);
          min-height: 180px;
        }

        .model-card:hover,
        .model-card:focus-visible {
          border-color: var(--border-green, var(--border-accent));
          outline: none;
        }

        .model-card--bundled {
          border-left: 2px solid rgba(34,197,94,0.35);
        }

        /* ── Source tag ── */
        .model-card__source-tag {
          position: absolute;
          top: 0;
          right: 0;
          padding: 0;
        }

        .source-tag {
          display: inline-block;
          padding: 2px 8px;
          font-family: var(--font-mono);
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.04em;
          border-radius: 0 var(--radius-md) 0 var(--radius-sm);
        }

        .source-tag--bundled {
          background: rgba(34,197,94,0.12);
          color: var(--accent-primary);
          border: 1px solid rgba(34,197,94,0.2);
          border-top: none;
          border-right: none;
        }

        .source-tag--remote {
          background: rgba(99,102,241,0.12);
          color: #818cf8;
          border: 1px solid rgba(99,102,241,0.2);
          border-top: none;
          border-right: none;
        }

        /* ── Card sections ── */
        .model-card__top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: var(--space-2);
          padding-right: 80px; /* space for source-tag */
        }

        .model-card__name {
          font-size: 15px;
          font-weight: 600;
          line-height: 1.3;
          color: var(--text-primary);
        }

        .model-card__meta {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          flex-wrap: wrap;
        }

        .model-card__status {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          flex-wrap: wrap;
        }

        .model-card__bottom {
          margin-top: auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-2);
        }

        .model-card__filesize {
          min-height: 1em;
          color: var(--text-secondary);
          font-size: 0.75rem;
        }

        .model-card__cta {
          color: var(--text-green, var(--accent-primary));
          font-size: 0.8rem;
          font-weight: 500;
        }

        .model-card__unvalidated {
          font-weight: 700;
          letter-spacing: 0.02em;
        }
      `}</style>
    </>
  );
}
