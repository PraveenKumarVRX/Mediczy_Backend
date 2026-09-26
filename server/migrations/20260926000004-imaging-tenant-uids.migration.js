/**
 * Imaging tenant UIDs — additive and idempotent, one transaction.
 *
 * Problem: imaging data is keyed by an INTEGER `tenant_id` (a lab id), but integer ids are not unique across account
 * tables — hospitals, labs and users all contain 70, 2368, 2429, 2433, and lab ids 1–57 also exist as platform tenants.
 * A caller whose own id happened to match a tenant id was served that tenant's studies (fixed in the route; this makes the
 * DATA typed as well, so the same confusion can never be re-introduced at the storage layer).
 *
 *  1. labs.uid           — labs were the one account table without a UUID (users/doctors/hospitals/tenants have one).
 *  2. imaging_tenants    — registry: (kind, source_id) -> uid. `kind` says WHICH id space the integer came from.
 *  3. tenant_uid columns — on the DICOM tables + ris_studies, backfilled from the registry, indexed.
 *  4. BEFORE INSERT trigger fills tenant_uid from tenant_id for any writer (bridge, cron jobs, the route), so no
 *     existing code has to change to keep new rows consistent.
 *  5. imaging_tenant_ambiguities — ids present in BOTH labs and tenants (today: 1). Every imaging row is lab-keyed, so they
 *     are assigned to the lab; the table records them for a human to confirm.
 *
 * Safety: after the backfill the migration RAISES (rolling everything back) if any row keyed by an id that exists in
 * `labs` still lacks a tenant_uid — a row without a UID would be invisible to a UID-checked read.
 *
 * NOTE: when launched through scripts/ssm-env-loader.mjs, process.argv[1] is the LOADER, so the self-run guard below does
 * not fire. Import up() from a wrapper and verify with a query.
 */
import pool from '../db/pgPool.js';

// [table, column that holds the lab/tenant integer id]
export const IMAGING_TABLES = [
  ['hg_dicom_studies', 'tenant_id'],
  ['hg_dicom_instances', 'tenant_id'],
  ['hg_dicom_worklist', 'tenant_id'],
  ['hg_dicom_reports', 'tenant_id'],
  ['hg_dicom_access_log', 'tenant_id'],
  ['ris_studies', 'lab_id'],
];

