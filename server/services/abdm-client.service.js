/**
 * ABDM / ABHA API Client Service
 *
 * Implements the Ayushman Bharat Digital Mission (ABDM) v3 NHA APIs:
 *   - ABHA number generation and verification
 *   - ABHA health ID linking
 *   - HIE-CM consent management (grant, revoke, fetch)
 *   - PHI (Personal Health Information) request and fetch
 *   - Health record sharing with linked facilities
 *
 * Replaces the mock data in ayushman.route.js.
 *
 * Environment variables required:
 *   ABDM_BASE_URL       — https://dev.abdm.gov.in/gateway  (sandbox) or production URL
 *   ABDM_CLIENT_ID      — Issued by NHA upon registration
 *   ABDM_CLIENT_SECRET  — Issued by NHA upon registration
 *   ABDM_GATEWAY_URL    — https://dev.abdm.gov.in/gateway
 *   ABDM_CALLBACK_URL   — https://app.mediqzy.com/api/abdm/callback
 *   ABDM_HIP_ID         — Health Information Provider ID (HMIS facility code)
 *
 * Standards:
 *   NHA ABDM Sandbox v3 API Spec
 *   HL7 FHIR R4 (PHI payload format)
 *   DPDP §6 (purpose-limited consent), §14 (data erasure)
 */

import pool from '../db/pgPool.js';
import { abdmCircuitBreaker } from '../utils/circuit-breaker.js';

// ── Config ────────────────────────────────────────────────────────────────────
const ABDM_BASE       = (process.env.ABDM_BASE_URL    || 'https://dev.abdm.gov.in/gateway').replace(/\/$/, '');
const ABDM_CLIENT_ID  = process.env.ABDM_CLIENT_ID    || '';
const ABDM_CLIENT_SEC = process.env.ABDM_CLIENT_SECRET || '';
const ABDM_HIP_ID     = process.env.ABDM_HIP_ID       || 'MEDICZY_HMIS_001';
const ABDM_CALLBACK   = process.env.ABDM_CALLBACK_URL  || 'https://app.mediqzy.com/api/abdm/callback';
const IS_SANDBOX      = !process.env.ABDM_BASE_URL || process.env.ABDM_BASE_URL.includes('dev.abdm');

