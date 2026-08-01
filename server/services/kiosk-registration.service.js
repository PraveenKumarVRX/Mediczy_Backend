/**
 * Kiosk walk-in registration invites — WhatsApp/SMS secure link + complete on phone.
 */
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import pool from '../db/pgPool.js';
import * as queue from './hospital-queue.service.js';
import { sendToPhone } from './queue-notify.service.js';
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
  const message =
    `Mediqzy · Complete your registration for ${hospitalName}\n\n` +
    `Tap this secure link (expires in ${INVITE_TTL_MIN} min):\n${link}\n\n` +
    `Do not share this link. Reply STOP to opt out.`;

  const notify = await sendToPhone(normalizedPhone, message);

  return {
    inviteId: ins.rows[0].id,
    expiresAt: ins.rows[0].expires_at,
    phone: normalizedPhone,
    linkSent: notify.ok,
    channels: notify.channels,
    // Never return raw token to kiosk response in logs-friendly shape — only for tests
    _rawTokenForTests: process.env.NODE_ENV === 'test' ? rawToken : undefined,
    registerUrlHint: link.replace(rawToken, '…'),
  };
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

  let aadhaarFields = null;
  if (aadhaarQrText || aadhaarQrBytesBase64) {
    const parsed = parseAadhaarQrInput({
      qrText: aadhaarQrText,
      qrBytesBase64: aadhaarQrBytesBase64,
    });
    if (parsed.success) aadhaarFields = parsed.fields;
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
    aadhaarLast4: aadhaarLast4 || aadhaarFields?.aadhaarLast4,
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
        aadhaarLast4: aadhaarLast4 || aadhaarFields?.aadhaarLast4 || null,
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
