import { getFromCache, saveToCache } from "./cache";
import { getModel, saveModel } from "./db";
import { sha256 } from "./hash";
import type { ClaritySpec } from "./types";

function getOptionalHash(spec: ClaritySpec): string | undefined {
  const hash = spec.integrity?.sha256;
  if (typeof hash === "string" && hash.trim().length > 0) {
    return hash.trim().toLowerCase();
  }
  return undefined;
}

async function verifyBufferHash(
  buffer: ArrayBuffer,
  expectedHash: string,
  source: "cache" | "db" | "network",
): Promise<void> {
  const actualHash = await sha256(buffer);
  if (actualHash !== expectedHash) {
    throw new Error(
      `Model integrity check failed (${source}): hash mismatch. Expected ${expectedHash}, got ${actualHash}.`,
    );
  }
}

export async function loadModel(
  url: string,
  spec: ClaritySpec,
): Promise<{ buffer: ArrayBuffer; integritySkipped: boolean }> {
  const expectedHash = getOptionalHash(spec);

  // Cache API path
  const cacheBuffer = await getFromCache(url);
  if (cacheBuffer) {
    if (expectedHash) {
      await verifyBufferHash(cacheBuffer, expectedHash, "cache");
    }
    return { buffer: cacheBuffer, integritySkipped: !expectedHash };
  }

  // IndexedDB path
  const dbBuffer = await getModel(url);
  if (dbBuffer) {
    if (expectedHash) {
      await verifyBufferHash(dbBuffer, expectedHash, "db");
    }
    await saveToCache(url, new Response(dbBuffer));
    return { buffer: dbBuffer, integritySkipped: !expectedHash };
  }

  // Network fetch path
  const networkResponse = await fetch(url);
  if (!networkResponse.ok) {
    throw new Error(
      `Failed to fetch model: ${networkResponse.status} ${networkResponse.statusText}`,
    );
  }

  const networkBuffer = await networkResponse.arrayBuffer();

  if (expectedHash) {
    await verifyBufferHash(networkBuffer, expectedHash, "network");
  }

  await saveToCache(url, new Response(networkBuffer));
  await saveModel(url, networkBuffer);

  return { buffer: networkBuffer, integritySkipped: !expectedHash };
}