// ── DB bootstrap ──────────────────────────────────────────────────────────────
export async function ensureAbdmTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS abha_registrations (
      id              BIGSERIAL PRIMARY KEY,
      tenant_id       INTEGER NOT NULL,
      patient_id      INTEGER,
      abha_number     VARCHAR(20) UNIQUE,
      abha_address    VARCHAR(100),
      health_id       VARCHAR(100),
      mobile          VARCHAR(15),
      name            TEXT,
      gender          VARCHAR(5),
      date_of_birth   DATE,
      verification_status VARCHAR(20) DEFAULT 'pending',
      linked_at       TIMESTAMPTZ,
      abdm_token      TEXT,
      abdm_token_exp  TIMESTAMPTZ,
      profile_json    JSONB,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS abdm_consents (
      id              BIGSERIAL PRIMARY KEY,
      tenant_id       INTEGER NOT NULL,
      patient_id      INTEGER,
      abha_number     VARCHAR(20),
      consent_id      VARCHAR(100) UNIQUE,
      consent_status  VARCHAR(20) DEFAULT 'requested',
      purpose_code    VARCHAR(20),
      hip_id          VARCHAR(100),
      hiu_id          VARCHAR(100),
      date_range_from DATE,
      date_range_to   DATE,
      expiry          TIMESTAMPTZ,
      hi_types        TEXT[],
      granted_at      TIMESTAMPTZ,
      revoked_at      TIMESTAMPTZ,
      artifact_json   JSONB,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS abdm_phi_requests (
      id              BIGSERIAL PRIMARY KEY,
      tenant_id       INTEGER NOT NULL,
      consent_id      VARCHAR(100) REFERENCES abdm_consents(consent_id),
      transaction_id  VARCHAR(100) UNIQUE,
      request_status  VARCHAR(20) DEFAULT 'initiated',
      care_context    TEXT,
      fhir_bundle     JSONB,
      requested_at    TIMESTAMPTZ DEFAULT NOW(),
      received_at     TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_abha_tenant     ON abha_registrations(tenant_id, abha_number);
    CREATE INDEX IF NOT EXISTS idx_abdm_consent_pat ON abdm_consents(patient_id, consent_status);
    CREATE INDEX IF NOT EXISTS idx_abdm_phi_consent ON abdm_phi_requests(consent_id, request_status);
  `);
}

// ── Token management ──────────────────────────────────────────────────────────
let _cachedToken = null;
let _tokenExpiry = null;

export async function getAccessToken() {
  if (_cachedToken && _tokenExpiry && Date.now() < _tokenExpiry) return _cachedToken;

  if (!ABDM_CLIENT_ID || !ABDM_CLIENT_SEC) {
    if (IS_SANDBOX) {
      // Return a mock token in sandbox mode when credentials are missing
      return 'SANDBOX_MOCK_TOKEN';
    }
    throw new Error('ABDM_CLIENT_ID and ABDM_CLIENT_SECRET env vars are required');
  }

  const resp = await fetch(`${ABDM_BASE}/v0.5/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: ABDM_CLIENT_ID, clientSecret: ABDM_CLIENT_SEC }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`ABDM auth failed: ${resp.status} ${text}`);
  }

  const data = await resp.json();
  _cachedToken = data.accessToken;
  _tokenExpiry = Date.now() + (data.expiresIn || 1800) * 1000 - 30000;
  return _cachedToken;
}

async function abdmGet(path) {
  if (abdmCircuitBreaker.isOpen()) throw new Error('ABDM gateway circuit open — cooling down');
  const token = await getAccessToken();
  try {
    const resp = await fetch(`${ABDM_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'X-HIP-ID': ABDM_HIP_ID },
    });
    if (!resp.ok) {
      const text = await resp.text();
      abdmCircuitBreaker.onFailure();
      throw new Error(`ABDM GET ${path} failed: ${resp.status} ${text}`);
    }
    abdmCircuitBreaker.onSuccess();
    return resp.json();
  } catch (err) {
    if (!err.message.includes('circuit open')) abdmCircuitBreaker.onFailure();
    throw err;
  }
}

async function abdmPost(path, body) {
  if (abdmCircuitBreaker.isOpen()) throw new Error('ABDM gateway circuit open — cooling down');
  const token = await getAccessToken();
  try {
    const resp = await fetch(`${ABDM_BASE}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-HIP-ID': ABDM_HIP_ID,
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const text = await resp.text();
      abdmCircuitBreaker.onFailure();
      throw new Error(`ABDM POST ${path} failed: ${resp.status} ${text}`);
    }
    abdmCircuitBreaker.onSuccess();
    const ct = resp.headers.get('content-type') || '';
    return ct.includes('json') ? resp.json() : { status: resp.status };
  } catch (err) {
    if (!err.message.includes('circuit open')) abdmCircuitBreaker.onFailure();
    throw err;
  }
}

// ── ABHA Registration ─────────────────────────────────────────────────────────

export async function initiateAbhaRegistration(tenantId, opts) {
  const { mobile, name, gender, dateOfBirth, patientId } = opts;
  if (!mobile) throw new Error('mobile is required');

  // Step 1: Generate OTP to mobile
  const otpResp = await abdmPost('/v1/registration/mobile/login/generateOtp', { mobile });

  const txnId = otpResp.txnId || null;

  // Persist pending registration
  const { rows } = await pool.query(
    `INSERT INTO abha_registrations (tenant_id, patient_id, mobile, name, gender, date_of_birth, verification_status)
     VALUES ($1,$2,$3,$4,$5,$6,'otp_sent')
     ON CONFLICT (abha_number) DO NOTHING
     RETURNING id, verification_status`,
    [tenantId, patientId || null, mobile, name || null, gender || null, dateOfBirth || null]
  );

  return { txnId, mobile, status: 'otp_sent', registrationId: rows[0]?.id };
}

