'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import TopBar from '@/components/nav/TopBar';

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface ModelRecord {
  slug: string;
  name: string;
  bodypart: string;
  modality: string;
  status: string;
}

interface ModelVersion {
  version: string;
  clarity_url: string;
  file_size_mb?: number;
  validation_status?: string;
  last_validated?: string;
}

interface ModelDetail {
  model: ModelRecord;
  current_version: ModelVersion;
}

/* Subset of clarity.json we care about */
interface ClarityMeta {
  output?: { classes?: string[]; activation?: string; shape?: number[] };
  input?: {
    shape?: number[];
    normalize?: { mean?: number[]; std?: number[] };
  };
  safety?: { tier?: string; disclaimer?: string };
  thresholds?: {
    possible_finding?: number;
    low_confidence?: number;
    validation_status?: string;
  };
  certified?: boolean;
}

/* ─── Guards ────────────────────────────────────────────────────────────── */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseDetail(payload: unknown): ModelDetail {
  if (!isRecord(payload) || !isRecord(payload['model']) || !isRecord(payload['current_version'])) {
    throw new Error('Invalid model detail payload.');
  }
  const m   = payload['model'];
  const cv  = payload['current_version'];

  if (
    typeof m['slug']    !== 'string' ||
    typeof m['name']    !== 'string' ||
    typeof m['bodypart']!== 'string' ||
    typeof m['modality']!== 'string' ||
    typeof m['status']  !== 'string'
  ) throw new Error('Model metadata is incomplete.');

  if (typeof cv['version'] !== 'string' || typeof cv['clarity_url'] !== 'string') {
    throw new Error('Version metadata is incomplete.');
  }

  return {
    model: {
      slug:     m['slug'],
      name:     m['name'],
      bodypart: m['bodypart'],
      modality: m['modality'],
      status:   m['status'],
    },
    current_version: {
      version:           cv['version'],
      clarity_url:       cv['clarity_url'],
      file_size_mb:      typeof cv['file_size_mb']     === 'number' ? cv['file_size_mb']     : undefined,
      validation_status: typeof cv['validation_status']=== 'string' ? cv['validation_status']: undefined,
      last_validated:    typeof cv['last_validated']   === 'string' ? cv['last_validated']   : undefined,
    },
  };
}

function parseMeta(raw: unknown): ClarityMeta {
  if (!isRecord(raw)) return {};
  const output    = isRecord(raw['output'])     ? raw['output']     : undefined;
  const input     = isRecord(raw['input'])      ? raw['input']      : undefined;
  const safety    = isRecord(raw['safety'])     ? raw['safety']     : undefined;
  const thresholds= isRecord(raw['thresholds']) ? raw['thresholds'] : undefined;

  return {
    output: output ? {
      classes:    Array.isArray(output['classes'])
                    ? (output['classes'] as unknown[]).filter((c): c is string => typeof c === 'string')
                    : undefined,
      activation: typeof output['activation'] === 'string' ? output['activation'] : undefined,
      shape:      Array.isArray(output['shape'])
                    ? (output['shape'] as unknown[]).filter((n): n is number => typeof n === 'number')
                    : undefined,
    } : undefined,
    input: input ? {
      shape: Array.isArray(input['shape'])
               ? (input['shape'] as unknown[]).filter((n): n is number => typeof n === 'number')
               : undefined,
      normalize: isRecord(input['normalize']) ? {
        mean: Array.isArray(input['normalize']['mean'])
                ? (input['normalize']['mean'] as unknown[]).filter((n): n is number => typeof n === 'number')
                : undefined,
        std:  Array.isArray(input['normalize']['std'])
                ? (input['normalize']['std'] as unknown[]).filter((n): n is number => typeof n === 'number')
                : undefined,
      } : undefined,
    } : undefined,
    safety: safety ? {
      tier:       typeof safety['tier']       === 'string' ? safety['tier']       : undefined,
      disclaimer: typeof safety['disclaimer'] === 'string' ? safety['disclaimer'] : undefined,
    } : undefined,
    thresholds: thresholds ? {
      possible_finding:  typeof thresholds['possible_finding']  === 'number' ? thresholds['possible_finding']  : undefined,
      low_confidence:    typeof thresholds['low_confidence']    === 'number' ? thresholds['low_confidence']    : undefined,
      validation_status: typeof thresholds['validation_status'] === 'string' ? thresholds['validation_status'] : undefined,
    } : undefined,
    certified: typeof raw['certified'] === 'boolean' ? raw['certified'] : undefined,
  };
}

