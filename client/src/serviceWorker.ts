// Cache version is injected at build time via Vite define; falls back to a
// timestamp so local dev always starts with a fresh cache.
declare const __SW_CACHE_VERSION__: string;
const _cacheVersion = (typeof __SW_CACHE_VERSION__ !== 'undefined' ? __SW_CACHE_VERSION__ : Date.now().toString());
const CACHE_NAME = `health-app-${_cacheVersion}`;
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/offline.html',
  // Add other static assets paths
];

const API_CACHE_NAME = `api-cache-${_cacheVersion}`;

// Only cache genuinely public, non-personal API responses.
// Authenticated responses (profile, prescriptions, reports, wallet, etc.)
// must NEVER be cached — they contain PHI and could be read by the next user
// on a shared device even after logout.
const PUBLIC_API_PREFIXES = [
  '/api/masterdata/',
  '/api/labs',
  '/api/doctors/search',
  '/api/doctors/available',
  '/api/masterdata/specialties',
  '/api/masterdata/cities',
];

self.addEventListener('install', (event: any) => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then((cache) => {
        return cache.addAll(STATIC_ASSETS);
      }),
      caches.open(API_CACHE_NAME)
    ])
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event: any) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event: any) => {
  const request = event.request;
  const url = new URL(request.url);

  // Always prefer fresh HTML for app navigation so new deployments load immediately.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clonedResponse = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put('/index.html', clonedResponse);
          });
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Handle API requests — only cache explicitly whitelisted public endpoints.
  // All authenticated API responses bypass the cache to prevent PHI leakage.
  if (url.pathname.startsWith('/api/')) {
    const isCacheable = PUBLIC_API_PREFIXES.some(prefix => url.pathname.startsWith(prefix));
    if (isCacheable) {
      event.respondWith(
        fetch(request)
          .then((response) => {
            const clonedResponse = response.clone();
            caches.open(API_CACHE_NAME).then((cache) => {
              cache.put(request, clonedResponse);
            });
            return response;
          })
          .catch(() => caches.match(request))
      );
    }
    // Authenticated API requests fall through to normal network fetch (no caching).
    return;
  }

  // Handle static assets
  event.respondWith(
    caches.match(request).then((response) => {
      return response || fetch(request).then((fetchResponse) => {
        // Clone and cache new static assets
        const clonedResponse = fetchResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, clonedResponse);
        });
        return fetchResponse;
      });
    })
  );
}); 

self.addEventListener('message', (event: any) => {
  if (event?.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});