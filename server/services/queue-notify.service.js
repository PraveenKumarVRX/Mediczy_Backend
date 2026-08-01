/**
 * Proactive queue notifications — WhatsApp + SMS (both channels).
 * Used for kiosk check-in, online in-person booking tokens, and call-next.
 */

import pool from '../db/pgPool.js';
import whatsappProductionService from './whatsapp-production.service.js';
import { SMSService } from './sms.service.js';
import { toSmsPlainText, tokenSlipText } from '../utils/queue-message-text.js';

export { toSmsPlainText, tokenSlipText };

const NOTIFY_AHEAD = parseInt(process.env.QUEUE_NOTIFY_POSITION || '3', 10);
const ENABLE_WHATSAPP = String(process.env.QUEUE_NOTIFY_WHATSAPP ?? 'true').toLowerCase() !== 'false';
const ENABLE_SMS = String(process.env.QUEUE_NOTIFY_SMS ?? 'true').toLowerCase() !== 'false';

const smsConfig = {
  provider: process.env.SMS_PROVIDER || 'twilio',
  apiKey: process.env.SMS_API_KEY || process.env.TWILIO_ACCOUNT_SID,
  apiSecret: process.env.SMS_API_SECRET || process.env.TWILIO_AUTH_TOKEN,
  senderId: process.env.SMS_SENDER_ID || process.env.TWILIO_PHONE_NUMBER || 'MEDICZY',
};

let smsService = null;
if (smsConfig.apiKey && smsConfig.apiSecret) {
  smsService = new SMSService(smsConfig);
} else {
  console.warn('[queue-notify] SMS not configured — set SMS_PROVIDER credentials or TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN + TWILIO_PHONE_NUMBER');
}

function normalizePhone(phone) {
  if (!phone) return null;
  const d = String(phone).replace(/\D/g, '');
  if (d.length === 10) return `+91${d}`;
  if (d.startsWith('91') && d.length === 12) return `+${d}`;
  return d.length >= 10 ? `+${d}` : null;
}

/**
 * Send on WhatsApp and SMS in parallel (not fallback-only).
 * @returns {{ ok: boolean, whatsapp: boolean, sms: boolean, channels: string[], errors: string[], whatsappSid?: string }}
 */
export async function sendToPhone(phone, message) {
  const to = normalizePhone(phone);
  const result = {
    ok: false,
    whatsapp: false,
    sms: false,
    channels: [],
    errors: [],
    whatsappSid: undefined,
  };
  if (!to || !message) {
    result.errors.push('Missing phone or message');
    return result;
  }

  const tasks = [];

  if (ENABLE_WHATSAPP && whatsappProductionService?.sendSessionMessage) {
    tasks.push(
      whatsappProductionService
        .sendSessionMessage({ to, body: message })
        .then((msg) => {
          result.whatsapp = true;
          result.channels.push('whatsapp');
          result.whatsappSid = msg?.sid;
          // Twilio may accept create() then undeliver outside the 24h session window
          if (msg?.status && /undelivered|failed/i.test(String(msg.status))) {
            result.whatsapp = false;
            result.channels = result.channels.filter((c) => c !== 'whatsapp');
            result.errors.push(`WhatsApp status ${msg.status}`);
          }
        })
        .catch((e) => {
          const code = e?.code ? ` code=${e.code}` : '';
          const detail = `${e.message || 'WhatsApp send failed'}${code}`;
          console.warn('[queue-notify] WhatsApp failed:', detail);
          result.errors.push(`WhatsApp: ${detail}`);
        }),
    );
  } else if (ENABLE_WHATSAPP) {
    result.errors.push('WhatsApp service unavailable');
  }

  if (ENABLE_SMS && smsService) {
    const smsBody = toSmsPlainText(message);
    tasks.push(
      smsService
        .sendSMS({ to, message: smsBody })
        .then((res) => {
          if (res?.success === false) {
            throw new Error(res.error || 'SMS provider returned failure');
          }
          result.sms = true;
          result.channels.push('sms');
        })
        .catch((e) => {
          console.warn('[queue-notify] SMS failed:', e.message);
          result.errors.push(`SMS: ${e.message}`);
        }),
    );
  } else if (ENABLE_SMS && !smsService) {
    console.warn('[queue-notify] SMS enabled but service not configured');
    result.errors.push('SMS not configured (TWILIO_ACCOUNT_SID/AUTH_TOKEN/PHONE_NUMBER)');
  }

  if (tasks.length) await Promise.allSettled(tasks);
  result.ok = result.whatsapp || result.sms;
  return result;
}

/**
 * Kiosk registration invite — WhatsApp via approved Content template + SMS plain text.
 * Do NOT use free-form session WhatsApp for cold outbound (Twilio 24h window).
 */
