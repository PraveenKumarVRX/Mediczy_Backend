/**
 * Kiosk walk-in registration invites — WhatsApp/SMS secure link + complete on phone.
 */
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import pool from '../db/pgPool.js';
import * as queue from './hospital-queue.service.js';
import { sendKioskRegistrationNotify } from './queue-notify.service.js';
import { parseAadhaarQrInput } from './aadhaar-qr.service.js';
import { cache } from '../db/redis.js';
import OTP from '../models/otp.model.intelligent.js';
import twilioOtpService from './twilio-otp.service.js';
import { SMSService, SMSTemplateManager } from './sms.service.js';
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/auth.config.js';

const INTERNAL_API_BASE = `http://127.0.0.1:${process.env.PORT || 8888}`;

const KIOSK_OTP_PURPOSE = 'kiosk-selfcheckin';
const KIOSK_OTP_VERIFIED_TTL_SEC = 600; // 10 min — long enough to finish the register form

let kioskSmsService = null;
function getKioskSmsService() {
  if (kioskSmsService) return kioskSmsService;
  const apiKey = process.env.SMS_API_KEY || process.env.TWILIO_ACCOUNT_SID;
  const apiSecret = process.env.SMS_API_SECRET || process.env.TWILIO_AUTH_TOKEN;
  if (!apiKey || !apiSecret) return null;
  kioskSmsService = new SMSService({
    provider: process.env.SMS_PROVIDER || 'twilio',
    apiKey,
    apiSecret,
    senderId: process.env.SMS_SENDER_ID || process.env.TWILIO_PHONE_NUMBER || 'MEDICZY',
  });
  return kioskSmsService;
}

const INVITE_TTL_MIN = parseInt(process.env.KIOSK_REG_INVITE_TTL_MIN || '30', 10);
const APP_BASE =
  process.env.PUBLIC_APP_URL ||
  process.env.FRONTEND_URL ||
  process.env.CLIENT_URL ||
  'https://app.mediqzy.com';

let tablesReady = false;

