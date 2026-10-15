/** Mediqzy-native hardening for the MedCore adoption surface.
 * Adds an explicit tenant boundary to clinical-adoption records and stores
 * delivery metadata for the clinician-approved lab explainer. Existing rows
 * are retained under the legacy bucket and are never exposed to a scoped
 * tenant request.
 */
import sharedPool from '../db/pgPool.js';

const TABLES = [
  ['drug_safety_signoffs', 'medcore-drug-safety'],
  ['agent_handoffs', 'medcore-agent-handoff'],
  ['lab_explainer_drafts', 'medcore-lab-explainer'],
  ['adherence_plans', 'medcore-adherence-plan'],
  ['adherence_events', 'medcore-adherence-event'],
  ['pharmacy_demand_forecasts', 'medcore-pharmacy-forecast'],
];

export async function up(pool) {
  for (const [table] of TABLES) {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS tenant_uid TEXT NOT NULL DEFAULT 'legacy'`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_${table}_tenant_uid ON ${table}(tenant_uid, created_at DESC)`);
  }
  await pool.query(`ALTER TABLE lab_explainer_drafts ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE lab_explainer_drafts ADD COLUMN IF NOT EXISTS delivery_provider_id TEXT`);
}

export async function down(pool) {
  for (const [table] of TABLES) await pool.query(`ALTER TABLE ${table} DROP COLUMN IF EXISTS tenant_uid`);
  await pool.query('ALTER TABLE lab_explainer_drafts DROP COLUMN IF EXISTS delivered_at, DROP COLUMN IF EXISTS delivery_provider_id');
}

if ((process.argv[1] || '').endsWith('20261015006600-medcore-tenant-delivery.migration.js') || (process.argv[2] || '').endsWith('20261015006600-medcore-tenant-delivery.migration.js')) {
  const db = sharedPool.pool || sharedPool;
  db.connect().then(async (client) => { try { await up(client); console.log('medcore tenant delivery migration applied'); } finally { client.release(); } }).catch((error) => { console.error(error); process.exitCode = 1; });
}
