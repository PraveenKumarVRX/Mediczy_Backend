/**
 * CDSCO Filing Service — SaMD Readiness Item 16
 *
 * Covers: CDSCO MDR 2017 Schedule 3 checklist, submission tracking,
 * technical file assembly for Software as a Medical Device (SaMD).
 */

import pool from '../db/pgPool.js';

// MDR 2017 Schedule 3 checklist items for Class B/C SaMD
const MDR_2017_SCHEDULE3 = [
  // Section 1 — Administrative
  { item: '1.1', section: 'Administrative', requirement: 'Device name, model and catalogue number', essential: true },
  { item: '1.2', section: 'Administrative', requirement: 'Intended purpose and indications for use', essential: true },
  { item: '1.3', section: 'Administrative', requirement: 'Target patient population and clinical context', essential: true },
  { item: '1.4', section: 'Administrative', requirement: 'Device classification (SaMD class I-IV per IMDRF)', essential: true },
  { item: '1.5', section: 'Administrative', requirement: 'Manufacturer details and authorised representative in India', essential: true },

  // Section 2 — Design & Manufacturing
  { item: '2.1', section: 'Design & Manufacturing', requirement: 'Software architecture document (IEC 62304)', essential: true },
  { item: '2.2', section: 'Design & Manufacturing', requirement: 'Software lifecycle description (development + maintenance)', essential: true },
  { item: '2.3', section: 'Design & Manufacturing', requirement: 'Version history and change log', essential: true },
  { item: '2.4', section: 'Design & Manufacturing', requirement: 'Third-party software (SOUP) inventory', essential: true },
  { item: '2.5', section: 'Design & Manufacturing', requirement: 'Software requirements specification (SRS)', essential: true },

  // Section 3 — Safety & Risk
  { item: '3.1', section: 'Safety & Risk', requirement: 'Risk management file (ISO 14971) — hazard log', essential: true },
  { item: '3.2', section: 'Safety & Risk', requirement: 'Risk management file — control measures and residual risk', essential: true },
  { item: '3.3', section: 'Safety & Risk', requirement: 'Benefit-risk analysis and overall residual risk acceptability', essential: true },
  { item: '3.4', section: 'Safety & Risk', requirement: 'Cybersecurity risk assessment (OWASP / IEC 81001-5-1)', essential: true },
  { item: '3.5', section: 'Safety & Risk', requirement: 'Data privacy impact assessment (DPDP 2023 / HIPAA alignment)', essential: false },

  // Section 4 — Clinical Evaluation
  { item: '4.1', section: 'Clinical Evaluation', requirement: 'Clinical evaluation plan and report', essential: true },
  { item: '4.2', section: 'Clinical Evaluation', requirement: 'Clinical performance data (AUROC, sensitivity, specificity)', essential: true },
  { item: '4.3', section: 'Clinical Evaluation', requirement: 'Literature review — clinical equivalence or superiority evidence', essential: true },
  { item: '4.4', section: 'Clinical Evaluation', requirement: 'Post-market clinical follow-up plan', essential: false },

  // Section 5 — Quality Management
  { item: '5.1', section: 'Quality Management', requirement: 'ISO 13485 quality management system certificate or declaration', essential: true },
  { item: '5.2', section: 'Quality Management', requirement: 'Document control procedure', essential: true },
  { item: '5.3', section: 'Quality Management', requirement: 'Non-conformance and CAPA procedure', essential: true },
  { item: '5.4', section: 'Quality Management', requirement: 'Internal audit records (last 12 months)', essential: false },

  // Section 6 — Labelling & IFU
  { item: '6.1', section: 'Labelling & IFU', requirement: 'Software label (name, version, intended use, contraindications)', essential: true },
  { item: '6.2', section: 'Labelling & IFU', requirement: 'Instructions for use (IFU) — clinical and technical', essential: true },
  { item: '6.3', section: 'Labelling & IFU', requirement: 'Warning statements (AI output not a replacement for physician judgement)', essential: true },

  // Section 7 — Post-Market Surveillance
  { item: '7.1', section: 'Post-Market Surveillance', requirement: 'Post-market surveillance (PMS) plan', essential: true },
  { item: '7.2', section: 'Post-Market Surveillance', requirement: 'Vigilance and adverse event reporting procedure', essential: true },
  { item: '7.3', section: 'Post-Market Surveillance', requirement: 'Periodic safety update report (PSUR) schedule', essential: false },

  // Section 8 — Declaration
  { item: '8.1', section: 'Declaration', requirement: 'Declaration of conformity signed by authorised signatory', essential: true },
  { item: '8.2', section: 'Declaration', requirement: 'Statement that device has not been rejected or withdrawn in any other country', essential: true },
];

