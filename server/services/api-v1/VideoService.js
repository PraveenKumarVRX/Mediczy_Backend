import BaseService from '../BaseService.js';
import { ErrorTypes } from '../../middleware/errorHandler.js';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

class VideoService extends BaseService {
  constructor() {
    super('api_appointments'); // Video sessions are linked to appointments
  }

  /**
   * Generate LiveKit access token for video consultation
   */
  async generateToken(tenantId, appointmentId, userId, role) {
    // Verify appointment exists and user has access
    const appointment = await this.findById(appointmentId, tenantId);

    // Verify user is participant in this appointment
    const isDoctor = appointment.doctor_id === userId;
    const isPatient = appointment.user_id === userId;

    if (!isDoctor && !isPatient) {
      throw ErrorTypes.Forbidden('User is not a participant in this appointment');
    }

    // Check appointment status
    if (!['scheduled', 'confirmed', 'in_progress'].includes(appointment.status)) {
      throw ErrorTypes.BadRequest('Appointment is not in a valid state for video consultation', {
        status: appointment.status
      });
    }

    // Generate room name from appointment ID
    const roomName = `appointment-${appointmentId}`;

    // LiveKit token claims
    const livekitApiKey = process.env.LIVEKIT_API_KEY;
    const livekitApiSecret = process.env.LIVEKIT_API_SECRET;

    if (!livekitApiKey || !livekitApiSecret) {
      throw ErrorTypes.InternalServer('LiveKit credentials not configured');
    }

    // Create token with LiveKit-compatible claims
    const tokenPayload = {
      video: {
        room: roomName,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true
      },
      identity: userId,
      name: isDoctor ? `Dr. ${userId}` : `Patient ${userId}`,
      metadata: JSON.stringify({
        appointmentId,
        role: isDoctor ? 'doctor' : 'patient',
        tenantId
      })
    };

    // Sign token (expires in 1 hour)
    const token = jwt.sign(tokenPayload, livekitApiSecret, {
      algorithm: 'HS256',
      issuer: livekitApiKey,
      expiresIn: '1h',
      subject: userId
    });

    // Update appointment status if not already started
    if (appointment.status !== 'in_progress') {
      await this.update(appointmentId, {
        status: 'in_progress',
        started_at: new Date()
      }, tenantId);
    }

    return {
      token,
      roomName,
      serverUrl: process.env.LIVEKIT_URL || 'wss://livekit.example.com',
      identity: userId,
      role: isDoctor ? 'doctor' : 'patient',
      expiresAt: new Date(Date.now() + 3600000).toISOString() // 1 hour from now
    };
  }

  /**
   * Create a video room (placeholder - room creation is automatic in LiveKit)
   */
  async createRoom(tenantId, appointmentId) {
    const appointment = await this.findById(appointmentId, tenantId);

    const roomName = `appointment-${appointmentId}`;

    // In production, you would call LiveKit API to create a room
    // For now, we just return room details
    return {
      roomName,
      appointmentId,
      status: 'created',
      createdAt: new Date().toISOString()
    };
  }

  /**
   * End a video room session
   */
  async endRoom(tenantId, appointmentId) {
    const appointment = await this.findById(appointmentId, tenantId);

    // Update appointment status to completed
    const updates = {
      status: 'completed',
      completed_at: new Date()
    };

    await this.update(appointmentId, updates, tenantId);

    // In production, you would call LiveKit API to close the room
    const roomName = `appointment-${appointmentId}`;

    return {
      roomName,
      appointmentId,
      status: 'ended',
      endedAt: new Date().toISOString()
    };
  }

  /**
   * Get video session details
   */
  async getSessionDetails(tenantId, appointmentId) {
    const appointment = await this.findById(appointmentId, tenantId);

    const roomName = `appointment-${appointmentId}`;

    return {
      roomName,
      appointmentId,
      status: appointment.status,
      startedAt: appointment.started_at,
      completedAt: appointment.completed_at,
      participants: {
        doctor: appointment.doctor_id,
        patient: appointment.user_id
      }
    };
  }

  /**
   * Generate a webhook signature for LiveKit webhooks
   */
  generateWebhookSignature(payload) {
    const secret = process.env.LIVEKIT_API_SECRET;
    
    if (!secret) {
      throw ErrorTypes.InternalServer('LiveKit API secret not configured');
    }

    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    return hmac.digest('hex');
  }

  /**
   * Verify LiveKit webhook signature
   */
  verifyWebhookSignature(payload, signature) {
    const expectedSignature = this.generateWebhookSignature(payload);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  /**
   * Handle LiveKit webhook events
   */
  async handleWebhookEvent(tenantId, event) {
    const { eventType, roomName, participant } = event;

    // Extract appointment ID from room name
    const appointmentId = roomName.replace('appointment-', '');

    switch (eventType) {
      case 'room_started':
        // Room has started
        break;

      case 'room_finished':
        // End the appointment
        await this.endRoom(tenantId, appointmentId);
        break;

      case 'participant_joined':
        // Log participant join
        break;

      case 'participant_left':
        // Log participant leave
        break;

      default:
        // Unknown event type
        break;
    }

    return { handled: true, eventType };
  }
}

export default VideoService;
