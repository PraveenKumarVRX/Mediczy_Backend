/**
 * ISO/IEC 27001:2022 Information Security Management System (ISMS)
 *
 * Implements a full control registry for all 93 Annex A controls
 * organised across 4 domains:
 *   A.5  Organisational controls  (37 controls)
 *   A.6  People controls          ( 8 controls)
 *   A.7  Physical controls        (14 controls)
 *   A.8  Technological controls   (34 controls)
 *
 * Features:
 *   - Tenant-scoped control assessments (Applicable / Not Applicable / In Place / Partial / Not Started)
 *   - Evidence attachment per control
 *   - Risk register linked to controls
 *   - Statement of Applicability (SoA) export
 *   - Domain-level and overall maturity score
 */

import pool from '../db/pgPool.js';

import { schemaVerifier, guardedQuery } from '../utils/schema-guard.js';
// ── DB bootstrap ──────────────────────────────────────────────────────────────
const SCHEMA_TABLES = ['iso27001_controls', 'iso27001_evidence', 'iso27001_risk_register'];

// Owned by the migration and only verified here: creating these on demand
// would let a skipped migration look healthy on tables without its indexes
// and constraints, and would let a request hold an ACCESS EXCLUSIVE lock.
const ensureIso27001Tables = schemaVerifier({
  pool: pool,
  tables: SCHEMA_TABLES,
  code: 'SCHEMA_NOT_MIGRATED',
  message: 'Apply the platform-edge governance migrations before using this service',
});


const guardedPool = guardedQuery(pool, 'Apply the platform-edge governance migrations before using this service');

// Reported at startup so an unmigrated environment shows in the log, not
// only when the first request fails. Boot is not blocked.