export async function ensureKioskRegistrationTables() {
  if (tablesReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kiosk_registration_invites (
      id BIGSERIAL PRIMARY KEY,
      token_hash VARCHAR(64) UNIQUE NOT NULL,
      organization_id INTEGER NOT NULL,
      device_id INTEGER,
      phone VARCHAR(20) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      prefill JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_patient_id INTEGER,
      queue_entry_id INTEGER,
      token_number VARCHAR(64),
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_kiosk_reg_invites_phone_status
      ON kiosk_registration_invites (phone, status)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_kiosk_reg_invites_expires
      ON kiosk_registration_invites (expires_at)
  `);
  tablesReady = true;
}

function hashToken(raw) {
  return crypto.createHash('sha256').update(String(raw)).digest('hex');
}

function normalizePhone10(phone) {
  return String(phone || '').replace(/\D/g, '').slice(-10);
}

/** Optional Aadhaar — accept 12-digit or last-4; return last 4 only (never store full UID). */
function normalizeAadhaarLast4(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 4) return digits;
  if (digits.length === 12) return digits.slice(-4);
  return null;
}

/**
 * Optional ABHA — 14-digit (xx-xxxx-xxxx-xxxx) or ABHA address (name@abdm).
 */
function normalizeAbhaId(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^[a-zA-Z0-9._-]{3,}@abdm$/i.test(raw)) return raw.toLowerCase();
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 14) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}-${digits.slice(10, 14)}`;
  }
  return null;
}

function approxDobFromAge(age) {
  const n = parseInt(age, 10);
  if (!Number.isFinite(n) || n <= 0 || n > 120) return null;
  const year = new Date().getFullYear() - n;
  return `${year}-01-01`;
}

function otpVerifiedKey(phone) {
  return `kiosk-otp-verified:${normalizePhone10(phone)}`;
}

/** Mark a phone as OTP-verified (server-trusted; never set from client input directly). */
export async function markKioskPhoneVerified(phone) {
  await cache.set(otpVerifiedKey(phone), true, KIOSK_OTP_VERIFIED_TTL_SEC);
}

export async function isKioskPhoneVerified(phone) {
  return Boolean(await cache.get(otpVerifiedKey(phone)));
}

/** Send a WhatsApp or SMS OTP to a new walk-in's phone before creating their record. */
export async function sendKioskPhoneOtp(phone, channel = 'whatsapp') {
  const normalizedPhone = normalizePhone10(phone);
  if (!/^\d{10}$/.test(normalizedPhone)) {
    throw Object.assign(new Error('Enter a valid 10-digit mobile number'), { status: 400 });
  }
  const otp = await OTP.generate({ phone: normalizedPhone, purpose: KIOSK_OTP_PURPOSE, expiryMinutes: 10 });
  const devCode = process.env.NODE_ENV !== 'production' ? otp.code : undefined;

  if (channel === 'sms') {
    const sms = getKioskSmsService();
    if (!sms) {
      return { sent: false, channel, reason: 'SMS OTP is not configured on this environment', devCode };
    }
    const result = await sms.sendSMS({
      to: `+91${normalizedPhone}`,
      message: SMSTemplateManager.renderTemplate('otp_verification', { otp: otp.code }),
    });
    return {
      sent: result.success === true,
      channel,
      reason: result.success ? null : result.error || 'Could not send SMS OTP',
      devCode,
    };
  }

  if (twilioOtpService.disabled) {
    return { sent: false, channel: 'whatsapp', reason: 'WhatsApp OTP is not configured on this environment', devCode };
  }
  const result = await twilioOtpService.sendWhatsAppOTP({
    phone: normalizedPhone,
    otp: otp.code,
    purpose: 'verification',
  });
  return {
    sent: result.success === true,
    channel: 'whatsapp',
    reason: result.success ? null : result.message || 'Could not send WhatsApp OTP',
    devCode,
  };
}

/** Verify a walk-in's phone OTP and mark it server-side verified for the register call. */
export async function verifyKioskPhoneOtp(phone, code) {
  const normalizedPhone = normalizePhone10(phone);
  const result = await OTP.verify({ phone: normalizedPhone, code, purpose: KIOSK_OTP_PURPOSE });
  if (result.success) await markKioskPhoneVerified(normalizedPhone);
  return result;
}

/**
 * Check whether a walk-in already has a record, by phone (primary) or by
 * corporate name + employee ID (secondary, for corporate camp attendees who
 * may show up on a different phone than the one on file).
 */
export async function lookupWalkInPatient({ phone, corporateName, employeeId }) {
  const normalizedPhone = normalizePhone10(phone);
  if (/^\d{10}$/.test(normalizedPhone)) {
    const r = await pool.query(
      `SELECT id, "firstName", "lastName" FROM users WHERE "phoneNumber" LIKE $1 LIMIT 1`,
      [`%${normalizedPhone}`]
    );
    if (r.rows[0]) {
      return { found: true, matchedBy: 'phone', firstName: r.rows[0].firstName, lastName: r.rows[0].lastName };
    }
  }
  const empId = String(employeeId || '').trim();
  const corpName = String(corporateName || '').trim();
  if (empId && corpName) {
    const r2 = await pool.query(
      `SELECT id, "firstName", "lastName" FROM users
       WHERE metadata->>'employeeId' = $1 AND metadata->>'corporateName' ILIKE $2
       LIMIT 1`,
      [empId, corpName]
    );
    if (r2.rows[0]) {
      return { found: true, matchedBy: 'employee', firstName: r2.rows[0].firstName, lastName: r2.rows[0].lastName };
    }
  }
  return { found: false };
}

function mapGender(genderRaw) {
  const genderNorm = String(genderRaw || '').trim();
  const genderLower = genderNorm.toLowerCase();
  const mapped =
    genderLower === 'male' || genderLower === 'm'
      ? 'Male'
      : genderLower === 'female' || genderLower === 'f'
        ? 'Female'
        : null;
  return [...new Set([mapped, genderNorm, 'Male', 'Female'].filter(Boolean))];
}

function publicBaseUrl() {
  return String(APP_BASE).replace(/\/$/, '');
}

function looksLikeDeviceLabel(name) {
  const s = String(name || '').trim();
  if (!s) return true;
  // Device registry names like "Hospital OPD Kiosk" must not fill WhatsApp {{1}}
  return /walk-in-kiosk|self-checkin|device|\bkiosk\b|\bboard\b/i.test(s);
}

/**
 * Resolve a human hospital/clinic/lab name for WhatsApp {{1}}.
 * Kiosk UI often omits hospitalName and falls back to device label — that used to
 * work for Twilio accept, but Meta can quality-score / drop odd template vars.
 */
export async function resolveOrgDisplayName(organizationId, fallback = 'the hospital') {
  const org = parseInt(organizationId, 10);
  if (!org) return fallback;
  // `tenants` is the real home for clinic-type organizations (SmartHealth Clinic
  // etc. — see doctor-letterhead.service.js). It must be checked first: `hospitals`,
  // `clinics` and `labs` use their own separate id sequences, so a clinic's
  // organization_id can collide with an unrelated hospital/lab row of the same id.
  const queries = [
    `SELECT name AS n FROM tenants WHERE id = $1 LIMIT 1`,
    `SELECT "hospitalName" AS n FROM hospitals WHERE id = $1 LIMIT 1`,
    `SELECT hospital_name AS n FROM hospitals WHERE id = $1 LIMIT 1`,
    `SELECT name AS n FROM hospitals WHERE id = $1 LIMIT 1`,
    `SELECT name AS n FROM clinics WHERE id = $1 LIMIT 1`,
    `SELECT name AS n FROM labs WHERE id = $1 LIMIT 1`,
  ];
  for (const sql of queries) {
    try {
      const r = await pool.query(sql, [org]);
      const n = String(r.rows[0]?.n || '').trim();
      if (n) return n.slice(0, 60);
    } catch {
      /* table/column may not exist in this env */
    }
  }
  return String(fallback || 'the hospital').slice(0, 60);
}

/**
 * Create invite + send WhatsApp/SMS with secure registration link.
 */
export async function createRegistrationInvite({
  organizationId,
  deviceId = null,
  phone,
  hospitalName = 'the hospital',
}) {
  await ensureKioskRegistrationTables();
  const normalizedPhone = normalizePhone10(phone);
  if (!/^\d{10}$/.test(normalizedPhone)) {
    throw Object.assign(new Error('Enter a valid 10-digit mobile number'), { status: 400 });
  }
  if (!organizationId) {
    throw Object.assign(new Error('Organization required'), { status: 400 });
  }

  let displayHospital = String(hospitalName || '').trim();
  if (looksLikeDeviceLabel(displayHospital)) {
    displayHospital = await resolveOrgDisplayName(organizationId, 'the hospital');
  } else {
    displayHospital = displayHospital.slice(0, 60) || 'the hospital';
  }

  // Expire any prior pending invites for this phone+org
  await pool.query(
    `UPDATE kiosk_registration_invites
     SET status = 'revoked'
     WHERE organization_id = $1 AND phone = $2 AND status = 'pending'`,
    [organizationId, normalizedPhone]
  );

  const rawToken = crypto.randomBytes(24).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + INVITE_TTL_MIN * 60 * 1000);

  const ins = await pool.query(
    `INSERT INTO kiosk_registration_invites
       (token_hash, organization_id, device_id, phone, status, expires_at)
     VALUES ($1,$2,$3,$4,'pending',$5)
     RETURNING id, expires_at, status`,
    [tokenHash, organizationId, deviceId, normalizedPhone, expiresAt]
  );

  const link = `${publicBaseUrl()}/kiosk/register/${rawToken}`;

  // Business-initiated WhatsApp must use an approved Content template (not free-form session).
  const notify = await sendKioskRegistrationNotify(normalizedPhone, {
    hospitalName: displayHospital,
    expiresMin: INVITE_TTL_MIN,
    registerUrl: link,
    token: rawToken,
  });

  // Persist delivery diagnostics (never store raw token)
  await pool.query(
    `UPDATE kiosk_registration_invites
     SET prefill = COALESCE(prefill, '{}'::jsonb) || $2::jsonb
     WHERE id = $1`,
    [
      ins.rows[0].id,
      JSON.stringify({
        hospitalName: displayHospital,
        notify: {
          ok: notify.ok,
          channels: notify.channels,
          errors: notify.errors || [],
          whatsappSid: notify.whatsappSid || null,
          whatsappStatus: notify.whatsappStatus || null,
          whatsappErrorCode: notify.whatsappErrorCode || null,
          usedTemplate: notify.usedTemplate === true,
          at: new Date().toISOString(),
        },
      }),
    ]
  );

  return {
    inviteId: ins.rows[0].id,
    expiresAt: ins.rows[0].expires_at,
    phone: normalizedPhone,
    hospitalName: displayHospital,
    linkSent: notify.ok,
    channels: notify.channels,
    notifyErrors: notify.errors || [],
    whatsappSid: notify.whatsappSid || null,
    whatsappStatus: notify.whatsappStatus || null,
    whatsappErrorCode: notify.whatsappErrorCode || null,
    // Device-auth kiosk may show this as QR fallback when WhatsApp/SMS doesn't arrive.
    // Raw token is never logged; only returned to the calling kiosk once.
    registerUrl: link,
    // Never return raw token to kiosk response in logs-friendly shape — only for tests
    _rawTokenForTests: process.env.NODE_ENV === 'test' ? rawToken : undefined,
    registerUrlHint: link.replace(rawToken, '…'),
  };
}

