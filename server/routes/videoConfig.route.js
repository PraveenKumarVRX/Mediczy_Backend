import express from 'express';
import { body, query } from 'express-validator';
import { validationResult } from 'express-validator';
import adminMiddleware from '../middleware/admin.middleware.js';
import videoService from '../services/video.service.js';

const router = express.Router();

/**
 * @route   GET /api/video-config/settings
 * @desc    Get video call configuration
 * @access  Admin
 */
router.get('/settings', adminMiddleware, async (req, res) => {
  try {
    const config = videoService.getConfig();
    
    res.json({
      success: true,
      config
    });
  } catch (error) {
    console.error('Error fetching video config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch video configuration',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/video-config/settings
 * @desc    Update video call configuration
 * @access  Admin
 */
router.post('/settings', adminMiddleware, [
  body('provider').optional().isIn(['webrtc', 'livekit', 'jitsi', 'zoom', 'agora', 'custom']),
  body('settings.maxParticipants').optional().isInt({ min: 2, max: 50 }),
  body('settings.videoQuality').optional().isIn(['low', 'medium', 'high', 'hd']),
  body('settings.audioQuality').optional().isIn(['low', 'medium', 'high']),
  body('settings.sessionTimeout').optional().isInt({ min: 300, max: 7200 }), // 5 min to 2 hours
  body('iceServers').optional().isArray()
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

    const result = videoService.updateConfig(req.body);
    
    res.json({
      success: true,
      message: 'Video configuration updated successfully',
      config: result.config
    });
  } catch (error) {
    console.error('Error updating video config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update video configuration',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/video-config/provider/:provider/configure
 * @desc    Configure specific video provider
 * @access  Admin
 */
router.post('/provider/:provider/configure', adminMiddleware, async (req, res) => {
  try {
    const { provider } = req.params;
    const { enabled, settings } = req.body;

    if (!videoService.config.providers[provider]) {
      return res.status(404).json({
        success: false,
        message: 'Provider not found'
      });
    }

    const updateData = {
      providers: {
        [provider]: {
          enabled: enabled !== undefined ? enabled : videoService.config.providers[provider].enabled,
          settings: { ...videoService.config.providers[provider].settings, ...settings }
        }
      }
    };

    const result = videoService.updateConfig(updateData);
    
    res.json({
      success: true,
      message: `${provider} provider configured successfully`,
      provider: result.config.providers[provider]
    });
  } catch (error) {
    console.error(`Error configuring ${req.params.provider} provider:`, error);
    res.status(500).json({
      success: false,
      message: `Failed to configure ${req.params.provider} provider`,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/video-config/provider/:provider/test
 * @desc    Test video provider connection
 * @access  Admin
 */
router.post('/provider/:provider/test', adminMiddleware, async (req, res) => {
  try {
    const { provider } = req.params;
    
    if (!videoService.config.providers[provider]) {
      return res.status(404).json({
        success: false,
        message: 'Provider not found'
      });
    }

    const testResult = await videoService.testProvider(provider);
    
    res.json({
      success: testResult.success,
      message: testResult.message,
      provider,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error(`Error testing ${req.params.provider} provider:`, error);
    res.status(500).json({
      success: false,
      message: `Failed to test ${req.params.provider} provider`,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/video-config/session/create
 * @desc    Create a new video session
 * @access  Admin
 */
router.post('/session/create', adminMiddleware, [
  body('appointmentId').optional().isInt(),
  body('doctorId').notEmpty().withMessage('Doctor ID is required'),
  body('patientId').notEmpty().withMessage('Patient ID is required'),
  body('roomId').optional().isString()
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

    const session = await videoService.createSession(req.body);
    
    res.json({
      success: true,
      message: 'Video session created successfully',
      session
    });
  } catch (error) {
    console.error('Error creating video session:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create video session',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/video-config/session/:sessionId/join
 * @desc    Join a video session
 * @access  Admin
 */
router.post('/session/:sessionId/join', adminMiddleware, [
  body('userId').notEmpty().withMessage('User ID is required'),
  body('role').optional().isIn(['doctor', 'patient', 'moderator'])
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

    const { sessionId } = req.params;
    const result = videoService.joinSession(sessionId, req.body);
    
    res.json({
      success: true,
      message: 'Successfully joined video session',
      session: result.session,
      participant: result.participant
    });
  } catch (error) {
    console.error('Error joining video session:', error);
    res.status(500).json({
      success: false,
      message: error.message,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/video-config/session/:sessionId/end
 * @desc    End a video session
 * @access  Admin
 */
router.post('/session/:sessionId/end', adminMiddleware, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { endedBy } = req.body;
    
    const session = videoService.endSession(sessionId, endedBy || 'admin');
    
    res.json({
      success: true,
      message: 'Video session ended successfully',
      session
    });
  } catch (error) {
    console.error('Error ending video session:', error);
    res.status(500).json({
      success: false,
      message: error.message,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/video-config/sessions/active
 * @desc    Get active video sessions
 * @access  Admin
 */
router.get('/sessions/active', adminMiddleware, async (req, res) => {
  try {
    const activeSessions = Array.from(videoService.sessions.values());
    
    res.json({
      success: true,
      sessions: activeSessions,
      count: activeSessions.length
    });
  } catch (error) {
    console.error('Error fetching active sessions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch active sessions',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/video-config/logs
 * @desc    Get video session logs
 * @access  Admin
 */
router.get('/logs', adminMiddleware, [
  query('provider').optional().isString(),
  query('action').optional().isString(),
  query('limit').optional().isInt({ min: 1, max: 100 })
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

    const options = {
      provider: req.query.provider,
      action: req.query.action,
      limit: parseInt(req.query.limit) || 50
    };

    const logs = videoService.getLogs(options);
    
    res.json({
      success: true,
      logs,
      total: logs.length,
      filters: options
    });
  } catch (error) {
    console.error('Error fetching video logs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch video logs',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/video-config/stats
 * @desc    Get video call statistics
 * @access  Admin
 */
router.get('/stats', adminMiddleware, async (req, res) => {
  try {
    const stats = videoService.getStats();
    
    res.json({
      success: true,
      stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching video stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch video statistics',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/video-config/providers
 * @desc    Get available video providers
 * @access  Admin
 */
router.get('/providers', adminMiddleware, async (req, res) => {
  try {
    const config = videoService.getConfig();
    
    res.json({
      success: true,
      providers: config.providers,
      currentProvider: config.provider
    });
  } catch (error) {
    console.error('Error fetching video providers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch video providers',
      error: error.message
    });
  }
});

export default router;
