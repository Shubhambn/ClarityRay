'use client';

import { LoaderCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { AppShell } from '@/layouts/AppShell';
import { UploadZone } from '@/components/UploadZone';
import { ResultsPanel } from '@/components/ResultsPanel';
import { GradCAMViewer } from '@/components/GradCAMViewer';
import { ConsentModal } from '@/components/ConsentModal';
import { useClarityRay } from '@/hooks/useClarityRay';
import { type ClaritySpec, validateSpec } from '@/lib/clarity/types';

export default function AnalysisPage() {
  const [spec, setSpec] = useState<ClaritySpec | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSpec = useCallback(async () => {
    setError(null);

    try {
      const response = await fetch('/models/densenet121-chest/clarity.json');
      if (!response.ok) {
        throw new Error(`Failed to load model spec (${response.status})`);
      }

      const json: unknown = await response.json();
      const validated = validateSpec(json);
      setSpec(validated);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load model spec.';
      setError(message);
      setSpec(null);
    }
  }, []);

  useEffect(() => {
    void loadSpec();
  }, [loadSpec]);

  if (error) {
    return (
      <>
        <ConsentModal />
        <AppShell
          title="Local chest X-ray analysis"
          subtitle="AI inference runs fully in your browser."
          ctaLabel="Dashboard"
          ctaHref="/dashboard"
        >
          <div className="card space-y-4">
            <p className="text-sm text-red-400">{error}</p>
            <Button
              variant="primary"
              onClick={() => {
                void loadSpec();
              }}
            >
              Retry
            </Button>
          </div>
        </AppShell>
      </>
    );
  }

  if (spec === null && !error) {
    return (
      <>
        <ConsentModal />
        <AppShell
          title="Local chest X-ray analysis"
          subtitle="AI inference runs fully in your browser."
          ctaLabel="Dashboard"
          ctaHref="/dashboard"
        >
          <div className="card flex min-h-64 flex-col items-center justify-center gap-3 text-center">
            <LoaderCircle className="animate-spin text-emerald-300" size={28} />
            <p className="text-sm text-slate-200">Loading model spec...</p>
          </div>
        </AppShell>
      </>
    );
  }

  if (spec === null) {
    return null;
  }

  return <AnalysisPageContent spec={spec} />;
}

interface AnalysisPageContentProps {
  spec: ClaritySpec;
}

function AnalysisPageContent({ spec }: AnalysisPageContentProps) {

  const { status, findings, heatmapCanvas, disclaimer, error, result, imageUrl, runAnalysis, reset } = useClarityRay(spec);

  const statusText = useMemo(() => {
    switch (status) {
      case 'loading_model':
        return 'Loading AI model locally...';
      case 'preprocessing':
        return 'Preparing image...';
      case 'running':
        return 'Running analysis locally on your device...';
      default:
        return null;
    }
  }, [status]);

  const errorMessage = error ? new Error(error).message : null;

  return (
    <>
      <ConsentModal />
      <AppShell
        title="Local chest X-ray analysis"
        subtitle="AI inference runs fully in your browser."
        ctaLabel="Dashboard"
        ctaHref="/dashboard"
      >
        <div className="mb-4 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          Analysis runs on your device — no data is uploaded
        </div>

        {status === 'idle' && (
          <div className="space-y-4">
            <p className="text-sm text-slate-300">Drop an X-ray image to begin private on-device screening support.</p>
            <UploadZone
              onRun={async (file: File) => {
                await runAnalysis(file);
              }}
              onClear={reset}
              status={status}
              error={error}
            />
          </div>
        )}

        {(status === 'loading_model' || status === 'preprocessing' || status === 'running') && (
          <div className="card flex min-h-64 flex-col items-center justify-center gap-3 text-center">
            <LoaderCircle className="animate-spin text-emerald-300" size={28} />
            <p className="text-sm text-slate-200">{statusText}</p>
          </div>
        )}

        {status === 'complete' && result && (
          <div className="grid gap-4 lg:grid-cols-2">
            <ResultsPanel result={result} status={status} />
            <GradCAMViewer imageUrl={imageUrl} heatmap={heatmapCanvas ?? undefined} />
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-100 lg:col-span-2">
              {disclaimer}
            </div>
            <p className="text-xs text-slate-400 lg:col-span-2">Detected classes: {findings.length}</p>
          </div>
        )}

        {status === 'error' && (
          <div className="card space-y-4">
            <p className="text-sm text-red-400">{errorMessage}</p>
            <Button variant="primary" onClick={reset}>
              Retry
            </Button>
          </div>
        )}
      </AppShell>
    </>
  );
}
