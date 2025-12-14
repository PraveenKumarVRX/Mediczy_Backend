// Firebase Cloud Messaging Service Worker
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Firebase configuration - must match the main app config
const firebaseConfig = {
  apiKey: "AIzaSyAuYgocNCvsNuf8uW6G43vdSw74TYraXb4",
  authDomain: "mediczy-notifications.firebaseapp.com",
  projectId: "mediczy-notifications",
  storageBucket: "mediczy-notifications.appspot.com",
  messagingSenderId: "982376166047",
  appId: "1:982376166047:web:mediczy-app-id"
};

// Initialize Firebase in service worker
firebase.initializeApp(firebaseConfig);

// Initialize Firebase Cloud Messaging
const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('📱 Received background message:', payload);

  const notificationTitle = payload.notification?.title || 'New Notification';
  const notificationOptions = {
    body: payload.notification?.body || '',
    icon: payload.notification?.icon || '/favicon.ico',
    badge: '/badge-icon.png',
    image: payload.notification?.image,
    tag: payload.data?.type || 'general',
    data: payload.data,
    requireInteraction: payload.data?.type === 'video_call',
    actions: getNotificationActions(payload.data?.type)
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Get notification actions based on type
function getNotificationActions(type) {
  switch (type) {
    case 'video_call':
      return [
        { action: 'answer', title: 'Answer' },
        { action: 'decline', title: 'Decline' }
      ];
    case 'message':
      return [
        { action: 'reply', title: 'Reply' },
        { action: 'view', title: 'View' }
      ];
    case 'appointment':
      return [
        { action: 'view', title: 'View Details' }
      ];
    default:
      return [];
  }
}

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('🔔 Notification clicked:', event.notification.data);
  
  event.notification.close();

  // Get the action clicked
  const action = event.action;
  const data = event.notification.data || {};

  // Handle different actions
  let urlToOpen = '/';

  if (action === 'answer' && data.type === 'video_call') {
    urlToOpen = `/chat/video?appointmentId=${data.callId}`;
  } else if (action === 'decline' && data.type === 'video_call') {
    // Just close, don't navigate
    return;
  } else if (action === 'reply' && data.type === 'message') {
    urlToOpen = `/chat?conversationId=${data.conversationId}`;
  } else if (action === 'view' || data.type === 'message') {
    urlToOpen = `/chat?conversationId=${data.conversationId}`;
  } else if (data.type === 'appointment') {
    urlToOpen = `/appointments?id=${data.appointmentId}`;
  } else if (data.clickAction) {
    urlToOpen = data.clickAction;
  }

  // Open or focus the window
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Check if there's already a window open
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus().then(client => {
              if ('navigate' in client) {
                return client.navigate(urlToOpen);
              }
              return client;
            });
          }
        }
        // No window open, open a new one
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

// Handle notification close
self.addEventListener('notificationclose', (event) => {
  console.log('🔔 Notification closed:', event.notification.data);
});
