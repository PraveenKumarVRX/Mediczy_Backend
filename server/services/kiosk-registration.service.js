/**
 * Kiosk walk-in registration invites — WhatsApp/SMS secure link + complete on phone.
 */
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import pool from '../db/pgPool.js';
import * as queue from './hospital-queue.service.js';
import { sendKioskRegistrationNotify } from './queue-notify.service.js';
import { parseAadhaarQrInput } from './aadhaar-qr.service.js';

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
  const queries = [
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
export async function registerWalkInPatient({
  organizationId,
  phone,
  firstName,
  lastName,
  dateOfBirth,
  gender: genderRaw,
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
}) {
  if (!phone || !firstName) {
    throw Object.assign(new Error('phone and firstName required'), { status: 400 });
  }
  const normalizedPhone = normalizePhone10(phone);
  const genderCandidates = mapGender(genderRaw);

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
        dateOfBirth || null,
        JSON.stringify({
          address: address || undefined,
          aadhaarLast4: aadhaarLast4 || undefined,
          abhaId: abhaId || undefined,
          photoKey: photoKey || undefined,
          source,
        }),
      ]
    );
  } else {
    const email = `kiosk+${normalizedPhone}@patient.mediqzy.local`;
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
            email,
            hash,
            normalizedPhone,
            dateOfBirth || '1990-01-01',
            g,
            JSON.stringify({
              uhidPending: true,
              abhaId: abhaId || null,
              photoKey: photoKey || null,
              address: address || null,
              aadhaarLast4: aadhaarLast4 || null,
              source,
              genderRequested: genderRaw || null,
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
  }

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

export default {
  ensureKioskRegistrationTables,
  createRegistrationInvite,
  getInviteByRawToken,
  completeInviteRegistration,
  registerWalkInPatient,
  getInviteStatusForKiosk,
};
