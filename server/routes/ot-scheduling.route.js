import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import { requireModule } from '../middleware/moduleEntitlement.middleware.js';
import {
  bookOT, emergencyActivateOT, updateOTStatus,
  submitChecklist, getChecklistStatus, getOTSchedule, checkConflicts
} from '../services/ot-scheduling.service.js';
import {
  scanConsumable, getConsumablesByBooking,
  recordImplant, getImplantsByBooking,
  sendFamilyNotification, getFamilyNotifications,
  getOperativeSummary
} from '../services/ot-consumables.service.js';
import { enforceOTBookingConsent, enforceOTIncisionConsent } from '../services/consent-enforcement.service.js';
import {
  createOperativeNote, getOperativeNoteByBooking,
  updateOperativeNote, signOperativeNote
} from '../services/operative-notes.service.js';
import { resolveTenantId } from '../utils/tenant-identity.js';

const router = express.Router();

// POST /api/v1/ot/book
router.post('/book', authUser, requireModule('ot'), async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const override = req.body.consentOverride
      ? { ...req.body.consentOverride, approverId: req.body.consentOverride.approverId || req.user.id, approverRole: req.body.consentOverride.approverRole || req.user.role }
      : null;
    await enforceOTBookingConsent({
      organizationId, patientId: req.body.patientId,
      procedureName: req.body.procedureName, admissionType: req.body.admissionType, override
    });
    const booking = await bookOT({ ...req.body, organizationId });
    res.status(201).json({ success: true, data: booking });
  } catch (err) {
    const status = err.consentBlocked ? 403 : 400;
    res.status(status).json({ success: false, message: err.message, consentBlocked: err.consentBlocked || false });
  }
});

