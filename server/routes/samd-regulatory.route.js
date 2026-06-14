/**
 * SaMD Regulatory Compliance API — Items 11–16
 *
 * All routes require admin or medical_director role.
 * Seed endpoints additionally require superadmin.
 */

import express from 'express';
import { authUser, requireRole } from '../middleware/auth.middleware.js';
import pool from '../db/pgPool.js';
import clinicalValidationService from '../services/clinical-validation.service.js';
import regulatoryComplianceService from '../services/regulatory-compliance.service.js';
import cdscoFilingService from '../services/cdsco-filing.service.js';
import samdDocGen from '../services/samd-document-generator.service.js';
import dpdpPrivacyService from '../services/dpdp-privacy.service.js';

const router = express.Router();

// ── Auth guard — all routes require login and admin+ ──────────────────────────
router.use(authUser);
router.use(requireRole('admin'));

// ══════════════════════════════════════════════════════════════════════════════
// ITEM 11 & 12 — CLINICAL VALIDATION
// ══════════════════════════════════════════════════════════════════════════════

/** GET /api/samd-regulatory/validation/studies */
router.get('/validation/studies', async (req, res) => {
  try {
    const studies = await clinicalValidationService.getStudies(req.query.component);
    const summary = await clinicalValidationService.getStudySummary();
    res.json({ studies, summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/samd-regulatory/validation/studies */
router.post('/validation/studies', async (req, res) => {
  try {
    const { studyName, modelComponent, studyType, validatedBy, notes } = req.body;
    if (!studyName || !modelComponent) {
      return res.status(400).json({ error: 'studyName and modelComponent are required' });
    }
    const study = await clinicalValidationService.createStudy({ studyName, modelComponent, studyType, validatedBy, notes });
    res.status(201).json(study);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/samd-regulatory/validation/run/:studyId */
router.post('/validation/run/:studyId', async (req, res) => {
  try {
    const { studyId } = req.params;
    const { component } = req.body;
    let result;
    if (component === 'emergency_triage_esi') {
      result = await clinicalValidationService.runTriageValidation(parseInt(studyId, 10));
    } else {
      result = await clinicalValidationService.runRiskScoringValidation(parseInt(studyId, 10));
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/samd-regulatory/validation/seed — synthetic baseline data */
router.post('/validation/seed', requireRole('superadmin'), async (req, res) => {
  try {
    const { component = 'health_risk_scoring' } = req.body;
    const result = await clinicalValidationService.seedSyntheticStudy(component);
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ITEM 13 — ISO 13485 QMS
// ══════════════════════════════════════════════════════════════════════════════

/** GET /api/samd-regulatory/qms/dashboard */
router.get('/qms/dashboard', async (req, res) => {
  try {
    res.json(await regulatoryComplianceService.getQMSDashboard());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/samd-regulatory/qms/documents */
router.get('/qms/documents', async (req, res) => {
  try {
    const docs = await regulatoryComplianceService.listDocuments(req.query.type, req.query.status);
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/samd-regulatory/qms/documents */
router.post('/qms/documents', async (req, res) => {
  try {
    const doc = await regulatoryComplianceService.createDocument(req.body);
    res.status(doc ? 201 : 409).json(doc || { error: 'Document number already exists' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** PATCH /api/samd-regulatory/qms/documents/:docNumber/status */
router.patch('/qms/documents/:docNumber/status', async (req, res) => {
  try {
    const doc = await regulatoryComplianceService.updateDocumentStatus(
      req.params.docNumber, req.body.status, req.body.approver
    );
    res.json(doc || { error: 'Not found' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/samd-regulatory/qms/ncr */
router.post('/qms/ncr', async (req, res) => {
  try {
    const ncr = await regulatoryComplianceService.raiseNonConformance(req.body);
    res.status(201).json(ncr);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** PATCH /api/samd-regulatory/qms/ncr/:ncrNumber */
router.patch('/qms/ncr/:ncrNumber', async (req, res) => {
  try {
    const ncr = await regulatoryComplianceService.updateNonConformance(req.params.ncrNumber, req.body);
    res.json(ncr || { error: 'Not found' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/samd-regulatory/qms/capa */
router.post('/qms/capa', async (req, res) => {
  try {
    const capa = await regulatoryComplianceService.createCAPA(req.body);
    res.status(201).json(capa);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** PATCH /api/samd-regulatory/qms/capa/:capaNumber/status */
router.patch('/qms/capa/:capaNumber/status', async (req, res) => {
  try {
    const capa = await regulatoryComplianceService.updateCAPAStatus(
      req.params.capaNumber, req.body.status, req.body.verifiedBy
    );
    res.json(capa || { error: 'Not found' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/samd-regulatory/qms/audit */
router.post('/qms/audit', async (req, res) => {
  try {
    const audit = await regulatoryComplianceService.createAuditRecord(req.body);
    res.status(201).json(audit);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/samd-regulatory/qms/seed — seed core QMS documents */
router.post('/qms/seed', requireRole('superadmin'), async (req, res) => {
  try {
    await regulatoryComplianceService.seedQMSDocuments();
    res.json({ seeded: true, message: '13 QMS documents seeded and approved' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ITEM 14 — IEC 62304 SOFTWARE LIFECYCLE
// ══════════════════════════════════════════════════════════════════════════════

/** GET /api/samd-regulatory/iec62304/dashboard */
router.get('/iec62304/dashboard', async (req, res) => {
  try {
    res.json(await regulatoryComplianceService.getIEC62304Dashboard());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/samd-regulatory/iec62304/items */
router.get('/iec62304/items', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM iec62304_software_items ORDER BY item_id').catch(() => ({ rows: [] }));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/samd-regulatory/iec62304/items */
router.post('/iec62304/items', async (req, res) => {
  try {
    const item = await regulatoryComplianceService.registerSoftwareItem(req.body);
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/samd-regulatory/iec62304/anomalies */
router.post('/iec62304/anomalies', async (req, res) => {
  try {
    const anomaly = await regulatoryComplianceService.logAnomaly(req.body);
    res.status(201).json(anomaly);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** PATCH /api/samd-regulatory/iec62304/anomalies/:anomalyId/resolve */
router.patch('/iec62304/anomalies/:anomalyId/resolve', async (req, res) => {
  try {
    const result = await regulatoryComplianceService.resolveAnomaly(
      req.params.anomalyId, req.body.resolution, req.body.resolvedVersion
    );
    res.json(result || { error: 'Not found' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/samd-regulatory/iec62304/seed */
router.post('/iec62304/seed', requireRole('superadmin'), async (req, res) => {
  try {
    await regulatoryComplianceService.seedSoftwareItems();
    res.json({ seeded: true, message: '10 software items registered (SW-001 to SW-010)' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ITEM 15 — ISO 14971 RISK MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════

/** GET /api/samd-regulatory/iso14971/dashboard */
router.get('/iso14971/dashboard', async (req, res) => {
  try {
    res.json(await regulatoryComplianceService.getRiskManagementDashboard());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/samd-regulatory/iso14971/hazards */
router.post('/iso14971/hazards', async (req, res) => {
  try {
    const hazard = await regulatoryComplianceService.addHazard(req.body);
    res.status(201).json(hazard);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/samd-regulatory/iso14971/risk-controls */
router.post('/iso14971/risk-controls', async (req, res) => {
  try {
    const control = await regulatoryComplianceService.addRiskControl(req.body);
    res.status(201).json(control);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/samd-regulatory/iso14971/benefit-risk */
router.post('/iso14971/benefit-risk', requireRole('medical_director'), async (req, res) => {
  try {
    const bra = await regulatoryComplianceService.addBenefitRiskAnalysis(req.body);
    res.status(201).json(bra);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/samd-regulatory/iso14971/seed */
router.post('/iso14971/seed', requireRole('superadmin'), async (req, res) => {
  try {
    await regulatoryComplianceService.seedRiskRegister();
    res.json({ seeded: true, message: '8 hazards and controls seeded; benefit-risk analysis approved' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ITEM 16 — CDSCO REGULATORY FILING
// ══════════════════════════════════════════════════════════════════════════════

/** GET /api/samd-regulatory/cdsco/dashboard */
router.get('/cdsco/dashboard', async (req, res) => {
  try {
    res.json(await cdscoFilingService.getFilingDashboard());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/samd-regulatory/cdsco/submissions/:submissionId/checklist */
router.get('/cdsco/submissions/:submissionId/checklist', async (req, res) => {
  try {
    const sections = await cdscoFilingService.getChecklistBySection(parseInt(req.params.submissionId, 10));
    const progress = await cdscoFilingService.getChecklistProgress(parseInt(req.params.submissionId, 10));
    res.json({ sections, progress });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/samd-regulatory/cdsco/submissions/:submissionId/technical-file */
router.get('/cdsco/submissions/:submissionId/technical-file', async (req, res) => {
  try {
    const summary = await cdscoFilingService.assembleTechnicalFileSummary(parseInt(req.params.submissionId, 10));
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** PATCH /api/samd-regulatory/cdsco/submissions/:submissionId/checklist/:itemNumber */
router.patch('/cdsco/submissions/:submissionId/checklist/:itemNumber', async (req, res) => {
  try {
    const result = await cdscoFilingService.updateChecklistItem(
      parseInt(req.params.submissionId, 10),
      req.params.itemNumber,
      req.body
    );
    res.json(result || { error: 'Not found' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** PATCH /api/samd-regulatory/cdsco/submissions/:submissionId/status */
router.patch('/cdsco/submissions/:submissionId/status', requireRole('medical_director'), async (req, res) => {
  try {
    const result = await cdscoFilingService.updateSubmissionStatus(
      parseInt(req.params.submissionId, 10),
      req.body.status,
      req.body.cdscoRefNumber
    );
    res.json(result || { error: 'Not found' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/samd-regulatory/cdsco/submissions — create new submission */
router.post('/cdsco/submissions', requireRole('superadmin'), async (req, res) => {
  try {
    const sub = await cdscoFilingService.createSubmission(req.body);
    if (sub) await cdscoFilingService.seedChecklist(sub.id);
    res.status(sub ? 201 : 409).json(sub || { error: 'Submission ref already exists' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// DOCUMENT GENERATION — IFU, DoC, CER, Software Label, PMS Plan, EPC
// ══════════════════════════════════════════════════════════════════════════════

/** GET /api/samd-regulatory/documents/ifu */
router.get('/documents/ifu', async (req, res) => {
  try { res.json(await samdDocGen.generateIFU()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

/** GET /api/samd-regulatory/documents/declaration-of-conformity */
router.get('/documents/declaration-of-conformity', async (req, res) => {
  try { res.json(await samdDocGen.generateDeclarationOfConformity()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

/** GET /api/samd-regulatory/documents/clinical-evaluation-report */
router.get('/documents/clinical-evaluation-report', async (req, res) => {
  try { res.json(await samdDocGen.generateClinicalEvaluationReport()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

/** GET /api/samd-regulatory/documents/software-label */
router.get('/documents/software-label', async (req, res) => {
  try { res.json(await samdDocGen.generateSoftwareLabel()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

/** GET /api/samd-regulatory/documents/pms-plan */
router.get('/documents/pms-plan', async (req, res) => {
  try { res.json(await samdDocGen.generatePMSPlan()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

/** GET /api/samd-regulatory/documents/essential-principles */
router.get('/documents/essential-principles', async (req, res) => {
  try { res.json(await samdDocGen.generateEssentialPrinciples()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

/** GET /api/samd-regulatory/documents/software-architecture */
router.get('/documents/software-architecture', async (req, res) => {
  try { res.json(await samdDocGen.generateSoftwareArchitectureDocument()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

/** GET /api/samd-regulatory/documents — index of all documents */
router.get('/documents', async (req, res) => {
  res.json({
    documents: [
      { id: 'IFU-MEDICZY-001',   type: 'Instructions for Use',              endpoint: '/api/samd-regulatory/documents/ifu' },
      { id: 'DOC-MEDICZY-001',   type: 'Declaration of Conformity',         endpoint: '/api/samd-regulatory/documents/declaration-of-conformity' },
      { id: 'CER-MEDICZY-001',   type: 'Clinical Evaluation Report',        endpoint: '/api/samd-regulatory/documents/clinical-evaluation-report' },
      { id: 'LABEL-MEDICZY-001', type: 'Software Label',                    endpoint: '/api/samd-regulatory/documents/software-label' },
      { id: 'PMS-SOP-001',       type: 'Post-Market Surveillance Plan',     endpoint: '/api/samd-regulatory/documents/pms-plan' },
      { id: 'EPC-MEDICZY-001',   type: 'Essential Principles Checklist',    endpoint: '/api/samd-regulatory/documents/essential-principles' },
      { id: 'IEC62304-SLD-001',  type: 'Software Architecture Document',    endpoint: '/api/samd-regulatory/documents/software-architecture' },
      { id: 'DPDP-PIA-001',      type: 'Privacy Impact Assessment',         endpoint: '/api/samd-regulatory/dpdp/pia' },
    ],
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// DPDP 2023 PRIVACY
// ══════════════════════════════════════════════════════════════════════════════

/** GET /api/samd-regulatory/dpdp/pia */
router.get('/dpdp/pia', async (req, res) => {
  try { res.json(await dpdpPrivacyService.generatePIA()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

/** GET /api/samd-regulatory/dpdp/summary */
router.get('/dpdp/summary', async (req, res) => {
  try { res.json(await dpdpPrivacyService.getPIASummary()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// CDSCO CHECKLIST AUTO-COMPLETE + READINESS
// ══════════════════════════════════════════════════════════════════════════════

/** POST /api/samd-regulatory/cdsco/submissions/:id/auto-complete */
router.post('/cdsco/submissions/:submissionId/auto-complete', requireRole('superadmin'), async (req, res) => {
  try {
    const result = await cdscoFilingService.autoCompleteChecklist(parseInt(req.params.submissionId, 10));
    res.json({ success: true, ...result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/** POST /api/samd-regulatory/cdsco/submissions/:id/sync-evidence */
router.post('/cdsco/submissions/:submissionId/sync-evidence', requireRole('superadmin'), async (req, res) => {
  try {
    const result = await cdscoFilingService.syncEvidenceToChecklist(parseInt(req.params.submissionId, 10));
    res.json({ success: true, ...result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/** GET /api/samd-regulatory/cdsco/submissions/:id/readiness */
router.get('/cdsco/submissions/:submissionId/readiness', async (req, res) => {
  try {
    res.json(await cdscoFilingService.getFullReadinessReport(parseInt(req.params.submissionId, 10)));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// IEC 62304 REQUIREMENTS + VERIFICATION
// ══════════════════════════════════════════════════════════════════════════════

/** GET /api/samd-regulatory/iec62304/requirements */
router.get('/iec62304/requirements', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT r.*, si.name AS software_item_name, si.item_id
      FROM iec62304_requirements r
      JOIN iec62304_software_items si ON si.id = r.software_item_id
      ORDER BY r.req_id
    `).catch(() => ({ rows: [] }));
    const byItem = {};
    rows.forEach(r => {
      if (!byItem[r.item_id]) byItem[r.item_id] = { name: r.software_item_name, requirements: [] };
      byItem[r.item_id].requirements.push(r);
    });
    res.json({ total: rows.length, by_software_item: byItem });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/** POST /api/samd-regulatory/iec62304/requirements/seed */
router.post('/iec62304/requirements/seed', requireRole('superadmin'), async (req, res) => {
  try {
    const result = await regulatoryComplianceService.seedRequirements();
    res.json({ success: true, ...result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/** POST /api/samd-regulatory/iec62304/verify-all */
router.post('/iec62304/verify-all', requireRole('superadmin'), async (req, res) => {
  try {
    const result = await regulatoryComplianceService.verifyAllSoftwareItems();
    res.json({ success: true, ...result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// MASTER SAMD COMPLIANCE DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════

/** GET /api/samd-regulatory/compliance-dashboard */
router.get('/compliance-dashboard', async (req, res) => {
  try {
    const [cdsco, qms, iec62304, iso14971, dpdp, validation] = await Promise.all([
      cdscoFilingService.getFilingDashboard().catch(() => null),
      regulatoryComplianceService.getQMSDashboard().catch(() => null),
      regulatoryComplianceService.getIEC62304Dashboard().catch(() => null),
      regulatoryComplianceService.getRiskManagementDashboard().catch(() => null),
      dpdpPrivacyService.getPIASummary().catch(() => null),
      clinicalValidationService.getStudySummary().catch(() => null),
    ]);

    const completionPct = cdsco?.checklist_progress?.completion_pct ?? 0;

    res.json({
      overall: {
        submission_ref:  cdsco?.submission?.submission_ref,
        device_class:    cdsco?.submission?.device_class,
        filing_status:   cdsco?.submission?.status,
        checklist_pct:   completionPct,
        ready_to_file:   completionPct >= 90,
        last_updated:    new Date().toISOString(),
      },
      cdsco_checklist:    cdsco?.checklist_progress,
      qms:                qms,
      iec62304:           iec62304,
      iso14971: {
        dashboard:      iso14971,
        compliant:      iso14971?.iso14971_compliant ?? false,
      },
      dpdp_privacy:       dpdp,
      clinical_validation: validation,
      documents: {
        available: ['IFU-MEDICZY-001','DOC-MEDICZY-001','CER-MEDICZY-001','LABEL-MEDICZY-001','PMS-SOP-001','EPC-MEDICZY-001','IEC62304-SLD-001','DPDP-PIA-001'],
        index_endpoint: '/api/samd-regulatory/documents',
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// COMBINED SEED — initialise all regulatory data in one shot
// ══════════════════════════════════════════════════════════════════════════════

/** POST /api/samd-regulatory/seed-all */
router.post('/seed-all', requireRole('superadmin'), async (req, res) => {
  const results = {};
  try {
    await regulatoryComplianceService.seedQMSDocuments();
    results.qms_documents = 'seeded';
  } catch (e) { results.qms_documents = `error: ${e.message}`; }

  try {
    await regulatoryComplianceService.seedSoftwareItems();
    results.iec62304_items = 'seeded';
  } catch (e) { results.iec62304_items = `error: ${e.message}`; }

  try {
    const reqResult = await regulatoryComplianceService.seedRequirements();
    results.iec62304_requirements = `seeded: ${reqResult.seeded} requirements`;
  } catch (e) { results.iec62304_requirements = `error: ${e.message}`; }

  try {
    const verifyResult = await regulatoryComplianceService.verifyAllSoftwareItems();
    results.iec62304_verified = `verified: ${verifyResult.verified} items`;
  } catch (e) { results.iec62304_verified = `error: ${e.message}`; }

  try {
    await regulatoryComplianceService.seedRiskRegister();
    results.iso14971_risk_register = 'seeded';
  } catch (e) { results.iso14971_risk_register = `error: ${e.message}`; }

  try {
    await clinicalValidationService.seedSyntheticStudy('health_risk_scoring');
    await clinicalValidationService.seedSyntheticStudy('emergency_triage_esi');
    results.clinical_validation = 'seeded (synthetic baseline)';
  } catch (e) { results.clinical_validation = `error: ${e.message}`; }

  try {
    const sub = await cdscoFilingService.getOrCreatePrimarySubmission();
    if (sub) {
      const syncResult = await cdscoFilingService.syncEvidenceToChecklist(sub.id);
      results.cdsco_submission = `${sub.submission_ref} — ${syncResult.synced} checklist items synced`;
    } else {
      results.cdsco_submission = 'skipped';
    }
  } catch (e) { results.cdsco = `error: ${e.message}`; }

  res.json({ seeded: true, results });
});

export default router;
