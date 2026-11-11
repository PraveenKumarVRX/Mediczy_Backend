/**
 * NABH / JCI Compliance Framework Service
 *
 * Provides digital tracking of hospital accreditation standards:
 *   - NABH 5th Edition (National Accreditation Board for Hospitals)
 *   - JCI 8th Edition (Joint Commission International)
 *
 * Features:
 *   - Full checkpoint catalogue (seeded from standards)
 *   - Per-tenant evidence tracking with scores (0=not met, 5=partial, 10=fully met)
 *   - Auto-collectable checkpoints query live HMIS data
 *   - Incident reporting module (CQI/QPS chapter)
 *   - Readiness score per chapter and overall
 *
 * Standards:
 *   NABH Hospital Accreditation Standards 5th Edition (2020)
 *   JCI Accreditation Standards for Hospitals 8th Edition (2023)
 */

import pool from '../db/pgPool.js';

import { schemaVerifier } from '../utils/schema-guard.js';
// ── DB bootstrap ──────────────────────────────────────────────────────────────
const SCHEMA_TABLES = ['compliance_standards', 'compliance_checkpoints', 'compliance_evidence', 'compliance_incidents'];

// Owned by the migration, verified here. A missing table fails closed with
// SCHEMA_NOT_MIGRATED instead of this service creating a table the
// migration never shaped.
export const ensureNabhjciTables = schemaVerifier({
  pool,
  tables: SCHEMA_TABLES,
  code: 'SCHEMA_NOT_MIGRATED',
  message: 'Apply migration 20261015003300-nabh-jci-compliance-governance before using NABH/JCI compliance',
});

// ── Standards catalogue ───────────────────────────────────────────────────────
const NABH_CHAPTERS = [
  { code: 'AAC', name: 'Access, Assessment & Continuity of Care',   description: 'Patient access, triage, clinical assessment, care planning and continuity' },
  { code: 'COP', name: 'Care of Patients',                          description: 'General care, high-risk patients, resuscitation, blood/blood products' },
  { code: 'MOM', name: 'Management of Medication',                   description: 'Drug ordering, dispensing, administration, monitoring, adverse drug events' },
  { code: 'PRE', name: 'Patient Rights & Education',                 description: 'Informed consent, privacy, confidentiality, patient education' },
  { code: 'HIC', name: 'Hospital Infection Control',                 description: 'Infection surveillance, prevention, hand hygiene, isolation, decontamination' },
  { code: 'CQI', name: 'Continuous Quality Improvement',            description: 'QI program, clinical audits, sentinel events, near-miss reporting' },
  { code: 'ROM', name: 'Responsibilities of Management',            description: 'Governance, policies, leadership, regulatory compliance' },
  { code: 'FMS', name: 'Facility Management & Safety',              description: 'Physical environment, equipment, fire safety, hazardous materials' },
  { code: 'HRM', name: 'Human Resource Management',                 description: 'Staff credentials, orientation, training, competency assessment' },
  { code: 'IMS', name: 'Information Management System',             description: 'Medical records, EHR, data integrity, confidentiality, retention' },
];

