/**
 * report-review.route.js  (WP3 Stage C — report observation verify gate API)
 * Mounted at /api/report-review (behind authUser). Role-gated to clinical reviewers; org-scoped.
 */
import express from 'express';
import { requireRole } from '../middleware/auth.middleware.js';
import { listReviewQueue, setVerification, getDocumentExtraction, getSubjectObservations } from '../services/report-review.service.js';

const router = express.Router();
const requireReviewer = requireRole(['medical_director', 'doctor', 'nurse', 'admin', 'team']);

// GET /api/report-review/queue?limit=&offset=&organizationUid=
router.get('/queue', requireReviewer, async (req, res) => {
  try {
    const result = await listReviewQueue({
      reviewerUserId: req.user.id, role: req.user.role,
      limit: Math.min(Number(req.query.limit) || 50, 200), offset: Number(req.query.offset) || 0,
      organizationUid: req.query.organizationUid || null,
    });
    res.json({ success: true, ...result });
  } catch (e) { res.status(e.statusCode || 500).json({ success: false, error: e.message }); }
});

// POST /api/report-review/:id/verify
router.post('/:id/verify', requireReviewer, async (req, res) => {
  try {
    const row = await setVerification({ id: Number(req.params.id), status: 'verified', reviewerUserId: req.user.id, role: req.user.role });
    res.json({ success: true, observation: row });
  } catch (e) { res.status(e.statusCode || 500).json({ success: false, error: e.message }); }
});

// POST /api/report-review/:id/reject  { reason }
router.post('/:id/reject', requireReviewer, async (req, res) => {
  try {
    const row = await setVerification({ id: Number(req.params.id), status: 'rejected', reviewerUserId: req.user.id, role: req.user.role, reason: req.body?.reason || null });
    res.json({ success: true, observation: row });
  } catch (e) { res.status(e.statusCode || 500).json({ success: false, error: e.message }); }
});

// GET /api/report-review/documents/:reportId/extraction — verified contract for one document (pull)
router.get('/documents/:reportId/extraction', requireReviewer, async (req, res) => {
  try {
    const payload = await getDocumentExtraction({ reportId: Number(req.params.reportId), reviewerUserId: req.user.id, role: req.user.role });
    if (!payload) return res.status(404).json({ success: false, error: 'No verified observations for this document' });
    res.json({ success: true, ...payload });
  } catch (e) { res.status(e.statusCode || 500).json({ success: false, error: e.message }); }
});

// GET /api/report-review/patients/:subjectUid/observations?canonical= — verified observations / trend series (pull)
router.get('/patients/:subjectUid/observations', requireReviewer, async (req, res) => {
  try {
    const items = await getSubjectObservations({ subjectUid: req.params.subjectUid, reviewerUserId: req.user.id, role: req.user.role, canonicalName: req.query.canonical || null });
    res.json({ success: true, subject_uid: req.params.subjectUid, count: items.length, observations: items });
  } catch (e) { res.status(e.statusCode || 500).json({ success: false, error: e.message }); }
});

export default router;
