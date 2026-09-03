/**
 * Migration: Specialty Clinical Modules
 * Upgrade Plan Track B, Phase B5.
 *
 * Seeds cardiology and oncology with real, guideline-referenced starter
 * content — order sets, CDS rules, documentation templates — for the
 * hospital's own credentialed clinical staff to review, customize, and
 * approve through the workflow in services/specialty-module.service.js.
 * Everything below is seeded at status='draft': it is content to review,
 * not content that has been reviewed. Nothing reaches a clinician-facing
 * endpoint (getLive*) until someone at the hospital calls approve() with
 * their own reviewerCredential — that step is intentionally still a human
 * one, recorded and attributable, regardless of who authored the draft.
 *
 * Order-set items and CDS thresholds here are drawn from widely-published,
 * named guidelines (ACC/AHA, ESC/ACC/AHA/WHF, NCCN) at a standard-of-care
 * level — not institution-specific dosing, brand selection, or anything
 * that varies by local formulary/protocol. Those specifics are exactly
 * what the hospital's review step should adapt before approval.
 */
import pool from '../db/pgPool.js';

const cardiologyOrderSets = [
  {
    name: 'Chest Pain — Initial ACS Rule-Out Workup',
    items: [
      { type: 'diagnostic', description: '12-lead ECG within 10 minutes of presentation', rationale: 'Identify STEMI/ischemic changes early — time-critical per ACC/AHA chest pain guidance' },
      { type: 'lab', description: 'High-sensitivity troponin, serial per protocol', rationale: 'Biomarker evidence of myocardial injury (Fourth Universal Definition of MI)' },
      { type: 'imaging', description: 'Chest X-ray', rationale: 'Rule out alternative causes — pneumothorax, aortic pathology, pneumonia' },
      { type: 'lab', description: 'CBC, basic metabolic panel, coagulation panel', rationale: 'Baseline labs before any intervention' },
      { type: 'medication', description: 'Aspirin 300 mg chewed, if no contraindication (active bleeding, documented allergy)', rationale: 'Standard initial antiplatelet therapy pending contraindication screen — confirm against institutional protocol/formulary' },
      { type: 'monitoring', description: 'Continuous cardiac monitoring', rationale: 'Detect arrhythmia during rule-out period' },
      { type: 'procedure', description: 'IV access', rationale: 'Readiness for escalation if ACS confirmed' },
    ],
    evidenceReference: '2021 AHA/ACC Chest Pain Guideline; Fourth Universal Definition of Myocardial Infarction (ESC/ACC/AHA/WHF)',
  },
  {
    name: 'Heart Failure — Initial Inpatient Workup',
    items: [
      { type: 'lab', description: 'BNP or NT-proBNP', rationale: 'Supports/excludes heart failure diagnosis' },
      { type: 'imaging', description: 'Echocardiogram (if not done recently)', rationale: 'Assess ejection fraction and structural findings' },
      { type: 'monitoring', description: 'Daily weights, strict intake/output', rationale: 'Track volume status during decongestion' },
      { type: 'lab', description: 'Basic metabolic panel including renal function', rationale: 'Baseline and diuretic-response monitoring' },
      { type: 'imaging', description: 'Chest X-ray', rationale: 'Assess pulmonary congestion' },
    ],
    evidenceReference: '2022 AHA/ACC/HFSA Heart Failure Guideline',
  },
];

const cardiologyCdsRules = [
  {
    name: 'Elevated troponin in chest pain workup',
    triggerCondition: { field: 'troponin_status', operator: 'eq', value: 'elevated' },
    recommendation: 'Consider urgent cardiology consultation and continuous cardiac monitoring — biomarker evidence of myocardial injury present.',
    evidenceReference: 'Fourth Universal Definition of Myocardial Infarction (ESC/ACC/AHA/WHF)',
    severity: 'critical',
  },
  {
    name: 'Reduced ejection fraction',
    triggerCondition: { field: 'ejection_fraction_pct', operator: 'lt', value: 40 },
    recommendation: 'Ejection fraction consistent with HFrEF — consider evaluation for guideline-directed medical therapy.',
    evidenceReference: '2022 AHA/ACC/HFSA Heart Failure Guideline',
    severity: 'warning',
  },
];