const JCI_CHAPTERS = [
  { code: 'IPSG', name: 'International Patient Safety Goals',       description: 'Patient ID, communication, medication safety, surgical safety, infection' },
  { code: 'ACC',  name: 'Access to Care and Continuity of Care',   description: 'Admission, discharge, transfer, continuity across settings' },
  { code: 'PFR',  name: 'Patient and Family Rights',               description: 'Consent, complaints, ethics committee, advance directives' },
  { code: 'AOP',  name: 'Assessment of Patients',                  description: 'Initial and ongoing assessment, lab and imaging services' },
  { code: 'COP',  name: 'Care of Patients',                        description: 'Resuscitation, high-risk patients, pain management, end-of-life care' },
  { code: 'ASC',  name: 'Anesthesia and Surgical Care',            description: 'Pre-op assessment, anesthesia monitoring, post-anesthesia care' },
  { code: 'MMU',  name: 'Medication Management and Use',           description: 'Formulary, storage, ordering, dispensing, monitoring, medication errors' },
  { code: 'PFE',  name: 'Patient and Family Education',            description: 'Education assessment, discharge instructions, effectiveness evaluation' },
  { code: 'QPS',  name: 'Quality Improvement and Patient Safety',  description: 'QI program, data collection, adverse events, root cause analysis' },
  { code: 'PCI',  name: 'Prevention and Control of Infections',    description: 'Infection rates, surveillance, isolation, antimicrobial stewardship' },
  { code: 'GLD',  name: 'Governance, Leadership, and Direction',   description: 'Mission, ethics, strategic planning, accountability' },
  { code: 'FMS',  name: 'Facility Management and Safety',          description: 'Safety plan, utilities, fire safety, medical equipment' },
  { code: 'SQE',  name: 'Staff Qualifications and Education',      description: 'Credentials, orientation, training, performance evaluation' },
  { code: 'MOI',  name: 'Management of Information',               description: 'EHR, medical records privacy, confidentiality, data management' },
];

