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
): Promise<void> {
  const actualHash = await sha256(buffer);
  if (actualHash !== expectedHash) {
    throw new Error("Integrity verification failed");
  }
}

export async function loadModel(
  url: string,
  spec: ClaritySpec,
): Promise<{ buffer: ArrayBuffer; integritySkipped: boolean }> {
  const expectedHash = getOptionalHash(spec);
  if (!expectedHash) {
    console.warn("Model loaded without integrity verification (sha256 not in spec)");
  }

  // Cache API path
  const cacheBuffer = await getFromCache(url);
  if (cacheBuffer) {
    if (expectedHash) {
      await verifyBufferHash(cacheBuffer, expectedHash);
    }
    return { buffer: cacheBuffer, integritySkipped: !expectedHash };
  }

  // IndexedDB path
  const dbBuffer = await getModel(url);
  if (dbBuffer) {
    if (expectedHash) {
      await verifyBufferHash(dbBuffer, expectedHash);
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
    await verifyBufferHash(networkBuffer, expectedHash);
  }

  await saveToCache(url, new Response(networkBuffer));
  await saveModel(url, networkBuffer);

  return { buffer: networkBuffer, integritySkipped: !expectedHash };
}
