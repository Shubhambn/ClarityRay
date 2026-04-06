'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { GradCAMViewer } from '@/components/GradCAMViewer';
import { UploadZone } from '@/components/UploadZone';
import { LogPanel } from '@/components/analysis/LogPanel';
import SystemPanel from '@/components/analysis/SystemPanel';
import { ConsentModal } from '@/components/ConsentModal';
import { useClarityRay, type ClarityRayStatus } from '@/hooks/useClarityRay';
import { generateHeatmap, type HeatmapData } from '@/lib/clarity/postprocess';
import { usePersona } from '@/lib/persona/context';

// ─── Constants ────────────────────────────────────────────────────────────────

const CONSENT_KEY = 'clarityray_consent_v1';
const PERSONA_BANNER_DISMISS_KEY = 'persona_banner_dismissed';

function statusText(status: ClarityRayStatus): string {
  switch (status) {
    case 'idle':
      return 'Awaiting initialization';
    case 'loading_manifest':
      return 'Loading manifest...';
    case 'loading_spec':
      return 'Loading specification...';
    case 'downloading_model':
      return 'Downloading model...';
    case 'verifying_model':
      return 'Verifying integrity...';
    case 'ready':
      return 'System ready';
    case 'processing':
      return 'Analyzing...';
    case 'complete':
      return 'Analysis complete';
    case 'error':
      return 'Error';
    default: {
      const _never: never = status;
      return String(_never);
    }
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getDotClass(status: ClarityRayStatus): string {
  if (status === 'error') {
    return 'dot-red';
  }

  if (status === 'processing') {
    return 'dot-green dot-pulse';
  }

  if (
    status === 'loading_manifest' ||
    status === 'loading_spec' ||
    status === 'downloading_model' ||
    status === 'verifying_model'
  ) {
    return 'dot-amber dot-pulse';
  }

  return 'dot-green';
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AnalysisPage() {
  const hook = useClarityRay();
  const { persona } = usePersona();

  const [imageURL, setImageURL] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [consented, setConsented] = useState(false);
  const [personaBannerDismissed, setPersonaBannerDismissed] = useState(false);
  const [heatmap, setHeatmap] = useState<HeatmapData | null>(null);

  const isLoadingStatus =
    hook.status === 'loading_manifest' ||
    hook.status === 'loading_spec' ||
    hook.status === 'downloading_model' ||
    hook.status === 'verifying_model';

  const uploadDisabled = hook.status !== 'ready' && hook.status !== 'complete';

  useEffect(() => {
    const consent = localStorage.getItem(CONSENT_KEY);
    setConsented(consent === 'accepted');

    const dismissed = sessionStorage.getItem(PERSONA_BANNER_DISMISS_KEY);
    setPersonaBannerDismissed(dismissed === '1');
  }, []);

  useEffect(() => {
    return () => {
      if (imageURL) {
        URL.revokeObjectURL(imageURL);
      }
    };
  }, [imageURL]);

  useEffect(() => {
    if (!imageURL || hook.status !== 'complete' || hook.result === null) {
      setHeatmap(null);
      return;
    }

    let cancelled = false;
    const sourceImage = new Image();

    sourceImage.onload = () => {
      if (cancelled) {
        return;
      }

      const confidence = hook.result?.confidencePercent ?? 0;
      const abnormalConfidence =
        hook.result?.safetyTier === 'no_finding'
          ? 1 - confidence / 100
          : confidence / 100;

      try {
        const generated = generateHeatmap(sourceImage, abnormalConfidence);
        if (!cancelled) {
          setHeatmap(generated);
        }
      } catch {
        if (!cancelled) {
          setHeatmap(null);
        }
      }
    };

    sourceImage.onerror = () => {
      if (!cancelled) {
        setHeatmap(null);
      }
    };

    sourceImage.src = imageURL;

    return () => {
      cancelled = true;
    };
  }, [imageURL, hook.result, hook.status]);

  const onFileSelected = (file: File): void => {
    if (imageURL) {
      URL.revokeObjectURL(imageURL);
    }

    setSelectedFile(file);
    setImageURL(URL.createObjectURL(file));
    setShowHeatmap(false);
    setHeatmap(null);
    void hook.runAnalysis(file);
  };

  const onDismissPersonaBanner = (): void => {
    sessionStorage.setItem(PERSONA_BANNER_DISMISS_KEY, '1');
    setPersonaBannerDismissed(true);
  };

  const showPersonaBanner = consented && persona === null && !personaBannerDismissed;
  const modelVersion = hook.modelInfo?.version ? `v${hook.modelInfo.version}` : null;
  const hasHeatmap = heatmap !== null;

  const selectedFileMeta = useMemo(() => {
    if (!selectedFile) {
      return null;
    }

    return `${selectedFile.name} · ${formatBytes(selectedFile.size)}`;
  }, [selectedFile]);

  if (!consented) {
    return (
      <div style={{ minHeight: 'calc(100vh - 48px)', position: 'relative' }}>
        <ConsentModal onAccept={() => setConsented(true)} />
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: 'calc(100vh - 48px)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          height: '36px',
          padding: '0 var(--sp-6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-1)',
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          color: 'var(--text-secondary)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
          <span className="dot-green" aria-hidden="true" />
          <span>{hook.modelInfo?.name ?? 'Loading model...'}</span>
        </div>
        <div>{modelVersion ?? '—'}</div>
      </div>

      {hook.status === 'error' && hook.error !== null && (
        <div
          style={{
            background: 'rgba(239,68,68,0.08)',
            borderBottom: '1px solid rgba(239,68,68,0.2)',
            padding: 'var(--sp-2) var(--sp-6)',
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            color: 'var(--text-danger)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--sp-3)',
          }}
        >
          <span>✗ {hook.error}</span>
          <button
            type="button"
            onClick={hook.reset}
            className="mono"
            style={{
              border: '1px solid rgba(239,68,68,0.25)',
              background: 'transparent',
              color: 'var(--text-danger)',
              borderRadius: 'var(--radius-sm)',
              padding: '2px 8px',
              cursor: 'pointer',
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {showPersonaBanner && (
        <div
          style={{
            background: 'rgba(245,158,11,0.06)',
            borderBottom: '1px solid rgba(245,158,11,0.1)',
            padding: 'var(--sp-2) var(--sp-6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--sp-3)',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
            <span style={{ color: 'var(--status-warning)' }}>No view type selected.</span>
            <Link href="/onboarding" className="mono" style={{ color: 'var(--status-warning)' }}>
              Set up your view →
            </Link>
          </div>
          <button
            type="button"
            onClick={onDismissPersonaBanner}
            className="mono"
            style={{
              border: '1px solid rgba(245,158,11,0.25)',
              background: 'transparent',
              color: 'var(--status-warning)',
              borderRadius: 'var(--radius-sm)',
              padding: '2px 8px',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      )}

      <div
        className="analysis-grid"
        style={{
          flex: 1,
          display: 'grid',
          gap: 'var(--sp-3)',
          padding: 'var(--sp-3)',
          gridTemplateColumns: '260px 1fr 300px',
          gridTemplateRows: '1fr 120px',
          gridTemplateAreas: '"left center right" "logs logs logs"',
          minHeight: 0,
        }}
      >
        <aside
          className="panel"
          style={{
            gridArea: 'left',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--sp-4)',
            minHeight: 0,
          }}
        >
          <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
            <div className="label">SYSTEM</div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
              <span className={getDotClass(hook.status)} aria-hidden="true" />
              <span className="mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
                {statusText(hook.status)}
                {isLoadingStatus && <span className="spinner" aria-hidden="true" />}
              </span>
            </div>

            {hook.modelInfo !== null && (
              <>
                <hr className="divider" />
                <div className="label">MODEL</div>
                <div className="mono">{hook.modelInfo.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-3)' }}>v{hook.modelInfo.version}</div>
                <div className="mono" style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                  Classes: {hook.modelInfo.outputClasses.join(' · ')}
                </div>
              </>
            )}
          </section>

          <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
            <div className="label">UPLOAD SCAN</div>
            <UploadZone
              onFileSelected={onFileSelected}
              isDisabled={uploadDisabled}
              currentFile={selectedFile}
            />
          </section>

          <section
            style={{
              marginTop: 'auto',
              borderLeft: '3px solid var(--accent-primary)',
              paddingLeft: 'var(--sp-3)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--sp-1)',
            }}
          >
            <div className="mono" style={{ color: 'var(--accent-primary)' }}>
              🔒 LOCAL PROCESSING
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Your scan never leaves this device
            </div>
          </section>
        </aside>

        <section
          className="panel"
          style={{
            gridArea: 'center',
            position: 'relative',
            overflow: 'hidden',
            minHeight: 0,
          }}
        >
          {imageURL === null ? (
            <div
              className="corner-brackets"
              style={{
                height: '100%',
                minHeight: '320px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px dashed var(--border-green)',
                borderRadius: 'var(--radius-md)',
                flexDirection: 'column',
                gap: 'var(--sp-2)',
                color: 'var(--text-secondary)',
              }}
            >
              <div className="mono">No scan loaded</div>
              <div style={{ fontSize: '12px' }}>Upload a chest X-ray from the left panel</div>
            </div>
          ) : (
            <>
              <img
                src={imageURL}
                alt="Uploaded scan"
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                  display: 'block',
                  margin: 'auto',
                }}
              />

              <div
                style={{
                  position: 'absolute',
                  top: '10px',
                  left: '10px',
                  width: '16px',
                  height: '16px',
                  borderTop: '2px solid var(--accent-primary)',
                  borderLeft: '2px solid var(--accent-primary)',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: '10px',
                  right: '10px',
                  width: '16px',
                  height: '16px',
                  borderTop: '2px solid var(--accent-primary)',
                  borderRight: '2px solid var(--accent-primary)',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  bottom: '10px',
                  left: '10px',
                  width: '16px',
                  height: '16px',
                  borderBottom: '2px solid var(--accent-primary)',
                  borderLeft: '2px solid var(--accent-primary)',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  bottom: '10px',
                  right: '10px',
                  width: '16px',
                  height: '16px',
                  borderBottom: '2px solid var(--accent-primary)',
                  borderRight: '2px solid var(--accent-primary)',
                }}
              />

              {hook.status === 'processing' && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'rgba(0,0,0,0.7)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <div className="spinner spinner-lg" />
                  <span className="mono" style={{ marginTop: 'var(--sp-3)' }}>
                    ANALYZING...
                  </span>
                </div>
              )}

              {hook.status === 'complete' && hasHeatmap && (
                <button
                  type="button"
                  className="badge badge-green"
                  style={{
                    position: 'absolute',
                    top: '10px',
                    right: '10px',
                    cursor: 'pointer',
                    zIndex: 20,
                  }}
                  onClick={() => setShowHeatmap((prev) => !prev)}
                >
                  {showHeatmap ? 'Show Original' : 'Show Heatmap'}
                </button>
              )}

              {showHeatmap && hasHeatmap && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'rgba(0,0,0,0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 'var(--sp-3)',
                    zIndex: 15,
                  }}
                >
                  <GradCAMViewer embedded imageUrl={imageURL} heatmap={heatmap ?? undefined} className="w-full h-full" />
                </div>
              )}

              {selectedFileMeta !== null && (
                <div
                  style={{
                    position: 'absolute',
                    left: '10px',
                    right: '10px',
                    bottom: '10px',
                    background: 'rgba(0,0,0,0.55)',
                    border: '1px solid var(--border-1)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '4px 8px',
                  }}
                >
                  <div className="mono" style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                    {selectedFileMeta}
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        <section style={{ gridArea: 'right', minHeight: 0 }}>
          <SystemPanel
            status={hook.status}
            result={hook.result}
            modelInfo={hook.modelInfo}
            error={hook.error}
            logs={hook.logs}
            onReset={hook.reset}
          />
        </section>

        <section style={{ gridArea: 'logs', minHeight: 0 }}>
          <LogPanel logs={hook.logs} />
        </section>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .analysis-grid {
            grid-template-columns: 1fr !important;
            grid-template-rows: auto !important;
            grid-template-areas:
              "left"
              "center"
              "right"
              "logs" !important;
            overflow: visible;
          }
        }
      `}</style>
    </div>
  );
}
