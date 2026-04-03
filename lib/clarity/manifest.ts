export interface ManifestModelEntry {
  version: string;
  url: string;
  spec_url: string;
}

export interface ManifestSpec {
  current_model: string;
  version: string;
  models: Record<string, ManifestModelEntry>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid model manifest: ${field} must be a non-empty string.`);
  }
  return value;
}

function parseManifestModelEntry(value: unknown, key: string): ManifestModelEntry {
  if (!isRecord(value)) {
    throw new Error(`Invalid model manifest: models.${key} must be an object.`);
  }

  return {
    version: parseNonEmptyString(value.version, `models.${key}.version`),
    url: parseNonEmptyString(value.url, `models.${key}.url`),
    spec_url: parseNonEmptyString(value.spec_url, `models.${key}.spec_url`),
  };
}

export async function fetchManifest(): Promise<ManifestSpec> {
  const response = await fetch("/models/manifest.json", { cache: "no-cache" });

  if (!response.ok) {
    throw new Error(`Failed to fetch manifest: ${response.status} ${response.statusText}`);
  }

  const json: unknown = await response.json();
  if (!isRecord(json)) {
    throw new Error("Invalid model manifest: root must be an object.");
  }

  const current_model = parseNonEmptyString(json.current_model, "current_model");
  const version = parseNonEmptyString(json.version, "version");

  if (!isRecord(json.models)) {
    throw new Error("Invalid model manifest: models must be an object.");
  }

  const models: Record<string, ManifestModelEntry> = {};
  for (const [key, value] of Object.entries(json.models)) {
    models[key] = parseManifestModelEntry(value, key);
  }

  if (!models[current_model]) {
    throw new Error(`Invalid model manifest: current_model '${current_model}' is not defined in models.`);
  }

  return { current_model, version, models };
}

export function getCurrentModel(manifest: ManifestSpec): ManifestModelEntry {
  return manifest.models[manifest.current_model];
}
