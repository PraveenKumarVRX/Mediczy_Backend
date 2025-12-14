/**
 * Video Streaming Events Service
 * Handles Kafka events for video streaming, conferencing, and recording
 */

import { publishEvent, KAFKA_TOPICS } from '../config/kafka.js';

/**
 * Publish video stream started event
 */
export const publishVideoStreamStarted = async (streamData) => {
  try {
    await publishEvent(KAFKA_TOPICS.VIDEO_STREAM_STARTED, {
      type: 'VIDEO_STREAM_STARTED',
      timestamp: new Date().toISOString(),
      data: {
        streamId: streamData.streamId,
        roomId: streamData.roomId,
        userId: streamData.userId,
        userName: streamData.userName,
        userRole: streamData.userRole, // doctor, patient, nurse, etc.
        streamType: streamData.streamType || 'consultation', // consultation, emergency, group
        quality: streamData.quality || 'auto',
        metadata: streamData.metadata || {}
      }
    });
    console.log(`📹 Video stream started event published: ${streamData.streamId}`);
  } catch (error) {
    console.error('Error publishing video stream started event:', error);
  }
};

/**
 * Publish video stream ended event
 */
export const publishVideoStreamEnded = async (streamData) => {
  try {
    await publishEvent(KAFKA_TOPICS.VIDEO_STREAM_ENDED, {
      type: 'VIDEO_STREAM_ENDED',
      timestamp: new Date().toISOString(),
      data: {
        streamId: streamData.streamId,
        roomId: streamData.roomId,
        userId: streamData.userId,
        duration: streamData.duration, // in seconds
        endReason: streamData.endReason || 'normal', // normal, timeout, error, kicked
        participantCount: streamData.participantCount || 0,
        metadata: streamData.metadata || {}
      }
    });
    console.log(`📹 Video stream ended event published: ${streamData.streamId}`);
  } catch (error) {
    console.error('Error publishing video stream ended event:', error);
  }
};

/**
 * Publish video stream quality event
 */
export const publishVideoStreamQuality = async (qualityData) => {
  try {
    await publishEvent(KAFKA_TOPICS.VIDEO_STREAM_QUALITY, {
      type: 'VIDEO_STREAM_QUALITY',
      timestamp: new Date().toISOString(),
      data: {
        streamId: qualityData.streamId,
        roomId: qualityData.roomId,
        userId: qualityData.userId,
        quality: qualityData.quality, // excellent, good, fair, poor
        metrics: {
          bitrate: qualityData.bitrate,
          framerate: qualityData.framerate,
          resolution: qualityData.resolution,
          latency: qualityData.latency,
          packetLoss: qualityData.packetLoss || 0,
          jitter: qualityData.jitter || 0
        },
        networkType: qualityData.networkType || 'unknown', // wifi, cellular, ethernet
        metadata: qualityData.metadata || {}
      }
    });
  } catch (error) {
    console.error('Error publishing video stream quality event:', error);
  }
};

/**
 * Publish participant joined event
 */
export const publishParticipantJoined = async (participantData) => {
  try {
    await publishEvent(KAFKA_TOPICS.VIDEO_PARTICIPANT_JOINED, {
      type: 'VIDEO_PARTICIPANT_JOINED',
      timestamp: new Date().toISOString(),
      data: {
        streamId: participantData.streamId,
        roomId: participantData.roomId,
        userId: participantData.userId,
        userName: participantData.userName,
        userRole: participantData.userRole,
        audioEnabled: participantData.audioEnabled !== false,
        videoEnabled: participantData.videoEnabled !== false,
        device: participantData.device || 'unknown', // desktop, mobile, tablet
        browser: participantData.browser || 'unknown',
        metadata: participantData.metadata || {}
      }
    });
    console.log(`📹 Participant joined event published: ${participantData.userId} in ${participantData.roomId}`);
  } catch (error) {
    console.error('Error publishing participant joined event:', error);
  }
};

/**
 * Publish participant left event
 */
export const publishParticipantLeft = async (participantData) => {
  try {
    await publishEvent(KAFKA_TOPICS.VIDEO_PARTICIPANT_LEFT, {
      type: 'VIDEO_PARTICIPANT_LEFT',
      timestamp: new Date().toISOString(),
      data: {
        streamId: participantData.streamId,
        roomId: participantData.roomId,
        userId: participantData.userId,
        duration: participantData.duration, // time spent in call (seconds)
        leaveReason: participantData.leaveReason || 'normal', // normal, connection_lost, kicked
        metadata: participantData.metadata || {}
      }
    });
    console.log(`📹 Participant left event published: ${participantData.userId} from ${participantData.roomId}`);
  } catch (error) {
    console.error('Error publishing participant left event:', error);
  }
};

/**
 * Publish recording started event
 */
export const publishRecordingStarted = async (recordingData) => {
  try {
    await publishEvent(KAFKA_TOPICS.VIDEO_RECORDING_STARTED, {
      type: 'VIDEO_RECORDING_STARTED',
      timestamp: new Date().toISOString(),
      data: {
        recordingId: recordingData.recordingId,
        streamId: recordingData.streamId,
        roomId: recordingData.roomId,
        initiatedBy: recordingData.initiatedBy, // userId who started recording
        format: recordingData.format || 'mp4',
        quality: recordingData.quality || 'hd',
        storageLocation: recordingData.storageLocation || 's3',
        metadata: recordingData.metadata || {}
      }
    });
    console.log(`🎥 Recording started event published: ${recordingData.recordingId}`);
  } catch (error) {
    console.error('Error publishing recording started event:', error);
  }
};

/**
 * Publish recording stopped event
 */
export const publishRecordingStopped = async (recordingData) => {
  try {
    await publishEvent(KAFKA_TOPICS.VIDEO_RECORDING_STOPPED, {
      type: 'VIDEO_RECORDING_STOPPED',
      timestamp: new Date().toISOString(),
      data: {
        recordingId: recordingData.recordingId,
        streamId: recordingData.streamId,
        roomId: recordingData.roomId,
        duration: recordingData.duration, // recording duration in seconds
        fileSize: recordingData.fileSize, // in bytes
        filePath: recordingData.filePath,
        stopReason: recordingData.stopReason || 'normal', // normal, error, storage_full
        metadata: recordingData.metadata || {}
      }
    });
    console.log(`🎥 Recording stopped event published: ${recordingData.recordingId}`);
  } catch (error) {
    console.error('Error publishing recording stopped event:', error);
  }
};

/**
 * Publish video stream error event
 */
export const publishVideoStreamError = async (errorData) => {
  try {
    await publishEvent(KAFKA_TOPICS.VIDEO_STREAM_ERROR, {
      type: 'VIDEO_STREAM_ERROR',
      timestamp: new Date().toISOString(),
      data: {
        streamId: errorData.streamId,
        roomId: errorData.roomId,
        userId: errorData.userId,
        errorType: errorData.errorType, // connection, permission, codec, bandwidth
        errorMessage: errorData.errorMessage,
        severity: errorData.severity || 'medium', // low, medium, high, critical
        recovered: errorData.recovered || false,
        metadata: errorData.metadata || {}
      }
    });
    console.log(`⚠️ Video stream error event published: ${errorData.errorType}`);
  } catch (error) {
    console.error('Error publishing video stream error event:', error);
  }
};

export default {
  publishVideoStreamStarted,
  publishVideoStreamEnded,
  publishVideoStreamQuality,
  publishParticipantJoined,
  publishParticipantLeft,
  publishRecordingStarted,
  publishRecordingStopped,
  publishVideoStreamError
};