/**
 * Live Twilio delivery check for an invite (token-gated).
 * Needed because messages.create() can succeed while WhatsApp later undelivers.
 */
export async function getInviteWhatsAppDelivery(rawToken) {
  const invite = await getInviteByRawToken(rawToken);
  if (!invite.success) return invite;
  const sid = invite.prefill?.notify?.whatsappSid;
  if (!sid) {
    return {
      success: true,
      status: invite.status,
      phone: invite.phone,
      whatsappSid: null,
      delivery: null,
      message: 'No WhatsApp SID on this invite',
      notify: invite.prefill?.notify || null,
      hospitalName: invite.prefill?.hospitalName || null,
    };
  }
  try {
    const wa = (await import('./whatsapp-production.service.js')).default;
    const msg = await wa.getMessageStatus(sid);
    return {
      success: true,
      status: invite.status,
      phone: invite.phone,
      whatsappSid: sid,
      hospitalName: invite.prefill?.hospitalName || null,
      delivery: {
        status: msg.status,
        errorCode: msg.errorCode || null,
        errorMessage: msg.errorMessage || null,
        to: msg.to,
        from: msg.from,
        dateSent: msg.dateSent,
        dateUpdated: msg.dateUpdated,
      },
      notify: invite.prefill?.notify || null,
    };
  } catch (e) {
    return {
      success: false,
      message: e.message || 'Could not fetch WhatsApp delivery status',
      whatsappSid: sid,
    };
  }
}

