import { type ClaritySpec, validateSpec } from "./types";

// Keyed by spec URL. Cleared on hard-reload; persists across React re-mounts within a session.
const cache = new Map<string, ClaritySpec>();

export async function fetchSpec(specUrl: string): Promise<ClaritySpec> {
  const hit = cache.get(specUrl);
  if (hit) return hit;

  const response = await fetch(specUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch spec: ${response.status} ${response.statusText}`);
  }

  const json: unknown = await response.json();
  const spec = validateSpec(json);
  cache.set(specUrl, spec);
  return spec;
}

/** Evict a single entry (e.g. when the user switches models mid-session). */
export function evictSpec(specUrl: string): void {
  cache.delete(specUrl);
}
