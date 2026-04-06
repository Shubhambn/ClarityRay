'use client';

import type { SafeResult } from '@/lib/clarity/postprocess';
import type { ClarityRayStatus } from '@/hooks/useClarityRay';
import { usePersona, type Persona } from '@/lib/persona/context';

interface SystemLog {
  id: string;
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
}

interface ModelInfo {
  id: string;
  name: string;
  version: string;
  inputShape: number[];
  outputClasses: string[];
  bodypart: string;
  modality: string;
  thresholds?: {
    possible_finding?: number;
    low_confidence?: number;
    validation_status?: string;
  };
}

interface SystemPanelProps {
  status: ClarityRayStatus;
  result: SafeResult | null;
  modelInfo: ModelInfo | null;
  error: string | null;
  logs: SystemLog[];
  onReset: () => void;
}

function PersonaBadge({ persona }: { persona: Persona }) {
  if (persona === 'researcher') {
    return <span className="badge badge-blue">RESEARCHER</span>;
  }
  if (persona === 'doctor') {
    return <span className="badge badge-green">DOCTOR</span>;
  }
  if (persona === 'patient') {
    return <span className="badge badge-muted">PATIENT</span>;
  }
  return <span className="badge badge-amber">NO PERSONA</span>;
}

function loadingMessage(status: ClarityRayStatus): string {
  switch (status) {
    case 'loading_manifest':
      return 'Connecting to model registry...';
    case 'loading_spec':
      return 'Reading model specification...';
    case 'downloading_model':
      return 'Downloading model weights...';
    case 'verifying_model':
      return 'Verifying model integrity...';
    default:
      return '';
  }
}

function ProbabilityBars({
  modelInfo,
}: {
  modelInfo: ModelInfo;
}) {
  return (
    <div>
      <div className="label" style={{ marginBottom: 'var(--space-2)' }}>
        OUTPUT PROBABILITIES
      </div>
      <div className="panel-sm">
        <p className="mono" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
          Raw per-class probabilities are not available in current result payload.
        </p>
      </div>
    </div>
  );
}