export async function getInviteByRawToken(rawToken) {
  await ensureKioskRegistrationTables();
  if (!rawToken || String(rawToken).length < 20) {
    return { success: false, message: 'Invalid registration link' };
  }
  const row = await pool.query(
    `SELECT * FROM kiosk_registration_invites WHERE token_hash = $1 LIMIT 1`,
    [hashToken(rawToken)]
  );
  const invite = row.rows[0];
  if (!invite) return { success: false, message: 'This registration link is invalid.' };
  if (invite.status === 'completed') {
    return {
      success: true,
      status: 'completed',
      phone: invite.phone,
      tokenNumber: invite.token_number,
      consumedAt: invite.consumed_at,
    };
  }
  if (invite.status !== 'pending' || new Date(invite.expires_at) < new Date()) {
    if (invite.status === 'pending') {
      await pool.query(`UPDATE kiosk_registration_invites SET status = 'expired' WHERE id = $1`, [
        invite.id,
      ]);
    }
    return { success: false, message: 'This registration link has expired. Please start again at the kiosk.' };
  }
  return {
    success: true,
    status: 'pending',
    phone: invite.phone,
    expiresAt: invite.expires_at,
    prefill: invite.prefill || {},
    organizationId: invite.organization_id,
    inviteId: invite.id,
  };
}

/**
 * Create/find patient + issue walk-in queue token (shared by kiosk + mobile complete).
 */
/**
 * Find-or-create the walk-in's own `users` row — shared by queue check-in,
 * appointment booking, and camp registration so all three kiosk paths use
 * one identity for the same phone number instead of drifting apart.
 */
/**
 * When a walk-in identifies their employer, link them to the REAL corporate
 * account (if one exists) — not just the free-text metadata field — so
 * clinic staff can find them under that employer when issuing fitness
 * certificates (see clinic-occupational-health.route.js's employee search,
 * which queries user_associations, not users.metadata). Exact name match
 * only, to avoid mis-linking to a similarly-named company; if no formal
 * corporate account exists yet, the free-text metadata is all that's kept —
 * same as before this existed.
 */
async function linkToCorporateIfMatched(patientId, corporateName, employeeId) {
  if (!corporateName) return;
  try {
    const corp = await pool.query(
      `SELECT id FROM corporates WHERE LOWER(TRIM("companyName")) = LOWER(TRIM($1)) LIMIT 1`,
      [corporateName]
    );
    if (!corp.rows[0]) return;
    const corporateId = corp.rows[0].id;
    const already = await pool.query(
      `SELECT id FROM user_associations WHERE "userId" = $1 AND "entityType" = 'corporate' AND "entityId" = $2`,
      [patientId, corporateId]
    );
    if (already.rows[0]) return;
    await pool.query(
      `INSERT INTO user_associations
         ("userId", "entityType", "entityId", role, "isPrimary", status, "startDate", metadata, notes, "createdAt", "updatedAt")
       VALUES ($1, 'corporate', $2, 'employee', true, 'active', NOW(), $3::jsonb, $4, NOW(), NOW())`,
      [
        patientId,
        corporateId,
        JSON.stringify({ source: 'kiosk-checkin', employeeId: employeeId || undefined }),
        'Auto-linked from kiosk self check-in (corporate employee toggle)',
      ]
    );
  } catch (e) {
    // Non-fatal — the walk-in's check-in/booking/camp-registration must still
    // succeed even if this side-effect fails.
    console.warn('[kiosk] corporate auto-link failed:', e.message);
  }
}

