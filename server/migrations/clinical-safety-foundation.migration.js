/**
 * Migration: Clinical safety foundation (WP-1.1 structured records, WP-1.2 prescribing safety)
 * ================================================================================================
 * Additive only; safe to run repeatedly.
 *
 *  patient_allergies        one allergy shape: adds status (active / inactive / entered_in_error / no_known_allergy),
 *                           drug_class, entered_by, substance_system. A patient with no row at all is UNKNOWN, never safe.
 *                           The legacy user array is back-filled once (source 'legacy_array'); placeholders such as 'None' or
 *                           'NKDA' are skipped — an unverified legacy 'none' is not a confirmed no-known-allergy.
 *  clinical_knowledge_rules adds a JSON payload and the 'drug_class' rule type + 'drug_class_map' domain. The drug-class
 *                           map is clinical content: it is seeded as DRAFT and only medical-director-APPROVED rows ever
 *                           change behaviour (ADR-06, existing review tab).
 *  clinical_safety_settings per-organization mode: 'shadow' (compute and log, never block; the default) or 'enforce'.
 *  prescription_safety_log  every safety evaluation and every override (audit + the medical-director dashboard).
 *  med_reconciliation(+_item) admission / transfer / discharge medicine reconciliation.
 *  patient_conditions       problem-list columns (noted_by, source encounter).
 *
 * patient_allergies / patient_conditions are protected by FORCE row-level security; this migration reads and writes
 * them under the platform-admin context, like the services do under the patient's own context.
 */
import pool from '../db/pgPool.js';

const CLASS_DRAFTS = [
  { key: 'penicillin', label: 'Penicillins',
    members: ['penicillin', 'amoxicillin', 'ampicillin', 'benzylpenicillin', 'phenoxymethylpenicillin', 'penicillin v', 'penicillin g', 'benzathine penicillin', 'flucloxacillin', 'cloxacillin', 'dicloxacillin', 'piperacillin', 'amoxycillin', 'co-amoxiclav', 'amoxicillin clavulanate', 'amoxicillin + clavulanic acid'],
    aliases: ['augmentin', 'mox', 'novamox', 'clavam'], crossReactsWith: ['cephalosporin'], atc: 'J01C' },
  { key: 'cephalosporin', label: 'Cephalosporins',
    members: ['cefixime', 'cefuroxime', 'ceftriaxone', 'cefotaxime', 'ceftazidime', 'cefazolin', 'cefpodoxime', 'cefadroxil', 'cefdinir', 'cefepime', 'cephalexin', 'cefaclor', 'cefoperazone'],
    aliases: ['taxim', 'zifi', 'monocef'], crossReactsWith: ['penicillin'], atc: 'J01D' },
  { key: 'sulfonamide', label: 'Sulfonamide antibiotics',
    members: ['sulfamethoxazole', 'co-trimoxazole', 'cotrimoxazole', 'trimethoprim sulfamethoxazole', 'sulfadiazine', 'sulfasalazine', 'sulfacetamide'],
    aliases: ['bactrim', 'septran'], crossReactsWith: [], atc: 'J01E' },
  { key: 'nsaid', label: 'NSAIDs (including aspirin)',
    members: ['ibuprofen', 'diclofenac', 'naproxen', 'ketorolac', 'aspirin', 'acetylsalicylic acid', 'indomethacin', 'piroxicam', 'meloxicam', 'etoricoxib', 'celecoxib', 'nimesulide', 'aceclofenac', 'mefenamic acid'],
    aliases: ['brufen', 'voveran', 'combiflam'], crossReactsWith: [], atc: 'M01A' },
  { key: 'macrolide', label: 'Macrolides',
    members: ['azithromycin', 'clarithromycin', 'erythromycin', 'roxithromycin'], aliases: ['azee', 'zithromax'], crossReactsWith: [], atc: 'J01FA' },
  { key: 'fluoroquinolone', label: 'Fluoroquinolones',
    members: ['ciprofloxacin', 'levofloxacin', 'ofloxacin', 'moxifloxacin', 'norfloxacin'], aliases: ['ciplox', 'levoflox'], crossReactsWith: [], atc: 'J01M' },
];

