import { AccessToken } from 'livekit-server-sdk';
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

export const resolveVideoProvider = () => 'livekit';

export const getProviderLabel = () => 'LiveKit';

export const buildMeetingLink = (provider, meetingId) => {
  if (!meetingId) return null;
  // Meeting links should point to the LiveKit Meet UI (HTTPS).
  const settings = getProviderSettings();
  const meetBase = resolveMeetBaseUrl(settings);
  return `${meetBase}/rooms/${meetingId}`;
};

export const createMeetingInfo = ({ appointmentId } = {}) => {
  const meetingId = `apt-${appointmentId || Date.now()}`;
  const meetingLink = buildMeetingLink('livekit', meetingId);
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

  if (!meetingId) {
    meetingId = `apt-${appointment?.id || Date.now()}`;
    needsUpdate = true;
  }

  if (!meetingLink) {
    meetingLink = buildMeetingLink('livekit', meetingId);
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
