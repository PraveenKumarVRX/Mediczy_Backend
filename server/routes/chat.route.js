import express from 'express';
import { body, query } from 'express-validator';
import { validationResult } from 'express-validator';
import { authUser } from '../middleware/auth.middleware.js';
import adminMiddleware from '../middleware/admin.middleware.js';
import { detectProfanity, getWarningResponse, logViolation, Severity } from '../utils/profanityFilter.js';
import fs from 'fs';
import path from 'path';
import { chatRooms, messages } from '../utils/chatStorage.js';
import sharedPool from '../db/pgPool.js';

const router = express.Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'chat-api', timestamp: new Date().toISOString() });
});

// Redis-based chat storage imported from utils/chatStorage.js
// chatRooms and messages are now async Redis operations
// Re-export for backward compatibility with WhatsApp webhook
export { chatRooms, messages };

const activeUsers = new Map();
const MAX_ACTIVE_USERS = 10000; // Limit to prevent memory leak

// Cleanup inactive users every 15 minutes
setInterval(() => {
  const now = Date.now();
  const INACTIVE_TIMEOUT = 30 * 60 * 1000; // 30 minutes
  for (const [userId, data] of activeUsers.entries()) {
    if (data.lastSeen && (now - data.lastSeen > INACTIVE_TIMEOUT)) {
      activeUsers.delete(userId);
    }
  }
  // Enforce max size
  if (activeUsers.size > MAX_ACTIVE_USERS) {
    const keysToDelete = Array.from(activeUsers.keys()).slice(0, activeUsers.size - MAX_ACTIVE_USERS);
    keysToDelete.forEach(k => activeUsers.delete(k));
  }
  console.log(`🧹 Cleaned up active users. Current size: ${activeUsers.size}`);
}, 15 * 60 * 1000); // Every 15 minutes

/**
 * Chat Room Types:
 * - 'user_team': User to Team support chat
 * - 'team_internal': Team to Team internal communication
 */

/**
 * @route   POST /api/chat/rooms
 * @desc    Create a new chat room
 * @access  Private
 */
router.post('/rooms', authUser, async (req, res) => {
  try {
    const { id, type, participants, title, description } = req.body;
    if (!id || !type || !participants || !title) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    if (await chatRooms.has(id)) {
      return res.status(409).json({ success: false, message: 'Room already exists' });
    }
    const roomData = {
      id,
      type,
      participants,
      createdAt: new Date().toISOString(),
      title,
      description: description || '',
    };
    await chatRooms.set(id, roomData);
    await messages.set(id, []);
    return res.json({ success: true, room: roomData });
  } catch (error) {
    console.error('Error creating chat room:', error);
    res.status(500).json({ success: false, message: 'Failed to create chat room', error: error.message });
  }
});

/**
 * @route   GET /api/chat/rooms
 * @desc    Get available chat rooms for user
 * @access  Private
 */
