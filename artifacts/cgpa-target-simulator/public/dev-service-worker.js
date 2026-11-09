const CACHE_NAME = 'studyline-dev-runtime-v2';
const SHELL_URL = new URL('index.html', self.registration.scope).href;
const OFFLINE_ASSETS = [
  SHELL_URL,
  'manifest.webmanifest',
  'studyline-icon-light.svg',
  'studyline-icon-dark.svg',
  'studyline-icon-monochrome.svg',
  'studyline-icon-192.png',
  'studyline-icon-512.png',
  'studyline-touch-icon.png',
  'studyline-favicon-light.png',
  'studyline-favicon-dark.png',
].map((file) => file === SHELL_URL ? file : new URL(file, self.registration.scope).href);
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
    await cache.addAll(OFFLINE_ASSETS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith('studyline-dev-runtime-') && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Never cache authenticated API responses (entitlement state is user-specific).
  if (url.pathname.startsWith(new URL('api/', self.registration.scope).pathname)) return;

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
