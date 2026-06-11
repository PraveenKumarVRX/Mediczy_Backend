/**
 * AI Governance API Routes
 * ==========================
 * Admin endpoints for SaMD model governance operations:
 *   - View pending model changes (PCCP review queue)
 *   - Approve / reject proposed changes
 *   - View model cards
 *   - View drift monitor results
 *   - View quality gate audit log
 *   - Trigger drift monitor manually
 *   - View SaMD readiness checklist
 *   - View demographic parity report
 *
 * Access: Super-admin and Medical Director roles only.
 * All actions are audit-logged.
 */

import express from 'express';
import governanceService from '../services/ai-model-governance.service.js';
import interpretabilityService from '../services/ai-interpretability.service.js';
import qualityGates from '../services/ai-quality-gates.service.js';
import pool from '../db/pgPool.js';
import { requirePatientRecordAccess } from '../utils/patient-access.js';

const router = express.Router();

// ── Auth middleware (reuse existing pattern) ──────────────────────────────────
function requireSuperAdminOrMedDir(req, res, next) {
  const role = req.user?.role;
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  if (!['super_admin', 'medical_director', 'admin'].includes(role)) {
    return res.status(403).json({ error: 'Medical director or super-admin access required for governance operations' });
  }
  next();
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ai-governance/dashboard
// Full governance dashboard: pending changes, drift alerts, SaMD readiness
// ─────────────────────────────────────────────────────────────────────────────
router.get('/dashboard', requireSuperAdminOrMedDir, async (req, res) => {
  try {
    const dashboard = await governanceService.getGovernanceDashboard();
    res.json({ success: true, data: dashboard });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ai-governance/changes/pending
// List all pending model changes awaiting review
// ─────────────────────────────────────────────────────────────────────────────
router.get('/changes/pending', requireSuperAdminOrMedDir, async (req, res) => {
  try {
    const changes = await governanceService.getPendingChanges();
    res.json({
      success: true,
      count:   changes.length,
      changes,
      message: changes.length > 0
        ? `${changes.length} model change(s) awaiting medical director review`
        : 'No pending changes'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ai-governance/changes/history?component=&limit=
// Change audit trail for a component
// ─────────────────────────────────────────────────────────────────────────────
router.get('/changes/history', requireSuperAdminOrMedDir, async (req, res) => {
  try {
    const { component, limit = 50 } = req.query;
    const history = await governanceService.getChangeHistory(component, parseInt(limit));
    res.json({ success: true, count: history.length, history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ai-governance/changes/:id/approve
// Approve a pending model change
// ─────────────────────────────────────────────────────────────────────────────
router.post('/changes/:id/approve', requireSuperAdminOrMedDir, async (req, res) => {
  try {
    const changeId = parseInt(req.params.id);
    const approvedBy = req.user?.email || req.user?.name || 'admin';
    const { notes = '' } = req.body;

    const change = await governanceService.approveChange(changeId, approvedBy, notes);

    // Audit log the approval
    await pool.query(`
      INSERT INTO operations_audit_log (module, action, actor, details, created_at)
      VALUES ('ai_governance', 'change_approved', $1, $2, NOW())
    `, [approvedBy, JSON.stringify({ changeId, component: change.model_component, type: change.change_type })]).catch(() => {});

    res.json({
      success: true,
      message: `Change ${changeId} approved by ${approvedBy}`,
      change
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ai-governance/changes/:id/reject
// Reject a pending model change
// ─────────────────────────────────────────────────────────────────────────────
router.post('/changes/:id/reject', requireSuperAdminOrMedDir, async (req, res) => {
  try {
    const changeId   = parseInt(req.params.id);
    const rejectedBy = req.user?.email || req.user?.name || 'admin';
    const { reason }  = req.body;

    if (!reason) return res.status(400).json({ error: 'Rejection reason is required' });

    await governanceService.rejectChange(changeId, rejectedBy, reason);

    await pool.query(`
      INSERT INTO operations_audit_log (module, action, actor, details, created_at)
      VALUES ('ai_governance', 'change_rejected', $1, $2, NOW())
    `, [rejectedBy, JSON.stringify({ changeId, reason })]).catch(() => {});

    res.json({ success: true, message: `Change ${changeId} rejected` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ai-governance/model-cards
// List all model cards
// ─────────────────────────────────────────────────────────────────────────────
router.get('/model-cards', requireSuperAdminOrMedDir, async (req, res) => {
  try {
    const cards = governanceService.getAllModelCards();
    res.json({ success: true, count: cards.length, cards });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ai-governance/model-cards/:key
// Single model card
// ─────────────────────────────────────────────────────────────────────────────
router.get('/model-cards/:key', requireSuperAdminOrMedDir, async (req, res) => {
  try {
    const card = governanceService.getModelCard(req.params.key);
    if (!card) return res.status(404).json({ error: 'Model card not found' });
    res.json({ success: true, card });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ai-governance/drift/run
// Manually trigger drift monitoring
// ─────────────────────────────────────────────────────────────────────────────
router.post('/drift/run', requireSuperAdminOrMedDir, async (req, res) => {
  try {
    const result = await governanceService.runDriftMonitor();
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ai-governance/drift/results
// Recent drift monitor results
// ─────────────────────────────────────────────────────────────────────────────
router.get('/drift/results', requireSuperAdminOrMedDir, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT feature_name, psi_score, drift_detected, drift_level, measured_at
      FROM ai_drift_monitor
      ORDER BY measured_at DESC
      LIMIT 50
    `);
    res.json({ success: true, count: rows.length, results: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ai-governance/demographic-parity
// Demographic fairness report
// ─────────────────────────────────────────────────────────────────────────────
router.get('/demographic-parity', requireSuperAdminOrMedDir, async (req, res) => {
  try {
    const parity = await governanceService.computeDemographicParity();
    res.json({ success: true, data: parity });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ai-governance/quality-gates/log
// Recent quality gate audit entries
// ─────────────────────────────────────────────────────────────────────────────
router.get('/quality-gates/log', requireSuperAdminOrMedDir, async (req, res) => {
  try {
    const { gate_type, severity, limit = 100 } = req.query;
    const conditions = ['1=1'];
    const params = [];

    if (gate_type) { params.push(gate_type); conditions.push(`gate_type = $${params.length}`); }
    if (severity)  { params.push(severity);  conditions.push(`severity = $${params.length}`); }

    params.push(parseInt(limit));
    const { rows } = await pool.query(`
      SELECT q.*, p."userId" as user_id
      FROM ai_quality_gate_log q
      LEFT JOIN patients p ON p.id = q.patient_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY checked_at DESC
      LIMIT $${params.length}
    `, params);

    const summary = {
      total:   rows.length,
      blocked: rows.filter(r => r.severity === 'blocked').length,
      warning: rows.filter(r => r.severity === 'warning').length,
      passed:  rows.filter(r => r.severity === 'pass').length
    };

    res.json({ success: true, summary, entries: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ai-governance/patient/:patientId/explanation
// SHAP + counterfactual explanation for a specific patient's risk score
// (For clinical use — available to treating physicians)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/patient/:patientId/explanation', async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    // Doctors and admins can access explanations
    const allowedRoles = ['doctor', 'admin', 'super_admin', 'medical_director', 'nurse'];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Not authorized to view patient explanations' });
    }

    const patientId = parseInt(String(req.params.patientId), 10);
    if (Number.isNaN(patientId)) {
      return res.status(400).json({ error: 'Invalid patientId' });
    }

    const access = await requirePatientRecordAccess(req, res, patientId);
    if (!access) return;

    const { rows } = await pool.query(`
      SELECT r.overall_score, r.risk_level, r.subscores, r.shap_values,
             r.feature_attributions, r.counterfactuals, r.confidence_score,
             r.data_completeness, r.model_version, r.updated_at,
             p."userId", p."chronicConditions", p.height, p.weight, p."dateOfBirth",
             u."firstName", u."lastName", u.gender
      FROM ai_health_risk_scores r
      JOIN patients p ON p.id = r.patient_id
      JOIN users u ON u.id = p."userId"
      WHERE r.patient_id = $1
    `, [patientId]);

    if (!rows.length) {
      return res.status(404).json({ error: 'No risk score found for this patient' });
    }

    const row = rows[0];

    res.json({
      success: true,
      patient: {
        id: patientId,
        name: `${row.firstName} ${row.lastName}`,
        gender: row.gender
      },
      riskScore: {
        overall:       row.overall_score,
        level:         row.risk_level,
        subscores:     row.subscores,
        computedAt:    row.updated_at,
        modelVersion:  row.model_version
      },
      interpretability: {
        shap:              row.shap_values,
        topFeatures:       row.feature_attributions,
        counterfactuals:   row.counterfactuals,
        confidenceScore:   row.confidence_score,
        dataCompleteness:  row.data_completeness,
        confidenceTier:    row.confidence_score >= 0.8 ? 'high' : row.confidence_score >= 0.5 ? 'moderate' : 'low',
        humanSummary:      row.shap_values?.topContributor
          ? `The most significant risk driver is ${row.shap_values.topContributor}.`
          : 'Interpretability data available in detail view.'
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ai-governance/model-cards/sync
// Sync static model cards to database
// ─────────────────────────────────────────────────────────────────────────────
router.post('/model-cards/sync', requireSuperAdminOrMedDir, async (req, res) => {
  try {
    await governanceService.syncModelCardsToDB();
    res.json({ success: true, message: 'Model cards synced to database' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ai-governance/samd-readiness
// SaMD readiness checklist — public summary for regulatory prep
// ─────────────────────────────────────────────────────────────────────────────
router.get('/samd-readiness', requireSuperAdminOrMedDir, async (req, res) => {
  try {
    const dashboard = await governanceService.getGovernanceDashboard();
    const checklist = dashboard.samdReadiness;
    const done    = checklist.filter(c => c.status === 'done').length;
    const missing = checklist.filter(c => c.status === 'missing').length;

    res.json({
      success:       true,
      readinessScore: `${done}/${checklist.length}`,
      readinessPct:   Math.round((done / checklist.length) * 100),
      status:         missing === 0 ? 'ready' : missing <= 4 ? 'near-ready' : 'in-progress',
      checklist
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
