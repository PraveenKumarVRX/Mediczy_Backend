/**
 * RocketChat Service
 * Handles integration with self-hosted RocketChat instance
 */

import axios from 'axios';
import ROCKETCHAT_CONFIG from '../config/rocketchat.config.js';
import logger from '../config/logger.js';

class RocketChatService {
  constructor() {
    this.baseUrl = ROCKETCHAT_CONFIG.api.baseUrl;
    this.userId = ROCKETCHAT_CONFIG.userId;
    this.authToken = ROCKETCHAT_CONFIG.authToken;
    this.timeout = ROCKETCHAT_CONFIG.timeout.api;
  }

  /**
   * Get default headers for RocketChat API
   */
  getHeaders() {
    return {
      'Content-Type': 'application/json',
      'X-Auth-Token': this.authToken,
      'X-User-Id': this.userId
    };
  }

  /**
   * Make API request to RocketChat
   */
  async makeRequest(method, endpoint, data = null) {
    try {
      const config = {
        method,
        url: `${this.baseUrl}${endpoint}`,
        headers: this.getHeaders(),
        timeout: this.timeout
      };

      if (data) {
        config.data = data;
      }

      const response = await axios(config);
      return response.data;
    } catch (error) {
      logger.error('RocketChat API Error:', error.response?.data || error.message);
      throw new Error(`RocketChat API Error: ${error.response?.data?.error || error.message}`);
    }
  }

  /**
   * Create a new channel
   */
  async createChannel(name, members = [], isPrivate = false) {
    try {
      const endpoint = isPrivate ? ROCKETCHAT_CONFIG.api.createGroup : ROCKETCHAT_CONFIG.api.createChannel;
      const response = await this.makeRequest('POST', endpoint, {
        name,
        members
      });

      logger.info(`Created ${isPrivate ? 'private group' : 'channel'}: ${name}`);
      return response;
    } catch (error) {
      logger.error(`Failed to create channel ${name}:`, error.message);
      throw error;
    }
  }

  /**
   * Send a message to a channel or direct message
   */
  async sendMessage(roomId, text, attachments = null) {
    try {
      const messageData = {
        roomId,
        text
      };

      if (attachments) {
        messageData.attachments = attachments;
      }

      const response = await this.makeRequest('POST', ROCKETCHAT_CONFIG.api.sendMessage, messageData);
      logger.info(`Message sent to room ${roomId}`);
      return response;
    } catch (error) {
      logger.error(`Failed to send message to ${roomId}:`, error.message);
      throw error;
    }
  }

  /**
   * Create or get user in RocketChat
   */
  async createUser(userData) {
    try {
      const { email, name, username, password, roles = ['user'] } = userData;

      const response = await this.makeRequest('POST', ROCKETCHAT_CONFIG.api.createUser, {
        email,
        name,
        username,
        password,
        roles,
        joinDefaultChannels: true,
        requirePasswordChange: false,
        sendWelcomeEmail: false,
        verified: true
      });

      logger.info(`Created RocketChat user: ${username}`);
      return response;
    } catch (error) {
      if (error.message.includes('already in use')) {
        logger.warn(`User ${userData.username} already exists in RocketChat`);
        return { success: false, error: 'User already exists' };
      }
      logger.error(`Failed to create user ${userData.username}:`, error.message);
      throw error;
    }
  }

  /**
   * Invite user to channel
   */
  async inviteToChannel(roomId, userId) {
    try {
      const response = await this.makeRequest('POST', ROCKETCHAT_CONFIG.api.invite, {
        roomId,
        userId
      });

      logger.info(`Invited user ${userId} to room ${roomId}`);
      return response;
    } catch (error) {
      logger.error(`Failed to invite user to channel:`, error.message);
      throw error;
    }
  }

  /**
   * Get list of channels
   */
  async listChannels() {
    try {
      const response = await this.makeRequest('GET', ROCKETCHAT_CONFIG.api.channels);
      return response.channels || [];
    } catch (error) {
      logger.error('Failed to list channels:', error.message);
      throw error;
    }
  }

  /**
   * Get list of private groups
   */
  async listGroups() {
    try {
      const response = await this.makeRequest('GET', ROCKETCHAT_CONFIG.api.groups);
      return response.groups || [];
    } catch (error) {
      logger.error('Failed to list groups:', error.message);
      throw error;
    }
  }

  /**
   * Create direct message
   */
  async createDirectMessage(username) {
    try {
      const response = await this.makeRequest('POST', ROCKETCHAT_CONFIG.api.createDirect, {
        username
      });

      logger.info(`Created direct message with ${username}`);
      return response;
    } catch (error) {
      logger.error(`Failed to create direct message with ${username}:`, error.message);
      throw error;
    }
  }

  /**
   * Get user info
   */
  async getUserInfo() {
    try {
      const response = await this.makeRequest('GET', ROCKETCHAT_CONFIG.api.me);
      return response;
    } catch (error) {
      logger.error('Failed to get user info:', error.message);
      throw error;
    }
  }

  /**
   * Generate iframe embed code for RocketChat
   */
  getEmbedCode(roomName = null) {
    const url = roomName 
      ? `${ROCKETCHAT_CONFIG.url}/channel/${roomName}?layout=embedded`
      : `${ROCKETCHAT_CONFIG.url}/home?layout=embedded`;

    return {
      url,
      iframe: `<iframe src="${url}" width="${ROCKETCHAT_CONFIG.embed.width}" height="${ROCKETCHAT_CONFIG.embed.height}" frameborder="0"></iframe>`
    };
  }

  /**
   * Get RocketChat URL for specific room
   */
  getRoomUrl(roomName, roomType = 'channel') {
    const typeMap = {
      'channel': 'channel',
      'group': 'group',
      'direct': 'direct'
    };
    
    return `${ROCKETCHAT_CONFIG.url}/${typeMap[roomType] || 'channel'}/${roomName}`;
  }

  /**
   * Auto-assign user to default channel based on role
   */
  async assignToDefaultChannel(userRole, userId) {
    try {
      const channelName = ROCKETCHAT_CONFIG.defaultChannels[userRole];
      
      if (!channelName) {
        logger.warn(`No default channel configured for role: ${userRole}`);
        return null;
      }

      // Try to invite user to the channel
      // Note: This assumes the channel already exists
      const response = await this.inviteToChannel(channelName, userId);
      return response;
    } catch (error) {
      logger.error(`Failed to assign user to default channel for role ${userRole}:`, error.message);
      throw error;
    }
  }

  /**
   * Send notification message to a room
   */
  async sendNotification(roomId, title, message, color = '#00FF00') {
    try {
      const attachments = [{
        title,
        text: message,
        color,
        ts: new Date().toISOString()
      }];

      return await this.sendMessage(roomId, '', attachments);
    } catch (error) {
      logger.error('Failed to send notification:', error.message);
      throw error;
    }
  }

  /**
   * Check RocketChat connection status
   */
  async checkConnection() {
    try {
      const info = await this.getUserInfo();
      return {
        connected: true,
        user: info
      };
    } catch (error) {
      logger.error('RocketChat connection check failed:', error.message);
      return {
        connected: false,
        error: error.message
      };
    }
  }
}

export default new RocketChatService();
