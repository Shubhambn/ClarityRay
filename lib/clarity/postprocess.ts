import type { ClaritySpec, ClarityTask } from "./types";

type InputSource = HTMLImageElement | HTMLCanvasElement;

export type SafetyTier = "possible_finding" | "no_finding" | "low_confidence";

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

/** segmentation: per-class pixel coverage of the predicted mask. */
export interface SegmentationClass {
  label: string;
  /** Fraction of pixels [0, 1] assigned to this class. */
  coverage: number;
  suspicious: boolean;
}

export interface SegmentationResult {
  width: number;
  height: number;
  /** width*height; each entry = assigned class index + 1, or 0 for background. */
  labelMap: Uint8Array;
  classes: SegmentationClass[];
  /** Suggested overlay opacity, mirrored from the spec (default 0.5). */
  opacity: number;
}

/** detection: one reported box, in normalized [0,1] input-image space. */
export interface Detection {
  label: string;
  score: number;
  suspicious: boolean;
  box: { x: number; y: number; w: number; h: number };
}

export interface SafeResult {
  primaryFinding: string;
  confidencePercent: number;
  safetyTier: SafetyTier;
  plainSummary: string;
  disclaimer: string;
  classProbabilities: { label: string; probability: number }[];
  /** Which interpreter produced this result. Absent for legacy binary callers. */
  task?: ClarityTask;
  /**
   * multilabel/multiclass: every label reported at/over its threshold, ranked
   * by probability (highest first).
   */
  findings?: { label: string; probability: number; suspicious: boolean }[];
  /** regression: the raw measured value. */
  value?: number;
  /** regression: unit of `value`, mirrored from the spec. */
  units?: string | null;
  /** regression: expected [min, max] of `value`, mirrored from the spec. */
  range?: [number, number] | null;
  /** segmentation: the predicted mask + per-class coverage. */
  segmentation?: SegmentationResult;
  /** detection: reported boxes, ranked by score. */
  detections?: Detection[];
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

// Fallback thresholds for tasks that may legitimately omit them in the spec
// (only binary requires them). They keep the per-label default sane and the
// binary path numerically unchanged when the spec supplies its own values.
const DEFAULT_POSSIBLE_FINDING = 0.5;
const DEFAULT_LOW_CONFIDENCE = 0.2;

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

/**
 * Regression sibling of {@link toProbabilities}: returns the model's raw values
 * (after any declared activation) without forcing them into [0, 1]. This is the
 * faithful path the old binary code lacked — it kept only one output and
 * discarded the rest. One value per named quantity in `spec.output.classes`.
 */
export function toRawValues(rawOutput: Float32Array, spec: ClaritySpec): number[] {
  assert(rawOutput instanceof Float32Array, "postprocess expected rawOutput to be a Float32Array.");

  const values = Array.from(rawOutput);
  const classCount = spec.output.classes.length;

  assert(classCount > 0, "spec.output.classes must contain at least one class.");
  assert(
    values.length === classCount,
    `rawOutput length mismatch: got ${values.length}, expected ${classCount} values to match spec.output.classes.`
  );

  const activated = applyActivation(values, spec.output.activation);
  activated.forEach((value, index) => {
    assert(Number.isFinite(value), `Regression output at index ${index} is not finite.`);
  });

  return activated;
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

  const posThreshold = thresholds.possible_finding ?? DEFAULT_POSSIBLE_FINDING;
  const lowThreshold = thresholds.low_confidence ?? DEFAULT_LOW_CONFIDENCE;

  const classProbabilities = classes.map((label, i) => ({
    label,
    probability: probabilities[i] ?? 0,
  }));

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
      classProbabilities,
    };
  }

  if (findingProb >= lowThreshold) {
    return {
      primaryFinding: "Low-confidence suspicious pattern",
      confidencePercent: Math.round(findingProb * 100),
      safetyTier: "low_confidence",
      plainSummary:
        "The AI detected a weak signal that does not meet the threshold for a positive finding. " +
        "This result is inconclusive.",
      disclaimer:
        "ℹ Inconclusive result. Image quality, patient positioning, or model limitations " +
        "may affect accuracy. Consult a physician if you have clinical concerns.",
      classProbabilities,
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
    classProbabilities,
  };
}

