import express from 'express';
import { body, param } from 'express-validator';
import VideoController from '../controller/video.controller.js';
import { authUser } from '../middleware/auth.middleware.js';

const router = express.Router();

/**
 * @route   GET /api/video/test
 * @desc    Test video calling system
 * @access  Public
 */
router.get('/test', VideoController.testVideoSystem);

/**
 * @route   POST /api/video/room/token
 * @desc    Generate video room token
 * @access  Private
 */
router.post(
  '/room/token',
  authUser,
  [
    body('roomId').notEmpty().withMessage('Room ID is required'),
    body('appointmentId').optional().isInt().withMessage('Valid appointment ID is required')
  ],
  VideoController.generateRoomToken
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

export default router;