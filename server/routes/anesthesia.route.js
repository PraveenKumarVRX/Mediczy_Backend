import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import {
  createAssessment, getAssessmentByBooking,
  createRecord, getRecordByBooking, updateRecord
} from '../services/anesthesia.service.js';
import { enforceAnesthesiaConsent } from '../services/consent-enforcement.service.js';

const router = express.Router();

// POST /api/v1/anesthesia/assessment
router.post('/assessment', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    const result = await createAssessment({ ...req.body, organizationId });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/v1/anesthesia/assessment/booking/:otBookingId
router.get('/assessment/booking/:otBookingId', authUser, async (req, res) => {
  try {
    const result = await getAssessmentByBooking(parseInt(req.params.otBookingId));
    if (!result) return res.status(404).json({ success: false, message: 'Assessment not found' });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/v1/anesthesia/record — B7: enforces anesthesia consent before creating intra-op record
router.post('/record', authUser, async (req, res) => {
  try {
    const organizationId = req.user.organization_id || req.user.tenant_id || req.user.id;
    await enforceAnesthesiaConsent({
      organizationId,
      patientId: req.body.patientId,
      isEmergency: req.body.isEmergency || false,
      override: req.body.override || null
    });
    const result = await createRecord({ ...req.body, organizationId });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    if (err.consentBlocked) return res.status(403).json({ success: false, message: err.message, consentBlocked: true, consentType: err.consentType });
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/v1/anesthesia/record/booking/:otBookingId
router.get('/record/booking/:otBookingId', authUser, async (req, res) => {
  try {
    const result = await getRecordByBooking(parseInt(req.params.otBookingId));
    if (!result) return res.status(404).json({ success: false, message: 'Record not found' });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/v1/anesthesia/record/:recordId
router.patch('/record/:recordId', authUser, async (req, res) => {
  try {
    const result = await updateRecord(parseInt(req.params.recordId), req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

export default router;
