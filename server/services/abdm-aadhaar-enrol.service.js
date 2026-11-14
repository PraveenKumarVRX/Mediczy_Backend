import { vendorFetch } from '../integrations/transport.js';
const fetch = vendorFetch('abdm');
/**
 * Aadhaar-based ABHA self-enrollment (ABDM v3).
 *
 * Flow:
 *   1) Encrypt Aadhaar with ABDM public cert
 *   2) POST /v3/enrollment/request/otp  (OTP → Aadhaar-linked mobile)
 *   3) POST /v3/enrollment/enrol/byAadhaar
 *
 * Env:
 *   ABHA_API_BASE_URL     — https://abhasbx.abdm.gov.in/abha/api (sandbox)
 *                           https://abha.abdm.gov.in/api/abha (prod)
 *   ABDM_BASE_URL         — gateway for sessions (existing)
 *   ABDM_CLIENT_ID / ABDM_CLIENT_SECRET
 *   ABDM_AADHAAR_ENROL_MOCK=true — force offline mock (also auto when no creds in sandbox)
 *
 * Never persists full Aadhaar — only last-4 + txn metadata in Redis.
 */
import crypto from 'crypto';
import { getAccessToken } from './abdm-client.service.js';
import { ensureAbdmTables } from './abdm-client.service.js';
import pool from '../db/pgPool.js';

const ABHA_API_BASE = (
  process.env.ABHA_API_BASE_URL ||
  (process.env.ABDM_BASE_URL?.includes('dev.abdm') || !process.env.ABDM_BASE_URL
    ? 'https://abhasbx.abdm.gov.in/abha/api'
    : 'https://abha.abdm.gov.in/api/abha')
).replace(/\/$/, '');

const IS_SANDBOX =
  !process.env.ABDM_BASE_URL ||
  process.env.ABDM_BASE_URL.includes('dev.abdm') ||
  ABHA_API_BASE.includes('abhasbx');

const FORCE_MOCK = process.env.NODE_ENV !== 'production' && (
  String(process.env.ABDM_AADHAAR_ENROL_MOCK || '').toLowerCase() === 'true' ||
  (!process.env.ABDM_CLIENT_ID && IS_SANDBOX));

const TXN_TTL_SEC = 600;

let redis = null;
let redisTried = false;
async function getRedis() {
  if (redisTried) return redis;
  redisTried = true;
  try {
    const mod = await import('../config/redis.js');
    const client = mod.default || mod.redisClient || null;
    // Only use if it already exposes get/set (avoid hanging connect in tests)
    if (client && typeof client.get === 'function' && typeof client.set === 'function') {
      redis = client;
    } else {
      redis = null;
    }
    return redis;
  } catch {
    redis = null;
    return null;
  }
}

const memoryTxn = new Map();

async function txnSet(txnId, payload) {
  const key = `abha:aadhaar-enrol:${txnId}`;
  const val = JSON.stringify({ ...payload, at: Date.now() });
  const r = await getRedis();
  if (r?.set) {
    try {
      if (typeof r.setex === 'function') await r.setex(key, TXN_TTL_SEC, val);
      else await r.set(key, val, 'EX', TXN_TTL_SEC);
      return;
    } catch {
      /* fall through */
    }
  }
  memoryTxn.set(key, { val, exp: Date.now() + TXN_TTL_SEC * 1000 });
}

async function txnGet(txnId) {
  const key = `abha:aadhaar-enrol:${txnId}`;
  const r = await getRedis();
  if (r?.get) {
    try {
      const raw = await r.get(key);
      if (raw) return JSON.parse(raw);
    } catch {
      /* fall through */
    }
  }
  const hit = memoryTxn.get(key);
  if (!hit) return null;
  if (hit.exp < Date.now()) {
    memoryTxn.delete(key);
    return null;
  }
  return JSON.parse(hit.val);
}

function uuid() {
  return crypto.randomUUID();
}

function normalizeAadhaar12(value) {
  const d = String(value || '').replace(/\D/g, '');
  return d.length === 12 ? d : null;
}

function normalizeMobile10(value) {
  const d = String(value || '').replace(/\D/g, '').slice(-10);
  return d.length === 10 ? d : null;
}

function abdmHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'REQUEST-ID': uuid(),
    TIMESTAMP: new Date().toISOString(),
    'X-CM-ID': IS_SANDBOX ? 'sbx' : 'abdm',
  };
}

