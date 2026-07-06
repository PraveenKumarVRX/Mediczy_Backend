import { useEffect } from 'react';
import socketService from '@/services/socket.service';
import { useWorkspace } from './useWorkspace';

/**
 * Subscribe to workspace realtime events (timeline, alerts).
 * Falls back gracefully when socket is unavailable.
 */
export function useWorkspaceRealtime(patientId: number, onEvent?: () => void) {
  const { refresh } = useWorkspace();

  useEffect(() => {
    if (!patientId) return;

    const channel = `workspace:${patientId}`;
    const socket = socketService.getSocket?.() ?? null;

    const handler = () => {
      onEvent?.();
      refresh();
    };

    if (socket) {
      socket.on(channel, handler);
      socket.emit('join', { room: channel });
      return () => {
        socket.off(channel, handler);
        socket.emit('leave', { room: channel });
      };
    }

    const interval = window.setInterval(() => {
      refresh();
    }, 60_000);

    return () => window.clearInterval(interval);
  }, [patientId, refresh, onEvent]);
}
