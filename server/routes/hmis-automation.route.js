/**
 * HMIS Automation Engine Routes
 * POST /api/v1/automation/run/:type  — trigger specific automation
 * POST /api/v1/automation/run-all    — run all automations
 * GET  /api/v1/automation/queue      — view pending jobs
 * GET  /api/v1/automation/history    — view completed/failed jobs
 * GET  /api/v1/automation/stats      — aggregate stats
 * POST /api/v1/automation/schedule   — schedule a custom job
 */

import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import {
  runAllAutomations, runClinicalEscalation, runDischargeReminders,
  runPreAuthBundling, runFollowUpScheduler, runEMARComplianceCheck,
  getJobQueue, getJobHistory, getAutomationStats, scheduleJob
} from '../services/hmis-automation.service.js';
import { resolveTenantId } from '../utils/tenant-identity.js';

const router = express.Router();

const orgId = req => resolveTenantId(req.user);

// POST /api/v1/automation/run-all
router.post('/run-all', authUser, async (req, res) => {
  try {
    const result = await runAllAutomations(orgId(req));
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/v1/automation/run/:type
router.post('/run/:type', authUser, async (req, res) => {
  const runners = {
    'clinical-escalation': runClinicalEscalation,
    'discharge-reminders': runDischargeReminders,
    'preauth-bundling':    runPreAuthBundling,
    'followup-scheduler':  runFollowUpScheduler,
    'emar-compliance':     runEMARComplianceCheck,
  };
  const runner = runners[req.params.type];
  if (!runner) return res.status(400).json({ success: false, message: `Unknown automation type. Valid: ${Object.keys(runners).join(', ')}` });
  try {
    const result = await runner(orgId(req));
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/automation/queue
router.get('/queue', authUser, async (req, res) => {
  try {
    const { status = 'pending', limit = 50 } = req.query;
    const jobs = await getJobQueue(orgId(req), { status, limit: parseInt(limit) });
    res.json({ success: true, count: jobs.length, data: jobs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/automation/history
router.get('/history', authUser, async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const history = await getJobHistory(orgId(req), { limit: parseInt(limit) });
    res.json({ success: true, count: history.length, data: history });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/automation/stats
router.get('/stats', authUser, async (req, res) => {
  try {
    const stats = await getAutomationStats(orgId(req));
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/v1/automation/schedule
router.post('/schedule', authUser, async (req, res) => {
  try {
    const { jobType, referenceId, payload, runAt, maxRetries } = req.body;
    if (!jobType) return res.status(400).json({ success: false, message: 'jobType is required' });
    const jobId = await scheduleJob({
      jobType, referenceId, organizationId: orgId(req),
      payload, runAt: runAt ? new Date(runAt) : new Date(), maxRetries
    });
    res.status(201).json({ success: true, data: { jobId } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
