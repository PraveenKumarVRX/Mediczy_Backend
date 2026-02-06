import VideoService from '../../services/api-v1/VideoService.js';
import { asyncHandler } from '../../middleware/errorHandler.js';

const videoService = new VideoService();

/**
 * Generate LiveKit access token for video consultation
 */
export const generateToken = asyncHandler(async (req, res) => {
  const { appointmentId } = req.params;
  const { userId, role } = req.body;
  
  const tokenData = await videoService.generateToken(
    req.tenantId,
    appointmentId,
    userId,
    role
  );
  
  res.json(tokenData);
});

/**
 * Create a video room
 */
export const createRoom = asyncHandler(async (req, res) => {
  const { appointmentId } = req.params;
  
  const room = await videoService.createRoom(req.tenantId, appointmentId);
  res.status(201).json(room);
});

/**
 * End a video room session
 */
export const endRoom = asyncHandler(async (req, res) => {
  const { appointmentId } = req.params;
  
  const result = await videoService.endRoom(req.tenantId, appointmentId);
  res.json(result);
});

/**
 * Get video session details
 */
export const getSessionDetails = asyncHandler(async (req, res) => {
  const { appointmentId } = req.params;
  
  const session = await videoService.getSessionDetails(req.tenantId, appointmentId);
  res.json(session);
});

/**
 * Handle LiveKit webhook events
 */
export const handleWebhook = asyncHandler(async (req, res) => {
  const signature = req.headers['x-livekit-signature'];
  const event = req.body;
  
  // Verify webhook signature
  const isValid = videoService.verifyWebhookSignature(event, signature);
  
  if (!isValid) {
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }
  
  const result = await videoService.handleWebhookEvent(req.tenantId, event);
  res.json(result);
});

/**
 * Get video room status (alias for getSessionDetails)
 */
export const getRoomStatus = getSessionDetails;

/**
 * End video call (alias for endRoom)  
 */
export const endVideoCall = endRoom;