// ── Controls catalogue — ISO/IEC 27001:2022 Annex A ─────────────────────────
const CONTROLS = [
  // A.5 Organisational
  { id:'A.5.1',  domain:'A.5', dn:'Organisational controls', name:'Policies for information security',             type:'Preventive' },
  { id:'A.5.2',  domain:'A.5', dn:'Organisational controls', name:'Information security roles and responsibilities', type:'Preventive' },
  { id:'A.5.3',  domain:'A.5', dn:'Organisational controls', name:'Segregation of duties',                        type:'Preventive' },
  { id:'A.5.4',  domain:'A.5', dn:'Organisational controls', name:'Management responsibilities',                  type:'Preventive' },
  { id:'A.5.5',  domain:'A.5', dn:'Organisational controls', name:'Contact with authorities',                     type:'Preventive' },
  { id:'A.5.6',  domain:'A.5', dn:'Organisational controls', name:'Contact with special interest groups',         type:'Preventive' },
  { id:'A.5.7',  domain:'A.5', dn:'Organisational controls', name:'Threat intelligence',                          type:'Detective',  cyber:true },
  { id:'A.5.8',  domain:'A.5', dn:'Organisational controls', name:'Information security in project management',   type:'Preventive' },
  { id:'A.5.9',  domain:'A.5', dn:'Organisational controls', name:'Inventory of information and other associated assets', type:'Preventive' },
  { id:'A.5.10', domain:'A.5', dn:'Organisational controls', name:'Acceptable use of information and other associated assets', type:'Preventive' },
  { id:'A.5.11', domain:'A.5', dn:'Organisational controls', name:'Return of assets',                             type:'Preventive' },
  { id:'A.5.12', domain:'A.5', dn:'Organisational controls', name:'Classification of information',                type:'Preventive' },
  { id:'A.5.13', domain:'A.5', dn:'Organisational controls', name:'Labelling of information',                     type:'Preventive' },
  { id:'A.5.14', domain:'A.5', dn:'Organisational controls', name:'Information transfer',                         type:'Preventive' },
  { id:'A.5.15', domain:'A.5', dn:'Organisational controls', name:'Access control',                               type:'Preventive' },
  { id:'A.5.16', domain:'A.5', dn:'Organisational controls', name:'Identity management',                          type:'Preventive' },
  { id:'A.5.17', domain:'A.5', dn:'Organisational controls', name:'Authentication information',                   type:'Preventive' },
  { id:'A.5.18', domain:'A.5', dn:'Organisational controls', name:'Access rights',                                type:'Preventive' },
  { id:'A.5.19', domain:'A.5', dn:'Organisational controls', name:'Information security in supplier relationships', type:'Preventive' },
  { id:'A.5.20', domain:'A.5', dn:'Organisational controls', name:'Addressing information security within supplier agreements', type:'Preventive' },
  { id:'A.5.21', domain:'A.5', dn:'Organisational controls', name:'Managing information security in the ICT supply chain', type:'Preventive' },
  { id:'A.5.22', domain:'A.5', dn:'Organisational controls', name:'Monitoring, review and change management of supplier services', type:'Detective' },
  { id:'A.5.23', domain:'A.5', dn:'Organisational controls', name:'Information security for use of cloud services', type:'Preventive', cyber:true },
  { id:'A.5.24', domain:'A.5', dn:'Organisational controls', name:'Information security incident management planning and preparation', type:'Corrective' },
  { id:'A.5.25', domain:'A.5', dn:'Organisational controls', name:'Assessment and decision on information security events', type:'Detective' },
  { id:'A.5.26', domain:'A.5', dn:'Organisational controls', name:'Response to information security incidents',   type:'Corrective' },
  { id:'A.5.27', domain:'A.5', dn:'Organisational controls', name:'Learning from information security incidents', type:'Preventive' },
  { id:'A.5.28', domain:'A.5', dn:'Organisational controls', name:'Collection of evidence',                      type:'Detective' },
  { id:'A.5.29', domain:'A.5', dn:'Organisational controls', name:'Information security during disruption',      type:'Corrective' },
  { id:'A.5.30', domain:'A.5', dn:'Organisational controls', name:'ICT readiness for business continuity',       type:'Corrective', cyber:true },
  { id:'A.5.31', domain:'A.5', dn:'Organisational controls', name:'Legal, statutory, regulatory and contractual requirements', type:'Preventive' },
  { id:'A.5.32', domain:'A.5', dn:'Organisational controls', name:'Intellectual property rights',                type:'Preventive' },
  { id:'A.5.33', domain:'A.5', dn:'Organisational controls', name:'Protection of records',                       type:'Preventive' },
  { id:'A.5.34', domain:'A.5', dn:'Organisational controls', name:'Privacy and protection of personal identifiable information (PII)', type:'Preventive' },
  { id:'A.5.35', domain:'A.5', dn:'Organisational controls', name:'Independent review of information security',  type:'Detective' },
  { id:'A.5.36', domain:'A.5', dn:'Organisational controls', name:'Compliance with policies, rules and standards for information security', type:'Preventive' },
  { id:'A.5.37', domain:'A.5', dn:'Organisational controls', name:'Documented operating procedures',             type:'Preventive' },
  // A.6 People
  { id:'A.6.1', domain:'A.6', dn:'People controls', name:'Screening',                                            type:'Preventive' },
  { id:'A.6.2', domain:'A.6', dn:'People controls', name:'Terms and conditions of employment',                   type:'Preventive' },
  { id:'A.6.3', domain:'A.6', dn:'People controls', name:'Information security awareness, education and training', type:'Preventive' },
  { id:'A.6.4', domain:'A.6', dn:'People controls', name:'Disciplinary process',                                 type:'Corrective' },
  { id:'A.6.5', domain:'A.6', dn:'People controls', name:'Responsibilities after termination or change of employment', type:'Preventive' },
  { id:'A.6.6', domain:'A.6', dn:'People controls', name:'Confidentiality or non-disclosure agreements',        type:'Preventive' },
  { id:'A.6.7', domain:'A.6', dn:'People controls', name:'Remote working',                                      type:'Preventive' },
  { id:'A.6.8', domain:'A.6', dn:'People controls', name:'Information security event reporting',                 type:'Detective' },
  // A.7 Physical
  { id:'A.7.1',  domain:'A.7', dn:'Physical controls', name:'Physical security perimeters',                     type:'Preventive' },
  { id:'A.7.2',  domain:'A.7', dn:'Physical controls', name:'Physical entry',                                   type:'Preventive' },
  { id:'A.7.3',  domain:'A.7', dn:'Physical controls', name:'Securing offices, rooms and facilities',           type:'Preventive' },
  { id:'A.7.4',  domain:'A.7', dn:'Physical controls', name:'Physical security monitoring',                     type:'Detective',  cyber:true },
  { id:'A.7.5',  domain:'A.7', dn:'Physical controls', name:'Protecting against physical and environmental threats', type:'Preventive' },
  { id:'A.7.6',  domain:'A.7', dn:'Physical controls', name:'Working in secure areas',                          type:'Preventive' },
  { id:'A.7.7',  domain:'A.7', dn:'Physical controls', name:'Clear desk and clear screen',                      type:'Preventive' },
  { id:'A.7.8',  domain:'A.7', dn:'Physical controls', name:'Equipment siting and protection',                  type:'Preventive' },
  { id:'A.7.9',  domain:'A.7', dn:'Physical controls', name:'Security of assets off-premises',                  type:'Preventive' },
  { id:'A.7.10', domain:'A.7', dn:'Physical controls', name:'Storage media',                                    type:'Preventive' },
  { id:'A.7.11', domain:'A.7', dn:'Physical controls', name:'Supporting utilities',                             type:'Preventive' },
  { id:'A.7.12', domain:'A.7', dn:'Physical controls', name:'Cabling security',                                 type:'Preventive' },
  { id:'A.7.13', domain:'A.7', dn:'Physical controls', name:'Equipment maintenance',                            type:'Preventive' },
  { id:'A.7.14', domain:'A.7', dn:'Physical controls', name:'Secure disposal or re-use of equipment',          type:'Preventive' },
  // A.8 Technological
  { id:'A.8.1',  domain:'A.8', dn:'Technological controls', name:'User end point devices',                      type:'Preventive' },
  { id:'A.8.2',  domain:'A.8', dn:'Technological controls', name:'Privileged access rights',                    type:'Preventive' },
  { id:'A.8.3',  domain:'A.8', dn:'Technological controls', name:'Information access restriction',              type:'Preventive' },
  { id:'A.8.4',  domain:'A.8', dn:'Technological controls', name:'Access to source code',                       type:'Preventive' },
  { id:'A.8.5',  domain:'A.8', dn:'Technological controls', name:'Secure authentication',                       type:'Preventive' },
  { id:'A.8.6',  domain:'A.8', dn:'Technological controls', name:'Capacity management',                         type:'Preventive' },
  { id:'A.8.7',  domain:'A.8', dn:'Technological controls', name:'Protection against malware',                  type:'Preventive', cyber:true },
  { id:'A.8.8',  domain:'A.8', dn:'Technological controls', name:'Management of technical vulnerabilities',     type:'Preventive', cyber:true },
  { id:'A.8.9',  domain:'A.8', dn:'Technological controls', name:'Configuration management',                    type:'Preventive', cyber:true },
  { id:'A.8.10', domain:'A.8', dn:'Technological controls', name:'Information deletion',                        type:'Preventive' },
  { id:'A.8.11', domain:'A.8', dn:'Technological controls', name:'Data masking',                                type:'Preventive' },
  { id:'A.8.12', domain:'A.8', dn:'Technological controls', name:'Data leakage prevention',                     type:'Preventive', cyber:true },
  { id:'A.8.13', domain:'A.8', dn:'Technological controls', name:'Information backup',                          type:'Corrective' },
  { id:'A.8.14', domain:'A.8', dn:'Technological controls', name:'Redundancy of information processing facilities', type:'Preventive' },
  { id:'A.8.15', domain:'A.8', dn:'Technological controls', name:'Logging',                                     type:'Detective',  cyber:true },
  { id:'A.8.16', domain:'A.8', dn:'Technological controls', name:'Monitoring activities',                       type:'Detective',  cyber:true },
  { id:'A.8.17', domain:'A.8', dn:'Technological controls', name:'Clock synchronisation',                       type:'Detective' },
  { id:'A.8.18', domain:'A.8', dn:'Technological controls', name:'Use of privileged utility programs',          type:'Preventive' },
  { id:'A.8.19', domain:'A.8', dn:'Technological controls', name:'Installation of software on operational systems', type:'Preventive' },
  { id:'A.8.20', domain:'A.8', dn:'Technological controls', name:'Networks security',                           type:'Preventive', cyber:true },
  { id:'A.8.21', domain:'A.8', dn:'Technological controls', name:'Security of network services',                type:'Preventive' },
  { id:'A.8.22', domain:'A.8', dn:'Technological controls', name:'Segregation of networks',                     type:'Preventive' },
  { id:'A.8.23', domain:'A.8', dn:'Technological controls', name:'Web filtering',                               type:'Preventive', cyber:true },
  { id:'A.8.24', domain:'A.8', dn:'Technological controls', name:'Use of cryptography',                         type:'Preventive', cyber:true },
  { id:'A.8.25', domain:'A.8', dn:'Technological controls', name:'Secure development life cycle',               type:'Preventive' },
  { id:'A.8.26', domain:'A.8', dn:'Technological controls', name:'Application security requirements',           type:'Preventive' },
  { id:'A.8.27', domain:'A.8', dn:'Technological controls', name:'Secure system architecture and engineering principles', type:'Preventive', cyber:true },
  { id:'A.8.28', domain:'A.8', dn:'Technological controls', name:'Secure coding',                               type:'Preventive' },
  { id:'A.8.29', domain:'A.8', dn:'Technological controls', name:'Security testing in development and acceptance', type:'Preventive' },
  { id:'A.8.30', domain:'A.8', dn:'Technological controls', name:'Outsourced development',                      type:'Preventive' },
  { id:'A.8.31', domain:'A.8', dn:'Technological controls', name:'Separation of development, test and production environments', type:'Preventive' },
  { id:'A.8.32', domain:'A.8', dn:'Technological controls', name:'Change management',                           type:'Preventive' },
  { id:'A.8.33', domain:'A.8', dn:'Technological controls', name:'Test information',                            type:'Preventive' },
  { id:'A.8.34', domain:'A.8', dn:'Technological controls', name:'Protection of information systems during audit testing', type:'Preventive' },
];

