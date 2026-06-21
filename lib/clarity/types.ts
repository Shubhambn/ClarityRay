export interface ClarityModelSpec {
  file: string;
  format?: string;
}

export interface ClarityIntegritySpec {
  sha256: string;
}

export interface ClarityInputSpec {
  shape: number[];
  layout?: string;
  normalize: {
    mean: number[];
    std: number[];
  };
}

/**
 * The kind of output a model produces. The platform dispatches every step of
 * postprocessing on this discriminator instead of assuming a binary screener.
 * Absent in a spec means "binary" for backward compatibility.
 */
export type ClarityTask =
  | "binary"
  | "multilabel"
  | "multiclass"
  | "regression"
  | "segmentation"
  | "detection";

/**
 * Per-class metadata for multilabel / multiclass models. `labels` is a sparse
 * lookup keyed by class name — a model may annotate only some of its classes
 * (e.g. flag which of 18 pathologies count as "suspicious"). Every `name` must
 * appear in `output.classes`.
 */
export interface ClarityLabelSpec {
  name: string;
  /** Probability at/over which this label is reported as a finding. */
  threshold?: number;
  /** Whether crossing the threshold should raise the safety tier. */
  suspicious?: boolean;
}

/**
 * Optional severity banding for regression models. The first band whose
 * [min, max] window contains the value wins; `min`/`max` are inclusive and
 * either may be omitted to make the band open-ended.
 */
export interface ClarityBandSpec {
  min?: number;
  max?: number;
  tier: "possible_finding" | "no_finding" | "low_confidence";
  label: string;
}

/**
 * Segmentation rendering hints. The mask itself is the model's per-pixel output
 * (shape `[1, C, H, W]` or `[1, H, W]`); these only tune how it is binarized and
 * overlaid. Per-class `suspicious`/`threshold` reuse `output.labels`.
 */
export interface ClarityMaskSpec {
  /** Per-pixel score at/over which a pixel counts toward a class (sigmoid/none). */
  threshold?: number;
  /** Suggested overlay opacity in [0, 1] when drawing the mask on the scan. */
  opacity?: number;
}

/**
 * Detection output layout. The model emits a fixed-size `[1, N, K]` tensor with
 * N = `max_detections` rows; each row is `[..4 coords.., score, class_id]`.
 * Padding rows (score below `score_threshold`) are dropped.
 */
export interface ClarityDetectionSpec {
  /** Encoding of the 4 coordinate columns. */
  box_format: "xyxy" | "xywh" | "cxcywh";
  /** Number of detection slots (rows) in the output tensor. */
  max_detections: number;
  /** Score at/over which a detection is reported. */
  score_threshold?: number;
  /** Whether coords are absolute input pixels or normalized [0, 1]. */
  coord_space?: "pixel" | "normalized";
}

export interface ClarityOutputSpec {
  /** Output contract; defaults to "binary" when absent. */
  task?: ClarityTask;
  shape?: number[];
  classes: string[];
  activation: "softmax" | "sigmoid" | "none";
  /** multilabel / multiclass / segmentation: sparse per-class metadata. */
  labels?: ClarityLabelSpec[];
  /** regression: unit of the measured quantity (e.g. "ratio", "years"). */
  units?: string | null;
  /** regression: expected [min, max] of the value, for gauges/banding. */
  range?: [number, number] | null;
  /** regression: optional severity banding over the value. */
  bands?: ClarityBandSpec[];
  /** segmentation: overlay/binarization hints. */
  mask?: ClarityMaskSpec;
  /** detection: box output layout. */
  detection?: ClarityDetectionSpec;
}

export interface ClaritySafetySpec {
  tier: "screening" | "research" | "investigational";
  disclaimer: string;
}

/**
 * Detection thresholds. `possible_finding` / `low_confidence` are required for
 * binary models (the single-score contract); other tasks carry per-label
 * thresholds in `output.labels` and may omit them. `validation_status` is
 * always required.
 */
export interface ClarityThresholdsSpec {
  possible_finding?: number;
  low_confidence?: number;
  validation_status: "unvalidated" | "validated";
}

