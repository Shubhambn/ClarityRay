'use client';

import Link from 'next/link';
import { type ModelSummary } from '@/lib/api/client';

/* ── Types ── */
interface ModelCardProps {
  model: ModelSummary;
}

function inferSafetyTier(clarityUrl?: string): string {
  if (!clarityUrl) {
    return 'SCREENING';
  }

  const normalized = clarityUrl.toLowerCase();
  if (normalized.includes('research')) {
    return 'RESEARCH';
  }

  if (normalized.includes('diagnostic')) {
    return 'DIAGNOSTIC';
  }

  if (normalized.includes('screening')) {
    return 'SCREENING';
  }

  return 'SCREENING';
}

export default function ModelCard({ model }: ModelCardProps) {
  const version = model.current_version ? model.current_version.version : null;
  const bodypart = model.bodypart.toUpperCase();
  const modality = model.modality.toUpperCase();
  const safetyTier = inferSafetyTier(model.current_version?.clarity_url);
  const fileSizeMb = model.current_version ? model.current_version.file_size_mb : null;

  return (
    <>
      <Link
        href={`/models/${model.slug}`}
        prefetch={false}
        className="model-card-link"
        aria-label={`View details for ${model.name}`}
      >
        <article className="panel model-card">
          <div className="model-card__top">
            <h3 className="model-card__name">{model.name}</h3>
            {version ? (
              <span className="badge badge-muted">v{version}</span>
            ) : (
              <span className="badge badge-amber">No version uploaded</span>
            )}
          </div>

          <div className="model-card__meta">
            <span className="badge badge-blue">{bodypart}</span>
            <span className="badge badge-muted">{modality}</span>
          </div>

          <div className="model-card__status">
            <span className="badge badge-green">{safetyTier}</span>
          </div>

          <div className="model-card__bottom">
            {typeof fileSizeMb === 'number' ? (
              <span className="mono model-card__filesize">{`${fileSizeMb.toFixed(1)} MB`}</span>
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
        }

        .model-card {
          cursor: pointer;
          transition: border-color var(--transition-base);
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

        .model-card__top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: var(--space-2);
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
      `}</style>
    </>
  );
}
