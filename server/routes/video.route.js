import express from 'express';
import { body, param } from 'express-validator';
import VideoController from '../controller/video.controller.js';
import { authUser } from '../middleware/auth.middleware.js';

const router = express.Router();

/**
 * @route   GET /api/video/health
 * @desc    Health check for video calling subsystem
 * @access  Public
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    service: 'video',
    timestamp: new Date().toISOString()
  });
});

/**
 * @route   GET /api/video/test
 * @desc    Test video calling system
 * @access  Public
 */
router.get('/test', VideoController.testVideoSystem);

/**
 * @route   GET /api/video/livekit/diagnostics
 * @desc    Validate LiveKit API reachability and ICE configuration
 * @access  Private
 */
router.get('/livekit/diagnostics', authUser, VideoController.liveKitDiagnostics);

/**
 * @route   POST /api/video/room/token
 * @desc    Generate video room token
 * @access  Private
 */
router.post(
  '/room/token',
  authUser,
  [
    body('roomId')
      .optional()
      .isString()
      .withMessage('Room ID must be a string')
      .custom((value, { req }) => {
        if (!value && !req.body.appointmentId) {
          throw new Error('roomId or appointmentId is required');
        }
        return true;
      }),
    body('appointmentId').optional().isInt().withMessage('Valid appointment ID is required')
  ],
  VideoController.generateRoomToken
);

/**
 * @route   GET /api/video/livekit/token
 * @desc    Generate LiveKit token without appointment context (GET version for compatibility)
 * @access  Private
 */
router.get(
  '/livekit/token',
  authUser,
  VideoController.generateLiveKitTokenFromQuery
);

/**
 * @route   POST /api/video/livekit/token
 * @desc    Generate LiveKit token without appointment context
 * @access  Private
 */
router.post(
  '/livekit/token',
  authUser,
  [
    body('roomName').optional().isString().withMessage('Room name must be a string'),
    body('roomId').optional().isString().withMessage('Room ID must be a string'),
    body('appointmentId').optional().isInt().withMessage('Valid appointment ID is required'),
    body('identity').optional().isString().withMessage('Identity must be a string')
  ],
  VideoController.generateLiveKitToken
);

/**
 * @route   POST /api/video/room/:roomId/join
 * @desc    Join video room
 * @access  Private
 */
router.post(
  '/room/:roomId/join',
  authUser,
  [
    param('roomId').notEmpty().withMessage('Room ID is required')
  ],
  VideoController.joinRoom
);

/**
 * @route   POST /api/video/room/:roomId/leave
 * @desc    Leave video room
 * @access  Private
 */
router.post(
  '/room/:roomId/leave',
  authUser,
  [
    param('roomId').notEmpty().withMessage('Room ID is required')
  ],
  VideoController.leaveRoom
);

/**
 * @route   GET /api/video/room/:roomId/status
 * @desc    Get video room status
 * @access  Private
 */
router.get(
  '/room/:roomId/status',
  authUser,
  [
    param('roomId').notEmpty().withMessage('Room ID is required')
  ],
  VideoController.getRoomStatus
);

/**
 * @route   POST /api/video/room/:roomId/invite
 * @desc    Create a shareable invite link for family/friends to join the video call
 * @access  Private (Doctor or authenticated user)
 * @body    { label?: string, maxUses?: number }
 * @returns { invite: { shareableUrl, code, expiresAt, maxUses } }
 */
router.post(
  '/room/:roomId/invite',
  authUser,
  [
    param('roomId').notEmpty().withMessage('Room ID is required')
  ],
  VideoController.createInviteLink
);

/**
 * @route   GET /api/video/join/:inviteCode
 * @desc    Public endpoint — guest joins via invite link (no login required)
 * @access  Public (invite code acts as the credential)
 * @query   name — guest display name (optional)
 * @returns { livekit: { token, serverUrl, roomName } }
 */
router.get(
  '/join/:inviteCode',
  [
    param('inviteCode').notEmpty().withMessage('Invite code is required')
  ],
  VideoController.joinViaInvite
);

export default router;
