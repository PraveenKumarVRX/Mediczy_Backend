import axios from '../integrations/axios.js';
import twilio from '../integrations/twilio.js';
import nodemailer from '../integrations/nodemailer.js';
import pool from '../db/pgPool.js';
import { ChatwootService, normalizeChannelAddress } from './chatwoot.service.js';
import gupshup from './gupshup-whatsapp.service.js';
import { setHandoffState, clearHandoffState } from './whatsapp-handoff.service.js';
import { scanOnly } from './minio-upload.service.js';

// Files a member may send to the Team, and that an agent may send to a member.
const MAX_FILE_BYTES = 16 * 1024 * 1024;
const FILE_TYPES = /^(image\/(jpeg|png|webp|gif|heic|heif)|application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)|application\/vnd\.ms-excel|text\/plain|audio\/(ogg|mpeg|mp4|aac|amr)|video\/(mp4|3gpp))(;.*)?$/i;
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'video/mp4': 'mp4', 'text/plain': 'txt' };
const safeName = (name, contentType) => {
  const base = String(name || '').replace(/[^A-Za-z0-9._ -]+/g, '_').replace(/^[._]+/, '').slice(0, 120);
  if (base && /\.[A-Za-z0-9]{2,5}$/.test(base)) return base;
  const ext = EXT[String(contentType || '').split(';')[0].toLowerCase()] || 'bin';
  return `${base || 'attachment'}.${ext}`;
};

/** A member's file from WhatsApp: downloaded once, size- and type-checked, virus-scanned. */
async function fetchMemberFile(attachment) {
  const url = new URL(attachment.url);
  if (url.protocol !== 'https:') throw Object.assign(new Error('bad url'), { publicMessage: 'The attachment link was not secure, so it was not fetched.' });
  let response;
  try {
    response = await axios.request({
      method: 'GET', url: url.href, responseType: 'arraybuffer', timeout: 30000, maxRedirects: 3,
      maxContentLength: MAX_FILE_BYTES, maxBodyLength: MAX_FILE_BYTES,
      headers: url.hostname.endsWith('.gupshup.io') && process.env.GUPSHUP_API_KEY ? { apikey: process.env.GUPSHUP_API_KEY } : {},
    });
  } catch (cause) {
    const tooBig = /maxContentLength/i.test(String(cause?.message));
    throw Object.assign(new Error('fetch failed'), { publicMessage: tooBig ? 'The member sent a file over 16 MB; ask them to send a smaller one.' : 'The attachment could not be retrieved from WhatsApp; ask the member to send it again.' });
  }
  const buffer = Buffer.from(response.data);
  const contentType = String(response.headers?.['content-type'] || attachment.contentType || '').toLowerCase();
  if (!FILE_TYPES.test(contentType)) throw Object.assign(new Error('type'), { publicMessage: `The member sent a file type that is not passed on (${contentType.split(';')[0] || 'unknown'}).` });
  const scan = await scanOnly(buffer);
  if (!scan.clean) throw Object.assign(new Error('infected'), { publicMessage: 'A file from the member was blocked by the virus scan and not passed on.' });
  return { buffer, contentType: contentType.split(';')[0], filename: safeName(attachment.name, contentType) };
}
const GUPSHUP_TYPE = { image: 'image', audio: 'audio', video: 'video' };

/**
 * Chatwoot's attachment link redirects (302) to the stored file. WhatsApp fetches the link we give
 * it and may not follow redirects, so hand it the file's own (signed, short-lived) address. Stays on
 * the Chatwoot origin; falls back to the original link if Chatwoot does not redirect.
 */
async function directFileUrl(link, origin) {
  try {
    const r = await axios.request({ method: 'HEAD', url: link, maxRedirects: 0, timeout: 10000, validateStatus: (st) => st >= 200 && st < 400 });
    const location = r.headers?.location;
    if (r.status >= 300 && location) {
      const target = new URL(location, link);
      if (target.protocol === 'https:' && target.origin === origin) return target.href;
    }
  } catch { /* use the original link */ }
  return link;
}

// WhatsApp lets a business reply freely only within 24 hours of the customer's last message.
// Outside it a template is required, and none is approved for agent replies.
export const WHATSAPP_REPLY_WINDOW_HOURS = 24;
const notSent = (publicMessage) => Object.assign(new Error(publicMessage), { definitelyNotSent: true, publicMessage });

function credential(prefix, suffix) {
  if (!/^[A-Z][A-Z0-9_]{0,99}$/.test(prefix || '')) throw new Error('Invalid channel credential reference');
  const value = process.env[`${prefix}_${suffix}`];
  if (!value) throw new Error('Tenant channel credentials are unavailable');
  return value;
}