async function seedControls() {
  const { rowCount } = await guardedPool(`SELECT 1 FROM iso27001_controls LIMIT 1`);
  if (rowCount > 0) return;
  for (const c of CONTROLS) {
    await guardedPool(
      `INSERT INTO iso27001_controls (control_id, domain, domain_name, control_name, control_type, cybersecurity)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (control_id) DO NOTHING`,
      [c.id, c.domain, c.dn, c.name, c.type, c.cyber || false]
    );
  }
}

// ── Control queries ───────────────────────────────────────────────────────────
export async function listControls(tenantId, filters = {}) {
  const { domain, applicability, status } = filters;
  const conds = [];
  const vals  = [tenantId];
  let idx = 2;
  if (domain)        { conds.push(`c.domain = $${idx++}`);                   vals.push(domain.toUpperCase()); }
  if (applicability) { conds.push(`COALESCE(e.applicability,$1) = $${idx++}`); vals.push(applicability); }
  if (status)        { conds.push(`COALESCE(e.implementation_status,'not_started') = $${idx++}`); vals.push(status); }

  const where = conds.length ? `AND ${conds.join(' AND ')}` : '';
  const { rows } = await guardedPool(
    `SELECT c.control_id, c.domain, c.domain_name, c.control_name, c.control_type, c.cybersecurity,
            COALESCE(e.applicability,'not_assessed')           AS applicability,
            COALESCE(e.implementation_status,'not_started')   AS implementation_status,
            e.owner, e.maturity_score, e.last_review, e.updated_at
     FROM iso27001_controls c
     LEFT JOIN iso27001_evidence e ON e.control_id = c.control_id AND e.tenant_id = $1
     WHERE 1=1 ${where}
     ORDER BY c.control_id`,
    vals
  );
  return rows;
}