/**
 * Multilabel: N independent findings, each with its own probability. Reports
 * every label at/over its threshold, ranked by probability, and derives the
 * safety tier from the highest-severity hit. No label is ever discarded.
 */
export function interpretMultilabel(probabilities: number[], spec: ClaritySpec): SafeResult {
  const classes = spec.output.classes;
  assert(
    probabilities.length === classes.length,
    `probability/class count mismatch: ${probabilities.length} vs ${classes.length}.`
  );

  const labelMeta = new Map((spec.output.labels ?? []).map((label) => [label.name, label]));
  const posThreshold = spec.thresholds.possible_finding ?? DEFAULT_POSSIBLE_FINDING;
  const lowThreshold = spec.thresholds.low_confidence ?? DEFAULT_LOW_CONFIDENCE;

  const classProbabilities = classes.map((label, i) => ({
    label,
    probability: probabilities[i] ?? 0,
  }));

  const perLabel = classes.map((label, i) => {
    const meta = labelMeta.get(label);
    return {
      label,
      probability: probabilities[i] ?? 0,
      threshold: meta?.threshold ?? posThreshold,
      suspicious: meta?.suspicious ?? true,
    };
  });

  // Every label at/over its own threshold, highest probability first.
  const hits = perLabel
    .filter((p) => p.probability >= p.threshold)
    .sort((a, b) => b.probability - a.probability);

  const findings = hits.map((h) => ({
    label: h.label,
    probability: h.probability,
    suspicious: h.suspicious,
  }));

  const suspiciousHits = hits.filter((h) => h.suspicious);

  if (suspiciousHits.length > 0) {
    const top = suspiciousHits[0];
    const others = suspiciousHits.length - 1;
    return {
      primaryFinding: top.label,
      confidencePercent: Math.round(top.probability * 100),
      safetyTier: "possible_finding",
      plainSummary:
        `The AI reported ${suspiciousHits.length} possible finding${suspiciousHits.length === 1 ? "" : "s"}, ` +
        `most prominently "${top.label}"${others > 0 ? ` (and ${others} other${others === 1 ? "" : "s"})` : ""}. ` +
        "These results require review by a qualified radiologist or physician.",
      disclaimer:
        "⚠ Possible finding(s) detected. This is a screening tool, not a diagnosis. " +
        "Please consult a licensed physician immediately. " +
        "Do not take medical action based on this result alone.",
      classProbabilities,
      task: "multilabel",
      findings,
    };
  }

  const weakSuspicious = perLabel
    .filter((p) => p.suspicious && p.probability >= lowThreshold)
    .sort((a, b) => b.probability - a.probability);

  if (weakSuspicious.length > 0) {
    const top = weakSuspicious[0];
    return {
      primaryFinding: `Low-confidence: ${top.label}`,
      confidencePercent: Math.round(top.probability * 100),
      safetyTier: "low_confidence",
      plainSummary:
        `The AI detected a weak signal for "${top.label}" that does not meet the threshold for a positive finding. ` +
        "This result is inconclusive.",
      disclaimer:
        "ℹ Inconclusive result. Image quality, patient positioning, or model limitations " +
        "may affect accuracy. Consult a physician if you have clinical concerns.",
      classProbabilities,
      task: "multilabel",
      findings,
    };
  }

  return {
    primaryFinding: "No finding",
    confidencePercent: Math.round((classProbabilities.reduce((m, c) => Math.max(m, c.probability), 0)) * 100),
    safetyTier: "no_finding",
    plainSummary:
      "No label reached its reporting threshold. " +
      "A negative AI result does not rule out disease.",
    disclaimer:
      "ℹ No finding detected. This does not mean the image is clinically normal. " +
      "AI screening tools have limitations. Always consult a physician for clinical evaluation.",
    classProbabilities,
    task: "multilabel",
    findings,
  };
}

/**
 * Multiclass: one label out of N mutually exclusive classes (argmax) plus the
 * full class distribution. Safety tier follows the winning class — benign
 * classes (e.g. "Normal", flagged `suspicious: false`) read as no finding.
 */