export async function dispatch({ inbox, to, content, bridgeConversationId, attachments = [] }) {
  let deliver;
  if (inbox.provider === 'gupshup' && inbox.channel === 'whatsapp') {
    const { rows: [last] } = await pool.query(
      `SELECT max(created_at) AS at FROM crm_chatwoot_jobs WHERE bridge_conversation_id = $1 AND direction = 'inbound'`,
      [bridgeConversationId]);
    if (!last?.at || Date.now() - new Date(last.at).getTime() > WHATSAPP_REPLY_WINDOW_HOURS * 3600 * 1000) {
      throw notSent('WhatsApp only allows a reply within 24 hours of the member\'s last message. Ask them to message 8098998998 again, or call them.');
    }
    const files = (attachments || []).slice(0, 5);
    const chatwootOrigin = new URL(process.env.CHATWOOT_URL || 'https://chat.mediqzy.com').origin;
    for (const f of files) {
      let ok = false;
      try { const u = new URL(f.data_url); ok = u.protocol === 'https:' && u.origin === chatwootOrigin; } catch { /* invalid */ }
      if (!ok) throw notSent('The attachment link was not a Chatwoot file link, so nothing was sent.');
      if (Number(f.file_size) > MAX_FILE_BYTES) throw notSent('Attachments must be 16 MB or smaller for WhatsApp.');
    }
    const destination = normalizeChannelAddress('whatsapp', to);
    let sentCount = 0;
    try {
      let last;
      // Agent files go out as WhatsApp images/documents; the text rides as the first caption
      // (audio cannot carry one, so the text is sent on its own).
      const textAsCaption = files.length && files[0].file_type !== 'audio';
      if (String(content || '').trim() && !textAsCaption) { last = await gupshup.sendText({ to: destination, body: content }); sentCount += 1; }
      for (const [i, f] of files.entries()) {
        const fileUrl = new URL(f.data_url);
        last = await gupshup.sendMedia({
          to: destination, mediaUrl: await directFileUrl(f.data_url, chatwootOrigin), mediaType: GUPSHUP_TYPE[f.file_type] || 'file',
          caption: i === 0 && textAsCaption ? String(content || '').slice(0, 1024) : '',
          filename: decodeURIComponent(fileUrl.pathname.split('/').pop() || '') || `attachment.${f.extension || 'pdf'}`,
        });
        sentCount += 1;
      }
      if (!files.length) last = await gupshup.sendText({ to: destination, body: content });
      return { id: last?.messageId || last?.id || null };
    } catch (cause) {
      if (sentCount > 0) throw Object.assign(new Error('Tenant channel delivery failed'), { definitelyNotSent: false, publicMessage: 'Only part of this message reached WhatsApp; check with the member before resending.' });
      // Gupshup refused the submit (bad number, account issue): nothing was sent. A timeout is ambiguous.
      if (cause?.definitelyNotSent) throw notSent('WhatsApp did not accept this message. Check the member\'s number.');
      throw Object.assign(new Error('Tenant channel delivery failed'), { definitelyNotSent: false });
    }
  }
  try {
    if (inbox.provider === 'twilio' && ['whatsapp', 'sms'].includes(inbox.channel)) {
      const client = twilio(credential(inbox.credentials_prefix, 'ACCOUNT_SID'), credential(inbox.credentials_prefix, 'AUTH_TOKEN'),
        { timeout: 12000, autoRetry: false });
      const prefix = inbox.channel === 'whatsapp' ? 'whatsapp:' : '';
      deliver = async () => ({ id: (await client.messages.create({
        from: `${prefix}${inbox.channel_address}`, to: `${prefix}${normalizeChannelAddress(inbox.channel, to)}`, body: content,
      })).sid });
    } else if (inbox.provider === 'smtp' && inbox.channel === 'email') {
      const port = Number(credential(inbox.credentials_prefix, 'PORT'));
      if (![465, 587].includes(port)) throw new Error('Use a TLS SMTP port');
      const transport = nodemailer.createTransport({
        host: credential(inbox.credentials_prefix, 'HOST'), port, secure: port === 465, requireTLS: true,
        auth: { user: credential(inbox.credentials_prefix, 'USER'), pass: credential(inbox.credentials_prefix, 'PASSWORD') },
        connectionTimeout: 12000, socketTimeout: 12000,
      });
      deliver = async () => ({ id: (await transport.sendMail({ from: inbox.channel_address,
        to: normalizeChannelAddress('email', to), subject: 'Customer support', text: content })).messageId });
    } else {
      throw new Error('No Mediczy delivery adapter is configured for this channel');
    }
  } catch {
    throw Object.assign(new Error('Tenant channel configuration is unavailable'), { definitelyNotSent: true });
  }
  try { return await deliver(); }
  catch (cause) {
    // A Twilio 4xx rejection confirms no message was accepted. Timeouts are ambiguous.
    const definitelyNotSent = inbox.provider === 'twilio' && Number(cause.status) >= 400 && Number(cause.status) < 500;
    throw Object.assign(new Error('Tenant channel delivery failed'), { definitelyNotSent });
  }
}

