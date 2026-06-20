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

async function tryFetchManifest(url: string): Promise<ManifestSpec | null> {
  try {
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) return null;

    const json: unknown = await response.json();
    if (!isRecord(json)) return null;

    const current_model = parseNonEmptyString(json.current_model, "current_model");
    const version = parseNonEmptyString(json.version, "version");

    if (!isRecord(json.models)) return null;

    const models: Record<string, ManifestModelEntry> = {};
    for (const [key, value] of Object.entries(json.models)) {
      models[key] = parseManifestModelEntry(value, key);
    }

    if (!models[current_model]) return null;

    return { current_model, version, models };
  } catch {
    return null;
  }
}

export async function fetchManifest(): Promise<ManifestSpec> {
  // Try the dynamic API route first — it syncs with Supabase for newly published models
  const dynamic = await tryFetchManifest("/api/models/manifest");
  if (dynamic) return dynamic;

  // Fall back to the static public file
  const staticManifest = await tryFetchManifest("/models/manifest.json");
  if (staticManifest) return staticManifest;

  throw new Error("Failed to fetch model manifest from all sources");
}

export function getCurrentModel(manifest: ManifestSpec): ManifestModelEntry {
  return manifest.models[manifest.current_model];
}