/**
 * Optional provenance for a model derived from an upstream/base model.
 * Generic across families: `selected_findings` is only meaningful for models
 * that map a multi-label source into a binary finding, so it is optional.
 */
export interface ClaritySourceModelSpec {
  family: string;
  source: string;
  selected_findings?: string[];
}

export interface ClaritySpec {
  id: string;
  name: string;
  version: string;
  certified: false;
  bodypart: string;
  modality: string;
  model: ClarityModelSpec;
  integrity?: ClarityIntegritySpec;
  input: ClarityInputSpec;
  output: ClarityOutputSpec;
  safety: ClaritySafetySpec;
  thresholds: ClarityThresholdsSpec;
  source_model?: ClaritySourceModelSpec;
}

function invalid(field: string, problem: string, expected: string): never {
  throw new Error(
    `clarity.json invalid: ${field} is ${problem}. Expected ${expected}.`
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function requireField(obj: Record<string, unknown>, key: string, path: string): unknown {
  if (!hasOwn(obj, key)) {
    invalid(path, "missing", "present");
  }

  return obj[key];
}

function checkNoExtraKeys(
  obj: Record<string, unknown>,
  allowedKeys: readonly string[],
  path: string
): void {
  const extras = Object.keys(obj).filter((k) => !allowedKeys.includes(k));
  if (extras.length > 0) {
    invalid(path, `contains unknown field(s): ${extras.join(", ")}`, allowedKeys.join(", "));
  }
}

function parseNonEmptyString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    invalid(path, typeof value, "string");
  }

  if (value.length < 1) {
    invalid(path, "empty string", "non-empty string");
  }

  return value;
}

function parseBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    invalid(path, typeof value, "boolean");
  }

  return value;
}

function parseBooleanFalse(value: unknown, path: string): false {
  if (typeof value !== "boolean") {
    invalid(path, typeof value, "boolean false");
  }

  if (value !== false) {
    invalid(path, `${String(value)}`, "false");
  }

  return false;
}

function parseSemver(value: unknown, path: string): string {
  const result = parseNonEmptyString(value, path);
  const semverRegex =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

  if (!semverRegex.test(result)) {
    invalid(path, `"${result}"`, "semantic version string (e.g. 1.0.0)");
  }

  return result;
}

function parsePositiveIntegerArray(value: unknown, path: string): number[] {
  if (!Array.isArray(value)) {
    invalid(path, typeof value, "array of integers >= 1");
  }

  if (value.length < 1) {
    invalid(path, "empty array", "non-empty array of integers >= 1");
  }

  const result: number[] = [];
  value.forEach((item, index) => {
    if (typeof item !== "number" || !Number.isInteger(item)) {
      invalid(`${path}[${index}]`, typeof item, "integer >= 1");
    }
    if (item < 1) {
      invalid(`${path}[${index}]`, `${item}`, "integer >= 1");
    }
    result.push(item);
  });

  return result;
}

function parseNumberArray(value: unknown, path: string): number[] {
  if (!Array.isArray(value)) {
    invalid(path, typeof value, "array of numbers");
  }

  if (value.length < 1) {
    invalid(path, "empty array", "non-empty array of numbers");
  }

  const result: number[] = [];
  value.forEach((item, index) => {
    if (typeof item !== "number") {
      invalid(`${path}[${index}]`, typeof item, "number");
    }
    result.push(item);
  });

  return result;
}

function parseNonEmptyStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) {
    invalid(path, typeof value, "array of non-empty strings");
  }

  if (value.length < 1) {
    invalid(path, "empty array", "non-empty array of non-empty strings");
  }

  const result: string[] = [];
  value.forEach((item, index) => {
    if (typeof item !== "string") {
      invalid(`${path}[${index}]`, typeof item, "non-empty string");
    }
    if (item.length < 1) {
      invalid(`${path}[${index}]`, "empty string", "non-empty string");
    }
    result.push(item);
  });

  return result;
}

function parseActivation(value: unknown, path: string): "softmax" | "sigmoid" | "none" {
  if (value !== "softmax" && value !== "sigmoid" && value !== "none") {
    invalid(path, `${String(value)}`, '"softmax" | "sigmoid" | "none"');
  }

  return value;
}