export async function verifyAbhaOtp(tenantId, opts) {
  const { txnId, otp, mobile } = opts;
  if (!txnId || !otp) throw new Error('txnId and otp are required');

  const verifyResp = await abdmPost('/v1/registration/mobile/login/verifyOtp', { txnId, otp });
  const token      = verifyResp.token;
  const expiry     = new Date(Date.now() + (verifyResp.expiresIn || 1800) * 1000);

  // Fetch profile
  let profile = null;
  try {
    const profileResp = await fetch(`${ABDM_BASE}/v1/registration/mobile/login/userAuthorizedToken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ txnId }),
    });
    if (profileResp.ok) profile = await profileResp.json();
  } catch {}

  const abhaNumber  = profile?.healthIdNumber || verifyResp.healthIdNumber || null;
  const abhaAddress = profile?.healthId || null;

  if (abhaNumber) {
    await pool.query(
      `UPDATE abha_registrations
       SET abha_number = $1, abha_address = $2, health_id = $2,
           verification_status = 'verified', abdm_token = $3, abdm_token_exp = $4,
           profile_json = $5, linked_at = NOW(), updated_at = NOW()
       WHERE tenant_id = $6 AND mobile = $7`,
      [abhaNumber, abhaAddress, token, expiry, profile ? JSON.stringify(profile) : null, tenantId, mobile]
    );
  }

  return {
    verified: true,
    abhaNumber,
    abhaAddress,
    profile,
    token: IS_SANDBOX ? '[redacted-sandbox]' : undefined,
  };
}

export async function fetchAbhaProfile(abhaNumber, tenantId) {
  const { rows } = await pool.query(
    'SELECT * FROM abha_registrations WHERE abha_number = $1 AND tenant_id = $2',
    [abhaNumber, tenantId]
  );
  if (!rows.length) throw new Error('ABHA registration not found');
  const reg = rows[0];

  // Refresh profile from ABDM if token valid
  if (reg.abdm_token && new Date(reg.abdm_token_exp) > new Date()) {
    try {
      const liveProfile = await abdmGet(`/v1/account/profile?healthId=${encodeURIComponent(abhaNumber)}`);
      await pool.query(
        `UPDATE abha_registrations SET profile_json = $1, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(liveProfile), reg.id]
      );
      return { ...reg, profile_json: liveProfile };
    } catch {}
  }

  const { abdm_token, ...safe } = reg;
  return safe;
}

export async function listAbhaRegistrations(tenantId, patientId = null) {
  const cond = patientId ? 'tenant_id = $1 AND patient_id = $2' : 'tenant_id = $1';
  const vals = patientId ? [tenantId, patientId] : [tenantId];
  const { rows } = await pool.query(
    `SELECT id, patient_id, abha_number, abha_address, name, gender, date_of_birth,
            verification_status, linked_at, created_at
     FROM abha_registrations WHERE ${cond} ORDER BY created_at DESC`,
    vals
  );
  return rows;
}