// Core checkpoints per chapter (representative set — production would have full catalogue)
const NABH_CHECKPOINTS = [
  // AAC
  { code: 'AAC.1', standardCode: 'AAC', desc: 'The hospital has a documented policy for patient access and registration', criticality: 'critical' },
  { code: 'AAC.2', standardCode: 'AAC', desc: 'Triage is performed for all emergency patients using a validated triage scale (e.g., ESI)', criticality: 'critical', autoCollectable: true, autoQuery: `SELECT COUNT(*) > 0 FROM appointments WHERE consultation_type = 'emergency' AND status = 'confirmed' LIMIT 1` },
  { code: 'AAC.3', standardCode: 'AAC', desc: 'A comprehensive patient assessment is completed within 24 hours of admission', criticality: 'major' },
  { code: 'AAC.4', standardCode: 'AAC', desc: 'A patient-specific care plan is documented for every inpatient', criticality: 'major' },
  { code: 'AAC.5', standardCode: 'AAC', desc: 'Discharge planning is initiated at the time of admission', criticality: 'standard' },
  { code: 'AAC.6', standardCode: 'AAC', desc: 'Transfer documentation accompanies the patient when transferred between departments or facilities', criticality: 'major' },
  // COP
  { code: 'COP.1', standardCode: 'COP', desc: 'Uniform care is provided to patients regardless of the time of day', criticality: 'critical' },
  { code: 'COP.2', standardCode: 'COP', desc: 'High-risk patients (paediatric, elderly, ICU) receive enhanced monitoring', criticality: 'critical' },
  { code: 'COP.3', standardCode: 'COP', desc: 'Resuscitation equipment and trained staff are available 24/7', criticality: 'critical' },
  { code: 'COP.4', standardCode: 'COP', desc: 'Blood and blood products are managed per documented protocols', criticality: 'major' },
  // MOM
  { code: 'MOM.1', standardCode: 'MOM', desc: 'A hospital formulary exists and is reviewed at least annually', criticality: 'major' },
  { code: 'MOM.2', standardCode: 'MOM', desc: 'Medication orders are legible, complete and signed by a qualified prescriber', criticality: 'critical' },
  { code: 'MOM.3', standardCode: 'MOM', desc: 'High-alert medications are identified and stored separately with special labels', criticality: 'critical' },
  { code: 'MOM.4', standardCode: 'MOM', desc: 'Adverse drug events are reported and analysed', criticality: 'major' },
  // PRE
  { code: 'PRE.1', standardCode: 'PRE', desc: 'Informed consent is obtained before all invasive procedures', criticality: 'critical', autoCollectable: true, autoQuery: `SELECT COUNT(*) > 0 FROM consent_records WHERE consent_type = 'procedure' LIMIT 1` },
  { code: 'PRE.2', standardCode: 'PRE', desc: 'Patients are informed of their rights in their preferred language', criticality: 'major' },
  { code: 'PRE.3', standardCode: 'PRE', desc: 'Patient privacy and confidentiality are maintained at all times', criticality: 'critical' },
  { code: 'PRE.4', standardCode: 'PRE', desc: 'A formal complaint/grievance resolution mechanism exists', criticality: 'major' },
  // HIC
  { code: 'HIC.1', standardCode: 'HIC', desc: 'An infection control programme is established and led by a qualified professional', criticality: 'critical' },
  { code: 'HIC.2', standardCode: 'HIC', desc: 'Hand hygiene compliance is monitored and reported', criticality: 'critical' },
  { code: 'HIC.3', standardCode: 'HIC', desc: 'Healthcare-associated infection (HAI) rates are tracked and benchmarked', criticality: 'major' },
  // CQI
  { code: 'CQI.1', standardCode: 'CQI', desc: 'A documented quality improvement plan exists with measurable objectives', criticality: 'critical' },
  { code: 'CQI.2', standardCode: 'CQI', desc: 'At least 10 quality indicators are tracked with monthly reporting', criticality: 'major' },
  { code: 'CQI.3', standardCode: 'CQI', desc: 'Sentinel events are analysed with root cause analysis within 45 days', criticality: 'critical' },
  { code: 'CQI.4', standardCode: 'CQI', desc: 'Near-miss events are reported and analysed', criticality: 'major' },
  // ROM
  { code: 'ROM.1', standardCode: 'ROM', desc: 'A governing body with defined responsibilities exists', criticality: 'critical' },
  { code: 'ROM.2', standardCode: 'ROM', desc: 'All statutory licences and registrations are current', criticality: 'critical' },
  { code: 'ROM.3', standardCode: 'ROM', desc: 'Ethical guidelines are documented and communicated to all staff', criticality: 'major' },
  // FMS
  { code: 'FMS.1', standardCode: 'FMS', desc: 'A comprehensive safety plan (fire, electrical, biomedical) is in place', criticality: 'critical' },
  { code: 'FMS.2', standardCode: 'FMS', desc: 'All medical equipment is maintained and calibrated per schedule', criticality: 'critical' },
  { code: 'FMS.3', standardCode: 'FMS', desc: 'Mock drills for fire and disaster are conducted at least twice a year', criticality: 'major' },
  // HRM
  { code: 'HRM.1', standardCode: 'HRM', desc: 'All clinical staff credentials (degree, registration) are verified before employment', criticality: 'critical' },
  { code: 'HRM.2', standardCode: 'HRM', desc: 'A structured orientation programme exists for all new staff', criticality: 'major' },
  { code: 'HRM.3', standardCode: 'HRM', desc: 'Annual training and competency assessment is conducted for all clinical staff', criticality: 'major' },
  // IMS
  { code: 'IMS.1', standardCode: 'IMS', desc: 'Medical records are maintained in a standardised format', criticality: 'critical' },
  { code: 'IMS.2', standardCode: 'IMS', desc: 'Medical record completion is monitored and deficiencies addressed within 24 hours', criticality: 'major' },
  { code: 'IMS.3', standardCode: 'IMS', desc: 'Patient data is protected against unauthorised access, loss or tampering', criticality: 'critical', autoCollectable: true, autoQuery: `SELECT COUNT(*) > 0 FROM api_audit_logs LIMIT 1` },
  { code: 'IMS.4', standardCode: 'IMS', desc: 'Medical records are retained for at least 7 years (MCI requirement)', criticality: 'major' },
];

