/**
 * Unified Queue Management System API — hospital, clinic, lab.
 *
 * Mount: /api/qms
 *
 * POST   /aadhaar/parse     — extract demographics from Aadhaar Secure QR (raw bytes)
 * GET    /context           — portal defaults (zone, department, label)
 * GET    /console           — today's active board for this tenant
 * POST   /check-in          — issue token (walk-in / Aadhaar-assisted)
 * PATCH  /:id/call          — reception call
 * PATCH  /:id/start         — mark serving
 * PATCH  /:id/complete      — complete
 * PATCH  /:id/no-show       — no-show
 * GET    /analytics         — today stats for tenant
 */
import express from 'express';
import pool from '../db/pgPool.js';
import { authPortalQms } from '../middleware/authPortalQms.middleware.js';
import { parseAadhaarQr } from '../services/aadhaar-qr.service.js';
import * as queue from '../services/hospital-queue.service.js';
import { pushQueueEvent } from '../services/display-sse-broker.service.js';
import { listOpdQueues, queueZoneForDoctor } from '../services/qms-opd.service.js';
import * as queueNotify from '../services/queue-notify.service.js';

const router = express.Router();

router.use(authPortalQms);

function resolveZone(req) {
  if (req.query.doctorId || req.body?.doctorId) {
    return queueZoneForDoctor({
      doctorId: req.query.doctorId || req.body?.doctorId,
      specialization: req.query.specialization || req.body?.specialization,
      queueZone: req.query.zone || req.query.queueZone || req.body?.queueZone,
    });
  }
  return String(req.query.zone || req.query.queueZone || req.body?.queueZone || req.body?.zone || req.qms.queueZone);
}

function resolveDepartment(req) {
  return String(req.query.department || req.body?.department || req.qms.department);
}

function resolveDoctorId(req) {
  const raw = req.query.doctorId || req.body?.doctorId;
  if (raw == null || raw === '' || raw === 'all') return undefined;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}

router.get('/context', (req, res) => {
  res.json({
    success: true,
    context: {
      portal: req.qms.portal,
      organizationId: req.qms.organizationId,
      department: req.qms.department,
      queueZone: req.qms.queueZone,
      label: req.qms.label,
      localAetNote: 'C-STORE / display boards use the same queue zones as QMS.',
      aadhaar: {
        supported: true,
        fields: [
          'firstName', 'lastName', 'fullName', 'dateOfBirth', 'gender',
          'careOf', 'address', 'pincode', 'state', 'aadhaarLast4',
        ],
        note: 'Only last 4 digits of Aadhaar are returned. Full UID is never stored.',
      },
    },
  });
});

/**
 * Parse Aadhaar Secure QR / legacy XML from scanner raw bytes (base64).
 * Staff-authenticated — preferred over the public kiosk parse for portal QMS.
 */