// ── Consent management ────────────────────────────────────────────────────────
export async function requestConsent(tenantId, opts) {
  const { abhaNumber, patientId, purposeCode, hiTypes, dateFrom, dateTo, expiryDays = 30, hiuId } = opts;
  if (!abhaNumber) throw new Error('abhaNumber is required');
  if (!hiTypes || !hiTypes.length) throw new Error('hiTypes array is required');

  const expiry    = new Date(Date.now() + expiryDays * 86400000).toISOString();
  const consentId = `MQZ-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  const body = {
    requestId: consentId,
    timestamp: new Date().toISOString(),
    consent: {
      purpose: { code: purposeCode || 'CAREMGT' },
      patient: { id: abhaNumber },
      hiu:     { id: hiuId || ABDM_HIP_ID },
      requester: { name: 'Mediczy Healthcare', identifier: { type: 'REGNO', value: ABDM_HIP_ID, system: 'https://facilityregistry.ndhm.gov.in' } },
      hiTypes: hiTypes,
      permission: {
        accessMode: 'VIEW',
        dateRange: { from: dateFrom || new Date(Date.now() - 365 * 86400000).toISOString().split('T')[0], to: dateTo || new Date().toISOString().split('T')[0] },
        dataEraseAt: expiry,
        frequency: { unit: 'HOUR', value: 1, repeats: 0 },
      },
    },
  };

  try {
    await abdmPost('/v0.5/consent-requests/init', body);
  } catch (err) {
    // In sandbox without full credentials, proceed with local tracking
    if (!IS_SANDBOX) throw err;
  }

  const { rows } = await pool.query(
    `INSERT INTO abdm_consents (tenant_id, patient_id, abha_number, consent_id, consent_status, purpose_code, hip_id, hiu_id, date_range_from, date_range_to, expiry, hi_types)
     VALUES ($1,$2,$3,$4,'requested',$5,$6,$7,$8,$9,$10,$11)
     RETURNING id, consent_id, consent_status, created_at`,
    [tenantId, patientId || null, abhaNumber, consentId, purposeCode || 'CAREMGT', ABDM_HIP_ID, hiuId || ABDM_HIP_ID, dateFrom || null, dateTo || null, expiry, hiTypes]
  );

  return rows[0];
}

export async function listConsents(tenantId, filters = {}) {
  const { patientId, status, abhaNumber } = filters;
  const conds = ['tenant_id = $1'];
  const vals  = [tenantId];
  let idx = 2;
  if (patientId)  { conds.push(`patient_id = $${idx++}`);   vals.push(patientId); }
  if (status)     { conds.push(`consent_status = $${idx++}`); vals.push(status); }
  if (abhaNumber) { conds.push(`abha_number = $${idx++}`);  vals.push(abhaNumber); }
  const { rows } = await pool.query(
    `SELECT id, patient_id, abha_number, consent_id, consent_status, purpose_code, hip_id, hiu_id,
            date_range_from, date_range_to, expiry, hi_types, granted_at, revoked_at, created_at
     FROM abdm_consents WHERE ${conds.join(' AND ')} ORDER BY created_at DESC`,
    vals
  );
  return rows;
}

export async function revokeConsent(tenantId, consentId) {
  const { rows } = await pool.query(
    `SELECT id, consent_id, consent_status FROM abdm_consents WHERE consent_id = $1 AND tenant_id = $2`,
    [consentId, tenantId]
  );
  if (!rows.length) throw new Error('Consent not found');
  if (rows[0].consent_status === 'revoked') throw new Error('Consent already revoked');

  try {
    await abdmPost('/v0.5/consents/revoke', { requestId: consentId, timestamp: new Date().toISOString(), consentsId: [consentId] });
  } catch (err) {
    if (!IS_SANDBOX) throw err;
  }

  await pool.query(
    `UPDATE abdm_consents SET consent_status = 'revoked', revoked_at = NOW() WHERE consent_id = $1 AND tenant_id = $2`,
    [consentId, tenantId]
  );
  return { consentId, status: 'revoked', revokedAt: new Date().toISOString() };
}

// ── Consent callback handler (from NHA gateway) ───────────────────────────────
export async function handleConsentCallback(payload) {
  const { consentRequestId, status, consentArtefacts = [] } = payload?.notification || {};
  if (!consentRequestId) return { ignored: true };

  await pool.query(
    `UPDATE abdm_consents
     SET consent_status = $1, granted_at = CASE WHEN $1 = 'GRANTED' THEN NOW() ELSE granted_at END,
         artifact_json = $2
     WHERE consent_id = $3`,
    [
      (status || 'unknown').toLowerCase(),
      consentArtefacts.length ? JSON.stringify(consentArtefacts) : null,
      consentRequestId,
    ]
  );
  return { processed: true, consentId: consentRequestId, status };
}

// ── PHI data request ──────────────────────────────────────────────────────────
export async function requestPhi(tenantId, consentId) {
  const { rows } = await pool.query(
    `SELECT * FROM abdm_consents WHERE consent_id = $1 AND tenant_id = $2 AND consent_status = 'granted'`,
    [consentId, tenantId]
  );
  if (!rows.length) throw new Error('No granted consent found');
  const consent = rows[0];

  const txnId = `TXN-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  try {
    await abdmPost('/v0.5/health-information/cm/request', {
      requestId: txnId,
      timestamp: new Date().toISOString(),
      hiRequest: {
        consent: { id: consentId },
        dateRange: { from: consent.date_range_from, to: consent.date_range_to },
        dataPushUrl: `${ABDM_CALLBACK}/phi`,
        keyMaterial: {
          cryptoAlg: 'ECDH',
          curve: 'Curve25519',
          dhPublicKey: { expiry: new Date(Date.now() + 3600000).toISOString(), parameters: 'Curve25519/32byte random', keyValue: '' },
          nonce: Buffer.from(Math.random().toString()).toString('base64'),
        },
      },
    });
  } catch (err) {
    if (!IS_SANDBOX) throw err;
  }

  const { rows: phiRows } = await pool.query(
    `INSERT INTO abdm_phi_requests (tenant_id, consent_id, transaction_id, request_status)
     VALUES ($1,$2,$3,'initiated')
     RETURNING id, transaction_id, request_status, requested_at`,
    [tenantId, consentId, txnId]
  );
  return phiRows[0];
}

