/**
 * Service worker (STUB). Caches the APP SHELL and STATIC ASSETS ONLY.
 * Never caches Supabase/API responses or any cross-origin request: data caching is
 * TanStack Query's job and private data must not sit in the SW cache.
 *
 * Bump CACHE_VERSION when the caching rules change. New builds are detected by the
 * browser byte-comparing this file; the app then shows "Update available" and posts
 * SKIP_WAITING (see src/lib/pwa/registerServiceWorker.ts).
 */
const CACHE_VERSION = 'v1';
const SHELL_CACHE = `shell-${CACHE_VERSION}`;
const STATIC_CACHE = `static-${CACHE_VERSION}`;

const SHELL_URLS = ['/', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];

/** Same-origin paths that are safe to cache (hashed build output, icons, fonts). */
const STATIC_PATH_PREFIXES = ['/_expo/static/', '/assets/', '/icons/'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== STATIC_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Only same-origin. Supabase, Google Fonts and any other origin go straight to the network.
  if (url.origin !== self.location.origin) return;

  // Page navigations: network first, fall back to the cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('/', { cacheName: SHELL_CACHE }).then((res) => res || Response.error()),
      ),
    );
    return;
  }

  // Static build assets: cache first (file names are content-hashed).
  if (STATIC_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) =>
        cache.match(request).then(
          (cached) =>
            cached ||
            fetch(request).then((response) => {
              if (response.ok) cache.put(request, response.clone());
              return response;
            }),
        ),
      ),
    );
  }
});
