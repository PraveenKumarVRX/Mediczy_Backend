/* Medstar CRM: intentionally empty service worker. The app registers /serviceWorker.js on every load;
 * the platform's own worker caches pages offline, which would keep stale copies of the CRM in browsers.
 * This one caches nothing and handles no requests, so the registration succeeds and nothing is cached. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))).then(() => self.clients.claim())));
