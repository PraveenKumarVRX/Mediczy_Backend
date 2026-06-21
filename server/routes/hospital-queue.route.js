import express from 'express';
import pool from '../db/pgPool.js';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import { authDoctor } from '../middleware/doctor.middleware.js';
import * as queue from '../services/hospital-queue.service.js';
import { pushQueueEvent } from '../services/display-sse-broker.service.js';

const router = express.Router();

async function ensureQueueTables() {
  await queue.ensureQueueTables();
}

function orgFromReq(req) {
  return req.user?.organization_id || req.user?.tenant_id || req.body?.organizationId || req.query?.organizationId;
}

// ─── Public / kiosk / display ───────────────────────────────────────────────

router.get('/board', async (req, res) => {
  try {
    const board = await queue.getBoardSnapshot({
      organizationId: req.query.organizationId,
      queueZone: req.query.zone || req.query.queueZone,
      department: req.query.department,
      doctorId: req.query.doctorId ? parseInt(req.query.doctorId, 10) : undefined,
      counterId: req.query.counter,
    });
    res.json({ success: true, ...board, current: board.current || { token: '—', counter: '—', doctor: '' } });
  } catch (e) {
    console.error('[queue] board error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

router.post('/check-in', async (req, res) => {
  try {
    const entry = await queue.checkIn({
      organizationId: req.body.organizationId,
      department: req.body.department || 'opd',
      queueZone: req.body.queueZone || req.body.zone || 'opd-waiting',
      patientId: req.body.patientId,
      patientName: req.body.patientName,
      appointmentId: req.body.appointmentId,
      doctorId: req.body.doctorId,
      doctorName: req.body.doctorName,
      queueType: req.body.queueType || 'walk_in',
      triageLevel: req.body.triageLevel,
      chiefComplaint: req.body.chiefComplaint,
      counterId: req.body.counterId,
      consentVersion: req.body.consentVersion,
      metadata: req.body.metadata,
    });
    res.status(201).json({ success: true, entry, token: entry });
  } catch (e) {
    console.error('[queue] check-in error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─── Staff / doctor (authenticated) ───────────────────────────────────────────

router.get('/my', authDoctor, async (req, res) => {
  try {
    const entries = await queue.listDoctorQueue(req.doctor.id, orgFromReq(req));
    const mapped = entries.map((e) => ({
      ...e,
      queueType: e.queueType?.replace('_', '-') || e.queueType,
      status: e.status === 'serving' ? 'in_consultation' : e.status,
      estimatedWaitMinutes: e.estimatedWaitMinutes,
      eta: e.checkInAt,
      arrivedAt: e.checkInAt,
      patientName: e.patientName || `Patient #${e.patientId || e.id}`,
    }));
    res.json({ success: true, data: mapped });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.patch('/:id/call', authDoctor, async (req, res) => {
  try {
    const entry = await queue.callNext({
      doctorId: req.doctor.id,
      organizationId: orgFromReq(req),
      entryId: parseInt(req.params.id, 10),
    });
    if (!entry) return res.status(404).json({ success: false, message: 'No patient waiting' });
    res.json({ success: true, data: { ...entry, status: 'called' } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.post('/call-next', authDoctor, async (req, res) => {
  try {
    const entry = await queue.callNext({ doctorId: req.doctor.id, organizationId: orgFromReq(req) });
    if (!entry) return res.status(404).json({ success: false, message: 'No patient waiting' });
    res.json({ success: true, data: entry });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.patch('/:id/start', authDoctor, async (req, res) => {
  try {
    const entry = await queue.startServing(parseInt(req.params.id, 10), orgFromReq(req));
    if (!entry) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: { ...entry, status: 'in_consultation' } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.patch('/:id/complete', authDoctor, async (req, res) => {
  try {
    const entry = await queue.completeEntry(parseInt(req.params.id, 10), orgFromReq(req));
    if (!entry) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: entry });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.patch('/:id/no-show', authDoctor, async (req, res) => {
  try {
    const entry = await queue.markNoShow(parseInt(req.params.id, 10), orgFromReq(req), req.body.reason);
    if (!entry) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: entry });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.patch('/:id/priority', authUser, requireRole('admin', 'hospital_admin', 'receptionist', 'doctor'), async (req, res) => {
  try {
    const entry = await queue.reorderEntry(
      parseInt(req.params.id, 10),
      orgFromReq(req),
      parseInt(req.body.priorityScore, 10)
    );
    if (!entry) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: entry });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Front-desk console: all active entries for org
router.get('/console', authUser, requireRole('admin', 'hospital_admin', 'receptionist', 'doctor'), async (req, res) => {
  try {
    const board = await queue.getBoardSnapshot({
      organizationId: orgFromReq(req),
      queueZone: req.query.zone,
      department: req.query.department,
    });
    res.json({ success: true, ...board });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.patch('/:id/call-staff', authUser, requireRole('admin', 'hospital_admin', 'receptionist'), async (req, res) => {
  try {
    await ensureQueueTables();
    const org = orgFromReq(req) || 1;
    const { rows } = await pool.query(
      `UPDATE hospital_queue_entries SET status = 'called', called_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [parseInt(req.params.id, 10), org]
    );
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Not found' });
    const { pushQueueEvent } = await import('../services/display-sse-broker.service.js');
    const entry = rows[0];
    const board = await queue.getBoardSnapshot({ organizationId: org, queueZone: entry.queue_zone });
    pushQueueEvent(entry.queue_zone, 'queue_token_called', { entry, board });
    res.json({ success: true, data: entry });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.get('/analytics', authDoctor, async (req, res) => {
  try {
    const org = orgFromReq(req);
    const { rows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_today,
         COUNT(*) FILTER (WHERE status = 'no_show')::int AS no_shows_today,
         COALESCE(AVG(actual_wait_minutes) FILTER (WHERE status = 'completed'), 0)::float AS avg_wait
       FROM hospital_queue_entries
       WHERE doctor_id = $1 AND organization_id = $2 AND check_in_at::date = CURRENT_DATE`,
      [req.doctor.id, org || 1]
    );
    const r = rows[0] || {};
    res.json({
      success: true,
      data: {
        completedToday: r.completed_today || 0,
        noShowsToday: r.no_shows_today || 0,
        avgWaitTimeMinutes: Math.round(r.avg_wait || 0),
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

export default router;