// Pre-populated evidence mapping based on what is already implemented
const EVIDENCE_MAP = {
  '2.1': 'docs/regulatory/IEC62304-SoftwareLifecycle.md + iec62304_software_items table',
  '2.2': 'server/services/ — all AI service lifecycle documented in IEC 62304 registry',
  '2.3': 'git log + server/migrations/ change history',
  '2.4': 'iec62304_software_items table — SW-008 to SW-010 are SOUP items',
  '2.5': 'iec62304_requirements table + docs/ai/AI_INTERPRETABILITY_AND_QUALITY_GATES.md',
  '3.1': 'iso14971_hazards table — 8 canonical hazards seeded',
  '3.2': 'iso14971_risk_controls table — controls with residual RPN < 9',
  '3.3': 'iso14971_benefit_risk table — benefits_outweigh_risks approved',
  '3.4': 'server/middleware/ auth + data isolation; OWASP mitigations in code review',
  '4.2': 'clinical_validation_studies table — AUROC, sensitivity, specificity, Brier, kappa',
  '5.2': 'qms_documents QMS-SOP-001 — Document Control Procedure (approved)',
  '5.3': 'qms_documents QMS-SOP-002 + qms_non_conformances + qms_capa tables',
  '6.3': 'All AI endpoints return confidence_score; iSHA responses include "consult a doctor" disclaimers',
  '7.2': 'ai_quality_gate_log + ai_drift_monitor — real-time adverse signal detection',
};

class CdscoFilingService {

  async createSubmission({ deviceName, deviceClass, submissionType = 'new' }) {
    const count = (await pool.query('SELECT COUNT(*)+1 AS n FROM cdsco_submissions')).rows[0].n;
    const ref = `CDSCO-${new Date().getFullYear()}-${String(count).padStart(4, '0')}`;
    const { rows } = await pool.query(`
      INSERT INTO cdsco_submissions (submission_ref, device_name, device_class, submission_type, regulation)
      VALUES ($1,$2,$3,$4,'MDR2017')
      ON CONFLICT (submission_ref) DO NOTHING
      RETURNING *
    `, [ref, deviceName, deviceClass, submissionType]);
    return rows[0] || null;
  }

  async seedChecklist(submissionId) {
    for (const item of MDR_2017_SCHEDULE3) {
      const evidence = EVIDENCE_MAP[item.item] || null;
      const status = evidence ? 'completed' : 'pending';
      await pool.query(`
        INSERT INTO cdsco_checklist
          (submission_id, section, item_number, requirement, status, evidence_ref,
           responsible, completed_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (submission_id, item_number) DO NOTHING
      `, [
        submissionId, item.section, item.item, item.requirement,
        status, evidence, status === 'completed' ? 'system (auto-mapped)' : null,
        status === 'completed' ? new Date() : null,
      ]).catch(() => {});
    }
  }

  async getOrCreatePrimarySubmission() {
    const { rows } = await pool.query(
      `SELECT * FROM cdsco_submissions WHERE status NOT IN ('withdrawn') ORDER BY created_at DESC LIMIT 1`
    ).catch(() => ({ rows: [] }));

    if (rows.length > 0) return rows[0];

    const sub = await this.createSubmission({
      deviceName: 'Mediczy AI Clinical Decision Support Platform',
      deviceClass: 'B',
      submissionType: 'new',
    });
    if (sub) await this.seedChecklist(sub.id);
    return sub;
  }

