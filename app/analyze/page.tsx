'use client';

import { useClarityRay } from '@/hooks/useClarityRay';
import { GradCAMViewer } from '@/components/GradCAMViewer';
import { ResultsPanel } from '@/components/ResultsPanel';
import { UploadZone } from '@/components/UploadZone';

export default function AnalyzePage() {
  const { runAnalysis, reset, status, loading, error, result, imageUrl, heatmap } = useClarityRay();

  return (
    <main className="space-y-4">
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
        Zero data leaves your device. Analysis runs fully in your browser.
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <UploadZone
          loading={loading}
          status={status}
          error={error}
          onClear={reset}
          onRun={async (file) => {
            await runAnalysis(file);
          }}
        />
        <GradCAMViewer imageUrl={imageUrl ?? undefined} heatmap={heatmap ?? undefined} />
      </div>

      <ResultsPanel result={result} status={status} />
      </div>
    </main>
  );
}