export async function getControlDetail(controlId, tenantId) {
  const { rows } = await guardedPool(
    `SELECT c.*, e.applicability, e.justification, e.implementation_status,
            e.owner, e.evidence_text, e.evidence_url, e.maturity_score,
            e.last_review, e.notes, e.updated_at
     FROM iso27001_controls c
     LEFT JOIN iso27001_evidence e ON e.control_id = c.control_id AND e.tenant_id = $2
     WHERE c.control_id = $1`,
    [controlId, tenantId]
  );
  if (!rows.length) throw new Error(`Control ${controlId} not found`);
  return rows[0];
}

export async function upsertControlEvidence(tenantId, controlId, data) {
  const { applicability, justification, implementationStatus, owner, evidenceText, evidenceUrl, maturityScore, notes, reviewedBy } = data;
  const { rows } = await guardedPool(
    `INSERT INTO iso27001_evidence
       (tenant_id, control_id, applicability, justification, implementation_status, owner, evidence_text, evidence_url, maturity_score, notes, reviewed_by, last_review, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, CURRENT_DATE, NOW())
     ON CONFLICT (tenant_id, control_id) DO UPDATE
       SET applicability = EXCLUDED.applicability,
           justification = COALESCE(EXCLUDED.justification, iso27001_evidence.justification),
           implementation_status = EXCLUDED.implementation_status,
           owner = COALESCE(EXCLUDED.owner, iso27001_evidence.owner),
           evidence_text = COALESCE(EXCLUDED.evidence_text, iso27001_evidence.evidence_text),
           evidence_url = COALESCE(EXCLUDED.evidence_url, iso27001_evidence.evidence_url),
           maturity_score = EXCLUDED.maturity_score,
           notes = COALESCE(EXCLUDED.notes, iso27001_evidence.notes),
           reviewed_by = EXCLUDED.reviewed_by,
           last_review = CURRENT_DATE,
           updated_at = NOW()
     RETURNING control_id, applicability, implementation_status, maturity_score, updated_at`,
    [
      tenantId, controlId,
      applicability || 'applicable',
      justification || null,
      implementationStatus || 'not_started',
      owner || null,
      evidenceText || null,
      evidenceUrl || null,
      Math.min(Math.max(Number(maturityScore) || 0, 0), 5),
      notes || null,
      reviewedBy || null,
    ]
  );
  return rows[0];
}

