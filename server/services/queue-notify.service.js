/**
 * Proactive queue notifications — SMS / WhatsApp (GAP-QUEUE-006)
 */

import pool from '../db/pgPool.js';
import whatsappProductionService from './whatsapp-production.service.js';
import { SMSService } from './sms.service.js';

const sms = new SMSService();
const NOTIFY_AHEAD = parseInt(process.env.QUEUE_NOTIFY_POSITION || '3', 10);

function normalizePhone(phone) {
  if (!phone) return null;
  const d = String(phone).replace(/\D/g, '');
  if (d.length === 10) return `+91${d}`;
  if (d.startsWith('91') && d.length === 12) return `+${d}`;
  return d.length >= 10 ? `+${d}` : null;
}

async function sendToPhone(phone, message) {
  const to = normalizePhone(phone);
  if (!to) return false;
  try {
    if (whatsappProductionService?.sendSessionMessage) {
      await whatsappProductionService.sendSessionMessage({ to, body: message });
      return true;
    }
  } catch (e) {
    console.warn('[queue-notify] WhatsApp failed:', e.message);
  }
  try {
    await sms.sendSMS({ to, body: message });
    return true;
  } catch (e) {
    console.warn('[queue-notify] SMS failed:', e.message);
    return false;
  }
}

async function logNotification(entryId, type, channel, ok) {
  try {
    await pool.query(
      `UPDATE hospital_queue_entries
       SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
       WHERE id = $1`,
      [
        entryId,
        JSON.stringify({
          lastNotification: { type, channel: ok ? channel : 'failed', at: new Date().toISOString() },
        }),
      ]
    );
  } catch (_) {}
}

export async function notifyQueueCheckIn(entry, phone) {
  if (!phone || !entry?.notifyOptIn) return;
  const msg = `MediQzy Hospital\nYour token: *${entry.tokenNumber}*\nEst. wait: ~${entry.estimatedWaitMinutes || 15} min\nPlease wait in the OPD lounge.`;
  const ok = await sendToPhone(phone, msg);
  await logNotification(entry.id, 'check_in', ok ? 'whatsapp/sms' : 'none', ok);
}

export async function notifyTokenCalled(entry, phone) {
  if (!phone) return;
  const msg = `MediQzy: Token *${entry.tokenNumber}* is being called now. Please proceed to ${entry.counterId || 'your counter'}.`;
  const ok = await sendToPhone(phone, msg);
  await logNotification(entry.id, 'called', ok ? 'whatsapp/sms' : 'none', ok);
}

export async function notifyAlmostReady(entry, phone, positionAhead) {
  if (!phone || positionAhead > NOTIFY_AHEAD) return;
  const meta = entry.metadata || {};
  if (meta.notifiedAlmostReady) return;
  const msg = `MediQzy: ${positionAhead} patient(s) ahead of token *${entry.tokenNumber}*. Please stay near the waiting area.`;
  const ok = await sendToPhone(phone, msg);
  if (ok) {
    await pool.query(
      `UPDATE hospital_queue_entries SET metadata = metadata || '{"notifiedAlmostReady":true}'::jsonb WHERE id = $1`,
      [entry.id]
    );
  }
}

export async function refreshPositionNotifications(organizationId, queueZone) {
  const { rows } = await pool.query(
    `SELECT id, token_number, counter_id, metadata, patient_id
     FROM hospital_queue_entries
     WHERE organization_id = $1 AND queue_zone = $2 AND status = 'waiting'
       AND check_in_at::date = CURRENT_DATE
     ORDER BY priority_score DESC, check_in_at ASC`,
    [organizationId, queueZone]
  );
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const phone = row.metadata?.notifyPhone;
    if (!phone) continue;
    await notifyAlmostReady(
      { id: row.id, tokenNumber: row.token_number, counterId: row.counter_id, metadata: row.metadata },
      phone,
      i
    );
  }
}

export default { notifyQueueCheckIn, notifyTokenCalled, notifyAlmostReady, refreshPositionNotifications };