const cardiologyDocTemplates = [
  {
    name: 'Cardiology Follow-Up Note',
    sections: [
      { section: 'Chief Complaint', guidance: '' },
      { section: 'History of Present Illness', guidance: 'Chest pain characteristics, dyspnea, orthopnea, paroxysmal nocturnal dyspnea, edema, palpitations, exercise tolerance' },
      { section: 'Cardiac Review of Systems', guidance: '' },
      { section: 'Physical Exam', guidance: 'JVP, heart sounds/murmurs, peripheral edema, peripheral pulses, lung auscultation' },
      { section: 'Diagnostics Review', guidance: 'Relevant ECG, echocardiogram, labs since last visit' },
      { section: 'Assessment', guidance: '' },
      { section: 'Plan', guidance: 'Include medication reconciliation for cardiac medications' },
      { section: 'Follow-Up', guidance: '' },
    ],
  },
];

const oncologyOrderSets = [
  {
    name: 'New Solid Tumor Diagnosis — Initial Staging Workup Framework',
    items: [
      { type: 'lab', description: 'Complete blood count with differential', rationale: 'Baseline hematologic status before treatment planning' },
      { type: 'lab', description: 'Comprehensive metabolic panel', rationale: 'Baseline organ function' },
      { type: 'imaging', description: 'Tumor-site-appropriate staging imaging (CT/MRI/PET as clinically indicated for the specific tumor type)', rationale: 'Actual staging imaging is disease-specific — select per NCCN guideline for the confirmed tumor type' },
      { type: 'procedure', description: 'Confirm pathology/biopsy review complete, including relevant biomarker/molecular testing', rationale: 'Treatment planning requires confirmed histology and, for many tumor types, molecular markers' },
      { type: 'procedure', description: 'Multidisciplinary tumor board discussion', rationale: 'Standard practice before finalizing a treatment plan for a new solid tumor diagnosis' },
    ],
    evidenceReference: 'NCCN Guidelines (tumor-type-specific — this framework is deliberately generic; the treating oncologist must apply the NCCN pathway for the confirmed diagnosis)',
  },
];

const oncologyCdsRules = [
  {
    name: 'Severe neutropenia',
    triggerCondition: { field: 'absolute_neutrophil_count', operator: 'lt', value: 500 },
    recommendation: 'Neutropenic precautions indicated. If fever present, evaluate urgently for febrile neutropenia — consider urgent oncology/infectious disease input.',
    evidenceReference: 'NCCN Guidelines — Prevention and Treatment of Cancer-Related Infections',
    severity: 'critical',
  },
];

const oncologyDocTemplates = [
  {
    name: 'Oncology Follow-Up / Treatment Cycle Note',
    sections: [
      { section: 'Chief Complaint', guidance: '' },
      { section: 'Interval History', guidance: 'Symptoms since last visit, treatment tolerance, toxicities experienced' },
      { section: 'Performance Status', guidance: 'ECOG or Karnofsky score' },
      { section: 'Physical Exam', guidance: '' },
      { section: 'Labs/Imaging Review', guidance: 'Include tumor marker trend if applicable' },
      { section: 'Treatment Response Assessment', guidance: '' },
      { section: 'Toxicity Assessment', guidance: 'Grade per CTCAE if applicable' },
      { section: 'Assessment', guidance: '' },
      { section: 'Plan', guidance: 'Next cycle timing/adjustments, supportive care needs' },
    ],
  },
];