function parseSafetyTier(
  value: unknown,
  path: string
): "screening" | "research" | "investigational" {
  if (value !== "screening" && value !== "research" && value !== "investigational") {
    invalid(path, `${String(value)}`, '"screening" | "research" | "investigational"');
  }

  return value;
}

function parseValidationStatus(
  value: unknown,
  path: string
): "unvalidated" | "validated" {
  if (value !== "unvalidated" && value !== "validated") {
    invalid(path, `${String(value)}`, '"unvalidated" | "validated"');
  }

  return value;
}

function parseProbability(value: unknown, path: string): number {
  if (typeof value !== "number") {
    invalid(path, typeof value, "number between 0 and 1");
  }

  if (value < 0 || value > 1) {
    invalid(path, `${value}`, "number between 0 and 1");
  }

  return value;
}

function parseModelSpec(value: unknown, path: string): ClarityModelSpec {
  if (!isRecord(value)) {
    invalid(path, typeof value, "object");
  }

  checkNoExtraKeys(value, ["file", "format"], path);

  const file = parseNonEmptyString(requireField(value, "file", `${path}.file`), `${path}.file`);

  const formatValue = hasOwn(value, "format") ? value["format"] : undefined;
  const format = formatValue === undefined ? undefined : parseNonEmptyString(formatValue, `${path}.format`);

  return { file, format };
}

function parseSha256(value: unknown, path: string): string {
  const result = parseNonEmptyString(value, path).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(result)) {
    invalid(path, `"${result}"`, "64-character hexadecimal SHA-256 string");
  }

  return result;
}

function parseIntegritySpec(value: unknown, path: string): ClarityIntegritySpec {
  if (!isRecord(value)) {
    invalid(path, typeof value, "object");
  }

  checkNoExtraKeys(value, ["sha256"], path);

  const sha256 = parseSha256(requireField(value, "sha256", `${path}.sha256`), `${path}.sha256`);

  return { sha256 };
}

function parseInputSpec(value: unknown, path: string): ClarityInputSpec {
  if (!isRecord(value)) {
    invalid(path, typeof value, "object");
  }

  checkNoExtraKeys(value, ["shape", "layout", "normalize"], path);

  const shape = parsePositiveIntegerArray(
    requireField(value, "shape", `${path}.shape`),
    `${path}.shape`
  );

  const layoutValue = hasOwn(value, "layout") ? value["layout"] : undefined;
  const layout = layoutValue === undefined ? undefined : parseNonEmptyString(layoutValue, `${path}.layout`);

  const normalizeValue = requireField(value, "normalize", `${path}.normalize`);
  if (!isRecord(normalizeValue)) {
    invalid(`${path}.normalize`, typeof normalizeValue, "object");
  }

  checkNoExtraKeys(normalizeValue, ["mean", "std"], `${path}.normalize`);

  const mean = parseNumberArray(
    requireField(normalizeValue, "mean", `${path}.normalize.mean`),
    `${path}.normalize.mean`
  );
  const std = parseNumberArray(
    requireField(normalizeValue, "std", `${path}.normalize.std`),
    `${path}.normalize.std`
  );

  return {
    shape,
    layout,
    normalize: { mean, std },
  };
}

const CLARITY_TASKS: readonly ClarityTask[] = [
  "binary",
  "multilabel",
  "multiclass",
  "regression",
  "segmentation",
  "detection",
];

function parseTask(value: unknown, path: string): ClarityTask {
  if (!CLARITY_TASKS.includes(value as ClarityTask)) {
    invalid(path, `${String(value)}`, CLARITY_TASKS.map((t) => `"${t}"`).join(" | "));
  }

  return value as ClarityTask;
}

function parseLabelSpec(value: unknown, path: string, classes: string[]): ClarityLabelSpec {
  if (!isRecord(value)) {
    invalid(path, typeof value, "object");
  }

  checkNoExtraKeys(value, ["name", "threshold", "suspicious"], path);

  const name = parseNonEmptyString(requireField(value, "name", `${path}.name`), `${path}.name`);
  if (!classes.includes(name)) {
    invalid(`${path}.name`, `"${name}"`, `a class listed in output.classes (${classes.join(", ")})`);
  }

  const threshold = hasOwn(value, "threshold")
    ? parseProbability(value["threshold"], `${path}.threshold`)
    : undefined;
  const suspicious = hasOwn(value, "suspicious")
    ? parseBoolean(value["suspicious"], `${path}.suspicious`)
    : undefined;

  return {
    name,
    ...(threshold !== undefined ? { threshold } : {}),
    ...(suspicious !== undefined ? { suspicious } : {}),
  };
}

