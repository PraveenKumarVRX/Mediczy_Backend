/** Backfill Entity-UID values for AgenticCRM flow/social tables created before the UID audit gate. */
import sharedPool from '../db/pgPool.js';

const targets = [
  ['crm_flow_definitions', 'crm-flow-'], ['crm_flow_nodes', 'crm-flow-node-'], ['crm_flow_edges', 'crm-flow-edge-'],
  ['crm_flow_runs', 'crm-flow-run-'], ['crm_flow_run_events', 'crm-flow-event-'],
  ['crm_social_identities', 'crm-social-identity-'], ['crm_social_triggers', 'crm-social-trigger-'],
  ['crm_social_automation_pauses', 'crm-social-pause-'], ['crm_social_scheduled_replies', 'crm-social-reply-'],
];
export async function up(pool) {
  for (const [table, prefix] of targets) {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS entity_uid TEXT`);
    await pool.query(`UPDATE ${table} SET entity_uid=$1 || gen_random_uuid()::text WHERE entity_uid IS NULL`, [prefix]);
    await pool.query(`ALTER TABLE ${table} ALTER COLUMN entity_uid SET DEFAULT ('${prefix}' || gen_random_uuid()::text)`);
    await pool.query(`ALTER TABLE ${table} ALTER COLUMN entity_uid SET NOT NULL`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_${table}_entity_uid ON ${table}(entity_uid)`);
  }
}
export async function down(pool) { for (const [table] of targets) await pool.query(`ALTER TABLE ${table} DROP COLUMN IF EXISTS entity_uid`); }
if ((process.argv[1] && process.argv[1].endsWith('20261015006500-crm-entity-uid-hardening.migration.js')) || (process.argv[2] && process.argv[2].endsWith('20261015006500-crm-entity-uid-hardening.migration.js'))) {
  const db = sharedPool.pool || sharedPool; db.connect().then(async (client) => { try { await up(client); console.log('crm entity uid hardening applied'); } finally { client.release(); } }).catch((e) => { console.error(e); process.exitCode = 1; });
}
