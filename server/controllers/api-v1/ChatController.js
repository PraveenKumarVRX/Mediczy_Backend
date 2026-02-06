import ChatService from '../../services/api-v1/ChatService.js';
import { asyncHandler } from '../../middleware/errorHandler.js';

const chatService = new ChatService();

/**
 * Create a new chat room
 */
export const createRoom = asyncHandler(async (req, res) => {
  const room = await chatService.createRoom(req.tenantId, req.body);
  res.status(201).json(room);
});

/**
 * Get a specific chat room
 */
export const getRoom = asyncHandler(async (req, res) => {
  const room = await chatService.getRoom(req.tenantId, req.params.roomId);
  res.json(room);
});

/**
 * List all chat rooms for a user
 */
export const listRooms = asyncHandler(async (req, res) => {
  const { userId } = req.query;
  const options = {
    page: parseInt(req.query.page) || 1,
    limit: parseInt(req.query.limit) || 20,
    sortBy: req.query.sortBy || 'last_message_at',
    sortOrder: req.query.sortOrder || 'DESC'
  };
  
  const result = await chatService.listRooms(req.tenantId, userId, options);
  res.json(result);
});

/**
 * Send a message in a chat room
 */
export const sendMessage = asyncHandler(async (req, res) => {
  const { roomId } = req.params;
  const message = await chatService.sendMessage(req.tenantId, roomId, req.body);
  res.status(201).json(message);
});

/**
 * Get messages from a chat room
 */
export const getMessages = asyncHandler(async (req, res) => {
  const { roomId } = req.params;
  const options = {
    page: parseInt(req.query.page) || 1,
    limit: parseInt(req.query.limit) || 50,
    before: req.query.before,
    after: req.query.after
  };
  
  const result = await chatService.getMessages(req.tenantId, roomId, options);
  res.json(result);
});

/**
 * Mark messages as read
 */
export const markAsRead = asyncHandler(async (req, res) => {
  const { roomId } = req.params;
  const { userId } = req.body;
  
  const result = await chatService.markAsRead(req.tenantId, roomId, userId);
  res.json(result);
});

/**
 * Close a chat room
 */
export const closeRoom = asyncHandler(async (req, res) => {
  const { roomId } = req.params;
  const result = await chatService.closeRoom(req.tenantId, roomId);
  res.json(result);
});
