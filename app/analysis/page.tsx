'use client';

import { UploadZone } from '@/components/UploadZone';
import { ConsentModal } from '@/components/ConsentModal';
import { useClarityRay } from '@/hooks/useClarityRay';
import { BackgroundFX } from '@/components/analysis/BackgroundFX';
import { TopBar } from '@/components/analysis/TopBar';
import { BottomBar } from '@/components/analysis/BottomBar';
import { ScannerPanel } from '@/components/analysis/ScannerPanel';
import { AnalysisPanel } from '@/components/analysis/AnalysisPanel';
import { StatusPanel } from '@/components/analysis/StatusPanel';
import { Button } from '@/components/ui/button';

export default function AnalysisPage() {
  const { status, heatmapCanvas, error, result, imageUrl, runAnalysis, reset } = useClarityRay();

  return (
    <>
      <ConsentModal />
      <div className="relative w-full min-h-screen bg-black flex flex-col overflow-hidden">
        {/* Background effects */}
        <BackgroundFX />

        {/* Top bar */}
        <TopBar status={status} />

        {/* Main content */}
        <div className="relative z-15 flex-1 flex flex-col">
          {status === 'idle' ? (
            // Upload state
            <div className="flex-1 flex items-center justify-center px-8">
              <div className="w-full max-w-2xl space-y-6">
                <div className="space-y-2 text-center">
                  <h1 className="text-3xl font-light text-white">
                    Medical AI Scanner
                  </h1>
                  <p className="text-sm text-white/50">
                    Upload a chest X-ray for local analysis. No data leaves your device.
                  </p>
                </div>
                <UploadZone
                  onRun={async (file: File) => {
                    await runAnalysis(file);
                  }}
                  onClear={reset}
                  status={status}
                  error={error}
                />
              </div>
            </div>
          ) : (
            // Analysis state
            <div className="flex-1 flex flex-col px-8 py-6 gap-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
                {/* Left column: Scanner */}
                <div className="lg:col-span-2">
                  <ScannerPanel imageUrl={imageUrl} heatmap={heatmapCanvas} />
                </div>

                {/* Right column: Analysis */}
                <div className="flex flex-col gap-4">
                  <AnalysisPanel result={result} status={status} />
                  <StatusPanel status={status} error={error} />

                  {status === 'error' && (
                    <Button
                      variant="primary"
                      onClick={reset}
                      className="w-full bg-green-500 hover:bg-green-600 text-black"
                    >
                      Retry
                    </Button>
                  )}
                </div>
              </div>

              {/* Disclaimer */}
              {result && (
                <div className="border border-amber-500/30 bg-amber-500/10 rounded-lg p-3 text-xs text-amber-100/80 mono">
                  {result.disclaimer}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom bar */}
        <BottomBar />
      </div>
    </>
  );
}
