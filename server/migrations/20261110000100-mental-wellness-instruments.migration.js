/**
 * MED-MIND-001 Phase 1 — Mental wellness instruments
 * Plan: docs/planning/MENTAL_WELLNESS_MODULE_IMPLEMENTATION_PLAN_2026-11-08.md
 *
 * Adds, on top of the existing health-coaching framework:
 *   program_assessment_responses  — longitudinal instrument capture (PHQ-9, GAD-7, …)
 *   program_content.content_type  — allow 'audio' for guided exercises
 *
 * Why a new table (gap G-2): program_assessments defines questionnaires, but the
 * only place to put answers was program_enrollments.assessment_answers — a single
 * JSONB per enrollment, written by no code at all. A fortnightly PHQ-9 needs a
 * time series, so responses get their own table.
 *
 * Deliberate omissions, each load-bearing:
 *   - No corporate_id and no join path to one. Mental-health responses must be
 *     structurally unable to reach HR aggregation, not merely filtered out.
 *   - No unique_id. These are child records of an enrollment, not entities, so
 *     they are correctly outside the entity-UID rule (adding the column without
 *     registering it is exactly what verify-entity-uid-rule.mjs fails on).
 *   - No interpretation text column. Interpretation is derived at read time from
 *     the pinned instrument_ver, so correcting a scoring table can never leave
 *     stale interpretations behind in the database.
 *
 * Dependency: the health-coaching framework must exist. Confirmed present in
 * production (all 9 tables, Phase 0 PF-1), but it is registered in no runner
 * list, so on a fresh environment it would be absent. Rather than duplicate its
 * DDL here — two sources of truth that would drift — this migration imports and
 * runs its up() when the base tables are missing.
 *
 * Run:  node scripts/ssm-env-loader.mjs migrations/20261110000100-mental-wellness-instruments.migration.js
 * Check: ... same path ... --check
 */
import path from 'path';
import { pathToFileURL } from 'url';
import pool from '../db/pgPool.js';
import { up as createCoachingFramework } from './health-coaching-framework.migration.js';

const BASE_TABLES = [
  'health_programs', 'program_tracking_params', 'program_tasks', 'program_content',
  'program_assessments', 'program_enrollments', 'program_task_logs',
  'program_health_scores', 'program_device_connections',
];

async function missingBaseTables(client) {
  const { rows } = await client.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    [BASE_TABLES],
  );
  const present = new Set(rows.map((r) => r.table_name));
  return BASE_TABLES.filter((t) => !present.has(t));
}