// ── Domain-level maturity scorecard ──────────────────────────────────────────
export async function getMaturityScorecard(tenantId) {
  const { rows } = await guardedPool(
    `SELECT c.domain, c.domain_name,
            COUNT(c.control_id)                                      AS total,
            COUNT(e.control_id)                                      AS assessed,
            COALESCE(SUM(e.maturity_score), 0)                       AS earned,
            COUNT(c.control_id) * 5                                  AS max_score,
            COUNT(c.control_id) FILTER (WHERE e.applicability = 'not_applicable') AS not_applicable,
            COUNT(c.control_id) FILTER (WHERE e.implementation_status = 'in_place') AS in_place
     FROM iso27001_controls c
     LEFT JOIN iso27001_evidence e ON e.control_id = c.control_id AND e.tenant_id = $1
     GROUP BY c.domain, c.domain_name
     ORDER BY c.domain`,
    [tenantId]
  );

  const totalEarned = rows.reduce((s, r) => s + Number(r.earned), 0);
  const totalMax    = rows.reduce((s, r) => s + Number(r.max_score), 0);
  const overall     = totalMax > 0 ? Math.round((totalEarned / totalMax) * 100) : 0;

  const domains = rows.map(r => ({
    domain: r.domain,
    domainName: r.domain_name,
    total: Number(r.total),
    assessed: Number(r.assessed),
    inPlace: Number(r.in_place),
    notApplicable: Number(r.not_applicable),
    earnedScore: Number(r.earned),
    maxScore: Number(r.max_score),
    maturityPct: Number(r.max_score) > 0 ? Math.round((Number(r.earned) / Number(r.max_score)) * 100) : 0,
  }));

  return { overall, totalControls: CONTROLS.length, domains };
}

