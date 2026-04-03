'use client';

import type { AnalysisStatus } from '@/hooks/useClarityRay';
import type { ClarityRayResult } from '@/lib/clarity/postprocess';

interface ResultsPanelProps {
  result: ClarityRayResult | null;
  status?: AnalysisStatus;
}

const DEFAULT_DISCLAIMER =
  'This is a screening tool, not a diagnosis. Always consult a qualified physician.';

function getBarColor(confidence: number): string {
  const percent = confidence * 100;
  if (percent > 70) return 'bg-orange-500';
  if (percent >= 40) return 'bg-yellow-500';
  return 'bg-slate-500';
}

export function ResultsPanel({ result, status = 'idle' }: ResultsPanelProps) {
  const loading = status === 'loading_model' || status === 'running';

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Results</h3>
        <span className="text-xs text-slate-400">Screening-only output</span>
      </div>

      {status === 'loading_model' && <p className="text-sm text-slate-300">Loading AI model...</p>}
      {status === 'running' && <p className="text-sm text-slate-300">Running analysis...</p>}

      {!loading && !result && <p className="text-sm text-slate-400">Upload an X-ray to see possible findings.</p>}

      {result && (
        <div className="space-y-3">
          <div>
            <p className="text-sm text-slate-400">Primary finding</p>
            <p className="text-xl font-semibold text-emerald-300">{result.primaryFinding}</p>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-slate-400">Findings (probabilities)</p>
            <div className="space-y-2">
              {result.findings.map((f) => (
                <div key={f.label} className="space-y-1">
                  <div className="flex items-center justify-between text-sm text-white">
                    <span>{f.label}</span>
                    <span className="text-xs text-slate-300">{(f.confidence * 100).toFixed(1)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10">
                    <div
                      className={`h-2 rounded-full ${getBarColor(f.confidence)}`}
                      style={{ width: `${Math.min(100, Math.max(0, f.confidence * 100))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg bg-white/5 p-3 text-sm text-slate-200">
            <p className="font-semibold text-white">Explanation</p>
            <p className="text-slate-200">{result.explanation}</p>
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
