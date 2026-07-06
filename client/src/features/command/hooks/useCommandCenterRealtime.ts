import { useEffect } from 'react';
import socketService from '@/services/socket.service';

/** Subscribe to hospital command-center refresh events; falls back to interval. */
export function useCommandCenterRealtime(onRefresh: () => void, fallbackMs = 30_000) {
  useEffect(() => {
    const socket = socketService.getSocket();
    const channel = 'hospital:command-center';

    const handler = () => onRefresh();

    if (socket?.connected) {
      socket.on(channel, handler);
      socket.emit('join', { room: channel });
      return () => {
        socket.off(channel, handler);
        socket.emit('leave', { room: channel });
      };
    }

    const interval = window.setInterval(onRefresh, fallbackMs);
    return () => window.clearInterval(interval);
  }, [onRefresh, fallbackMs]);
}