export async function findOrCreateWalkInPatient({
  phone,
  firstName,
  lastName,
  dateOfBirth,
  age = null,
  gender: genderRaw,
  email = null,
  corporateName = null,
  employeeId = null,
  photoKey = null,
  abhaId = null,
  address = null,
  aadhaarLast4 = null,
  source = 'kiosk',
  requireOtpForNewPatient = false,
}) {
  if (!phone || !firstName) {
    throw Object.assign(new Error('phone and firstName required'), { status: 400 });
  }
  const normalizedPhone = normalizePhone10(phone);
  const genderCandidates = mapGender(genderRaw);
  const corpName = String(corporateName || '').trim() || null;
  const empId = String(employeeId || '').trim() || null;
  if (empId && !corpName) {
    throw Object.assign(new Error('Corporate name is required with employee ID'), { status: 400 });
  }
  const cleanEmail = String(email || '').trim().toLowerCase() || null;
  if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw Object.assign(new Error('Enter a valid email address'), { status: 400 });
  }
  if (empId && !cleanEmail) {
    throw Object.assign(new Error('Email is required for corporate employees'), { status: 400 });
  }

  let patientId;
  const existing = await pool.query(
    `SELECT id FROM users WHERE "phoneNumber" LIKE $1 LIMIT 1`,
    [`%${normalizedPhone}`]
  );

  if (existing.rows[0]) {
    patientId = existing.rows[0].id;
    await pool.query(
      `UPDATE users SET
         "firstName" = COALESCE(NULLIF($2,''), "firstName"),
         "lastName" = COALESCE(NULLIF($3,''), "lastName"),
         "dateOfBirth" = COALESCE($4::date, "dateOfBirth"),
         metadata = COALESCE(metadata, '{}'::jsonb) || $5::jsonb
       WHERE id = $1`,
      [
        patientId,
        firstName,
        lastName || '',
        dateOfBirth || approxDobFromAge(age) || null,
        JSON.stringify({
          address: address || undefined,
          aadhaarLast4: aadhaarLast4 || undefined,
          abhaId: abhaId || undefined,
          photoKey: photoKey || undefined,
          age: age || undefined,
          requestedEmail: cleanEmail || undefined,
          corporateName: corpName || undefined,
          employeeId: empId || undefined,
          source,
        }),
      ]
    );
    await linkToCorporateIfMatched(patientId, corpName, empId);
    return { patientId, isNew: false, normalizedPhone };
  }

  // Brand-new phone number — this is a real identity, not just a queue slip,
  // so it must be proven live via WhatsApp OTP before we create a record.
  if (requireOtpForNewPatient && !(await isKioskPhoneVerified(normalizedPhone))) {
    throw Object.assign(
      new Error('Please verify your mobile number via WhatsApp OTP first'),
      { status: 403, code: 'OTP_REQUIRED' }
    );
  }
  let insEmail = null;
  if (cleanEmail) {
    const taken = await pool.query(`SELECT id FROM users WHERE email = $1 LIMIT 1`, [cleanEmail]);
    if (!taken.rows[0]) insEmail = cleanEmail;
  }
  const finalEmail = insEmail || `kiosk+${normalizedPhone}@patient.mediqzy.local`;
  const hash = await bcrypt.hash(`kiosk-${normalizedPhone}-${Date.now()}`, 10);
  let ins = null;
  let lastErr = null;
  for (const g of genderCandidates) {
    try {
      ins = await pool.query(
        `INSERT INTO users ("firstName", "lastName", email, password, "phoneNumber", "dateOfBirth", gender, status, "emailVerified", role, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'active',true,'user',$8)
         RETURNING id`,
        [
          firstName,
          lastName || '',
          finalEmail,
          hash,
          normalizedPhone,
          dateOfBirth || approxDobFromAge(age) || '1990-01-01',
          g,
          JSON.stringify({
            uhidPending: true,
            abhaId: abhaId || null,
            photoKey: photoKey || null,
            address: address || null,
            aadhaarLast4: aadhaarLast4 || null,
            age: age || null,
            requestedEmail: cleanEmail || null,
            emailConflict: Boolean(cleanEmail && !insEmail),
            corporateName: corpName,
            employeeId: empId,
            source,
            genderRequested: genderRaw || null,
            otpVerified: requireOtpForNewPatient || undefined,
          }),
        ]
      );
      break;
    } catch (e) {
      lastErr = e;
      if (!/enum_users_gender|invalid input value for enum/i.test(e.message)) throw e;
    }
  }
  if (!ins?.rows?.[0]) throw lastErr || new Error('Failed to create patient');
  patientId = ins.rows[0].id;
  await linkToCorporateIfMatched(patientId, corpName, empId);
  return { patientId, isNew: true, normalizedPhone };
}