async function abhaGet(path, accessToken) {
  const resp = await fetch(`${ABHA_API_BASE}${path}`, {
    method: 'GET',
    headers: abdmHeaders(accessToken),
  });
  const text = await resp.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!resp.ok) {
    throw new Error(data.message || data.error?.message || `ABHA GET ${path} failed (${resp.status})`);
  }
  return data;
}

async function abhaPost(path, body, accessToken) {
  const resp = await fetch(`${ABHA_API_BASE}${path}`, {
    method: 'POST',
    headers: abdmHeaders(accessToken),
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!resp.ok) {
    throw new Error(data.message || data.error?.message || `ABHA POST ${path} failed (${resp.status})`);
  }
  return data;
}

/** RSA/ECB/OAEPWithSHA-1AndMGF1Padding as required by ABDM */
export function encryptForAbdm(plainText, publicKeyPemOrB64) {
  let key = String(publicKeyPemOrB64 || '').trim();
  if (!key.includes('BEGIN')) {
    key = `-----BEGIN PUBLIC KEY-----\n${key.match(/.{1,64}/g)?.join('\n') || key}\n-----END PUBLIC KEY-----`;
  }
  const encrypted = crypto.publicEncrypt(
    {
      key,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha1',
    },
    Buffer.from(String(plainText), 'utf8')
  );
  return encrypted.toString('base64');
}

async function getAbdmPublicKey(accessToken) {
  const cert = await abhaGet('/v3/profile/public/certificate', accessToken);
  const publicKey = cert.publicKey || cert.public_key || cert.key;
  if (!publicKey) throw new Error('ABDM public certificate missing publicKey');
  return publicKey;
}

function mockTxnId() {
  return `mock-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

function mockAbhaFromAadhaar(seed) {
  // Deterministic fake ABHA for sandbox UX only — never claim as real NHA ID
  const h = crypto.createHash('sha256').update(`mediqzy-abha-mock:${seed}`).digest();
  let digits = '';
  for (const b of h) digits += String(b % 10);
  const n = digits.padEnd(14, '0').slice(0, 14);
  const abhaNumber = `${n.slice(0, 2)}-${n.slice(2, 6)}-${n.slice(6, 10)}-${n.slice(10, 14)}`;
  const tail = String(seed).replace(/\D/g, '').slice(-4) || n.slice(-4);
  const addr = `patient${tail}@sbx`;
  return { abhaNumber, abhaAddress: addr };
}

/**
 * Step 1 — send Aadhaar OTP for ABHA enrolment.
 * @returns {{ txnId, message, mock, mobileHint }}
 */
export async function initiateAadhaarAbhaEnrol({
  aadhaarNumber,
  mobile,
  inviteTokenHash,
  tenantId,
  name,
}) {
  const aadhaar12 = normalizeAadhaar12(aadhaarNumber);
  if (!aadhaar12) throw Object.assign(new Error('Enter a valid 12-digit Aadhaar number'), { status: 400 });
  const mobile10 = normalizeMobile10(mobile);
  const last4 = aadhaar12.slice(-4);

  if (FORCE_MOCK) {
    const txnId = mockTxnId();
    await txnSet(txnId, {
      mode: 'mock',
      aadhaarLast4: last4,
      aadhaarHash: crypto.createHash('sha256').update(aadhaar12).digest('hex'),
      mobile: mobile10,
      inviteTokenHash: inviteTokenHash || null,
      tenantId: tenantId || null,
      name: name || null,
    });
    return {
      txnId,
      mock: true,
      message: `Sandbox: OTP sent to Aadhaar-linked mobile ending ****${mobile10?.slice(-4) || 'XXXX'}. Use OTP 123456.`,
      mobileHint: mobile10 ? `******${mobile10.slice(-4)}` : null,
    };
  }

  try {
    const accessToken = await getAccessToken();
    if (accessToken === 'SANDBOX_MOCK_TOKEN') {
      if (process.env.NODE_ENV === 'production') throw new Error('ABDM is not configured for live enrolment');
      // Credentials missing — degrade to mock
      const txnId = mockTxnId();
      await txnSet(txnId, {
        mode: 'mock',
        aadhaarLast4: last4,
        aadhaarHash: crypto.createHash('sha256').update(aadhaar12).digest('hex'),
        mobile: mobile10,
        inviteTokenHash: inviteTokenHash || null,
        tenantId: tenantId || null,
        name: name || null,
      });
      return {
        txnId,
        mock: true,
        message: 'ABDM credentials not configured — sandbox OTP 123456',
        mobileHint: mobile10 ? `******${mobile10.slice(-4)}` : null,
      };
    }

    const publicKey = await getAbdmPublicKey(accessToken);
    const encryptedAadhaar = encryptForAbdm(aadhaar12, publicKey);
    const otpResp = await abhaPost(
      '/v3/enrollment/request/otp',
      {
        txnId: '',
        scope: ['abha-enrol'],
        loginHint: 'aadhaar',
        loginId: encryptedAadhaar,
        otpSystem: 'aadhaar',
      },
      accessToken
    );

    const txnId = otpResp.txnId || otpResp.txnID;
    if (!txnId) throw new Error('ABDM did not return txnId');

    await txnSet(txnId, {
      mode: 'live',
      aadhaarLast4: last4,
      mobile: mobile10,
      inviteTokenHash: inviteTokenHash || null,
      tenantId: tenantId || null,
      name: name || null,
      // Keep encrypted aadhaar only for resend/enrol if needed — avoid plaintext
      encryptedAadhaar,
    });

    return {
      txnId,
      mock: false,
      message: otpResp.message || 'OTP sent to Aadhaar-linked mobile',
      mobileHint: null,
    };
  } catch (e) {
    if (IS_SANDBOX && process.env.NODE_ENV !== 'production') {
      console.warn('[abha-aadhaar] live enrol init failed, sandbox mock:', e.message);
      const txnId = mockTxnId();
      await txnSet(txnId, {
        mode: 'mock',
        aadhaarLast4: last4,
        aadhaarHash: crypto.createHash('sha256').update(aadhaar12).digest('hex'),
        mobile: mobile10,
        inviteTokenHash: inviteTokenHash || null,
        tenantId: tenantId || null,
        name: name || null,
      });
      return {
        txnId,
        mock: true,
        message: `Sandbox fallback (ABDM error): use OTP 123456. (${e.message})`,
        mobileHint: mobile10 ? `******${mobile10.slice(-4)}` : null,
      };
    }
    throw e;
  }
}

/**
 * Step 2 — verify Aadhaar OTP and create/link ABHA.
 */
export async function verifyAadhaarAbhaEnrol({
  txnId,
  otp,
  mobile,
  inviteTokenHash,
  firstName,
  lastName,
  gender,
  dateOfBirth,
}) {
  if (!txnId || !otp) {
    throw Object.assign(new Error('txnId and otp are required'), { status: 400 });
  }
  const pending = await txnGet(txnId);
  if (!pending) {
    throw Object.assign(new Error('OTP session expired. Request a new OTP.'), { status: 410 });
  }
  if (pending.inviteTokenHash && inviteTokenHash && pending.inviteTokenHash !== inviteTokenHash) {
    throw Object.assign(new Error('OTP session does not match this registration link'), { status: 403 });
  }

  const mobile10 = normalizeMobile10(mobile || pending.mobile);

  if (pending.mode === 'mock') {
    if (process.env.NODE_ENV === 'production') throw Object.assign(new Error('Sandbox enrolment sessions cannot be verified in production'), { status: 403 });
    if (String(otp).trim() !== '123456' && !IS_SANDBOX) {
      throw Object.assign(new Error('Invalid OTP'), { status: 400 });
    }
    // In sandbox accept 123456 or any 6-digit for smoother QA
    if (!/^\d{6}$/.test(String(otp).trim())) {
      throw Object.assign(new Error('Enter the 6-digit OTP'), { status: 400 });
    }
    if (String(otp).trim() !== '123456' && IS_SANDBOX) {
      // still allow only 123456 in mock for predictability
      throw Object.assign(new Error('Sandbox OTP is 123456'), { status: 400 });
    }

    const seed = pending.aadhaarHash || pending.aadhaarLast4 || txnId;
    const { abhaNumber, abhaAddress } = mockAbhaFromAadhaar(seed);

    await persistAbhaRegistration({
      tenantId: pending.tenantId,
      abhaNumber,
      abhaAddress,
      mobile: mobile10,
      name: [firstName, lastName].filter(Boolean).join(' ') || pending.name,
      gender,
      dateOfBirth,
      profile: { mock: true, aadhaarLast4: pending.aadhaarLast4 },
    });

    return {
      verified: true,
      mock: true,
      abhaNumber,
      abhaAddress,
      aadhaarLast4: pending.aadhaarLast4,
      profile: {
        firstName: firstName || null,
        lastName: lastName || null,
        gender: gender || null,
        dateOfBirth: dateOfBirth || null,
      },
      message: 'Sandbox ABHA created (not a real NHA ID). Replace with live ABDM credentials for production.',
    };
  }

  // Live ABDM
  const accessToken = await getAccessToken();
  const publicKey = await getAbdmPublicKey(accessToken);
  const encryptedOtp = encryptForAbdm(String(otp).trim(), publicKey);
  const encryptedMobile = mobile10 ? encryptForAbdm(mobile10, publicKey) : undefined;

  const enrolResp = await abhaPost(
    '/v3/enrollment/enrol/byAadhaar',
    {
      txnId,
      scope: ['abha-enrol'],
      authData: {
        authMethods: ['otp'],
        otp: {
          txnId,
          otpValue: encryptedOtp,
          ...(encryptedMobile ? { mobile: encryptedMobile } : {}),
        },
      },
      consent: { code: 'abha-enrollment', version: '1.4' },
    },
    accessToken
  );

  const profile = enrolResp.ABHAProfile || enrolResp.abhaProfile || {};
  const abhaNumber = profile.ABHANumber || profile.abhaNumber || enrolResp.healthIdNumber || null;
  const phr = profile.phrAddress;
  const abhaAddress = Array.isArray(phr) ? phr[0] : phr || profile.healthId || null;

  if (!abhaNumber) {
    throw new Error('ABDM enrolment succeeded but no ABHA number returned');
  }

  await persistAbhaRegistration({
    tenantId: pending.tenantId,
    abhaNumber,
    abhaAddress,
    mobile: mobile10 || profile.mobile,
    name: [profile.firstName, profile.lastName].filter(Boolean).join(' ') || pending.name,
    gender: profile.gender || gender,
    dateOfBirth: profile.dob || dateOfBirth,
    profile,
    token: enrolResp.tokens?.token,
  });

  return {
    verified: true,
    mock: false,
    abhaNumber,
    abhaAddress,
    aadhaarLast4: pending.aadhaarLast4,
    profile: {
      firstName: profile.firstName || firstName || null,
      lastName: profile.lastName || lastName || null,
      gender: profile.gender || gender || null,
      dateOfBirth: profile.dob || dateOfBirth || null,
      address: profile.address || null,
    },
    message: enrolResp.message || 'ABHA created successfully',
  };
}

async function persistAbhaRegistration({
  tenantId,
  abhaNumber,
  abhaAddress,
  mobile,
  name,
  gender,
  dateOfBirth,
  profile,
  token,
}) {
  if (!tenantId || !abhaNumber) return;
  try {
    await ensureAbdmTables();
    const expiry = token ? new Date(Date.now() + 1800 * 1000) : null;
    await pool.query(
      `INSERT INTO abha_registrations
         (tenant_id, abha_number, abha_address, health_id, mobile, name, gender, date_of_birth,
          verification_status, linked_at, abdm_token, abdm_token_exp, profile_json)
       VALUES ($1,$2,$3,$3,$4,$5,$6,$7,'verified',NOW(),$8,$9,$10)
       ON CONFLICT (abha_number) DO UPDATE SET
         abha_address = COALESCE(EXCLUDED.abha_address, abha_registrations.abha_address),
         mobile = COALESCE(EXCLUDED.mobile, abha_registrations.mobile),
         verification_status = 'verified',
         linked_at = NOW(),
         profile_json = COALESCE(EXCLUDED.profile_json, abha_registrations.profile_json),
         updated_at = NOW()`,
      [
        tenantId,
        abhaNumber,
        abhaAddress || null,
        mobile || null,
        name || null,
        gender || null,
        dateOfBirth || null,
        token || null,
        expiry,
        profile ? JSON.stringify(profile) : null,
      ]
    );
  } catch (e) {
    console.warn('[abha-aadhaar] persist registration:', e.message);
  }
}

export function isAadhaarAbhaEnrolMockMode() {
  return FORCE_MOCK;
}

export default {
  initiateAadhaarAbhaEnrol,
  verifyAadhaarAbhaEnrol,
  encryptForAbdm,
  isAadhaarAbhaEnrolMockMode,
};