const JCI_CHECKPOINTS = [
  // IPSG
  { code: 'IPSG.1', standardCode: 'IPSG', desc: 'Two patient identifiers are used before all procedures, blood draws, and medication administration', criticality: 'critical' },
  { code: 'IPSG.2', standardCode: 'IPSG', desc: 'Effective communication (SBAR) is used for critical test results and handoffs', criticality: 'critical' },
  { code: 'IPSG.3', standardCode: 'IPSG', desc: 'High-alert medications are labelled and stored separately', criticality: 'critical' },
  { code: 'IPSG.4', standardCode: 'IPSG', desc: 'Correct-site, correct-procedure, correct-patient surgery is ensured (Universal Protocol)', criticality: 'critical' },
  { code: 'IPSG.5', standardCode: 'IPSG', desc: 'Hand hygiene is practiced per WHO guidelines with compliance monitoring', criticality: 'critical' },
  { code: 'IPSG.6', standardCode: 'IPSG', desc: 'Fall risk is assessed for all inpatients and prevention strategies implemented', criticality: 'major' },
  // ACC
  { code: 'ACC.1', standardCode: 'ACC', desc: 'Patient needs are assessed at the point of entry to determine appropriate care setting', criticality: 'critical' },
  { code: 'ACC.2', standardCode: 'ACC', desc: 'Continuity of care is maintained across all care transitions', criticality: 'major' },
  { code: 'ACC.3', standardCode: 'ACC', desc: 'Discharge planning begins at admission', criticality: 'major' },
  // PFR
  { code: 'PFR.1', standardCode: 'PFR', desc: 'Patient rights and responsibilities are communicated to patients and families', criticality: 'critical' },
  { code: 'PFR.2', standardCode: 'PFR', desc: 'Informed consent is obtained and documented for all high-risk procedures', criticality: 'critical' },
  { code: 'PFR.3', standardCode: 'PFR', desc: 'A patient grievance process exists with a documented response timeline', criticality: 'major' },
  // QPS
  { code: 'QPS.1', standardCode: 'QPS', desc: 'A documented QI program exists with leadership engagement', criticality: 'critical' },
  { code: 'QPS.2', standardCode: 'QPS', desc: 'Clinical and managerial data are collected to evaluate performance', criticality: 'major' },
  { code: 'QPS.3', standardCode: 'QPS', desc: 'Adverse events (sentinel events, near misses) are reported and analysed', criticality: 'critical' },
  { code: 'QPS.4', standardCode: 'QPS', desc: 'Root cause analysis is completed within 45 days of sentinel events', criticality: 'critical' },
  // PCI
  { code: 'PCI.1', standardCode: 'PCI', desc: 'An infection prevention and control programme is coordinated by a qualified person', criticality: 'critical' },
  { code: 'PCI.2', standardCode: 'PCI', desc: 'HAI surveillance is conducted with data used for improvement', criticality: 'major' },
  { code: 'PCI.3', standardCode: 'PCI', desc: 'Antimicrobial stewardship programme is in place', criticality: 'major' },
  // MOI
  { code: 'MOI.1', standardCode: 'MOI', desc: 'A medical record is created for every patient with standardised content', criticality: 'critical' },
  { code: 'MOI.2', standardCode: 'MOI', desc: 'Patient information privacy is protected per applicable law', criticality: 'critical' },
  { code: 'MOI.3', standardCode: 'MOI', desc: 'Clinical records are accessible to care providers at the point of care', criticality: 'major' },
  // SQE
  { code: 'SQE.1', standardCode: 'SQE', desc: 'Staff credentials (education, training, experience) are verified before independent practice', criticality: 'critical' },
  { code: 'SQE.2', standardCode: 'SQE', desc: 'All staff receive orientation and ongoing education', criticality: 'major' },
  // GLD
  { code: 'GLD.1', standardCode: 'GLD', desc: 'Governance structure with defined roles and accountability is documented', criticality: 'critical' },
  { code: 'GLD.2', standardCode: 'GLD', desc: 'Policies and procedures are reviewed and updated at least every 3 years', criticality: 'major' },
];

