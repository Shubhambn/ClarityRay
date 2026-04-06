import type { ClaritySpec } from "./types";

type InputSource = HTMLImageElement | HTMLCanvasElement;

export type HeatmapData = {
  values: Float32Array;
  width: number;
  height: number;
  method: "contrast_attention_v1";
};

export type ClarityRayResult = {
  primaryFinding: string;
  safetyTier: "possible_finding" | "no_finding" | "low_confidence";
  findings: { label: string; confidence: number }[];
  explanation: string;
  disclaimer: string;
};

export interface SafeResult {
  primaryFinding: string;
  confidencePercent: number;
  safetyTier: "possible_finding" | "no_finding" | "low_confidence";
  plainSummary: string;
  disclaimer: string;
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function softmax(values: number[]): number[] {
  if (values.length === 0) {
    return [];
  }

  const maxValue = Math.max(...values);
  const expValues = values.map((value) => Math.exp(value - maxValue));
  const sum = expValues.reduce((acc, value) => acc + value, 0);

  assert(Number.isFinite(sum) && sum > 0, "Invalid softmax denominator.");

  return expValues.map((value) => value / sum);
}

export function applyActivation(
  values: number[],
  activation: ClaritySpec["output"]["activation"]
): number[] {
  if (activation === "softmax") {
    return softmax(values);
  }

  if (activation === "sigmoid") {
    return values.map(sigmoid);
  }

  return values;
}

function validateProbabilityRange(values: number[]): void {
  values.forEach((value, index) => {
    assert(Number.isFinite(value), `Probability at index ${index} is not finite.`);
    assert(value >= 0 && value <= 1, `Probability at index ${index} is ${value}; expected a value in [0, 1].`);
  });
}

export function toProbabilities(rawOutput: Float32Array, spec: ClaritySpec): number[] {
  assert(rawOutput instanceof Float32Array, "postprocess expected rawOutput to be a Float32Array.");

  const values = Array.from(rawOutput);
  const classCount = spec.output.classes.length;

  assert(classCount > 0, "spec.output.classes must contain at least one class.");
  assert(
    values.length === classCount,
    `rawOutput length mismatch: got ${values.length}, expected ${classCount} values to match spec.output.classes.`
  );

  const probabilities = applyActivation(values, spec.output.activation);
  validateProbabilityRange(probabilities);

  return probabilities;
}

export function translateResults(
  probabilities: number[],
  classes: string[],
  thresholds: ClaritySpec["thresholds"]
): SafeResult {
  assert(classes.length >= 2, "translateResults requires at least two classes.");
  assert(probabilities.length >= 2, "translateResults requires at least two probabilities.");

  const findingProb = probabilities[1];
  const normalProb = probabilities[0];

  const posThreshold = thresholds.possible_finding;
  const lowThreshold = thresholds.low_confidence;

  if (findingProb >= posThreshold) {
    return {
      primaryFinding: classes[1],
      confidencePercent: Math.round(findingProb * 100),
      safetyTier: "possible_finding",
      plainSummary:
        "The AI has identified characteristics that may suggest a possible finding. " +
        "This result requires review by a qualified radiologist or physician.",
      disclaimer:
        "⚠ Possible finding detected. This is a screening tool, not a diagnosis. " +
        "Please consult a licensed physician immediately. " +
        "Do not take medical action based on this result alone.",
    };
  }

  if (findingProb >= lowThreshold) {
    return {
      primaryFinding: "Low confidence signal",
      confidencePercent: Math.round(findingProb * 100),
      safetyTier: "low_confidence",
      plainSummary:
        "The AI detected a weak signal that does not meet the threshold for a positive finding. " +
        "This result is inconclusive.",
      disclaimer:
        "ℹ Inconclusive result. Image quality, patient positioning, or model limitations " +
        "may affect accuracy. Consult a physician if you have clinical concerns.",
    };
  }

  return {
    primaryFinding: classes[0],
    confidencePercent: Math.round(normalProb * 100),
    safetyTier: "no_finding",
    plainSummary:
      "No significant finding was identified in this image. " +
      "A negative AI result does not rule out disease.",
    disclaimer:
      "ℹ No finding detected. This does not mean the image is clinically normal. " +
      "AI screening tools have limitations. Always consult a physician for clinical evaluation.",
  };
}

export function postprocess(rawOutput: Float32Array, spec: ClaritySpec): SafeResult {
  const probabilities = toProbabilities(rawOutput, spec);
  return translateResults(probabilities, spec.output.classes, spec.thresholds);
}

function normalizeInPlace(values: Float32Array): void {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < values.length; i++) {
    const value = values[i] ?? 0;
    if (value < min) min = value;
    if (value > max) max = value;
  }

  const range = max - min;
  if (!Number.isFinite(range) || range <= 0) {
    values.fill(0);
    return;
  }

  for (let i = 0; i < values.length; i++) {
    values[i] = (values[i] - min) / range;
  }
}

function smooth3x3(input: Float32Array, width: number, height: number): Float32Array {
  const output = new Float32Array(input.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;

      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const nx = x + kx;
          const ny = y + ky;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          sum += input[ny * width + nx] ?? 0;
          count += 1;
        }
      }

      output[y * width + x] = count > 0 ? sum / count : 0;
    }
  }

  return output;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function getSourceDimensions(source: InputSource): { width: number; height: number } {
  if (source instanceof HTMLImageElement) {
    return {
      width: source.naturalWidth || source.width || 224,
      height: source.naturalHeight || source.height || 224,
    };
  }

  return {
    width: source.width || 224,
    height: source.height || 224,
  };
}

export function generateHeatmap(source: InputSource, abnormalConfidence: number): HeatmapData {
  const { width, height } = getSourceDimensions(source);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Unable to get 2D context for heatmap generation");
  }

  ctx.drawImage(source, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);

  const luminance = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4] / 255;
    const g = data[i * 4 + 1] / 255;
    const b = data[i * 4 + 2] / 255;
    luminance[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  const response = new Float32Array(width * height);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;

      const left = luminance[idx - 1] ?? 0;
      const right = luminance[idx + 1] ?? 0;
      const up = luminance[idx - width] ?? 0;
      const down = luminance[idx + width] ?? 0;

      const gx = Math.abs(right - left);
      const gy = Math.abs(down - up);
      const contrast = clamp01((gx + gy) * 1.5);

      const intensity = clamp01(((luminance[idx] ?? 0) - 0.35) / 0.45);

      const nx = x / Math.max(1, width - 1);
      const ny = y / Math.max(1, height - 1);
      const centerX = (nx - 0.5) / 0.35;
      const centerY = (ny - 0.5) / 0.45;
      const centerPrior = Math.exp(-(centerX * centerX + centerY * centerY));

      response[idx] = 0.55 * contrast + 0.25 * intensity + 0.2 * centerPrior;
    }
  }

  const smoothed = smooth3x3(response, width, height);
  normalizeInPlace(smoothed);

  const confidenceScale = 0.45 + 0.55 * clamp01(abnormalConfidence);
  for (let i = 0; i < smoothed.length; i++) {
    smoothed[i] = Math.pow(smoothed[i], 1.15) * confidenceScale;
  }

  normalizeInPlace(smoothed);

  return {
    values: smoothed,
    width,
    height,
    method: "contrast_attention_v1",
  };
}