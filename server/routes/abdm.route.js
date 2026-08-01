/**
 * ABDM / ABHA API Routes
 *
 * POST /api/abdm/abha/register/init       Initiate ABHA registration (send OTP)
 * POST /api/abdm/abha/register/verify     Verify OTP and complete ABHA linking
 * GET  /api/abdm/abha/aadhaar-enrol/status Aadhaar→ABHA create availability
 * POST /api/abdm/abha/aadhaar-enrol/init  Send Aadhaar OTP to create ABHA
 * POST /api/abdm/abha/aadhaar-enrol/verify Verify OTP and create ABHA
 * GET  /api/abdm/abha/:abhaNumber/profile ABHA health profile
 * GET  /api/abdm/abha/registrations       List ABHA registrations for tenant
 *
 * POST /api/abdm/consent/request          Request PHR consent from patient
 * GET  /api/abdm/consent                  List consent requests for tenant
 * POST /api/abdm/consent/:id/revoke       Revoke a granted consent
 *
 * POST /api/abdm/phi/request              Request PHI data (requires granted consent)
 * GET  /api/abdm/phi/requests             List PHI requests
 *
 * POST /api/abdm/care-context/link        Link a care context to an ABHA number
 *
 * POST /api/abdm/callback/consent         Consent status callback from NHA gateway
 * POST /api/abdm/callback/phi             PHI data push callback from NHA gateway
 *
 * Standards:
 *   NHA ABDM v3 API, DPDP §6 (consent), FHIR R4 (PHI)
 */

import { Router } from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import redisClient from '../config/redis.js';
import {
  ensureAbdmTables,
  getAccessToken,
  initiateAbhaRegistration,
  verifyAbhaOtp,
  fetchAbhaProfile,
  listAbhaRegistrations,
  requestConsent,
  listConsents,
  revokeConsent,
  handleConsentCallback,
  requestPhi,
  handlePhiCallback,
  listPhiRequests,
  linkCareContext,
} from '../services/abdm-client.service.js';
import {
  initiateAadhaarAbhaEnrol,
  verifyAadhaarAbhaEnrol,
  isAadhaarAbhaEnrolMockMode,
} from '../services/abdm-aadhaar-enrol.service.js';

const router = Router();

ensureAbdmTables().catch(e => console.warn('[ABDM] Table init warning:', e.message));

const tenantId = (req) => req.user?.tenant_id || req.user?.organization_id || req.user?.id;

// ── NHA gateway callback endpoints (no auth — signed by NHA) ─────────────────
// These must be registered before authUser middleware