// For the Gupshup WhatsApp desk: an agent's reply in Chatwoot hands the chat to the Team (the
// assistant goes quiet); resolving the conversation hands it back to the assistant.
const deskHooks = {
  onAgentReply: async (mapping) => {
    if (mapping.channel !== 'whatsapp') return;
    await setHandoffState(mapping.customer_id, { reason: 'agent_replied', source: 'chatwoot' });
  },
  onResolved: async (mapping) => {
    if (mapping.channel !== 'whatsapp') return;
    await clearHandoffState(mapping.customer_id);
  },
};

export const chatwootBridge = new ChatwootService({ db: pool, http: axios, dispatch, hooks: deskHooks, media: { fetch: fetchMemberFile } });

/**
 * The WhatsApp number's Chatwoot desk (Gupshup). Every call is a no-op when the desk is not set up
 * or switched off, and never throws: WhatsApp handling must not depend on Chatwoot.
 */
async function deskInbox() {
  const number = process.env.GUPSHUP_SOURCE_NUMBER;
  if (!chatwootBridge.enabled || !number) return null;
  const inbox = await chatwootBridge.findInbox('whatsapp', `+${String(number).replace(/\D/g, '')}`);
  return inbox?.provider === 'gupshup' ? inbox : null;
}
const quietly = (label, fn) => fn().catch((e) => { console.warn(`[Chatwoot desk] ${label} not mirrored: ${e.message}`); return null; });
let botSeq = 0;
const botId = (prefix) => `${prefix}-${Date.now()}-${process.pid}-${(botSeq += 1)}`;

export const whatsappDesk = {
  /** The member's message. withPerson: a hand-off is active, so the conversation opens for an agent. */
  inbound: ({ from, name, body, messageId, attachment = null, withPerson = false }) => quietly('inbound', async () => {
    const inbox = await deskInbox();
    if (!inbox || !messageId) return null;
    const content = String(body || '').trim() || (attachment ? '' : '[Empty message]');
    return chatwootBridge.enqueueInbound({ inbox, customerId: from, name, content, externalId: messageId,
      status: withPerson ? 'open' : 'pending', attachments: attachment?.url ? [attachment] : [] });
  }),
  /** The assistant's reply, already delivered on WhatsApp: shown in Chatwoot only. */
  botReply: ({ to, name, text }) => quietly('assistant reply', async () => {
    const inbox = await deskInbox();
    if (!inbox || !String(text || '').trim()) return null;
    return chatwootBridge.enqueueInbound({ inbox, customerId: to, name, content: `🤖 ${text}`, externalId: botId('bot'), direction: 'bot' });
  }),
  /** Hand the chat to the Team: opens the conversation in Chatwoot with a private note saying why. */
  handoff: ({ to, name, reason }) => quietly('hand-off', async () => {
    const inbox = await deskInbox();
    if (!inbox) return null;
    return chatwootBridge.enqueueInbound({ inbox, customerId: to, name, content: `Needs a person: ${reason}`, externalId: botId('handoff'), direction: 'bot', status: 'open', isPrivate: true });
  }),
  enabled: async () => Boolean(await deskInbox().catch(() => null)),
};

export async function handleChatwootTwilioInbound(req) {
  if (!chatwootBridge.enabled) return { handled: false };
  const channel = String(req.body.To || '').startsWith('whatsapp:') ? 'whatsapp' : 'sms';
  if (!req.body.To) throw Object.assign(new Error('Twilio recipient is required'), { statusCode: 400 });
  const inbox = await chatwootBridge.findInbox(channel, req.body.To);
  if (!inbox) return { handled: false };
  const authToken = credential(inbox.credentials_prefix, 'AUTH_TOKEN');
  if (!inbox.inbound_webhook_url || req.body.AccountSid !== credential(inbox.credentials_prefix, 'ACCOUNT_SID') ||
      !twilio.validateRequest(authToken, req.get('x-twilio-signature') || '', inbox.inbound_webhook_url, req.body)) {
    throw Object.assign(new Error('Invalid tenant Twilio webhook signature'), { statusCode: 403 });
  }
  // Media remains available in the provider; do not forward protected provider URLs as public attachments.
  const mediaCount = Number(req.body.NumMedia || 0);
  const content = [req.body.Body, mediaCount > 0 ? `[${mediaCount} media attachment(s); media transfer is not configured]` : null].filter(Boolean).join('\n');
  const result = await chatwootBridge.enqueueInbound({ inbox, customerId: req.body.From, name: req.body.ProfileName,
    content, externalId: req.body.MessageSid });
  return { handled: true, ...result };
}

export function startChatwootWorker() {
  if (!chatwootBridge.enabled) return null;
  let running = false;
  let lastWarning = 0;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      for (let n = 0; n < 5 && await chatwootBridge.processNext(); n++) { /* drain a bounded batch */ }
    } catch {
      if (Date.now() - lastWarning > 60000) {
        console.warn('[Chatwoot] Bridge worker unavailable; check migration and integration configuration');
        lastWarning = Date.now();
      }
    } finally { running = false; }
  };
  const timer = setInterval(tick, 2000);
  timer.unref();
  return timer;
}
