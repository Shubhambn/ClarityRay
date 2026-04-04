'use client';

import Link from 'next/link';

/* ── Types ── */
export interface ModelCardData {
  slug: string;
  name: string;
  bodypart: string;
  modality: string;
  version?: string;
  fileSizeMb?: number;
  outputClasses?: string[];
  safetyTier?: string;
  certified?: boolean;
}

interface ModelCardProps {
  model: ModelCardData;
}

function ShieldIcon() {
  return (
    <svg
      width="11"
      height="12"
      viewBox="0 0 11 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M5.5 1L1 2.8v3.2C1 8.28 3.02 10.55 5.5 11 7.98 10.55 10 8.28 10 6V2.8L5.5 1z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M3.5 6l1.5 1.5 2.5-2.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M2 6h8M7 3l3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function safetyTierColor(tier: string): string {
  const t = tier.toLowerCase();
  if (t === 'screening') return 'var(--accent-primary)';
  if (t === 'research')  return 'var(--status-info)';
  return 'var(--status-warning)';
}

export default function ModelCard({ model }: ModelCardProps) {
  const {
    slug,
    name,
    bodypart,
    modality,
    version,
    fileSizeMb,
    outputClasses,
    safetyTier = 'screening',
    certified = false,
  } = model;

  const tierLabel = safetyTier.toUpperCase();
  const tierColor = safetyTierColor(safetyTier);
  const classesLabel = outputClasses && outputClasses.length > 0
    ? outputClasses.join(' · ')
    : null;

  return (
    <>
      <article className="model-card panel" aria-label={`Model: ${name}`}>
        {/* TOP ROW — Name + Version badge */}
        <div className="model-card__top">
          <span className="model-card__name">{name}</span>
          {version && (
            <span className="model-card__version mono">v{version}</span>
          )}
        </div>

        {/* METADATA ROW — Body part + Modality pills */}
        <div className="model-card__meta">
          <span className="model-card__pill mono">{bodypart.toUpperCase()}</span>
          <span className="model-card__pill mono">{modality.toUpperCase()}</span>
        </div>

        {/* MIDDLE — Output classes + Safety tier */}
        <div className="model-card__middle">
          {classesLabel && (
            <p className="model-card__classes">{classesLabel}</p>
          )}
          <span
            className="model-card__tier mono"
            style={{ '--tier-color': tierColor } as React.CSSProperties}
          >
            {tierLabel}
          </span>
        </div>

        {/* BOTTOM ROW — File size + Select link + Certified */}
        <div className="model-card__bottom">
          <div className="model-card__bottom-left">
            {fileSizeMb !== undefined && (
              <span className="model-card__size mono">
                {fileSizeMb.toFixed(0)} MB
              </span>
            )}
            {certified ? (
              <span className="model-card__certified model-card__certified--yes">
                <ShieldIcon /> Certified
              </span>
            ) : (
              <span className="model-card__certified model-card__certified--no">
                Community
              </span>
            )}
          </div>

          <Link href={`/models/${slug}`} className="model-card__select">
            Select Model <ArrowIcon />
          </Link>
        </div>
      </article>

      <style>{`
        .model-card {
          display: flex;
          flex-direction: column;
          gap: 12px;
          transition: border-color var(--transition-base);
          height: 100%;
        }
        .model-card:hover {
          border-color: var(--border-accent);
        }

        /* Top row */
        .model-card__top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 8px;
        }
        .model-card__name {
          font-family: var(--font-ui);
          font-size: 0.9375rem;
          font-weight: 600;
          color: var(--text-primary);
          line-height: 1.35;
          flex: 1;
        }
        .model-card__version {
          flex-shrink: 0;
          background: var(--accent-primary-dim);
          border: 1px solid var(--accent-primary-border);
          border-radius: var(--radius-sm);
          padding: 1px 6px;
          font-size: 0.6875rem;
          color: var(--accent-primary);
          white-space: nowrap;
          align-self: flex-start;
          margin-top: 1px;
        }

        /* Metadata row */
        .model-card__meta {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .model-card__pill {
          display: inline-block;
          padding: 2px 7px;
          border-radius: 4px;
          font-size: 10px;
          letter-spacing: 0.06em;
          color: var(--text-secondary);
          border: 1px solid var(--border-subtle);
          background: rgba(255,255,255,0.03);
        }

        /* Middle */
        .model-card__middle {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          flex: 1;
        }
        .model-card__classes {
          font-family: var(--font-ui);
          font-size: 0.75rem;
          color: var(--text-secondary);
          flex: 1;
        }
        .model-card__tier {
          font-size: 10px;
          letter-spacing: 0.08em;
          color: var(--tier-color, var(--accent-primary));
          border: 1px solid var(--tier-color, var(--accent-primary-border));
          padding: 2px 7px;
          border-radius: var(--radius-sm);
          background: transparent;
          flex-shrink: 0;
        }

        /* Bottom row */
        .model-card__bottom {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-top: auto;
          padding-top: 4px;
          border-top: 1px solid var(--border-subtle);
        }
        .model-card__bottom-left {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .model-card__size {
          font-size: 11px;
          color: var(--text-tertiary);
        }
        .model-card__certified {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.04em;
        }
        .model-card__certified--yes {
          color: var(--accent-primary);
        }
        .model-card__certified--no {
          color: var(--text-tertiary);
        }

        /* Select link */
        .model-card__select {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-family: var(--font-mono);
          font-size: 11px;
          font-weight: 500;
          color: var(--accent-primary);
          text-decoration: none;
          white-space: nowrap;
          transition: opacity var(--transition-fast);
        }
        .model-card__select:hover {
          opacity: 0.75;
        }
      `}</style>
    </>
  );
}
