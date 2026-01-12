import { useEffect } from 'react';
import { useAuth } from '@/auth/AuthProvider';

export function useSocketConnection() {
  const { currentUser, currentDoctor } = useAuth();

  useEffect(() => {
    // Initialize socket connection
    if (typeof window !== 'undefined' && (currentUser || currentDoctor)) {
      const socket = (window as any).socket;
      
      if (socket && socket.connected) {
        const userId = currentDoctor?.id || currentUser?.id;
        const userType = currentDoctor ? 'doctor' : 'patient';
        
        // Connect user to their notification room
        socket.emit('user-connect', {
          userId,
          userType,
          fcmToken: null // Can be added later for mobile push notifications
        });

        console.log(`🔌 Socket connected: ${userType} ${userId}`);

        // Request notification permission
        if ('Notification' in window && Notification.permission === 'default') {
          Notification.requestPermission().then(permission => {
            console.log('Notification permission:', permission);
          });
        }
      }
    }
  }, [currentUser, currentDoctor]);
}
