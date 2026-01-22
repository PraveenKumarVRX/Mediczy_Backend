/**
 * Redis-based Chat Storage
 * Replaces in-memory Maps for cluster mode compatibility
 * 
 * All chat rooms and messages are stored in Redis, allowing
 * multiple PM2 cluster workers to share the same data.
 */

import { cache } from '../db/redis.js';

// Redis key prefixes
const ROOM_PREFIX = 'chat:room:';
const MESSAGES_PREFIX = 'chat:messages:';
const ROOM_LIST_KEY = 'chat:rooms:list';

// TTL for chat data (7 days)
const CHAT_TTL = 7 * 24 * 60 * 60;

/**
 * Chat Room Storage Operations
 */
export const chatRoomStorage = {
  /**
   * Check if a room exists
   * @param {string} roomId - Room ID
   * @returns {Promise<boolean>}
   */
  async has(roomId) {
    return await cache.exists(`${ROOM_PREFIX}${roomId}`);
  },

  /**
   * Get a room by ID
   * @param {string} roomId - Room ID
   * @returns {Promise<Object|null>}
   */
  async get(roomId) {
    return await cache.get(`${ROOM_PREFIX}${roomId}`);
  },

  /**
   * Set/create a room
   * @param {string} roomId - Room ID
   * @param {Object} roomData - Room data
   * @returns {Promise<boolean>}
   */
  async set(roomId, roomData) {
    const success = await cache.set(`${ROOM_PREFIX}${roomId}`, roomData, CHAT_TTL);
    if (success) {
      // Add to room list
      const roomList = await cache.get(ROOM_LIST_KEY) || [];
      if (!roomList.includes(roomId)) {
        roomList.push(roomId);
        await cache.set(ROOM_LIST_KEY, roomList, CHAT_TTL);
      }
    }
    return success;
  },

  /**
   * Delete a room
   * @param {string} roomId - Room ID
   * @returns {Promise<boolean>}
   */
  async delete(roomId) {
    await cache.del(`${ROOM_PREFIX}${roomId}`);
    await cache.del(`${MESSAGES_PREFIX}${roomId}`);
    // Remove from room list
    const roomList = await cache.get(ROOM_LIST_KEY) || [];
    const newList = roomList.filter(id => id !== roomId);
    await cache.set(ROOM_LIST_KEY, newList, CHAT_TTL);
    return true;
  },

  /**
   * Get all rooms
   * @returns {Promise<Array<[string, Object]>>}
   */
  async entries() {
    const roomList = await cache.get(ROOM_LIST_KEY) || [];
    const entries = [];
    for (const roomId of roomList) {
      const room = await cache.get(`${ROOM_PREFIX}${roomId}`);
      if (room) {
        entries.push([roomId, room]);
      }
    }
    return entries;
  },

  /**
   * Get all room IDs
   * @returns {Promise<string[]>}
   */
  async keys() {
    return await cache.get(ROOM_LIST_KEY) || [];
  },

  /**
   * Get all room values
   * @returns {Promise<Object[]>}
   */
  async values() {
    const roomList = await cache.get(ROOM_LIST_KEY) || [];
    const rooms = [];
    for (const roomId of roomList) {
      const room = await cache.get(`${ROOM_PREFIX}${roomId}`);
      if (room) {
        rooms.push(room);
      }
    }
    return rooms;
  }
};

/**
 * Chat Messages Storage Operations
 */
export const chatMessagesStorage = {
  /**
   * Check if messages exist for a room
   * @param {string} roomId - Room ID
   * @returns {Promise<boolean>}
   */
  async has(roomId) {
    return await cache.exists(`${MESSAGES_PREFIX}${roomId}`);
  },

  /**
   * Get messages for a room
   * @param {string} roomId - Room ID
   * @returns {Promise<Array>}
   */
  async get(roomId) {
    return await cache.get(`${MESSAGES_PREFIX}${roomId}`) || [];
  },

  /**
   * Set messages for a room (replaces all messages)
   * @param {string} roomId - Room ID
   * @param {Array} messages - Array of messages
   * @returns {Promise<boolean>}
   */
  async set(roomId, messages) {
    return await cache.set(`${MESSAGES_PREFIX}${roomId}`, messages, CHAT_TTL);
  },

  /**
   * Add a message to a room
   * @param {string} roomId - Room ID
   * @param {Object} message - Message object
   * @returns {Promise<boolean>}
   */
  async push(roomId, message) {
    const messages = await this.get(roomId);
    messages.push(message);
    // Keep only last 1000 messages per room
    if (messages.length > 1000) {
      messages.splice(0, messages.length - 1000);
    }
    return await this.set(roomId, messages);
  },

  /**
   * Delete messages for a room
   * @param {string} roomId - Room ID
   * @returns {Promise<boolean>}
   */
  async delete(roomId) {
    return await cache.del(`${MESSAGES_PREFIX}${roomId}`);
  }
};

/**
 * Legacy compatibility layer
 * These provide a Map-like interface for backward compatibility
 */
export const chatRooms = {
  has: (roomId) => chatRoomStorage.has(roomId),
  get: (roomId) => chatRoomStorage.get(roomId),
  set: (roomId, data) => chatRoomStorage.set(roomId, data),
  delete: (roomId) => chatRoomStorage.delete(roomId),
  entries: () => chatRoomStorage.entries(),
  keys: () => chatRoomStorage.keys(),
  values: () => chatRoomStorage.values()
};

export const messages = {
  has: (roomId) => chatMessagesStorage.has(roomId),
  get: (roomId) => chatMessagesStorage.get(roomId),
  set: (roomId, data) => chatMessagesStorage.set(roomId, data),
  delete: (roomId) => chatMessagesStorage.delete(roomId),
  push: (roomId, message) => chatMessagesStorage.push(roomId, message)
};

export default {
  chatRooms,
  messages,
  chatRoomStorage,
  chatMessagesStorage
};
