/**
 * Housekeeping — API routes
 * Low-stakes operational module (task tracking) — no clinical/financial
 * data, so all endpoints share one role gate rather than split read/write.
 */

import express from 'express';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import { requireModule } from '../middleware/moduleEntitlement.middleware.js';
import housekeepingService from '../services/housekeeping.service.js';

const router = express.Router();

const staffAccess = [authUser, requireRole(['admin', 'hospital', 'hospital_admin', 'nurse', 'quality', 'housekeeping']), requireModule('housekeeping')];

function orgId(req) {
  return req.user?.organization_id || req.user?.tenant_id || req.hospitalId || null;
}

router.post('/tasks', ...staffAccess, async (req, res) => {
  try {
    const org = orgId(req);
    if (!org) return res.status(400).json({ success: false, message: 'Organization context missing' });
    const { location, ward, roomNumber, taskType, priority, notes } = req.body;
    if (!location || !taskType) {
      return res.status(400).json({ success: false, message: 'location and taskType are required' });
    }
    const task = await housekeepingService.createTask({
      organizationId: org, location, ward, roomNumber, taskType, priority, createdBy: req.user?.id, notes,
    });
    res.status(201).json({ success: true, data: task });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create task', error: error.message });
  }
});

router.get('/tasks', ...staffAccess, async (req, res) => {
  try {
    const org = orgId(req);
    if (!org) return res.status(400).json({ success: false, message: 'Organization context missing' });
    const { status, ward } = req.query;
    const tasks = await housekeepingService.listTasks(org, { status: status || null, ward: ward || null });
    res.json({ success: true, data: tasks });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to list tasks', error: error.message });
  }
});

router.get('/stats', ...staffAccess, async (req, res) => {
  try {
    const org = orgId(req);
    if (!org) return res.status(400).json({ success: false, message: 'Organization context missing' });
    const stats = await housekeepingService.getStats(org);
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load stats', error: error.message });
  }
});

const toId = (v) => (/^\d+$/.test(String(v ?? '')) && Number(v) <= 2147483647 ? Number(v) : null);

// Shared prelude for the :id routes: org context + numeric id.
function taskContext(req, res) {
  const org = orgId(req);
  if (!org) { res.status(400).json({ success: false, message: 'Organization context missing' }); return null; }
  const id = toId(req.params.id);
  if (!id) { res.status(400).json({ success: false, message: 'Invalid task id' }); return null; }
  return { org, id };
}
const notFound = (res) => res.status(404).json({ success: false, message: 'Task not found' });

router.patch('/tasks/:id/assign', ...staffAccess, async (req, res) => {
  try {
    const ctx = taskContext(req, res);
    if (!ctx) return;
    const { assignedTo } = req.body;
    if (!assignedTo) return res.status(400).json({ success: false, message: 'assignedTo is required' });
    const task = await housekeepingService.assignTask(ctx.org, ctx.id, assignedTo);
    if (!task) return notFound(res);
    res.json({ success: true, data: task });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to assign task', error: error.message });
  }
});

router.patch('/tasks/:id/start', ...staffAccess, async (req, res) => {
  try {
    const ctx = taskContext(req, res);
    if (!ctx) return;
    const task = await housekeepingService.startTask(ctx.org, ctx.id);
    if (!task) return notFound(res);
    res.json({ success: true, data: task });
  } catch (error) {
    if (error.message === 'Task is not pending') {
      return res.status(400).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: 'Failed to start task', error: error.message });
  }
});

router.patch('/tasks/:id/complete', ...staffAccess, async (req, res) => {
  try {
    const ctx = taskContext(req, res);
    if (!ctx) return;
    const { notes } = req.body;
    const task = await housekeepingService.completeTask(ctx.org, ctx.id, { notes });
    if (!task) return notFound(res);
    res.json({ success: true, data: task });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to complete task', error: error.message });
  }
});

router.patch('/tasks/:id/verify', ...staffAccess, async (req, res) => {
  try {
    const ctx = taskContext(req, res);
    if (!ctx) return;
    const task = await housekeepingService.verifyTask(ctx.org, ctx.id, req.user?.id);
    if (!task) return notFound(res);
    res.json({ success: true, data: task });
  } catch (error) {
    if (error.message === 'Task must be completed before verification') {
      return res.status(400).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: 'Failed to verify task', error: error.message });
  }
});

export default router;