export async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. labs.uid
    await client.query(`ALTER TABLE labs ADD COLUMN IF NOT EXISTS uid uuid`);
    await client.query(`UPDATE labs SET uid = gen_random_uuid() WHERE uid IS NULL`);
    await client.query(`ALTER TABLE labs ALTER COLUMN uid SET DEFAULT gen_random_uuid()`);
    await client.query(`ALTER TABLE labs ALTER COLUMN uid SET NOT NULL`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_labs_uid ON labs (uid)`);

    // 2. registry
    await client.query(`
      CREATE TABLE IF NOT EXISTS imaging_tenants (
        uid        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        kind       text NOT NULL CHECK (kind IN ('lab', 'tenant')),
        source_id  bigint NOT NULL,
        source_uid uuid,
        note       text,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (kind, source_id)
      )`);
    await client.query(`
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

    // Registry rows for every lab id that owns imaging data today.
    const idUnion = IMAGING_TABLES.map(([t, c]) => `SELECT ${c}::bigint AS id FROM ${t} WHERE ${c} IS NOT NULL`).join(' UNION ');
    await client.query(`
      INSERT INTO imaging_tenants (kind, source_id, source_uid, note)
      SELECT 'lab', ids.id, l.uid, 'backfilled from existing imaging data'
        FROM (${idUnion}) ids JOIN labs l ON l.id = ids.id
      ON CONFLICT (kind, source_id) DO NOTHING`);

    // 5. ids that exist as BOTH a lab and a platform tenant — recorded, assigned to the lab.
    const hasTenants = (await client.query(`SELECT to_regclass('tenants') AS r`)).rows[0].r;
    if (hasTenants) {
      await client.query(`
        INSERT INTO imaging_tenant_ambiguities (source_id, in_labs, in_tenants, imaging_rows, note)
        SELECT ids.id, TRUE, TRUE,
               (${IMAGING_TABLES.map(([t, c]) => `(SELECT count(*) FROM ${t} WHERE ${c} = ids.id)`).join(' + ')}),
               'id exists as both a lab and a platform tenant; every imaging row is lab-keyed, so it was assigned to the lab - confirm'
          FROM (${idUnion}) ids
         WHERE EXISTS (SELECT 1 FROM labs l WHERE l.id = ids.id) AND EXISTS (SELECT 1 FROM tenants t WHERE t.id = ids.id)
        ON CONFLICT (source_id) DO NOTHING`);
    }

    // 4. trigger functions. NOTE: PL/pgSQL resolves NEW.<column> when it plans an expression, even in a branch that is
    // never taken, so ONE function referencing both NEW.lab_id and NEW.tenant_id fails on every table that lacks one of
    // them (found in rehearsal — it would have broken every insert into hg_dicom_*). Hence one function per key column,
    // sharing a single lookup helper.
    await client.query(`
      CREATE OR REPLACE FUNCTION imaging_lab_uid(p_lab_id bigint) RETURNS uuid AS $fn$
      DECLARE
        found_uid uuid;
      BEGIN
        IF p_lab_id IS NULL THEN RETURN NULL; END IF;
        SELECT uid INTO found_uid FROM imaging_tenants WHERE kind = 'lab' AND source_id = p_lab_id;
        IF found_uid IS NULL THEN
          INSERT INTO imaging_tenants (kind, source_id, source_uid, note)
          SELECT 'lab', l.id, l.uid, 'created on first write' FROM labs l WHERE l.id = p_lab_id
          ON CONFLICT (kind, source_id) DO NOTHING;
          SELECT uid INTO found_uid FROM imaging_tenants WHERE kind = 'lab' AND source_id = p_lab_id;
        END IF;
        RETURN found_uid;   -- NULL for an id that is not a lab: such a row is invisible to UID-checked reads
      END
      $fn$ LANGUAGE plpgsql`);
    await client.query(`
      CREATE OR REPLACE FUNCTION imaging_fill_tenant_uid() RETURNS trigger AS $fn$
      BEGIN
        IF NEW.tenant_uid IS NULL THEN NEW.tenant_uid := imaging_lab_uid(NEW.tenant_id); END IF;
        RETURN NEW;
      END
      $fn$ LANGUAGE plpgsql`);
    await client.query(`
      CREATE OR REPLACE FUNCTION imaging_fill_tenant_uid_by_lab() RETURNS trigger AS $fn$
      BEGIN
        IF NEW.tenant_uid IS NULL THEN NEW.tenant_uid := imaging_lab_uid(NEW.lab_id); END IF;
        RETURN NEW;
      END
      $fn$ LANGUAGE plpgsql`);

    // 3. columns, backfill, indexes, trigger — per table
    for (const [table, col] of IMAGING_TABLES) {
      await client.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS tenant_uid uuid`);
      await client.query(`
        UPDATE ${table} t SET tenant_uid = it.uid
          FROM imaging_tenants it
         WHERE it.kind = 'lab' AND it.source_id = t.${col} AND t.tenant_uid IS NULL AND t.${col} IS NOT NULL`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_${table}_tenant_uid ON ${table} (tenant_uid)`);
      await client.query(`DROP TRIGGER IF EXISTS trg_${table}_tenant_uid ON ${table}`);
      await client.query(`CREATE TRIGGER trg_${table}_tenant_uid BEFORE INSERT ON ${table}
                          FOR EACH ROW EXECUTE FUNCTION ${col === 'lab_id' ? 'imaging_fill_tenant_uid_by_lab' : 'imaging_fill_tenant_uid'}()`);
    }
    await client.query('CREATE INDEX IF NOT EXISTS idx_hg_dicom_instances_tuid_study ON hg_dicom_instances (tenant_uid, study_instance_uid)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_hg_dicom_studies_tuid_study ON hg_dicom_studies (tenant_uid, study_instance_uid)');

    // Safety gate: nothing that belongs to a real lab may be left without a UID.
    for (const [table, col] of IMAGING_TABLES) {
      const { rows } = await client.query(
        `SELECT count(*)::int AS n FROM ${table} t WHERE t.tenant_uid IS NULL AND t.${col} IS NOT NULL
            AND EXISTS (SELECT 1 FROM labs l WHERE l.id = t.${col})`);
      if (rows[0].n > 0) throw new Error(`${table}: ${rows[0].n} rows keyed by a real lab still have no tenant_uid — aborting (nothing committed)`);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function down() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [table] of IMAGING_TABLES) {
      await client.query(`DROP TRIGGER IF EXISTS trg_${table}_tenant_uid ON ${table}`);
      await client.query(`ALTER TABLE ${table} DROP COLUMN IF EXISTS tenant_uid`);
    }
    await client.query('DROP FUNCTION IF EXISTS imaging_fill_tenant_uid(), imaging_fill_tenant_uid_by_lab(), imaging_lab_uid(bigint)');
    await client.query('DROP TABLE IF EXISTS imaging_tenant_ambiguities, imaging_tenants');
    await client.query('COMMIT');
  } catch (err) { await client.query('ROLLBACK').catch(() => {}); throw err; } finally { client.release(); }
}

export default { up, down, IMAGING_TABLES };

if (process.argv[1] && process.argv[1].includes('20260926000004-imaging-tenant-uids')) {
  up().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
}