export async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── allergies: one shape ─────────────────────────────────────────────────
    if ((await client.query(`SELECT to_regclass('public.patient_allergies') AS r`)).rows[0].r) {
      await client.query(`ALTER TABLE patient_allergies ADD COLUMN IF NOT EXISTS status VARCHAR(24) NOT NULL DEFAULT 'active'`);
      await client.query(`ALTER TABLE patient_allergies DROP CONSTRAINT IF EXISTS patient_allergies_status_check`);
      await client.query(`ALTER TABLE patient_allergies ADD CONSTRAINT patient_allergies_status_check CHECK (status IN ('active','inactive','entered_in_error','no_known_allergy'))`);
      await client.query(`ALTER TABLE patient_allergies ADD COLUMN IF NOT EXISTS drug_class VARCHAR(80)`);
      await client.query(`ALTER TABLE patient_allergies ADD COLUMN IF NOT EXISTS substance_system VARCHAR(40)`);
      await client.query(`ALTER TABLE patient_allergies ADD COLUMN IF NOT EXISTS entered_by INTEGER`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_patient_allergies_status ON patient_allergies (user_id, status)`);
    } else {
      console.log('⚠️  patient_allergies does not exist here — run db/migrations/025-normalise-array-fields.sql first; allergy columns skipped');
    }
    if ((await client.query(`SELECT to_regclass('public.patient_conditions') AS r`)).rows[0].r) {
      await client.query(`ALTER TABLE patient_conditions ADD COLUMN IF NOT EXISTS noted_by INTEGER`);
      await client.query(`ALTER TABLE patient_conditions ADD COLUMN IF NOT EXISTS source_encounter_id VARCHAR(80)`);
    }

    // ── governed drug-class map (knowledge fabric) ───────────────────────────
    if ((await client.query(`SELECT to_regclass('public.clinical_knowledge_rules') AS r`)).rows[0].r) {
      await client.query(`ALTER TABLE clinical_knowledge_rules ADD COLUMN IF NOT EXISTS payload JSONB`);
      await client.query(`ALTER TABLE clinical_knowledge_rules DROP CONSTRAINT IF EXISTS clinical_knowledge_rules_rule_type_check`);
      await client.query(`ALTER TABLE clinical_knowledge_rules ADD CONSTRAINT clinical_knowledge_rules_rule_type_check
        CHECK (rule_type IN ('red_flag','referral_criterion','monitoring_reminder','order_set_prompt','documentation_prompt','drug_class'))`);
      await client.query(`INSERT INTO clinical_knowledge_domains (domain_key, label, parent_specialty, description)
        VALUES ('drug_class_map', 'Drug classes and cross-reactions', NULL, 'Which drugs belong to a class, for allergy and duplicate-therapy checks. Only approved rows affect prescribing.')
        ON CONFLICT (domain_key) DO NOTHING`);
      for (const c of CLASS_DRAFTS) {
        const exists = await client.query(`SELECT 1 FROM clinical_knowledge_rules WHERE domain_key = 'drug_class_map' AND rule_type = 'drug_class' AND title = $1`, [c.label]);
        if (exists.rowCount) continue;
        await client.query(
          `INSERT INTO clinical_knowledge_rules (domain_key, rule_type, title, condition_text, recommendation_text, evidence_source, confidence_level, status, created_by, payload)
           VALUES ('drug_class_map', 'drug_class', $1, $2, $3, $4, 'illustrative', 'draft', 'clinical_safety_seed', $5::jsonb)`,
          [c.label,
            `A patient allergic to ${c.key} (or to any member of this class). Members: ${c.members.join(', ')}.`,
            c.crossReactsWith.length ? `Block a member of this class for a documented ${c.key} allergy; warn on ${c.crossReactsWith.join(', ')} (possible cross-reaction).` : `Block a member of this class for a documented ${c.key} allergy.`,
            'Standard pharmacology references — illustrative draft. A clinician must review the member list and the cross-reaction before approval.',
            JSON.stringify({ classKey: c.key, label: c.label, members: c.members, brandAliases: c.aliases, crossReactsWith: c.crossReactsWith, atc: c.atc })]
        );
      }
    } else {
      console.log('⚠️  clinical_knowledge_rules does not exist here — drug-class drafts not seeded');
    }

    // ── safety settings, log ─────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS clinical_safety_settings (
        organization_id  INTEGER PRIMARY KEY,
        mode             VARCHAR(10) NOT NULL DEFAULT 'shadow' CHECK (mode IN ('shadow', 'enforce')),
        updated_by       INTEGER,
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS prescription_safety_log (
        id               BIGSERIAL PRIMARY KEY,
        organization_id  INTEGER,
        patient_id       INTEGER,
        actor_id         INTEGER,
        source           VARCHAR(60) NOT NULL,
        mode             VARCHAR(10) NOT NULL,
        outcome          VARCHAR(20) NOT NULL CHECK (outcome IN ('clean', 'warnings', 'blocked', 'overridden', 'error')),
        blockers         JSONB NOT NULL DEFAULT '[]'::jsonb,
        warnings         JSONB NOT NULL DEFAULT '[]'::jsonb,
        override_reason  TEXT,
        acknowledged     JSONB,
        allergy_status   VARCHAR(24),
        latency_ms       INTEGER,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_psl_org_time ON prescription_safety_log (organization_id, created_at DESC)`);

    // ── reconciliation ───────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS med_reconciliation (
        id               BIGSERIAL PRIMARY KEY,
        organization_id  INTEGER NOT NULL,
        patient_id       INTEGER NOT NULL,
        admission_id     INTEGER,
        type             VARCHAR(12) NOT NULL CHECK (type IN ('admit', 'transfer', 'discharge')),
        status           VARCHAR(10) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'signed', 'cancelled')),
        created_by       INTEGER,
        signed_by        INTEGER,
        signed_at        TIMESTAMPTZ,
        notes            TEXT,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_medrec_org_patient ON med_reconciliation (organization_id, patient_id, type)`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS med_reconciliation_item (
        id                  BIGSERIAL PRIMARY KEY,
        reconciliation_id   BIGINT NOT NULL REFERENCES med_reconciliation(id) ON DELETE CASCADE,
        organization_id     INTEGER NOT NULL,
        home_medicine       TEXT NOT NULL,
        drug_code           VARCHAR(50),
        dose                VARCHAR(100),
        route               VARCHAR(50),
        frequency           VARCHAR(100),
        action              VARCHAR(10) CHECK (action IS NULL OR action IN ('continue', 'stop', 'change', 'hold')),
        resulting_order_id  INTEGER,
        reason              TEXT,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_medrec_item_rec ON med_reconciliation_item (reconciliation_id)`);

    // Reconciliation records are tenant data: forced row-level security on the session variables the request sets.
    for (const t of ['med_reconciliation', 'med_reconciliation_item']) {
      await client.query(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
      await client.query(`ALTER TABLE ${t} FORCE ROW LEVEL SECURITY`);
      await client.query(`DROP POLICY IF EXISTS ${t}_tenant ON ${t}`);
      await client.query(`CREATE POLICY ${t}_tenant ON ${t}
        USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::int OR current_setting('app.is_platform_admin', true) = 'true')
        WITH CHECK (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::int OR current_setting('app.is_platform_admin', true) = 'true')`);
    }

    // ── back-fill legacy allergy arrays (once, idempotent) ───────────────────
    await client.query(`SELECT set_config('app.is_platform_admin', 'true', true)`);
    let backfilled = 0;
    if ((await client.query(`SELECT to_regclass('public.patient_allergies') AS r`)).rows[0].r) {
      const col = async (t, c) => (await client.query(`SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`, [t, c])).rowCount > 0;
      if (await col('users', 'allergies')) {
        const r = await client.query(`
          INSERT INTO patient_allergies (user_id, allergen_name, source, status)
          SELECT u.id, btrim(a), 'legacy_array', 'active'
          FROM users u, LATERAL unnest(u.allergies) AS a
          WHERE u.allergies IS NOT NULL AND btrim(a) <> ''
            AND btrim(a) !~* '^(none|nil|nkda|nka|n/?a|no|no known.*|no allergies|not known|unknown|-+)$'
            AND NOT EXISTS (SELECT 1 FROM patient_allergies p WHERE p.user_id = u.id AND lower(p.allergen_name) = lower(btrim(a)))`);
        backfilled += r.rowCount;
      }
    }
    await client.query('COMMIT');
    console.log(`✅ Clinical safety foundation applied (${backfilled} legacy allergy entries back-filled)`);
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
    for (const t of ['med_reconciliation_item', 'med_reconciliation', 'prescription_safety_log', 'clinical_safety_settings']) await client.query(`DROP TABLE IF EXISTS ${t}`);
    await client.query(`DELETE FROM clinical_knowledge_rules WHERE domain_key = 'drug_class_map'`);
    // Added columns are additive and harmless; they are left in place.
    await client.query('COMMIT');
  } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
}

if (process.argv[1] && process.argv[1].includes('clinical-safety-foundation.migration')) {
  up().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