export function interpretMulticlass(probabilities: number[], spec: ClaritySpec): SafeResult {
  const classes = spec.output.classes;
  assert(
    probabilities.length === classes.length,
    `probability/class count mismatch: ${probabilities.length} vs ${classes.length}.`
  );
  assert(probabilities.length >= 1, "interpretMulticlass requires at least one class.");

  const labelMeta = new Map((spec.output.labels ?? []).map((label) => [label.name, label]));
  const posThreshold = spec.thresholds.possible_finding ?? DEFAULT_POSSIBLE_FINDING;
  const lowThreshold = spec.thresholds.low_confidence ?? DEFAULT_LOW_CONFIDENCE;

  const classProbabilities = classes.map((label, i) => ({
    label,
    probability: probabilities[i] ?? 0,
  }));

  let topIndex = 0;
  for (let i = 1; i < probabilities.length; i++) {
    if ((probabilities[i] ?? 0) > (probabilities[topIndex] ?? 0)) {
      topIndex = i;
    }
  }

  const topLabel = classes[topIndex];
  const topProb = probabilities[topIndex] ?? 0;
  const suspicious = labelMeta.get(topLabel)?.suspicious ?? true;
  const confidencePercent = Math.round(topProb * 100);

  if (!suspicious) {
    return {
      primaryFinding: topLabel,
      confidencePercent,
      safetyTier: "no_finding",
      plainSummary:
        `The AI's most likely class is "${topLabel}", which is not flagged as a finding. ` +
        "A negative AI result does not rule out disease.",
      disclaimer:
        "ℹ No finding detected. This does not mean the image is clinically normal. " +
        "AI screening tools have limitations. Always consult a physician for clinical evaluation.",
      classProbabilities,
      task: "multiclass",
      findings: [],
    };
  }

  const tier: SafetyTier =
    topProb >= posThreshold ? "possible_finding" : topProb >= lowThreshold ? "low_confidence" : "no_finding";

  const findings =
    tier === "no_finding" ? [] : [{ label: topLabel, probability: topProb, suspicious: true }];

  if (tier === "possible_finding") {
    return {
      primaryFinding: topLabel,
      confidencePercent,
      safetyTier: "possible_finding",
      plainSummary:
        `The AI's most likely class is "${topLabel}". ` +
        "This result requires review by a qualified radiologist or physician.",
      disclaimer:
        "⚠ Possible finding detected. This is a screening tool, not a diagnosis. " +
        "Please consult a licensed physician immediately. " +
        "Do not take medical action based on this result alone.",
      classProbabilities,
      task: "multiclass",
      findings,
    };
  }

  if (tier === "low_confidence") {
    return {
      primaryFinding: `Low-confidence: ${topLabel}`,
      confidencePercent,
      safetyTier: "low_confidence",
      plainSummary:
        `The AI's top class "${topLabel}" did not reach the confidence threshold for a positive finding. ` +
        "This result is inconclusive.",
      disclaimer:
        "ℹ Inconclusive result. Image quality, patient positioning, or model limitations " +
        "may affect accuracy. Consult a physician if you have clinical concerns.",
      classProbabilities,
      task: "multiclass",
      findings,
    };
  }

  return {
    primaryFinding: topLabel,
    confidencePercent,
    safetyTier: "no_finding",
    plainSummary:
      `The AI's top class "${topLabel}" scored below the reporting threshold. ` +
      "A negative AI result does not rule out disease.",
    disclaimer:
      "ℹ No finding detected. This does not mean the image is clinically normal. " +
      "AI screening tools have limitations. Always consult a physician for clinical evaluation.",
    classProbabilities,
    task: "multiclass",
    findings,
  };
}

/**
 * Regression: a continuous value (or graded score). Reports the raw value, its
 * units and expected range, with optional severity banding from the spec. All
 * outputs are carried through — the old binary path threw extras away.
 */
