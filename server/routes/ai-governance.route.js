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
import knowledgeFabric from '../services/clinical-knowledge-fabric.service.js';
import interpretabilityService from '../services/ai-interpretability.service.js';
import qualityGates from '../services/ai-quality-gates.service.js';
import pool, { getPoolStats } from '../db/pgPool.js';
import { abdmCircuitBreaker, sftpCircuitBreaker } from '../utils/circuit-breaker.js';
import { requirePatientRecordAccess } from '../utils/patient-access.js';
import { verifyChain } from '../services/audit-chain.service.js';
import llmMetrics from '../services/llm-metrics.service.js';
import { getOpportunityMatrix } from '../services/healthcare-ai-opportunity.service.js';

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

// Requires the acting user to be a doctor or admin (for physician acknowledgment)
function requireDoctorOrAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  if (!['doctor', 'admin', 'super_admin', 'medical_director'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Physician or admin access required' });
  }
  next();
}

// Requires super_admin only (for sensitive chain verification)
function requireSuperAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Super-admin access required' });
  }
  next();
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ai-governance/opportunity-matrix
// Healthcare AI prioritisation map derived from current guidance and implementation state
// ─────────────────────────────────────────────────────────────────────────────
router.get('/opportunity-matrix', requireSuperAdminOrMedDir, async (req, res) => {
  try {
    res.json({ success: true, data: getOpportunityMatrix() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

// GET /api/ai-governance/layer-map — AI capability layer registry (MED-AI-LAYER-001)
router.get('/layer-map', requireSuperAdminOrMedDir, async (_req, res) => {
  try {
    const { getAiLayerMapSummary } = await import('../services/ai-layer-map.service.js');
    res.json({ success: true, data: getAiLayerMapSummary() });
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
    let approvedBy = req.user?.email || req.user?.name || 'admin';
    const {rows:chatChanges}=await pool.query('SELECT model_component FROM ai_model_change_log WHERE id=$1',[changeId]);
    if(chatChanges[0]?.model_component==='medical-chat-approved-extractive-v1') {
      if(req.user.role!=='medical_director' || !/^[A-Z0-9]{6}$/.test(req.user.unique_id||'')) return res.status(403).json({error:'Medical Director with registered UID must approve clinical chat evaluation'});
      approvedBy=req.user.unique_id;
    }
    const { notes = '' } = req.body;

    const change = await governanceService.approveChange(changeId, approvedBy, notes);

    // A knowledge rule owns its own governance change: keep the rule in step with the decision.
    try { await knowledgeFabric.syncRuleWithChange(changeId, 'approved', approvedBy, notes); }
    catch (e) { console.warn(`[ai-governance] rule sync after approving change ${changeId} failed:`, e.message); }

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

    try { await knowledgeFabric.syncRuleWithChange(changeId, 'rejected', rejectedBy, reason); }
    catch (e) { console.warn(`[ai-governance] rule sync after rejecting change ${changeId} failed:`, e.message); }

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
// POST /api/ai-governance/adverse-events
// Report an adverse event attributable to an AI output (SaMD vigilance pathway)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/adverse-events', async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const { patientId, componentId, description, severity, reportedBy } = req.body;

    if (!componentId || !description || !severity) {
      return res.status(400).json({ error: 'componentId, description, and severity are required' });
    }

    const validSeverities = ['mild', 'moderate', 'severe', 'critical', 'fatal'];
    if (!validSeverities.includes(severity)) {
      return res.status(400).json({ error: `severity must be one of: ${validSeverities.join(', ')}` });
    }

    // Ensure table exists (idempotent DDL)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_adverse_events (
        id           SERIAL PRIMARY KEY,
        patient_id   INTEGER,
        component_id TEXT NOT NULL,
        description  TEXT NOT NULL,
        severity     TEXT NOT NULL,
        reported_by  INTEGER REFERENCES users(id),
        status       TEXT DEFAULT 'open',
        created_at   TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const reporterId = reportedBy ?? req.user?.id ?? null;

    const { rows } = await pool.query(`
      INSERT INTO ai_adverse_events
        (patient_id, component_id, description, severity, reported_by, status, created_at)
      VALUES ($1, $2, $3, $4, $5, 'open', NOW())
      RETURNING id, created_at
    `, [patientId ?? null, componentId, description, severity, reporterId]);

    const eventId = rows[0].id;

    // Log to operations audit trail
    await pool.query(`
      INSERT INTO operations_audit_log (module, action, actor, details, created_at)
      VALUES ('ai_governance', 'adverse_event_reported', $1, $2, NOW())
    `, [
      req.user?.email || String(reporterId),
      JSON.stringify({ eventId, componentId, severity, patientId: patientId ?? null })
    ]).catch(() => {});

    // Console warning — email/SMS notification handled by drift alert pattern
    console.warn(`[SaMD VIGILANCE] Adverse event #${eventId} reported: component=${componentId} severity=${severity} patient=${patientId ?? 'unspecified'}`);

    res.status(201).json({
      success: true,
      message: `Adverse event #${eventId} recorded. Severity: ${severity}.`,
      eventId,
      componentId,
      severity,
      status: 'open',
      createdAt: rows[0].created_at,
      note: 'Events with severity=severe/critical/fatal must be reported to CDSCO under Vigilance Protocol within 30 days.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ai-governance/adverse-events
// List adverse events (filtered by status/severity/component)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/adverse-events', requireSuperAdminOrMedDir, async (req, res) => {
  try {
    const { status, severity, component_id, limit = 100 } = req.query;
    const conditions = ['1=1'];
    const params = [];

    if (status)       { params.push(status);       conditions.push(`status = $${params.length}`); }
    if (severity)     { params.push(severity);      conditions.push(`severity = $${params.length}`); }
    if (component_id) { params.push(component_id);  conditions.push(`component_id = $${params.length}`); }

    params.push(parseInt(limit));

    let rows = [];
    try {
      const result = await pool.query(`
        SELECT ae.*, u."firstName", u."lastName", u.email
        FROM ai_adverse_events ae
        LEFT JOIN users u ON u.id = ae.reported_by
        WHERE ${conditions.join(' AND ')}
        ORDER BY ae.created_at DESC
        LIMIT $${params.length}
      `, params);
      rows = result.rows;
    } catch (_tableErr) {
      // Table may not exist yet if no event has been filed
    }

    res.json({
      success: true,
      count: rows.length,
      events: rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ai-governance/risk-scores/:id/pin-version
// Pin an algorithm version label to a specific health risk score row
// ─────────────────────────────────────────────────────────────────────────────
router.post('/risk-scores/:id/pin-version', requireSuperAdminOrMedDir, async (req, res) => {
  try {
    const scoreId = parseInt(req.params.id, 10);
    if (Number.isNaN(scoreId)) {
      return res.status(400).json({ error: 'Invalid score ID' });
    }

    const { algorithmVersion } = req.body;
    if (!algorithmVersion || typeof algorithmVersion !== 'string') {
      return res.status(400).json({ error: 'algorithmVersion (string) is required' });
    }

    // Ensure column exists (idempotent DDL)
    await pool.query(`
      ALTER TABLE ai_health_risk_scores
      ADD COLUMN IF NOT EXISTS algorithm_version TEXT
    `);

    const { rows } = await pool.query(`
      UPDATE ai_health_risk_scores
      SET algorithm_version = $1
      WHERE id = $2
      RETURNING id, patient_id, algorithm_version, updated_at
    `, [algorithmVersion, scoreId]);

    if (!rows.length) {
      return res.status(404).json({ error: `Risk score ${scoreId} not found` });
    }

    await pool.query(`
      INSERT INTO operations_audit_log (module, action, actor, details, created_at)
      VALUES ('ai_governance', 'algorithm_version_pinned', $1, $2, NOW())
    `, [
      req.user?.email || 'admin',
      JSON.stringify({ scoreId, algorithmVersion, patientId: rows[0].patient_id })
    ]).catch(() => {});

    res.json({
      success: true,
      message: `Algorithm version pinned: ${algorithmVersion}`,
      score: rows[0]
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
    const readiness = dashboard.samdReadiness;
    const items   = Array.isArray(readiness) ? readiness : (readiness?.items ?? []);
    const done    = items.filter(c => c.status === 'done').length;
    const missing = items.filter(c => c.status === 'missing').length;

    res.json({
      success:       true,
      readinessScore: `${done}/${items.length}`,
      readinessPct:   Math.round((done / items.length) * 100),
      status:         missing === 0 ? 'ready' : missing <= 4 ? 'near-ready' : 'in-progress',
      checklist:      items,
      score:          readiness?.score,
      partialScore:   readiness?.partialScore,
      total:          readiness?.total,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ITEM-10: Physician acknowledgment gate
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/ai-governance/risk-scores/:id/acknowledge
// Physician marks a specific risk score as reviewed.
router.post('/risk-scores/:id/acknowledge', requireDoctorOrAdmin, async (req, res) => {
  try {
    const scoreId = parseInt(req.params.id, 10);
    if (Number.isNaN(scoreId)) {
      return res.status(400).json({ error: 'Invalid score id' });
    }

    const { rows } = await pool.query(
      `UPDATE ai_health_risk_scores
          SET physician_acknowledged_at = NOW(),
              acknowledged_by           = $1
        WHERE id = $2
    RETURNING id, patient_id, overall_score, risk_level,
              physician_acknowledged_at, acknowledged_by`,
      [req.user.id, scoreId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Risk score not found' });
    }

    // Audit-log the acknowledgment
    await pool.query(
      `INSERT INTO operations_audit_log (module, action, actor, details, created_at)
       VALUES ('ai_governance', 'risk_score_acknowledged', $1, $2, NOW())`,
      [
        req.user.email || req.user.id,
        JSON.stringify({ scoreId, patientId: rows[0].patient_id, riskLevel: rows[0].risk_level })
      ]
    ).catch(() => {});

    res.json({ success: true, score: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ai-governance/risk-scores/unacknowledged
// Returns high-risk scores (overall_score > 7) that have not yet been reviewed.
router.get('/risk-scores/unacknowledged', requireDoctorOrAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit ?? '100', 10), 500);

    const { rows } = await pool.query(
      `SELECT r.id, r.patient_id, r.overall_score, r.risk_level,
              r.subscores, r.confidence_score, r.updated_at,
              p."userId" as user_patient_id,
              u."firstName", u."lastName"
         FROM ai_health_risk_scores r
         JOIN patients p ON p.id = r.patient_id
         JOIN users   u ON u.id = p."userId"
        WHERE r.physician_acknowledged_at IS NULL
          AND r.overall_score > 7
        ORDER BY r.overall_score DESC, r.updated_at DESC
        LIMIT $1`,
      [limit]
    );

    res.json({
      success: true,
      count:   rows.length,
      message: rows.length > 0
        ? `${rows.length} high-risk patient score(s) awaiting physician acknowledgment`
        : 'No unacknowledged high-risk scores',
      scores:  rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ITEM-16: Audit log cryptographic chain verification
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/ai-governance/audit-chain/verify
// Replays all chained audit rows and reports whether the chain is intact.
router.get('/audit-chain/verify', requireSuperAdmin, async (req, res) => {
  try {
    const result = await verifyChain();
    const status = result.valid ? 200 : 409;
    res.status(status).json({
      success:     result.valid,
      valid:       result.valid,
      brokenAt:    result.brokenAt,
      checkedRows: result.checkedRows,
      message:     result.valid
        ? `Audit chain intact — ${result.checkedRows} row(s) verified`
        : `Audit chain BROKEN at log_id ${result.brokenAt} — possible tampering detected`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ITEM-25: LLM Provider Performance Dashboard
// GET /api/ai-governance/provider-performance?window=24h|7d|30d
// Returns P50/P95/P99 latency per provider, success rates, and token totals.
// Access: super-admin / medical director only.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/provider-performance', requireSuperAdminOrMedDir, async (req, res) => {
  try {
    const window = ['24h', '7d', '30d'].includes(req.query.window) ? req.query.window : '24h';

    const [performance, errors] = await Promise.all([
      llmMetrics.getProviderPerformance(window),
      llmMetrics.getErrorBreakdown(window),
    ]);

    // Attach error breakdown per provider for convenience
    const errorsByProvider = {};
    for (const e of errors) {
      if (!errorsByProvider[e.provider]) errorsByProvider[e.provider] = [];
      errorsByProvider[e.provider].push({ errorType: e.error_type, count: Number(e.count) });
    }

    const enriched = performance.map(row => ({
      provider:           row.provider,
      cognitiveTier:      row.cognitive_tier,
      window,
      totalCalls:         Number(row.total_calls),
      successCount:       Number(row.success_count),
      failureCount:       Number(row.failure_count),
      successRatePct:     Number(row.success_rate_pct),
      latency: {
        p50Ms:            row.p50_ms,
        p95Ms:            row.p95_ms,
        p99Ms:            row.p99_ms,
        avgMs:            row.avg_ms,
      },
      tokens: {
        totalPrompt:      Number(row.total_prompt_tokens),
        totalCompletion:  Number(row.total_completion_tokens),
        totalAll:         Number(row.total_tokens),
      },
      windowStart:        row.window_start,
      windowEnd:          row.window_end,
      errorBreakdown:     errorsByProvider[row.provider] || [],
    }));

    res.json({
      success:    true,
      window,
      generatedAt: new Date().toISOString(),
      providers:  enriched,
      summary: {
        totalProviders:    enriched.length,
        totalCalls:        enriched.reduce((s, r) => s + r.totalCalls, 0),
        overallSuccessPct: enriched.length
          ? Math.round(
              enriched.reduce((s, r) => s + (r.successCount), 0) /
              Math.max(1, enriched.reduce((s, r) => s + r.totalCalls, 0)) * 100
            )
          : null,
        fastestProvider:   enriched.length
          ? enriched.filter(r => r.latency.p50Ms != null)
              .sort((a, b) => a.latency.p50Ms - b.latency.p50Ms)[0]?.provider ?? null
          : null,
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ITEM-05: DB pool monitoring — super_admin only
router.get('/db-pool', requireSuperAdmin, (req, res) => {
  res.json({
    poolStats: getPoolStats(),
    circuitBreakers: {
      abdm: abdmCircuitBreaker.toJSON(),
      sftp: sftpCircuitBreaker.toJSON(),
    },
    timestamp: new Date().toISOString(),
  });
});

export default router;
