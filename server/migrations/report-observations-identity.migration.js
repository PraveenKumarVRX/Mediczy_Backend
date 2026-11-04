/**
 * Migration: Report Observations — Subject/Org Identity (Step 1)
 * =============================================================
 * Companion to docs/ai/REPORT_OCR_STEP1_IDENTITY_AND_CONTRACT.md.
 *
 * PURELY ADDITIVE / ZERO BEHAVIOUR CHANGE. Adds typed UID identity to `lab_results` so report
 * observations are keyed on the entity-UID registry (not bare integers) and scoped by organization.
 *
 * `subject_uid`/`organization_uid`/`patient_uid` are POLYMORPHIC uids (a subject may be a patient,
 * user or corporate_employee; an org may be any org kind), so each is a direct FK to
 * `entity_registry(uid)` — the same pattern as `api_activity_logs.tenant_uid` / `ambulance_trip.ambulance_uid`.
 * This is deliberately NOT `attach_uid_reference`, which is for single-target integer→uid twins.
 *
 * Legacy rows keep NULL uids (FKs allow NULL); backfill fills `subject_uid`/`subject_kind` from
 * `users` where resolvable. `organization_uid` stays NULL for legacy until the context is known.
 *
 * Idempotent. `--dry-run` runs in a txn and ROLLs BACK; `--down` reverts.
 */

import pool from '../db/pgPool.js';

export async function up(options = {}) {
  const { dryRun = false } = options;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Identity columns (additive)
    await client.query(`
      ALTER TABLE lab_results
        ADD COLUMN IF NOT EXISTS subject_uid       TEXT,
        ADD COLUMN IF NOT EXISTS subject_kind      TEXT,
        ADD COLUMN IF NOT EXISTS organization_uid  TEXT,
        ADD COLUMN IF NOT EXISTS patient_uid       TEXT,
        ADD COLUMN IF NOT EXISTS document_hash     TEXT,
        ADD COLUMN IF NOT EXISTS document_version  INTEGER NOT NULL DEFAULT 1
    `);
    console.log('✅ lab_results: identity columns added');

    // 2. FKs to the entity registry (polymorphic; NULL allowed). Guarded so re-runs are safe.
    const addFk = async (col, name) => {
      const { rows } = await client.query(`SELECT 1 FROM pg_constraint WHERE conname = $1`, [name]);
      if (rows.length) return;
      await client.query(`ALTER TABLE lab_results
        ADD CONSTRAINT ${name} FOREIGN KEY (${col}) REFERENCES entity_registry(uid)`);
    };
    await addFk('subject_uid',      'fk_lab_results_subject_uid');
    await addFk('organization_uid', 'fk_lab_results_organization_uid');
    await addFk('patient_uid',      'fk_lab_results_patient_uid');
    console.log('✅ lab_results: entity_registry FKs installed');

    // 3. Backfill subject from users where the integer twin resolves (registry-verified)
    const bf = await client.query(`
      UPDATE lab_results lr
         SET subject_uid  = u.unique_id,
             subject_kind = 'user'
        FROM users u
        JOIN entity_registry er ON er.uid = u.unique_id AND er.source_table = 'users'
       WHERE u.id = lr."userId"
         AND lr.subject_uid IS NULL
    `);
    console.log(`✅ lab_results.subject_uid backfilled from users: ${bf.rowCount} rows`);
    // Link patient_uid where a patients row already exists for that user (never create one here)
    const bp = await client.query(`
      UPDATE lab_results lr
         SET patient_uid = p.unique_id
        FROM patients p
       WHERE p."userId" = lr."userId"
         AND lr.patient_uid IS NULL
    `);
    console.log(`✅ lab_results.patient_uid linked where patient exists: ${bp.rowCount} rows`);

    // 4. Lookup indexes for the uid read paths.
    await client.query(`CREATE INDEX IF NOT EXISTS idx_lab_results_subject_uid ON lab_results (subject_uid)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_lab_results_org_uid ON lab_results (organization_uid)`);
    console.log('✅ lab_results: subject/org lookup indexes created');
    // NOTE: the org/subject/document-scoped UNIQUE dedupe index spans both this migration's
    // document_hash/version AND WP0's canonical_name, so it is created in the WP3 converge
    // migration (where both column sets exist and the single writer enforces it), not here.

    // Verification snapshot
    const { rows: c } = await client.query(`
      SELECT count(*) AS n FROM information_schema.columns
      WHERE table_name='lab_results' AND column_name IN
        ('subject_uid','subject_kind','organization_uid','patient_uid','document_hash','document_version')`);
    const { rows: s } = await client.query(`SELECT count(*) AS n FROM lab_results WHERE subject_uid IS NOT NULL`);
    const { rows: p } = await client.query(`SELECT count(*) AS n FROM lab_results WHERE patient_uid IS NOT NULL`);
    console.log(`\n   identity columns present : ${c[0].n}/6`);
    console.log(`   rows with subject_uid    : ${s[0].n}`);
    console.log(`   rows with patient_uid    : ${p[0].n}`);

    if (dryRun) {
      await client.query('ROLLBACK');
      console.log('\n🧪 DRY RUN — all changes rolled back, nothing persisted.');
    } else {
      await client.query('COMMIT');
      console.log('\n✅ Step-1 identity migration committed.');
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Step-1 identity migration failed, rolled back:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

export async function down() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DROP INDEX IF EXISTS idx_lab_results_subject_uid`);
    await client.query(`DROP INDEX IF EXISTS idx_lab_results_org_uid`);
    for (const n of ['fk_lab_results_subject_uid', 'fk_lab_results_organization_uid', 'fk_lab_results_patient_uid']) {
      await client.query(`ALTER TABLE lab_results DROP CONSTRAINT IF EXISTS ${n}`);
    }
    await client.query(`
      ALTER TABLE lab_results
        DROP COLUMN IF EXISTS subject_uid,
        DROP COLUMN IF EXISTS subject_kind,
        DROP COLUMN IF EXISTS organization_uid,
        DROP COLUMN IF EXISTS patient_uid,
        DROP COLUMN IF EXISTS document_hash,
        DROP COLUMN IF EXISTS document_version
    `);
    await client.query('COMMIT');
    console.log('✅ Step-1 identity migration reverted.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

if (process.argv.some((a) => a && a.includes('report-observations-identity'))) {
  const flags = process.argv.slice(2);
  const run = flags.includes('--down') ? down() : up({ dryRun: flags.includes('--dry-run') });
  run.then(() => process.exit(0)).catch(() => process.exit(1));
}
