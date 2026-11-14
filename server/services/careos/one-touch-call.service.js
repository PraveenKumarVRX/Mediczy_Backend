/**
 * CareOS — One-touch clinical video call (LiveKit patient room)
 */
import { AccessToken } from '../../integrations/livekit.js';
import { getAIServiceConfig } from '../../config/ai-services.config.js';

export async function createPatientCallToken({ patientId, userId, userName, role = 'clinician' }) {
  const cfg = getAIServiceConfig();
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const livekitUrl = cfg.liveKitUrl || process.env.LIVEKIT_URL;

  if (!apiKey || !apiSecret || !livekitUrl) {
    return {
      configured: false,
      room: `careos-patient-${patientId}`,
      message: 'LiveKit not configured — set LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL',
    };
  }

  const room = `careos-patient-${patientId}`;
  const token = new AccessToken(apiKey, apiSecret, {
    identity: `${role}-${userId}`,
    name: userName || `User ${userId}`,
    ttl: '2h',
  });
  token.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true });

  return {
    configured: true,
    token: await token.toJwt(),
    room,
    livekitUrl,
    layout: {
      left: 'patient_vitals',
      center: 'video',
      bottom: ['labs', 'ai_summary', 'medications', 'action_items'],
    },
  };
}

export default { createPatientCallToken };
