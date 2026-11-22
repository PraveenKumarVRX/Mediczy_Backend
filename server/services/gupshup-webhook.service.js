import crypto from 'node:crypto';
import { isIP } from 'node:net';
import { normalizeGupshupPhone, statusKey } from './gupshup-whatsapp.service.js';

const invalid = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
export function authorizeGupshup(req, env = process.env) {
  const secret = env.GUPSHUP_WEBHOOK_SECRET;
  const headerName = String(env.GUPSHUP_WEBHOOK_HEADER_NAME || 'x-gupshup-webhook-secret').trim();
  const allowedIps = String(env.GUPSHUP_WEBHOOK_ALLOWED_IPS || '').split(',').map(x => x.trim()).filter(Boolean);
  if (!secret && !allowedIps.length) throw invalid('Gupshup webhook authentication is not configured', 503);
  if (secret) {
    if (secret.length < 32) throw invalid('Gupshup webhook secret must contain at least 32 characters', 503);
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(headerName)) throw invalid('Gupshup webhook header name is invalid', 503);
    const actual = String(req.get(headerName) || '');
    const hash = x => crypto.createHash('sha256').update(x).digest();
    if (!crypto.timingSafeEqual(hash(actual), hash(secret))) throw invalid('Invalid webhook credentials', 403);
  }
  if (allowedIps.length) {
    // Express trusts one ingress proxy. Origin access must be restricted to that proxy.
    const ip = String(req.ip || '').replace(/^::ffff:/, '');
    if (!allowedIps.every(x => isIP(x)) || !allowedIps.includes(ip)) throw invalid('Webhook source is not allowed', 403);
  }
}
export function normalizeGupshupEvent(body, env = process.env) {
  if (!env.GUPSHUP_APP_NAME || !env.GUPSHUP_SOURCE_NUMBER) throw invalid('Gupshup app and number are not configured', 503);
  if (body?.app !== env.GUPSHUP_APP_NAME) throw invalid('Unexpected Gupshup app', 403);
  if (Number(body?.version) !== 2) throw invalid('Unsupported Gupshup webhook format; select Gupshup format (v2)', 422);
  const to = normalizeGupshupPhone(env.GUPSHUP_SOURCE_NUMBER);
  if (body.phone && normalizeGupshupPhone(body.phone) !== to) throw invalid('Unexpected receiving number', 403);
  const p = body.payload || {};
  if (body.type === 'message-event') {
    const sid = p.gsId || p.id;
    const statuses = ['enqueued', 'sent', 'delivered', 'read', 'failed'];
    if (!sid || !statuses.includes(p.type)) return { kind: 'ignored' };
    return { kind: 'status', sid: String(sid), status: p.type, timestamp: Number(body.timestamp) || 0,
      errorCode: p.payload?.code == null ? null : String(p.payload.code) };
  }
  if (body.type !== 'message') return { kind: 'ignored' }; // subscription verification/user/system events
  if (typeof p.id !== 'string' || !p.id || p.id.length > 256) throw invalid('Message ID is required');
  const from = normalizeGupshupPhone(p.source || p.sender?.phone);
  const data = p.payload || {};
  const supported = ['text', 'quick_reply', 'button_reply', 'list_reply'].includes(p.type);
  const text = supported ? (data.text || data.title || data.postbackText || '') : '';
  if (typeof text !== 'string' || (supported && !text.trim()) || text.length > 4096) throw invalid('Invalid message text');
  // A photo or document: kept for the Team's Chatwoot desk (the assistant cannot read files).
  // The link is Gupshup's own, short-lived and fetched once by the bridge; only https is accepted.
  const MEDIA = ['image', 'file', 'document', 'video', 'audio', 'sticker'];
  let media = null;
  if (MEDIA.includes(p.type)) {
    const m = data && typeof data === 'object' ? data : {};
    const url = typeof m.url === 'string' && /^https:\/\//i.test(m.url) && m.url.length <= 2000 ? m.url : null;
    if (url) {
      media = {
        type: p.type === 'document' ? 'file' : p.type,
        url,
        contentType: typeof m.contentType === 'string' ? m.contentType.slice(0, 100) : null,
        name: typeof m.name === 'string' ? m.name.slice(0, 200) : null,
        caption: typeof m.caption === 'string' ? m.caption.slice(0, 1024) : '',
      };
    }
  }
  return { kind: 'message', app: body.app, id: p.id, unsupportedMedia: !supported, media,
    message: { From: `whatsapp:+${from}`, To: `whatsapp:+${to}`, Body: media?.caption || text,
      MessageSid: p.id, ProfileName: String(p.sender?.name || '').slice(0, 200), NumMedia: media ? '1' : '0',
      ...(media ? { MediaUrl0: media.url, MediaContentType0: media.contentType || '', MediaName0: media.name || '' } : {}) } };
}
export const gupshupJobId = event => crypto.createHash('sha256').update(`${event.app}\0${event.id}`).digest('hex');

// Out-of-order DLRs must not regress delivered/read to sent or enqueued.
export async function saveGupshupStatus(redis, event) {
  const ranks = { enqueued: 1, sent: 2, failed: 3, delivered: 4, read: 5 };
  const value = { sid: event.sid, provider: 'gupshup', status: event.status,
    timestamp: event.timestamp, errorCode: event.errorCode, rank: ranks[event.status] };
  await redis.eval(`local old = redis.call('GET', KEYS[1])
    if old then local decoded = cjson.decode(old)
      if (decoded.rank or 0) > tonumber(ARGV[2]) then return 0 end
    end
    redis.call('SET', KEYS[1], ARGV[1], 'EX', 604800) return 1`,
  1, statusKey(event.sid), JSON.stringify(value), value.rank);
}

/** Factory keeps auth/parsing testable without starting Redis or sending messages. */
export function createGupshupWebhook({ enqueue, saveStatus, env = process.env }) {
  return async (req, res) => {
    try {
      if (env.WHATSAPP_PROVIDER !== 'gupshup') throw invalid('Gupshup provider is not active', 503);
      authorizeGupshup(req, env);
      const event = normalizeGupshupEvent(req.body, env);
      if (event.kind === 'status') await saveStatus(event);
      if (event.kind === 'message') await enqueue(event);
      return res.status(200).end(); // ACK only after durable acceptance; no TwiML.
    } catch (error) {
      return res.status(error.statusCode || 503).json({ success: false,
        message: error.statusCode ? error.message : 'Webhook storage unavailable; retry later' });
    }
  };
}
