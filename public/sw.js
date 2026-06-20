/**
 * ClarityRay Service Worker — offline model access
 *
 * Strategy:
 *  - Model ONNX binaries  → cache-first (large, immutable per version)
 *  - Clarity spec JSON    → stale-while-revalidate (small, changes with version)
 *  - Static manifest.json → stale-while-revalidate
 *  - Everything else      → network-only (pass-through, SW does not interfere)
 *
 * The Cache API used here is separate from the one in lib/clarity/cache.ts.
 * Both caches point to the same browser cache storage under the same keys,
 * so a hit in one is a hit in the other.
 */

const CACHE_NAME = 'clarityray-offline-v1'

const CACHE_FIRST_PATTERNS = [
  /\/models\/[^/]+\/[^/]+\.onnx(\?.*)?$/,
]

const SWR_PATTERNS = [
  /\/models\/[^/]+\/clarity\.json(\?.*)?$/,
  /\/models\/manifest\.json(\?.*)?$/,
]

self.addEventListener('install', (event) => {
  // Activate immediately — don't wait for existing tabs to close
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Prune old cache versions
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      ),
    ]),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  const path = url.pathname

  if (CACHE_FIRST_PATTERNS.some((p) => p.test(path))) {
    event.respondWith(cacheFirst(request))
    return
  }

  if (SWR_PATTERNS.some((p) => p.test(path))) {
    event.respondWith(staleWhileRevalidate(request))
    return
  }

  // All other requests: network-only (Next.js pages, API routes, assets)
})

// ─── Strategies ───────────────────────────────────────────────────────────────

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(request)
  if (cached) return cached

  try {
    const response = await fetch(request)
    if (response.ok) {
      cache.put(request, response.clone())
    }
    return response
  } catch (err) {
    return new Response('Offline — model not cached yet', { status: 503 })
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(request)

  const networkPromise = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone())
      return response
    })
    .catch(() => null)

  // Return cached immediately; update in background
  if (cached) {
    networkPromise.catch(() => null) // fire-and-forget
    return cached
  }

  // No cached copy — must wait for network
  const response = await networkPromise
  if (response) return response
  return new Response('Offline — resource not cached', { status: 503 })
}
