import http from "http";
import { Server } from "socket.io";
import { setupSocketIO } from "../chat/chathandler.controller.js";
import AppointmentNotificationService from "../services/appointment-notification.service.js";

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
    
    // Setup Socket.IO
    this.io = setupSocketIO(this.server);
    
    // Initialize Appointment Notification Service
    console.log('🔔 Initializing Appointment Notification Service...');
    this.notificationService = new AppointmentNotificationService(this.io);
    this.notificationService.initialize();
    
    return this.server;
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
