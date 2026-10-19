import { io, Socket } from 'socket.io-client';
import { getSocketUrl } from '@/utils/socket';

const SOCKET_URL = getSocketUrl();

class SocketService {
  private socket: Socket | null = null;
  private userId: number | null = null;
  private userType: 'user' | 'doctor' | null = null;
  private fcmToken: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  connect(userId: number, userType: 'user' | 'doctor', fcmToken?: string) {
    if (this.socket?.connected) {
      if (import.meta.env.DEV) console.log('Socket already connected');
      return this.socket;
    }

    this.userId = userId;
    this.userType = userType;
    this.fcmToken = fcmToken || null;

    if (import.meta.env.DEV) console.log('🔌 Connecting to Socket.IO server:', SOCKET_URL);
    
    this.socket = io(SOCKET_URL, {
<<<<<<< HEAD
      // Polling first: the Cloudflare edge fails the WS upgrade over HTTP/2 on this domain;
      // polling establishes over plain HTTP and upgrades when it can (single server process).
=======
      // Polling first — app.mediqzy.com is fronted by Cloudflare, whose edge
      // fails the WebSocket upgrade over the HTTP/2 connections browsers
      // negotiate by default here (confirmed: upgrade succeeds forced to
      // HTTP/1.1, fails over H2 — "Invalid frame header" / max reconnect
      // attempts client-side). Polling establishes a session over plain
      // HTTP first, then upgrades to websocket only if that succeeds,
      // instead of failing outright when websocket-first can't connect.
>>>>>>> recover/care-intelligence-mesh
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      path: '/socket.io', // Ensure correct path
    });

    this.socket.on('connect', () => {
      if (import.meta.env.DEV) console.log('✅ Socket connected:', this.socket?.id);
      this.reconnectAttempts = 0;
      this.emitUserConnect();
    });

    this.socket.on('disconnect', (reason) => {
      if (import.meta.env.DEV) console.log('❌ Socket disconnected:', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      this.reconnectAttempts++;
      
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('Max reconnection attempts reached');
      }
    });

    this.socket.on('reconnect', (attemptNumber) => {
      console.log(`✅ Socket reconnected after ${attemptNumber} attempts`);
      this.emitUserConnect();
    });

    return this.socket;
  }

  private emitUserConnect() {
    if (!this.socket || !this.userId || !this.userType) return;

    const userData = {
      userId: this.userId,
      userType: this.userType,
      ...(this.fcmToken && { fcmToken: this.fcmToken })
    };

    if (import.meta.env.DEV) console.log('📡 Emitting user-connect:', userData);
    this.socket.emit('user-connect', userData);
  }

  disconnect() {
    if (this.socket) {
      if (import.meta.env.DEV) console.log('Disconnecting socket...');
      this.socket.disconnect();
      this.socket = null;
      this.userId = null;
      this.userType = null;
      this.fcmToken = null;
    }
  }

  on(event: string, callback: (...args: any[]) => void) {
    this.socket?.on(event, callback);
  }

  off(event: string, callback?: (...args: any[]) => void) {
    this.socket?.off(event, callback);
  }

  emit(event: string, data?: any) {
    this.socket?.emit(event, data);
  }

  getSocket() {
    return this.socket;
  }

  isConnected() {
    return this.socket?.connected || false;
  }
}

export const socketService = new SocketService();
export default socketService;
