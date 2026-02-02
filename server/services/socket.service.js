/**
 * WebSocket Service for Real-time Notifications
 * Handles Socket.IO connections and events
 */

import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import logger from '../config/logger.js';  // Default export

class SocketService {
  constructor() {
    this.io = null;
    this.connectedUsers = new Map(); // userId -> socketId mapping
  }

  /**
   * Initialize Socket.IO server
   * @param {Object} httpServer - HTTP server instance
   */
  initialize(httpServer) {
    this.io = new Server(httpServer, {
      cors: {
        origin: process.env.CLIENT_URL || 'http://localhost:3000',
        methods: ['GET', 'POST'],
        credentials: true
      },
      pingTimeout: 60000,
      pingInterval: 25000
    });

    // SECURITY: JWT authentication middleware for Socket.IO
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || 
                      socket.handshake.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
          logger.warn('Socket connection without token', { socketId: socket.id });
          return next(new Error('Authentication token required'));
        }

        // Verify JWT
        const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
        
        // Attach verified user data to socket
        socket.userId = decoded.id;
        socket.userType = decoded.userType || decoded.role;
        socket.organizationId = decoded.organization_id;
        socket.email = decoded.email;
        
        logger.info('Socket authenticated via JWT', {
          userId: socket.userId,
          userType: socket.userType,
          socketId: socket.id
        });
        
        next();
      } catch (error) {
        logger.error('Socket authentication failed', {
          error: error.message,
          socketId: socket.id
        });
        next(new Error('Invalid authentication token'));
      }
    });

    this.setupEventHandlers();
    console.log('✓ Socket.IO server initialized with JWT authentication');
  }

  /**
   * Setup event handlers
   */
  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      // User is already authenticated via JWT middleware
      const { userId, userType, organizationId, email } = socket;
      
      console.log(`Client connected: ${socket.id} (User: ${userId})`);
      
      // Store user connection with verified data
      this.connectedUsers.set(userId, {
        socketId: socket.id,
        userType,
        organizationId,
        email,
        connectedAt: new Date()
      });

      // Join user-specific room
      socket.join(`user:${userId}`);
      
      // Join organization room (for hospital users)
      if (organizationId) {
        socket.join(`org:${organizationId}`);
      }

      logger.info('User connected to Socket.IO', {
        userId,
        userType,
        organizationId,
        socketId: socket.id
      });
      
      socket.emit('authenticated', {
        success: true,
        userId,
        message: 'Connected to real-time notifications'
      });
      
      // REMOVED: Old authenticate event (no longer needed - JWT handles auth)

      // Handle disconnection
      socket.on('disconnect', () => {
        // Remove user from connected users
        for (const [userId, data] of this.connectedUsers.entries()) {
          if (data.socketId === socket.id) {
            this.connectedUsers.delete(userId);
            console.log(`User ${userId} disconnected`);
            break;
          }
        }
      });

      // Ping/pong for connection health
      socket.on('ping', () => {
        socket.emit('pong', { timestamp: Date.now() });
      });
    });
  }

  /**
   * Emit claim status update
   * @param {number} claimId - Claim ID
   * @param {Object} data - Update data
   */
  emitClaimUpdate(claimId, data) {
    if (!this.io) return;

    const notification = {
      type: 'claim_update',
      claimId,
      timestamp: new Date().toISOString(),
      ...data
    };

    // Emit to specific user if userId is provided
    if (data.userId) {
      this.io.to(`user:${data.userId}`).emit('claim:update', notification);
    }

    // Emit to organization
    if (data.hospitalId) {
      this.io.to(`org:${data.hospitalId}`).emit('claim:update', notification);
    }

    console.log(`Claim update emitted: ${claimId} - ${data.status}`);
  }

  /**
   * Emit pre-authorization update
   * @param {number} preAuthId - Pre-auth ID
   * @param {Object} data - Update data
   */
  emitPreAuthUpdate(preAuthId, data) {
    if (!this.io) return;

    const notification = {
      type: 'preauth_update',
      preAuthId,
      timestamp: new Date().toISOString(),
      ...data
    };

    if (data.userId) {
      this.io.to(`user:${data.userId}`).emit('preauth:update', notification);
    }

    if (data.hospitalId) {
      this.io.to(`org:${data.hospitalId}`).emit('preauth:update', notification);
    }

    console.log(`Pre-auth update emitted: ${preAuthId} - ${data.status}`);
  }

  /**
   * Emit document update notification
   * @param {Object} data - Document data
   */
  emitDocumentUpdate(data) {
    if (!this.io) return;

    const notification = {
      type: 'document_update',
      timestamp: new Date().toISOString(),
      ...data
    };

    if (data.userId) {
      this.io.to(`user:${data.userId}`).emit('document:update', notification);
    }

    if (data.hospitalId) {
      this.io.to(`org:${data.hospitalId}`).emit('document:update', notification);
    }
  }

  /**
   * Emit query/clarification request
   * @param {Object} data - Query data
   */
  emitQueryRequest(data) {
    if (!this.io) return;

    const notification = {
      type: 'query_request',
      timestamp: new Date().toISOString(),
      message: 'Insurance provider has requested additional information',
      ...data
    };

    if (data.userId) {
      this.io.to(`user:${data.userId}`).emit('query:new', notification);
    }

    if (data.hospitalId) {
      this.io.to(`org:${data.hospitalId}`).emit('query:new', notification);
    }
  }

  /**
   * Emit settlement notification
   * @param {Object} data - Settlement data
   */
  emitSettlementNotification(data) {
    if (!this.io) return;

    const notification = {
      type: 'settlement_update',
      timestamp: new Date().toISOString(),
      ...data
    };

    if (data.hospitalId) {
      this.io.to(`org:${data.hospitalId}`).emit('settlement:update', notification);
    }
  }

  /**
   * Send notification to specific user
   * @param {number} userId - User ID
   * @param {Object} notification - Notification data
   */
  sendToUser(userId, notification) {
    if (!this.io) return;

    this.io.to(`user:${userId}`).emit('notification', {
      timestamp: new Date().toISOString(),
      ...notification
    });
  }

  /**
   * Send notification to organization
   * @param {number} organizationId - Organization ID
   * @param {Object} notification - Notification data
   */
  sendToOrganization(organizationId, notification) {
    if (!this.io) return;

    this.io.to(`org:${organizationId}`).emit('notification', {
      timestamp: new Date().toISOString(),
      ...notification
    });
  }

  /**
   * Get connected users count
   */
  getConnectedUsersCount() {
    return this.connectedUsers.size;
  }

  /**
   * Check if user is online
   * @param {number} userId - User ID
   */
  isUserOnline(userId) {
    return this.connectedUsers.has(userId);
  }

  /**
   * Get socket instance
   */
  getIO() {
    return this.io;
  }
}

export default new SocketService();
