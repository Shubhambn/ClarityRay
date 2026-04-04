'use client';

import type { ClarityRayStatus } from '@/hooks/useClarityRay';
import type { SafeResult } from '@/lib/clarity/postprocess';

interface ResultsPanelProps {
  result: SafeResult | null;
  status?: ClarityRayStatus;
  probabilities?: number[] | null;
  classLabels?: string[];
}

const DEFAULT_DISCLAIMER =
  'This is a screening tool, not a diagnosis. Always consult a qualified physician.';

function getTierStyles(tier: SafeResult['safetyTier']): string {
  if (tier === 'possible_finding') return 'bg-red-500/15 text-red-200 border border-red-500/40';
  if (tier === 'low_confidence') return 'bg-yellow-500/15 text-yellow-200 border border-yellow-500/40';
  return 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/40';
}

function getTierBadgeClass(tier: SafeResult['safetyTier']): string {
  if (tier === 'possible_finding') return 'border-red-500/50 bg-red-950/50 text-red-200';
  if (tier === 'low_confidence') return 'border-amber-500/50 bg-amber-950/40 text-amber-100';
  return 'border-emerald-500/50 bg-emerald-950/40 text-emerald-100';
}

export function ResultsPanel({
  result,
  status = 'idle',
  probabilities = null,
  classLabels = []
}: ResultsPanelProps) {
  const loading =
    status === 'loading_manifest' ||
    status === 'loading_spec' ||
    status === 'downloading_model' ||
    status === 'verifying_model' ||
    status === 'processing';

  const showBars =
    Array.isArray(probabilities) &&
    probabilities.length > 0 &&
    classLabels.length === probabilities.length &&
    result !== null;

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
        <h3 className="font-mono-system text-sm font-semibold uppercase tracking-wider text-[var(--g)]">Results</h3>
        <span className="text-[10px] text-[var(--muted)]">Screening-only output</span>
      </div>

      {status === 'processing' && <p className="font-mono-system text-sm text-zinc-300">Running inference...</p>}

      {!loading && !result && (
        <p className="text-sm text-[var(--muted)]">Upload an X-ray and run analysis to see outputs.</p>
      )}

      {showBars && (
        <div className="space-y-2">
          <p className="font-mono-system text-[10px] uppercase tracking-wider text-[var(--muted)]">Inference output</p>
          <ul className="space-y-2">
            {classLabels.map((label, i) => {
              const p = probabilities[i] ?? 0;
              const pct = Math.round(p * 100);
              return (
                <li key={`${label}-${i}`}>
                  <div className="mb-1 flex justify-between font-mono-system text-[11px] text-zinc-300">
                    <span className="truncate pr-2">{label}</span>
                    <span className="shrink-0 text-[var(--g)]">{pct}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/50">
                    <div
                      className="h-full rounded-full bg-[var(--clarity-green)] transition-[width] duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {result && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded border px-2 py-0.5 font-mono-system text-[10px] font-medium uppercase tracking-wide ${getTierBadgeClass(result.safetyTier)}`}
            >
              Primary finding
            </span>
          </div>
          <div>
            <p className="text-2xl font-semibold tracking-tight text-white">{result.primaryFinding}</p>
          </div>

          <div className="rounded-lg border border-white/10 bg-black/30 p-3">
            <p className="text-xs text-[var(--muted)]">Confidence</p>
            <p className="font-mono-system text-3xl font-bold text-white">{result.confidencePercent}%</p>
          </div>

          <div className={`rounded-lg px-3 py-2 text-sm font-medium ${getTierStyles(result.safetyTier)}`}>
            Safety tier: {result.safetyTier.replace('_', ' ')}
          </div>

          <div className="rounded-lg border border-white/10 bg-black/25 p-3 text-sm leading-relaxed text-zinc-200">
            <p className="mb-1 font-semibold text-white">Explanation</p>
            <p>{result.plainSummary}</p>
          </div>

          <div className="rounded-lg border border-amber-500/35 bg-amber-950/25 p-3 text-xs leading-relaxed text-amber-100/90">
            {result.disclaimer}
          </div>
        </div>
      )}

      {!result && (
        <div className="rounded-lg border border-amber-500/35 bg-amber-950/20 p-3 text-xs text-amber-100/90">
          {DEFAULT_DISCLAIMER}
        </div>
      )}
    </div>
  );
}