export async function registerWalkInPatient({
  organizationId,
  phone,
  firstName,
  lastName,
  dateOfBirth,
  age = null,
  gender: genderRaw,
  email = null,
  corporateName = null,
  employeeId = null,
  department = 'opd',
  queueZone = 'opd-waiting',
  doctorId = null,
  doctorName = null,
  chiefComplaint = null,
  consentVersion = 'kiosk-v1',
  photoKey = null,
  abhaId = null,
  notifyOptIn = true,
  notifyPhone = null,
  address = null,
  aadhaarLast4 = null,
  source = 'kiosk',
  requireOtpForNewPatient = false,
}) {
  const normalizedPhone = normalizePhone10(phone);
  const { patientId } = await findOrCreateWalkInPatient({
    phone, firstName, lastName, dateOfBirth, age, gender: genderRaw, email,
    corporateName, employeeId, photoKey, abhaId, address, aadhaarLast4,
    source, requireOtpForNewPatient,
  });

  const uhid = await queue.allocateUhid(organizationId);
  await pool.query(
    `UPDATE users SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb WHERE id = $1`,
    [patientId, JSON.stringify({ uhid, registeredVia: source, consentVersion })]
  );

  const entry = await queue.checkIn({
    organizationId,
    department,
    queueZone,
    patientId,
    patientName: `${firstName} ${lastName || ''}`.trim(),
    doctorId: doctorId || null,
    doctorName: doctorName || null,
    queueType: 'walk_in',
    chiefComplaint,
    consentVersion,
    metadata: {
      uhid,
      photoKey,
      abhaId,
      address,
      aadhaarLast4,
      notifyOptIn: notifyOptIn === true || notifyOptIn === 'true',
      notifyPhone: notifyPhone || normalizedPhone,
      source,
    },
  });

  // WhatsApp/SMS slip is triggered inside queue.checkIn when metadata.notifyOptIn is set
  return { patientId, uhid, entry };
}

export async function completeInviteRegistration(rawToken, body = {}) {
  const looked = await getInviteByRawToken(rawToken);
  if (!looked.success) {
    throw Object.assign(new Error(looked.message), { status: 410 });
  }
  if (looked.status === 'completed') {
    return {
      alreadyCompleted: true,
      tokenNumber: looked.tokenNumber,
      phone: looked.phone,
    };
  }

  const phone = looked.phone;
  const {
    firstName,
    lastName,
    dateOfBirth,
    gender,
    chiefComplaint,
    address,
    aadhaarLast4,
    aadhaarNumber,
    abhaId,
    consentAccepted,
    notifyOptIn = true,
    aadhaarQrText,
    aadhaarQrBytesBase64,
  } = body;

  if (!consentAccepted) {
    throw Object.assign(new Error('Please accept consent to continue'), { status: 400 });
  }
  if (!firstName) {
    throw Object.assign(new Error('First name is required'), { status: 400 });
  }

  // Optional IDs — never store full Aadhaar; keep last 4 only
  let normalizedLast4 = normalizeAadhaarLast4(aadhaarLast4 || aadhaarNumber);
  if ((aadhaarLast4 || aadhaarNumber) && !normalizedLast4) {
    throw Object.assign(
      new Error('Aadhaar should be 12 digits (or last 4). Leave blank to skip.'),
      { status: 400 }
    );
  }
  const normalizedAbha = normalizeAbhaId(abhaId);
  if (abhaId && String(abhaId).trim() && !normalizedAbha) {
    throw Object.assign(
      new Error('Enter a valid ABHA ID (14 digits or name@abdm). Leave blank to skip.'),
      { status: 400 }
    );
  }

  let aadhaarFields = null;
  if (aadhaarQrText || aadhaarQrBytesBase64) {
    const parsed = parseAadhaarQrInput({
      qrText: aadhaarQrText,
      qrBytesBase64: aadhaarQrBytesBase64,
    });
    if (parsed.success) aadhaarFields = parsed.fields;
  }
  if (!normalizedLast4 && aadhaarFields?.aadhaarLast4) {
    normalizedLast4 = String(aadhaarFields.aadhaarLast4).slice(-4);
  }

  const result = await registerWalkInPatient({
    organizationId: looked.organizationId,
    phone,
    firstName: firstName || aadhaarFields?.firstName,
    lastName: lastName || aadhaarFields?.lastName || '',
    dateOfBirth: dateOfBirth || aadhaarFields?.dateOfBirth,
    gender: gender || aadhaarFields?.gender,
    chiefComplaint,
    address: address || aadhaarFields?.address,
    aadhaarLast4: normalizedLast4,
    abhaId: normalizedAbha,
    notifyOptIn,
    notifyPhone: phone,
    source: 'kiosk-whatsapp',
    consentVersion: 'kiosk-wa-v1',
  });

  await pool.query(
    `UPDATE kiosk_registration_invites
     SET status = 'completed',
         consumed_at = NOW(),
         created_patient_id = $2,
         queue_entry_id = $3,
         token_number = $4,
         prefill = COALESCE(prefill, '{}'::jsonb) || $5::jsonb
     WHERE id = $1 AND status = 'pending'`,
    [
      looked.inviteId,
      result.patientId,
      result.entry?.id || null,
      result.entry?.tokenNumber || null,
      JSON.stringify({
        fullName: `${firstName} ${lastName || ''}`.trim(),
        aadhaarLast4: normalizedLast4 || null,
        abhaId: normalizedAbha || null,
      }),
    ]
  );

  return {
    alreadyCompleted: false,
    patientId: result.patientId,
    uhid: result.uhid,
    entry: result.entry,
    tokenNumber: result.entry?.tokenNumber,
    phone,
  };
}

