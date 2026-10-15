/**
 * Give the legacy CRM record tables (crm_deals, crm_activities, crm_contacts) real, KIND-AGNOSTIC
 * tenancy: a `tenant_uid` column referencing entity_registry(uid).
 *
 * Why reference entity_registry and not `tenants`: crm_leads_v2's tenant_uid is trigger-bound to the
 * `tenants` table (uid_ref_sync(..., 'tenants')), so it can only hold a hospital/clinic/broker and
 * REJECTS a corporate uid. These three tables instead point at the global entity registry, so the
 * tenant may be a hospital, clinic, corporate, broker, or any other registered entity — the uid
 * encodes the kind (see CLAUDE.md entity-uid rule).
 *
 * These tables are currently empty, so this is additive and safe. `tenant_uid` is NULLABLE for now
 * because the CRM create endpoints do not yet populate it; the FK still enforces that any NON-NULL
 * value is a real registered entity. Once the write paths set tenant_uid from req.crmUser.tenantUid,
 * a follow-up migration can make it NOT NULL. All CRM reads/writes must scope by tenant_uid
 * (server/routes/crm.route.js, server/services/crm-agent).
 *
 * Purely additive, idempotent, and safe to execute repeatedly.
 */
import pool from '../db/pgPool.js';

const TABLES = ['crm_deals', 'crm_activities', 'crm_contacts'];

export async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const t of TABLES) {
      // Skip gracefully if a table is absent in this environment.
      const { rows } = await client.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1`, [t]);
      if (!rows.length) { console.warn(`[migration] crm-legacy-tenancy: ${t} not present — skipped`); continue; }

      await client.query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS tenant_uid TEXT`);

      // FK to the global registry (any kind). Added conditionally so re-runs stay idempotent.
      await client.query(`DO $mig$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_${t}_tenant_uid') THEN
            EXECUTE 'ALTER TABLE ${t} ADD CONSTRAINT fk_${t}_tenant_uid FOREIGN KEY (tenant_uid) REFERENCES entity_registry(uid)';
          END IF;
        END $mig$;`);

      await client.query(`CREATE INDEX IF NOT EXISTS idx_${t}_tenant_uid ON ${t} (tenant_uid)`);
    }

    // Best-effort backfill (a no-op today — all three tables are empty): a deal's / activity's tenant
    // is its linked lead's tenant, resolved through the lead's v2 twin. Harmless now; correct later.
    await client.query(`
      UPDATE crm_deals d SET tenant_uid = v.tenant_uid
        FROM crm_leads_v2 v
       WHERE d.tenant_uid IS NULL AND d.lead_id IS NOT NULL
         AND v.legacy_lead_id = d.lead_id AND v.tenant_uid IS NOT NULL`);
    await client.query(`
      UPDATE crm_activities a SET tenant_uid = v.tenant_uid
        FROM crm_leads_v2 v
       WHERE a.tenant_uid IS NULL AND a.lead_id IS NOT NULL
         AND v.legacy_lead_id = a.lead_id AND v.tenant_uid IS NOT NULL`);

    await client.query('COMMIT');
    console.log('[migration] crm-legacy-tenancy: tenant_uid added to', TABLES.join(', '));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function down() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const t of TABLES) {
      await client.query(`DROP INDEX IF EXISTS idx_${t}_tenant_uid`);
      await client.query(`ALTER TABLE ${t} DROP CONSTRAINT IF EXISTS fk_${t}_tenant_uid`);
      await client.query(`ALTER TABLE ${t} DROP COLUMN IF EXISTS tenant_uid`);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && process.argv[1].includes('20261016000000-crm-legacy-tenancy')) {
  up().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
}
