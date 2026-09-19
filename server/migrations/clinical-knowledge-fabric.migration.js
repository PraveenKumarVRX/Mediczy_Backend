/**
 * Migration: Specialty-Wise Clinical Knowledge Fabric
 * =====================================================
 * Adds the schema for a structured, per-specialty knowledge base that
 * feeds CDSS (cdss.service.js) and clinical copilots with red-flag
 * criteria, referral criteria, monitoring reminders, and documentation
 * prompts — organized by clinical domain (specialty/department).
 *
 * Governance note (per CLAUDE.md SaMD rules): every rule is inserted with
 * status='draft'. Nothing here is served to a clinical workflow until a
 * medical director approves it via governanceService.proposeChange() →
 * approveChange(), same as every other AI-adjacent change in this platform.
 * Seed content below is illustrative/conservative (red-flag and monitoring
 * reminders, not dosing algorithms) and is explicitly not production-ready
 * clinical guidance until reviewed.
 *
 * Safe to run multiple times (IF NOT EXISTS / ON CONFLICT DO NOTHING).
 */

import pool from '../db/pgPool.js';

export async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS clinical_knowledge_domains (
        id               SERIAL PRIMARY KEY,
        domain_key       TEXT UNIQUE NOT NULL,
        label            TEXT NOT NULL,
        parent_specialty TEXT,
        description      TEXT,
        created_at       TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ clinical_knowledge_domains: created');

    await client.query(`
      CREATE TABLE IF NOT EXISTS clinical_knowledge_rules (
        id                   SERIAL PRIMARY KEY,
        domain_key           TEXT NOT NULL REFERENCES clinical_knowledge_domains(domain_key),
        rule_type            TEXT NOT NULL
                               CHECK (rule_type IN (
                                 'red_flag', 'referral_criterion', 'monitoring_reminder',
                                 'order_set_prompt', 'documentation_prompt'
                               )),
        title                TEXT NOT NULL,
        condition_text       TEXT NOT NULL,
        recommendation_text  TEXT NOT NULL,
        evidence_source      TEXT,
        confidence_level     TEXT NOT NULL DEFAULT 'illustrative'
                               CHECK (confidence_level IN ('illustrative', 'moderate', 'high')),
        status               TEXT NOT NULL DEFAULT 'draft'
                               CHECK (status IN ('draft', 'under_review', 'approved', 'deprecated', 'rejected')),
        version              INT NOT NULL DEFAULT 1,
        created_by           TEXT DEFAULT 'ai_knowledge_fabric_seed',
        reviewed_by          TEXT,
        reviewed_at          TIMESTAMPTZ,
        governance_change_id INT,
        created_at           TIMESTAMPTZ DEFAULT NOW(),
        updated_at           TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ckr_domain_status ON clinical_knowledge_rules (domain_key, status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ckr_status ON clinical_knowledge_rules (status)`);
    console.log('✅ clinical_knowledge_rules: created');

    // ── Seed domains (priority specialties per the specialty-pathway gap analysis) ──
    const domains = [
      ['nephrology_dialysis', 'Nephrology — Dialysis', 'nephrologist', 'Chronic and acute dialysis care'],
      ['oncology_chemotherapy', 'Oncology — Chemotherapy', null, 'Medical oncology / chemotherapy administration'],
      ['ophthalmology_surgical', 'Ophthalmology — Surgical', 'ophthalmologist', 'Cataract and other eye surgery pathway'],
      ['cardiology_cardiac_surgery', 'Cardiology / Cardiothoracic Surgery', 'cardiologist', 'Cardiac surgery and post-op recovery'],
      ['orthopaedics_surgical', 'Orthopaedics — Surgical', 'orthopedic', 'Joint replacement and orthopaedic procedures'],
    ];
    for (const [domain_key, label, parent_specialty, description] of domains) {
      await client.query(
        `INSERT INTO clinical_knowledge_domains (domain_key, label, parent_specialty, description)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (domain_key) DO NOTHING`,
        [domain_key, label, parent_specialty, description]
      );
    }
    console.log(`✅ clinical_knowledge_domains: ${domains.length} seeded`);

    // ── Seed illustrative DRAFT rules — conservative, red-flag/reminder style,
    //    not dosing algorithms. All status='draft'; require governance approval
    //    before any CDSS/copilot surface serves them. ─────────────────────────
    const rules = [
      ['nephrology_dialysis', 'red_flag', 'Intradialytic hypotension pattern',
        'Repeated intradialytic hypotension episodes, or a post-dialysis systolic BP drop of more than 20 mmHg from pre-dialysis baseline.',
        'Flag for nephrologist review of dry weight and ultrafiltration rate; consider extending session time or reducing UF rate, per general nephrology consensus practice.',
        'General nephrology consensus (KDIGO-aligned) — illustrative, pending clinical review.'],
      ['nephrology_dialysis', 'monitoring_reminder', 'Vascular access surveillance',
        'Patient is on hemodialysis via an AV fistula, AV graft, or central catheter.',
        'Prompt documentation of access-site inspection (thrill/bruit for fistula/graft, signs of infection) at every session, per standard vascular-access surveillance practice.',
        'General vascular-access care consensus — illustrative, pending clinical review.'],

      ['oncology_chemotherapy', 'red_flag', 'Suspected extravasation during vesicant infusion',
        'Patient reports pain, burning, or swelling at the IV site during a vesicant chemotherapy infusion.',
        'Stop the infusion immediately, do not flush the line, and follow the institutional extravasation protocol; document severity using standard CTCAE grading.',
        'General oncology nursing consensus — illustrative, pending clinical review.'],
      ['oncology_chemotherapy', 'documentation_prompt', 'Pre-cycle chemotherapy safety checklist',
        'Before administration of each chemotherapy cycle.',
        'Confirm current labs (CBC, renal/hepatic function), current height/weight for BSA recalculation, and premedication administered before the cytotoxic infusion starts.',
        'General oncology safety-checklist consensus — illustrative, pending clinical review.'],

      ['ophthalmology_surgical', 'documentation_prompt', 'IOL power/model traceability',
        'A cataract surgery with intraocular lens (IOL) implantation is being documented.',
        'Record IOL power, model, and lot number in the operative note for traceability and post-operative refraction planning.',
        'General ophthalmic surgical documentation practice — illustrative, pending clinical review.'],
      ['ophthalmology_surgical', 'red_flag', 'Post-operative endophthalmitis warning signs',
        'A post-cataract-surgery follow-up visit, at any interval.',
        'Screen explicitly for pain, redness, and vision drop as possible endophthalmitis signs; treat as an ophthalmic emergency if suspected and escalate immediately.',
        'General ophthalmology consensus (AAO-aligned) — illustrative, pending clinical review.'],

      ['cardiology_cardiac_surgery', 'red_flag', 'Post-CABG low cardiac output signs',
        'Patient is in post-cardiac-surgery ICU recovery.',
        'Flag for urgent review if signs of low cardiac output appear (hypotension, oliguria, cool extremities, rising lactate), per standard post-cardiotomy monitoring practice.',
        'General cardiac-surgery post-op consensus — illustrative, pending clinical review.'],
      ['cardiology_cardiac_surgery', 'documentation_prompt', 'Procedure-specific operative note fields',
        'A CABG or PCI procedure note is being documented.',
        'Ensure documentation includes the graft/vessel targeted (CABG) or stent type and size (PCI), plus the post-procedure anticoagulation plan.',
        'General cardiology/cardiac-surgery documentation practice — illustrative, pending clinical review.'],

      ['orthopaedics_surgical', 'documentation_prompt', 'Implant traceability',
        'A joint-replacement or other implant procedure is being documented.',
        'Record implant manufacturer, model, and size in the operative note for recall traceability, consistent with standard implant-registry practice.',
        'General orthopaedic implant-registry consensus — illustrative, pending clinical review.'],
      ['orthopaedics_surgical', 'monitoring_reminder', 'Post-operative VTE prophylaxis reminder',
        'Patient is post major joint-replacement surgery.',
        'Confirm a VTE prophylaxis plan is documented and initiated per standard orthopaedic post-operative practice, unless specifically contraindicated.',
        'General orthopaedic post-op consensus — illustrative, pending clinical review.'],
    ];

    for (const [domain_key, rule_type, title, condition_text, recommendation_text, evidence_source] of rules) {
      await client.query(
        `INSERT INTO clinical_knowledge_rules
           (domain_key, rule_type, title, condition_text, recommendation_text, evidence_source, confidence_level, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'illustrative', 'draft')
         ON CONFLICT DO NOTHING`,
        [domain_key, rule_type, title, condition_text, recommendation_text, evidence_source]
      );
    }
    console.log(`✅ clinical_knowledge_rules: ${rules.length} illustrative draft rules seeded (all pending medical-director review)`);

    await client.query('COMMIT');
    console.log('✅ Clinical Knowledge Fabric migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function down() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DROP TABLE IF EXISTS clinical_knowledge_rules');
    await client.query('DROP TABLE IF EXISTS clinical_knowledge_domains');
    await client.query('COMMIT');
    console.log('✅ Clinical Knowledge Fabric migration rolled back');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Run as standalone: node clinical-knowledge-fabric.migration.js
if (process.argv[1] && process.argv[1].includes('clinical-knowledge-fabric')) {
  up().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
}
