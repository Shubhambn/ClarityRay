'use client';

import type { ClarityRayStatus } from '@/hooks/useClarityRay';
import type { SafeResult } from '@/lib/clarity/postprocess';
import { usePersona } from '@/lib/persona/context';

interface SystemPanelProps {
  status: ClarityRayStatus;
  result: SafeResult | null;
}

function SafetyBadge({ tier }: { tier: SafeResult['safetyTier'] }) {
  const styles: Record<string, React.CSSProperties> = {
    possible_finding: {
      background: 'rgba(239,68,68,0.12)',
      border: '1px solid rgba(239,68,68,0.4)',
      color: '#fca5a5',
    },
    low_confidence: {
      background: 'rgba(250,204,21,0.1)',
      border: '1px solid rgba(250,204,21,0.35)',
      color: '#fef08a',
    },
    no_finding: {
      background: 'rgba(34,197,94,0.1)',
      border: '1px solid rgba(34,197,94,0.3)',
      color: '#86efac',
    },
  };

  const labels: Record<string, string> = {
    possible_finding: 'POSSIBLE FINDING',
    low_confidence: 'LOW CONFIDENCE',
    no_finding: 'NO FINDING',
  };

  return (
    <span
      className="mono"
      style={{
        ...styles[tier],
        padding: '3px 10px',
        borderRadius: '4px',
        fontSize: '10px',
        letterSpacing: '0.1em',
        display: 'inline-block',
      }}
    >
      {labels[tier]}
    </span>
  );
}

function ConfidenceBar({ percent, tier }: { percent: number; tier: SafeResult['safetyTier'] }) {
  const barColor = tier === 'possible_finding'
    ? '#ef4444'
    : tier === 'low_confidence'
    ? '#facc15'
    : 'var(--accent-primary)';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <p className="mono" style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Confidence
        </p>
        <p className="mono" style={{ fontSize: '12px', color: 'var(--text-primary)' }}>
          {percent}%
        </p>
      </div>
      <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${percent}%`,
          background: barColor,
          borderRadius: '2px',
          transition: 'width 0.4s ease',
        }} />
      </div>
    </div>
  );
}

export function SystemPanel({ status, result }: SystemPanelProps) {
  const { persona } = usePersona();

  const isProcessing = status === 'processing';
  const isIdle = !result && !isProcessing && status !== 'error';

  return (
    <div
      className="panel"
      style={{
        width: '320px',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        padding: '16px',
        overflowY: 'auto',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p className="mono" style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-secondary)' }}>
          ANALYSIS
        </p>
        <span className="mono" style={{ fontSize: '9px', color: 'var(--text-secondary)', opacity: 0.6 }}>
          SCREENING ONLY
        </span>
      </div>

      {/* Processing state */}
      {isProcessing && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '14px', height: '14px',
            border: '2px solid rgba(34,197,94,0.15)',
            borderTop: '2px solid var(--accent-primary)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            flexShrink: 0,
          }} />
          <p className="mono" style={{ fontSize: '12px', color: 'var(--text-primary)' }}>Running inference...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Idle state */}
      {isIdle && (
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)' }}>
          Upload a scan and run analysis to see results.
        </p>
      )}

      {/* Results */}
      {result && (
        <>
          {/* Safety badge */}
          <div>
            <SafetyBadge tier={result.safetyTier} />
          </div>

          {/* Primary finding */}
          <div>
            <p className="mono" style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              PRIMARY FINDING
            </p>
            <p style={{
              fontSize: '22px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-ui)',
              lineHeight: 1.2,
            }}>
              {result.primaryFinding}
            </p>
          </div>

          {/* Confidence bar — hidden from patient persona? No, confidence % is ok for patient too since it's framed safely */}
          <ConfidenceBar percent={result.confidencePercent} tier={result.safetyTier} />

          {/* Plain summary — always visible */}
          <div style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '6px',
            padding: '12px',
          }}>
            <p className="mono" style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              {persona === 'doctor' ? 'CLINICAL INTERPRETATION' : persona === 'researcher' ? 'RESULT SUMMARY' : 'WHAT THIS MEANS'}
            </p>
            <p style={{ fontSize: '13px', color: 'var(--text-primary)', fontFamily: 'var(--font-ui)', lineHeight: 1.6 }}>
              {result.plainSummary}
            </p>
          </div>

          {/* Researcher: raw probability % */}
          {(persona === 'researcher' || persona === 'doctor') && (
            <div style={{ border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '10px 12px' }}>
              <p className="mono" style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                RAW CONFIDENCE
              </p>
              <p className="mono" style={{ fontSize: '16px', color: 'var(--text-mono)' }}>
                {result.confidencePercent}%
              </p>
              <p className="mono" style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Safety tier: {result.safetyTier.replace('_', ' ')}
              </p>
            </div>
          )}

          {/* Disclaimer — always visible */}
          <div style={{
            background: 'rgba(234,179,8,0.06)',
            border: '1px solid rgba(234,179,8,0.25)',
            borderRadius: '6px',
            padding: '10px 12px',
          }}>
            <p style={{ fontSize: '11px', color: '#fef08a', fontFamily: 'var(--font-ui)', lineHeight: 1.6, opacity: 0.9 }}>
              {result.disclaimer}
            </p>
          </div>
        </>
      )}

      {/* Static disclaimer when idle */}
      {!result && (
        <div style={{
          background: 'rgba(234,179,8,0.05)',
          border: '1px solid rgba(234,179,8,0.2)',
          borderRadius: '6px',
          padding: '10px 12px',
        }}>
          <p style={{ fontSize: '11px', color: '#fef08a', fontFamily: 'var(--font-ui)', lineHeight: 1.6, opacity: 0.8 }}>
            This is a screening tool only. Not a diagnosis. Always consult a qualified physician.
          </p>
        </div>
      )}
    </div>
  );
}
