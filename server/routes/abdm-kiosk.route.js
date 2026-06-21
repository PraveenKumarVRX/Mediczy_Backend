/**
 * Kiosk-safe ABHA endpoints (device token, no staff JWT) — GAP-KIOSK-004
 */
import express from 'express';
import { connectPostgres } from '../db/postgres.js';
import {
  ensureAbdmTables,
  initiateAbhaRegistration,
  verifyAbhaOtp,
  fetchAbhaProfile,
} from '../services/abdm-client.service.js';
import redisClient from '../config/redis.js';

const router = express.Router();

async function deviceAuth(req, res, next) {
  const token = req.headers['x-device-token'] || req.query.deviceToken;
  req.organizationId = parseInt(process.env.HOSPITAL_DEFAULT_ORG_ID || '1', 10);
  if (!token) return next();
  try {
    const db = await connectPostgres();
    const r = await db.query('SELECT * FROM display_devices WHERE device_token=$1 AND active=true', [token]);
    const device = r.rows[0];
    if (!device) return res.status(401).json({ success: false, message: 'Invalid device token' });
    const config = device.config || {};
    req.organizationId = config.organization_id || req.organizationId;
    next();
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
}

async function kioskRateLimit(req, res, next) {
  const key = `kiosk:abha:${req.ip}:${req.body?.mobile || 'x'}`;
  try {
    const hits = await redisClient.incr(key);
    if (hits === 1) await redisClient.expire(key, 300);
    if (hits > 10) return res.status(429).json({ success: false, message: 'Too many attempts' });
  } catch (_) {}
  next();
}

router.use(deviceAuth);

router.post('/abha/init', kioskRateLimit, async (req, res) => {
  try {
    await ensureAbdmTables();
    const { mobile, name, gender, dateOfBirth } = req.body;
    const result = await initiateAbhaRegistration(req.organizationId, { mobile, name, gender, dateOfBirth });
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.post('/abha/verify', kioskRateLimit, async (req, res) => {
  try {
    const { txnId, otp, mobile } = req.body;
    const result = await verifyAbhaOtp(req.organizationId, { txnId, otp, mobile });
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.get('/abha/profile/:abhaNumber', async (req, res) => {
  try {
    const profile = await fetchAbhaProfile(req.params.abhaNumber, req.organizationId);
    res.json({ success: true, profile });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.post('/abha/scan', async (req, res) => {
  try {
    const { healthId } = req.body;
    if (!healthId) return res.status(400).json({ success: false, message: 'healthId required' });
    const abhaNumber = healthId.replace(/@.*/, '').replace(/\D/g, '').slice(0, 14);
    const profile = await fetchAbhaProfile(abhaNumber, req.organizationId);
    res.json({ success: true, profile, abhaNumber });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

export default router;
