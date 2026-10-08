import axios from 'axios';
import twilio from 'twilio';
import nodemailer from 'nodemailer';
import pool from '../db/pgPool.js';
import { ChatwootService, normalizeChannelAddress } from './chatwoot.service.js';

function credential(prefix, suffix) {
  if (!/^[A-Z][A-Z0-9_]{0,99}$/.test(prefix || '')) throw new Error('Invalid channel credential reference');
  const value = process.env[`${prefix}_${suffix}`];
  if (!value) throw new Error('Tenant channel credentials are unavailable');
  return value;
}

async function dispatch({ inbox, to, content }) {
  let deliver;
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

export const chatwootBridge = new ChatwootService({ db: pool, http: axios, dispatch });

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