export function interpretRegression(values: number[], spec: ClaritySpec): SafeResult {
  const classes = spec.output.classes;
  assert(
    values.length === classes.length,
    `value/class count mismatch: ${values.length} vs ${classes.length}.`
  );
  assert(values.length >= 1, "interpretRegression requires at least one output.");

  const value = values[0];
  const units = spec.output.units ?? null;
  const range = spec.output.range ?? null;

  // Carry every regressed quantity through unchanged (no discarding).
  const classProbabilities = classes.map((label, i) => ({
    label,
    probability: values[i] ?? 0,
  }));

  const formatted = `${classes[0]}: ${value}${units ? ` ${units}` : ""}`;

  const band = (spec.output.bands ?? []).find(
    (b) => (b.min === undefined || value >= b.min) && (b.max === undefined || value <= b.max)
  );

  if (band) {
    const isFinding = band.tier !== "no_finding";
    return {
      primaryFinding: band.label,
      confidencePercent: 0,
      safetyTier: band.tier,
      plainSummary:
        `The model measured ${formatted}, which falls in the "${band.label}" band. ` +
        (isFinding
          ? "This result requires review by a qualified clinician."
          : "This value is within the expected range."),
      disclaimer: isFinding
        ? "⚠ Measured value falls in a flagged band. This is a screening tool, not a diagnosis. " +
          "Please consult a licensed physician."
        : "ℹ Measured value reported for clinical context. This is not a diagnosis. " +
          "Always consult a physician for clinical evaluation.",
      classProbabilities,
      task: "regression",
      value,
      units,
      range,
    };
  }

  return {
    primaryFinding: formatted,
    confidencePercent: 0,
    safetyTier: "no_finding",
    plainSummary:
      `The model produced a measured value of ${formatted}. ` +
      "This is a raw measurement, not a diagnosis.",
    disclaimer:
      "ℹ Measured value reported for clinical context. AI tools have limitations. " +
      "Always consult a physician for clinical evaluation.",
    classProbabilities,
    task: "regression",
    value,
    units,
    range,
  };
}

/**
 * Flat sibling of {@link toProbabilities} for tensor-shaped tasks (segmentation,
 * detection) whose length is governed by `output.shape`, not `classes.length`.
 * Activation is applied inside the interpreter (per-pixel / per-row), so this
 * just returns the finite raw values.
 */
export function toFlatOutput(rawOutput: Float32Array): number[] {
  assert(rawOutput instanceof Float32Array, "postprocess expected rawOutput to be a Float32Array.");
  const values = Array.from(rawOutput);
  values.forEach((value, index) => {
    assert(Number.isFinite(value), `Output at index ${index} is not finite.`);
  });
  return values;
}

/** Resolve [channels, height, width] from a segmentation output shape. */
function segDims(shape: number[] | undefined): { channels: number; height: number; width: number } {
  assert(Array.isArray(shape) && (shape.length === 3 || shape.length === 4),
    "segmentation requires output.shape of [1, C, H, W] or [1, H, W].");
  if (shape.length === 4) {
    return { channels: shape[1], height: shape[2], width: shape[3] };
  }
  return { channels: 1, height: shape[1], width: shape[2] };
}

/**
 * Segmentation: per-pixel class masks. Builds a single-assignment label map for
 * overlay (argmax for softmax; highest over-threshold channel for sigmoid/none)
 * and reports per-class pixel coverage. No channel is discarded.
 */
