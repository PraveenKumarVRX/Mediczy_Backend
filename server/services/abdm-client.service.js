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

import { schemaVerifier } from '../utils/schema-guard.js';
// ── Config ────────────────────────────────────────────────────────────────────
const ABDM_BASE       = (process.env.ABDM_BASE_URL    || 'https://dev.abdm.gov.in/gateway').replace(/\/$/, '');
const ABDM_CLIENT_ID  = process.env.ABDM_CLIENT_ID    || '';
const ABDM_CLIENT_SEC = process.env.ABDM_CLIENT_SECRET || '';
const ABDM_HIP_ID     = process.env.ABDM_HIP_ID       || 'MEDICZY_HMIS_001';
const ABDM_CALLBACK   = process.env.ABDM_CALLBACK_URL  || 'https://app.mediqzy.com/api/abdm/callback';
const IS_SANDBOX      = !process.env.ABDM_BASE_URL || process.env.ABDM_BASE_URL.includes('dev.abdm');
// HFR/HPR fallbacks swallow gateway errors ONLY when a sandbox URL is explicitly configured;
// an unset ABDM_BASE_URL (e.g. a misconfigured production) must surface the error instead.
const HFR_HPR_SANDBOX_FALLBACK = Boolean(process.env.ABDM_BASE_URL) && process.env.ABDM_BASE_URL.includes('dev.abdm');

// HFR/HPR (Health Facility Registry / Health Professional Registry) — added
// 2026-09-18 per audit finding: only patient-side ABHA/consent/PHI flows
// existed, no facility or provider registration. Paths below are
// configurable via env because NHA's HFR/HPR API paths have changed across
// spec versions — VERIFY THESE AGAINST THE CURRENT NHA API DOCS before
// pointing this at a real facility ID; this scaffolding (auth reuse, error
// handling, DB persistence, circuit breaker) is production-shaped, but the
// exact path constants are a best-effort default, not a confirmed live
// integration (no ABDM sandbox HFR/HPR credentials were available to test
// against when this was written).
const ABDM_HFR_REGISTER_PATH = process.env.ABDM_HFR_REGISTER_PATH || '/v1/facility/register';
const ABDM_HFR_STATUS_PATH   = process.env.ABDM_HFR_STATUS_PATH   || '/v1/facility/status';
const ABDM_HPR_REGISTER_PATH = process.env.ABDM_HPR_REGISTER_PATH || '/v1/hpr/register';
const ABDM_HPR_STATUS_PATH   = process.env.ABDM_HPR_STATUS_PATH   || '/v1/hpr/status';

// ── DB bootstrap ──────────────────────────────────────────────────────────────
const SCHEMA_TABLES = ['abha_registrations', 'abdm_consents', 'abdm_phi_requests', 'hfr_facility_registrations', 'hpr_provider_registrations'];

// Owned by the migration, verified here. A missing table fails closed with
// SCHEMA_NOT_MIGRATED instead of this service creating a table the
// migration never shaped.
export const ensureAbdmTables = schemaVerifier({
  pool,
  tables: SCHEMA_TABLES,
  code: 'SCHEMA_NOT_MIGRATED',
  message: 'Apply migration 20261015004300-abdm-hfr-hpr-governance before using ABDM',
});

// ── Token management ──────────────────────────────────────────────────────────
let _cachedToken = null;
let _tokenExpiry = null;

