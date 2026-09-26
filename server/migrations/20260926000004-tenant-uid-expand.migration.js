/**
 * Tenant UID — EXPAND phase (2026-09-26). Additive, idempotent, no reads change.
 *
 * Integer ids are not unique across account tables (a doctor, a hospital and a lab can all be 70), and the imaging
 * tables key tenancy on that integer. The durable fix is a globally unique tenant key. This step only ADDS it:
 *
 *   1. labs.uid           — the imaging tenant is a lab account; labs were the one account table without a UUID.
 *   2. <imaging table>.tenant_uid — nullable, indexed, backfilled from labs.uid via tenant_id.
 *   3. a BEFORE INSERT/UPDATE trigger keeps tenant_uid in step with tenant_id for every writer (service, script, SQL),
 *      so no application code has to change for new rows to carry it.
 *
 * Nothing reads tenant_uid yet. The CONTRACT phase (tokens carry tenantUid → resolved against the registry → queries
 * filter on tenant_uid → integer fallback dropped) is a separate, later change, gated on `ops/verify-tenant-uid.mjs`
 * reporting zero unmapped rows.
 *
 * Rows whose tenant_id is not a lab id (e.g. an explicit tenantId claim for a non-lab tenant) keep tenant_uid NULL and
 * show up as "unmapped" in the verifier; they are never guessed.
 *
 * NOTE: run through a wrapper that imports up() (scripts/ssm-env-loader.mjs makes process.argv[1] the loader, so a
 * self-run guard would not fire), then verify with ops/verify-tenant-uid.mjs.
 */
import pool from '../db/pgPool.js';

export const IMAGING_TABLES = ['hg_dicom_studies', 'hg_dicom_instances', 'hg_dicom_reports', 'hg_dicom_worklist'];
const BATCH = 20000;

const q = (sql, params) => pool.query(sql, params);
const exists = async (table) => (await q('SELECT to_regclass($1) AS t', [`public.${table}`])).rows[0].t !== null;
const hasColumn = async (table, column) =>
  (await q('SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2', [table, column])).rowCount > 0;

export async function up({ log = console.log } = {}) {
  // 1. labs.uid — added without a volatile default first (no table rewrite semantics to reason about), then backfilled.
  await q('ALTER TABLE labs ADD COLUMN IF NOT EXISTS uid UUID');
  await q('UPDATE labs SET uid = gen_random_uuid() WHERE uid IS NULL');
  await q('ALTER TABLE labs ALTER COLUMN uid SET DEFAULT gen_random_uuid()');
  await q('CREATE UNIQUE INDEX IF NOT EXISTS labs_uid_key ON labs (uid)');

  await q(`
    CREATE OR REPLACE FUNCTION set_tenant_uid_from_lab() RETURNS trigger AS $fn$
    BEGIN
      IF TG_OP = 'INSERT' OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
        NEW.tenant_uid := (SELECT l.uid FROM labs l WHERE l.id = NEW.tenant_id);
      END IF;
      RETURN NEW;
    END
    $fn$ LANGUAGE plpgsql`);

  for (const table of IMAGING_TABLES) {
    if (!(await exists(table)) || !(await hasColumn(table, 'tenant_id'))) { log(`skip ${table} (absent or no tenant_id)`); continue; }
    await q(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS tenant_uid UUID`);
    await q(`CREATE INDEX IF NOT EXISTS idx_${table}_tenant_uid ON ${table} (tenant_uid)`);
    await q(`DROP TRIGGER IF EXISTS trg_${table}_tenant_uid ON ${table}`);
    await q(`CREATE TRIGGER trg_${table}_tenant_uid BEFORE INSERT OR UPDATE OF tenant_id ON ${table}
             FOR EACH ROW EXECUTE FUNCTION set_tenant_uid_from_lab()`);
    // Backfill in bounded batches so no single statement holds locks on a large table. Only rows that CAN be mapped
    // are selected, so the loop always terminates.
    let total = 0;
    for (;;) {
      const r = await q(
        `UPDATE ${table} t SET tenant_uid = l.uid
           FROM labs l
          WHERE l.id = t.tenant_id AND t.ctid IN (
                SELECT t2.ctid FROM ${table} t2 JOIN labs l2 ON l2.id = t2.tenant_id
                 WHERE t2.tenant_uid IS NULL LIMIT ${BATCH})`);
      total += r.rowCount;
      if (r.rowCount < BATCH) break;
    }
    log(`${table}: backfilled ${total} row(s)`);
  }
}

export default { up, IMAGING_TABLES };
