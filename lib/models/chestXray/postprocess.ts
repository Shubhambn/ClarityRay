import { modelConfig, ModelLabel } from './config';

export type ClarityRayResult = {
  primaryFinding: string;
  safetyTier: 'possible_finding' | 'no_finding' | 'low_confidence';
  findings: { label: ModelLabel; confidence: number }[];
  explanation: string;
  disclaimer: string;
};

const DISCLAIMER =
  'This is a screening tool, not a diagnosis. Results may indicate patterns for review and should always be interpreted by a qualified physician.';

function softmax(logits: Float32Array): Float32Array {
  if (logits.length === 0) {
    return new Float32Array(0);
  }

  const maxValue = Math.max(...Array.from(logits));
  const expValues = logits.map((value) => Math.exp(value - maxValue));
  const sum = expValues.reduce((acc, value) => acc + value, 0);

  if (!Number.isFinite(sum) || sum <= 0) {
    return new Float32Array(logits.length);
  }

  return new Float32Array(expValues.map((value) => value / sum));
}

export function postprocessOutput(raw: Float32Array): ClarityRayResult {
  const probabilities = softmax(raw);

  const findings = modelConfig.labels
    .map((label, idx) => ({ label, confidence: probabilities[idx] ?? 0 }))
    .sort((a, b) => b.confidence - a.confidence);

  const primary = findings[0] ?? { label: 'Normal' as ModelLabel, confidence: 0 };
  const primaryIsAbnormal = primary.label === 'Lung Cancer' && primary.confidence >= modelConfig.threshold;

  let safetyTier: ClarityRayResult['safetyTier'] = 'no_finding';
  if (primary.confidence < 0.5) {
    safetyTier = 'low_confidence';
  } else if (primaryIsAbnormal) {
    safetyTier = 'possible_finding';
  }

  const primaryFinding = primaryIsAbnormal
    ? 'Possible finding: Lung Cancer pattern'
    : 'No high-confidence abnormal finding';

  const explanation = primaryIsAbnormal
    ? 'The model detected a possible finding that may indicate an abnormal chest pattern. Please consult a qualified physician for medical interpretation and next steps.'
    : 'The model did not detect a high-confidence abnormal pattern in this image. A normal-looking result does not rule out disease, so clinical review is still recommended.';

  return {
    primaryFinding,
    safetyTier,
    findings,
    explanation,
    disclaimer: DISCLAIMER
  };
}
