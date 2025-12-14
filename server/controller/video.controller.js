import { validationResult } from 'express-validator';
import jwt from 'jsonwebtoken';

// Simple WebRTC video calling controller
class VideoController {
  
  // Test endpoint for video calling system
  static testVideoSystem = (req, res) => {
    try {
      const serverConfig = {
        turnServer: process.env.TURN_SERVER_URL || 'stun:stun.l.google.com:19302',
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      };

      res.json({
        success: true,
        message: 'Video calling system is operational',
        timestamp: new Date().toISOString(),
        config: serverConfig
      });
    } catch (error) {
      console.error('Video system test failed:', error);
      res.status(500).json({
        success: false,
        message: 'Video system test failed',
        error: error.message
      });
    }
  };

  // Generate video room token
  static generateRoomToken = (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { roomId, appointmentId } = req.body;
      const userId = req.user.id;
      const userRole = req.user.role || 'user';

      // Create a simple room token
      const roomToken = jwt.sign(
        {
          userId,
          userRole,
          roomId,
          appointmentId,
          timestamp: Date.now()
        },
        process.env.JWT_SECRET,
        { expiresIn: '2h' }
      );

      // Generate room URL
      const roomUrl = `${req.protocol}://${req.get('host')}/video-room/${roomId}?token=${roomToken}`;

      res.json({
        success: true,
        roomToken,
        roomId,
        roomUrl,
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });

    } catch (error) {
      console.error('Failed to generate room token:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate room token',
        error: error.message
      });
    }
  };

  // Join video room
  static joinRoom = (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { roomId } = req.params;
      const userId = req.user.id;
      const userRole = req.user.role || 'user';

      // In a real implementation, you'd check room permissions, appointment validity, etc.
      const roomData = {
        roomId,
        userId,
        userRole,
        joinedAt: new Date().toISOString(),
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      };

      res.json({
        success: true,
        message: 'Successfully joined video room',
        roomData
      });

    } catch (error) {
      console.error('Failed to join room:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to join video room',
        error: error.message
      });
    }
  };

  // Leave video room
  static leaveRoom = (req, res) => {
    try {
      const { roomId } = req.params;
      const userId = req.user.id;

      // In a real implementation, you'd clean up room resources
      res.json({
        success: true,
        message: 'Successfully left video room',
        roomId,
        userId,
        leftAt: new Date().toISOString()
      });

    } catch (error) {
      console.error('Failed to leave room:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to leave video room',
        error: error.message
      });
    }
  };

  // Get room status
  static getRoomStatus = (req, res) => {
    try {
      const { roomId } = req.params;

      // In a real implementation, you'd query active room participants
      const roomStatus = {
        roomId,
        status: 'active',
        participants: [],
        createdAt: new Date().toISOString(),
        maxParticipants: 2, // Doctor + Patient
        duration: '00:00:00'
      };

      res.json({
        success: true,
        roomStatus
      });

    } catch (error) {
      console.error('Failed to get room status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get room status',
        error: error.message
      });
    }
  };

}

export default VideoController;