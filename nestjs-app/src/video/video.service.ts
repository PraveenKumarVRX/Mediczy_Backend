import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { publishEvent, KAFKA_TOPICS } from '../../../server/config/kafka.js';
import { cacheSet, cacheGet } from '../../../server/config/redis-hardened.js';

// LiveKit SDK (server-side token generation)
let _livekitSdk: any = null;
async function getLiveKit() {
  if (!_livekitSdk) _livekitSdk = await import('livekit-server-sdk');
  return _livekitSdk;
}

@Injectable()
export class VideoService {
  constructor(
    private readonly prisma:  PrismaService,
    private readonly config:  ConfigService,
  ) {}

  // ── Room management ────────────────────────────────────────────────────────

  async createRoom(appointmentId: number, hostUserId: number) {
    const appt = await this.prisma.appointment.findUnique({ where: { id: appointmentId } });
    if (!appt) throw new NotFoundException('Appointment not found');

    if (appt.userId !== hostUserId && appt.doctorId !== hostUserId) {
      throw new ForbiddenException('Not a participant in this appointment');
    }

    const roomName = `mediczy-${appointmentId}-${Date.now()}`;
    const lk = await getLiveKit();

    const apiKey    = this.config.getOrThrow('LIVEKIT_API_KEY');
    const apiSecret = this.config.getOrThrow('LIVEKIT_API_SECRET');
    const livekitUrl = this.config.getOrThrow('LIVEKIT_URL');

    const roomClient = new lk.RoomServiceClient(livekitUrl, apiKey, apiSecret);

    await roomClient.createRoom({
      name:               roomName,
      maxParticipants:    10,
      emptyTimeout:       300,   // 5 min empty before deletion
      departureTimeout:   20,
      metadata:           JSON.stringify({ appointmentId, createdBy: hostUserId }),
    });

    // Store room info in Redis (24h TTL)
    await cacheSet(`video:room:${appointmentId}`, { roomName, livekitUrl }, 86400);

    await publishEvent(KAFKA_TOPICS.CONSULTATION_STARTED, {
      appointmentId, roomName, hostUserId,
    }).catch(() => {});

    return { roomName, livekitUrl };
  }

  async joinRoom(appointmentId: number, userId: number, userRole: 'patient' | 'doctor' | 'observer') {
    const cached = await cacheGet(`video:room:${appointmentId}`);
    if (!cached) throw new NotFoundException('Room not found or not yet created');

    const { roomName, livekitUrl } = cached as { roomName: string; livekitUrl: string };

    const appt = await this.prisma.appointment.findUnique({ where: { id: appointmentId } });
    if (!appt) throw new NotFoundException('Appointment not found');

    // Verify participant
    if (userRole !== 'observer' && appt.userId !== userId && appt.doctorId !== userId) {
      throw new ForbiddenException('Not a participant in this appointment');
    }

    const lk = await getLiveKit();
    const apiKey    = this.config.getOrThrow('LIVEKIT_API_KEY');
    const apiSecret = this.config.getOrThrow('LIVEKIT_API_SECRET');

    const at = new lk.AccessToken(apiKey, apiSecret, {
      identity: String(userId),
      name:     `User-${userId}`,
      ttl:      '2h',
    });

    at.addGrant({
      roomJoin:      true,
      room:          roomName,
      canPublish:    userRole !== 'observer',
      canSubscribe:  true,
      canPublishData: true,
    });

    const token = await at.toJwt();
    return { token, roomName, livekitUrl };
  }

  async endRoom(appointmentId: number, userId: number) {
    const cached = await cacheGet(`video:room:${appointmentId}`);
    if (!cached) return { ended: false, reason: 'Room not active' };

    const { roomName, livekitUrl } = cached as { roomName: string; livekitUrl: string };
    const lk = await getLiveKit();

    const apiKey    = this.config.getOrThrow('LIVEKIT_API_KEY');
    const apiSecret = this.config.getOrThrow('LIVEKIT_API_SECRET');

    const roomClient = new lk.RoomServiceClient(livekitUrl, apiKey, apiSecret);
    await roomClient.deleteRoom(roomName).catch(() => {});

    await cacheSet(`video:room:${appointmentId}`, null, 1);

    await publishEvent(KAFKA_TOPICS.CONSULTATION_ENDED, { appointmentId, endedBy: userId }).catch(() => {});

    return { ended: true, roomName };
  }

  async getRoomStatus(appointmentId: number) {
    const cached = await cacheGet(`video:room:${appointmentId}`);
    if (!cached) return { active: false };

    const { roomName, livekitUrl } = cached as any;
    const lk = await getLiveKit();

    try {
      const apiKey    = this.config.getOrThrow('LIVEKIT_API_KEY');
      const apiSecret = this.config.getOrThrow('LIVEKIT_API_SECRET');
      const roomClient = new lk.RoomServiceClient(livekitUrl, apiKey, apiSecret);
      const participants = await roomClient.listParticipants(roomName);
      return { active: true, roomName, participantCount: participants.length };
    } catch {
      return { active: false, roomName };
    }
  }
}