function parseLabelArray(value: unknown, path: string, classes: string[]): ClarityLabelSpec[] {
  if (!Array.isArray(value)) {
    invalid(path, typeof value, "array of label objects");
  }

  if (value.length < 1) {
    invalid(path, "empty array", "non-empty array of label objects");
  }

  return value.map((item, index) => parseLabelSpec(item, `${path}[${index}]`, classes));
}

function parseUnits(value: unknown, path: string): string | null {
  if (value === null) {
    return null;
  }

  return parseNonEmptyString(value, path);
}

function parseRange(value: unknown, path: string): [number, number] | null {
  if (value === null) {
    return null;
  }

  if (!Array.isArray(value) || value.length !== 2) {
    invalid(path, Array.isArray(value) ? `array of length ${value.length}` : typeof value, "[min, max] (two numbers) or null");
  }

  value.forEach((item, index) => {
    if (typeof item !== "number" || !Number.isFinite(item)) {
      invalid(`${path}[${index}]`, typeof item, "finite number");
    }
  });

  const [min, max] = value as [number, number];
  if (min > max) {
    invalid(path, `[${min}, ${max}]`, "[min, max] with min <= max");
  }

  return [min, max];
}

function parseBandSpec(value: unknown, path: string): ClarityBandSpec {
  if (!isRecord(value)) {
    invalid(path, typeof value, "object");
  }

  checkNoExtraKeys(value, ["min", "max", "tier", "label"], path);

  const min = hasOwn(value, "min") ? parseFiniteNumber(value["min"], `${path}.min`) : undefined;
  const max = hasOwn(value, "max") ? parseFiniteNumber(value["max"], `${path}.max`) : undefined;
  if (min !== undefined && max !== undefined && min > max) {
    invalid(path, `min ${min} > max ${max}`, "min <= max");
  }

  const tierValue = requireField(value, "tier", `${path}.tier`);
  if (tierValue !== "possible_finding" && tierValue !== "no_finding" && tierValue !== "low_confidence") {
    invalid(`${path}.tier`, `${String(tierValue)}`, '"possible_finding" | "no_finding" | "low_confidence"');
  }

  const label = parseNonEmptyString(requireField(value, "label", `${path}.label`), `${path}.label`);

  return {
    ...(min !== undefined ? { min } : {}),
    ...(max !== undefined ? { max } : {}),
    tier: tierValue,
    label,
  };
}

function parseBandArray(value: unknown, path: string): ClarityBandSpec[] {
  if (!Array.isArray(value)) {
    invalid(path, typeof value, "array of band objects");
  }

  if (value.length < 1) {
    invalid(path, "empty array", "non-empty array of band objects");
  }

  return value.map((item, index) => parseBandSpec(item, `${path}[${index}]`));
}

function parseFiniteNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    invalid(path, typeof value, "finite number");
  }

  return value;
}

function parsePositiveInteger(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    invalid(path, typeof value === "number" ? `${value}` : typeof value, "integer >= 1");
  }

  return value;
}

function parseMaskSpec(value: unknown, path: string): ClarityMaskSpec {
  if (!isRecord(value)) {
    invalid(path, typeof value, "object");
  }

  checkNoExtraKeys(value, ["threshold", "opacity"], path);

  const threshold = hasOwn(value, "threshold")
    ? parseProbability(value["threshold"], `${path}.threshold`)
    : undefined;
  const opacity = hasOwn(value, "opacity")
    ? parseProbability(value["opacity"], `${path}.opacity`)
    : undefined;

  return {
    ...(threshold !== undefined ? { threshold } : {}),
    ...(opacity !== undefined ? { opacity } : {}),
  };
}

