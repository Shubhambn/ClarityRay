export async function getFromCache(url: string): Promise<ArrayBuffer | null> {
  const cache = await caches.open("clarityray-models");
  const cachedResponse = await cache.match(url);

  if (!cachedResponse) {
    return null;
  }

  return cachedResponse.arrayBuffer();
}

export async function saveToCache(url: string, response: Response): Promise<void> {
  const cache = await caches.open("clarityray-models");
  await cache.put(url, response.clone());
}
