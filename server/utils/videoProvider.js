import { AccessToken } from 'livekit-server-sdk';
import crypto from 'crypto';
import videoService from '../services/video.service.js';

const normalizeUrl = (url) => (url ? url.replace(/\/+$/, '') : '');

const resolveMeetBaseUrl = (settings = {}) => {
  const stripMeetPath = (url) => normalizeUrl(url).replace(/\/rooms?$/, '');
  const explicitMeetUrl = stripMeetPath(settings.meetUrl || process.env.LIVEKIT_MEET_URL);
  if (explicitMeetUrl) return explicitMeetUrl;

  const serverUrl = normalizeUrl(settings.serverUrl || process.env.LIVEKIT_URL);
  if (serverUrl) {
    return stripMeetPath(
      serverUrl.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://')
    );
  }

  return 'https://video.mediqzy.com';
};

const getProviderSettings = () =>
  videoService?.config?.providers?.livekit?.settings || {};

// PHASE 3.1: Canonical Meeting ID Generation
// Generate deterministic, non-sequential meeting IDs from appointment IDs
export const generateCanonicalMeetingId = (appointmentId) => {
  const secret = process.env.MEETING_ID_SECRET || 'mediczy-appointment-videoroom-v1';
  const hash = crypto
    .createHmac('sha256', secret)
    .update(String(appointmentId))
    .digest('hex')
    .substring(0, 8);
  return `apt-${appointmentId}-${hash}`;
};

// Verify that provided meeting ID matches canonical ID for appointment
export const verifyCanonicalMeetingId = (appointmentId, providedMeetingId) => {
  const expectedMeetingId = generateCanonicalMeetingId(appointmentId);
  return providedMeetingId === expectedMeetingId;
};

export const resolveVideoProvider = () => 'livekit';

export const getProviderLabel = () => 'LiveKit';

const resolveFrontendBaseUrl = () => {
  const base = process.env.FRONTEND_URL || process.env.SITE_URL || 'https://mediqzy.com';
  return normalizeUrl(base);
};

export const buildMeetingLink = (provider, meetingId, appointmentId) => {
  if (!meetingId) return null;
  const frontendBase = resolveFrontendBaseUrl();
  const derivedAppointmentId =
    appointmentId || (meetingId.startsWith('apt-') ? meetingId.replace('apt-', '') : null);
  const appointmentParam = derivedAppointmentId ? `&appointmentId=${encodeURIComponent(derivedAppointmentId)}` : '';
  return `${frontendBase}/video-consultation?room=${encodeURIComponent(meetingId)}${appointmentParam}`;
};

export const createMeetingInfo = ({ appointmentId } = {}) => {
  const meetingId = `apt-${appointmentId || Date.now()}`;
  const meetingLink = buildMeetingLink('livekit', meetingId, appointmentId);
  const meetingDetails = {
    platform: 'LiveKit',
    roomId: meetingId
  };

  return { provider: 'livekit', meetingId, meetingLink, meetingDetails };
};

export const ensureMeetingInfo = (appointment) => {
  let meetingId = appointment?.meetingId;
  let meetingLink = appointment?.meetingLink;
  let meetingDetails = appointment?.meetingDetails || {};
  let needsUpdate = false;
  const shouldReplaceLink = (link) => {
    if (!link) return true;
    try {
      const parsed = new URL(link);
      const isVideoHost = parsed.hostname === 'video.mediqzy.com';
      const isLivekitPath = parsed.pathname.startsWith('/rooms') || parsed.pathname.startsWith('/room') || parsed.pathname.startsWith('/join');
      return isVideoHost && isLivekitPath;
    } catch (error) {
      return false;
    }
  };

  if (!meetingId) {
    meetingId = `apt-${appointment?.id || Date.now()}`;
    needsUpdate = true;
  }

  if (!meetingLink || shouldReplaceLink(meetingLink)) {
    const derivedAppointmentId =
      appointment?.id || (meetingId?.startsWith('apt-') ? meetingId.replace('apt-', '') : null);
    meetingLink = buildMeetingLink('livekit', meetingId, derivedAppointmentId);
    needsUpdate = true;
  }

  if (!meetingDetails.platform || !meetingDetails.roomId) {
    meetingDetails = {
      ...meetingDetails,
      platform: 'LiveKit',
      roomId: meetingId
    };
    needsUpdate = true;
  }

  return { provider: 'livekit', meetingId, meetingLink, meetingDetails, needsUpdate };
};

/**
 * Build LiveKit join data with configurable TTL
 * @param {Object} options
 * @param {string} options.meetingId - Room/meeting ID
 * @param {string} options.identity - Unique user identity
 * @param {string} options.name - Display name
 * @param {number} [options.ttl] - Token TTL in seconds (default: 1 hour, max: 7 days)
 * @param {boolean} [options.canPublish=true] - Can publish audio/video
 * @param {boolean} [options.canSubscribe=true] - Can subscribe to others
 * @param {boolean} [options.roomAgnostic=false] - If true, token works for any room
 */
export const buildLiveKitJoinData = async ({ 
  meetingId, 
  identity, 
  name, 
  ttl,
  canPublish = true,
  canSubscribe = true,
  roomAgnostic = false
}) => {
  const settings = getProviderSettings();
  const serverUrl = settings.serverUrl || process.env.LIVEKIT_URL;
  const apiKey = settings.apiKey || process.env.LIVEKIT_API_KEY;
  const apiSecret = settings.apiSecret || process.env.LIVEKIT_API_SECRET;
  const meetBase = resolveMeetBaseUrl(settings);

  if (!serverUrl || !apiKey || !apiSecret) {
    throw new Error('LiveKit is not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET');
  }

  // Default TTL: 1 hour, Max TTL: 7 days (604800 seconds)
  const DEFAULT_TTL = 60 * 60; // 1 hour
  const MAX_TTL = 7 * 24 * 60 * 60; // 7 days
  const tokenTtl = Math.min(ttl || DEFAULT_TTL, MAX_TTL);

  const token = new AccessToken(apiKey, apiSecret, {
    identity,
    name,
    ttl: tokenTtl
  });
  
  // Room-agnostic tokens can join any room (useful for persistent tokens)
  const roomGrant = roomAgnostic ? '*' : meetingId;
  
  token.addGrant({
    roomJoin: true,
    room: roomGrant,
    canPublish,
    canSubscribe
  });

  const jwt = await token.toJwt();
  
  // For self-hosted LiveKit, the frontend will use these values to connect via SDK
  // serverUrl = WebSocket URL (wss://video.mediqzy.com)
  // token = JWT for authentication
  // roomName = room to join
  const meetUrl = `${meetBase}/rooms/${meetingId}`;
  return {
    serverUrl,
    token: jwt,
    roomName: meetingId,
    // These URLs are for reference - actual connection is via WebSocket
    meetUrl,
    joinUrl: `${meetUrl}?access_token=${encodeURIComponent(jwt)}`
  };
};
