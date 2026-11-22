import axios from '../integrations/axios.js';
import twilio from '../integrations/twilio.js';
import nodemailer from '../integrations/nodemailer.js';
import pool from '../db/pgPool.js';
import { ChatwootService, normalizeChannelAddress } from './chatwoot.service.js';
import gupshup from './gupshup-whatsapp.service.js';
import { setHandoffState, clearHandoffState } from './whatsapp-handoff.service.js';

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

export async function dispatch({ inbox, to, content, bridgeConversationId }) {
  let deliver;
  if (inbox.provider === 'gupshup' && inbox.channel === 'whatsapp') {
    const { rows: [last] } = await pool.query(
      `SELECT max(created_at) AS at FROM crm_chatwoot_jobs WHERE bridge_conversation_id = $1 AND direction = 'inbound'`,
      [bridgeConversationId]);
    if (!last?.at || Date.now() - new Date(last.at).getTime() > WHATSAPP_REPLY_WINDOW_HOURS * 3600 * 1000) {
      throw notSent('WhatsApp only allows a reply within 24 hours of the member\'s last message. Ask them to message 8098998998 again, or call them.');
    }
    try {
      const sent = await gupshup.sendText({ to: normalizeChannelAddress('whatsapp', to), body: content });
      return { id: sent?.messageId || sent?.id || null };
    } catch (cause) {
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

export const chatwootBridge = new ChatwootService({ db: pool, http: axios, dispatch, hooks: deskHooks });

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
  inbound: ({ from, name, body, messageId, mediaUrl, withPerson = false }) => quietly('inbound', async () => {
    const inbox = await deskInbox();
    if (!inbox || !messageId) return null;
    const content = [body, mediaUrl ? '[The member sent an attachment. Ask them to describe it, or view it in Gupshup.]' : null].filter(Boolean).join('\n') || '[Empty message]';
    return chatwootBridge.enqueueInbound({ inbox, customerId: from, name, content, externalId: messageId, status: withPerson ? 'open' : 'pending' });
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
