/**
 * RocketChat Routes
 * API endpoints for RocketChat integration
 */

import express from 'express';
import rocketChatService from '../services/rocketchat.service.js';
import ROCKETCHAT_CONFIG from '../config/rocketchat.config.js';

const router = express.Router();

/**
 * @route   GET /api/rocketchat/status
 * @desc    Check RocketChat connection status
 * @access  Public
 */
router.get('/status', async (req, res) => {
  try {
    const status = await rocketChatService.checkConnection();
    res.json({
      success: status.connected,
      url: ROCKETCHAT_CONFIG.url,
      ...status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/rocketchat/embed
 * @desc    Get embed code for RocketChat
 * @access  Public
 */
router.get('/embed/:roomName?', (req, res) => {
  try {
    const { roomName } = req.params;
    const embedData = rocketChatService.getEmbedCode(roomName);
    
    res.json({
      success: true,
      ...embedData,
      config: ROCKETCHAT_CONFIG.embed
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/rocketchat/channel
 * @desc    Create a new channel
 * @access  Private
 */
router.post('/channel', async (req, res) => {
  try {
    const { name, members, isPrivate } = req.body;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Channel name is required'
      });
    }

    const result = await rocketChatService.createChannel(name, members, isPrivate);
    res.json({
      success: true,
      channel: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/rocketchat/message
 * @desc    Send a message to a room
 * @access  Private
 */
router.post('/message', async (req, res) => {
  try {
    const { roomId, text, attachments } = req.body;
    
    if (!roomId || !text) {
      return res.status(400).json({
        success: false,
        error: 'Room ID and text are required'
      });
    }

    const result = await rocketChatService.sendMessage(roomId, text, attachments);
    res.json({
      success: true,
      message: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/rocketchat/user
 * @desc    Create a new RocketChat user
 * @access  Private
 */
router.post('/user', async (req, res) => {
  try {
    const { email, name, username, password, roles } = req.body;
    
    if (!email || !name || !username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email, name, username, and password are required'
      });
    }

    const result = await rocketChatService.createUser({
      email,
      name,
      username,
      password,
      roles
    });
    
    res.json({
      success: true,
      user: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/rocketchat/channels
 * @desc    List all channels
 * @access  Private
 */
router.get('/channels', async (req, res) => {
  try {
    const channels = await rocketChatService.listChannels();
    res.json({
      success: true,
      channels
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/rocketchat/groups
 * @desc    List all private groups
 * @access  Private
 */
router.get('/groups', async (req, res) => {
  try {
    const groups = await rocketChatService.listGroups();
    res.json({
      success: true,
      groups
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/rocketchat/direct
 * @desc    Create direct message with user
 * @access  Private
 */
router.post('/direct', async (req, res) => {
  try {
    const { username } = req.body;
    
    if (!username) {
      return res.status(400).json({
        success: false,
        error: 'Username is required'
      });
    }

    const result = await rocketChatService.createDirectMessage(username);
    res.json({
      success: true,
      direct: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/rocketchat/invite
 * @desc    Invite user to channel
 * @access  Private
 */
router.post('/invite', async (req, res) => {
  try {
    const { roomId, userId } = req.body;
    
    if (!roomId || !userId) {
      return res.status(400).json({
        success: false,
        error: 'Room ID and User ID are required'
      });
    }

    const result = await rocketChatService.inviteToChannel(roomId, userId);
    res.json({
      success: true,
      result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/rocketchat/notification
 * @desc    Send notification to room
 * @access  Private
 */
router.post('/notification', async (req, res) => {
  try {
    const { roomId, title, message, color } = req.body;
    
    if (!roomId || !title || !message) {
      return res.status(400).json({
        success: false,
        error: 'Room ID, title, and message are required'
      });
    }

    const result = await rocketChatService.sendNotification(roomId, title, message, color);
    res.json({
      success: true,
      notification: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/rocketchat/room-url/:roomType/:roomName
 * @desc    Get URL for specific room
 * @access  Public
 */
router.get('/room-url/:roomType/:roomName', (req, res) => {
  try {
    const { roomType, roomName } = req.params;
    const url = rocketChatService.getRoomUrl(roomName, roomType);
    
    res.json({
      success: true,
      url
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/rocketchat/config
 * @desc    Get RocketChat configuration
 * @access  Public
 */
router.get('/config', (req, res) => {
  try {
    res.json({
      success: true,
      url: ROCKETCHAT_CONFIG.url,
      embed: ROCKETCHAT_CONFIG.embed,
      defaultChannels: ROCKETCHAT_CONFIG.defaultChannels,
      enableEmbed: ROCKETCHAT_CONFIG.enableEmbed,
      enableSSO: ROCKETCHAT_CONFIG.enableSSO
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