export async function getInviteStatusForKiosk({ organizationId, phone }) {
  await ensureKioskRegistrationTables();
  const normalizedPhone = normalizePhone10(phone);
  const row = await pool.query(
    `SELECT id, status, token_number, expires_at, consumed_at, created_at
     FROM kiosk_registration_invites
     WHERE organization_id = $1 AND phone = $2
     ORDER BY id DESC LIMIT 1`,
    [organizationId, normalizedPhone]
  );
  return row.rows[0] || null;
}

// ── Purpose-of-visit: doctor consultation (walk-in or booked slot) ──────────

/**
 * Doctors actively practicing at this clinic/hospital tenant, with today's
 * live queue load so the kiosk can show "2 waiting" next to each name.
 */
export async function listKioskDoctors(organizationId) {
  const { rows } = await pool.query(
    `SELECT id, "firstName", "lastName", specialization, qualifications,
            "slotDuration", "profileImage", "consultationFees"
     FROM doctors
     WHERE tenant_id = $1 AND status = 'active'
     ORDER BY "firstName" ASC`,
    [organizationId]
  );
  const withLoad = await Promise.all(rows.map(async (d) => {
    const { rows: wr } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM hospital_queue_entries
       WHERE organization_id = $1 AND doctor_id = $2
         AND status IN ('waiting','called') AND check_in_at::date = CURRENT_DATE`,
      [organizationId, d.id]
    );
    return {
      id: d.id,
      firstName: d.firstName,
      lastName: d.lastName,
      specialization: d.specialization,
      qualifications: d.qualifications,
      slotDuration: d.slotDuration || 15,
      profileImage: d.profileImage,
      consultationFee: d.consultationFees,
      waitingCount: wr[0]?.c || 0,
    };
  }));
  return withLoad;
}

/**
 * Book a real appointment (not a walk-in queue token) for a chosen doctor +
 * time slot, going through the SAME authenticated /api/appointments flow
 * every logged-in patient uses — conflict checks, fees, RLS — by minting a
 * short-lived internal token for the walk-in's own patient record, rather
 * than re-implementing that logic here.
 */
export async function bookKioskAppointment({
  organizationId,
  phone,
  firstName,
  lastName,
  age = null,
  gender: genderRaw,
  email = null,
  corporateName = null,
  employeeId = null,
  doctorId,
  appointmentDate,
  appointmentTime,
  reason = null,
  requireOtpForNewPatient = false,
  source = 'kiosk-appointment',
}) {
  if (!doctorId || !appointmentDate || !appointmentTime) {
    throw Object.assign(new Error('doctorId, appointmentDate and appointmentTime are required'), { status: 400 });
  }
  const { patientId } = await findOrCreateWalkInPatient({
    phone, firstName, lastName, age, gender: genderRaw, email,
    corporateName, employeeId, source, requireOtpForNewPatient,
  });

  const internalToken = jwt.sign({ id: patientId, role: 'user', userType: 'user' }, JWT_CONFIG.SECRET, { expiresIn: '2m' });
  const res = await fetch(`${INTERNAL_API_BASE}/api/appointments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalToken}` },
    body: JSON.stringify({
      doctorId,
      appointmentDate,
      appointmentTime,
      consultationType: 'in-person',
      reason: reason || 'Booked at clinic self check-in kiosk',
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) {
    const err = new Error(json.message || 'Could not book this slot — please try another.');
    err.status = res.status === 409 ? 409 : res.status >= 400 && res.status < 500 ? 400 : 500;
    err.conflict = json.conflict || null;
    throw err;
  }
  return { patientId, appointment: json.appointment || json.data || json };
}

// ── Purpose-of-visit: health camp registration ──────────────────────────────

let campTableReady = false;
async function ensureCampRegistrationTable() {
  if (campTableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS health_camp_registrations (
      id BIGSERIAL PRIMARY KEY,
      camp_id INTEGER NOT NULL REFERENCES health_camps(id) ON DELETE CASCADE,
      organization_id INTEGER NOT NULL,
      patient_id INTEGER NOT NULL,
      queue_entry_id INTEGER,
      full_name VARCHAR(200),
      age INTEGER,
      gender VARCHAR(20),
      phone VARCHAR(20),
      corporate_name VARCHAR(200),
      employee_id VARCHAR(80),
      source VARCHAR(40) DEFAULT 'kiosk',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_camp_registrations_camp ON health_camp_registrations (camp_id)
  `);
  campTableReady = true;
}

/** Camps happening today or in the future at this tenant, for the kiosk to list. */
export async function listKioskCamps(organizationId) {
  const { rows } = await pool.query(
    `SELECT id, camp_name, camp_type, location, address, start_date, end_date,
            start_time, end_time, status, expected_patients, registered_patients
     FROM health_camps
     WHERE tenant_id = $1
       AND status IN ('planned','active')
       AND end_date >= CURRENT_DATE
     ORDER BY start_date ASC`,
    [organizationId]
  );
  return rows;
}

/**
 * Register a walk-in for a specific camp: creates/reuses their patient
 * record, records a real registrant row (health_camps.registered_patients
 * was previously just an unlinked counter), and gives them a queue token for
 * the day so they still get called like any other walk-in.
 */
export async function registerKioskCamp({
  organizationId,
  campId,
  phone,
  firstName,
  lastName,
  age = null,
  gender: genderRaw,
  email = null,
  corporateName = null,
  employeeId = null,
  notifyOptIn = true,
  requireOtpForNewPatient = false,
  source = 'kiosk-camp',
}) {
  await ensureCampRegistrationTable();
  const camp = await pool.query(`SELECT id, camp_name, tenant_id FROM health_camps WHERE id = $1`, [campId]);
  if (!camp.rows[0] || camp.rows[0].tenant_id !== organizationId) {
    throw Object.assign(new Error('Camp not found'), { status: 404 });
  }

  const { patientId, normalizedPhone } = await findOrCreateWalkInPatient({
    phone, firstName, lastName, age, gender: genderRaw, email,
    corporateName, employeeId, source, requireOtpForNewPatient,
  });

  const uhid = await queue.allocateUhid(organizationId);
  await pool.query(
    `UPDATE users SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb WHERE id = $1`,
    [patientId, JSON.stringify({ uhid, registeredVia: source })]
  );
  const entry = await queue.checkIn({
    organizationId,
    department: 'opd',
    queueZone: 'camp-checkin',
    patientId,
    patientName: `${firstName} ${lastName || ''}`.trim(),
    queueType: 'camp',
    chiefComplaint: `Health camp: ${camp.rows[0].camp_name}`,
    metadata: {
      uhid, campId, campName: camp.rows[0].camp_name,
      notifyOptIn: notifyOptIn === true || notifyOptIn === 'true',
      notifyPhone: normalizedPhone, source,
    },
  });

  await pool.query(
    `INSERT INTO health_camp_registrations
       (camp_id, organization_id, patient_id, queue_entry_id, full_name, age, gender, phone, corporate_name, employee_id, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      campId, organizationId, patientId, entry.id,
      `${firstName} ${lastName || ''}`.trim(), age ? parseInt(age, 10) : null, genderRaw || null,
      normalizedPhone, corporateName || null, employeeId || null, source,
    ]
  );
  await pool.query(
    `UPDATE health_camps SET registered_patients = COALESCE(registered_patients, 0) + 1 WHERE id = $1`,
    [campId]
  );

  return { patientId, uhid, entry, campName: camp.rows[0].camp_name };
}

export default {
  ensureKioskRegistrationTables,
  createRegistrationInvite,
  getInviteByRawToken,
  completeInviteRegistration,
  registerWalkInPatient,
  getInviteStatusForKiosk,
  lookupWalkInPatient,
  sendKioskPhoneOtp,
  verifyKioskPhoneOtp,
  markKioskPhoneVerified,
  isKioskPhoneVerified,
  resolveOrgDisplayName,
  findOrCreateWalkInPatient,
  listKioskDoctors,
  bookKioskAppointment,
  listKioskCamps,
  registerKioskCamp,
};
