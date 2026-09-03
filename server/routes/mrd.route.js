/**
 * MRD (Medical Records Department) Module (Upgrade Plan Track A, Phase A2)
 *
 * GET  /api/mrd/records                 — list indexed records
 * GET  /api/mrd/records/:id             — single record
 * POST /api/mrd/records                 — index a record (MRD/admin)
 * POST /api/mrd/records/:id/checkout    — check a record out (MRD/admin)
 * POST /api/mrd/records/:id/return      — return a checked-out record (MRD/admin)
 * GET  /api/mrd/checkouts/open          — currently checked-out records
 *
 * GET  /api/mrd/retrieval-requests      — list retrieval requests
 * POST /api/mrd/retrieval-requests      — raise a retrieval request (any authenticated staff)
 * PATCH /api/mrd/retrieval-requests/:id — update status (MRD/admin)
 *
 * GET  /api/mrd/retention-schedule      — retention policy by record type
 * PUT  /api/mrd/retention-schedule      — set policy for a record type (admin only)
 * GET  /api/mrd/retention-due           — records at/past their retention date (flagged, not auto-deleted)
 */
import express from 'express';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import mrd from '../services/mrd.service.js';

const router = express.Router();
const MRD_STAFF = ['admin', 'hospital', 'system_admin'];

const orgId = (req) => req.user?.organization_id || req.user?.tenant_id || req.user?.hospitalId || null;

const wrap = (handler) => async (req, res) => {
  try {
    const data = await handler(req, res);
    if (!res.headersSent) res.json({ success: true, data });
  } catch (err) {
    const status = /not found|required|invalid|already/i.test(err.message) ? 400 : 500;
    res.status(status).json({ success: false, message: err.message });
  }
};

// ── Record index ─────────────────────────────────────────────────────────
router.get('/records', authUser, requireRole(MRD_STAFF), wrap((req) => mrd.listRecords({
  patientId: req.query.patientId,
  organizationId: req.query.organizationId || orgId(req),
  status: req.query.status,
  recordType: req.query.recordType,
  limit: req.query.limit,
  offset: req.query.offset,
})));

router.get('/records/:id', authUser, requireRole(MRD_STAFF), wrap(async (req) => {
  const record = await mrd.getRecord(req.params.id);
  if (!record) throw new Error('Record not found');
  return record;
}));

router.post('/records', authUser, requireRole(MRD_STAFF), wrap((req) => mrd.indexRecord({
  patientId: req.body.patientId,
  organizationId: req.body.organizationId || orgId(req),
  recordType: req.body.recordType,
  format: req.body.format,
  location: req.body.location,
  indexedBy: req.user.id,
})));

router.post('/records/:id/checkout', authUser, requireRole(MRD_STAFF), wrap((req) => mrd.checkoutRecord({
  recordId: req.params.id,
  checkedOutBy: req.user.id,
  department: req.body.department,
  purpose: req.body.purpose,
  expectedReturnAt: req.body.expectedReturnAt,
})));

router.post('/records/:id/return', authUser, requireRole(MRD_STAFF), wrap((req) => mrd.returnRecord({
  recordId: req.params.id,
  returnedTo: req.user.id,
})));

router.get('/checkouts/open', authUser, requireRole(MRD_STAFF), wrap((req) => mrd.listOpenCheckouts({
  organizationId: req.query.organizationId || orgId(req),
})));

// ── Retrieval requests ───────────────────────────────────────────────────
router.get('/retrieval-requests', authUser, requireRole(MRD_STAFF), wrap((req) => mrd.listRetrievalRequests({
  status: req.query.status,
  organizationId: req.query.organizationId || orgId(req),
  patientId: req.query.patientId,
  limit: req.query.limit,
  offset: req.query.offset,
})));

// Any authenticated staff can raise a request — the requesting side is
// intentionally not restricted to MRD/admin roles.
router.post('/retrieval-requests', authUser, wrap((req) => mrd.createRetrievalRequest({
  recordId: req.body.recordId,
  patientId: req.body.patientId,
  organizationId: req.body.organizationId || orgId(req),
  requestedBy: req.user.id,
  requestingDepartment: req.body.requestingDepartment,
  priority: req.body.priority,
  notes: req.body.notes,
})));

router.patch('/retrieval-requests/:id', authUser, requireRole(MRD_STAFF), wrap((req) => mrd.updateRetrievalRequestStatus({
  id: req.params.id,
  status: req.body.status,
  fulfilledBy: req.user.id,
  rejectionReason: req.body.rejectionReason,
})));

// ── Retention schedule ───────────────────────────────────────────────────
router.get('/retention-schedule', authUser, requireRole(MRD_STAFF), wrap(() => mrd.getRetentionSchedule()));

router.put('/retention-schedule', authUser, requireRole(['admin', 'system_admin']), wrap((req) => mrd.upsertRetentionPolicy({
  recordType: req.body.recordType,
  retentionYears: req.body.retentionYears,
  notes: req.body.notes,
})));

router.get('/retention-due', authUser, requireRole(MRD_STAFF), wrap((req) => mrd.listRecordsDueForRetention({
  organizationId: req.query.organizationId || orgId(req),
  withinDays: req.query.withinDays,
})));

export default router;
