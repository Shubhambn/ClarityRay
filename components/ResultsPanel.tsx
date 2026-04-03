'use client';

import type { AnalysisStatus } from '@/hooks/useClarityRay';
import type { SafeResult } from '@/lib/clarity/postprocess';

interface ResultsPanelProps {
  result: SafeResult | null;
  status?: AnalysisStatus;
}

const DEFAULT_DISCLAIMER =
  'This is a screening tool, not a diagnosis. Always consult a qualified physician.';

function getTierStyles(tier: SafeResult['safetyTier']): string {
  if (tier === 'possible_finding') return 'bg-red-500/15 text-red-200 border border-red-500/40';
  if (tier === 'low_confidence') return 'bg-yellow-500/15 text-yellow-200 border border-yellow-500/40';
  return 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/40';
}

export function ResultsPanel({ result, status = 'idle' }: ResultsPanelProps) {
  const loading =
    status === 'loading_manifest' ||
    status === 'loading_spec' ||
    status === 'downloading_model' ||
    status === 'verifying_model' ||
    status === 'processing';

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Results</h3>
        <span className="text-xs text-slate-400">Screening-only output</span>
      </div>

      {status === 'processing' && <p className="text-sm text-slate-300">Analyzing image...</p>}

      {!loading && !result && <p className="text-sm text-slate-400">Upload an X-ray to see possible findings.</p>}

      {result && (
        <div className="space-y-3">
          <div>
            <p className="text-sm text-slate-400">Primary finding</p>
            <p className="text-xl font-bold text-white">{result.primaryFinding}</p>
          </div>

          <div className="rounded-lg bg-white/5 p-3">
            <p className="text-sm text-slate-400">Confidence</p>
            <p className="text-4xl font-bold text-white">{result.confidencePercent}%</p>
          </div>

          <div className={`rounded-lg px-3 py-2 text-sm font-medium ${getTierStyles(result.safetyTier)}`}>
            Safety tier: {result.safetyTier.replace('_', ' ')}
          </div>

          <div className="rounded-lg bg-white/5 p-3 text-sm text-slate-200">
            <p className="font-semibold text-white">Explanation</p>
            <p className="text-slate-200">{result.plainSummary}</p>
          </div>

          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-100">
            {result.disclaimer}
          </div>
        </div>
      )}

      {!result && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-100">
          {DEFAULT_DISCLAIMER}
        </div>
      )}
    </div>
  );
}
