const CACHE_NAME = 'studyline-dev-runtime-v1';
const SHELL_URL = new URL('index.html', self.registration.scope).href;
const MAX_CACHE_ENTRIES = 100;

function cacheKey(request) {
  const url = new URL(request.url);
  url.searchParams.delete('t');
  return url.href;
}

async function remember(cache, request, response) {
  await cache.put(cacheKey(request), response.clone());
  let keys = await cache.keys();
  while (keys.length > MAX_CACHE_ENTRIES) {
    const oldest = keys.find((key) => key.url !== SHELL_URL);
    if (!oldest) break;
    await cache.delete(oldest);
    keys = await cache.keys();
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      await cache.add(SHELL_URL);
    } catch {
      // A failed first fetch must not prevent the app from loading online.
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate' && url.pathname.startsWith(new URL(self.registration.scope).pathname)) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          try {
            const cache = await caches.open(CACHE_NAME);
            await remember(cache, new Request(SHELL_URL), response);
          } catch {
            // Caching is best effort; a cache quota issue must not break online use.
          }
        }
        return response;
      } catch {
        return (await caches.match(request)) || (await caches.match(SHELL_URL)) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok) {
        try {
          const cache = await caches.open(CACHE_NAME);
          await remember(cache, request, response);
        } catch {
          // Caching is best effort; a cache quota issue must not break online use.
        }
      }
      return response;
    } catch {
      return (await caches.match(cacheKey(request))) || Response.error();
    }
  })());
});