async function seedStandards() {
  const { rowCount } = await pool.query(`SELECT 1 FROM compliance_standards LIMIT 1`);
  if (rowCount > 0) return; // already seeded

  for (const ch of NABH_CHAPTERS) {
    await pool.query(
      `INSERT INTO compliance_standards (framework, version, chapter_code, chapter_name, description)
       VALUES ('NABH','5th Edition',$1,$2,$3) ON CONFLICT DO NOTHING`,
      [ch.code, ch.name, ch.description]
    );
  }
  for (const ch of JCI_CHAPTERS) {
    await pool.query(
      `INSERT INTO compliance_standards (framework, version, chapter_code, chapter_name, description)
       VALUES ('JCI','8th Edition',$1,$2,$3) ON CONFLICT DO NOTHING`,
      [ch.code, ch.name, ch.description]
    );
  }

  for (const cp of NABH_CHECKPOINTS) {
    const { rows } = await pool.query(
      `SELECT id FROM compliance_standards WHERE framework = 'NABH' AND chapter_code = $1`, [cp.standardCode]
    );
    if (rows.length) {
      await pool.query(
        `INSERT INTO compliance_checkpoints (standard_id, checkpoint_code, description, criticality, auto_collectable, auto_query)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (checkpoint_code) DO NOTHING`,
        [rows[0].id, cp.code, cp.desc, cp.criticality || 'standard', cp.autoCollectable || false, cp.autoQuery || null]
      );
    }
  }
  for (const cp of JCI_CHECKPOINTS) {
    const { rows } = await pool.query(
      `SELECT id FROM compliance_standards WHERE framework = 'JCI' AND chapter_code = $1`, [cp.standardCode]
    );
    if (rows.length) {
      await pool.query(
        `INSERT INTO compliance_checkpoints (standard_id, checkpoint_code, description, criticality, auto_collectable, auto_query)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (checkpoint_code) DO NOTHING`,
        [rows[0].id, cp.code, cp.desc, cp.criticality || 'standard', false, null]
      );
    }
  }
}

// ── Dashboard / scoring ───────────────────────────────────────────────────────

export async function getComplianceDashboard(tenantId, framework) {
  await ensureNabhjciTables();
  const fw = framework?.toUpperCase();
  const { rows: standards } = await pool.query(
    `SELECT cs.id, cs.framework, cs.chapter_code, cs.chapter_name,
            COUNT(cp.id)                                         AS total_checkpoints,
            COUNT(ce.id) FILTER (WHERE ce.tenant_id = $1)       AS assessed,
            COALESCE(SUM(ce.score) FILTER (WHERE ce.tenant_id = $1), 0) AS earned_score,
            COUNT(cp.id) * 10                                    AS max_score
     FROM compliance_standards cs
     JOIN compliance_checkpoints cp ON cp.standard_id = cs.id
     LEFT JOIN compliance_evidence ce ON ce.checkpoint_id = cp.id AND ce.tenant_id = $1
     ${fw ? `WHERE cs.framework = $2` : ''}
     GROUP BY cs.id, cs.framework, cs.chapter_code, cs.chapter_name
     ORDER BY cs.framework, cs.chapter_code`,
    fw ? [tenantId, fw] : [tenantId]
  );

  const totalMax   = standards.reduce((s, r) => s + Number(r.max_score), 0);
  const totalEarned = standards.reduce((s, r) => s + Number(r.earned_score), 0);
  const overallPct  = totalMax > 0 ? Math.round((totalEarned / totalMax) * 100) : 0;

  const byFramework = {};
  for (const r of standards) {
    if (!byFramework[r.framework]) byFramework[r.framework] = { chapters: [], earned: 0, max: 0 };
    const pct = Number(r.max_score) > 0 ? Math.round((Number(r.earned_score) / Number(r.max_score)) * 100) : 0;
    byFramework[r.framework].chapters.push({ ...r, percentage: pct });
    byFramework[r.framework].earned += Number(r.earned_score);
    byFramework[r.framework].max    += Number(r.max_score);
  }
  for (const fw of Object.keys(byFramework)) {
    byFramework[fw].percentage = byFramework[fw].max > 0
      ? Math.round((byFramework[fw].earned / byFramework[fw].max) * 100) : 0;
  }

  return { overall: { percentage: overallPct, earnedScore: totalEarned, maxScore: totalMax }, byFramework };
}

