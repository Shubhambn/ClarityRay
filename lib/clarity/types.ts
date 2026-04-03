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

export interface ClarityOutputSpec {
  shape?: number[];
  classes: string[];
  activation: "softmax" | "sigmoid" | "none";
}

export interface ClaritySafetySpec {
  tier: "screening" | "research" | "investigational";
  disclaimer: string;
}

export interface ClarityThresholdsSpec {
  possible_finding: number;
  low_confidence: number;
  validation_status: "unvalidated" | "validated";
}

export interface ClaritySpec {
  id: string;
  name: string;
  version: string;
  certified: false;
  bodypart: string;
  modality: string;
  model: ClarityModelSpec;
  integrity: ClarityIntegritySpec;
  input: ClarityInputSpec;
  output: ClarityOutputSpec;
  safety: ClaritySafetySpec;
  thresholds: ClarityThresholdsSpec;
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

function parseOutputSpec(value: unknown, path: string): ClarityOutputSpec {
  if (!isRecord(value)) {
    invalid(path, typeof value, "object");
  }

  checkNoExtraKeys(value, ["shape", "classes", "activation"], path);

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

  return {
    shape,
    classes,
    activation,
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

function parseThresholdsSpec(value: unknown, path: string): ClarityThresholdsSpec {
  if (!isRecord(value)) {
    invalid(path, typeof value, "object");
  }

  checkNoExtraKeys(value, ["possible_finding", "low_confidence", "validation_status"], path);

  const possible_finding = parseProbability(
    requireField(value, "possible_finding", `${path}.possible_finding`),
    `${path}.possible_finding`
  );

  const low_confidence = parseProbability(
    requireField(value, "low_confidence", `${path}.low_confidence`),
    `${path}.low_confidence`
  );

  const validation_status = parseValidationStatus(
    requireField(value, "validation_status", `${path}.validation_status`),
    `${path}.validation_status`
  );

  return {
    possible_finding,
    low_confidence,
    validation_status,
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
  const integrity = parseIntegritySpec(requireField(json, "integrity", "integrity"), "integrity");
  const input = parseInputSpec(requireField(json, "input", "input"), "input");
  const output = parseOutputSpec(requireField(json, "output", "output"), "output");
  const safety = parseSafetySpec(requireField(json, "safety", "safety"), "safety");
  const thresholds = parseThresholdsSpec(requireField(json, "thresholds", "thresholds"), "thresholds");

  return {
    id,
    name,
    version,
    certified,
    bodypart,
    modality,
    model,
    integrity,
    input,
    output,
    safety,
    thresholds,
  };
}