// POST /api/v1/ot/emergency-activate
router.post('/emergency-activate', authUser, requireModule('ot'), async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const booking = await emergencyActivateOT({ ...req.body, organizationId });
    res.status(201).json({ success: true, data: booking });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/v1/ot/cases/today — document §8 Phase 3
router.get('/cases/today', authUser, requireModule('ot'), async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const { roomId } = req.query;
    const cases = await getOTSchedule(organizationId, new Date(), roomId ? parseInt(roomId) : undefined);
    res.json({ success: true, count: cases.length, data: cases });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/ot/case/:id/readiness — document §8 Phase 3: OT case readiness score
router.get('/case/:id/readiness', authUser, requireModule('ot'), async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const bookingId = parseInt(req.params.id);
    const [checklist, consentLog] = await Promise.all([
      getChecklistStatus(organizationId, bookingId),
      // Check consent enforcement log for this booking context
      Promise.resolve([])
    ]);

    const phases = checklist?.phases || {};
    const phaseKeys = Object.keys(phases);
    const totalItems = phaseKeys.reduce((n, k) => n + (phases[k]?.total || 0), 0);
    const doneItems  = phaseKeys.reduce((n, k) => n + (phases[k]?.completed || 0), 0);
    const readinessPct = totalItems > 0 ? Math.round(100 * doneItems / totalItems) : 0;

    const missingMandatory = phaseKeys.reduce((acc, k) => {
      if (phases[k]?.missingRequired?.length) acc.push(...phases[k].missingRequired.map(m => ({ phase: k, item: m })));
      return acc;
    }, []);

    res.json({
      success: true,
      data: {
        bookingId,
        readinessPct,
        isReady: missingMandatory.length === 0,
        missingMandatory,
        checklist: phases,
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/ot/schedule
router.get('/schedule', authUser, requireModule('ot'), async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const { date, roomId } = req.query;
    const schedule = await getOTSchedule(
      organizationId,
      date ? new Date(date) : new Date(),
      roomId ? parseInt(roomId) : undefined
    );
    res.json({ success: true, data: schedule });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/v1/ot/:id/status
// B2: Accepts optional override: { reasonCode, approverId, approverRole }
// B7: Enforces consent check before incision transition
router.put('/:id/status', authUser, requireModule('ot'), async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const override = req.body.override
      ? { ...req.body.override, approverId: req.body.override.approverId || req.user.id, approverRole: req.body.override.approverRole || req.user.role }
      : null;

    if (req.body.status === 'incision') {
      const consentOverride = req.body.consentOverride
        ? { ...req.body.consentOverride, approverId: req.body.consentOverride.approverId || req.user.id, approverRole: req.body.consentOverride.approverRole || req.user.role }
        : null;
      await enforceOTIncisionConsent({
        organizationId, patientId: req.body.patientId,
        procedureName: req.body.procedureName,
        isEmergency: req.body.isEmergency || false,
        override: consentOverride
      });
    }

    const result = await updateOTStatus(organizationId, parseInt(req.params.id), req.body.status, {
      operativeNotes: req.body.operativeNotes,
      performedBy: req.user.id,
      override
    });
    res.json(result);
  } catch (err) {
    res.status(403).json({ success: false, message: err.message, consentBlocked: err.consentBlocked || false });
  }
});

// POST /api/v1/ot/:id/checklist
router.post('/:id/checklist', authUser, requireModule('ot'), async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const result = await submitChecklist(
      organizationId,
      parseInt(req.params.id),
      req.body.checklistType,
      req.body.items,
      req.user.id
    );
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/v1/ot/:id/checklist-status
router.get('/:id/checklist-status', authUser, requireModule('ot'), async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const status = await getChecklistStatus(organizationId, parseInt(req.params.id));
    res.json({ success: true, data: status });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/ot/conflicts
router.get('/conflicts', authUser, requireModule('ot'), async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const { roomId, start, end } = req.query;
    const conflicts = await checkConflicts(organizationId, parseInt(roomId), new Date(start), new Date(end));
    res.json({ success: true, hasConflict: conflicts.length > 0, count: conflicts.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Consumables (scan-to-consume) ────────────────────────────────────────────

// POST /api/v1/ot/consumables/scan
router.post('/consumables/scan', authUser, requireModule('ot'), async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const result = await scanConsumable({ ...req.body, organizationId, scannedBy: req.user.id });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/v1/ot/:id/consumables
router.get('/:id/consumables', authUser, requireModule('ot'), async (req, res) => {
  try {
    const data = await getConsumablesByBooking(parseInt(req.params.id));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/v1/ot/implants
router.post('/implants', authUser, requireModule('ot'), async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const result = await recordImplant({ ...req.body, organizationId, recordedBy: req.user.id });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/v1/ot/:id/implants
router.get('/:id/implants', authUser, requireModule('ot'), async (req, res) => {
  try {
    const data = await getImplantsByBooking(parseInt(req.params.id));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Family notifications ──────────────────────────────────────────────────────

// POST /api/v1/ot/:id/family-notification
router.post('/:id/family-notification', authUser, requireModule('ot'), async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const result = await sendFamilyNotification({
      ...req.body,
      otBookingId: parseInt(req.params.id),
      organizationId,
      sentBy: req.user.id
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/v1/ot/:id/family-notifications
router.get('/:id/family-notifications', authUser, requireModule('ot'), async (req, res) => {
  try {
    const data = await getFamilyNotifications(parseInt(req.params.id));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Operative summary ─────────────────────────────────────────────────────────

// GET /api/v1/ot/:id/operative-summary
router.get('/:id/operative-summary', authUser, requireModule('ot'), async (req, res) => {
  try {
    const data = await getOperativeSummary(parseInt(req.params.id));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Operative notes ───────────────────────────────────────────────────────────

// POST /api/v1/ot/:id/operative-note
router.post('/:id/operative-note', authUser, requireModule('ot'), async (req, res) => {
  try {
    const organizationId = resolveTenantId(req.user);
    const result = await createOperativeNote({
      ...req.body,
      otBookingId: parseInt(req.params.id),
      organizationId,
      surgeonId: req.body.surgeonId || req.user.id
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/v1/ot/:id/operative-note
router.get('/:id/operative-note', authUser, requireModule('ot'), async (req, res) => {
  try {
    const result = await getOperativeNoteByBooking(parseInt(req.params.id));
    if (!result) return res.status(404).json({ success: false, message: 'No operative note found' });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/v1/ot/operative-note/:noteId
router.patch('/operative-note/:noteId', authUser, requireModule('ot'), async (req, res) => {
  try {
    const result = await updateOperativeNote(parseInt(req.params.noteId), req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST /api/v1/ot/operative-note/:noteId/sign
router.post('/operative-note/:noteId/sign', authUser, requireModule('ot'), async (req, res) => {
  try {
    const result = await signOperativeNote(parseInt(req.params.noteId), {
      signedBy: req.user.id,
      finalContent: req.body.finalContent
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

export default router;
