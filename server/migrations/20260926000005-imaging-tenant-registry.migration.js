/**
 * RETIRED 2026-10-07 (superseded by lab_uid; see docs/architecture/IMAGING_TENANT_UID_CONTRACT.md). Kept for history.
 * Imaging tenant registry + tenant UIDs — EXPAND phase. Additive, idempotent, re-runnable, and safe on a live system.
 * (Supersedes the unapplied 20260926000004 drafts.)
 *
 * Problem: imaging data is keyed by an INTEGER `tenant_id` (a lab id), but integer ids are not unique across account
 * tables — hospitals, labs and users all contain 70, 2368, 2429, 2433, and lab ids 1–57 also exist as platform tenants.
 * The integer says nothing about WHICH id space it came from. This adds the missing type:
 *
 *  1. labs.uid                    — labs were the one account table without a UUID.
 *  2. imaging_tenants             — registry (kind, source_id) -> uid. `kind` names the id space. For a lab the registry
 *                                   uid IS labs.uid (one UUID per lab everywhere; stable across a down()/up() cycle, so
 *                                   tokens minted with a tenantUid survive a rollback). Writers must insert uid = labs.uid.
 *  3. imaging_tenant_ambiguities  — ids that exist as BOTH a lab and a platform tenant, recorded for a human to confirm.
 *  4. <table>.tenant_uid          — on the DICOM tables + ris_studies, indexed.
 *  5. BEFORE INSERT / UPDATE OF <key> trigger keeps tenant_uid in step for EVERY writer (route, bridge, cron, hand SQL).
 *
 * WHY NOT ONE BIG TRANSACTION: ALTER TABLE takes an ACCESS EXCLUSIVE lock held until COMMIT, so a single transaction that
 * also backfills a large table would block every imaging read/write for the whole backfill. Instead each step is its own
 * short statement: ADD COLUMN (metadata-only) and CREATE TRIGGER run under a short lock_timeout with retry; the backfill
 * runs in bounded batches (row locks only, committed per batch); indexes are built CONCURRENTLY. The trigger is installed
 * BEFORE the backfill so rows written while it runs are already covered.
 *
 * Nothing reads tenant_uid yet — that is the contract phase (see docs/deployment/TENANT_UID_ROLLOUT.md).
 * Ends with a hard gate: throws if any row keyed by a real lab still lacks a UID (the migration is idempotent, so a
 * re-run after fixing the cause is safe).
 *
 * NOTE: when launched through scripts/ssm-env-loader.mjs, process.argv[1] is the LOADER, so a self-run guard does not
 * fire. Import up() from a wrapper, then verify with scripts/ops/verify-tenant-uid.mjs.
 */
import pool from '../db/pgPool.js';

// [table, column that holds the lab integer id]
export const IMAGING_TABLES = [
  ['hg_dicom_studies', 'tenant_id'],
  ['hg_dicom_instances', 'tenant_id'],
  ['hg_dicom_worklist', 'tenant_id'],
  ['hg_dicom_reports', 'tenant_id'],
  ['hg_dicom_access_log', 'tenant_id'],
  ['ris_studies', 'lab_id'],
];
export const BATCH = Number(process.env.TENANT_UID_BATCH) || 20000;

const q = (sql, params) => pool.query(sql, params);
const ident = (s) => { if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error(`unsafe identifier ${s}`); return s; };
const tableHasColumn = async (table, column) =>
  (await q(`SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2`, [table, column])).rowCount > 0;

/** Runs DDL that needs a brief exclusive lock: give up quickly (instead of queueing behind, and blocking, live traffic) and retry. */
async function ddlWithRetry(sql, { attempts = 8, log = () => {} } = {}) {
  const client = await pool.connect();
  try {
    await client.query(`SET lock_timeout = '3s'`);
    for (let i = 1; ; i++) {
      try { await client.query(sql); return; }
      catch (e) {
        if (e.code !== '55P03' || i >= attempts) throw e;          // 55P03 = lock_not_available
        log(`  lock busy, retry ${i}/${attempts - 1}: ${sql.slice(0, 60)}…`);
        await new Promise((r) => setTimeout(r, 1000 * i));
      }
    }
  } finally { await client.query('RESET lock_timeout').catch(() => {}); client.release(); }
}