export async function sendKioskRegistrationNotify(
  phone,
  { hospitalName, expiresMin, registerUrl, token } = {}
) {
  const to = normalizePhone(phone);
  const result = {
    ok: false,
    whatsapp: false,
    sms: false,
    channels: [],
    errors: [],
    whatsappSid: undefined,
    usedTemplate: false,
  };
  if (!to || !registerUrl) {
    result.errors.push('Missing phone or registerUrl');
    return result;
  }

  const smsMessage =
    `Mediqzy · Complete your registration for ${hospitalName || 'the hospital'}\n\n` +
    `Tap this secure link (expires in ${expiresMin || 30} min):\n${registerUrl}\n\n` +
    `Do not share this link. Reply STOP to opt out.`;

  const tasks = [];

  if (ENABLE_WHATSAPP && whatsappProductionService?.sendKioskRegistrationInvite) {
    tasks.push(
      whatsappProductionService
        .sendKioskRegistrationInvite({
          to,
          hospitalName,
          expiresMin,
          registerUrl,
          token,
        })
        .then((msg) => {
          result.whatsapp = true;
          result.usedTemplate = true;
          result.channels.push('whatsapp');
          result.whatsappSid = msg?.sid;
        })
        .catch((e) => {
          const detail = `${e.message || 'WhatsApp template send failed'}${e?.code ? ` code=${e.code}` : ''}`;
          console.warn('[queue-notify] kiosk WhatsApp template failed:', detail);
          result.errors.push(`WhatsApp: ${detail}`);
        }),
    );
  } else if (ENABLE_WHATSAPP) {
    result.errors.push('WhatsApp kiosk template sender unavailable');
  }

  if (ENABLE_SMS && smsService) {
    tasks.push(
      smsService
        .sendSMS({ to, message: toSmsPlainText(smsMessage) })
        .then((res) => {
          if (res?.success === false) {
            throw new Error(res.error || 'SMS provider returned failure');
          }
          result.sms = true;
          result.channels.push('sms');
        })
        .catch((e) => {
          console.warn('[queue-notify] kiosk SMS failed:', e.message);
          result.errors.push(`SMS: ${e.message}`);
        }),
    );
  } else if (ENABLE_SMS && !smsService) {
    result.errors.push('SMS not configured (TWILIO_ACCOUNT_SID/AUTH_TOKEN/PHONE_NUMBER)');
  }

  if (tasks.length) await Promise.allSettled(tasks);
  result.ok = result.whatsapp || result.sms;
  return result;
}

async function logNotification(entryId, type, channels, ok) {
  try {
    await pool.query(
      `UPDATE hospital_queue_entries
       SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
       WHERE id = $1`,
      [
        entryId,
        JSON.stringify({
          lastNotification: {
            type,
            channel: ok ? (channels.join('+') || 'none') : 'failed',
            channels,
            whatsapp: channels.includes('whatsapp'),
            sms: channels.includes('sms'),
            at: new Date().toISOString(),
          },
        }),
      ],
    );
  } catch (_) {}
}

export async function notifyQueueCheckIn(entry, phone) {
  if (!phone) return false;
  if (entry && entry.notifyOptIn === false) return false;
  const msg = tokenSlipText(entry || {});
  const result = await sendToPhone(phone, msg);
  if (entry?.id) await logNotification(entry.id, 'check_in', result.channels, result.ok);
  return result.ok;
}

export async function notifyTokenCalled(entry, phone) {
  if (!phone) return false;
  const msg = [
    'MediQzy: Your turn',
    `Token *${entry.tokenNumber}* is being called now.`,
    entry.doctorName ? `Please proceed to ${entry.doctorName}.` : null,
    entry.counterId ? `Counter / Room: ${entry.counterId}` : 'Please proceed to the consultation room.',
  ].filter(Boolean).join('\n');
  const result = await sendToPhone(phone, msg);
  if (entry?.id) await logNotification(entry.id, 'called', result.channels, result.ok);
  return result.ok;
}

export async function notifyAlmostReady(entry, phone, positionAhead) {
  if (!phone || positionAhead > NOTIFY_AHEAD) return false;
  const meta = entry.metadata || {};
  if (meta.notifiedAlmostReady) return false;
  const msg = `MediQzy: ${positionAhead} patient(s) ahead of token *${entry.tokenNumber}*. Please stay near the waiting area${entry.doctorName ? ` for ${entry.doctorName}` : ''}.`;
  const result = await sendToPhone(phone, msg);
  if (result.ok && entry?.id) {
    await pool.query(
      `UPDATE hospital_queue_entries SET metadata = metadata || $2::jsonb WHERE id = $1`,
      [
        entry.id,
        JSON.stringify({
          notifiedAlmostReady: true,
          lastNotification: {
            type: 'almost_ready',
            channel: result.channels.join('+'),
            channels: result.channels,
            at: new Date().toISOString(),
          },
        }),
      ],
    );
  }
  return result.ok;
}

export async function refreshPositionNotifications(organizationId, queueZone) {
  const { rows } = await pool.query(
    `SELECT id, token_number, counter_id, doctor_name, metadata, patient_id
     FROM hospital_queue_entries
     WHERE organization_id = $1 AND queue_zone = $2 AND status = 'waiting'
       AND check_in_at::date = CURRENT_DATE
     ORDER BY priority_score DESC, check_in_at ASC`,
    [organizationId, queueZone],
  );
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const phone = row.metadata?.notifyPhone;
    if (!phone) continue;
    await notifyAlmostReady(
      {
        id: row.id,
        tokenNumber: row.token_number,
        counterId: row.counter_id,
        doctorName: row.doctor_name,
        metadata: row.metadata,
      },
      phone,
      i,
    );
  }
}

export default {
  notifyQueueCheckIn,
  notifyTokenCalled,
  notifyAlmostReady,
  refreshPositionNotifications,
  sendToPhone,
  sendKioskRegistrationNotify,
  toSmsPlainText,
};
