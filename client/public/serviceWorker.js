// Service Worker for Mediczy Healthcare Platform
const CACHE_NAME = 'mediczy-v11'; // Updated cache version - branding uniformity fix
const ESSENTIAL_URLS = [
  '/',
  '/index.html'
];

// Install event - cache only essential files
self.addEventListener('install', (event) => {
  console.log('🔧 ServiceWorker v11 installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('📦 Caching essential files');
        return cache.addAll(ESSENTIAL_URLS);
      })
      .catch((error) => {
        console.warn('⚠️ Caching failed (non-critical):', error);
        // Don't fail installation if caching fails
        return Promise.resolve();
      })
  );
  // Force activation immediately
  self.skipWaiting();
});

// Activate event - clean up old caches and take control
self.addEventListener('activate', (event) => {
  console.log('🚀 ServiceWorker v9 activating...');
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
      // Take control of all clients immediately
      return self.clients.claim();
    })
  );
});

// Fetch event - network first, then cache
self.addEventListener('fetch', (event) => {
  // Only handle GET requests for same origin
  if (event.request.method !== 'GET' || 
      !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // If network request succeeds, cache it and return
        if (response && response.status === 200 && response.type === 'basic') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseClone);
            })
            .catch(() => {}); // Ignore cache errors
        }
        return response;
      })
      .catch(() => {
        // Network failed, try cache
        return caches.match(event.request)
          .then((cachedResponse) => {
            if (cachedResponse) {
              console.log('📦 Serving from cache:', event.request.url);
              return cachedResponse;
            }
            
            // No cache, return offline response for API calls
            if (event.request.url.includes('/api/')) {
              return new Response(
                JSON.stringify({
                  error: 'You are currently offline. Please check your internet connection.',
                  offline: true,
                  timestamp: new Date().toISOString()
                }),
                {
                  headers: { 
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache'
                  },
                  status: 503
                }
              );
            }
            
            // For other requests, throw to let browser handle
            throw new Error('No cache available');
          });
      })
  );
});

// Activate event - cleanup old caches
self.addEventListener('activate', (event) => {
  console.log('✅ ServiceWorker activated');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME && cacheName.startsWith('mediczy-')) {
              console.log('🗑️ Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .catch((error) => {
        console.warn('⚠️ Cache cleanup failed:', error);
      })
  );
  
  // Take control of all clients immediately
  return self.clients.claim();
});

// Handle errors gracefully
self.addEventListener('error', (event) => {
  console.warn('⚠️ ServiceWorker error (non-critical):', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
  console.warn('⚠️ ServiceWorker unhandled promise rejection:', event.reason);
  event.preventDefault(); // Prevent console error
});
