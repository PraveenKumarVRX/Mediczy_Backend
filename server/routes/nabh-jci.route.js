/**
 * NABH / JCI Compliance Framework API
 *
 * GET  /api/compliance/dashboard              Overall compliance score (all frameworks)
 * GET  /api/compliance/:fw/dashboard          Per-framework score (nabh | jci)
 * GET  /api/compliance/:fw/chapters           Chapter list with scores
 * GET  /api/compliance/:fw/chapters/:chapter  Checkpoints + evidence for a chapter
 * POST /api/compliance/:fw/evidence           Submit / update checkpoint evidence
 * GET  /api/compliance/incidents              List compliance incidents
 * POST /api/compliance/incidents              Log a new incident
 * PATCH /api/compliance/incidents/:id         Update incident (RCA, corrective action, close)
 *
 * Framework param: "nabh" → NABH, "jci" → JCI (case-insensitive)
 *
 * Standards: NABH Hospital Accreditation Standards 5th Ed, JCI 8th Ed
 */

import { Router } from 'express';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import {
  ensureNabhjciTables,
  getComplianceDashboard,
  getChapterCheckpoints,
  upsertEvidence,
  logIncident,
  listIncidents,
  updateIncident,
} from '../services/nabh-jci-compliance.service.js';

const router = Router();

ensureNabhjciTables().catch(e => console.warn('[Compliance] Table init warning:', e.message));

router.use(authUser);

const tenantId  = (req) => req.user?.tenant_id || req.user?.organization_id || req.user?.id;
const normFw    = (s) => (s || '').toUpperCase() === 'JCI' ? 'JCI' : 'NABH';

// ── Overall dashboard (both frameworks) ──────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  try {
    const data = await getComplianceDashboard(tenantId(req));
    res.json({ success: true, ...data });
  } catch (err) {
    console.error('[Compliance] Dashboard error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Per-framework dashboard ───────────────────────────────────────────────────
router.get('/:fw/dashboard', async (req, res) => {
  try {
    const fw   = normFw(req.params.fw);
    const data = await getComplianceDashboard(tenantId(req), fw);
    res.json({ success: true, framework: fw, ...data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Chapter list with scores ──────────────────────────────────────────────────
router.get('/:fw/chapters', async (req, res) => {
  try {
    const fw   = normFw(req.params.fw);
    const data = await getComplianceDashboard(tenantId(req), fw);
    const chapters = (data.byFramework?.[fw]?.chapters || []).map(c => ({
      chapterCode:   c.chapter_code,
      chapterName:   c.chapter_name,
      totalCheckpoints: Number(c.total_checkpoints),
      assessed:      Number(c.assessed),
      percentage:    c.percentage,
      earnedScore:   Number(c.earned_score),
      maxScore:      Number(c.max_score),
    }));
    res.json({ success: true, framework: fw, chapters, total: chapters.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Checkpoints for a chapter ─────────────────────────────────────────────────
router.get('/:fw/chapters/:chapter', async (req, res) => {
  try {
    const fw      = normFw(req.params.fw);
    const chapter = req.params.chapter.toUpperCase();
    const rows    = await getChapterCheckpoints(tenantId(req), fw, chapter);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: `No checkpoints found for ${fw} chapter ${chapter}` });
    }
    const scoreMap = { not_assessed: 0, partially_met: 5, met: 10 };
    const summary = {
      total: rows.length,
      assessed: rows.filter(r => r.status !== 'not_assessed').length,
      met: rows.filter(r => r.status === 'met').length,
      partiallyMet: rows.filter(r => r.status === 'partially_met').length,
      notMet: rows.filter(r => r.status === 'not_met').length,
      earnedScore: rows.reduce((s, r) => s + Number(r.score), 0),
      maxScore: rows.length * 10,
    };
    summary.percentage = summary.maxScore > 0
      ? Math.round((summary.earnedScore / summary.maxScore) * 100) : 0;
    res.json({ success: true, framework: fw, chapter, checkpoints: rows, summary });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Submit evidence ───────────────────────────────────────────────────────────
router.post('/:fw/evidence', requireRole('hospital_admin', 'admin', 'super_admin', 'quality_manager'), async (req, res) => {
  try {
    const { checkpointId, status, evidenceText, evidenceUrl, score, notes } = req.body;
    if (!checkpointId) return res.status(400).json({ success: false, message: 'checkpointId is required' });
    const validStatuses = ['not_assessed', 'met', 'partially_met', 'not_met', 'assessed'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: `status must be one of: ${validStatuses.join(', ')}` });
    }
    const result = await upsertEvidence(tenantId(req), Number(checkpointId), {
      status, evidenceText, evidenceUrl, score, notes, assessedBy: req.user?.id,
    });
    res.status(201).json({ success: true, evidence: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Incidents: list ───────────────────────────────────────────────────────────
router.get('/incidents', async (req, res) => {
  try {
    const { status, severity, limit } = req.query;
    const incidents = await listIncidents(tenantId(req), { status, severity, limit });
    res.json({ success: true, incidents, total: incidents.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Incidents: log new ────────────────────────────────────────────────────────
router.post('/incidents', async (req, res) => {
  try {
    const { incidentType, severity, description, patientId, occurredAt } = req.body;
    if (!description) return res.status(400).json({ success: false, message: 'description is required' });
    const incident = await logIncident(tenantId(req), {
      incidentType: incidentType || 'general',
      severity: severity || 'low',
      description,
      patientId,
      occurredAt,
      reportedBy: req.user?.id,
    });
    res.status(201).json({ success: true, incident });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Incidents: update (RCA / close) ──────────────────────────────────────────
router.patch('/incidents/:id', requireRole('hospital_admin', 'admin', 'super_admin', 'quality_manager'), async (req, res) => {
  try {
    const { rootCause, correctiveAction, status } = req.body;
    const result = await updateIncident(Number(req.params.id), tenantId(req), { rootCause, correctiveAction, status });
    res.json({ success: true, incident: result });
  } catch (err) {
    const code = err.message === 'Incident not found' ? 404 : 500;
    res.status(code).json({ success: false, message: err.message });
  }
});

export default router;