export async function getChapterCheckpoints(tenantId, framework, chapterCode) {
  await ensureNabhjciTables();
  const { rows } = await pool.query(
    `SELECT cp.id, cp.checkpoint_code, cp.description, cp.measurable_element, cp.criticality,
            cp.auto_collectable,
            COALESCE(ce.status, 'not_assessed') AS status,
            COALESCE(ce.score, 0)               AS score,
            ce.evidence_text, ce.notes, ce.assessed_at
     FROM compliance_checkpoints cp
     JOIN compliance_standards cs ON cs.id = cp.standard_id
     LEFT JOIN compliance_evidence ce ON ce.checkpoint_id = cp.id AND ce.tenant_id = $1
     WHERE cs.framework = $2 AND cs.chapter_code = $3
     ORDER BY cp.checkpoint_code`,
    [tenantId, framework.toUpperCase(), chapterCode.toUpperCase()]
  );
  return rows;
}

export async function upsertEvidence(tenantId, checkpointId, data) {
  await ensureNabhjciTables();
  const { status, evidenceText, evidenceUrl, score, notes, assessedBy } = data;
  const { rows } = await pool.query(
    `INSERT INTO compliance_evidence (tenant_id, checkpoint_id, status, evidence_text, evidence_url, score, notes, assessed_by, assessed_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8, NOW(), NOW())
     ON CONFLICT (tenant_id, checkpoint_id) DO UPDATE
       SET status = EXCLUDED.status, evidence_text = EXCLUDED.evidence_text,
           evidence_url = EXCLUDED.evidence_url, score = EXCLUDED.score,
           notes = EXCLUDED.notes, assessed_by = EXCLUDED.assessed_by,
           assessed_at = NOW(), updated_at = NOW()
     RETURNING id, status, score, updated_at`,
    [tenantId, checkpointId, status || 'assessed', evidenceText || null, evidenceUrl || null,
     Math.min(Math.max(Number(score) || 0, 0), 10), notes || null, assessedBy || null]
  );
  return rows[0];
}

// ── Incident management ───────────────────────────────────────────────────────
export async function logIncident(tenantId, data) {
  await ensureNabhjciTables();
  const { incidentType, severity, description, patientId, occurredAt, reportedBy } = data;
  const { rows } = await pool.query(
    `INSERT INTO compliance_incidents (tenant_id, incident_type, severity, description, patient_id, occurred_at, reported_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id, incident_type, severity, status, created_at`,
    [tenantId, incidentType, severity, description, patientId || null, occurredAt || new Date(), reportedBy || null]
  );
  return rows[0];
}

export async function listIncidents(tenantId, filters = {}) {
  await ensureNabhjciTables();
  const { status, severity, limit = 50 } = filters;
  const conds = ['tenant_id = $1'];
  const vals  = [tenantId];
  let idx = 2;
  if (status)   { conds.push(`status = $${idx++}`);   vals.push(status); }
  if (severity) { conds.push(`severity = $${idx++}`); vals.push(severity); }
  vals.push(Math.min(Number(limit) || 50, 200));
  const { rows } = await pool.query(
    `SELECT id, incident_type, severity, description, occurred_at, status, root_cause, created_at
     FROM compliance_incidents WHERE ${conds.join(' AND ')} ORDER BY occurred_at DESC LIMIT $${idx}`,
    vals
  );
  return rows;
}

export async function updateIncident(id, tenantId, updates) {
  await ensureNabhjciTables();
  const { rootCause, correctiveAction, status } = updates;
  const { rows } = await pool.query(
    `UPDATE compliance_incidents
     SET root_cause = COALESCE($1, root_cause),
         corrective_action = COALESCE($2, corrective_action),
         status = COALESCE($3, status),
         closed_at = CASE WHEN $3 = 'closed' THEN NOW() ELSE closed_at END
     WHERE id = $4 AND tenant_id = $5
     RETURNING id, status, closed_at`,
    [rootCause || null, correctiveAction || null, status || null, id, tenantId]
  );
  if (!rows.length) throw new Error('Incident not found');
  return rows[0];
}
