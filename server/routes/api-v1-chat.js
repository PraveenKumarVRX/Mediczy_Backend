/**
 * Chat Routes - Mediqzy API v1 (MVC Refactored)
 * Created: February 6, 2026
 * Updated: February 6, 2026 - Refactored to MVC pattern
 * 
 * Endpoints:
 * - POST /v1/{tenant-id}/chat/rooms - Create chat room
 * - GET /v1/{tenant-id}/chat/rooms - List chat rooms
 * - GET /v1/{tenant-id}/chat/rooms/{room_id} - Get room details
 * - POST /v1/{tenant-id}/chat/rooms/{room_id}/messages - Send message
 * - GET /v1/{tenant-id}/chat/rooms/{room_id}/messages - Get messages
 * - PUT /v1/{tenant-id}/chat/rooms/{room_id}/read - Mark messages as read
 * - PATCH /v1/{tenant-id}/chat/rooms/{room_id}/close - Close chat room
 */

import express from 'express';
import { verifyToken, verifyTenant, requireScopes } from '../middleware/api-auth.js';
import { chatValidation, handleValidationErrors } from '../middleware/validation.js';
import * as chatController from '../controllers/api-v1/ChatController.js';

const router = express.Router({ mergeParams: true });

// Apply authentication and tenant verification to all routes
router.use(verifyToken, verifyTenant);

/**
 * POST /v1/{tenant-id}/chat/rooms
 * Create a new chat room
 */
router.post('/rooms',
  requireScopes('chat.write'),
  chatValidation.createRoom,
  handleValidationErrors,
  chatController.createRoom
);

/**
 * GET /v1/{tenant-id}/chat/rooms
 * List chat rooms for a user
 */
router.get('/rooms',
  requireScopes('chat.read'),
  chatValidation.listMessages,
  handleValidationErrors,
  chatController.listRooms
);

/**
 * GET /v1/{tenant-id}/chat/rooms/:roomId
 * Get chat room details
 */
router.get('/rooms/:roomId',
  requireScopes('chat.read'),
  chatController.getRoom
);

/**
 * POST /v1/{tenant-id}/chat/rooms/:roomId/messages
 * Send a message in a chat room
 */
router.post('/rooms/:roomId/messages',
  requireScopes('chat.write'),
  chatValidation.sendMessage,
  handleValidationErrors,
  chatController.sendMessage
);

/**
 * GET /v1/{tenant-id}/chat/rooms/:roomId/messages
 * Get messages from a chat room
 */
router.get('/rooms/:roomId/messages',
  requireScopes('chat.read'),
  chatController.getMessages
);

/**
 * POST /v1/{tenant-id}/chat/rooms/:roomId/read
 * Mark messages as read
 */
router.post('/rooms/:roomId/read',
  requireScopes('chat.write'),
  chatController.markAsRead
);

/**
 * PATCH /v1/{tenant-id}/chat/rooms/:roomId/close
 * Close a chat room
 */
router.patch('/rooms/:roomId/close',
  requireScopes('chat.write'),
  chatController.closeRoom
);

export default router;