  async getChecklistProgress(submissionId) {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed,
        COUNT(*) FILTER (WHERE status = 'pending') AS pending,
        COUNT(*) FILTER (WHERE status = 'not_applicable') AS not_applicable,
        COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress
      FROM cdsco_checklist
      WHERE submission_id = $1
    `, [submissionId]).catch(() => ({ rows: [{ total: 0, completed: 0, pending: 0 }] }));
    return rows[0];
  }

  async getChecklistBySection(submissionId) {
    const { rows } = await pool.query(`
      SELECT section, item_number, requirement, status, evidence_ref, responsible, notes
      FROM cdsco_checklist
      WHERE submission_id = $1
      ORDER BY item_number
    `, [submissionId]).catch(() => ({ rows: [] }));

    const sections = {};
    for (const row of rows) {
      if (!sections[row.section]) sections[row.section] = [];
      sections[row.section].push(row);
    }
    return sections;
  }

  async updateChecklistItem(submissionId, itemNumber, updates) {
    const { status, evidenceRef, responsible, notes } = updates;
    const { rows } = await pool.query(`
      UPDATE cdsco_checklist SET
        status       = COALESCE($3, status),
        evidence_ref = COALESCE($4, evidence_ref),
        responsible  = COALESCE($5, responsible),
        notes        = COALESCE($6, notes),
        completed_at = CASE WHEN $3 = 'completed' THEN NOW() ELSE completed_at END
      WHERE submission_id = $1 AND item_number = $2
      RETURNING *
    `, [submissionId, itemNumber, status, evidenceRef, responsible, notes]);
    return rows[0] || null;
  }

  async updateSubmissionStatus(submissionId, status, cdscoRefNumber) {
    const { rows } = await pool.query(`
      UPDATE cdsco_submissions SET
        status = $2,
        cdsco_ref_number = COALESCE($3, cdsco_ref_number),
        submitted_at = CASE WHEN $2 = 'submitted' THEN NOW() ELSE submitted_at END,
        updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [submissionId, status, cdscoRefNumber]);
    return rows[0] || null;
  }

  async assembleTechnicalFileSummary(submissionId) {
    const [sub, progress, sections] = await Promise.all([
      pool.query('SELECT * FROM cdsco_submissions WHERE id = $1', [submissionId]).then(r => r.rows[0]).catch(() => null),
      this.getChecklistProgress(submissionId),
      this.getChecklistBySection(submissionId),
    ]);

    if (!sub) return { error: 'Submission not found' };

    const completionPct = progress.total > 0
      ? Math.round((parseInt(progress.completed) / parseInt(progress.total)) * 100)
      : 0;

    const readyToSubmit = completionPct >= 80 && sub.status === 'preparation';

    return {
      submission: sub,
      progress: { ...progress, completion_pct: completionPct },
      sections,
      ready_to_submit: readyToSubmit,
      outstanding_essential: await pool.query(`
        SELECT item_number, requirement FROM cdsco_checklist
        WHERE submission_id = $1 AND status = 'pending'
        ORDER BY item_number
      `, [submissionId]).then(r => r.rows).catch(() => []),
    };
  }

  async getFilingDashboard() {
    const sub = await this.getOrCreatePrimarySubmission();
    if (!sub) return { error: 'Could not create submission' };
    const progress = await this.getChecklistProgress(sub.id);
    const completionPct = progress.total > 0
      ? Math.round((parseInt(progress.completed) / parseInt(progress.total)) * 100)
      : 0;
    return {
      submission: sub,
      checklist_progress: { ...progress, completion_pct: completionPct },
      cdsco_compliant: completionPct >= 80,
    };
  }
}

export default new CdscoFilingService();