/* ─── Small UI helpers ──────────────────────────────────────────────────── */

function ShieldIcon() {
  return (
    <svg width="13" height="14" viewBox="0 0 13 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M6.5 1L1 3.3V7C1 9.97 3.5 12.65 6.5 13 9.5 12.65 12 9.97 12 7V3.3L6.5 1z"
        stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" fill="none" />
      <path d="M4 7l2 2 3-3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PassIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3.5 6l2 2 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FailIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4 4l4 4M8 4l-4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td className="spec-table__label">{label}</td>
      <td className="spec-table__value mono">{value}</td>
    </tr>
  );
}

function validationLabel(status: string): string {
  const s = status.toLowerCase();
  if (s === 'passed'    || s === 'validated')  return 'Validation Passed';
  if (s === 'failed')                          return 'Validation Failed';
  if (s === 'unvalidated' || s === 'pending')  return 'Pending Validation';
  return status.replace(/_/g, ' ');
}

function validationColor(status: string): string {
  const s = status.toLowerCase();
  if (s === 'passed' || s === 'validated') return 'var(--accent-primary)';
  if (s === 'failed')                      return 'var(--status-danger)';
  return 'var(--status-warning)';
}

/* ─── Page ──────────────────────────────────────────────────────────────── */

export default function ModelDetailPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug   = params?.slug ?? '';

  const [detail,  setDetail]  = useState<ModelDetail  | null>(null);
  const [meta,    setMeta]    = useState<ClarityMeta  | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [selected, setSelected] = useState(false);

  useEffect(() => {
    if (!slug) { setError('Missing model slug.'); setLoading(false); return; }

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/models/${encodeURIComponent(slug)}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const parsed = parseDetail(await res.json() as unknown);

        /* Also try to fetch clarity.json for extra metadata — non-fatal if it fails */
        let clarityMeta: ClarityMeta = {};
        try {
          const specRes = await fetch(parsed.current_version.clarity_url, { cache: 'no-store' });
          if (specRes.ok) clarityMeta = parseMeta(await specRes.json() as unknown);
        } catch { /* non-fatal */ }

        setDetail(parsed);
        setMeta(clarityMeta);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load model details.');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [slug]);

  const validationStatus = useMemo(() => {
    return (
      detail?.current_version.validation_status ??
      meta?.thresholds?.validation_status ??
      'unvalidated'
    );
  }, [detail, meta]);

  const handleSelectModel = () => {
    window.localStorage.setItem('clarityray_selected_model', slug);
    setSelected(true);
    router.push('/analysis');
  };

  /* ── Loading ── */
  if (loading) {
    return (
      <>
        <TopBar />
        <main className="detail-page">
          <div className="detail-shell">
            <div className="panel skeleton-block" style={{ height: 200 }} aria-label="Loading model details" />
          </div>
        </main>
        <DetailStyles />
      </>
    );
  }

  /* ── Error ── */
  if (error || !detail) {
    return (
      <>
        <TopBar />
        <main className="detail-page">
          <div className="detail-shell">
            <div className="panel panel-accent detail-error">
              <p className="detail-error__msg">{error ?? 'Model not found.'}</p>
              <Link href="/models" className="btn">← Back to Library</Link>
            </div>
          </div>
        </main>
        <DetailStyles />
      </>
    );
  }

  const { model, current_version: ver } = detail;
  const tierColor = meta?.safety?.tier?.toLowerCase() === 'screening'
    ? 'var(--accent-primary)'
    : meta?.safety?.tier?.toLowerCase() === 'research'
      ? 'var(--status-info)'
      : 'var(--status-warning)';
  const vColor = validationColor(validationStatus);

  return (
    <>
      <TopBar />

      <main className="detail-page">
        <div className="detail-shell">
          {/* Breadcrumb */}
          <nav className="detail-breadcrumb" aria-label="Breadcrumb">
            <Link href="/models" className="detail-breadcrumb__link">Model Library</Link>
            <span className="detail-breadcrumb__sep" aria-hidden="true">/</span>
            <span className="detail-breadcrumb__current">{model.name}</span>
          </nav>

          {/* Two-column layout */}
          <div className="detail-columns">

            {/* ── LEFT (60%) ── */}
            <div className="detail-left">
              {/* Name + badges */}
              <h1 className="detail-name">{model.name}</h1>
              <div className="detail-badges">
                <span className="detail-badge mono">v{ver.version}</span>
                <span className="detail-badge detail-badge--status mono">
                  {model.status.toUpperCase()}
                </span>
                {meta?.safety?.tier && (
                  <span
                    className="detail-badge mono"
                    style={{ '--badge-c': tierColor } as React.CSSProperties}
                  >
                    {meta.safety.tier.toUpperCase()}
                  </span>
                )}
              </div>

              {/* Safety disclaimer block */}
              {meta?.safety?.disclaimer && (
                <div className="detail-disclaimer">
                  <p className="detail-disclaimer__label mono">SAFETY NOTICE</p>
                  <p className="detail-disclaimer__text">{meta.safety.disclaimer}</p>
                </div>
              )}

              {/* Output classes */}
              {meta?.output?.classes && meta.output.classes.length > 0 && (
                <section className="detail-section" aria-labelledby="classes-heading">
                  <h2 id="classes-heading" className="detail-section__title">Output Classes</h2>
                  <ul className="detail-class-list">
                    {meta.output.classes.map((cls, i) => (
                      <li key={i} className="detail-class-item">
                        <span className="detail-class-item__index mono">{String(i).padStart(2, '0')}</span>
                        <span className="detail-class-item__name">{cls}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Technical specs */}
              <section className="detail-section" aria-labelledby="specs-heading">
                <h2 id="specs-heading" className="detail-section__title">Technical Specifications</h2>
                <table className="spec-table">
                  <tbody>
                    {meta?.input?.shape && (
                      <SpecRow label="Input shape" value={`[${meta.input.shape.join(', ')}]`} />
                    )}
                    {meta?.output?.activation && (
                      <SpecRow label="Activation" value={meta.output.activation} />
                    )}
                    {meta?.output?.shape && (
                      <SpecRow label="Output shape" value={`[${meta.output.shape.join(', ')}]`} />
                    )}
                    {meta?.input?.normalize?.mean && (
                      <SpecRow label="Norm. mean" value={`[${meta.input.normalize.mean.join(', ')}]`} />
                    )}
                    {meta?.input?.normalize?.std && (
                      <SpecRow label="Norm. std" value={`[${meta.input.normalize.std.join(', ')}]`} />
                    )}
                    {model.bodypart && <SpecRow label="Body part" value={model.bodypart.toUpperCase()} />}
                    {model.modality && <SpecRow label="Modality"  value={model.modality.toUpperCase()} />}
                    {ver.file_size_mb !== undefined && (
                      <SpecRow label="File size" value={`${ver.file_size_mb.toFixed(2)} MB`} />
                    )}
                  </tbody>
                </table>
              </section>

              {/* Thresholds */}
              {meta?.thresholds && (
                <section className="detail-section" aria-labelledby="thresh-heading">
                  <h2 id="thresh-heading" className="detail-section__title">Decision Thresholds</h2>
                  <table className="spec-table">
                    <tbody>
                      {meta.thresholds.possible_finding !== undefined && (
                        <SpecRow label="Possible finding" value={String(meta.thresholds.possible_finding)} />
                      )}
                      {meta.thresholds.low_confidence !== undefined && (
                        <SpecRow label="Low confidence"  value={String(meta.thresholds.low_confidence)} />
                      )}
                    </tbody>
                  </table>
                </section>
              )}
            </div>

            {/* ── RIGHT (40%) ── */}
            <div className="detail-right">
              {/* Deploy card */}
              <div className="panel panel-accent detail-deploy">
                <p className="detail-deploy__header mono">DEPLOY THIS MODEL</p>
                <p className="detail-deploy__sub">Select for analysis on this device</p>

                <button
                  id="use-model-btn"
                  className="detail-deploy__btn"
                  onClick={handleSelectModel}
                  disabled={selected}
                  aria-label={`Use ${model.name} for analysis`}
                >
                  {selected ? 'Redirecting…' : 'Use for Analysis'}
                </button>

                {/* Certified indicator */}
                <div className="detail-deploy__certified">
                  {meta?.certified ? (
                    <span className="detail-deploy__certified-yes">
                      <ShieldIcon /> Certified Model
                    </span>
                  ) : (
                    <span className="detail-deploy__certified-no">Community Model</span>
                  )}
                </div>
              </div>

              {/* Validation status card */}
              <div className="panel detail-validation">
                <p className="detail-validation__header mono">VALIDATION STATUS</p>
                <div className="detail-validation__row">
                  <span
                    className="detail-validation__icon"
                    style={{ color: vColor }}
                    aria-hidden="true"
                  >
                    {validationStatus.toLowerCase() === 'passed' || validationStatus.toLowerCase() === 'validated'
                      ? <PassIcon />
                      : validationStatus.toLowerCase() === 'failed'
                        ? <FailIcon />
                        : '—'
                    }
                  </span>
                  <span
                    className="detail-validation__label mono"
                    style={{ color: vColor }}
                  >
                    {validationLabel(validationStatus)}
                  </span>
                </div>
                {ver.last_validated && (
                  <p className="detail-validation__date mono">Last validated: {ver.last_validated}</p>
                )}
              </div>

              {/* Privacy note */}
              <div className="panel detail-privacy">
                <p className="detail-privacy__header mono">🔒 LOCAL INFERENCE</p>
                <p className="detail-privacy__body">
                  Model runs locally after download.{' '}
                  <strong>No patient data ever transmitted.</strong>
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <DetailStyles />
    </>
  );
}

/* ── Scoped styles component ─────────────────────────────────────────────── */
function DetailStyles() {
  return (
    <style>{`
      .detail-page {
        min-height: 100vh;
        background: var(--bg-base);
        padding-top: 80px;
        padding-bottom: 64px;
      }
      .detail-shell {
        width: min(1120px, 100% - 2rem);
        margin-inline: auto;
        display: flex;
        flex-direction: column;
        gap: 24px;
      }

      /* Breadcrumb */
      .detail-breadcrumb {
        display: flex;
        align-items: center;
        gap: 6px;
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--text-tertiary);
      }
      .detail-breadcrumb__link {
        color: var(--accent-primary);
        text-decoration: none;
        opacity: 0.8;
        transition: opacity var(--transition-fast);
      }
      .detail-breadcrumb__link:hover { opacity: 1; }
      .detail-breadcrumb__sep { opacity: 0.4; }
      .detail-breadcrumb__current { color: var(--text-secondary); }

      /* Two-column layout */
      .detail-columns {
        display: grid;
        grid-template-columns: 60% 40%;
        gap: 24px;
        align-items: start;
      }
      @media (max-width: 768px) {
        .detail-columns { grid-template-columns: 1fr; }
        .detail-right { display: contents; }
      }

      .detail-left  { display: flex; flex-direction: column; gap: 20px; }
      .detail-right { display: flex; flex-direction: column; gap: 16px; position: sticky; top: 72px; }

      /* Name + badges */
      .detail-name {
        font-family: var(--font-ui);
        font-size: 1.75rem;
        font-weight: 600;
        color: var(--text-primary);
        letter-spacing: -0.02em;
        line-height: 1.2;
      }
      .detail-badges {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .detail-badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: var(--radius-sm);
        font-size: 10px;
        letter-spacing: 0.07em;
        color: var(--text-secondary);
        border: 1px solid var(--border-subtle);
        background: rgba(255,255,255,0.03);
      }
      .detail-badge--status {
        color: var(--accent-primary);
        border-color: var(--accent-primary-border);
      }
      .detail-badge[style] {
        color: var(--badge-c, var(--text-secondary));
        border-color: var(--badge-c, var(--border-subtle));
      }

      /* Safety disclaimer */
      .detail-disclaimer {
        border: 1px solid rgba(245, 158, 11, 0.35);
        background: rgba(245, 158, 11, 0.05);
        border-radius: var(--radius-md);
        padding: 14px 16px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .detail-disclaimer__label {
        font-size: 9px;
        letter-spacing: 0.1em;
        color: #f59e0b;
        opacity: 0.8;
      }
      .detail-disclaimer__text {
        font-size: 0.8125rem;
        color: var(--text-secondary);
        line-height: 1.55;
      }

      /* Sections */
      .detail-section { display: flex; flex-direction: column; gap: 10px; }
      .detail-section__title {
        font-family: var(--font-mono);
        font-size: 10px;
        letter-spacing: 0.1em;
        color: var(--text-tertiary);
        text-transform: uppercase;
      }

      /* Class list */
      .detail-class-list {
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .detail-class-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 6px 0;
        border-bottom: 1px solid var(--border-subtle);
      }
      .detail-class-item:last-child { border-bottom: none; }
      .detail-class-item__index {
        font-size: 10px;
        color: var(--text-tertiary);
        min-width: 20px;
      }
      .detail-class-item__name {
        font-family: var(--font-ui);
        font-size: 0.875rem;
        color: var(--text-primary);
        font-weight: 500;
      }

      /* Spec table */
      .spec-table {
        width: 100%;
        border-collapse: collapse;
      }
      .spec-table tr {
        border-bottom: 1px solid var(--border-subtle);
      }
      .spec-table tr:last-child { border-bottom: none; }
      .spec-table__label {
        padding: 7px 0;
        font-size: 0.75rem;
        color: var(--text-secondary);
        width: 45%;
        vertical-align: middle;
      }
      .spec-table__value {
        padding: 7px 0;
        font-size: 11px;
        color: var(--text-mono);
        text-align: right;
        vertical-align: middle;
      }

      /* Error state */
      .detail-error {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 32px 24px;
      }
      .detail-error__msg {
        font-size: 0.9375rem;
        color: var(--status-danger);
      }

      /* Deploy card */
      .detail-deploy {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .detail-deploy__header {
        font-size: 10px;
        letter-spacing: 0.1em;
        color: var(--accent-primary);
      }
      .detail-deploy__sub {
        font-size: 0.8125rem;
        color: var(--text-secondary);
        margin-top: -4px;
      }
      .detail-deploy__btn {
        display: block;
        width: 100%;
        padding: 10px 0;
        border-radius: var(--radius-md);
        background: var(--accent-primary);
        color: #000;
        font-family: var(--font-mono);
        font-size: 0.8125rem;
        font-weight: 600;
        letter-spacing: 0.04em;
        cursor: pointer;
        border: none;
        transition: opacity var(--transition-base);
      }
      .detail-deploy__btn:hover:not(:disabled) { opacity: 0.85; }
      .detail-deploy__btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .detail-deploy__certified {
        padding-top: 8px;
        border-top: 1px solid var(--border-subtle);
      }
      .detail-deploy__certified-yes {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--accent-primary);
      }
      .detail-deploy__certified-no {
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--text-tertiary);
      }

      /* Validation card */
      .detail-validation {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .detail-validation__header {
        font-size: 10px;
        letter-spacing: 0.1em;
        color: var(--text-tertiary);
      }
      .detail-validation__row {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .detail-validation__icon {
        display: inline-flex;
        align-items: center;
      }
      .detail-validation__label {
        font-size: 12px;
        font-weight: 500;
      }
      .detail-validation__date {
        font-size: 10px;
        color: var(--text-tertiary);
      }

      /* Privacy note */
      .detail-privacy {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .detail-privacy__header {
        font-size: 10px;
        letter-spacing: 0.08em;
        color: var(--accent-primary);
      }
      .detail-privacy__body {
        font-size: 0.8125rem;
        color: var(--text-secondary);
        line-height: 1.5;
      }

      /* Skeleton */
      .skeleton-block {
        border-radius: var(--radius-lg);
        background: var(--bg-elevated);
        animation: skeleton-pulse 1.6s ease-in-out infinite;
      }
      @keyframes skeleton-pulse {
        0%, 100% { opacity: 1; }
        50%       { opacity: 0.45; }
      }
    `}</style>
  );
}
