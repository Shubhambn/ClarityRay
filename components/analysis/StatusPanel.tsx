import type { AnalysisStatus } from '@/hooks/useClarityRay';

interface StatusPanelProps {
  status: AnalysisStatus;
  error?: string | null;
}

const statusMessages: Record<AnalysisStatus, string> = {
  idle: 'Waiting for input...',
  loading_model: 'Loading AI model...',
  preprocessing: 'Preparing image...',
  running: 'Running inference...',
  complete: 'Analysis complete',
  error: 'Analysis error'
};

export function StatusPanel({ status, error }: StatusPanelProps) {
  return (
    <div className="border border-green-500/15 rounded-lg bg-black/80 p-3 mono text-xs">
      <div className="space-y-2">
        {status === 'error' && error ? (
          <div className="text-red-500">{error}</div>
        ) : (
          <div className="text-green-500/80">{statusMessages[status]}</div>
        )}
      </div>
    </div>
  );
}