/** CREATE INDEX CONCURRENTLY cannot run in a transaction and leaves an INVALID index if it fails: drop that and rebuild. */
async function ensureIndexConcurrently(name, table, columns) {
  const cur = await q(`SELECT i.indisvalid FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid WHERE c.relname = $1`, [name]);
  if (cur.rowCount && cur.rows[0].indisvalid) return;
  if (cur.rowCount) await q(`DROP INDEX CONCURRENTLY IF EXISTS ${ident(name)}`);
  await q(`CREATE INDEX CONCURRENTLY IF NOT EXISTS ${ident(name)} ON ${ident(table)} (${columns})`);
}

export async function up({ log = console.log } = {}) {
  if (process.env.ALLOW_RETIRED_TENANT_UID !== '1') {
    throw new Error('RETIRED 2026-10-07: imaging is keyed by lab_uid now and migration 20261007000500 drops the tenant_uid columns and imaging_tenants this would re-create. Set ALLOW_RETIRED_TENANT_UID=1 only for a historical rehearsal.');
  }
  // 1. labs.uid (2–3k rows: trivial)
  await ddlWithRetry('ALTER TABLE labs ADD COLUMN IF NOT EXISTS uid uuid', { log });
  await q('UPDATE labs SET uid = gen_random_uuid() WHERE uid IS NULL');
  await q('ALTER TABLE labs ALTER COLUMN uid SET DEFAULT gen_random_uuid()');
  await q('ALTER TABLE labs ALTER COLUMN uid SET NOT NULL');
  await q('CREATE UNIQUE INDEX IF NOT EXISTS uq_labs_uid ON labs (uid)');

  // 2/3. registry + ambiguity log
  await q(`
    CREATE TABLE IF NOT EXISTS imaging_tenants (
      uid        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      kind       text NOT NULL CHECK (kind IN ('lab', 'tenant')),
      source_id  bigint NOT NULL,
      source_uid uuid,
      note       text,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (kind, source_id)
    )`);
  await q(`
    CREATE TABLE IF NOT EXISTS imaging_tenant_ambiguities (
      source_id     bigint PRIMARY KEY,
      in_labs       boolean NOT NULL,
      in_tenants    boolean NOT NULL,
      imaging_rows  bigint NOT NULL DEFAULT 0,
      assigned_kind text NOT NULL DEFAULT 'lab',
      note          text,
      reviewed      boolean NOT NULL DEFAULT false,
      created_at    timestamptz NOT NULL DEFAULT now()
    )`);

  // Tables present in THIS database (a fresh environment may not have all of them yet).
  const present = [];
  for (const [table, col] of IMAGING_TABLES) {
    if ((await q('SELECT to_regclass($1) AS r', [`public.${table}`])).rows[0].r && (await tableHasColumn(table, col))) present.push([table, col]);
    else log(`skip ${table} (absent or no ${col})`);
  }

  // Registry rows for every lab id that owns imaging data today (plus, below, every lab on first use / first write).
  if (present.length) {
    const idUnion = present.map(([t, c]) => `SELECT ${ident(c)}::bigint AS id FROM ${ident(t)} WHERE ${c} IS NOT NULL`).join(' UNION ');
    await q(`
      INSERT INTO imaging_tenants (uid, kind, source_id, source_uid, note)
      SELECT l.uid, 'lab', ids.id, l.uid, 'backfilled from existing imaging data'
        FROM (${idUnion}) ids JOIN labs l ON l.id = ids.id
      ON CONFLICT (kind, source_id) DO NOTHING`);
    if ((await q(`SELECT to_regclass('public.tenants') AS r`)).rows[0].r) {
      await q(`
        INSERT INTO imaging_tenant_ambiguities (source_id, in_labs, in_tenants, imaging_rows, note)
        SELECT ids.id, TRUE, TRUE,
               (${present.map(([t, c]) => `(SELECT count(*) FROM ${ident(t)} WHERE ${c} = ids.id)`).join(' + ')}),
               'id exists as both a lab and a platform tenant; every imaging row is lab-keyed, so it was assigned to the lab - confirm'
          FROM (${idUnion}) ids
         WHERE EXISTS (SELECT 1 FROM labs l WHERE l.id = ids.id) AND EXISTS (SELECT 1 FROM tenants t WHERE t.id = ids.id)
        ON CONFLICT (source_id) DO NOTHING`);
    }
  }

  // Trigger functions. PL/pgSQL resolves NEW.<column> when it plans an expression even in a branch never taken, so one
  // function per key column (a single function naming both NEW.lab_id and NEW.tenant_id fails on tables lacking one).
  await q(`
    CREATE OR REPLACE FUNCTION imaging_lab_uid(p_lab_id bigint) RETURNS uuid AS $fn$
    DECLARE found_uid uuid;
    BEGIN
      IF p_lab_id IS NULL THEN RETURN NULL; END IF;
      SELECT uid INTO found_uid FROM imaging_tenants WHERE kind = 'lab' AND source_id = p_lab_id;
      IF found_uid IS NULL THEN
        INSERT INTO imaging_tenants (uid, kind, source_id, source_uid, note)
        SELECT l.uid, 'lab', l.id, l.uid, 'created on first write' FROM labs l WHERE l.id = p_lab_id
        ON CONFLICT (kind, source_id) DO NOTHING;
        SELECT uid INTO found_uid FROM imaging_tenants WHERE kind = 'lab' AND source_id = p_lab_id;
      END IF;
      RETURN found_uid;   -- NULL for an id that is not a lab: such a row stays NULL, never guessed
    END
    $fn$ LANGUAGE plpgsql`);
  for (const [fn, key] of [['imaging_fill_tenant_uid', 'tenant_id'], ['imaging_fill_tenant_uid_by_lab', 'lab_id']]) {
    await q(`
      CREATE OR REPLACE FUNCTION ${fn}() RETURNS trigger AS $fn$
      BEGIN
        IF TG_OP = 'INSERT' THEN
          IF NEW.tenant_uid IS NULL THEN NEW.tenant_uid := imaging_lab_uid(NEW.${key}); END IF;
        ELSIF NEW.${key} IS DISTINCT FROM OLD.${key} THEN
          NEW.tenant_uid := imaging_lab_uid(NEW.${key});          -- re-pointing a row re-derives its UID
        END IF;
        RETURN NEW;
      END
      $fn$ LANGUAGE plpgsql`);
  }

  // 4/5. Per table: column (metadata-only), trigger (BEFORE the backfill), batched backfill, concurrent index.
  for (const [table, col] of present) {
    await ddlWithRetry(`ALTER TABLE ${ident(table)} ADD COLUMN IF NOT EXISTS tenant_uid uuid`, { log });
    await ddlWithRetry(`DROP TRIGGER IF EXISTS trg_${table}_tenant_uid ON ${ident(table)}`, { log });
    await ddlWithRetry(
      `CREATE TRIGGER trg_${table}_tenant_uid BEFORE INSERT OR UPDATE OF ${ident(col)} ON ${ident(table)}
       FOR EACH ROW EXECUTE FUNCTION ${col === 'lab_id' ? 'imaging_fill_tenant_uid_by_lab' : 'imaging_fill_tenant_uid'}()`, { log });

    let total = 0;
    for (;;) {                                      // each batch is its own transaction; only mappable rows are selected, so it terminates
      const r = await q(
        `UPDATE ${ident(table)} t SET tenant_uid = it.uid
           FROM imaging_tenants it
          WHERE it.kind = 'lab' AND it.source_id = t.${col}
            AND t.ctid IN (SELECT t2.ctid FROM ${ident(table)} t2 JOIN imaging_tenants it2 ON it2.kind = 'lab' AND it2.source_id = t2.${col}
                            WHERE t2.tenant_uid IS NULL LIMIT ${BATCH})`);
      total += r.rowCount;
      if (r.rowCount < BATCH) break;
    }
    // Rows whose lab is not yet in the registry (a lab with imaging rows added after the registry backfill): register + fill.
    const late = await q(
      `INSERT INTO imaging_tenants (uid, kind, source_id, source_uid, note)
       SELECT l.uid, 'lab', l.id, l.uid, 'created during backfill' FROM labs l
        WHERE l.id IN (SELECT DISTINCT ${col} FROM ${ident(table)} WHERE tenant_uid IS NULL AND ${col} IS NOT NULL)
       ON CONFLICT (kind, source_id) DO NOTHING RETURNING source_id`);
    if (late.rowCount) {
      const r2 = await q(
        `UPDATE ${ident(table)} t SET tenant_uid = it.uid FROM imaging_tenants it
          WHERE it.kind = 'lab' AND it.source_id = t.${col} AND t.tenant_uid IS NULL`);
      total += r2.rowCount;
    }
    log(`${table}: backfilled ${total} row(s)`);
    await ensureIndexConcurrently(`idx_${table}_tenant_uid`, table, 'tenant_uid');
  }
  if (present.some(([t]) => t === 'hg_dicom_instances')) await ensureIndexConcurrently('idx_hg_dicom_instances_tuid_study', 'hg_dicom_instances', 'tenant_uid, study_instance_uid');
  if (present.some(([t]) => t === 'hg_dicom_studies')) await ensureIndexConcurrently('idx_hg_dicom_studies_tuid_study', 'hg_dicom_studies', 'tenant_uid, study_instance_uid');

  // Hard gate: nothing that belongs to a real lab may be left without a UID.
  const problems = [];
  for (const [table, col] of present) {
    const { rows } = await q(
      `SELECT count(*)::int AS n FROM ${ident(table)} t WHERE t.tenant_uid IS NULL AND t.${col} IS NOT NULL
          AND EXISTS (SELECT 1 FROM labs l WHERE l.id = t.${col})`);
    if (rows[0].n > 0) problems.push(`${table}: ${rows[0].n} rows keyed by a real lab have no tenant_uid`);
  }
  if (problems.length) throw new Error(`tenant-uid gate failed — ${problems.join('; ')}. The migration is idempotent: fix the cause and re-run.`);
  return { tables: present.map(([t]) => t) };
}

/** Reverses everything above (indexes, triggers, columns, functions, registry). labs.uid is kept (other things may use it). */
export async function down() {
  for (const [table] of IMAGING_TABLES) {
    if (!(await q('SELECT to_regclass($1) AS r', [`public.${table}`])).rows[0].r) continue;
    await q(`DROP TRIGGER IF EXISTS trg_${ident(table)}_tenant_uid ON ${ident(table)}`);
    await q(`DROP INDEX IF EXISTS idx_${ident(table)}_tenant_uid`);
    await q(`ALTER TABLE ${ident(table)} DROP COLUMN IF EXISTS tenant_uid`);
  }
  await q('DROP INDEX IF EXISTS idx_hg_dicom_instances_tuid_study');
  await q('DROP INDEX IF EXISTS idx_hg_dicom_studies_tuid_study');
  await q('DROP FUNCTION IF EXISTS imaging_fill_tenant_uid(), imaging_fill_tenant_uid_by_lab(), imaging_lab_uid(bigint)');
  await q('DROP TABLE IF EXISTS imaging_tenant_ambiguities, imaging_tenants');
}

export default { up, down, IMAGING_TABLES };
