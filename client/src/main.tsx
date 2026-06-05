import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// ── Required environment variable validation ────────────────────────────────
const REQUIRED_ENV_VARS = ['VITE_API_URL', 'VITE_GOOGLE_CLIENT_ID'] as const;
for (const key of REQUIRED_ENV_VARS) {
  if (!import.meta.env[key]) {
    console.error(`[startup] Missing required environment variable: ${key}. Some features may not work.`);
  }
}
// ───────────────────────────────────────────────────────────────────────────

// ── Stale chunk recovery ───────────────────────────────────────────────────
// After a new deployment, the browser may have cached the old HTML which
// references JS chunks that no longer exist on the CDN. Vite throws a
// "Failed to fetch dynamically imported module" TypeError. We catch it
// globally and force a one-time hard reload so the browser picks up the
// fresh index.html and all new chunk URLs.
const getCurrentBundleTag = () => {
  const scripts = Array.from(document.querySelectorAll('script[src]'));
  const appScript = scripts.find((s) => s.getAttribute('src')?.includes('/assets/index-'));
  return appScript?.getAttribute('src') || window.location.pathname;
};

const triggerChunkRecovery = () => {
  const key = 'chunk_reload_bundle';
  const bundleTag = getCurrentBundleTag();
  if (sessionStorage.getItem(key) === bundleTag) return false;
  sessionStorage.setItem(key, bundleTag);
  window.location.reload();
  return true;
};

window.addEventListener('vite:preloadError', () => {
  triggerChunkRecovery();
});

// Fallback for browsers / bundler versions that don't emit vite:preloadError
const _origOnError = window.onerror;
window.onerror = function (msg, _src, _line, _col, err) {
  if (
    err instanceof TypeError &&
    (String(msg).includes('Failed to fetch dynamically imported module') ||
      String(msg).includes('Importing a module script failed'))
  ) {
    if (triggerChunkRecovery()) {
      return true; // suppress console error
    }
  }
  if (_origOnError) return _origOnError.apply(this, arguments as any);
};

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  const message = String(reason?.message || reason || '');
  if (
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('Importing a module script failed')
  ) {
    if (triggerChunkRecovery()) {
      event.preventDefault();
    }
  }
});

window.addEventListener('error', (event) => {
  const target = event.target as HTMLScriptElement | HTMLLinkElement | null;
  const src = (target as HTMLScriptElement | null)?.src || (target as HTMLLinkElement | null)?.href || '';
  if (src.includes('/assets/') && (src.endsWith('.js') || src.endsWith('.css'))) {
    triggerChunkRecovery();
  }
}, true);
// ──────────────────────────────────────────────────────────────────────────

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Enhanced Service Worker Registration with better error handling
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    const SW_VERSION = 'v20';
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    Promise.all([
      // Register main service worker
      navigator.serviceWorker.register(`/serviceWorker.js?${SW_VERSION}`)
        .then((registration) => {
          console.log('✅ Main ServiceWorker registered:', registration.scope);

          registration.update();
          if (registration.waiting) {
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (!newWorker) return;
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                newWorker.postMessage({ type: 'SKIP_WAITING' });
              }
            });
          });

          return registration;
        })
        .catch((error) => {
          console.log('⚠️ Main ServiceWorker registration failed (non-critical):', error.message);
          return null;
        }),
      
      // Firebase messaging service worker disabled for SSL compatibility
      // navigator.serviceWorker.register('/firebase-messaging-sw.js')
      //   .then((registration) => {
      //     console.log('✅ Firebase messaging ServiceWorker registered:', registration.scope);
      //     return registration;
      //   })
      //   .catch((error) => {
      //     console.log('⚠️ Firebase messaging ServiceWorker registration failed (non-critical):', error.message);
      //     console.log('🔔 Push notifications may not work properly');
      //     return null;
      //   })
      Promise.resolve(null) // Return null instead of Firebase SW registration
    ])
    .then((registrations) => {
      const [mainSW, firebaseSW] = registrations;
      
      console.log('🔧 Service Worker registration summary:');
      console.log('  Main SW:', mainSW ? '✅ Active' : '❌ Failed');
      console.log('  Firebase SW: 🚫 Disabled for SSL compatibility');
      
      // App will continue to work even if service workers fail
    })
    .catch((error) => {
      console.log('⚠️ Service Worker initialization error (non-critical):', error.message);
    });
  });
} else {
  if (!('serviceWorker' in navigator)) {
    console.log('🔔 Service Workers not supported in this browser');
  }
  if (!window.isSecureContext) {
    console.log('🔔 Service Workers require secure context (HTTPS)');
  }
}
