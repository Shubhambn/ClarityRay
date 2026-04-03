import { type ClaritySpec, validateSpec } from "./types";

export async function fetchSpec(specUrl: string): Promise<ClaritySpec> {
  const response = await fetch(specUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch spec: ${response.status} ${response.statusText}`);
  }

  const json: unknown = await response.json();
  return validateSpec(json);
}
