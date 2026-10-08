/**
 * Service worker. Caches the APP SHELL and STATIC ASSETS ONLY, and handles Web Push.
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

/**
 * Web Push. The payload is {title, body, url} from the send_outbox Edge Function.
 * Every push MUST show a notification (iOS revokes the subscription otherwise).
 */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {};
  }
  const title = typeof data.title === 'string' && data.title ? data.title : self.location.hostname;
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === 'string' ? data.body : '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: typeof data.url === 'string' ? data.url : '/today' },
    }),
  );
});

/** Opens the screen named in the payload: focus an open window, else open a new one. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const raw = event.notification.data && event.notification.data.url;
  // Same-origin paths only.
  const path = typeof raw === 'string' && /^\/[^/\\]/.test(raw) ? raw : '/today';
  const target = new URL(path, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => c.url.startsWith(self.location.origin));
      if (open) {
        return open.focus().then(() => ('navigate' in open ? open.navigate(target) : undefined));
      }
      return self.clients.openWindow(target);
    }),
  );
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
