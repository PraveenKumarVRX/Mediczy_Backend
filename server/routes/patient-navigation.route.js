import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import { recordNavigationEvent, getPatientTimeline } from '../services/patient-navigation.service.js';
import { resolveTenantId } from '../utils/tenant-identity.js';

const router = express.Router();

// POST /api/v1/navigation/start — document §8 Phase 1: journey kick-off event
router.post('/start', authUser, async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const event = await recordNavigationEvent({
      ...req.body,
      category: req.body.category || 'registration',
      title:    req.body.title    || 'Journey started',
      organizationId,
      performedBy: req.body.performedBy || req.user.id
    });
    res.status(201).json({ success: true, data: event });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/v1/navigation/event
router.post('/event', authUser, async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const event = await recordNavigationEvent({
      ...req.body,
      organizationId,
      performedBy: req.body.performedBy || req.user.id
    });
    res.status(201).json({ success: true, data: event });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/v1/navigation/patient/:patientId/timeline
router.get('/patient/:patientId/timeline', authUser, async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const { limit, offset, since } = req.query;
    const timeline = await getPatientTimeline(
      parseInt(req.params.patientId),
      organizationId,
      {
        limit:  limit  ? parseInt(limit)  : 100,
        offset: offset ? parseInt(offset) : 0,
        since
      }
    );
    res.json({ success: true, data: timeline });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
