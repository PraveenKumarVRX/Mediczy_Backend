import http from "http";
import { Server } from "socket.io";
import { setupSocketIO } from "../chat/chathandler.controller.js";
import AppointmentNotificationService from "../services/appointment-notification.service.js";
import socketService from "../services/socket.service.js";
import cacheService from "../services/cache.service.js";
import { attachScribeWebSocket } from "../services/scribe-stream.service.js";

/**
 * Server Controller
 * Manages HTTP server, Socket.IO, and real-time services
 */
class ServerController {
  constructor() {
    this.server = null;
    this.io = null;
    this.notificationService = null;
    this.port = process.env.PORT || 8000;
  }

  /**
   * Create and configure HTTP server
   */
  async createServer(app) {
    this.server = http.createServer(app);
    
    // Setup Socket.IO (single instance for all services)
    this.io = setupSocketIO(this.server);
    
    // Share the existing Socket.IO instance with socketService
    // DO NOT call socketService.initialize(this.server) - it creates a duplicate Socket.IO server
    // which causes "handleUpgrade() was called more than once" errors in cluster mode
    console.log('🔌 Sharing Socket.IO instance with services...');
    socketService.setIO(this.io);
    
    // Initialize Redis Cache Service without blocking startup indefinitely.
    console.log('💾 Initializing Redis Cache Service...');
    await this.initializeCacheWithTimeout();
    
    // Initialize Appointment Notification Service
    console.log('🔔 Initializing Appointment Notification Service...');
    this.notificationService = new AppointmentNotificationService(this.io);
    this.notificationService.initialize();

    attachScribeWebSocket(this.server);
    
    return this.server;
  }

  async initializeCacheWithTimeout(timeoutMs = 4000) {
    try {
      await Promise.race([
        cacheService.initialize(),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error(`Redis init timed out after ${timeoutMs}ms`)), timeoutMs);
        }),
      ]);
    } catch (err) {
      console.warn(`⚠️  Redis not available - running without cache (${err.message})`);
    }
  }

  /**
   * Start listening on configured port
   */
  async start() {
    if (!this.server) {
      throw new Error('Server not created. Call createServer() first.');
    }

    return new Promise((resolve, reject) => {
      // Handle server errors before listening
      this.server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          console.error(`❌ Port ${this.port} is already in use. Please stop other processes using this port.`);
          reject(err);
        } else {
          console.error('❌ Server error:', err);
          reject(err);
        }
      });

      // Start server
      this.server.listen(this.port, '0.0.0.0', () => {
        console.log(`\n🚀 Server running on PORT ${this.port} and accessible on all interfaces`);
        console.log(`📊 Health Check: http://localhost:${this.port}/health`);
        console.log(`📊 DB Health: http://localhost:${this.port}/api/db/health`);
        console.log(`📊 DB Stats: http://localhost:${this.port}/api/db/stats`);
        console.log(`📈 Metrics: http://localhost:${this.port}/metrics\n`);
        resolve(this.server);
      });
    });
  }

  /**
   * Get server instance
   */
  getServer() {
    return this.server;
  }

  /**
   * Get Socket.IO instance
   */
  getIO() {
    return this.io;
  }

  /**
   * Close server gracefully
   */
  async close() {
    if (!this.server) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.server.close((err) => {
        if (err) {
          console.error('❌ Error closing HTTP server:', err);
          reject(err);
        } else {
          console.log('✅ HTTP server closed');
          resolve();
        }
      });
    });
  }
}

export default new ServerController();
