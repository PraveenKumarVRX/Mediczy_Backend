/**
 * Specialty OT Extensions — API routes
 */

import express from 'express';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import specialtyOt from '../services/specialty-ot-extensions.service.js';

const router = express.Router();
const clinicalOnly = [authUser, requireRole(['doctor', 'nurse', 'admin', 'medical_director'])];

// Every read/write is scoped to the caller's organization (never client-supplied).
const orgId = (req) => req.user?.organization_id || req.user?.tenant_id || req.hospitalId || null;

router.post('/notes/:noteId/ophthalmology', ...clinicalOnly, async (req, res) => {
  try {
    const note = await specialtyOt.recordOphthalmologyDetails(Number(req.params.noteId), orgId(req), req.body);
    res.status(201).json({ success: true, data: note });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.post('/notes/:noteId/cardiac', ...clinicalOnly, async (req, res) => {
  try {
    const note = await specialtyOt.recordCardiacSurgeryDetails(Number(req.params.noteId), orgId(req), req.body);
    res.status(201).json({ success: true, data: note });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.post('/notes/:noteId/orthopaedic', ...clinicalOnly, async (req, res) => {
  try {
    const note = await specialtyOt.recordOrthopaedicImplant(Number(req.params.noteId), orgId(req), req.body);
    res.status(201).json({ success: true, data: note });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.post('/bookings/:otBookingId/followup-plan', ...clinicalOnly, async (req, res) => {
  try {
    const { patientId, surgeryDate } = req.body;
    const plan = await specialtyOt.generateFollowUpPlan(Number(req.params.otBookingId), orgId(req), patientId, surgeryDate);
    res.status(201).json({ success: true, data: plan });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.get('/bookings/:otBookingId/followup-plan', ...clinicalOnly, async (req, res) => {
  try {
    const plan = await specialtyOt.listFollowUpPlan(Number(req.params.otBookingId), orgId(req));
    res.json({ success: true, data: plan });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/followup-plan/:id/status', ...clinicalOnly, async (req, res) => {
  try {
    const { status, notes } = req.body;
    if (!status) return res.status(400).json({ success: false, error: 'status is required' });
    const plan = await specialtyOt.markFollowUpStatus(Number(req.params.id), orgId(req), status, notes);
    res.json({ success: true, data: plan });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/followup-plan/due-soon', ...clinicalOnly, async (req, res) => {
  try {
    const withinDays = Number(req.query.withinDays) || 7;
    const list = await specialtyOt.listDueSoon(withinDays, orgId(req));
    res.json({ success: true, data: list });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