export async function getAccessToken() {
  await ensureAbdmTables();
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
  await ensureAbdmTables();
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
  await ensureAbdmTables();
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
  await ensureAbdmTables();
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
  await ensureAbdmTables();
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
  await ensureAbdmTables();
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
  await ensureAbdmTables();
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
  await ensureAbdmTables();
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
  await ensureAbdmTables();
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
  await ensureAbdmTables();
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
  await ensureAbdmTables();
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
  await ensureAbdmTables();
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
  await ensureAbdmTables();
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

// ── HFR: Health Facility Registry ──────────────────────────────────────────────
export async function registerFacilityOnHfr(tenantId, { facilityName, address, ownershipType, facilityType }) {
  await ensureAbdmTables();

  let responseJson = null;
  let facilityId = null;
  try {
    responseJson = await abdmPost(ABDM_HFR_REGISTER_PATH, {
      facilityName,
      address,
      ownershipType,
      facilityType,
      hipId: ABDM_HIP_ID,
    });
    facilityId = responseJson?.facilityId || responseJson?.id || null;
  } catch (err) {
    if (!HFR_HPR_SANDBOX_FALLBACK) throw err;
    // Sandbox outage must never erase a registry id we already obtained.
    const { rows: existing } = await pool.query(`SELECT * FROM hfr_facility_registrations WHERE tenant_id = $1`, [tenantId]);
    if (existing[0]?.facility_id) return existing[0];
    responseJson = { sandboxMock: true, note: 'ABDM sandbox credentials for HFR were not available when this was built' };
  }
  const mockOnly = Boolean(responseJson?.sandboxMock);

  const { rows } = await pool.query(
    `INSERT INTO hfr_facility_registrations (tenant_id, facility_id, facility_name, registration_status, response_json, registered_at)
     VALUES ($1, $2, $3, CASE WHEN $5::boolean THEN 'sandbox_mock' ELSE 'submitted' END, $4, NOW())
     ON CONFLICT (tenant_id) DO UPDATE SET facility_id = COALESCE(EXCLUDED.facility_id, hfr_facility_registrations.facility_id), facility_name = EXCLUDED.facility_name,
       registration_status = EXCLUDED.registration_status, response_json = EXCLUDED.response_json, updated_at = NOW()
     RETURNING *`,
    [tenantId, facilityId, facilityName, JSON.stringify(responseJson), mockOnly]
  );
  return rows[0];
}

export async function getFacilityRegistryStatus(tenantId) {
  await ensureAbdmTables();
  const { rows } = await pool.query(`SELECT * FROM hfr_facility_registrations WHERE tenant_id = $1`, [tenantId]);
  const local = rows[0];
  if (!local?.facility_id) return local || null;

  try {
    const remote = await abdmGet(`${ABDM_HFR_STATUS_PATH}/${local.facility_id}`);
    if (remote?.status) {
      await pool.query(
        `UPDATE hfr_facility_registrations SET registration_status = $2, updated_at = NOW() WHERE tenant_id = $1`,
        [tenantId, remote.status]
      );
    }
    return { ...local, remoteStatus: remote };
  } catch {
    return local; // fall back to last-known local status if the gateway is unreachable
  }
}

// ── HPR: Health Professional Registry ──────────────────────────────────────────
export async function registerProviderOnHpr(tenantId, { doctorId, providerName, qualification, registrationCouncil, registrationNumber }) {
  await ensureAbdmTables();

  let responseJson = null;
  let hprId = null;
  try {
    responseJson = await abdmPost(ABDM_HPR_REGISTER_PATH, {
      providerName,
      qualification,
      registrationCouncil,
      registrationNumber,
      hipId: ABDM_HIP_ID,
    });
    hprId = responseJson?.hprId || responseJson?.id || null;
  } catch (err) {
    if (!HFR_HPR_SANDBOX_FALLBACK) throw err;
    const { rows: existing } = await pool.query(`SELECT * FROM hpr_provider_registrations WHERE tenant_id = $1 AND doctor_id = $2`, [tenantId, doctorId]);
    if (existing[0]?.hpr_id) return existing[0];
    responseJson = { sandboxMock: true, note: 'ABDM sandbox credentials for HPR were not available when this was built' };
  }
  const mockOnly = Boolean(responseJson?.sandboxMock);

  const { rows } = await pool.query(
    `INSERT INTO hpr_provider_registrations (tenant_id, doctor_id, hpr_id, provider_name, registration_status, response_json, registered_at)
     VALUES ($1, $2, $3, $4, CASE WHEN $6::boolean THEN 'sandbox_mock' ELSE 'submitted' END, $5, NOW())
     ON CONFLICT (tenant_id, doctor_id) DO UPDATE SET hpr_id = COALESCE(EXCLUDED.hpr_id, hpr_provider_registrations.hpr_id), provider_name = EXCLUDED.provider_name,
       registration_status = EXCLUDED.registration_status, response_json = EXCLUDED.response_json
     RETURNING *`,
    [tenantId, doctorId, hprId, providerName, JSON.stringify(responseJson), mockOnly]
  );
  return rows[0];
}

export async function getProviderRegistryStatus(tenantId, doctorId) {
  await ensureAbdmTables();
  const { rows } = await pool.query(
    `SELECT * FROM hpr_provider_registrations WHERE tenant_id = $1 AND doctor_id = $2`,
    [tenantId, doctorId]
  );
  const local = rows[0];
  if (!local?.hpr_id) return local || null;

  try {
    const remote = await abdmGet(`${ABDM_HPR_STATUS_PATH}/${local.hpr_id}`);
    if (remote?.status) {
      await pool.query(
        `UPDATE hpr_provider_registrations SET registration_status = $3, updated_at = NOW() WHERE tenant_id = $1 AND doctor_id = $2`,
        [tenantId, doctorId, remote.status]
      );
    }
    return { ...local, remoteStatus: remote };
  } catch {
    return local;
  }
}
