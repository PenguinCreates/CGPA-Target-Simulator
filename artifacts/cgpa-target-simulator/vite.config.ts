import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    'PORT environment variable is required but was not provided.',
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    'BASE_PATH environment variable is required but was not provided.',
  );
}

function collectPublicFiles(directory: string, prefix = ''): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.posix.join(prefix, entry.name);
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectPublicFiles(absolutePath, relativePath);
    return entry.isFile() ? [relativePath] : [];
  });
}

function offlineShellPlugin(): Plugin {
  return {
    name: 'studyline-offline-shell',
    apply: 'build' as const,
    generateBundle(_options, bundle) {
      const publicFiles = collectPublicFiles(path.resolve(import.meta.dirname, 'public'))
        .filter((file) => file !== 'dev-service-worker.js');
      const files = [...new Set(['index.html', ...Object.keys(bundle), ...publicFiles])]
        .filter((file) => file !== 'service-worker.js')
        .sort();
      const versionHash = createHash('sha256').update(files.join('\n'));
      for (const file of publicFiles) {
        versionHash.update(file);
        versionHash.update(readFileSync(path.resolve(import.meta.dirname, 'public', file)));
      }
      const version = versionHash.digest('hex').slice(0, 12);
      const precacheUrls = files.map((file) => `${basePath}${file}`);
      const worker = `
const CACHE_NAME = 'studyline-shell-${version}';
const PRECACHE_URLS = ${JSON.stringify(precacheUrls)};
const SHELL_URL = new URL(${JSON.stringify(`${basePath}index.html`)}, self.location.origin).href;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(PRECACHE_URLS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith('studyline-shell-') && name !== CACHE_NAME).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Never cache authenticated API responses (entitlement state is user-specific).
  if (url.pathname.startsWith(${JSON.stringify(`${basePath}api/`)})) return;

  if (request.mode === 'navigate' && url.pathname.startsWith(new URL(self.registration.scope).pathname)) {
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch {
        return (await caches.match(request)) || (await caches.match(SHELL_URL)) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) {
        try {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        } catch {
          // Cache storage is best effort and must not interrupt online requests.
        }
      }
      return response;
    } catch {
      return Response.error();
    }
  })());
});
`;
      this.emitFile({ type: 'asset', fileName: 'service-worker.js', source: worker });
    },
  };
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    offlineShellPlugin(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
