import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import {
  getAvailableBeds, autoAllocateBed, getBedCensus,
  getRealTimeBedMap, getPredictedDischarges, updateBedStatus,
  reserveBed, releaseBedReservation
} from '../services/bed-allocation.service.js';
import { resolveTenantId } from '../utils/tenant-identity.js';

const router = express.Router();

// GET /api/v1/beds/availability
router.get('/availability', authUser, async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const { wardType, wardId, gender } = req.query;
    const beds = await getAvailableBeds(organizationId, {
      wardType,
      wardId: wardId ? parseInt(wardId) : undefined,
      genderRequired: gender
    });
    res.json({ success: true, count: beds.length, data: beds });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/v1/beds/allocate
router.post('/allocate', authUser, async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const bed = await autoAllocateBed(organizationId, req.body);
    if (!bed) return res.status(404).json({ success: false, message: 'No beds available matching criteria' });
    res.json({ success: true, data: bed });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/beds/census
router.get('/census', authUser, async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const census = await getBedCensus(organizationId);
    res.json({ success: true, data: census });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/beds/map
router.get('/map', authUser, async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const wardId = req.query.wardId ? parseInt(req.query.wardId) : undefined;
    const map = await getRealTimeBedMap(organizationId, wardId);
    res.json({ success: true, data: map });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/beds/predict-discharge
router.get('/predict-discharge', authUser, async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const discharges = await getPredictedDischarges(organizationId);
    res.json({ success: true, data: discharges });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/v1/beds/reserve  — B1: atomically reserve a bed
router.post('/reserve', authUser, async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const { bedId, context, ttlMinutes } = req.body;
    if (!bedId) return res.status(400).json({ success: false, message: 'bedId is required' });
    const result = await reserveBed(organizationId, bedId, {
      reservedBy: req.user.email || req.user.id,
      context,
      ttlMinutes
    });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(409).json({ success: false, message: err.message });
  }
});

// DELETE /api/v1/beds/reserve/:token  — release a reservation before admission
router.delete('/reserve/:token', authUser, async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const result = await releaseBedReservation(req.params.token, organizationId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// PUT /api/v1/beds/:id/status
router.put('/:id/status', authUser, async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const result = await updateBedStatus(organizationId, parseInt(req.params.id), req.body.status);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

export default router;
