/**
 * Legacy doctor queue routes (/api/doctor/queue).
 * Reads stay on Hospital OS. Mutations return 410 → use /api/qms or /api/v1/queue.
 */
import express from 'express';
import { authDoctor } from '../middleware/doctor.middleware.js';
import * as hospitalQueue from '../services/hospital-queue.service.js';

const router = express.Router();

const GONE = {
  success: false,
  code: 'LEGACY_QUEUE_GONE',
  message:
    'Legacy /api/doctor/queue mutations are retired. Use /api/qms (portal) or /api/v1/queue (Hospital OS).',
  migrateTo: ['/api/qms', '/api/v1/queue'],
};

// Get doctor's current queue — unified Hospital OS queue (read-only, kept)
router.get('/my-queue', authDoctor, async (req, res) => {
  try {
    const org = req.user?.organization_id || req.user?.tenant_id || req.doctor?.organization_id || 1;
    const entries = await hospitalQueue.listDoctorQueue(req.doctor.id, org);
    const mapped = entries.map((e) => ({
      id: e.id,
      patientId: e.patientId,
      patientName: e.patientName || `Patient #${e.patientId || e.id}`,
      queueType: e.queueType,
      priority: e.priorityScore,
      status: e.status === 'serving' ? 'in_consultation' : e.status,
      estimatedWaitMinutes: e.estimatedWaitMinutes,
      eta: e.checkInAt,
      checkInTime: e.checkInAt,
      chiefComplaint: e.chiefComplaint,
      tokenNumber: e.tokenNumber,
      queueZone: e.queueZone,
    }));
    res.json({ success: true, data: mapped });
  } catch (error) {
    console.error('Fetch queue error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch queue', error: error.message });
  }
});

router.get('/analytics', authDoctor, async (req, res) => {
  try {
    const org = req.user?.organization_id || req.user?.tenant_id || req.doctor?.organization_id || 1;
    const analytics = await hospitalQueue.getHospitalQueueAnalytics(org);
    res.json({
      success: true,
      data: {
        completedToday: analytics?.totals?.completed_today || 0,
        noShowsToday: 0,
        avgWaitTimeMinutes: 0,
        note: 'Org-level Hospital OS stats. Prefer GET /api/qms/analytics for portal metrics.',
      },
    });
  } catch (error) {
    console.error('Fetch analytics error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch analytics', error: error.message });
  }
});

function gone(_req, res) {
  return res.status(410).json(GONE);
}

router.post('/add', authDoctor, gone);
router.patch('/:id/call', authDoctor, gone);
router.patch('/:id/start', authDoctor, gone);
router.patch('/:id/complete', authDoctor, gone);
router.patch('/:id/no-show', authDoctor, gone);

export default router;
