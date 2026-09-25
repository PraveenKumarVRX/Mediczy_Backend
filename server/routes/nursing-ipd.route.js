import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import {
  createNursingAssessment, getAdmissionAssessments,
  createNursingTask, getNursingTaskBoard, completeNursingTask, autoGenerateAdmissionTasks
} from '../services/nursing-ipd.service.js';
import { saveVitals } from '../services/vitals-ews.service.js';
import { resolveTenantId } from '../utils/tenant-identity.js';

const router = express.Router();

// POST /api/v1/nursing/assessment
router.post('/assessment', authUser, async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const result = await createNursingAssessment({ ...req.body, organizationId });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/v1/nursing/assessment/:admissionId
router.get('/assessment/:admissionId', authUser, async (req, res) => {
  try {
    const data = await getAdmissionAssessments(parseInt(req.params.admissionId));
    if (!data) return res.status(404).json({ success: false, message: 'No assessment found' });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/v1/nursing/tasks
router.post('/tasks', authUser, async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const task = await createNursingTask({ ...req.body, organizationId });
    res.status(201).json({ success: true, data: task });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/v1/nursing/tasks
router.get('/tasks', authUser, async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const { wardId, assignedTo, status, windowHours } = req.query;
    const tasks = await getNursingTaskBoard(organizationId, {
      wardId:      wardId      ? parseInt(wardId) : undefined,
      assignedTo:  assignedTo  || undefined,
      status:      status      || undefined,
      windowHours: windowHours ? parseInt(windowHours) : 4
    });
    res.json({ success: true, data: tasks });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/v1/nursing/tasks/:id/complete
router.put('/tasks/:id/complete', authUser, async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const result = await completeNursingTask(parseInt(req.params.id), organizationId, {
      completedBy: req.user.id,
      notes: req.body.notes
    });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/v1/nursing/vitals — document §8 Phase 2
router.post('/vitals', authUser, async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const record = await saveVitals({ ...req.body, organizationId, recordedBy: req.user.id });
    res.status(201).json({ success: true, data: record });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/v1/nursing/tasks/auto-generate
router.post('/tasks/auto-generate', authUser, async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const { admissionId, patientId, wardId } = req.body;
    const tasks = await autoGenerateAdmissionTasks(admissionId, organizationId, { patientId, wardId });
    res.status(201).json({ success: true, data: tasks });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

export default router;