export function interpretSegmentation(values: number[], spec: ClaritySpec): SafeResult {
  const { channels, height, width } = segDims(spec.output.shape);
  const classes = spec.output.classes;
  const pixels = height * width;

  assert(classes.length === channels,
    `segmentation class/channel mismatch: ${classes.length} classes vs ${channels} channels.`);
  assert(values.length === channels * pixels,
    `segmentation output length ${values.length} != C*H*W (${channels * pixels}).`);

  const activation = spec.output.activation;
  const threshold = spec.output.mask?.threshold ?? 0.5;
  const opacity = spec.output.mask?.opacity ?? 0.5;
  const labelMeta = new Map((spec.output.labels ?? []).map((l) => [l.name, l]));

  const labelMap = new Uint8Array(pixels);
  const counts = new Array<number>(channels).fill(0);

  for (let p = 0; p < pixels; p++) {
    let bestChannel = -1;
    let bestScore = -Infinity;

    if (activation === "softmax") {
      // Per-pixel softmax across channels → argmax assignment.
      const logits = new Array<number>(channels);
      for (let c = 0; c < channels; c++) logits[c] = values[c * pixels + p] ?? 0;
      const probs = softmax(logits);
      for (let c = 0; c < channels; c++) {
        if (probs[c] > bestScore) { bestScore = probs[c]; bestChannel = c; }
      }
    } else {
      // Independent channels (sigmoid/none): highest channel that clears the bar.
      for (let c = 0; c < channels; c++) {
        const raw = values[c * pixels + p] ?? 0;
        const score = activation === "sigmoid" ? sigmoid(raw) : raw;
        if (score >= threshold && score > bestScore) { bestScore = score; bestChannel = c; }
      }
    }

    if (bestChannel >= 0) {
      labelMap[p] = bestChannel + 1;
      counts[bestChannel] += 1;
    }
  }

  const segClasses: SegmentationClass[] = classes.map((label, c) => ({
    label,
    coverage: pixels > 0 ? counts[c] / pixels : 0,
    suspicious: labelMeta.get(label)?.suspicious ?? true,
  }));

  const classProbabilities = segClasses.map((c) => ({ label: c.label, probability: c.coverage }));

  const present = segClasses
    .filter((c) => c.coverage > 0)
    .sort((a, b) => b.coverage - a.coverage);
  const suspiciousPresent = present.filter((c) => c.suspicious);

  const segmentation: SegmentationResult = { width, height, labelMap, classes: segClasses, opacity };

  if (suspiciousPresent.length > 0) {
    const top = suspiciousPresent[0];
    return {
      primaryFinding: top.label,
      confidencePercent: Math.round(top.coverage * 100),
      safetyTier: "possible_finding",
      plainSummary:
        `The AI segmented ${suspiciousPresent.length} region${suspiciousPresent.length === 1 ? "" : "s"} of interest, ` +
        `most prominently "${top.label}" (${(top.coverage * 100).toFixed(1)}% of the image). ` +
        "These regions require review by a qualified radiologist or physician.",
      disclaimer:
        "⚠ Region(s) of interest segmented. This is a screening tool, not a diagnosis. " +
        "Please consult a licensed physician. Do not take medical action based on this result alone.",
      classProbabilities,
      task: "segmentation",
      segmentation,
    };
  }

  return {
    primaryFinding: "No region segmented",
    confidencePercent: 0,
    safetyTier: "no_finding",
    plainSummary:
      "No region of interest crossed the segmentation threshold. " +
      "A negative AI result does not rule out disease.",
    disclaimer:
      "ℹ No region segmented. This does not mean the image is clinically normal. " +
      "AI tools have limitations. Always consult a physician for clinical evaluation.",
    classProbabilities,
    task: "segmentation",
    segmentation,
  };
}

/**
 * Detection: a fixed-size [1, N, K] box tensor (K >= 6: 4 coords, score, class).
 * Padding rows below the score threshold are dropped; surviving boxes are
 * normalized to [0, 1] input space and ranked by score. No box is reinterpreted.
 */
