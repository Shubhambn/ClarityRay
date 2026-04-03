import type { AnalysisStatus } from '@/hooks/useClarityRay';

interface TopBarProps {
  status: AnalysisStatus;
}

const statusMessages: Record<AnalysisStatus, string> = {
  idle: 'SYSTEM READY',
  loading_model: 'LOADING MODEL',
  preprocessing: 'PREPROCESSING',
  running: 'RUNNING INFERENCE',
  complete: 'ANALYSIS COMPLETE',
  error: 'ERROR'
};

export function TopBar({ status }: TopBarProps) {
  return (
    <div className="relative z-20 flex items-center justify-between border-b border-green-500/12 px-8 py-4">
      <div className="mono text-sm font-medium text-white">
        Clarity<span className="text-green-500">Ray</span>
      </div>
      <div className="flex items-center gap-2 mono text-xs text-green-500">
        <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" style={{animation: 'blink 1.2s ease-in-out infinite'}} />
        <span>{statusMessages[status]}</span>
      </div>
    </div>
  );
}
