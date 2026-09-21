/**
 * Migration: Supply-chain tenant isolation (WP-0.5, PR 1: supply chain + procurement)
 * ----------------------------------------------------------------------------------
 * Adds organization_id + FORCE row-level security to every scm_* table, makes human-facing numbers unique per
 * organization, and adds organization_id to the shared approvals/audit tables. Logic lives in
 * server/services/scm-tenant-scope.service.js so the app can verify it at start-up.
 *
 * Run BEFORE deploying the code that depends on it:  node server/migrations/scm-tenant-isolation.migration.js
 * Existing rows: none need backfilling on production (verified 2026-09-21: only scm_items and scm_locations hold
 * rows and all already belong to organization 1). Any row left with a NULL organization becomes invisible under
 * the policy (never visible to everyone); the script reports how many there are.
 */
import pool from '../db/pgPool.js';
import { applyScmTenantIsolation } from '../services/scm-tenant-scope.service.js';

export async function up() {
  // The tables are created lazily by the app; make sure they exist so a fresh database is covered too.
  const { ensureAllScmTables } = await import('./scm-tables.migration.js');
  await ensureAllScmTables(pool);
  const r = await applyScmTenantIsolation(pool, console.log);
  let orphanTotal = 0;
  for (const [t, n] of Object.entries(r.orphans)) { console.log(`⚠️  ${t}: ${n} row(s) have no organization and are now invisible until assigned`); orphanTotal += n; }
  console.log(`✅ SCM tenant isolation applied to ${r.tables} tables (${orphanTotal} unassigned rows)`);
}

export async function down() {
  const tables = (await pool.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'scm\\_%'`)).rows.map((x) => x.tablename);
  for (const t of tables) {
    await pool.query(`DROP POLICY IF EXISTS scm_tenant_isolation ON ${t}`);
    await pool.query(`ALTER TABLE ${t} NO FORCE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${t} DISABLE ROW LEVEL SECURITY`);
  }
  // Columns and per-organization unique indexes are additive and harmless; the old global unique keys are NOT re-added.
}

if (process.argv[1] && process.argv[1].includes('scm-tenant-isolation.migration')) {
  up().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
