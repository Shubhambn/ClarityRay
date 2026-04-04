'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useClarityRay } from '@/hooks/useClarityRay';
import { usePersona } from '@/lib/persona/context';
import { ConsentModal } from '@/components/ConsentModal';
import { ControlPanel } from '@/components/analysis/ControlPanel';
import { ScanViewer } from '@/components/analysis/ScanViewer';
import SystemPanel from '@/components/analysis/SystemPanel';
import { LogPanel } from '@/components/analysis/LogPanel';
import type { HeatmapData } from '@/lib/clarity/postprocess';

// ─── Constants ────────────────────────────────────────────────────────────────

const CONSENT_KEY = 'clarityray_consent_v1';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AnalysisPage() {
  const router = useRouter();
  const { persona, isSet: personaSet } = usePersona();
  const { status, result, error, modelInfo, logs, runAnalysis, reset } = useClarityRay();

  // Consent gate — checked on every mount
  const [consentGiven, setConsentGiven] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem(CONSENT_KEY);
    setConsentGiven(stored === 'accepted');
  }, []);

  // Track selected file and its object URL for the scan viewer
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const prevUrlRef = useRef<string | null>(null);

  // Build object URL whenever selected file changes
  useEffect(() => {
    // Revoke previous URL to avoid memory leaks
    if (prevUrlRef.current) {
      URL.revokeObjectURL(prevUrlRef.current);
      prevUrlRef.current = null;
    }

    if (!selectedFile) {
      setImageUrl(null);
      return;
    }

    const url = URL.createObjectURL(selectedFile);
    prevUrlRef.current = url;
    setImageUrl(url);

    return () => {
      URL.revokeObjectURL(url);
      prevUrlRef.current = null;
    };
  }, [selectedFile]);

  // Extract heatmap from result when complete
  const heatmapRef = useRef<HeatmapData | undefined>(undefined);

  // The hook doesn't expose heatmap directly; it's not in the hook contract.
  // GradCAMViewer is shown when status === complete using the imageUrl,
  // and heatmap is only available if we generate it. Since the hook contract
  // doesn't return heatmap, we pass no heatmap and let ScanViewer skip toggle.
  // (GradCAMViewer handles null gracefully.)

  const handleRun = useCallback(
    async (file: File): Promise<void> => {
      setSelectedFile(file);
      await runAnalysis(file);
    },
    [runAnalysis],
  );

  const handleClear = useCallback(() => {
    setSelectedFile(null);
    reset();
  }, [reset]);

  // When consent modal grants consent, update local state
  const handleConsentAccepted = useCallback(() => {
    setConsentGiven(true);
  }, []);

  return (
    <>
      {/* Consent gate — wraps a ConsentModal that checks its own storage key.
          We also watch for the storage key ourselves so the banner is accurate. */}
      {!consentGiven && (
        <ConsentModalWithCallback onAccepted={handleConsentAccepted} />
      )}

      <div
        className="grid-bg"
        style={{
          minHeight: '100vh',
          padding: '80px 20px 20px', // 80px top to clear TopBar
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          boxSizing: 'border-box',
        }}
      >
        {/* Error banner */}
        {status === 'error' && error && (
          <div style={{
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: '8px',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}>
            <p className="mono" style={{ fontSize: '12px', color: '#fca5a5' }}>
              {error}
            </p>
            <button
              onClick={() => router.refresh()}
              style={{
                background: 'rgba(239,68,68,0.15)',
                border: '1px solid rgba(239,68,68,0.4)',
                color: '#fca5a5',
                minHeight: '44px',
                minWidth: '44px',
                padding: '10px 14px',
                borderRadius: '4px',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                cursor: 'pointer',
                flexShrink: 0,
                letterSpacing: '0.04em',
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Persona banner — non-blocking */}
        {!personaSet && (
          <div style={{
            background: 'rgba(34,197,94,0.05)',
            border: '1px solid var(--border-accent)',
            borderRadius: '8px',
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)', flex: 1 }}>
              Select your view type for better results →
            </p>
            <Link
              href="/onboarding"
              style={{
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--accent-primary)',
                textDecoration: 'none',
                border: '1px solid var(--border-accent)',
                padding: '3px 12px',
                borderRadius: '4px',
                flexShrink: 0,
              }}
            >
              Set up view
            </Link>
          </div>
        )}

        {/* Three-column layout */}
        <div
          id="analysis-columns"
          className="analysis-columns"
          style={{
            display: 'flex',
            gap: '12px',
            alignItems: 'flex-start',
            flex: 1,
          }}
        >
          {/* Column 1 — Control Panel (280px fixed) */}
          <div className="analysis-col analysis-col--left">
            <ControlPanel
              status={status}
              modelInfo={modelInfo}
              error={error}
              onRun={handleRun}
              onClear={handleClear}
            />
          </div>

          {/* Column 2 — Scan Viewer (flex 1) */}
          <div className="analysis-col analysis-col--center">
            <ScanViewer
              status={status}
              imageUrl={imageUrl}
              heatmap={heatmapRef.current}
              fileName={selectedFile?.name}
              fileSize={selectedFile?.size}
            />
          </div>

          {/* Column 3 — System Panel (320px fixed) */}
          <div className="analysis-col analysis-col--right">
            <SystemPanel
              status={status}
              result={result}
              modelInfo={modelInfo}
              error={error}
              logs={logs}
              onReset={reset}
            />
          </div>
        </div>

        {/* Bottom strip — Log Panel */}
        <LogPanel logs={logs} />
      </div>

      {/* Mobile: single column via responsive overrides */}
      <style>{`
        .analysis-columns {
          min-width: 0;
        }

        .analysis-col {
          min-width: 0;
          display: flex;
          align-self: stretch;
        }

        .analysis-col--left {
          flex: 0 0 280px;
        }

        .analysis-col--center {
          flex: 1 1 auto;
        }

        .analysis-col--right {
          flex: 0 0 320px;
        }

        @media (max-width: 767px) {
          #analysis-columns {
            flex-direction: column !important;
            align-items: stretch !important;
          }

          .analysis-col--left,
          .analysis-col--center,
          .analysis-col--right {
            flex: 1 1 100% !important;
            width: 100% !important;
          }
        }
      `}</style>
    </>
  );
}

// ─── ConsentModalWithCallback ─────────────────────────────────────────────────
// Thin wrapper around ConsentModal that fires a callback when consent is accepted.
// We watch localStorage via a polling-free approach: ConsentModal writes the key,
// we attach a storage event listener to pick it up.

interface ConsentModalWithCallbackProps {
  onAccepted: () => void;
}

function ConsentModalWithCallback({ onAccepted }: ConsentModalWithCallbackProps) {
  useEffect(() => {
    function onStorage(evt: StorageEvent) {
      if (evt.key === CONSENT_KEY && evt.newValue === 'accepted') {
        onAccepted();
      }
    }

    window.addEventListener('storage', onStorage);

    // Also poll once in case modal sets it synchronously (same-tab doesn't fire storage event)
    const interval = setInterval(() => {
      if (localStorage.getItem(CONSENT_KEY) === 'accepted') {
        onAccepted();
        clearInterval(interval);
      }
    }, 300);

    return () => {
      window.removeEventListener('storage', onStorage);
      clearInterval(interval);
    };
  }, [onAccepted]);

  return <ConsentModal />;
}
