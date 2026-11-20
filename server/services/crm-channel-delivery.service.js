/** Real delivery using each tenant's own stored channel credentials
 * (crm_marketing_integrations — configured via Communication Hub > Integrations).
 * Every function returns { configured: false } when nothing is saved for that
 * channel/provider, so callers can fall back to whatever they did before this
 * existed, rather than this file deciding that policy for them. */
import crypto from 'node:crypto';
import nodemailer from '../integrations/nodemailer.js';
import axios from '../integrations/axios.js';
import twilio from '../integrations/twilio.js';
import sharedPool from '../db/pgPool.js';
import { SMSService } from './sms.service.js';
import { GupshupWhatsAppService } from './gupshup-whatsapp.service.js';

function decryptCredentials(value) {
  const raw = process.env.CRM_CREDENTIAL_ENCRYPTION_KEY;
  if (!/^[0-9a-f]{64}$/i.test(raw || '')) return {};
  const [iv, tag, bytes] = String(value).split(':');
  try {
    const cipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(raw, 'hex'), Buffer.from(iv, 'hex'));
    cipher.setAuthTag(Buffer.from(tag, 'hex'));
    return JSON.parse(Buffer.concat([cipher.update(Buffer.from(bytes, 'hex')), cipher.final()]).toString('utf8'));
  } catch { return {}; }
}

async function getChannelConfig(tenantId, channel) {
  const { rows } = await sharedPool.query(
    `SELECT config, encrypted_credentials FROM crm_marketing_integrations
     WHERE tenant_id = $1 AND provider = $2 AND integration_type = 'communication' AND status = 'configured' LIMIT 1`,
    [tenantId, channel]
  );
  const row = rows[0];
  if (!row) return null;
  const config = typeof row.config === 'string' ? JSON.parse(row.config) : (row.config || {});
  const credentials = row.encrypted_credentials ? decryptCredentials(row.encrypted_credentials) : {};
  return { config, credentials };
}

export async function sendTenantEmail(tenantId, { to, subject, html, text }) {
  const bundle = await getChannelConfig(tenantId, 'email');
  if (!bundle || bundle.config.provider !== 'smtp') return { configured: false };
  const { config, credentials } = bundle;
  if (!config.smtpHost || !config.smtpPort || !config.username || !credentials.password) return { configured: false };
  const transport = nodemailer.createTransport({
    host: config.smtpHost, port: Number(config.smtpPort), secure: Number(config.smtpPort) === 465,
    auth: { user: config.username, pass: credentials.password },
  });
  const from = config.fromName ? `"${config.fromName}" <${config.fromEmail || config.username}>` : (config.fromEmail || config.username);
  try {
    const info = await transport.sendMail({ from, to, subject, html, text });
    return { configured: true, success: true, provider: 'tenant-smtp', providerMessageId: info.messageId };
  } catch (error) {
    return { configured: true, success: false, provider: 'tenant-smtp', error: error.message };
  }
}

export async function sendTenantSms(tenantId, { to, message }) {
  const bundle = await getChannelConfig(tenantId, 'sms');
  if (!bundle) return { configured: false };
  const { config, credentials } = bundle;
  if (config.provider === 'custom') {
    return { configured: true, success: false, provider: 'custom', error: 'Custom SMS provider delivery is not implemented yet' };
  }
  if (!['twilio', 'msg91', 'textlocal'].includes(config.provider)) return { configured: false };
  const svc = new SMSService({
    provider: config.provider,
    apiKey: config.provider === 'twilio' ? config.accountSid : credentials.apiKey,
    apiSecret: config.provider === 'twilio' ? credentials.authToken : undefined,
    senderId: config.senderId,
    smsFrom: config.fromNumber,
  });
  const result = await svc.sendSMS({ to, message });
  return { configured: true, success: Boolean(result.success), provider: result.provider || config.provider, providerMessageId: result.messageId, error: result.error };
}

export async function sendTenantWhatsApp(tenantId, { to, body }) {
  const bundle = await getChannelConfig(tenantId, 'whatsapp');
  if (!bundle) return { configured: false };
  const { config, credentials } = bundle;
  try {
    if (config.provider === 'twilio') {
      const client = twilio(config.accountSid, credentials.authToken, { timeout: 15000, autoRetry: false });
      const to164 = to.startsWith('+') ? to : `+${to}`;
      const msg = await client.messages.create({ from: `whatsapp:${config.fromNumber}`, to: `whatsapp:${to164}`, body });
      return { configured: true, success: true, provider: 'twilio', providerMessageId: msg.sid };
    }
    if (config.provider === 'gupshup') {
      const svc = new GupshupWhatsAppService({ config: { apiKey: credentials.apiKey, appName: config.appName, sourceNumber: config.senderNumber } });
      const result = await svc.sendText({ to, body });
      return { configured: true, success: true, provider: 'gupshup', providerMessageId: result.messageId };
    }
    if (config.provider === 'meta') {
      const response = await axios.post(
        `https://graph.facebook.com/v18.0/${config.phoneNumberId}/messages`,
        { messaging_product: 'whatsapp', to, type: 'text', text: { body } },
        { headers: { Authorization: `Bearer ${credentials.accessToken}`, 'Content-Type': 'application/json' }, timeout: 15000 }
      );
      return { configured: true, success: true, provider: 'meta', providerMessageId: response.data?.messages?.[0]?.id };
    }
    return { configured: false };
  } catch (error) {
    return { configured: true, success: false, provider: config.provider, error: error?.response?.data?.error?.message || error?.message || 'WhatsApp send failed' };
  }
}
