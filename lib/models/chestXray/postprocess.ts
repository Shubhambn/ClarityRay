import { modelConfig, ModelLabel } from './config';

export type ClarityRayResult = {
  primaryFinding: string;
  safetyTier: 'possible_finding' | 'no_finding' | 'low_confidence';
  findings: { label: string; confidence: number }[];
  explanation: string;
  disclaimer: string;
};

export interface SafeResult {
  primaryFinding: string;
  confidencePercent: number;
  safetyTier: 'possible_finding' | 'no_finding' | 'low_confidence';
  plainSummary: string;
  disclaimer: string;
}

export function translateResults(probs: number[], labels: string[]): SafeResult {
  const lungCancerProb = probs[1];
  const normalProb = probs[0];

  if (lungCancerProb >= 0.5) {
    return {
      primaryFinding: 'Lung Cancer',
      confidencePercent: Math.round(lungCancerProb * 100),
      safetyTier: 'possible_finding',
      plainSummary:
        'The AI has identified characteristics that may suggest a possible finding. ' +
        'This result requires review by a qualified radiologist or physician.',
      disclaimer:
        '⚠ Possible finding detected. This is a screening tool, not a diagnosis. ' +
        'Please consult a licensed physician immediately. ' +
        'Do not take medical action based on this result alone.'
    };
  }

  if (lungCancerProb >= 0.25) {
    return {
      primaryFinding: 'Low confidence signal',
      confidencePercent: Math.round(lungCancerProb * 100),
      safetyTier: 'low_confidence',
      plainSummary:
        'The AI detected a weak signal that does not meet the threshold for a positive finding. ' +
        'This result is inconclusive.',
      disclaimer:
        'ℹ Inconclusive result. Image quality, patient positioning, or model limitations ' +
        'may affect accuracy. Consult a physician if you have clinical concerns.'
    };
  }

  return {
    primaryFinding: 'Normal',
    confidencePercent: Math.round(normalProb * 100),
    safetyTier: 'no_finding',
    plainSummary:
      'No significant finding was identified in this image. ' +
      'A negative AI result does not rule out disease.',
    disclaimer:
      'ℹ No finding detected. This does not mean the image is clinically normal. ' +
      'AI screening tools have limitations. Always consult a physician for clinical evaluation.'
  };
}

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

  const safeResult = translateResults(Array.from(probabilities), [...modelConfig.labels]);

  return {
    primaryFinding: safeResult.primaryFinding,
    safetyTier: safeResult.safetyTier,
    findings,
    explanation: safeResult.plainSummary,
    disclaimer: safeResult.disclaimer
  };
}
