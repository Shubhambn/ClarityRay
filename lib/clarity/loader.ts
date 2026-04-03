import { getFromCache, saveToCache } from "./cache";
import { getModel, saveModel } from "./db";
import { sha256 } from "./hash";
import type { ClaritySpec } from "./types";

function normalizeExpectedHash(value: string): string {
  return value.trim().toLowerCase();
}

function getExpectedHashFromSpec(spec: ClaritySpec): string {
  const expectedHash = spec.integrity?.sha256;
  if (typeof expectedHash !== "string" || expectedHash.trim().length === 0) {
    throw new Error("Model integrity metadata missing in clarity.json (integrity.sha256).");
  }

  return normalizeExpectedHash(expectedHash);
}

async function assertBufferHashMatches(
  source: "cache" | "db" | "network",
  buffer: ArrayBuffer,
  expectedHash: string,
): Promise<void> {
  const actualHash = await sha256(buffer);
  if (actualHash !== expectedHash) {
    throw new Error("Model integrity check failed – downloaded model does not match expected hash.");
  }
}

export async function loadModel(
  url: string,
  spec: ClaritySpec,
): Promise<ArrayBuffer> {
  const expectedHash = getExpectedHashFromSpec(spec);

  const cacheBuffer = await getFromCache(url);
  if (cacheBuffer) {
    await assertBufferHashMatches("cache", cacheBuffer, expectedHash);
    return cacheBuffer;
  }

  const dbBuffer = await getModel(url);
  if (dbBuffer) {
    await assertBufferHashMatches("db", dbBuffer, expectedHash);
    await saveToCache(url, new Response(dbBuffer));
    return dbBuffer;
  }

  const networkResponse = await fetch(url);
  if (!networkResponse.ok) {
    throw new Error(`Failed to fetch model: ${networkResponse.status} ${networkResponse.statusText}`);
  }

  const networkBuffer = await networkResponse.arrayBuffer();
  await assertBufferHashMatches("network", networkBuffer, expectedHash);

  await saveToCache(url, new Response(networkBuffer));
  await saveModel(url, networkBuffer);

  return networkBuffer;
}
