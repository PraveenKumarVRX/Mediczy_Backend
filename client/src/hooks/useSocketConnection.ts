import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Extend window type for socket
declare global {
  interface Window {
    socket: Socket | null;
  }
}

export function useSocketConnection() {
  const { currentUser, currentDoctor } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const isConnectingRef = useRef(false);

  const getUserId = useCallback(() => {
    // Handle both _id and id fields
    if (currentDoctor) {
      return (currentDoctor as unknown as { id?: number; _id?: string }).id || 
             (currentDoctor as unknown as { id?: number; _id?: string })._id;
    }
    if (currentUser) {
      return (currentUser as unknown as { id?: number; _id?: string }).id || 
             (currentUser as unknown as { id?: number; _id?: string })._id;
    }
    return null;
  }, [currentDoctor, currentUser]);

  useEffect(() => {
    // Only connect if we have a user and not already connected/connecting
    if (typeof window === 'undefined') return;
    if (!currentUser && !currentDoctor) return;
    if (isConnectingRef.current) return;
    if (socketRef.current?.connected) return;

    const userId = getUserId();
    const userType = currentDoctor ? 'doctor' : 'patient';

    if (!userId) return;

    isConnectingRef.current = true;

    // Create socket connection
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 20000,
    });

    // Store socket on window for global access (used by VideoCallNotification)
    window.socket = socket;
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('🔌 Socket connected:', socket.id);
      isConnectingRef.current = false;

      // Emit user-connect event to register this connection
      socket.emit('user-connect', {
        userId,
        userType,
        fcmToken: null // Can be added later for mobile push notifications
      });

      console.log(`📡 Socket user-connect emitted: ${userType} ${userId}`);
    });

    socket.on('disconnect', (reason) => {
      console.log('❌ Socket disconnected:', reason);
      isConnectingRef.current = false;
    });

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error.message);
      isConnectingRef.current = false;
    });

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(permission => {
        console.log('Notification permission:', permission);
      });
    }

    // Cleanup on unmount
    return () => {
      if (socketRef.current) {
        console.log('🔌 Disconnecting socket on cleanup');
        socketRef.current.disconnect();
        socketRef.current = null;
        window.socket = null;
        isConnectingRef.current = false;
      }
    };
  }, [currentUser, currentDoctor, getUserId]);

  return socketRef.current;
}