export default function SystemPanel(props: SystemPanelProps) {
  const { status, result, modelInfo, error, logs, onReset } = props;
  void logs;

  const { persona } = usePersona();

  const possibleThreshold = modelInfo?.thresholds?.possible_finding;
  const lowConfThreshold = modelInfo?.thresholds?.low_confidence;

  const STATUS_TEXT: Record<ClarityRayStatus, string> = {
    idle: 'Awaiting scan',
    loading_manifest: 'Initializing...',
    loading_spec: 'Loading specification...',
    downloading_model: 'Downloading model...',
    verifying_model: 'Verifying integrity...',
    ready: 'System ready',
    processing: 'Analyzing...',
    complete: 'Analysis complete',
    error: 'System error',
  };

  const LOADING_STATUSES = new Set<ClarityRayStatus>([
    'loading_manifest',
    'loading_spec',
    'downloading_model',
    'verifying_model',
  ]);

  return (
    <div
      className="panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
        height: '100%',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span className="label">ANALYSIS OUTPUT</span>
        <PersonaBadge persona={persona} />
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
          padding: 'var(--space-3)',
          background: 'var(--bg-elevated)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-default)',
        }}
      >
        <div className="row-between">
          <span className="label">STATUS</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            {LOADING_STATUSES.has(status) && <div className="spinner" />}
            <span className="mono">{STATUS_TEXT[status]}</span>
          </div>
        </div>

        <div className="row-between">
          <span className="label">MODEL</span>
          <span className="mono">{modelInfo?.name ?? '—'}</span>
        </div>
      </div>

      {status !== 'complete' && status !== 'error' && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'var(--space-3)',
          }}
        >
          {status === 'ready' && (
            <>
              <svg
                width={20}
                height={20}
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden
              >
                <path
                  d="M16.667 5L7.5 14.167 3.333 10"
                  stroke="var(--accent-primary)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="mono" style={{ color: 'var(--text-accent)' }}>
                Upload an image to begin
              </span>
            </>
          )}

          {LOADING_STATUSES.has(status) && (
            <>
              <div className="spinner spinner-lg" />
              <span className="mono" style={{ color: 'var(--text-secondary)' }}>
                {loadingMessage(status)}
              </span>
            </>
          )}

          {status === 'idle' && (
            <span className="mono" style={{ color: 'var(--text-tertiary)' }}>
              Awaiting initialization
            </span>
          )}

          {status === 'processing' && (
            <>
              <div className="spinner spinner-lg" />
              <span className="mono">Running inference...</span>
            </>
          )}
        </div>
      )}

      {status === 'complete' && result !== null && (() => {
        let cardBg: string;
        let cardBorder: string;
        if (result.safetyTier === 'possible_finding') {
          cardBg = 'rgba(239,68,68,0.08)';
          cardBorder = 'rgba(239,68,68,0.25)';
        } else if (result.safetyTier === 'low_confidence') {
          cardBg = 'rgba(245,158,11,0.08)';
          cardBorder = 'rgba(245,158,11,0.25)';
        } else {
          cardBg = 'var(--accent-primary-glow)';
          cardBorder = 'var(--border-accent)';
        }

        let doctorDisclaimerBorderLeft: string;
        if (result.safetyTier === 'possible_finding') {
          doctorDisclaimerBorderLeft = '3px solid var(--status-danger)';
        } else if (result.safetyTier === 'low_confidence') {
          doctorDisclaimerBorderLeft = '3px solid var(--status-warning)';
        } else {
          doctorDisclaimerBorderLeft = '3px solid var(--status-normal)';
        }

        return (
          <>
            <div
              style={{
                background: cardBg,
                border: `1px solid ${cardBorder}`,
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-4)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                }}
              >
                <p
                  style={{
                    fontSize: '18px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    margin: 0,
                  }}
                >
                  {result.safetyTier === 'possible_finding' && '⚠ Possible Finding'}
                  {result.safetyTier === 'low_confidence' && '○ Low Confidence'}
                  {result.safetyTier === 'no_finding' && '✓ No Finding'}
                </p>
                {result.safetyTier === 'possible_finding' && (
                  <span className="badge badge-red">POSSIBLE</span>
                )}
                {result.safetyTier === 'low_confidence' && (
                  <span className="badge badge-amber">LOW CONF</span>
                )}
                {result.safetyTier === 'no_finding' && (
                  <span className="badge badge-green">NORMAL</span>
                )}
              </div>
              <span className="mono" style={{ marginTop: 'var(--space-1)', display: 'block' }}>
                {result.confidencePercent}% confidence
              </span>
            </div>

            {persona === 'researcher' && (
              <>
                {modelInfo !== null && <ProbabilityBars modelInfo={modelInfo} />}

                <div>
                  <div className="label" style={{ marginBottom: 'var(--space-2)' }}>
                    THRESHOLDS
                  </div>
                  <div className="panel-sm">
                    <div className="row-between">
                      <span className="mono" style={{ color: 'var(--text-tertiary)' }}>
                        possible_finding
                      </span>
                      <span className="mono">{possibleThreshold ?? 'missing'}</span>
                    </div>
                    <div className="row-between" style={{ marginTop: 'var(--space-2)' }}>
                      <span className="mono" style={{ color: 'var(--text-tertiary)' }}>
                        low_confidence
                      </span>
                      <span className="mono">{lowConfThreshold ?? 'missing'}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="label" style={{ marginBottom: 'var(--space-2)' }}>
                    METADATA
                  </div>
                  <div className="panel-sm">
                    {(
                      [
                        ['Input', modelInfo?.inputShape?.join('×') ?? '—'],
                        ['Activation', 'softmax'],
                        ['Model ID', modelInfo?.id ?? '—'],
                      ] as const
                    ).map(([key, val]) => (
                      <div key={key} className="row-between" style={{ marginBottom: 'var(--space-1)' }}>
                        <span className="mono" style={{ color: 'var(--text-tertiary)' }}>
                          {key}
                        </span>
                        <span className="mono">{val}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="label" style={{ marginBottom: 'var(--space-1)' }}>SUMMARY</div>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {result.plainSummary}
                  </p>
                </div>

                <div
                  style={{
                    background: 'rgba(245,158,11,0.06)',
                    border: '1px solid rgba(245,158,11,0.2)',
                    borderLeft: '3px solid var(--status-warning)',
                    borderRadius: 'var(--radius-lg)',
                    padding: 'var(--space-3) var(--space-4)',
                  }}
                >
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {result.disclaimer}
                  </p>
                </div>
              </>
            )}

            {persona === 'doctor' && (
              <>
                <div>
                  <p style={{ fontSize: '16px', fontWeight: 600 }}>{result.primaryFinding}</p>
                  <span className="mono">Confidence: {result.confidencePercent}%</span>
                </div>

                {modelInfo !== null && <ProbabilityBars modelInfo={modelInfo} />}

                <div>
                  <div className="label" style={{ marginBottom: 'var(--space-2)' }}>
                    INTERPRETATION
                  </div>
                  <div className="panel-sm">
                    <p style={{ fontSize: '13px' }}>
                      {result.safetyTier === 'possible_finding'
                        ? 'High-probability pattern detected. Radiologist review recommended.'
                        : result.safetyTier === 'low_confidence'
                          ? 'Weak signal detected. Clinical correlation recommended.'
                          : 'No significant abnormality pattern identified by the model.'}
                    </p>
                  </div>
                </div>

                <div>
                  <div className="label" style={{ marginBottom: 'var(--space-1)' }}>
                    CLINICAL SUMMARY
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {result.plainSummary}
                  </p>
                </div>

                <div
                  style={{
                    background: 'rgba(245,158,11,0.06)',
                    border: '1px solid rgba(245,158,11,0.2)',
                    borderLeft: doctorDisclaimerBorderLeft,
                    borderRadius: 'var(--radius-lg)',
                    padding: 'var(--space-3) var(--space-4)',
                  }}
                >
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {result.disclaimer}
                  </p>
                </div>
              </>
            )}

            {(persona === 'patient' || persona === null) && (
              <>
                <div style={{ textAlign: 'center', padding: 'var(--space-4) 0' }}>
                  <p style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>
                    {result.safetyTier === 'possible_finding'
                      ? 'Something may need medical attention'
                      : result.safetyTier === 'low_confidence'
                        ? 'The result was inconclusive'
                        : 'Nothing concerning was detected'}
                  </p>
                  <p
                    style={{
                      fontSize: '13px',
                      color: 'var(--text-secondary)',
                      marginTop: 'var(--space-2)',
                    }}
                  >
                    {result.safetyTier === 'possible_finding'
                      ? 'The AI found a pattern that may be significant.'
                      : result.safetyTier === 'low_confidence'
                        ? 'The AI could not make a confident assessment.'
                        : 'The AI did not find signs of concern.'}
                  </p>
                </div>

                <div className="panel-sm">
                  <p style={{ fontWeight: 500, fontSize: '13px', marginBottom: 'var(--space-2)' }}>
                    What should I do?
                  </p>
                  <ul
                    style={{
                      fontSize: '13px',
                      color: 'var(--text-secondary)',
                      paddingLeft: 'var(--space-4)',
                      lineHeight: 1.8,
                    }}
                  >
                    <li>This is a screening tool, not a diagnosis.</li>
                    <li>Always consult your physician about your health.</li>
                    {result.safetyTier === 'possible_finding' && (
                      <li>Consider contacting your doctor soon.</li>
                    )}
                  </ul>
                </div>

                <div
                  style={{
                    background: 'rgba(245,158,11,0.08)',
                    border: '1px solid rgba(245,158,11,0.25)',
                    borderRadius: 'var(--radius-lg)',
                    padding: 'var(--space-3) var(--space-4)',
                  }}
                >
                  <p style={{ fontSize: '13px', fontWeight: 600, color: '#fbbf24', margin: 0 }}>
                    THIS IS NOT A DIAGNOSIS
                  </p>
                  <p
                    style={{
                      fontSize: '12px',
                      color: 'var(--text-secondary)',
                      marginTop: 'var(--space-1)',
                      margin: 0,
                    }}
                  >
                    Always consult a licensed physician for medical advice.
                  </p>
                </div>
              </>
            )}
          </>
        );
      })()}

      {status === 'error' && (
        <div
          style={{
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-4)',
          }}
        >
          <p
            style={{
              color: 'var(--status-danger)',
              fontWeight: 500,
              marginBottom: 'var(--space-2)',
            }}
          >
            Analysis Error
          </p>
          <p className="mono" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            {error !== null ? error : 'Error state set but no error details were provided.'}
          </p>
          <button
            type="button"
            className="btn btn-danger"
            style={{ marginTop: 'var(--space-3)' }}
            onClick={onReset}
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
