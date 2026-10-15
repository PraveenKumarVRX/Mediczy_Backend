/**
 * Complete the UID-first tenant surface used by AgenticCRM's legacy task and conversation tools.
 * The integer tenant_id remains for compatibility with existing CRM services; the uid twin is the
 * authoritative scope for new agent reads and writes.
 */
import pool from '../db/pgPool.js';

const REFERENCES = [
  ['crm_tasks', 'tenant_id', 'tenant_uid', 'tenants', 'unique_id'],
  ['crm_conversations', 'tenant_id', 'tenant_uid', 'tenants', 'unique_id'],
  ['crm_communication_events', 'tenant_id', 'tenant_uid', 'tenants', 'unique_id'],
  ['hospital_billing_charges', 'hospital_id', 'hospital_uid', 'hospitals', 'unique_id'],
];

export async function up(db = pool) {
  for (const [table, intCol, uidCol, target, targetCol] of REFERENCES) {
    const { rows } = await db.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema=current_schema() AND table_name=$1`,
      [table],
    );
    if (!rows.length) {
      console.warn(`[migration] crm-agent-tenant-uid: ${table} is absent; skipped`);
      continue;
    }
    await db.query('SELECT attach_uid_reference($1,$2,$3,$4,$5)', [table, intCol, uidCol, target, targetCol]);
  }
}

export async function down(db = pool) {
  for (const [table, , uidCol] of REFERENCES) {
    await db.query(`DROP TRIGGER IF EXISTS trg_uid_ref_${uidCol} ON ${table}`);
    await db.query(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS fk_${table}_${uidCol}`);
    await db.query(`ALTER TABLE ${table} DROP COLUMN IF EXISTS ${uidCol}`);
  }
}

if (process.argv[1]?.includes('20261015006700-crm-agent-tenant-uid')) {
  up().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
}
