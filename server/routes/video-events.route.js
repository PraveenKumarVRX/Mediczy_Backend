/**
 * Video Streaming Events Routes
 * API endpoints for publishing video streaming events to Kafka
 */

import express from 'express';
import videoStreamingEvents from '../services/videoStreamingEvents.js';

const router = express.Router();

/**
 * POST /api/video-events/stream/start
 * Publish video stream started event
 */
router.post('/stream/start', async (req, res) => {
  try {
    const { streamId, roomId, userId, userName, userRole, streamType, quality, metadata } = req.body;
    
    if (!streamId || !roomId || !userId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: streamId, roomId, userId'
      });
    }
    
    await videoStreamingEvents.publishVideoStreamStarted({
      streamId,
      roomId,
      userId,
      userName,
      userRole,
      streamType,
      quality,
      metadata
    });
    
    res.json({
      success: true,
      message: 'Video stream started event published'
    });
  } catch (error) {
    console.error('Error publishing stream start event:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to publish stream start event'
    });
  }
});

/**
 * POST /api/video-events/stream/end
 * Publish video stream ended event
 */
router.post('/stream/end', async (req, res) => {
  try {
    const { streamId, roomId, userId, duration, endReason, participantCount, metadata } = req.body;
    
    if (!streamId || !roomId || !userId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: streamId, roomId, userId'
      });
    }
    
    await videoStreamingEvents.publishVideoStreamEnded({
      streamId,
      roomId,
      userId,
      duration,
      endReason,
      participantCount,
      metadata
    });
    
    res.json({
      success: true,
      message: 'Video stream ended event published'
    });
  } catch (error) {
    console.error('Error publishing stream end event:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to publish stream end event'
    });
  }
});

/**
 * POST /api/video-events/stream/quality
 * Publish video stream quality metrics event
 */
router.post('/stream/quality', async (req, res) => {
  try {
    const { streamId, roomId, userId, quality, bitrate, framerate, resolution, latency, packetLoss, jitter, networkType, metadata } = req.body;
    
    if (!streamId || !roomId || !userId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: streamId, roomId, userId'
      });
    }
    
    await videoStreamingEvents.publishVideoStreamQuality({
      streamId,
      roomId,
      userId,
      quality,
      bitrate,
      framerate,
      resolution,
      latency,
      packetLoss,
      jitter,
      networkType,
      metadata
    });
    
    res.json({
      success: true,
      message: 'Video stream quality event published'
    });
  } catch (error) {
    console.error('Error publishing stream quality event:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to publish stream quality event'
    });
  }
});

/**
 * POST /api/video-events/participant/joined
 * Publish participant joined event
 */
router.post('/participant/joined', async (req, res) => {
  try {
    const { streamId, roomId, userId, userName, userRole, audioEnabled, videoEnabled, device, browser, metadata } = req.body;
    
    if (!streamId || !roomId || !userId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: streamId, roomId, userId'
      });
    }
    
    await videoStreamingEvents.publishParticipantJoined({
      streamId,
      roomId,
      userId,
      userName,
      userRole,
      audioEnabled,
      videoEnabled,
      device,
      browser,
      metadata
    });
    
    res.json({
      success: true,
      message: 'Participant joined event published'
    });
  } catch (error) {
    console.error('Error publishing participant joined event:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to publish participant joined event'
    });
  }
});

/**
 * POST /api/video-events/participant/left
 * Publish participant left event
 */
router.post('/participant/left', async (req, res) => {
  try {
    const { streamId, roomId, userId, duration, leaveReason, metadata } = req.body;
    
    if (!streamId || !roomId || !userId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: streamId, roomId, userId'
      });
    }
    
    await videoStreamingEvents.publishParticipantLeft({
      streamId,
      roomId,
      userId,
      duration,
      leaveReason,
      metadata
    });
    
    res.json({
      success: true,
      message: 'Participant left event published'
    });
  } catch (error) {
    console.error('Error publishing participant left event:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to publish participant left event'
    });
  }
});

/**
 * POST /api/video-events/recording/start
 * Publish recording started event
 */
router.post('/recording/start', async (req, res) => {
  try {
    const { recordingId, streamId, roomId, initiatedBy, format, quality, storageLocation, metadata } = req.body;
    
    if (!recordingId || !streamId || !roomId || !initiatedBy) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: recordingId, streamId, roomId, initiatedBy'
      });
    }
    
    await videoStreamingEvents.publishRecordingStarted({
      recordingId,
      streamId,
      roomId,
      initiatedBy,
      format,
      quality,
      storageLocation,
      metadata
    });
    
    res.json({
      success: true,
      message: 'Recording started event published'
    });
  } catch (error) {
    console.error('Error publishing recording start event:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to publish recording start event'
    });
  }
});

/**
 * POST /api/video-events/recording/stop
 * Publish recording stopped event
 */
router.post('/recording/stop', async (req, res) => {
  try {
    const { recordingId, streamId, roomId, duration, fileSize, filePath, stopReason, metadata } = req.body;
    
    if (!recordingId || !streamId || !roomId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: recordingId, streamId, roomId'
      });
    }
    
    await videoStreamingEvents.publishRecordingStopped({
      recordingId,
      streamId,
      roomId,
      duration,
      fileSize,
      filePath,
      stopReason,
      metadata
    });
    
    res.json({
      success: true,
      message: 'Recording stopped event published'
    });
  } catch (error) {
    console.error('Error publishing recording stop event:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to publish recording stop event'
    });
  }
});

/**
 * POST /api/video-events/stream/error
 * Publish video stream error event
 */
router.post('/stream/error', async (req, res) => {
  try {
    const { streamId, roomId, userId, errorType, errorMessage, severity, recovered, metadata } = req.body;
    
    if (!streamId || !roomId || !errorType) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: streamId, roomId, errorType'
      });
    }
    
    await videoStreamingEvents.publishVideoStreamError({
      streamId,
      roomId,
      userId,
      errorType,
      errorMessage,
      severity,
      recovered,
      metadata
    });
    
    res.json({
      success: true,
      message: 'Video stream error event published'
    });
  } catch (error) {
    console.error('Error publishing stream error event:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to publish stream error event'
    });
  }
});

export default router;
