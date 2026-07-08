/**
 * Insurance claim patient communications — WhatsApp/SMS/QR
 * =========================================================
 * ClaimBook-parity feature: "Real-Time Status Communication — shares
 * updates via SMS, WhatsApp, QR codes, and display monitors."
 *
 * notifyClaimStatusChange() sends a WhatsApp message (falling back to SMS
 * if WhatsApp fails/isn't configured) whenever a claim reaches one of the
 * patient-meaningful statuses, and logs the attempt to
 * insurance_claims.notification_log.
 *
 * generateStatusQrCode() issues a signed, long-lived token embedding just
 * the claim id/number (no PHI) and returns a QR code pointing at the
 * public, unauthenticated status-lookup page.
 */
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import pool from '../db/pgPool.js';
import { withRlsTransaction } from '../middleware/rls-context.middleware.js';
import InsuranceClaim from '../models/postgres/insuranceClaim.model.postgres.js';
import { User } from '../models/index.js';
import whatsappProductionService from './whatsapp-production.service.js';
import { SMSService } from './sms.service.js';

const sms = new SMSService({
  provider: process.env.SMS_PROVIDER || 'twilio',
  apiKey: process.env.SMS_API_KEY || process.env.TWILIO_ACCOUNT_SID,
  apiSecret: process.env.SMS_API_SECRET || process.env.TWILIO_AUTH_TOKEN,
  senderId: process.env.SMS_SENDER_ID || process.env.TWILIO_PHONE_NUMBER || 'MEDICZY',
});

function normalizePhone(phone) {
  if (!phone) return null;
  const d = String(phone).replace(/\D/g, '');
  if (d.length === 10) return `+91${d}`;
  if (d.startsWith('91') && d.length === 12) return `+${d}`;
  return d.length >= 10 ? `+${d}` : null;
}

const STATUS_MESSAGES = {
  submitted: (c) => `Mediqzy: Your insurance claim ${c.claimNumber} has been submitted to ${c.insuranceProvider || 'your insurer'}. We'll update you as it progresses.`,
  query: (c) => `Mediqzy: Your insurer has raised a query on claim ${c.claimNumber}. Our insurance desk is responding on your behalf — no action needed from you right now.`,
  approved: (c) => `Mediqzy: Good news — claim ${c.claimNumber} has been approved${c.approvedAmount ? ` for Rs.${c.approvedAmount}` : ''}.`,
  rejected: (c) => `Mediqzy: Claim ${c.claimNumber} was not approved by your insurer. Our insurance desk will contact you shortly about next steps.`,
  paid: (c) => `Mediqzy: Claim ${c.claimNumber} has been settled. Amount paid: Rs.${c.settledAmount || 0}.`,
};

async function sendToPhone(phone, message) {
  try {
    await whatsappProductionService.sendSessionMessage({ to: phone, body: message });
    return 'whatsapp';
  } catch (e) {
    console.warn('[insurance-claim-notify] WhatsApp failed, falling back to SMS:', e.message);
  }
  try {
    await sms.sendSMS({ to: phone, message });
    return 'sms';
  } catch (e) {
    console.warn('[insurance-claim-notify] SMS failed:', e.message);
    return null;
  }
}

async function appendNotificationLog(claimId, hospitalId, entry) {
  await withRlsTransaction(pool, { orgId: hospitalId, userId: 0, isPlatformAdmin: false }, async (client) => {
    await client.query(
      `UPDATE insurance_claims
       SET notification_log = COALESCE(notification_log, '[]'::jsonb) || $2::jsonb
       WHERE id = $1`,
      [claimId, JSON.stringify([entry])]
    );
  });
}

/**
 * @param {number} claimId
 * @param {number} hospitalId
 * @param {'submitted'|'query'|'approved'|'rejected'|'paid'} status
 * @param {string} [actor] - who/what triggered this ('system' | staff name)
 */
export async function notifyClaimStatusChange({ claimId, hospitalId, status, actor = 'system' }) {
  const buildMessage = STATUS_MESSAGES[status];
  if (!buildMessage) return { success: false, error: `No message template for status "${status}"` };

  try {
    const claim = await InsuranceClaim.findByPk(claimId, {
      include: [{ model: User, as: 'patient', attributes: ['id', 'phoneNumber', 'firstName', 'lastName'] }],
    });
    if (!claim) return { success: false, error: 'Claim not found' };

    const phone = normalizePhone(claim.patient?.phoneNumber);
    if (!phone) {
      const entry = { sentAt: new Date().toISOString(), channel: null, status, actor, error: 'No phone number on file for patient' };
      await appendNotificationLog(claimId, hospitalId ?? claim.hospitalId, entry).catch(() => {});
      return { success: false, error: 'No phone number on file for patient' };
    }

    const message = buildMessage(claim);
    const channel = await sendToPhone(phone, message);

    const entry = { sentAt: new Date().toISOString(), channel, status, message, actor };
    await appendNotificationLog(claimId, hospitalId ?? claim.hospitalId, entry);

    return { success: !!channel, channel, message };
  } catch (err) {
    console.error('[insurance-claim-notify] notifyClaimStatusChange error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Returns a data: URL QR code + the public status-lookup URL it encodes.
 * The token carries only claimId/claimNumber — no clinical data.
 */
export async function generateStatusQrCode(claim) {
  const token = jwt.sign(
    { claimId: claim.id, claimNumber: claim.claimNumber, purpose: 'claim-status-lookup' },
    process.env.JWT_SECRET,
    { expiresIn: '90d' }
  );
  const baseUrl = process.env.PUBLIC_APP_URL || 'https://app.mediqzy.com';
  const url = `${baseUrl}/claim-status/${token}`;
  const dataUrl = await QRCode.toDataURL(url, { margin: 1, width: 260 });
  return { url, dataUrl };
}

export default { notifyClaimStatusChange, generateStatusQrCode };