router.post('/callback/consent', async (req, res) => {
  try {
    const result = await handleConsentCallback(req.body);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[ABDM] Consent callback error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/callback/phi', async (req, res) => {
  try {
    const result = await handlePhiCallback(req.body);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[ABDM] PHI callback error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── All other routes require auth ─────────────────────────────────────────────
router.use(authUser);

// ── Gateway health / token test ───────────────────────────────────────────────
router.get('/status', async (req, res) => {
  try {
    const token = await getAccessToken();
    res.json({
      success: true,
      connected: true,
      sandbox: !process.env.ABDM_BASE_URL || process.env.ABDM_BASE_URL.includes('dev.abdm'),
      hipId: process.env.ABDM_HIP_ID || 'MEDICZY_HMIS_001',
      tokenPresent: !!token,
    });
  } catch (err) {
    res.status(503).json({ success: false, connected: false, message: err.message });
  }
});

// ── ABHA Registration (mobile OTP login/link — legacy path) ───────────────────
router.post('/abha/register/init', async (req, res) => {
  try {
    const { mobile, name, gender, dateOfBirth, patientId } = req.body;
    if (!mobile) return res.status(400).json({ success: false, message: 'mobile is required' });
    const result = await initiateAbhaRegistration(tenantId(req), { mobile, name, gender, dateOfBirth, patientId });
    res.status(202).json({ success: true, ...result, message: 'OTP sent to mobile' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ITEM-15: Redis-backed brute-force guard on OTP verify (5 attempts per txn per 30 min)
async function abhaOtpRateLimit(req, res, next) {
  try {
    const txnId  = req.body?.txnId || 'unknown';
    const userId = req.user?.id || 'anon';
    const key    = `abdm:otp:${userId}:${txnId}`;
    const count  = await redisClient.incr(key);
    if (count === 1) await redisClient.expire(key, 1800); // 30-minute window
    if (count > 5) {
      return res.status(429).json({
        success: false,
        message: 'Too many OTP attempts. Please wait 30 minutes before retrying.',
        retryAfter: 1800,
      });
    }
    next();
  } catch {
    next(); // Redis unavailable — fail open so ABDM flow isn't broken
  }
}

router.post('/abha/register/verify', abhaOtpRateLimit, async (req, res) => {
  try {
    const { txnId, otp, mobile } = req.body;
    if (!txnId || !otp) return res.status(400).json({ success: false, message: 'txnId and otp are required' });
    const result = await verifyAbhaOtp(tenantId(req), { txnId, otp, mobile });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Aadhaar OTP → create new ABHA (ABDM enrollment) ───────────────────────────
router.get('/abha/aadhaar-enrol/status', async (_req, res) => {
  try {
    res.json({
      success: true,
      available: true,
      mock: isAadhaarAbhaEnrolMockMode(),
      message: isAadhaarAbhaEnrolMockMode()
        ? 'Sandbox ABHA enrol (OTP 123456) — configure ABDM_CLIENT_ID for live NHA'
        : 'Aadhaar OTP ABHA creation via ABDM',
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/abha/aadhaar-enrol/init', async (req, res) => {
  try {
    if (!req.body?.consentAccepted) {
      return res.status(400).json({
        success: false,
        message: 'Consent is required to create ABHA using Aadhaar OTP',
      });
    }
    const result = await initiateAadhaarAbhaEnrol({
      aadhaarNumber: req.body?.aadhaarNumber,
      mobile: req.body?.mobile,
      tenantId: tenantId(req),
      name: req.body?.name || null,
    });
    res.status(202).json({ success: true, ...result });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, message: err.message });
  }
});

router.post('/abha/aadhaar-enrol/verify', abhaOtpRateLimit, async (req, res) => {
  try {
    const result = await verifyAadhaarAbhaEnrol({
      txnId: req.body?.txnId,
      otp: req.body?.otp,
      mobile: req.body?.mobile,
      firstName: req.body?.firstName,
      lastName: req.body?.lastName,
      gender: req.body?.gender,
      dateOfBirth: req.body?.dateOfBirth,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, message: err.message });
  }
});

router.get('/abha/registrations', async (req, res) => {
  try {
    const { patientId } = req.query;
    const registrations = await listAbhaRegistrations(tenantId(req), patientId ? Number(patientId) : null);
    res.json({ success: true, registrations, total: registrations.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/abha/:abhaNumber/profile', async (req, res) => {
  try {
    const profile = await fetchAbhaProfile(req.params.abhaNumber, tenantId(req));
    res.json({ success: true, profile });
  } catch (err) {
    const code = err.message.includes('not found') ? 404 : 500;
    res.status(code).json({ success: false, message: err.message });
  }
});

// ── Consent management ────────────────────────────────────────────────────────
router.post('/consent/request', async (req, res) => {
  try {
    const { abhaNumber, purposeCode, hiTypes, dateFrom, dateTo, expiryDays, patientId } = req.body;
    if (!abhaNumber) return res.status(400).json({ success: false, message: 'abhaNumber is required' });
    if (!hiTypes?.length) return res.status(400).json({ success: false, message: 'hiTypes array is required' });
    const result = await requestConsent(tenantId(req), { abhaNumber, patientId, purposeCode, hiTypes, dateFrom, dateTo, expiryDays });
    res.status(201).json({ success: true, consent: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/consent', async (req, res) => {
  try {
    const { patientId, status, abhaNumber } = req.query;
    const consents = await listConsents(tenantId(req), { patientId, status, abhaNumber });
    res.json({ success: true, consents, total: consents.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/consent/:consentId/revoke', async (req, res) => {
  try {
    const result = await revokeConsent(tenantId(req), req.params.consentId);
    res.json({ success: true, ...result });
  } catch (err) {
    const code = err.message.includes('not found') ? 404 : 500;
    res.status(code).json({ success: false, message: err.message });
  }
});

// ── PHI data ──────────────────────────────────────────────────────────────────
router.post('/phi/request', async (req, res) => {
  try {
    const { consentId } = req.body;
    if (!consentId) return res.status(400).json({ success: false, message: 'consentId is required' });
    const result = await requestPhi(tenantId(req), consentId);
    res.status(202).json({ success: true, phiRequest: result, message: 'PHI data request sent to gateway' });
  } catch (err) {
    const code = err.message.includes('No granted consent') ? 404 : 500;
    res.status(code).json({ success: false, message: err.message });
  }
});

router.get('/phi/requests', async (req, res) => {
  try {
    const { consentId } = req.query;
    const requests = await listPhiRequests(tenantId(req), consentId || null);
    res.json({ success: true, requests, total: requests.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Care context linking ───────────────────────────────────────────────────────
router.post('/care-context/link', async (req, res) => {
  try {
    const { abhaNumber, referenceNumber, display, hiTypes } = req.body;
    if (!abhaNumber || !referenceNumber) {
      return res.status(400).json({ success: false, message: 'abhaNumber and referenceNumber are required' });
    }
    const result = await linkCareContext(abhaNumber, { referenceNumber, display, hiTypes });
    res.status(201).json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