export async function up() {
  // Dependency check runs outside the transaction: the framework migration
  // manages its own.
  {
    const probe = await pool.connect();
    try {
      const missing = await missingBaseTables(probe);
      if (missing.length) {
        console.log(`[mind] coaching framework incomplete (missing: ${missing.join(', ')}) — running it first`);
        probe.release();
        await createCoachingFramework();
        const recheck = await pool.connect();
        try {
          const still = await missingBaseTables(recheck);
          if (still.length) throw new Error(`coaching framework still incomplete after running it: ${still.join(', ')}`);
        } finally {
          recheck.release();
        }
      } else {
        probe.release();
      }
    } catch (err) {
      try { probe.release(); } catch { /* already released */ }
      throw err;
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Longitudinal instrument responses (G-2) ───────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS program_assessment_responses (
        id               SERIAL PRIMARY KEY,
        enrollment_id    INTEGER NOT NULL REFERENCES program_enrollments(id) ON DELETE CASCADE,
        assessment_id    INTEGER REFERENCES program_assessments(id) ON DELETE SET NULL,
        instrument_code  VARCHAR(40)  NOT NULL,
        instrument_ver   VARCHAR(20)  NOT NULL,
        answers          JSONB        NOT NULL,
        raw_score        NUMERIC(6,2),
        severity_band    VARCHAR(40),
        flagged_items    JSONB        NOT NULL DEFAULT '[]'::jsonb,
        is_self_report   BOOLEAN      NOT NULL DEFAULT TRUE,
        administered_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        administered_by  INTEGER,
        created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_par_enrollment
        ON program_assessment_responses (enrollment_id, administered_at DESC)`);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_par_instrument
        ON program_assessment_responses (instrument_code, administered_at DESC)`);
    await client.query(`
      COMMENT ON TABLE program_assessment_responses IS
        'MED-MIND-001: longitudinal validated-instrument responses (PHQ-9, GAD-7, …). Intentionally has no corporate_id and no join path to one — mental-health responses must not be reachable from HR aggregation.'`);

    // ── Allow audio content for guided exercises (G-3) ────────────────────────
    // The CHECK constraint is unnamed in the original DDL, so find it by its
    // definition rather than guessing a name.
    const { rows: checks } = await client.query(`
      SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace ns ON ns.oid = rel.relnamespace
       WHERE ns.nspname = 'public'
         AND rel.relname = 'program_content'
         AND con.contype = 'c'
         AND pg_get_constraintdef(con.oid) ILIKE '%content_type%'`);
    for (const { conname } of checks) {
      await client.query(`ALTER TABLE program_content DROP CONSTRAINT "${conname}"`);
    }
    await client.query(`
      ALTER TABLE program_content
        ADD CONSTRAINT program_content_content_type_check
        CHECK (content_type IN ('video','article','tip','recipe','exercise','audio'))`);

    await client.query('COMMIT');
    console.log('[mind] program_assessment_responses ready; program_content accepts audio');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Read-only verification: --check */
export async function check() {
  const client = await pool.connect();
  try {
    const missing = await missingBaseTables(client);
    console.log(`base framework: ${missing.length ? `MISSING ${missing.join(', ')}` : 'complete (9/9)'}`);

    const { rows: [t] } = await client.query(
      `SELECT COUNT(*)::int AS n FROM information_schema.tables
        WHERE table_schema='public' AND table_name='program_assessment_responses'`);
    console.log(`program_assessment_responses: ${t.n ? 'PRESENT' : 'MISSING'}`);

    const { rows: [c] } = await client.query(`
      SELECT pg_get_constraintdef(con.oid) AS def
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
       WHERE rel.relname='program_content' AND con.contype='c'
         AND pg_get_constraintdef(con.oid) ILIKE '%content_type%' LIMIT 1`);
    console.log(`program_content content_type check: ${c ? c.def : 'NONE'}`);
    console.log(`  accepts 'audio': ${c && /audio/.test(c.def) ? 'YES' : 'NO'}`);

    // The privacy invariant, asserted rather than assumed — but only meaningful
    // once the table exists, so do not report a missing table as a pass.
    if (!t.n) {
      console.log('privacy invariant (no employer-linking column): N/A — table not created yet');
    } else {
      const { rows: cols } = await client.query(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema='public' AND table_name='program_assessment_responses'`);
      const leak = cols.map((r) => r.column_name)
        .filter((n) => /corporate|employer|tenant|org/i.test(n));
      console.log(`privacy invariant (no employer-linking column): ${leak.length ? `VIOLATED -> ${leak.join(', ')}` : 'OK'}`);
      if (leak.length) process.exitCode = 1;
    }
  } finally {
    client.release();
  }
}

export async function down() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DROP TABLE IF EXISTS program_assessment_responses CASCADE`);
    // Leave the widened content_type CHECK in place: narrowing it again would
    // fail against any row already storing 'audio'.
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Loader-aware entry guard.
 *
 * The usual `import.meta.url === pathToFileURL(process.argv[1]).href` check does
 * NOT fire under scripts/ssm-env-loader.mjs, which loads its target with
 * `await import(entryUrl)` and leaves process.argv untouched — so argv[1] is the
 * loader, not this file, and the migration would be imported and then silently
 * do nothing. That silent skip has bitten this repo before. Accept argv[1] (direct
 * `node migrations/...`) or argv[2] (`node scripts/ssm-env-loader.mjs migrations/...`).
 */
function invokedAsScript() {
  for (const candidate of [process.argv[1], process.argv[2]]) {
    if (!candidate) continue;
    try {
      if (pathToFileURL(path.resolve(process.cwd(), candidate)).href === import.meta.url) return true;
    } catch { /* not a path — ignore */ }
  }
  return false;
}

if (invokedAsScript()) {
  const mode = process.argv.includes('--check') ? check : up;
  mode()
    .then(() => pool.end())
    .catch(async (error) => { console.error(error); await pool.end(); process.exitCode = 1; });
}

export default { up, down, check };
