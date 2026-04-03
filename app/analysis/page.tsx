'use client';

import { LoaderCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { AppShell } from '@/layouts/AppShell';
import { UploadZone } from '@/components/UploadZone';
import { ResultsPanel } from '@/components/ResultsPanel';
import { GradCAMViewer } from '@/components/GradCAMViewer';
import { ConsentModal } from '@/components/ConsentModal';
import { useClarityRay } from '@/hooks/useClarityRay';
import { type ClaritySpec, validateSpec } from '@/lib/clarity/types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseClarityUrl(payload: unknown): string {
  if (!isRecord(payload) || !isRecord(payload.current_version)) {
    throw new Error('Invalid model detail response.');
  }

  const clarityUrl = payload.current_version.clarity_url;
  if (typeof clarityUrl !== 'string' || clarityUrl.length === 0) {
    throw new Error('Missing clarity.json URL in model response.');
  }

  return clarityUrl;
}

export default function AnalysisPage() {
  const router = useRouter();
  const [spec, setSpec] = useState<ClaritySpec | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSpec = useCallback(async () => {
    setError(null);

    try {
      const selectedSlug = window.localStorage.getItem('clarityray_selected_model');
      if (!selectedSlug) {
        router.replace('/models');
        return;
      }

      const modelResponse = await fetch(`/api/models/${encodeURIComponent(selectedSlug)}`, { cache: 'no-store' });
      if (!modelResponse.ok) {
        throw new Error(`Failed to load selected model (${modelResponse.status})`);
      }

      const modelPayload: unknown = await modelResponse.json();
      const clarityUrl = parseClarityUrl(modelPayload);

      const response = await fetch(clarityUrl, { cache: 'no-store' });
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
  }, [router]);

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
  const { status, heatmapCanvas, error, result, imageUrl, runAnalysis, reset } = useClarityRay(spec);

  const statusText = useMemo(() => {
    switch (status) {
      case 'loading_manifest':
      case 'loading_spec':
        return 'Preparing AI model...';
      case 'downloading_model':
        return 'Downloading model...';
      case 'verifying_model':
        return 'Verifying model integrity...';
      case 'ready':
        return 'Model ready';
      case 'processing':
        return 'Analyzing image...';
      default:
        return null;
    }
  }, [status]);

  const errorMessage = error ? new Error(error).message : null;

  const isPreparing = status === 'loading_manifest' || status === 'loading_spec';
  const isLoading = isPreparing || status === 'downloading_model' || status === 'verifying_model';
  const isProcessing = status === 'processing';
  const canUpload = status === 'ready' || status === 'idle';

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
          Processing happens locally in your browser.
        </div>

        {status === 'idle' && (
          <div className="mb-4 rounded-lg border border-slate-600/60 bg-slate-800/40 px-3 py-2 text-sm text-slate-200">
            Your image is processed locally. Nothing is uploaded.
          </div>
        )}

        {canUpload && (
          <div className="space-y-4">
            {status === 'ready' && (
              <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                Model ready
              </div>
            )}
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

        {isLoading && (
          <div className="card flex min-h-64 flex-col items-center justify-center gap-3 text-center">
            <LoaderCircle className="animate-spin text-emerald-300" size={28} />
            <p className="text-sm text-slate-200">{statusText}</p>
            {isPreparing && <p className="text-xs text-slate-400">First load may take a few seconds</p>}
            {status === 'downloading_model' && <p className="text-xs text-slate-400">File size hint unavailable</p>}
          </div>
        )}

        {isProcessing && (
          <div className="card flex min-h-64 flex-col items-center justify-center gap-3 text-center">
            <LoaderCircle className="animate-spin text-emerald-300" size={28} />
            <p className="text-sm text-slate-200">Analyzing image...</p>
          </div>
        )}

        {result && !isProcessing && (
          <div className="grid gap-4 lg:grid-cols-2">
            <ResultsPanel result={result} status={status} />
            <GradCAMViewer imageUrl={imageUrl} heatmap={heatmapCanvas ?? undefined} />
          </div>
        )}

        {status === 'error' && (
          <div className="card space-y-4">
            <p className="text-sm text-red-400">{errorMessage}</p>
            <Button
              variant="primary"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.location.reload();
                  return;
                }
                reset();
              }}
            >
              Retry
            </Button>
          </div>
        )}
      </AppShell>
    </>
  );
}