function parseDetectionSpec(value: unknown, path: string): ClarityDetectionSpec {
  if (!isRecord(value)) {
    invalid(path, typeof value, "object");
  }

  checkNoExtraKeys(value, ["box_format", "max_detections", "score_threshold", "coord_space"], path);

  const boxFormatValue = requireField(value, "box_format", `${path}.box_format`);
  if (boxFormatValue !== "xyxy" && boxFormatValue !== "xywh" && boxFormatValue !== "cxcywh") {
    invalid(`${path}.box_format`, `${String(boxFormatValue)}`, '"xyxy" | "xywh" | "cxcywh"');
  }

  const max_detections = parsePositiveInteger(
    requireField(value, "max_detections", `${path}.max_detections`),
    `${path}.max_detections`
  );

  const score_threshold = hasOwn(value, "score_threshold")
    ? parseProbability(value["score_threshold"], `${path}.score_threshold`)
    : undefined;

  let coord_space: "pixel" | "normalized" | undefined;
  if (hasOwn(value, "coord_space")) {
    const cs = value["coord_space"];
    if (cs !== "pixel" && cs !== "normalized") {
      invalid(`${path}.coord_space`, `${String(cs)}`, '"pixel" | "normalized"');
    }
    coord_space = cs;
  }

  return {
    box_format: boxFormatValue,
    max_detections,
    ...(score_threshold !== undefined ? { score_threshold } : {}),
    ...(coord_space !== undefined ? { coord_space } : {}),
  };
}

function parseOutputSpec(value: unknown, path: string): ClarityOutputSpec {
  if (!isRecord(value)) {
    invalid(path, typeof value, "object");
  }

  checkNoExtraKeys(
    value,
    ["task", "shape", "classes", "activation", "labels", "units", "range", "bands", "mask", "detection"],
    path
  );

  const task = hasOwn(value, "task") ? parseTask(value["task"], `${path}.task`) : "binary";

  const shapeValue = hasOwn(value, "shape") ? value["shape"] : undefined;
  const shape =
    shapeValue === undefined ? undefined : parsePositiveIntegerArray(shapeValue, `${path}.shape`);

  const classes = parseNonEmptyStringArray(
    requireField(value, "classes", `${path}.classes`),
    `${path}.classes`
  );

  const activation = parseActivation(
    requireField(value, "activation", `${path}.activation`),
    `${path}.activation`
  );

  const labels = hasOwn(value, "labels")
    ? parseLabelArray(value["labels"], `${path}.labels`, classes)
    : undefined;

  const units = hasOwn(value, "units") ? parseUnits(value["units"], `${path}.units`) : undefined;
  const range = hasOwn(value, "range") ? parseRange(value["range"], `${path}.range`) : undefined;
  const bands = hasOwn(value, "bands") ? parseBandArray(value["bands"], `${path}.bands`) : undefined;
  const mask = hasOwn(value, "mask") ? parseMaskSpec(value["mask"], `${path}.mask`) : undefined;
  const detection = hasOwn(value, "detection")
    ? parseDetectionSpec(value["detection"], `${path}.detection`)
    : undefined;

  return {
    task,
    shape,
    classes,
    activation,
    ...(labels !== undefined ? { labels } : {}),
    ...(units !== undefined ? { units } : {}),
    ...(range !== undefined ? { range } : {}),
    ...(bands !== undefined ? { bands } : {}),
    ...(mask !== undefined ? { mask } : {}),
    ...(detection !== undefined ? { detection } : {}),
  };
}

function parseSafetySpec(value: unknown, path: string): ClaritySafetySpec {
  if (!isRecord(value)) {
    invalid(path, typeof value, "object");
  }

  checkNoExtraKeys(value, ["tier", "disclaimer"], path);

  const tier = parseSafetyTier(requireField(value, "tier", `${path}.tier`), `${path}.tier`);
  const disclaimer = parseNonEmptyString(
    requireField(value, "disclaimer", `${path}.disclaimer`),
    `${path}.disclaimer`
  );

  return {
    tier,
    disclaimer,
  };
}

