/**
 * Migration: SaMD Regulatory Compliance — Items 11–16
 * Covers: Clinical Validation (11,12), ISO 13485 QMS (13),
 *         IEC 62304 Software Lifecycle (14), ISO 14971 Risk Management (15),
 *         CDSCO Regulatory Filing (16)
 */
import pool from '../db/pgPool.js';

export async function runSamdRegulatoryMigration() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Item 11 & 12: Clinical Validation ─────────────────────────────────────

    await client.query(`
      CREATE TABLE IF NOT EXISTS clinical_validation_studies (
        id              SERIAL PRIMARY KEY,
        study_name      TEXT NOT NULL,
        model_component TEXT NOT NULL,
        study_type      TEXT NOT NULL CHECK (study_type IN ('prospective','retrospective','synthetic')),
        status          TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('planning','active','completed','archived')),
        n_samples       INTEGER DEFAULT 0,
        n_positive      INTEGER DEFAULT 0,
        auroc           FLOAT,
        auprc           FLOAT,
        brier_score     FLOAT,
        calibration_slope FLOAT,
        sensitivity_at_threshold JSONB,
        specificity_at_threshold JSONB,
        ppv             FLOAT,
        npv             FLOAT,
        cohens_kappa    FLOAT,
        threshold_used  FLOAT DEFAULT 0.5,
        confidence_interval_95 JSONB,
        started_at      TIMESTAMPTZ DEFAULT NOW(),
        completed_at    TIMESTAMPTZ,
        validated_by    TEXT,
        notes           TEXT,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS clinical_validation_ground_truth (
        id              SERIAL PRIMARY KEY,
        study_id        INTEGER REFERENCES clinical_validation_studies(id) ON DELETE CASCADE,
        patient_id      INTEGER,
        prediction_raw  FLOAT NOT NULL,
        prediction_class TEXT,
        ground_truth    BOOLEAN NOT NULL,
        outcome_type    TEXT,
        recorded_at     TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cvgt_study ON clinical_validation_ground_truth(study_id)`
    );

    // ── Item 13: ISO 13485 QMS ────────────────────────────────────────────────

    await client.query(`
      CREATE TABLE IF NOT EXISTS qms_documents (
        id              SERIAL PRIMARY KEY,
        doc_number      TEXT UNIQUE NOT NULL,
        title           TEXT NOT NULL,
        doc_type        TEXT NOT NULL CHECK (doc_type IN ('SOP','WI','Policy','Form','Record','Template')),
        version         TEXT NOT NULL DEFAULT '1.0',
        status          TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','under_review','approved','obsolete')),
        owner           TEXT,
        approver        TEXT,
        effective_date  DATE,
        review_date     DATE,
        content_summary TEXT,
        file_path       TEXT,
        change_history  JSONB DEFAULT '[]',
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS qms_non_conformances (
        id              SERIAL PRIMARY KEY,
        ncr_number      TEXT UNIQUE NOT NULL,
        title           TEXT NOT NULL,
        description     TEXT NOT NULL,
        source          TEXT CHECK (source IN ('internal_audit','customer_complaint','supplier','process','product','regulatory')),
        severity        TEXT CHECK (severity IN ('critical','major','minor','observation')),
        status          TEXT DEFAULT 'open'
                        CHECK (status IN ('open','under_investigation','capa_raised','closed','verified')),
        detected_by     TEXT,
        detected_at     TIMESTAMPTZ DEFAULT NOW(),
        root_cause      TEXT,
        immediate_action TEXT,
        capa_required   BOOLEAN DEFAULT false,
        closed_at       TIMESTAMPTZ,
        verified_by     TEXT,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS qms_capa (
        id              SERIAL PRIMARY KEY,
        capa_number     TEXT UNIQUE NOT NULL,
        ncr_id          INTEGER REFERENCES qms_non_conformances(id),
        title           TEXT NOT NULL,
        capa_type       TEXT CHECK (capa_type IN ('corrective','preventive','both')),
        root_cause_analysis TEXT,
        action_plan     JSONB DEFAULT '[]',
        responsible     TEXT,
        target_date     DATE,
        status          TEXT DEFAULT 'open'
                        CHECK (status IN ('open','in_progress','implemented','verified','closed')),
        effectiveness_check TEXT,
        verified_at     TIMESTAMPTZ,
        verified_by     TEXT,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS qms_audit_records (
        id              SERIAL PRIMARY KEY,
        audit_number    TEXT UNIQUE NOT NULL,
        audit_type      TEXT CHECK (audit_type IN ('internal','external','supplier','regulatory')),
        scope           TEXT NOT NULL,
        audit_date      DATE NOT NULL,
        lead_auditor    TEXT,
        auditees        JSONB DEFAULT '[]',
        findings        JSONB DEFAULT '[]',
        ncr_count       INTEGER DEFAULT 0,
        observation_count INTEGER DEFAULT 0,
        overall_result  TEXT CHECK (overall_result IN ('satisfactory','minor_findings','major_findings','critical_findings')),
        report_file     TEXT,
        follow_up_date  DATE,
        closed_at       TIMESTAMPTZ,
        created_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── Item 14: IEC 62304 Software Lifecycle ─────────────────────────────────

    await client.query(`
      CREATE TABLE IF NOT EXISTS iec62304_software_items (
        id              SERIAL PRIMARY KEY,
        item_id         TEXT UNIQUE NOT NULL,
        name            TEXT NOT NULL,
        item_type       TEXT CHECK (item_type IN ('system','unit','soup','library','service')),
        safety_class    TEXT CHECK (safety_class IN ('A','B','C')),
        version         TEXT,
        description     TEXT,
        file_paths      JSONB DEFAULT '[]',
        dependencies    JSONB DEFAULT '[]',
        soup_reference  TEXT,
        manufacturer    TEXT,
        known_anomalies JSONB DEFAULT '[]',
        verification_status TEXT DEFAULT 'pending'
                        CHECK (verification_status IN ('pending','in_progress','verified','failed')),
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS iec62304_requirements (
        id              SERIAL PRIMARY KEY,
        req_id          TEXT UNIQUE NOT NULL,
        software_item_id INTEGER REFERENCES iec62304_software_items(id),
        title           TEXT NOT NULL,
        description     TEXT NOT NULL,
        req_type        TEXT CHECK (req_type IN ('functional','performance','safety','security','interface')),
        priority        TEXT CHECK (priority IN ('shall','should','may')),
        verification_method TEXT CHECK (verification_method IN ('test','review','inspection','analysis')),
        test_reference  TEXT,
        status          TEXT DEFAULT 'defined'
                        CHECK (status IN ('defined','implemented','verified','failed')),
        created_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS iec62304_anomalies (
        id              SERIAL PRIMARY KEY,
        anomaly_id      TEXT UNIQUE NOT NULL,
        software_item_id INTEGER REFERENCES iec62304_software_items(id),
        title           TEXT NOT NULL,
        description     TEXT NOT NULL,
        severity        TEXT CHECK (severity IN ('critical','major','minor','enhancement')),
        safety_impact   BOOLEAN DEFAULT false,
        status          TEXT DEFAULT 'open'
                        CHECK (status IN ('open','investigating','resolved','deferred','wont_fix')),
        detected_at     TIMESTAMPTZ DEFAULT NOW(),
        detected_in_version TEXT,
        resolved_at     TIMESTAMPTZ,
        resolved_in_version TEXT,
        resolution      TEXT,
        created_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── Item 15: ISO 14971 Risk Management ───────────────────────────────────

    await client.query(`
      CREATE TABLE IF NOT EXISTS iso14971_hazards (
        id                  SERIAL PRIMARY KEY,
        hazard_id           TEXT UNIQUE NOT NULL,
        hazard_category     TEXT NOT NULL,
        hazard_description  TEXT NOT NULL,
        hazardous_situation TEXT NOT NULL,
        foreseeable_harm    TEXT NOT NULL,
        severity            INTEGER CHECK (severity BETWEEN 1 AND 5),
        probability         INTEGER CHECK (probability BETWEEN 1 AND 5),
        risk_priority_number INTEGER GENERATED ALWAYS AS (severity * probability) STORED,
        risk_level          TEXT,
        affected_users      JSONB DEFAULT '[]',
        software_item_id    INTEGER,
        ai_component        TEXT,
        status              TEXT DEFAULT 'open'
                            CHECK (status IN ('open','mitigated','accepted','eliminated')),
        created_at          TIMESTAMPTZ DEFAULT NOW(),
        updated_at          TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS iso14971_risk_controls (
        id              SERIAL PRIMARY KEY,
        hazard_id       INTEGER REFERENCES iso14971_hazards(id) ON DELETE CASCADE,
        control_type    TEXT CHECK (control_type IN ('inherent_safety','protective_measure','information_for_safety')),
        description     TEXT NOT NULL,
        implementation  TEXT,
        verified        BOOLEAN DEFAULT false,
        verification_method TEXT,
        residual_severity   INTEGER CHECK (residual_severity BETWEEN 1 AND 5),
        residual_probability INTEGER CHECK (residual_probability BETWEEN 1 AND 5),
        residual_rpn    INTEGER GENERATED ALWAYS AS (residual_severity * residual_probability) STORED,
        residual_acceptable BOOLEAN,
        implemented_at  TIMESTAMPTZ,
        verified_at     TIMESTAMPTZ,
        created_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS iso14971_benefit_risk (
        id              SERIAL PRIMARY KEY,
        analysis_version TEXT NOT NULL DEFAULT '1.0',
        analysis_date   TIMESTAMPTZ DEFAULT NOW(),
        overall_residual_risk TEXT,
        benefit_description TEXT,
        benefit_evidence TEXT,
        risk_benefit_conclusion TEXT CHECK (risk_benefit_conclusion IN ('benefits_outweigh_risks','risks_outweigh_benefits','inconclusive')),
        approved_by     TEXT,
        approved_at     TIMESTAMPTZ,
        notes           TEXT,
        created_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── Item 16: CDSCO Regulatory Filing ─────────────────────────────────────

    await client.query(`
      CREATE TABLE IF NOT EXISTS cdsco_submissions (
        id              SERIAL PRIMARY KEY,
        submission_ref  TEXT UNIQUE NOT NULL,
        device_name     TEXT NOT NULL,
        device_class    TEXT CHECK (device_class IN ('A','B','C','D')),
        regulation      TEXT DEFAULT 'MDR2017',
        submission_type TEXT CHECK (submission_type IN ('new','amendment','renewal','post_market')),
        status          TEXT DEFAULT 'preparation'
                        CHECK (status IN ('preparation','internal_review','submitted','under_review','approved','rejected','withdrawn')),
        submitted_at    TIMESTAMPTZ,
        cdsco_ref_number TEXT,
        review_outcome  TEXT,
        approved_at     TIMESTAMPTZ,
        validity_period INTEGER,
        notes           TEXT,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS cdsco_checklist (
        id              SERIAL PRIMARY KEY,
        submission_id   INTEGER REFERENCES cdsco_submissions(id) ON DELETE CASCADE,
        section         TEXT NOT NULL,
        item_number     TEXT NOT NULL,
        requirement     TEXT NOT NULL,
        status          TEXT DEFAULT 'pending'
                        CHECK (status IN ('pending','in_progress','completed','not_applicable','waiver_requested')),
        evidence_ref    TEXT,
        responsible     TEXT,
        due_date        DATE,
        completed_at    TIMESTAMPTZ,
        notes           TEXT,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (submission_id, item_number)
      )
    `);

    await client.query('COMMIT');
    console.log('[Migration] SaMD regulatory compliance tables created (items 11-16)');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSamdRegulatoryMigration()
    .then(() => process.exit(0))
    .catch(err => { console.error(err); process.exit(1); });
}
