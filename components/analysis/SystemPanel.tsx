'use client';

import { useState } from 'react';
import type { SafeResult, HeatmapData } from '@/lib/clarity/postprocess';
import type { ClarityRayStatus, ModelInfo } from '@/hooks/useClarityRay';
import { usePersona, type Persona } from '@/lib/persona/context';
import { ExportButton } from '@/components/ExportButton';

interface SystemPanelProps {
  status: ClarityRayStatus;
  result: SafeResult | null;
  modelInfo: ModelInfo | null;
  error: string | null;
  onReset: () => void;
  explainabilityEnabled?: boolean;
  explanationMethod?: string | null;
  explanationDisclaimer?: string | null;
  explanationActive?: boolean;
  explanationProgress?: number | null;
  heatmapMode?: 'model' | 'contrast' | 'none';
  imageUrl?: string | null;
  activeHeatmap?: HeatmapData | null;
}

function ExplainabilityCard({
  persona,
  enabled,
  method,
  disclaimer,
  active,
  progress,
  mode,
}: {
  persona: Persona;
  enabled: boolean;
  method: string | null;
  disclaimer: string | null;
  active: boolean;
  progress: number | null;
  mode: 'model' | 'contrast' | 'none';
}) {
  if (persona === 'patient') {
    return null;
  }

  return (
    <div>
      <div className="label" style={{ marginBottom: 'var(--space-2)' }}>
        EXPLAINABILITY
      </div>
      <div className="panel-sm" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <div className="row-between">
          <span className="mono" style={{ color: 'var(--text-tertiary)' }}>Active Overlay</span>
          {mode === 'model' && enabled ? (
            <span className="badge badge-green font-mono">MODEL-BASED HEATMAP</span>
          ) : mode === 'contrast' ? (
            <span className="badge badge-amber font-mono">CONTRAST OVERLAY</span>
          ) : (
            <span className="badge badge-muted font-mono">NONE</span>
          )}
        </div>

        {mode === 'model' && enabled && (
          <>
            <div className="row-between">
              <span className="mono" style={{ color: 'var(--text-tertiary)' }}>Method</span>
              <span className="mono">{method === 'occlusion_sensitivity' ? 'Occlusion Sensitivity' : '—'}</span>
            </div>
            {active && progress !== null && (
              <div className="row-between">
                <span className="mono" style={{ color: 'var(--text-tertiary)' }}>Status</span>
                <span className="mono" style={{ color: 'var(--accent-primary)' }}>Computing ({progress}%)</span>
              </div>
            )}
            {disclaimer && (
              <p className="mono" style={{ fontSize: '10px', color: 'var(--text-tertiary)', margin: 'var(--space-1) 0 0 0', lineHeight: 1.4 }}>
                {disclaimer}
              </p>
            )}
          </>
        )}

        {mode === 'contrast' && (
          <p className="mono" style={{ fontSize: '10px', color: 'var(--text-tertiary)', margin: 'var(--space-1) 0 0 0', lineHeight: 1.4 }}>
            ℹ Contrast overlay highlights edges and luminance in the raw image. It is synthetic — not derived from model inference.
          </p>
        )}

        {!enabled && mode === 'model' && (
          <p className="mono" style={{ fontSize: '10px', color: 'var(--text-tertiary)', margin: 'var(--space-1) 0 0 0', lineHeight: 1.4 }}>
            ℹ No model-based explanation is configured or available for this model.
          </p>
        )}
      </div>
    </div>
  );
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

function channelMode(inputShape: number[] | undefined): string {
  const channels = inputShape?.[1];
  if (channels === 1) return 'Grayscale (1)';
  if (channels === 3) return 'RGB (3)';
  return channels !== undefined ? `${channels}` : '—';
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

function ProbabilityBars({ result }: { result: SafeResult }) {
  return (
    <div>
      <div className="label" style={{ marginBottom: 'var(--space-2)' }}>
        OUTPUT PROBABILITIES
      </div>
      <div className="panel-sm" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {result.classProbabilities.map(({ label, probability }) => (
          <div key={label}>
            <div className="row-between" style={{ marginBottom: '2px' }}>
              <span className="mono" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                {label}
              </span>
              <span className="mono" style={{ fontSize: '11px' }}>
                {(probability * 100).toFixed(1)}%
              </span>
            </div>
            <div
              style={{
                height: '4px',
                background: 'var(--border-default)',
                borderRadius: '2px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${(probability * 100).toFixed(2)}%`,
                  background: 'var(--accent-primary)',
                  borderRadius: '2px',
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Multilabel / multiclass ranked findings: every label the interpreter reported
 * at/over its threshold, highest probability first. Suspicious hits are marked
 * and bar-coloured so a clinician scans severity at a glance. Faithful — nothing
 * is collapsed; an empty list means no label crossed its threshold.
 */
function FindingsList({ findings }: { findings: NonNullable<SafeResult['findings']> }) {
  if (findings.length === 0) {
    return (
      <div>
        <div className="label" style={{ marginBottom: 'var(--space-2)' }}>
          FINDINGS
        </div>
        <div className="panel-sm">
          <span className="mono" style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
            No label reached its reporting threshold.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="label" style={{ marginBottom: 'var(--space-2)' }}>
        FINDINGS ({findings.length})
      </div>
      <div className="panel-sm" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {findings.map(({ label, probability, suspicious }) => (
          <div key={label}>
            <div className="row-between" style={{ marginBottom: '2px' }}>
              <span
                className="mono"
                style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <span
                  aria-hidden="true"
                  style={{ color: suspicious ? 'var(--status-danger)' : 'var(--text-tertiary)' }}
                >
                  ●
                </span>
                {label}
              </span>
              <span className="mono" style={{ fontSize: '11px' }}>
                {(probability * 100).toFixed(1)}%
              </span>
            </div>
            <div
              style={{
                height: '4px',
                background: 'var(--border-default)',
                borderRadius: '2px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${(probability * 100).toFixed(2)}%`,
                  background: suspicious ? 'var(--status-danger)' : 'var(--accent-primary)',
                  borderRadius: '2px',
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Regression readout: the raw measured value with its units and, when the spec
 * declares a range, a gauge placing the value within [min, max]. No probability
 * framing — a regression model outputs a measurement, not a confidence.
 */
function RegressionReadout({ result }: { result: SafeResult }) {
  const value = result.value ?? result.classProbabilities[0]?.probability ?? 0;
  const units = result.units ?? null;
  const range = result.range ?? null;

  let gaugePct: number | null = null;
  if (range && range[1] > range[0]) {
    gaugePct = Math.min(1, Math.max(0, (value - range[0]) / (range[1] - range[0]))) * 100;
  }

  return (
    <div>
      <div className="label" style={{ marginBottom: 'var(--space-2)' }}>
        MEASURED VALUE
      </div>
      <div className="panel-sm" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
          <span style={{ fontSize: '24px', fontWeight: 600, color: 'var(--text-primary)' }}>
            {value}
          </span>
          {units && (
            <span className="mono" style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
              {units}
            </span>
          )}
        </div>

        {gaugePct !== null && range && (
          <div>
            <div
              style={{
                position: 'relative',
                height: '6px',
                background: 'var(--border-default)',
                borderRadius: '3px',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: '-3px',
                  left: `calc(${gaugePct.toFixed(2)}% - 1px)`,
                  width: '2px',
                  height: '12px',
                  background: 'var(--accent-primary)',
                  borderRadius: '1px',
                }}
              />
            </div>
            <div className="row-between" style={{ marginTop: '4px' }}>
              <span className="mono" style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>
                {range[0]}
              </span>
              <span className="mono" style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>
                {range[1]}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Researcher-facing raw output table. For regression `classProbabilities` holds
 * the raw values per quantity (not probabilities), so they are shown verbatim.
 */
function RawOutputs({ result }: { result: SafeResult }) {
  return (
    <div>
      <div className="label" style={{ marginBottom: 'var(--space-2)' }}>
        RAW OUTPUTS
      </div>
      <div className="panel-sm">
        {result.classProbabilities.map(({ label, probability }) => (
          <div key={label} className="row-between" style={{ marginBottom: 'var(--space-1)' }}>
            <span className="mono" style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
              {label}
            </span>
            <span className="mono" style={{ fontSize: '11px' }}>{probability}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Segmentation coverage: each class with the fraction of the image its mask
 * covers, colour-coded by whether it is suspicious. Coverage 0 classes are
 * dropped from the list but never from `classProbabilities`.
 */
function SegmentationCoverage({ segmentation }: { segmentation: NonNullable<SafeResult['segmentation']> }) {
  const present = segmentation.classes
    .filter((c) => c.coverage > 0)
    .sort((a, b) => b.coverage - a.coverage);

  return (
    <div>
      <div className="label" style={{ marginBottom: 'var(--space-2)' }}>
        SEGMENTED REGIONS{present.length > 0 ? ` (${present.length})` : ''}
      </div>
      <div className="panel-sm" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {present.length === 0 ? (
          <span className="mono" style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
            No region crossed the segmentation threshold.
          </span>
        ) : (
          present.map(({ label, coverage, suspicious }) => (
            <div key={label}>
              <div className="row-between" style={{ marginBottom: '2px' }}>
                <span
                  className="mono"
                  style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <span
                    aria-hidden="true"
                    style={{ color: suspicious ? 'var(--status-danger)' : 'var(--text-tertiary)' }}
                  >
                    ●
                  </span>
                  {label}
                </span>
                <span className="mono" style={{ fontSize: '11px' }}>{(coverage * 100).toFixed(1)}%</span>
              </div>
              <div style={{ height: '4px', background: 'var(--border-default)', borderRadius: '2px', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${(coverage * 100).toFixed(2)}%`,
                    background: suspicious ? 'var(--status-danger)' : 'var(--accent-primary)',
                    borderRadius: '2px',
                  }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * Detection list: every reported box with its label, confidence, and normalized
 * position, ranked by score. Suspicious detections are colour-marked.
 */
function DetectionList({ detections }: { detections: NonNullable<SafeResult['detections']> }) {
  return (
    <div>
      <div className="label" style={{ marginBottom: 'var(--space-2)' }}>
        DETECTIONS{detections.length > 0 ? ` (${detections.length})` : ''}
      </div>
      <div className="panel-sm" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {detections.length === 0 ? (
          <span className="mono" style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
            No detection crossed the score threshold.
          </span>
        ) : (
          detections.map((d, i) => (
            <div key={`${d.label}-${i}`} className="row-between">
              <span
                className="mono"
                style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <span
                  aria-hidden="true"
                  style={{ color: d.suspicious ? 'var(--status-danger)' : 'var(--text-tertiary)' }}
                >
                  ▣
                </span>
                {d.label}
                <span style={{ color: 'var(--text-tertiary)' }}>
                  [{(d.box.x * 100).toFixed(0)},{(d.box.y * 100).toFixed(0)} ·{' '}
                  {(d.box.w * 100).toFixed(0)}×{(d.box.h * 100).toFixed(0)}]
                </span>
              </span>
              <span className="mono" style={{ fontSize: '11px' }}>{(d.score * 100).toFixed(1)}%</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function SystemPanel(props: SystemPanelProps) {
  const {
    status,
    result,
    modelInfo,
    error,
    onReset,
    explainabilityEnabled = false,
    explanationMethod = null,
    explanationDisclaimer = null,
    explanationActive = false,
    explanationProgress = null,
    heatmapMode = 'model',
    imageUrl = null,
    activeHeatmap = null,
  } = props;
  const { persona } = usePersona();
  const [patientQuestion, setPatientQuestion] = useState('');

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
        const task = result.task ?? 'binary';
        const isRegression = task === 'regression';
        const tier = result.safetyTier;

        // Per-tier colours shared across personas
        const tierColor =
          tier === 'possible_finding' ? 'var(--status-danger)'
          : tier === 'low_confidence' ? 'var(--status-warning)'
          : 'var(--status-normal)';
        const tierBg =
          tier === 'possible_finding' ? 'rgba(239,68,68,0.08)'
          : tier === 'low_confidence' ? 'rgba(245,158,11,0.08)'
          : 'rgba(34,197,94,0.06)';
        const tierBorder =
          tier === 'possible_finding' ? 'rgba(239,68,68,0.25)'
          : tier === 'low_confidence' ? 'rgba(245,158,11,0.25)'
          : 'rgba(34,197,94,0.2)';

        // Build a persona-tailored prompt and open ChatGPT with it
        const buildChatGPTPrompt = (): string => {
          const modelId = modelInfo?.id ?? 'unknown model';
          const bodypart = modelInfo?.bodypart ?? 'region';
          const modality = modelInfo?.modality ?? 'scan';
          const probsText = result.classProbabilities?.length
            ? result.classProbabilities
                .map(({ label, probability }) => `  ${label}: ${(probability * 100).toFixed(1)}%`)
                .join('\n')
            : null;
          const findingsText = result.findings?.length
            ? result.findings.map(f => `  - ${f.label} (${(f.probability * 100).toFixed(0)}%)`).join('\n')
            : null;

          if (persona === 'researcher') {
            return [
              `I ran a medical AI inference using model "${modelId}" (${task} classification) on a ${modality} image of the ${bodypart}.`,
              ``,
              `Model Output:`,
              `  Primary Detection: ${result.primaryFinding} — ${result.confidencePercent}% confidence`,
              `  Safety Tier: ${tier}`,
              probsText ? `Class Probabilities:\n${probsText}` : null,
              findingsText ? `Additional Findings:\n${findingsText}` : null,
              ``,
              `Please help me understand:`,
              `1. The statistical robustness of this result and what the confidence score means for a ${task} model.`,
              `2. Common failure modes or biases for deep learning models on ${modality} ${bodypart} imaging.`,
              `3. How to interpret "${result.primaryFinding}" given the model uncertainty at this confidence level.`,
              `4. What additional validation steps would strengthen or challenge this output.`,
            ].filter(Boolean).join('\n');
          }

          if (persona === 'doctor') {
            return [
              `An AI screening model ("${modelId}") analyzed a ${modality} image of the ${bodypart}.`,
              ``,
              `AI Result:`,
              `  Detected: ${result.primaryFinding}`,
              `  Confidence: ${result.confidencePercent}%`,
              `  Risk Classification: ${tier === 'possible_finding' ? 'Possible Finding' : tier === 'low_confidence' ? 'Low Confidence' : 'No Finding / Normal'}`,
              findingsText ? `Additional Patterns:\n${findingsText}` : null,
              ``,
              `As a clinician, please help me:`,
              `1. Understand the clinical significance of "${result.primaryFinding}" on ${modality} ${bodypart} imaging.`,
              `2. Suggest a differential diagnosis and relevant clinical correlation points.`,
              `3. Recommend appropriate next steps or workup (imaging, labs, referral).`,
              `4. Explain the key limitations I should communicate to the patient regarding AI-based screening.`,
            ].filter(Boolean).join('\n');
          }

          // patient / null
          return [
            `An AI health screening tool analyzed my ${bodypart} ${modality} scan.`,
            ``,
            `The AI detected: "${result.primaryFinding}"`,
            `Confidence level: ${result.confidencePercent}%`,
            ``,
            patientQuestion.trim()
              ? `My personal context / question:\n"${patientQuestion.trim()}"`
              : null,
            patientQuestion.trim() ? `` : null,
            `Please explain this to me in simple, plain language:`,
            `1. What does "${result.primaryFinding}" mean?`,
            `2. Should I be concerned? How serious could this be?`,
            patientQuestion.trim()
              ? `3. Given my personal context above, what should I specifically ask my doctor?`
              : `3. What questions should I ask my doctor?`,
            `4. What should I do next?`,
            ``,
            `Note: This is an AI screening result, not a medical diagnosis from a real doctor.`,
          ].filter(Boolean).join('\n');
        };

        const chatGPTUrl = `https://chatgpt.com/?q=${encodeURIComponent(buildChatGPTPrompt())}`;

        return (
          <div style={{ position: 'relative' }}>
            {/* ── ASK CHATGPT BUTTON ──────────────────────────────────────── */}
            <a
              href={chatGPTUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 10px',
                fontSize: '11px',
                fontWeight: 600,
                color: '#10a37f',
                background: 'rgba(16,163,127,0.08)',
                border: '1px solid rgba(16,163,127,0.3)',
                borderRadius: 'var(--radius-md)',
                textDecoration: 'none',
                letterSpacing: '0.02em',
                zIndex: 10,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 41 41" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M37.532 16.87a9.963 9.963 0 0 0-.856-8.184 10.078 10.078 0 0 0-10.855-4.835 9.964 9.964 0 0 0-6.52-3.49 10.079 10.079 0 0 0-10.48 4.963 9.967 9.967 0 0 0-6.675 4.834 10.08 10.08 0 0 0 1.24 11.817 9.965 9.965 0 0 0 .856 8.185 10.079 10.079 0 0 0 10.855 4.835 9.965 9.965 0 0 0 6.52 3.49 10.079 10.079 0 0 0 10.481-4.963 9.967 9.967 0 0 0 6.675-4.834 10.079 10.079 0 0 0-1.241-11.818zm-17.208 14.71a6.977 6.977 0 0 1-4.478-1.618l.22-.125 7.428-4.289a1.22 1.22 0 0 0 .617-1.064v-10.48l3.14 1.814a.113.113 0 0 1 .062.088v8.675a7.011 7.011 0 0 1-6.989 6.999zm-15.002-6.432a6.974 6.974 0 0 1-.833-4.693l.221.133 7.429 4.289a1.22 1.22 0 0 0 1.232 0l9.07-5.237v3.628a.114.114 0 0 1-.045.092L14.89 27.75a7.01 7.01 0 0 1-9.568-2.602zm-1.957-15.423A6.974 6.974 0 0 1 6.91 6.041l-.002.25v8.576a1.22 1.22 0 0 0 .616 1.064l9.069 5.235-3.14 1.813a.114.114 0 0 1-.106.012L5.83 18.567a7.01 7.01 0 0 1-2.465-8.842zm25.818 6.001L20.316 9.49 23.456 7.677a.114.114 0 0 1 .106-.012l7.517 4.342a7.001 7.001 0 0 1-1.085 12.638v-8.826a1.218 1.218 0 0 0-.614-1.063zm3.123-4.714-.221-.133-7.427-4.289a1.22 1.22 0 0 0-1.233 0L14.355 11.847V8.219a.114.114 0 0 1 .046-.092l7.516-4.339a7.01 7.01 0 0 1 10.413 7.258zm-19.62 6.45-3.14-1.813a.113.113 0 0 1-.062-.088v-8.675a7.01 7.01 0 0 1 11.5-5.383l-.22.125-7.428 4.289a1.22 1.22 0 0 0-.617 1.064l-.033 10.481zm1.7-3.68 4.038-2.328 4.038 2.325v4.652l-4.038 2.328-4.038-2.325V14.782z" fill="currentColor"/>
              </svg>
              Ask ChatGPT
            </a>

            {/* ── RESEARCHER ──────────────────────────────────────────────── */}
            {persona === 'researcher' && (
              <>
                {/* Compact result header: finding + confidence % */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 'var(--space-3) var(--space-4)',
                    background: tierBg,
                    border: `1px solid ${tierBorder}`,
                    borderLeft: `3px solid ${tierColor}`,
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {result.primaryFinding}
                  </span>
                  {!isRegression && (
                    <span className="mono" style={{ fontSize: '20px', fontWeight: 700, color: tierColor }}>
                      {result.confidencePercent}%
                    </span>
                  )}
                </div>

                {/* Technical output */}
                {isRegression ? (
                  <>
                    <RegressionReadout result={result} />
                    <RawOutputs result={result} />
                  </>
                ) : (
                  <>
                    <ProbabilityBars result={result} />
                    {(task === 'multilabel' || task === 'multiclass') && result.findings && (
                      <FindingsList findings={result.findings} />
                    )}
                    {task === 'segmentation' && result.segmentation && (
                      <SegmentationCoverage segmentation={result.segmentation} />
                    )}
                    {task === 'detection' && result.detections && (
                      <DetectionList detections={result.detections} />
                    )}
                  </>
                )}

                <ExplainabilityCard
                  persona={persona}
                  enabled={explainabilityEnabled}
                  method={explanationMethod}
                  disclaimer={explanationDisclaimer}
                  active={explanationActive}
                  progress={explanationProgress}
                  mode={heatmapMode}
                />

                <div>
                  <div className="label" style={{ marginBottom: 'var(--space-2)' }}>THRESHOLDS</div>
                  <div className="panel-sm">
                    <div className="row-between">
                      <span className="mono" style={{ color: 'var(--text-tertiary)' }}>possible_finding</span>
                      <span className="mono">{possibleThreshold ?? 'missing'}</span>
                    </div>
                    <div className="row-between" style={{ marginTop: 'var(--space-2)' }}>
                      <span className="mono" style={{ color: 'var(--text-tertiary)' }}>low_confidence</span>
                      <span className="mono">{lowConfThreshold ?? 'missing'}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="label" style={{ marginBottom: 'var(--space-2)' }}>METADATA</div>
                  <div className="panel-sm">
                    {(
                      [
                        ['Task', modelInfo?.task ?? '—'],
                        ['Input', modelInfo?.inputShape?.join('×') ?? '—'],
                        ['Channels', channelMode(modelInfo?.inputShape)],
                        ['Activation', modelInfo?.activation ?? '—'],
                        ['Model ID', modelInfo?.id ?? '—'],
                      ] as const
                    ).map(([key, val]) => (
                      <div key={key} className="row-between" style={{ marginBottom: 'var(--space-1)' }}>
                        <span className="mono" style={{ color: 'var(--text-tertiary)' }}>{key}</span>
                        <span className="mono">{val}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {modelInfo?.sourceModel && (
                  <div>
                    <div className="label" style={{ marginBottom: 'var(--space-2)' }}>SOURCE MODEL</div>
                    <div className="panel-sm">
                      <div className="row-between" style={{ marginBottom: 'var(--space-1)' }}>
                        <span className="mono" style={{ color: 'var(--text-tertiary)' }}>Family</span>
                        <span className="mono">{modelInfo.sourceModel.family}</span>
                      </div>
                      <div className="row-between" style={{ marginBottom: 'var(--space-1)' }}>
                        <span className="mono" style={{ color: 'var(--text-tertiary)' }}>Source</span>
                        <span className="mono" style={{ textAlign: 'right', maxWidth: '60%' }}>
                          {modelInfo.sourceModel.source}
                        </span>
                      </div>
                      <div className="row-between" style={{ marginBottom: 'var(--space-1)' }}>
                        <span className="mono" style={{ color: 'var(--text-tertiary)' }}>Outputs</span>
                        <span className="mono">
                          {modelInfo.outputClasses.length} {task === 'regression' ? 'value(s)' : 'class(es)'}
                        </span>
                      </div>
                      {modelInfo.sourceModel.selected_findings && modelInfo.sourceModel.selected_findings.length > 0 && (
                        <div className="row-between">
                          <span className="mono" style={{ color: 'var(--text-tertiary)' }}>Curated subset</span>
                          <span className="mono" style={{ textAlign: 'right', maxWidth: '60%' }}>
                            {modelInfo.sourceModel.selected_findings.join(', ')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div>
                  <div className="label" style={{ marginBottom: 'var(--space-1)' }}>SUMMARY</div>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{result.plainSummary}</p>
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
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{result.disclaimer}</p>
                </div>
              </>
            )}

            {/* ── DOCTOR ──────────────────────────────────────────────────── */}
            {persona === 'doctor' && (() => {
              const bodypart = modelInfo?.bodypart ?? 'region';
              const modality = modelInfo?.modality ?? 'scan';
              const isUnvalidated = modelInfo?.thresholds?.validation_status === 'unvalidated';

              const interpretationText =
                tier === 'possible_finding'
                  ? `Pattern consistent with "${result.primaryFinding}" identified at ${result.confidencePercent}% confidence on ${modality} of ${bodypart}. Radiologist review and clinical correlation strongly recommended.`
                  : tier === 'low_confidence'
                    ? `Weak signal detected (${result.confidencePercent}% confidence). The model did not reach the reporting threshold. Clinical correlation and follow-up imaging may be warranted.`
                    : `No significant abnormality pattern identified on ${modality} of ${bodypart} (${result.confidencePercent}% confidence). A negative AI result does not exclude disease.`;

              const actionSteps =
                tier === 'possible_finding'
                  ? [
                      'Arrange radiologist review of this scan.',
                      'Consider additional or confirmatory imaging.',
                      'Correlate with patient history and clinical presentation.',
                      'Document AI screening result in patient record.',
                    ]
                  : tier === 'low_confidence'
                    ? [
                        'Clinical correlation required before any action.',
                        'Consider repeat or follow-up imaging based on clinical context.',
                        'Interpret in conjunction with patient history.',
                      ]
                    : [
                        'No immediate action indicated by AI screening.',
                        'Routine follow-up as clinically indicated.',
                        'Correlate with patient history and clinical findings.',
                      ];

              return (
                <>
                  {/* Unvalidated model warning — safety-critical */}
                  {isUnvalidated && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-2)',
                        background: 'rgba(245,158,11,0.08)',
                        border: '1px solid rgba(245,158,11,0.3)',
                        borderLeft: '3px solid #f59e0b',
                        borderRadius: 'var(--radius-sm)',
                        padding: '6px 10px',
                      }}
                    >
                      <span style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 700 }}>⚠ UNVALIDATED MODEL</span>
                      <span className="mono" style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>
                        Not clinically validated — for research and screening support only.
                      </span>
                    </div>
                  )}

                  {/* Modality / bodypart / task context chips */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {modelInfo?.bodypart && (
                      <span className="badge badge-muted" style={{ textTransform: 'capitalize' }}>
                        {modelInfo.bodypart}
                      </span>
                    )}
                    {modelInfo?.modality && (
                      <span className="badge badge-muted" style={{ textTransform: 'capitalize' }}>
                        {modelInfo.modality}
                      </span>
                    )}
                    {modelInfo?.task && (
                      <span className="badge badge-muted" style={{ textTransform: 'capitalize' }}>
                        {modelInfo.task}
                      </span>
                    )}
                  </div>

                  {/* Clinical result card — tier-coloured */}
                  <div
                    style={{
                      background: tierBg,
                      border: `1px solid ${tierBorder}`,
                      borderLeft: `4px solid ${tierColor}`,
                      borderRadius: 'var(--radius-lg)',
                      padding: 'var(--space-4)',
                    }}
                  >
                    {/* Primary finding */}
                    <p style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 var(--space-3)' }}>
                      {result.primaryFinding}
                    </p>

                    {/* Confidence gauge */}
                    {!isRegression && (
                      <div>
                        <div className="row-between" style={{ marginBottom: '4px' }}>
                          <span className="mono" style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                            Model confidence
                          </span>
                          <span className="mono" style={{ fontSize: '13px', fontWeight: 700, color: tierColor }}>
                            {result.confidencePercent}%
                          </span>
                        </div>
                        <div style={{ height: '5px', background: 'var(--border-default)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div
                            style={{
                              height: '100%',
                              width: `${result.confidencePercent}%`,
                              background: tierColor,
                              borderRadius: '3px',
                              transition: 'width 0.4s ease',
                            }}
                          />
                        </div>
                        <div className="row-between" style={{ marginTop: '3px' }}>
                          <span className="mono" style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>0%</span>
                          <span className="mono" style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>100%</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Clinical data — multilabel/multiclass: findings list + full probability distribution */}
                  {isRegression ? (
                    <RegressionReadout result={result} />
                  ) : (task === 'multilabel' || task === 'multiclass') ? (
                    <>
                      {result.findings && <FindingsList findings={result.findings} />}
                      <ProbabilityBars result={result} />
                    </>
                  ) : task === 'segmentation' && result.segmentation ? (
                    <>
                      <SegmentationCoverage segmentation={result.segmentation} />
                      <ProbabilityBars result={result} />
                    </>
                  ) : task === 'detection' && result.detections ? (
                    <DetectionList detections={result.detections} />
                  ) : (
                    <ProbabilityBars result={result} />
                  )}

                  <ExplainabilityCard
                    persona={persona}
                    enabled={explainabilityEnabled}
                    method={explanationMethod}
                    disclaimer={explanationDisclaimer}
                    active={explanationActive}
                    progress={explanationProgress}
                    mode={heatmapMode}
                  />

                  {/* Interpretation — references actual finding, modality, bodypart */}
                  <div>
                    <div className="label" style={{ marginBottom: 'var(--space-2)' }}>INTERPRETATION</div>
                    <div className="panel-sm">
                      <p style={{ fontSize: '13px', lineHeight: 1.6, margin: 0 }}>{interpretationText}</p>
                    </div>
                  </div>

                  {/* Action steps — tiered recommendations */}
                  <div>
                    <div className="label" style={{ marginBottom: 'var(--space-2)' }}>
                      RECOMMENDED ACTION
                    </div>
                    <div
                      className="panel-sm"
                      style={{
                        borderLeft: `3px solid ${tierColor}`,
                        background: tierBg,
                        border: `1px solid ${tierBorder}`,
                        borderLeftWidth: '3px',
                      }}
                    >
                      <ul style={{ margin: 0, paddingLeft: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                        {actionSteps.map((step) => (
                          <li key={step} style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                            {step}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Clinical summary */}
                  <div>
                    <div className="label" style={{ marginBottom: 'var(--space-1)' }}>CLINICAL SUMMARY</div>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      {result.plainSummary}
                    </p>
                  </div>

                  {/* Disclaimer — coloured by tier */}
                  <div
                    style={{
                      background: tierBg,
                      border: `1px solid ${tierBorder}`,
                      borderLeft: `3px solid ${tierColor}`,
                      borderRadius: 'var(--radius-lg)',
                      padding: 'var(--space-3) var(--space-4)',
                    }}
                  >
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>{result.disclaimer}</p>
                  </div>
                </>
              );
            })()}

            {/* ── PATIENT / NO PERSONA ────────────────────────────────────── */}
            {(persona === 'patient' || persona === null) && (
              <>
                {/* Big outcome card — colour signals severity instantly */}
                <div
                  style={{
                    background: tierBg,
                    border: `1px solid ${tierBorder}`,
                    borderRadius: 'var(--radius-lg)',
                    padding: 'var(--space-6) var(--space-4)',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '20px', fontWeight: 700, color: tierColor, marginBottom: 'var(--space-1)', letterSpacing: '0.01em' }}>
                    {result.primaryFinding}
                  </div>
                  <div style={{ fontSize: '44px', fontWeight: 800, color: tierColor, lineHeight: 1, marginBottom: 'var(--space-1)' }}>
                    {result.confidencePercent}%
                  </div>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 var(--space-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    model confidence
                  </p>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
                    {tier === 'possible_finding'
                      ? 'This is what the model detected. Share this result with your doctor.'
                      : tier === 'low_confidence'
                        ? 'The model was not certain about this result. Your doctor can help interpret it.'
                        : 'This is what the model detected. Discuss with your doctor as needed.'}
                  </p>
                </div>

                {/* Personal context input — included in ChatGPT prompt */}
                <div className="panel-sm">
                  <p style={{ fontWeight: 600, fontSize: '13px', marginBottom: '6px', color: 'var(--text-primary)' }}>
                    Your personal context
                  </p>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 8px' }}>
                    Add anything relevant — age, symptoms, medical history, medications, or a specific question. This will be included when you open ChatGPT so you get a more personalised explanation.
                  </p>
                  <textarea
                    value={patientQuestion}
                    onChange={e => setPatientQuestion(e.target.value)}
                    placeholder="e.g. I'm 52 years old, have Type 2 diabetes, and have had chest tightness for the past week. Should I be worried?"
                    rows={3}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      background: 'var(--surface-raised, rgba(255,255,255,0.04))',
                      border: '1px solid var(--border-subtle, rgba(255,255,255,0.1))',
                      borderRadius: 'var(--radius-md)',
                      color: 'var(--text-primary)',
                      fontSize: '12px',
                      lineHeight: 1.6,
                      padding: '8px 10px',
                      resize: 'vertical',
                      outline: 'none',
                      fontFamily: 'inherit',
                    }}
                  />
                </div>

                {/* Action steps */}
                <div className="panel-sm">
                  <p style={{ fontWeight: 600, fontSize: '13px', marginBottom: 'var(--space-2)', color: 'var(--text-primary)' }}>
                    What should I do?
                  </p>
                  <ul style={{ fontSize: '13px', color: 'var(--text-secondary)', paddingLeft: 'var(--space-4)', lineHeight: 1.9, margin: 0 }}>
                    <li>This is a screening tool — not a diagnosis.</li>
                    <li>Always consult your physician about your health.</li>
                    {tier === 'possible_finding' && (
                      <li style={{ color: 'var(--status-danger)', fontWeight: 500 }}>
                        Contact your doctor as soon as possible.
                      </li>
                    )}
                    {tier === 'low_confidence' && (
                      <li>Ask your doctor if a follow-up scan is needed.</li>
                    )}
                  </ul>
                </div>

                {/* Mandatory disclaimer */}
                <div
                  style={{
                    background: 'rgba(245,158,11,0.08)',
                    border: '1px solid rgba(245,158,11,0.25)',
                    borderRadius: 'var(--radius-lg)',
                    padding: 'var(--space-3) var(--space-4)',
                  }}
                >
                  <p style={{ fontSize: '12px', fontWeight: 700, color: '#fbbf24', margin: '0 0 4px' }}>
                    THIS IS NOT A DIAGNOSIS
                  </p>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
                    Please show this result to a qualified clinician or radiologist.
                  </p>
                </div>
              </>
            )}

            {/* ── EXPORT ──────────────────────────────────────────────────── */}
            <div style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--border-default)' }}>
              <ExportButton
                result={result}
                persona={persona}
                modelInfo={modelInfo}
                imageUrl={imageUrl}
                activeHeatmap={activeHeatmap}
              />
            </div>
          </div>
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
