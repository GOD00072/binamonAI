import { io, Socket } from 'socket.io-client';

class SocketService {
  private socket: Socket | null = null;
  private url: string;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;

  constructor() {
    this.url = process.env.REACT_APP_SOCKET_URL || 'localhost:3001';
  }

  connect(): void {
    if (!this.socket) {
      console.log('🔌 Connecting to Socket.IO server:', this.url);
      
      this.socket = io(this.url, {
        autoConnect: true,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: this.maxReconnectAttempts,
        timeout: 2000000000,
        transports: ['websocket', 'polling'],
      });

      this.socket.on('connect', () => {
        console.log('✅ Socket connected:', this.socket?.id);
        this.reconnectAttempts = 0;
      });

      this.socket.on('disconnect', (reason) => {
        console.log('🔴 Socket disconnected:', reason);
      });

      this.socket.on('connect_error', (error) => {
        console.error('❌ Socket connection error:', error);
        this.reconnectAttempts++;
        
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          console.error('🔴 Max reconnection attempts reached');
        }
      });

      this.socket.on('reconnect', (attemptNumber) => {
        console.log('🔄 Socket reconnected after', attemptNumber, 'attempts');
        this.reconnectAttempts = 0;
      });

      this.socket.on('reconnect_error', (error) => {
        console.error('❌ Socket reconnection error:', error);
      });

      this.socket.on('reconnect_failed', () => {
        console.error('🔴 Socket reconnection failed');
      });
    }
  }

  disconnect(): void {
    if (this.socket) {
      console.log('🔌 Disconnecting from Socket.IO server');
      this.socket.disconnect();
      this.socket = null;
    }
  }

  on(event: string, callback: (data: any) => void): void {
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  off(event: string, callback?: (data: any) => void): void {
    if (this.socket) {
      if (callback) {
        this.socket.off(event, callback);
      } else {
        this.socket.off(event);
      }
    }
  }

  emit(event: string, data?: any): void {
    if (this.socket && this.socket.connected) {
      this.socket.emit(event, data);
    } else {
      console.warn('⚠️ Socket not connected, cannot emit event:', event);
    }
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}

export const socketService = new SocketService();
export default socketService;