router.get('/rooms', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    
    let availableRooms = [];
    
    if (userRole === 'user' || userRole === 'patient') {
      // Regular users can access user-team support chat
      const supportRoomId = `support_${userId}`;
      if (!(await chatRooms.has(supportRoomId))) {
        await chatRooms.set(supportRoomId, {
          id: supportRoomId,
          type: 'user_team',
          participants: [userId],
          createdAt: new Date().toISOString(),
          title: 'Support Chat',
          description: 'Chat with our support team'
        });
      }
      
      availableRooms.push(await chatRooms.get(supportRoomId));
    }
    
    if (userRole === 'team' || userRole === 'admin' || userRole === 'doctor') {
      // Team members can access both user support and internal team chats
      
      // Add user support rooms where they are assigned
      const allRoomEntries = await chatRooms.entries();
      for (const [roomId, room] of allRoomEntries) {
        if (room.type === 'user_team' && (room.assignedTeam?.includes(userId) || userRole === 'admin')) {
          availableRooms.push(room);
        }
      }
      
      // Add team internal chat rooms
      const teamRoomId = 'team_general';
      if (!(await chatRooms.has(teamRoomId))) {
        await chatRooms.set(teamRoomId, {
          id: teamRoomId,
          type: 'team_internal',
          participants: [],
          createdAt: new Date().toISOString(),
          title: 'Team Chat',
          description: 'Internal team communication'
        });
      }
      
      const teamRoom = await chatRooms.get(teamRoomId);
      if (!teamRoom.participants.includes(userId)) {
        teamRoom.participants.push(userId);
        await chatRooms.set(teamRoomId, teamRoom);
      }
      availableRooms.push(teamRoom);
      
      // Add WhatsApp customer messages room
      const whatsappRoomId = 'whatsapp_general';
      if (!(await chatRooms.has(whatsappRoomId))) {
        await chatRooms.set(whatsappRoomId, {
          id: whatsappRoomId,
          type: 'whatsapp_customer',
          participants: [],
          createdAt: new Date().toISOString(),
          title: 'WhatsApp Customers',
          description: 'Incoming messages from WhatsApp customers'
        });
        await messages.set(whatsappRoomId, []);
      }
      
      const whatsappRoom = await chatRooms.get(whatsappRoomId);
      if (!whatsappRoom.participants.includes(userId)) {
        whatsappRoom.participants.push(userId);
        await chatRooms.set(whatsappRoomId, whatsappRoom);
      }
      availableRooms.push(whatsappRoom);
    }
    
    res.json({
      success: true,
      rooms: availableRooms
    });
  } catch (error) {
    console.error('Error fetching chat rooms:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch chat rooms',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/chat/rooms/:roomId/messages
 * @desc    Get messages for a chat room
 * @access  Private
 */
router.get('/rooms/:roomId/messages', authUser, [
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('offset').optional().isInt({ min: 0 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { roomId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    console.log('[Chat Messages] Access check:', { roomId, userId, userRole });

    // Check if user has access to this room
    const room = await chatRooms.get(roomId);
    if (!room) {
      console.log('[Chat Messages] Room not found:', roomId);
      // For WhatsApp rooms that exist in chatbot_sessions but not in Redis,
      // return empty messages rather than 404 so the UI doesn't break
      if (roomId.startsWith('whatsapp')) {
        return res.json({
          success: true,
          messages: [],
          pagination: { total: 0, limit, offset, hasMore: false }
        });
      }
      return res.status(404).json({
        success: false,
        message: 'Chat room not found'
      });
    }

    console.log('[Chat Messages] Room found:', { roomType: room.type, participants: room.participants });

    // Verify access permissions - admins always have access
    const hasAccess = 
      userRole === 'admin' ||
      room.participants.includes(userId) ||
      (room.type === 'user_team' && userRole === 'admin') ||
      (room.type === 'team_internal' && ['team', 'admin', 'doctor'].includes(userRole)) ||
      (room.type === 'whatsapp_customer' && ['team', 'admin', 'doctor'].includes(userRole)) ||
      (room.type === 'channel' && ['team', 'admin', 'doctor'].includes(userRole));

    console.log('[Chat Messages] Access result:', hasAccess);

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this chat room'
      });
    }

    const roomMessages = await messages.get(roomId) || [];
    const totalMessages = roomMessages.length;
    const paginatedMessages = roomMessages
      .slice(Math.max(0, totalMessages - limit - offset), totalMessages - offset)
      .reverse();

    res.json({
      success: true,
      messages: paginatedMessages,
      pagination: {
        total: totalMessages,
        limit,
        offset,
        hasMore: totalMessages > limit + offset
      }
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch messages',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/chat/rooms/:roomId/messages
 * @desc    Send a message to chat room
 * @access  Private
 */
router.post('/rooms/:roomId/messages', authUser, [
  body('message').isString().trim().isLength({ min: 1, max: 1000 }).withMessage('Message must be 1-1000 characters'),
  body('type').optional().isIn(['text', 'image', 'file']).withMessage('Invalid message type')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { roomId } = req.params;
    let { message, type = 'text' } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;
    const userName = req.user.firstName ? `${req.user.firstName} ${req.user.lastName || ''}`.trim() : req.user.email;

    // ===== PROFANITY CHECK =====
    const profanityDetection = detectProfanity(message);
    if (profanityDetection.flagged) {
      console.log('🚨 Profanity detected in chat message:', {
        roomId,
        userId,
        severity: profanityDetection.severity,
        matchedWords: profanityDetection.matchedWords
      });
      
      // Log the violation
      await logViolation(roomId, userId, message, profanityDetection);
      
      // For HIGH or CRITICAL severity, block the message
      if (profanityDetection.severity === Severity.HIGH || 
          profanityDetection.severity === Severity.CRITICAL) {
        return res.status(400).json({
          success: false,
          flagged: true,
          message: getWarningResponse(profanityDetection.severity),
          violation: {
            type: 'profanity',
            severity: profanityDetection.severity
          }
        });
      }
      
      // For LOW/MEDIUM severity, use sanitized message
      message = profanityDetection.sanitizedText;
    }
    // ===== END PROFANITY CHECK =====

    // Check if user has access to this room
    const room = await chatRooms.get(roomId);
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Chat room not found'
      });
    }

    // Verify access permissions
    const hasAccess = 
      room.participants.includes(userId) ||
      (room.type === 'user_team' && userRole === 'admin') ||
      (room.type === 'team_internal' && ['team', 'admin', 'doctor'].includes(userRole)) ||
      (room.type === 'whatsapp_customer' && ['team', 'admin', 'doctor'].includes(userRole)) ||
      (room.type === 'channel' && ['team', 'admin', 'doctor'].includes(userRole));

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this chat room'
      });
    }

    const newMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      roomId,
      userId,
      userName,
      userRole,
      message: message.trim(),
      type,
      timestamp: new Date().toISOString(),
      edited: false,
      reactions: [],
      // Add content warning flag if profanity was detected
      ...(profanityDetection.flagged && {
        contentWarning: {
          flagged: true,
          severity: profanityDetection.severity,
          sanitized: true
        }
      })
    };

    // Store message in Redis
    await messages.push(roomId, newMessage);

    // Update room last activity
    room.lastActivity = newMessage.timestamp;
    room.lastMessage = {
      content: message.trim(),
      sender: userName,
      timestamp: newMessage.timestamp
    };
    await chatRooms.set(roomId, room);

    // In a real implementation, emit socket event here
    // io.to(roomId).emit('new_message', newMessage);

    res.json({
      success: true,
      message: newMessage,
      // Include warning if message was sanitized
      ...(profanityDetection.flagged && {
        contentWarning: getWarningResponse(profanityDetection.severity)
      })
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/chat/rooms/:roomId/join
 * @desc    Join a chat room
 * @access  Private
 */
router.post('/rooms/:roomId/join', authUser, async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const room = await chatRooms.get(roomId);
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Chat room not found'
      });
    }

    // Add user to room if not already present
    if (!room.participants.includes(userId)) {
      room.participants.push(userId);
    }

    // Track active user
    activeUsers.set(userId, {
      roomId,
      joinedAt: new Date().toISOString(),
      userRole,
      status: 'online'
    });

    res.json({
      success: true,
      message: 'Successfully joined chat room',
      room
    });
  } catch (error) {
    console.error('Error joining room:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to join room',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/chat/rooms/:roomId/leave
 * @desc    Leave a chat room
 * @access  Private
 */
router.post('/rooms/:roomId/leave', authUser, async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user.id;

    // Remove from active users
    if (activeUsers.has(userId) && activeUsers.get(userId).roomId === roomId) {
      activeUsers.delete(userId);
    }

    res.json({
      success: true,
      message: 'Successfully left chat room'
    });
  } catch (error) {
    console.error('Error leaving room:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to leave room',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/chat/rooms/:roomId/participants
 * @desc    Get active participants in chat room
 * @access  Private
 */
router.get('/rooms/:roomId/participants', authUser, async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user.id;

    const room = await chatRooms.get(roomId);
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Chat room not found'
      });
    }

    // Get active participants
    const activeParticipants = [];
    for (const [activeUserId, userData] of activeUsers.entries()) {
      if (userData.roomId === roomId) {
        activeParticipants.push({
          userId: activeUserId,
          status: userData.status,
          joinedAt: userData.joinedAt,
          userRole: userData.userRole
        });
      }
    }

    res.json({
      success: true,
      participants: activeParticipants,
      totalParticipants: room.participants.length
    });
  } catch (error) {
    console.error('Error fetching participants:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch participants',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/chat/upload
 * @desc    Upload file for chat
 * @access  Private
 */
router.post('/upload', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    
    if (!req.files || !req.files.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const file = req.files.file;
    const roomId = req.body.roomId;

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: 'File size must be less than 10MB'
      });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const fileExtension = file.name.split('.').pop();
    const fileName = `${timestamp}_${randomString}.${fileExtension}`;
    
    // Create upload directory if it doesn't exist
    const uploadDir = './uploads/chat';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const filePath = `${uploadDir}/${fileName}`;
    
    // Save file
    await file.mv(filePath);

    // Return file URL
    const fileUrl = `/api/chat/files/${fileName}`;
    
    res.json({
      success: true,
      fileUrl,
      fileName: file.name,
      fileSize: file.size,
      fileMimeType: file.mimetype
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload file',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/chat/files/:fileName
 * @desc    Serve uploaded files
 * @access  Private
 */
router.get('/files/:fileName', authUser, async (req, res) => {
  try {
    const { fileName } = req.params;
    const filePath = `./uploads/chat/${fileName}`;
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }

    res.sendFile(path.resolve(filePath));
  } catch (error) {
    console.error('Error serving file:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to serve file',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/chat/team-members
 * @desc    Get all team members for chat (team members, nurses, assistants, doctors)
 * @access  Private
 */
router.get('/team-members', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    
    console.log('🔍 Team members access check:', { userId, userRole, user: req.user });
    
    // Only allow team members, admins, doctors, nurses, and assistants to see team list
    if (!['team', 'admin', 'doctor', 'nurse', 'assistant'].includes(userRole)) {
      console.log('❌ Access denied for role:', userRole);
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const teamMembers = [];
    
    // Import intelligent models (PostgreSQL)
    const { Doctor } = await import('../models/doctor.model.intelligent.js');
    const { Nurse } = await import('../models/nurse.model.intelligent.js');
    const { Assistant } = await import('../models/assistant.model.intelligent.js');
    
    // Get doctors
    const doctors = await Doctor.findAll();
    doctors.forEach(doctor => {
      teamMembers.push({
        id: doctor.id,
        name: `${doctor.prefix || 'Dr'} ${doctor.firstName} ${doctor.lastName}`,
        email: doctor.email,
        role: 'doctor',
        specialization: doctor.specialization,
        isOnline: activeUsers.has(doctor.id),
        lastSeen: activeUsers.has(doctor.id) ? 'Online' : 'Recently',
        avatar: doctor.doctorImage || null
      });
    });
    
    // Get nurses
    const nurses = await db.Nurse.findAll();
    nurses.forEach(nurse => {
      teamMembers.push({
        id: nurse.id,
        name: `${nurse.firstName} ${nurse.lastName}`,
        email: nurse.email,
        role: 'nurse',
        department: nurse.department,
        specialty: nurse.specialty,
        isOnline: activeUsers.has(nurse.id),
        lastSeen: activeUsers.has(nurse.id) ? 'Online' : 'Recently'
      });
    });
    
    // Get assistants
    const assistants = await db.Assistant.findAll();
    assistants.forEach(assistant => {
      teamMembers.push({
        id: assistant.id,
        name: `${assistant.firstName} ${assistant.lastName}`,
        email: assistant.email,
        role: 'assistant',
        roleTitle: assistant.roleTitle,
        isOnline: activeUsers.has(assistant.id),
        lastSeen: activeUsers.has(assistant.id) ? 'Online' : 'Recently'
      });
    });
    
    // Add admins (you can fetch from admin model if needed)
    // For now including hardcoded admin if exists in activeUsers
    if (userRole === 'admin') {
      teamMembers.push({
        id: userId,
        name: req.user.firstName ? `${req.user.firstName} ${req.user.lastName || ''}` : 'Admin',
        email: req.user.email,
        role: 'admin',
        isOnline: true,
        lastSeen: 'Online'
      });
    }

    res.json({
      success: true,
      members: teamMembers
    });
  } catch (error) {
    console.error('Error fetching team members:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch team members',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/chat/stats
 * @desc    Get chat statistics (admin only)
 * @access  Admin
 */
router.get('/stats', adminMiddleware, async (req, res) => {
  try {
    const allRooms = await chatRooms.entries();
    const totalRooms = allRooms.length;
    let totalMessages = 0;
    const activeUsersCount = activeUsers.size;
    
    const roomStats = {};
    for (const [roomId, room] of allRooms) {
      const roomMsgs = await messages.get(roomId) || [];
      totalMessages += roomMsgs.length;
      roomStats[roomId] = {
        type: room.type,
        participants: room.participants.length,
        messages: roomMsgs.length,
        lastActivity: room.lastActivity
      };
    }

    res.json({
      success: true,
      stats: {
        totalRooms,
        totalMessages,
        activeUsers: activeUsersCount,
        roomBreakdown: roomStats
      }
    });
  } catch (error) {
    console.error('Error fetching chat stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch chat statistics',
      error: error.message
    });
  }
});

// Chat statistics route
router.get('/chat-stats', authUser, async (req, res) => {
  try {
    const allRooms = await chatRooms.entries();
    const totalRooms = allRooms.length;
    let totalMessages = 0;
    const activeUsersCount = activeUsers.size;
    
    const roomStats = {};
    for (const [roomId, room] of allRooms) {
      const roomMsgs = await messages.get(roomId) || [];
      totalMessages += roomMsgs.length;
      roomStats[roomId] = {
        type: room.type,
        participants: room.participants.length,
        messages: roomMsgs.length,
        lastActivity: room.lastActivity
      };
    }

    res.json({
      success: true,
      stats: {
        totalRooms,
        totalMessages,
        activeUsers: activeUsersCount,
        roomBreakdown: roomStats
      }
    });
  } catch (error) {
    console.error('Error fetching chat stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch chat statistics',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/chat/dashboard/overview
 * @desc    Get chat dashboard overview (admin only)
 * @access  Admin
 */
router.get('/dashboard/overview', adminMiddleware, async (req, res) => {
  try {
    // Real-time statistics
    const allRooms = await chatRooms.entries();
    const totalRooms = allRooms.length;
    let totalMessages = 0;
    const activeUsersCount = activeUsers.size;
    const onlineTeamMembers = Array.from(activeUsers.entries())
      .filter(([userId, userData]) => ['admin', 'doctor', 'support', 'nurse'].includes(userData.role))
      .length;
    
    // Recent activity (last 24 hours)
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    let recentMessages = 0;
    let recentRooms = 0;
    
    // Build messages map for analytics
    const allMessages = [];
    for (const [roomId, room] of allRooms) {
      const roomMessages = await messages.get(roomId) || [];
      totalMessages += roomMessages.length;
      allMessages.push([roomId, roomMessages]);
      
      if (room && new Date(room.createdAt) > last24Hours) {
        recentRooms++;
      }
      recentMessages += roomMessages.filter(msg => 
        new Date(msg.timestamp) > last24Hours
      ).length;
    }
    
    // Response time analytics
    const avgResponseTimes = [];
    for (const [roomId, roomMessages] of allMessages) {
      if (roomMessages.length > 1) {
        const room = allRooms.find(([id]) => id === roomId)?.[1];
        if (room?.type === 'user_team') {
          // Calculate average response time between user and team messages
          let responseTimes = [];
          for (let i = 1; i < roomMessages.length; i++) {
            const prevMsg = roomMessages[i-1];
            const currMsg = roomMessages[i];
            if (prevMsg.userRole === 'user' && ['admin', 'doctor', 'support'].includes(currMsg.userRole)) {
              const responseTime = new Date(currMsg.timestamp).getTime() - new Date(prevMsg.timestamp).getTime();
              responseTimes.push(responseTime / (1000 * 60)); // Convert to minutes
            }
          }
          if (responseTimes.length > 0) {
            avgResponseTimes.push(responseTimes.reduce((a, b) => a + b) / responseTimes.length);
          }
        }
      }
    }
    
    const overallAvgResponseTime = avgResponseTimes.length > 0 
      ? avgResponseTimes.reduce((a, b) => a + b) / avgResponseTimes.length 
      : 0;
    
    res.json({
      success: true,
      overview: {
        totalRooms,
        totalMessages,
        activeUsers: activeUsersCount,
        onlineTeamMembers,
        recentActivity: {
          last24h: {
            messages: recentMessages,
            newRooms: recentRooms
          }
        },
        analytics: {
          averageResponseTime: Math.round(overallAvgResponseTime * 100) / 100, // Minutes
          responseTimeUnit: 'minutes'
        }
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard overview:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard overview',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/chat/dashboard/analytics
 * @desc    Get chat dashboard analytics (admin only)
 * @access  Admin
 */
router.get('/dashboard/analytics', adminMiddleware, [
  query('period').optional().isIn(['24h', '7d', '30d']).withMessage('Invalid period')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const period = req.query.period || '7d';
    const now = Date.now();
    const windowMs =
      period === '24h' ? 24 * 60 * 60 * 1000 :
      period === '30d' ? 30 * 24 * 60 * 60 * 1000 :
      7 * 24 * 60 * 60 * 1000;
    const windowStart = new Date(now - windowMs);

    const dayKey = (d) => {
      const date = new Date(d);
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };

    // Messages by day
    const messagesByDayMap = new Map();
    const roomMessageCounts = new Map();
    let totalMessagesInPeriod = 0;

    const allRooms = await chatRooms.entries();
    for (const [roomId, room] of allRooms) {
      const roomMessages = await messages.get(roomId) || [];
      for (const msg of roomMessages) {
        const ts = new Date(msg.timestamp);
        if (ts > windowStart) {
          totalMessagesInPeriod++;
          const key = dayKey(ts);
          messagesByDayMap.set(key, (messagesByDayMap.get(key) || 0) + 1);
          roomMessageCounts.set(roomId, (roomMessageCounts.get(roomId) || 0) + 1);
        }
      }
    }

    // New rooms by day
    const roomsByDayMap = new Map();
    for (const [roomId, room] of allRooms) {
      const createdAt = new Date(room.createdAt);
      if (createdAt > windowStart) {
        const key = dayKey(createdAt);
        roomsByDayMap.set(key, (roomsByDayMap.get(key) || 0) + 1);
      }
    }

    const messagesByDay = Array.from(messagesByDayMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => ({ date, count }));

    const roomsByDay = Array.from(roomsByDayMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => ({ date, count }));

    const topRooms = await Promise.all(Array.from(roomMessageCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(async ([roomId, count]) => {
        const room = await chatRooms.get(roomId);
        return {
          roomId,
          title: room?.title || room?.name || roomId,
          type: room?.type,
          messages: count
        };
      }));

    res.json({
      success: true,
      analytics: {
        period,
        windowStart: windowStart.toISOString(),
        totals: {
          messages: totalMessagesInPeriod,
          roomsCreated: roomsByDay.reduce((sum, r) => sum + r.count, 0)
        },
        messagesByDay,
        roomsByDay,
        topRooms
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard analytics',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/chat/dashboard/conversations
 * @desc    Get all conversations with filtering (admin only)
 * @access  Admin
 */
router.get('/dashboard/conversations', adminMiddleware, [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('type').optional().isIn(['user_team', 'team_internal', 'all']).withMessage('Invalid conversation type'),
  query('status').optional().isIn(['active', 'inactive', 'all']).withMessage('Invalid status filter'),
  query('search').optional().isLength({ min: 1, max: 100 }).withMessage('Search query too long')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const typeFilter = req.query.type || 'all';
    const statusFilter = req.query.status || 'all';
    const searchQuery = req.query.search || '';
    
    const allRooms = await chatRooms.values();
    let filteredRooms = [...allRooms];
    
    // Apply type filter
    if (typeFilter !== 'all') {
      filteredRooms = filteredRooms.filter(room => room.type === typeFilter);
    }
    
    // Apply status filter (active = has messages in last 24 hours)
    if (statusFilter !== 'all') {
      const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const filteredWithStatus = [];
      for (const room of filteredRooms) {
        const roomMessages = await messages.get(room.id) || [];
        const hasRecentActivity = roomMessages.some(msg => 
          new Date(msg.timestamp) > last24Hours
        );
        if (statusFilter === 'active' ? hasRecentActivity : !hasRecentActivity) {
          filteredWithStatus.push(room);
        }
      }
      filteredRooms = filteredWithStatus;
    }
    
    // Apply search filter
    if (searchQuery) {
      const filteredWithSearch = [];
      for (const room of filteredRooms) {
        const roomMessages = await messages.get(room.id) || [];
        const titleMatch = room.title.toLowerCase().includes(searchQuery.toLowerCase());
        const messageMatch = roomMessages.some(msg => 
          msg.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
          msg.userName.toLowerCase().includes(searchQuery.toLowerCase())
        );
        if (titleMatch || messageMatch) {
          filteredWithSearch.push(room);
        }
      }
      filteredRooms = filteredWithSearch;
    }
    
    // ── WhatsApp sessions from chatbot_sessions table ──────────────────
    try {
      const waResult = await sharedPool.query(
        `SELECT session_id, user_id, message_count, messages, last_interaction_at
         FROM chatbot_sessions
         WHERE session_id LIKE 'whatsapp:%'
         ORDER BY last_interaction_at DESC
         LIMIT 200`
      );
      for (const row of waResult.rows) {
        const phoneNumber = row.session_id.replace('whatsapp:', '');
        const waMessages = Array.isArray(row.messages) ? row.messages : [];
        const lastMsg = waMessages.length > 0 ? waMessages[waMessages.length - 1] : null;
        const fakeRoom = {
          id: row.session_id,
          title: `WhatsApp ${phoneNumber}`,
          type: 'whatsapp_customer',
          participants: row.user_id ? [row.user_id] : [],
          createdAt: row.last_interaction_at,
          phoneNumber,
          messageCount: row.message_count || waMessages.length,
          lastMessage: lastMsg ? {
            content: lastMsg.content,
            sender: lastMsg.role === 'user' ? phoneNumber : 'Dr. iSHA (AI)',
            timestamp: lastMsg.createdAt || row.last_interaction_at,
            type: lastMsg.role
          } : null,
          lastActivity: row.last_interaction_at,
          source: 'chatbot_sessions'
        };
        // Apply type/search filters
        if (typeFilter !== 'all' && typeFilter !== 'whatsapp_customer') continue;
        // Apply status filter for WA sessions based on last_interaction_at
        if (statusFilter !== 'all') {
          const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
          const hasRecentActivity = new Date(row.last_interaction_at) > last24Hours;
          if (statusFilter === 'active' ? !hasRecentActivity : hasRecentActivity) continue;
        }
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          const match = phoneNumber.includes(q) ||
            waMessages.some(m => (m.content || '').toLowerCase().includes(q));
          if (!match) continue;
        }
        // Avoid duplicate if already in in-memory rooms
        if (!filteredRooms.find(r => r.id === row.session_id)) {
          filteredRooms.push(fakeRoom);
        }
      }
    } catch (waErr) {
      console.warn('Could not fetch WhatsApp sessions for chat dashboard:', waErr.message);
    }
    // ─────────────────────────────────────────────────────────────────────

    // Sort by last activity
    const roomsWithActivity = await Promise.all(filteredRooms.map(async (room) => {
      if (room.source === 'chatbot_sessions') {
        return { room, lastActivity: new Date(room.lastActivity), roomMessages: [] };
      }
      const roomMessages = await messages.get(room.id) || [];
      const lastActivity = roomMessages.length > 0 
        ? new Date(roomMessages[roomMessages.length - 1].timestamp) 
        : new Date(room.createdAt);
      return { room, lastActivity, roomMessages };
    }));
    
    roomsWithActivity.sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());
    
    // Pagination
    const totalRooms = roomsWithActivity.length;
    const totalPages = Math.ceil(totalRooms / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedRooms = roomsWithActivity.slice(startIndex, endIndex);
    
    // Enrich room data
    const enrichedRooms = paginatedRooms.map(({ room, roomMessages }) => {
      const lastMessage = roomMessages.length > 0 ? roomMessages[roomMessages.length - 1] : null;
      const messageCount = roomMessages.length;
      const participants = room.participants.map(userId => {
        const userData = activeUsers.get(userId);
        return {
          id: userId,
          isOnline: activeUsers.has(userId),
          role: userData?.role || 'unknown',
          name: userData?.name || `User ${userId}`
        };
      });
      
      // For chatbot_sessions WhatsApp rooms, use precomputed lastMessage
      const isWaSession = room.source === 'chatbot_sessions';
      const resolvedLastMessage = isWaSession
        ? room.lastMessage
        : (lastMessage ? {
            content: lastMessage.message,
            sender: lastMessage.userName,
            timestamp: lastMessage.timestamp,
            type: lastMessage.type
          } : null);

      return {
        ...room,
        messageCount: isWaSession ? room.messageCount : messageCount,
        lastMessage: resolvedLastMessage,
        participants,
        lastActivity: isWaSession ? room.lastActivity : (lastMessage ? lastMessage.timestamp : room.createdAt)
      };
    });
    
    res.json({
      success: true,
      conversations: enrichedRooms,
      pagination: {
        page,
        limit,
        totalPages,
        totalRooms,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      },
      filters: {
        type: typeFilter,
        status: statusFilter,
        search: searchQuery
      }
    });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch conversations',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/chat/dashboard/conversation/:roomId
 * @desc    Get detailed conversation view (admin only)
 * @access  Admin
 */
router.get('/dashboard/conversation/:roomId', adminMiddleware, [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    const { roomId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    // ── WhatsApp conversation from chatbot_sessions ───────────────────────
    if (roomId.startsWith('whatsapp:')) {
      try {
        const waRes = await sharedPool.query(
          `SELECT session_id, user_id, message_count, messages, last_interaction_at
           FROM chatbot_sessions WHERE session_id = $1 LIMIT 1`,
          [roomId]
        );
        if (waRes.rows.length === 0) {
          return res.status(404).json({ success: false, message: 'WhatsApp conversation not found' });
        }
        const row = waRes.rows[0];
        const phoneNumber = row.session_id.replace('whatsapp:', '');
        const allMsgs = Array.isArray(row.messages) ? row.messages : [];
        const totalMessages = allMsgs.length;
        const totalPages = Math.ceil(totalMessages / limit);
        const startIndex = (page - 1) * limit;
        const paginatedMessages = allMsgs.slice(startIndex, startIndex + limit).map((m, i) => ({
          id: `${row.session_id}_${startIndex + i}`,
          message: m.content,
          userId: m.role === 'user' ? (row.user_id || phoneNumber) : 'ai_assistant',
          userName: m.role === 'user' ? `Customer (${phoneNumber})` : 'Dr. iSHA (AI)',
          role: m.role,
          timestamp: m.createdAt || row.last_interaction_at,
          type: 'text'
        }));
        return res.json({
          success: true,
          conversation: {
            id: row.session_id,
            title: `WhatsApp ${phoneNumber}`,
            type: 'whatsapp_customer',
            phoneNumber,
            participants: [{ id: row.user_id || phoneNumber, name: `Customer (${phoneNumber})`, role: 'user', isOnline: false, messageCount: Math.ceil(totalMessages / 2) }],
            totalMessages
          },
          messages: paginatedMessages,
          pagination: { page, limit, totalPages, totalMessages, hasNextPage: page < totalPages, hasPrevPage: page > 1 }
        });
      } catch (waErr) {
        console.error('Error fetching WhatsApp conversation:', waErr);
        return res.status(500).json({ success: false, message: 'Failed to fetch WhatsApp conversation', error: waErr.message });
      }
    }
    // ─────────────────────────────────────────────────────────────────────

    const room = await chatRooms.get(roomId);
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }
    
    const roomMessages = await messages.get(roomId) || [];
    
    // Pagination
    const totalMessages = roomMessages.length;
    const totalPages = Math.ceil(totalMessages / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedMessages = roomMessages.slice(startIndex, endIndex);
    
    // Enrich participants data
    const enrichedParticipants = room.participants.map(userId => {
      const userData = activeUsers.get(userId);
      const userMessages = roomMessages.filter(msg => msg.userId === userId);
      return {
        id: userId,
        name: userData?.name || `User ${userId}`,
        role: userData?.role || 'unknown',
        isOnline: activeUsers.has(userId),
        messageCount: userMessages.length,
        lastActivity: userMessages.length > 0 
          ? userMessages[userMessages.length - 1].timestamp 
          : null
      };
    });
    
    res.json({
      success: true,
      conversation: {
        ...room,
        participants: enrichedParticipants,
        totalMessages
      },
      messages: paginatedMessages,
      pagination: {
        page,
        limit,
        totalPages,
        totalMessages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('Error fetching conversation details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch conversation details',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/chat/dashboard/broadcast
 * @desc    Broadcast message to all active conversations (admin only)
 * @access  Admin
 */
router.post('/dashboard/broadcast', adminMiddleware, [
  body('message').notEmpty().withMessage('Message is required'),
  body('type').optional().isIn(['announcement', 'warning', 'info']).withMessage('Invalid message type'),
  body('targetRooms').optional().isArray().withMessage('Target rooms must be an array')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    const { message, type = 'announcement', targetRooms } = req.body;
    const adminInfo = req.user;
    
    let roomsToBroadcast;
    if (targetRooms && targetRooms.length > 0) {
      const allRoomKeys = await chatRooms.keys();
      roomsToBroadcast = targetRooms.filter(roomId => allRoomKeys.includes(roomId));
    } else {
      roomsToBroadcast = await chatRooms.keys();
    }
    
    const broadcastMessage = {
      id: `broadcast_${Date.now()}`,
      roomId: '',
      userId: adminInfo.id,
      userName: adminInfo.name || 'System Admin',
      userRole: 'admin',
      message,
      type: 'broadcast',
      timestamp: new Date().toISOString(),
      edited: false,
      reactions: [],
      broadcastType: type
    };
    
    let broadcastCount = 0;
    
    for (const roomId of roomsToBroadcast) {
      const messageWithRoomId = { ...broadcastMessage, roomId, id: `${broadcastMessage.id}_${roomId}` };
      await messages.push(roomId, messageWithRoomId);
      broadcastCount++;
    }
    
    res.json({
      success: true,
      message: 'Broadcast sent successfully',
      broadcastCount,
      targetRooms: roomsToBroadcast
    });
  } catch (error) {
    console.error('Error sending broadcast:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send broadcast',
      error: error.message
    });
  }
});

export default router;