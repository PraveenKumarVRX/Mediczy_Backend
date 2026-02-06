/**
 * Chat Service - Mediqzy API v1
 * Business logic for chat functionality
 */

import BaseService from '../BaseService.js';
import { ErrorTypes } from '../../middleware/errorHandler.js';

class ChatService extends BaseService {
  constructor() {
    super('api_chat_rooms');
  }

  /**
   * Create a new chat room
   */
  async createRoom(tenantId, data) {
    const { patient_id, doctor_id, appointment_id, room_type = 'consultation' } = data;

    // Check if room already exists for this appointment
    if (appointment_id) {
      const existing = await this.query(
        'SELECT * FROM api_chat_rooms WHERE tenant_id = $1 AND appointment_id = $2 AND status = $3',
        [tenantId, appointment_id, 'active']
      );
      
      if (existing.rows.length > 0) {
        return existing.rows[0];
      }
    }

    const roomId = this.generateId('room');
    
    const result = await this.query(
      `INSERT INTO api_chat_rooms 
       (room_id, tenant_id, patient_id, doctor_id, appointment_id, room_type, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'active')
       RETURNING *`,
      [roomId, tenantId, patient_id, doctor_id, appointment_id, room_type]
    );

    return result.rows[0];
  }

  /**
   * Get room by ID
   */
  async getRoom(tenantId, roomId) {
    return await this.findById(roomId, tenantId, 'room_id');
  }

  /**
   * List rooms for a user
   */
  async listRooms(tenantId, userId, options = {}) {
    const { page = 1, limit = 20, status = 'active' } = options;
    const offset = (page - 1) * limit;

    const result = await this.query(
      `SELECT r.*, 
              COUNT(m.message_id) FILTER (WHERE m.is_read = false AND m.sender_id != $2) as unread_count
       FROM api_chat_rooms r
       LEFT JOIN api_chat_messages m ON r.room_id = m.room_id
       WHERE r.tenant_id = $1 
         AND (r.patient_id = $2 OR r.doctor_id = $2)
         AND r.status = $3
       GROUP BY r.room_id
       ORDER BY r.last_message_at DESC NULLS LAST
       LIMIT $4 OFFSET $5`,
      [tenantId, userId, status, limit, offset]
    );

    return result.rows;
  }

  /**
   * Send a message
   */
  async sendMessage(tenantId, roomId, data) {
    const { sender_id, sender_type, content, message_type = 'text', attachment } = data;

    // Verify room exists and is active
    const room = await this.getRoom(tenantId, roomId);
    if (room.status !== 'active') {
      throw ErrorTypes.BadRequest('Cannot send message to inactive room');
    }

    const messageId = this.generateId('msg');

    const result = await this.query(
      `INSERT INTO api_chat_messages 
       (message_id, room_id, sender_id, sender_type, content, message_type, attachment)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [messageId, roomId, sender_id, sender_type, content, message_type, JSON.stringify(attachment)]
    );

    // Update room's last message info
    await this.query(
      `UPDATE api_chat_rooms 
       SET last_message_at = CURRENT_TIMESTAMP,
           last_message_preview = $1
       WHERE room_id = $2`,
      [content.substring(0, 100), roomId]
    );

    return result.rows[0];
  }

  /**
   * Get messages in a room
   */
  async getMessages(tenantId, roomId, options = {}) {
    const { page = 1, limit = 50, before, after } = options;
    const offset = (page - 1) * limit;

    // Verify room exists
    await this.getRoom(tenantId, roomId);

    let whereClause = 'WHERE m.room_id = $1 AND m.is_deleted = false';
    let params = [roomId];
    let paramIndex = 2;

    if (before) {
      whereClause += ` AND m.created_at < $${paramIndex}`;
      params.push(before);
      paramIndex++;
    }

    if (after) {
      whereClause += ` AND m.created_at > $${paramIndex}`;
      params.push(after);
      paramIndex++;
    }

    const result = await this.query(
      `SELECT m.*
       FROM api_chat_messages m
       ${whereClause}
       ORDER BY m.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    return result.rows.reverse(); // Return in chronological order
  }

  /**
   * Mark messages as read
   */
  async markAsRead(tenantId, roomId, userId) {
    // Verify room exists
    await this.getRoom(tenantId, roomId);

    const result = await this.query(
      `UPDATE api_chat_messages m
       SET is_read = true, read_at = CURRENT_TIMESTAMP
       FROM api_chat_rooms r
       WHERE m.room_id = r.room_id
         AND m.room_id = $1
         AND r.tenant_id = $2
         AND m.sender_id != $3
         AND m.is_read = false
       RETURNING m.*`,
      [roomId, tenantId, userId]
    );

    return { markedCount: result.rows.length };
  }

  /**
   * Close a chat room
   */
  async closeRoom(tenantId, roomId) {
    return await this.update(roomId, { status: 'closed', closed_at: new Date() }, tenantId, 'room_id');
  }
}

export default new ChatService();
