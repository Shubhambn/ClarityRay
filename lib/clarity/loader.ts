import { getFromCache, saveToCache } from "./cache";
import { getModel, saveModel } from "./db";
import { sha256 } from "./hash";
import type { ClaritySpec } from "./types";

export interface LoadModelOptions {
  signal?: AbortSignal;
  onProgress?: (bytesLoaded: number, bytesTotal: number) => void;
}

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

async function fetchWithProgress(
  url: string,
  signal: AbortSignal | undefined,
  onProgress: ((bytesLoaded: number, bytesTotal: number) => void) | undefined,
): Promise<ArrayBuffer> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch model: ${response.status} ${response.statusText}`,
    );
  }

  const contentLength = response.headers.get("Content-Length");
  const bytesTotal = contentLength ? parseInt(contentLength, 10) : 0;

  if (!onProgress || !response.body) {
    const buffer = await response.arrayBuffer();
    onProgress?.(buffer.byteLength, buffer.byteLength);
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytesLoaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    bytesLoaded += value.byteLength;
    // bytesTotal=0 signals unknown size; caller decides how to display it
    onProgress(bytesLoaded, bytesTotal);
  }

  const merged = new Uint8Array(bytesLoaded);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged.buffer;
}

export async function loadModel(
  url: string,
  spec: ClaritySpec,
  options?: LoadModelOptions,
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
    options?.onProgress?.(cacheBuffer.byteLength, cacheBuffer.byteLength);
    return { buffer: cacheBuffer, integritySkipped: !expectedHash };
  }

  // IndexedDB path
  const dbBuffer = await getModel(url);
  if (dbBuffer) {
    if (expectedHash) {
      await verifyBufferHash(dbBuffer, expectedHash);
    }
    await saveToCache(url, new Response(dbBuffer));
    options?.onProgress?.(dbBuffer.byteLength, dbBuffer.byteLength);
    return { buffer: dbBuffer, integritySkipped: !expectedHash };
  }

  // Network fetch — streams with progress, aborts on signal
  const networkBuffer = await fetchWithProgress(url, options?.signal, options?.onProgress);

  if (expectedHash) {
    await verifyBufferHash(networkBuffer, expectedHash);
  }

  await saveToCache(url, new Response(networkBuffer));
  await saveModel(url, networkBuffer);

  return { buffer: networkBuffer, integritySkipped: !expectedHash };
}
