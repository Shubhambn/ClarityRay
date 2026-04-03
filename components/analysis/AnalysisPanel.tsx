'use client';

import type { ClarityRayResult } from '@/lib/models/chestXray/postprocess';
import type { AnalysisStatus } from '@/hooks/useClarityRay';

interface AnalysisPanelProps {
  result: ClarityRayResult | null;
  status: AnalysisStatus;
}

function getBarColor(confidence: number): string {
  const percent = confidence * 100;
  if (percent > 70) return 'bg-red-500';
  if (percent >= 40) return 'bg-amber-500';
  return 'bg-green-500';
}

export function AnalysisPanel({ result, status }: AnalysisPanelProps) {
  const isProcessing = status === 'running' || status === 'loading_model';

  return (
    <div className="border border-green-500/15 rounded-lg bg-black/80 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="mono text-xs text-green-500/80 tracking-widest">AI ANALYSIS</div>
        <div className="flex items-center gap-2 mono text-xs text-green-500">
          <div className="w-1.5 h-1.5 bg-green-500 rounded-full" style={{opacity: isProcessing ? 1 : 0.3}} />
          <span>{isProcessing ? 'RUNNING' : 'COMPLETE'}</span>
        </div>
      </div>

      {result ? (
        <div className="space-y-3">
          {/* Findings as progress bars */}
          {result.findings.map((finding) => (
            <div key={finding.label} className="space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-xs text-white/60">{finding.label}</span>
                <span className="mono text-xs text-green-500">{(finding.confidence * 100).toFixed(0)}%</span>
              </div>
              <div className="h-1 bg-white/6 rounded-full overflow-hidden">
                <div
                  className={`h-1 rounded-full transition-all duration-2000 ease-out ${getBarColor(finding.confidence)}`}
                  style={{ width: `${Math.min(100, Math.max(0, finding.confidence * 100))}%` }}
                />
              </div>
            </div>
          ))}

          {/* Primary finding badge */}
          <div className="flex items-center justify-between pt-3 border-t border-white/6">
            <span className="text-xs text-white/60">Primary finding</span>
            <div className="bg-red-500/15 text-red-400 border border-red-500/30 mono text-xs px-3 py-1 rounded-full">
              {result.primaryFinding}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-xs text-white/40 mono">Awaiting analysis...</div>
      )}
    </div>
  );
}
