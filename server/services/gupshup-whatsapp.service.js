import axios from '../integrations/axios.js';
import crypto from 'node:crypto';

export const whatsappProvider = () => String(process.env.WHATSAPP_PROVIDER || 'twilio').trim().toLowerCase();
export const statusKey = (id) => `gupshup:status:${crypto.createHash('sha256').update(String(id)).digest('hex')}`;

export function normalizeGupshupPhone(value) {
  let phone = String(value || '').trim().replace(/^whatsapp:/i, '').replace(/[+\s()-]/g, '');
  if (/^[6-9]\d{9}$/.test(phone)) phone = `91${phone}`;
  if (!/^[1-9]\d{7,14}$/.test(phone)) throw new Error('A valid international WhatsApp number is required');
  return phone;
}

/** Self-Serve Access API. Never return Axios errors containing the API key/body. */
export class GupshupWhatsAppService {
  constructor({ http = axios, config } = {}) { this.http = http; this.configOverride = config; }
  get config() {
    return this.configOverride || {
      apiKey: process.env.GUPSHUP_API_KEY,
      appName: process.env.GUPSHUP_APP_NAME,
      sourceNumber: process.env.GUPSHUP_SOURCE_NUMBER,
    };
  }
  get configured() {
    const c = this.config;
    try { return Boolean(c.apiKey?.trim() && c.appName?.trim() && normalizeGupshupPhone(c.sourceNumber)); }
    catch { return false; }
  }
  async submit(to, fields, path) {
    if (!this.configured) throw new Error('Gupshup API key, app name and source number must be configured');
    const c = this.config;
    const destination = normalizeGupshupPhone(to);
    const form = new URLSearchParams({ channel: 'whatsapp', source: normalizeGupshupPhone(c.sourceNumber),
      destination, 'src.name': c.appName, ...fields });
    let data;
    try {
      ({ data } = await this.http.post(`https://api.gupshup.io${path}`, form.toString(), {
        headers: { apikey: c.apiKey, 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10000, maxRedirects: 0,
      }));
    } catch (cause) {
      const status = Number(cause.response?.status) || undefined;
      throw Object.assign(new Error(status ? `Gupshup rejected the request (HTTP ${status})` : 'Gupshup delivery outcome is unknown; reconcile before retrying'),
        { code: status ? 'GUPSHUP_REQUEST_REJECTED' : 'GUPSHUP_DELIVERY_UNCERTAIN', status,
          definitelyNotSent: Boolean(status && status >= 400 && status < 500 && status !== 408) });
    }
    if (!['submitted', 'success'].includes(String(data?.status || '').toLowerCase()) || !data?.messageId) {
      throw Object.assign(new Error('Gupshup did not confirm message submission'), { code: 'GUPSHUP_INVALID_RESPONSE' });
    }
    return { sid: data.messageId, messageId: data.messageId, provider: 'gupshup', status: 'submitted',
      to: `whatsapp:+${destination}`, from: `whatsapp:+${normalizeGupshupPhone(c.sourceNumber)}` };
  }
  sendText({ to, body }) {
    if (typeof body !== 'string' || !body.trim() || body.length > 4096) throw new Error('WhatsApp text must contain 1–4096 characters');
    return this.submit(to, { message: JSON.stringify({ type: 'text', text: body }) }, '/wa/api/v1/msg');
  }
  sendTemplate({ to, templateId, params = [] }) {
    if (!templateId || /^HX/i.test(templateId)) throw new Error('An approved Gupshup template ID is required; Twilio Content SIDs cannot be reused');
    if (!Array.isArray(params) || params.some(v => v === undefined || v === null)) throw new Error('Ordered Gupshup template parameters are required');
    // Meta rejects a template whose variable is empty, after Gupshup has
    // accepted the call — so an empty value would look sent and never arrive.
    if (params.some(v => !String(v).trim())) throw new Error('Every WhatsApp template parameter needs a value; an empty one is rejected by WhatsApp');
    return this.submit(to, { template: JSON.stringify({ id: templateId, params: params.map(String) }) }, '/wa/api/v1/template/msg');
  }
  sendMedia({ to, mediaUrl, caption = '', mediaType }) {
    const url = new URL(mediaUrl);
    if (url.protocol !== 'https:') throw new Error('WhatsApp media requires an HTTPS URL');
    const ext = url.pathname.split('.').pop().toLowerCase();
    const type = mediaType || ({ jpg: 'image', jpeg: 'image', png: 'image', pdf: 'file', mp3: 'audio', ogg: 'audio', mp4: 'video' })[ext];
    if (!['image', 'file', 'audio', 'video'].includes(type)) throw new Error('Specify a supported WhatsApp media type');
    const message = type === 'image' ? { type, originalUrl: mediaUrl, previewUrl: mediaUrl, caption }
      : { type, url: mediaUrl, ...(type === 'file' ? { filename: url.pathname.split('/').pop() || 'document' } : {}), ...(type !== 'audio' ? { caption } : {}) };
    return this.submit(to, { message: JSON.stringify(message) }, '/wa/api/v1/msg');
  }
  async getMessageStatus(id) {
    const { default: redis } = await import('../config/redis.js');
    const saved = await redis.get(statusKey(id));
    return saved ? JSON.parse(saved) : { sid: id, provider: 'gupshup', status: 'unknown', pending: true };
  }
}
export default new GupshupWhatsAppService();