export function interpretDetection(values: number[], spec: ClaritySpec): SafeResult {
  const shape = spec.output.shape;
  assert(Array.isArray(shape) && shape.length === 3,
    "detection requires output.shape of [1, N, K].");
  const rows = shape[1];
  const cols = shape[2];
  assert(cols >= 6, `detection rows need >= 6 columns (4 coords, score, class); got ${cols}.`);
  assert(values.length === rows * cols,
    `detection output length ${values.length} != N*K (${rows * cols}).`);

  const det = spec.output.detection;
  assert(det !== undefined, "detection task requires output.detection config.");
  const classes = spec.output.classes;
  const labelMeta = new Map((spec.output.labels ?? []).map((l) => [l.name, l]));
  const scoreThreshold = det.score_threshold ?? 0.5;
  const normalized = det.coord_space !== "pixel"; // default: normalized

  // Input image dims (NCHW): [N, C, H, W].
  const inShape = spec.input.shape;
  const inW = inShape[inShape.length - 1] || 1;
  const inH = inShape[inShape.length - 2] || 1;

  const toXYWH = (a: number, b: number, c: number, d: number): { x: number; y: number; w: number; h: number } => {
    if (det.box_format === "xyxy") return { x: a, y: b, w: c - a, h: d - b };
    if (det.box_format === "cxcywh") return { x: a - c / 2, y: b - d / 2, w: c, h: d };
    return { x: a, y: b, w: c, h: d }; // xywh
  };

  const detections: Detection[] = [];
  for (let r = 0; r < rows; r++) {
    const base = r * cols;
    const score = values[base + 4] ?? 0;
    if (!(score >= scoreThreshold)) continue;

    const rawBox = toXYWH(values[base], values[base + 1], values[base + 2], values[base + 3]);
    const box = normalized
      ? rawBox
      : { x: rawBox.x / inW, y: rawBox.y / inH, w: rawBox.w / inW, h: rawBox.h / inH };

    const classIdx = Math.round(values[base + 5] ?? 0);
    const label = classes[classIdx] ?? `class ${classIdx}`;
    const suspicious = labelMeta.get(label)?.suspicious ?? true;

    detections.push({ label, score, suspicious, box });
  }

  detections.sort((a, b) => b.score - a.score);

  // Researcher-facing distribution: best score per class.
  const bestByClass = new Map<string, number>();
  for (const d of detections) {
    bestByClass.set(d.label, Math.max(bestByClass.get(d.label) ?? 0, d.score));
  }
  const classProbabilities = classes.map((label) => ({
    label,
    probability: bestByClass.get(label) ?? 0,
  }));

  const suspiciousDets = detections.filter((d) => d.suspicious);

  if (suspiciousDets.length > 0) {
    const top = suspiciousDets[0];
    const others = suspiciousDets.length - 1;
    return {
      primaryFinding: top.label,
      confidencePercent: Math.round(top.score * 100),
      safetyTier: "possible_finding",
      plainSummary:
        `The AI detected ${suspiciousDets.length} region${suspiciousDets.length === 1 ? "" : "s"} of concern, ` +
        `most confidently "${top.label}"${others > 0 ? ` (and ${others} other${others === 1 ? "" : "s"})` : ""}. ` +
        "These detections require review by a qualified radiologist or physician.",
      disclaimer:
        "⚠ Detection(s) flagged. This is a screening tool, not a diagnosis. " +
        "Please consult a licensed physician. Do not take medical action based on this result alone.",
      classProbabilities,
      task: "detection",
      detections,
    };
  }

  if (detections.length > 0) {
    // Boxes present but all flagged benign (suspicious: false).
    return {
      primaryFinding: detections[0].label,
      confidencePercent: Math.round(detections[0].score * 100),
      safetyTier: "no_finding",
      plainSummary:
        `The AI located ${detections.length} object${detections.length === 1 ? "" : "s"}, none flagged as a concern. ` +
        "A negative AI result does not rule out disease.",
      disclaimer:
        "ℹ Objects detected but not flagged. This is not a diagnosis. " +
        "AI tools have limitations. Always consult a physician for clinical evaluation.",
      classProbabilities,
      task: "detection",
      detections,
    };
  }

  return {
    primaryFinding: "No detections",
    confidencePercent: 0,
    safetyTier: "no_finding",
    plainSummary:
      "No detection crossed the score threshold. A negative AI result does not rule out disease.",
    disclaimer:
      "ℹ No detections. This does not mean the image is clinically normal. " +
      "AI tools have limitations. Always consult a physician for clinical evaluation.",
    classProbabilities,
    task: "detection",
    detections,
  };
}

export function postprocess(rawOutput: Float32Array, spec: ClaritySpec): SafeResult {
  const task = spec.output.task ?? "binary";

  switch (task) {
    case "multilabel":
      return interpretMultilabel(toProbabilities(rawOutput, spec), spec);
    case "multiclass":
      return interpretMulticlass(toProbabilities(rawOutput, spec), spec);
    case "regression":
      return interpretRegression(toRawValues(rawOutput, spec), spec);
    case "segmentation":
      return interpretSegmentation(toFlatOutput(rawOutput), spec);
    case "detection":
      return interpretDetection(toFlatOutput(rawOutput), spec);
    case "binary":
    default:
      return translateResults(toProbabilities(rawOutput, spec), spec.output.classes, spec.thresholds);
  }
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