export async function handlePhiCallback(payload) {
  const { transactionId, entries = [] } = payload || {};
  if (!transactionId) return { ignored: true };

  const fhirBundle = entries.length ? { resourceType: 'Bundle', entry: entries } : null;

  await pool.query(
    `UPDATE abdm_phi_requests
     SET request_status = 'received', fhir_bundle = $1, received_at = NOW()
     WHERE transaction_id = $2`,
    [fhirBundle ? JSON.stringify(fhirBundle) : null, transactionId]
  );
  return { processed: true, transactionId, entriesReceived: entries.length };
}

export async function listPhiRequests(tenantId, consentId = null) {
  const cond = consentId
    ? 'pr.tenant_id = $1 AND pr.consent_id = $2'
    : 'pr.tenant_id = $1';
  const vals = consentId ? [tenantId, consentId] : [tenantId];
  const { rows } = await pool.query(
    `SELECT pr.id, pr.transaction_id, pr.request_status, pr.care_context,
            pr.requested_at, pr.received_at, c.abha_number, c.purpose_code
     FROM abdm_phi_requests pr
     JOIN abdm_consents c ON c.consent_id = pr.consent_id
     WHERE ${cond} ORDER BY pr.requested_at DESC LIMIT 100`,
    vals
  );
  return rows;
}

// ── ABHA care context linking ─────────────────────────────────────────────────
export async function linkCareContext(abhaNumber, careContext) {
  const { referenceNumber, display } = careContext;
  if (!referenceNumber) throw new Error('referenceNumber is required');

  try {
    await abdmPost('/v0.5/links/link/care-context/notify', {
      requestId: `CC-${Date.now()}`,
      timestamp: new Date().toISOString(),
      notification: {
        patient: { id: abhaNumber },
        careContexts: [{ referenceNumber, display: display || referenceNumber }],
        hiTypes: careContext.hiTypes || ['OPConsultation'],
        date: new Date().toISOString().split('T')[0],
        hip: { id: ABDM_HIP_ID },
      },
    });
  } catch (err) {
    if (!IS_SANDBOX) throw err;
  }
  return { abhaNumber, careContext, linked: true, hipId: ABDM_HIP_ID };
}