export async function runSpecialtyModuleMigration() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS specialty_order_sets (
        id                SERIAL PRIMARY KEY,
        specialty         VARCHAR(100) NOT NULL,
        organization_id   INTEGER,
        name              VARCHAR(255) NOT NULL,
        items             JSONB        NOT NULL DEFAULT '[]'::jsonb,
        evidence_reference TEXT,
        status            VARCHAR(20)  NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'approved', 'retired')),
        created_by        INTEGER,
        reviewed_by       INTEGER,
        reviewer_credential TEXT,
        reviewed_at       TIMESTAMPTZ,
        created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_specialty_order_sets_lookup ON specialty_order_sets (specialty, status)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS specialty_documentation_templates (
        id                SERIAL PRIMARY KEY,
        specialty         VARCHAR(100) NOT NULL,
        organization_id   INTEGER,
        name              VARCHAR(255) NOT NULL,
        sections          JSONB        NOT NULL DEFAULT '[]'::jsonb,
        status            VARCHAR(20)  NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'approved', 'retired')),
        created_by        INTEGER,
        reviewed_by       INTEGER,
        reviewer_credential TEXT,
        reviewed_at       TIMESTAMPTZ,
        created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_specialty_doc_templates_lookup ON specialty_documentation_templates (specialty, status)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS specialty_cds_rules (
        id                  SERIAL PRIMARY KEY,
        specialty           VARCHAR(100) NOT NULL,
        organization_id     INTEGER,
        name                VARCHAR(255) NOT NULL,
        trigger_condition   JSONB        NOT NULL,
        recommendation      TEXT         NOT NULL,
        evidence_reference  TEXT,
        severity            VARCHAR(20)  NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
        status              VARCHAR(20)  NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'approved', 'retired')),
        created_by          INTEGER,
        reviewed_by         INTEGER,
        reviewer_credential TEXT,
        reviewed_at         TIMESTAMPTZ,
        created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_specialty_cds_rules_lookup ON specialty_cds_rules (specialty, status)`);

    // Seed order sets / CDS rules / doc templates — all status='draft'.
    // Idempotent: skipped per-row if a row with that specialty+name already
    // exists, so re-running this migration never duplicates or overwrites
    // something the hospital's own reviewers have since edited.
    const seedOrderSet = async (specialty, { name, items, evidenceReference }) => {
      await client.query(
        `INSERT INTO specialty_order_sets (specialty, name, items, evidence_reference, status)
         SELECT $1, $2, $3::jsonb, $4, 'draft'
         WHERE NOT EXISTS (SELECT 1 FROM specialty_order_sets WHERE specialty = $1 AND name = $2)`,
        [specialty, name, JSON.stringify(items), evidenceReference]
      );
    };
    const seedCdsRule = async (specialty, { name, triggerCondition, recommendation, evidenceReference, severity }) => {
      await client.query(
        `INSERT INTO specialty_cds_rules (specialty, name, trigger_condition, recommendation, evidence_reference, severity, status)
         SELECT $1, $2, $3::jsonb, $4, $5, $6, 'draft'
         WHERE NOT EXISTS (SELECT 1 FROM specialty_cds_rules WHERE specialty = $1 AND name = $2)`,
        [specialty, name, JSON.stringify(triggerCondition), recommendation, evidenceReference, severity]
      );
    };
    const seedDocTemplate = async (specialty, { name, sections }) => {
      await client.query(
        `INSERT INTO specialty_documentation_templates (specialty, name, sections, status)
         SELECT $1, $2, $3::jsonb, 'draft'
         WHERE NOT EXISTS (SELECT 1 FROM specialty_documentation_templates WHERE specialty = $1 AND name = $2)`,
        [specialty, name, JSON.stringify(sections)]
      );
    };

    for (const os of cardiologyOrderSets) await seedOrderSet('cardiology', os);
    for (const rule of cardiologyCdsRules) await seedCdsRule('cardiology', rule);
    for (const tpl of cardiologyDocTemplates) await seedDocTemplate('cardiology', tpl);

    for (const os of oncologyOrderSets) await seedOrderSet('oncology', os);
    for (const rule of oncologyCdsRules) await seedCdsRule('oncology', rule);
    for (const tpl of oncologyDocTemplates) await seedDocTemplate('oncology', tpl);

    await client.query('COMMIT');
    console.log('✅ specialty-module migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ specialty-module migration failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}
