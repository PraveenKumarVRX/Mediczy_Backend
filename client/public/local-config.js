// Offline-first configuration for local development
// Place this in client/public/local-config.js

window.MEDICZY_LOCAL_CONFIG = {
  // Disable external services in local development
  DISABLE_FIREBASE: true,
  DISABLE_GOOGLE_APIS: true,
  DISABLE_PUSH_NOTIFICATIONS: true,
  
  // Local development settings
  API_BASE_URL: window.location.origin,
  
  // Service Worker settings
  SERVICE_WORKER_ENABLED: true,
  CACHE_STRATEGY: 'networkFirst',
  
  // Feature flags for local development
  FEATURES: {
    voiceRecognition: false, // May need internet
    realTimeSync: true,
    offlineMode: true,
    basicAuth: true
  },
  
  // Mock external service responses
  MOCK_SERVICES: {
    firebase: true,
    googleFit: true,
    pushNotifications: true
  }
};

// Auto-configure based on environment
if (window.location.hostname === 'localhost' || 
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname.includes('192.168')) {
  console.log('🏠 Local development mode detected');
  console.log('🔧 External services will be mocked/disabled');
}