function parseThresholdsSpec(
  value: unknown,
  path: string,
  task: ClarityTask
): ClarityThresholdsSpec {
  if (!isRecord(value)) {
    invalid(path, typeof value, "object");
  }

  checkNoExtraKeys(value, ["possible_finding", "low_confidence", "validation_status"], path);

  // Binary models carry a single-score contract, so both thresholds are
  // required. Other tasks may omit them (per-label thresholds live in
  // output.labels), but if present they must still be valid probabilities.
  const requireScores = task === "binary";

  const possible_finding =
    requireScores || hasOwn(value, "possible_finding")
      ? parseProbability(
          requireField(value, "possible_finding", `${path}.possible_finding`),
          `${path}.possible_finding`
        )
      : undefined;

  const low_confidence =
    requireScores || hasOwn(value, "low_confidence")
      ? parseProbability(
          requireField(value, "low_confidence", `${path}.low_confidence`),
          `${path}.low_confidence`
        )
      : undefined;

  const validation_status = parseValidationStatus(
    requireField(value, "validation_status", `${path}.validation_status`),
    `${path}.validation_status`
  );

  return {
    ...(possible_finding !== undefined ? { possible_finding } : {}),
    ...(low_confidence !== undefined ? { low_confidence } : {}),
    validation_status,
  };
}

function parseSourceModelSpec(value: unknown, path: string): ClaritySourceModelSpec {
  if (!isRecord(value)) {
    invalid(path, typeof value, "object");
  }

  checkNoExtraKeys(value, ["family", "source", "selected_findings"], path);

  const family = parseNonEmptyString(requireField(value, "family", `${path}.family`), `${path}.family`);
  const source = parseNonEmptyString(requireField(value, "source", `${path}.source`), `${path}.source`);

  const findingsValue = hasOwn(value, "selected_findings") ? value["selected_findings"] : undefined;
  const selected_findings =
    findingsValue === undefined
      ? undefined
      : parseNonEmptyStringArray(findingsValue, `${path}.selected_findings`);

  return {
    family,
    source,
    ...(selected_findings !== undefined ? { selected_findings } : {}),
  };
}

export function validateSpec(json: unknown): ClaritySpec {
  if (!isRecord(json)) {
    invalid("$", typeof json, "object");
  }

  checkNoExtraKeys(
    json,
    [
      "id",
      "name",
      "version",
      "certified",
      "model",
      "integrity",
      "input",
      "output",
      "safety",
      "bodypart",
      "modality",
      "thresholds",
      "source_model",
    ],
    "$"
  );

  const id = parseNonEmptyString(requireField(json, "id", "id"), "id");
  const name = parseNonEmptyString(requireField(json, "name", "name"), "name");
  const version = parseSemver(requireField(json, "version", "version"), "version");
  const certified = parseBooleanFalse(requireField(json, "certified", "certified"), "certified");
  const bodypart = parseNonEmptyString(requireField(json, "bodypart", "bodypart"), "bodypart");
  const modality = parseNonEmptyString(requireField(json, "modality", "modality"), "modality");

  const model = parseModelSpec(requireField(json, "model", "model"), "model");

  // integrity is OPTIONAL — specs without sha256 pass validation (hook warns and continues)
  const integrityValue = hasOwn(json, "integrity") ? json["integrity"] : undefined;
  const integrity = integrityValue !== undefined
    ? parseIntegritySpec(integrityValue, "integrity")
    : undefined;

  const input = parseInputSpec(requireField(json, "input", "input"), "input");
  const output = parseOutputSpec(requireField(json, "output", "output"), "output");
  const safety = parseSafetySpec(requireField(json, "safety", "safety"), "safety");
  const thresholds = parseThresholdsSpec(
    requireField(json, "thresholds", "thresholds"),
    "thresholds",
    output.task ?? "binary"
  );

  // source_model is OPTIONAL provenance metadata
  const sourceModelValue = hasOwn(json, "source_model") ? json["source_model"] : undefined;
  const source_model = sourceModelValue !== undefined
    ? parseSourceModelSpec(sourceModelValue, "source_model")
    : undefined;

  return {
    id,
    name,
    version,
    certified,
    bodypart,
    modality,
    model,
    ...(integrity !== undefined ? { integrity } : {}),
    input,
    output,
    safety,
    thresholds,
    ...(source_model !== undefined ? { source_model } : {}),
  };
}
