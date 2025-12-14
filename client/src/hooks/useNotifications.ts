import { useState, useEffect, useCallback } from 'react';
import { 
  initializeFirebaseMessaging, 
  getFCMToken, 
  onMessageListener,
  FCMMessage 
} from '@/lib/firebase-config';

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'video-call' | 'message' | 'appointment' | 'system';
  timestamp: Date;
  read: boolean;
  actionable?: boolean;
  actionText?: string;
  actionCallback?: () => void;
  data?: any;
}

export type NotificationType = Notification['type'];

export interface UseNotificationsProps {
  userId: string;
  userType: 'user' | 'doctor';
  enablePushNotifications?: boolean;
}

export const useNotifications = ({ 
  userId, 
  userType, 
  enablePushNotifications = true 
}: UseNotificationsProps) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  
  // Initialize Firebase messaging on mount
  useEffect(() => {
    if (enablePushNotifications) {
      initializeFirebaseMessaging()
        .then(() => {
          // Get FCM token
          getFCMToken()
            .then(token => {
              if (token) {
                setFcmToken(token);
                console.log('FCM token obtained:', token);
              }
            })
            .catch(err => {
              console.log('FCM token not available:', err.message);
            });

          // Listen for foreground FCM messages
          onMessageListener()
            .then((payload: FCMMessage) => {
              console.log('Received FCM message:', payload);
          
          // Convert FCM message to internal notification
          if (payload.notification) {
            const fcmNotification: Notification = {
              id: Date.now().toString(),
              type: (payload.data?.type as NotificationType) || 'system',
              title: payload.notification.title || 'New Notification',
              message: payload.notification.body || '',
              timestamp: new Date(),
              read: false,
              data: payload.data || {}
            };
            
            setNotifications(prev => [fcmNotification, ...prev]);
            
            // Show browser notification if permission granted
            if (Notification.permission === 'granted') {
              new window.Notification(fcmNotification.title, {
                body: fcmNotification.message,
                icon: payload.notification.image || '/favicon.ico',
                tag: fcmNotification.type,
                data: fcmNotification.data
              });
            }
          }
        })
        .catch(err => {
          console.log('FCM message listener not available:', err.message);
        });
      })
      .catch(err => {
        console.log('Firebase messaging initialization skipped:', err.message);
      });
    }
  }, [enablePushNotifications]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [permission, setPermission] = useState<NotificationPermission>('default');

  // Request notification permission
  const requestPermission = useCallback(async () => {
    if ('Notification' in window) {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result === 'granted';
    }
    return false;
  }, []);

  // Check permission status
  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  // Add notification
  const addNotification = useCallback((notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
    const newNotification: Notification = {
      ...notification,
      id: `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      read: false,
    };

    setNotifications(prev => [newNotification, ...prev]);
    setUnreadCount(prev => prev + 1);

    // Show browser notification if permission granted and app not visible
    if (permission === 'granted' && document.hidden) {
      showBrowserNotification(newNotification);
    }

    return newNotification.id;
  }, [permission]);

  // Show browser notification
  const showBrowserNotification = useCallback((notification: Notification) => {
    if (permission === 'granted') {
      const browserNotification = new Notification(notification.title, {
        body: notification.message,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: notification.id,
        data: notification.data,
        requireInteraction: notification.type === 'video-call'
      });

      browserNotification.onclick = () => {
        window.focus();
        if (notification.actionCallback) {
          notification.actionCallback();
        }
        browserNotification.close();
      };

      // Auto close after 10 seconds (except video calls)
      if (notification.type !== 'video-call') {
        setTimeout(() => browserNotification.close(), 10000);
      }
    }
  }, [permission]);

  // Mark notification as read
  const markAsRead = useCallback((notificationId: string) => {
    setNotifications(prev => 
      prev.map(notification => 
        notification.id === notificationId 
          ? { ...notification, read: true }
          : notification
      )
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  // Mark all as read
  const markAllAsRead = useCallback(() => {
    setNotifications(prev => 
      prev.map(notification => ({ ...notification, read: true }))
    );
    setUnreadCount(0);
  }, []);

  // Remove notification
  const removeNotification = useCallback((notificationId: string) => {
    setNotifications(prev => {
      const notification = prev.find(n => n.id === notificationId);
      if (notification && !notification.read) {
        setUnreadCount(count => Math.max(0, count - 1));
      }
      return prev.filter(n => n.id !== notificationId);
    });
  }, []);

  // Clear all notifications
  const clearAll = useCallback(() => {
    setNotifications([]);
    setUnreadCount(0);
  }, []);

  // Helper functions for specific notification types
  const notifyVideoCall = useCallback((callerName: string, channelName: string, onAnswer: () => void, onDecline: () => void) => {
    return addNotification({
      title: 'Incoming Video Call',
      message: `${callerName} is calling you`,
      type: 'video-call',
      actionable: true,
      actionText: 'Answer',
      actionCallback: onAnswer,
      data: { channelName, callerName, onDecline }
    });
  }, [addNotification]);

  const notifyMessage = useCallback((senderName: string, message: string, conversationId: string) => {
    return addNotification({
      title: `New message from ${senderName}`,
      message: message.length > 50 ? message.substring(0, 50) + '...' : message,
      type: 'message',
      actionable: true,
      actionText: 'View',
      actionCallback: () => {
        // Navigate to conversation
        window.location.href = `/chat?conversation=${conversationId}`;
      },
      data: { conversationId, senderName }
    });
  }, [addNotification]);

  const notifyAppointment = useCallback((doctorName: string, appointmentTime: string, appointmentId: string) => {
    return addNotification({
      title: 'Appointment Reminder',
      message: `Your appointment with Dr. ${doctorName} is in 15 minutes`,
      type: 'appointment',
      actionable: true,
      actionText: 'Join',
      actionCallback: () => {
        // Navigate to video consultation
        window.location.href = `/consultation/${appointmentId}`;
      },
      data: { appointmentId, doctorName, appointmentTime }
    });
  }, [addNotification]);

  const notifySystemAlert = useCallback((title: string, message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    return addNotification({
      title,
      message,
      type,
      actionable: false
    });
  }, [addNotification]);

  return {
    notifications,
    unreadCount,
    permission,
    requestPermission,
    addNotification,
    markAsRead,
    markAllAsRead,
    removeNotification,
    clearAll,
    // FCM support
    fcmToken,
    // Helper functions
    notifyVideoCall,
    notifyMessage,
    notifyAppointment,
    notifySystemAlert,
  };
};