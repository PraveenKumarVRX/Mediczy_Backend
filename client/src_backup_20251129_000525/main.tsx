import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

createRoot(document.getElementById("root")!).render(<App />);

// Enhanced Service Worker Registration with better error handling
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    Promise.all([
      // Register main service worker
      navigator.serviceWorker.register('/serviceWorker.js')
        .then((registration) => {
          console.log('✅ Main ServiceWorker registered:', registration.scope);
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