router.post('/aadhaar/parse', async (req, res) => {
  try {
    const { qrBytesBase64 } = req.body || {};
    if (!qrBytesBase64 || typeof qrBytesBase64 !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'qrBytesBase64 is required (raw QR bytes from camera, base64-encoded)',
      });
    }
    let rawBytes;
    try {
      rawBytes = Buffer.from(qrBytesBase64, 'base64');
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid base64 payload' });
    }
    if (!rawBytes.length) {
      return res.status(400).json({ success: false, message: 'Empty QR payload' });
    }

    const parsed = parseAadhaarQr(rawBytes);
    if (!parsed?.success || !parsed.fields) {
      return res.status(422).json({
        success: false,
        message: parsed?.message
          || 'Could not parse Aadhaar QR. Ensure you scanned the QR on the back of the card (raw bytes, not text).',
      });
    }

    res.json({
      success: true,
      fields: parsed.fields,
      source: parsed.source,
      portal: req.qms.portal,
    });
  } catch (e) {
    console.error('[qms] aadhaar parse error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

/** Multi-OPD / multi-doctor board index for hospital QMS */
router.get('/opds', async (req, res) => {
  try {
    if (req.qms.portal === 'lab') {
      return res.json({ success: true, opds: [], note: 'Lab uses department=lab, not OPD rooms' });
    }
    const data = await listOpdQueues(req.qms.organizationId, { portal: req.qms.portal });
    res.json({ success: true, ...data });
  } catch (e) {
    console.error('[qms] opds error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

router.get('/console', async (req, res) => {
  try {
    const organizationId = req.qms.organizationId;
    const doctorId = resolveDoctorId(req);
    const department = resolveDepartment(req);
    const queueZone = doctorId
      ? queueZoneForDoctor({ doctorId, specialization: req.query.specialization })
      : (req.query.zone || req.query.queueZone || req.qms.queueZone);
    const board = await queue.getBoardSnapshot({
      organizationId,
      queueZone: doctorId ? queueZone : (req.query.zone || req.query.queueZone || undefined),
      department,
      doctorId,
    });
    res.json({
      success: true,
      portal: req.qms.portal,
      organizationId,
      queueZone: queueZone || board.entries?.[0]?.queueZone || req.qms.queueZone,
      department,
      doctorId: doctorId || null,
      ...board,
    });
  } catch (e) {
    console.error('[qms] console error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

router.get('/analytics', async (req, res) => {
  try {
    const org = req.qms.organizationId;
    const department = resolveDepartment(req);
    const { rows } = await pool.query(
      `SELECT
         COUNT(*)::int AS total_today,
         COUNT(*) FILTER (WHERE status = 'waiting')::int AS waiting,
         COUNT(*) FILTER (WHERE status = 'called')::int AS called,
         COUNT(*) FILTER (WHERE status = 'serving')::int AS serving,
         COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_today,
         COUNT(*) FILTER (WHERE status = 'no_show')::int AS no_shows_today,
         COALESCE(AVG(actual_wait_minutes) FILTER (WHERE status = 'completed'), 0)::float AS avg_wait
       FROM hospital_queue_entries
       WHERE organization_id = $1
         AND department = $2
         AND check_in_at::date = CURRENT_DATE`,
      [org, department],
    );
    const r = rows[0] || {};
    res.json({
      success: true,
      analytics: {
        totalToday: r.total_today || 0,
        waiting: r.waiting || 0,
        called: r.called || 0,
        serving: r.serving || 0,
        completedToday: r.completed_today || 0,
        noShowsToday: r.no_shows_today || 0,
        avgWaitMinutes: Math.round(r.avg_wait || 0),
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.post('/check-in', async (req, res) => {
  try {
    const body = req.body || {};
    const first = String(body.firstName || '').trim();
    const last = String(body.lastName || '').trim();
    const patientName = String(body.patientName || `${first} ${last}`.trim()).trim();
    if (!patientName) {
      return res.status(400).json({ success: false, message: 'patientName (or firstName/lastName) is required' });
    }

    const aadhaarLast4 = body.aadhaarLast4 ? String(body.aadhaarLast4).replace(/\D/g, '').slice(-4) : null;
    const metadata = {
      ...(body.metadata && typeof body.metadata === 'object' ? body.metadata : {}),
      source: body.source || 'portal-qms',
      portal: req.qms.portal,
      checkedInBy: req.qms.actor?.id || null,
      checkedInByRole: req.qms.actor?.role || null,
      aadhaarLast4: aadhaarLast4 || undefined,
      dateOfBirth: body.dateOfBirth || undefined,
      gender: body.gender || undefined,
      address: body.address || undefined,
      pincode: body.pincode || undefined,
      state: body.state || undefined,
      careOf: body.careOf || undefined,
      phone: body.phone || undefined,
      notifyPhone: body.notifyPhone || body.phone || undefined,
      notifyOptIn: body.notifyOptIn === true || body.notifyOptIn === 'true',
    };

    const doctorId = body.doctorId ? parseInt(body.doctorId, 10) : undefined;
    const zone = queueZoneForDoctor({
      doctorId,
      specialization: body.specialization,
      queueZone: body.queueZone || body.zone,
    });

    const entry = await queue.checkIn({
      organizationId: req.qms.organizationId,
      department: resolveDepartment(req),
      queueZone: zone,
      patientId: body.patientId,
      patientName,
      appointmentId: body.appointmentId,
      doctorId,
      doctorName: body.doctorName,
      queueType: body.queueType || 'walk_in',
      triageLevel: body.triageLevel,
      chiefComplaint: body.chiefComplaint || body.notes,
      counterId: body.counterId || body.doctorName,
      consentVersion: body.consentVersion || 'qms-portal-v1',
      metadata: {
        ...metadata,
        specialization: body.specialization || metadata.specialization,
        notifyOptIn: (body.notifyOptIn === true || body.notifyOptIn === 'true') && !!(body.phone || body.notifyPhone),
        notifyPhone: body.notifyPhone || body.phone || undefined,
      },
    });

    res.status(201).json({
      success: true,
      entry,
      token: entry.tokenNumber,
      printSlip: {
        tokenNumber: entry.tokenNumber,
        patientName: entry.patientName,
        doctorName: entry.doctorName,
        counterId: entry.counterId,
        queueZone: entry.queueZone,
        estimatedWaitMinutes: entry.estimatedWaitMinutes,
        specialization: body.specialization || null,
      },
      whatsapp: Boolean(body.notifyPhone || body.phone),
      message: `Token ${entry.tokenNumber} issued`,
    });
  } catch (e) {
    console.error('[qms] check-in error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

async function staffTransition(req, res, status) {
  try {
    await queue.ensureQueueTables();
    const org = req.qms.organizationId;
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ success: false, message: 'Invalid entry id' });
    }

    let entry = null;
    if (status === 'called') {
      const { rows } = await pool.query(
        `UPDATE hospital_queue_entries
         SET status = 'called', called_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND organization_id = $2 AND status IN ('waiting','called')
         RETURNING id`,
        [id, org],
      );
      if (rows[0]) {
        entry = await queue.getEntryById(id, org);
        const board = await queue.getBoardSnapshot({ organizationId: org, queueZone: entry.queueZone });
        pushQueueEvent(entry.queueZone, 'queue_token_called', { entry, board });
        const phone = entry.metadata?.notifyPhone;
        if (phone) {
          queueNotify.notifyTokenCalled(entry, phone).catch(() => {});
        }
      }
    } else if (status === 'serving') {
      entry = await queue.startServing(id, org);
      if (entry) {
        const board = await queue.getBoardSnapshot({ organizationId: org, queueZone: entry.queueZone });
        pushQueueEvent(entry.queueZone, 'queue_token_serving', { entry, board });
      }
    } else if (status === 'completed') {
      entry = await queue.completeEntry(id, org);
    } else if (status === 'no_show') {
      entry = await queue.markNoShow(id, org, req.body?.reason);
    }

    if (!entry) {
      return res.status(404).json({ success: false, message: 'Queue entry not found for this tenant' });
    }
    res.json({ success: true, data: entry });
  } catch (e) {
    console.error(`[qms] ${status} error:`, e.message);
    res.status(500).json({ success: false, message: e.message });
  }
}

router.patch('/:id/call', (req, res) => staffTransition(req, res, 'called'));
router.patch('/:id/start', (req, res) => staffTransition(req, res, 'serving'));
router.patch('/:id/complete', (req, res) => staffTransition(req, res, 'completed'));
router.patch('/:id/no-show', (req, res) => staffTransition(req, res, 'no_show'));

export default router;