// ── Statement of Applicability (SoA) ─────────────────────────────────────────
export async function generateSoA(tenantId) {
  const controls = await listControls(tenantId);
  const applicable   = controls.filter(c => c.applicability !== 'not_applicable');
  const notApplicable = controls.filter(c => c.applicability === 'not_applicable');
  const inPlace      = controls.filter(c => c.implementation_status === 'in_place');
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalControls: controls.length,
      applicable: applicable.length,
      notApplicable: notApplicable.length,
      inPlace: inPlace.length,
      coveragePct: applicable.length > 0 ? Math.round((inPlace.length / applicable.length) * 100) : 0,
    },
    controls,
  };
}

// ── Risk register ─────────────────────────────────────────────────────────────
export async function addRisk(tenantId, data) {
  const { controlId, riskTitle, threat, vulnerability, likelihood, impact, treatment, owner, dueDate } = data;
  const { rows } = await guardedPool(
    `INSERT INTO iso27001_risk_register
       (tenant_id, control_id, risk_title, threat, vulnerability, likelihood, impact, treatment, residual_score, owner, due_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id, risk_title, risk_score, treatment, status, created_at`,
    [
      tenantId, controlId || null, riskTitle, threat || null, vulnerability || null,
      Math.min(Math.max(Number(likelihood) || 3, 1), 5),
      Math.min(Math.max(Number(impact) || 3, 1), 5),
      treatment || 'mitigate',
      0, owner || null, dueDate || null,
    ]
  );
  return rows[0];
}

export async function listRisks(tenantId, filters = {}) {
  const { status, treatment, limit = 50 } = filters;
  const conds = ['tenant_id = $1'];
  const vals  = [tenantId];
  let idx = 2;
  if (status)    { conds.push(`status = $${idx++}`);    vals.push(status); }
  if (treatment) { conds.push(`treatment = $${idx++}`); vals.push(treatment); }
  vals.push(Math.min(Number(limit) || 50, 200));
  const { rows } = await guardedPool(
    `SELECT id, control_id, risk_title, threat, likelihood, impact, risk_score, treatment, residual_score, status, owner, due_date, created_at
     FROM iso27001_risk_register WHERE ${conds.join(' AND ')} ORDER BY risk_score DESC LIMIT $${idx}`,
    vals
  );
  return rows;
}

export async function updateRisk(id, tenantId, updates) {
  const { status, residualScore, treatment, owner } = updates;
  const { rows } = await guardedPool(
    `UPDATE iso27001_risk_register
     SET status = COALESCE($1, status),
         residual_score = COALESCE($2, residual_score),
         treatment = COALESCE($3, treatment),
         owner = COALESCE($4, owner)
     WHERE id = $5 AND tenant_id = $6
     RETURNING id, status, residual_score, treatment`,
    [status || null, residualScore != null ? Number(residualScore) : null, treatment || null, owner || null, id, tenantId]
  );
  if (!rows.length) throw new Error('Risk not found');
  return rows[0];
}
