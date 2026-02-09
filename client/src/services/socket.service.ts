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
      console.log('Socket already connected');
      return this.socket;
    }

    this.userId = userId;
    this.userType = userType;
    this.fcmToken = fcmToken || null;

    console.log('🔌 Connecting to Socket.IO server:', SOCKET_URL);
    
    this.socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      path: '/socket.io/', // Ensure correct path
    });

    this.socket.on('connect', () => {
      console.log('✅ Socket connected:', this.socket?.id);
      this.reconnectAttempts = 0;
      this.emitUserConnect();
    });

    this.socket.on('disconnect', (reason) => {
      console.log('❌ Socket disconnected:', reason);
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

    console.log('📡 Emitting user-connect:', userData);
    this.socket.emit('user-connect', userData);
  }

  disconnect() {
    if (this.socket) {
      console.log('Disconnecting socket...');
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
