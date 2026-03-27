// Service Worker for Mediczy Healthcare Platform
const CACHE_NAME = 'mediczy-v15'; // v15: force cache clear for settings page update
const ESSENTIAL_URLS = [
  '/'
];

// Install event - cache only the HTML shell for offline fallback
self.addEventListener('install', (event) => {
  console.log('🔧 ServiceWorker v14 installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('📦 Caching HTML shell only');
        return cache.addAll(ESSENTIAL_URLS);
      })
      .catch((error) => {
        console.warn('⚠️ Caching failed (non-critical):', error);
        return Promise.resolve();
      })
  );
  // Force activation immediately
  self.skipWaiting();
});

// Activate event - clean up ALL old caches and take control
self.addEventListener('activate', (event) => {
  console.log('🚀 ServiceWorker v14 activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => {
            console.log('🗑️ Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Fetch event - NEVER cache JS/CSS/assets. Only serve cached HTML when offline.
self.addEventListener('fetch', (event) => {
  // Only handle same-origin GET requests
  if (event.request.method !== 'GET' ||
      !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  const url = new URL(event.request.url);

  // For JS, CSS and asset files: always go to network, never intercept
  if (url.pathname.startsWith('/assets/') ||
      url.pathname.endsWith('.js') ||
      url.pathname.endsWith('.css')) {
    return; // Let the browser handle it normally (no SW interception)
  }

  // For API calls: always go to network, return offline JSON on failure
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(
          JSON.stringify({
            error: 'You are currently offline. Please check your internet connection.',
            offline: true,
            timestamp: new Date().toISOString()
          }),
          {
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
            status: 503
          }
        );
      })
    );
    return;
  }

  // For HTML navigation requests: network-first, fallback to cached shell
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Update cached HTML shell
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put('/', clone)).catch(() => {});
          }
          return response;
        })
        .catch(() => {
          return caches.match('/').then(r => r || new Response('Offline', { status: 503 }));
        })
    );
    return;
  }

  // Everything else: network only, no caching
  return;
});

// Handle errors gracefully
self.addEventListener('error', (event) => {
  console.warn('⚠️ ServiceWorker error (non-critical):', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
  console.warn('⚠️ ServiceWorker unhandled promise rejection:', event.reason);
  event.preventDefault();
});
