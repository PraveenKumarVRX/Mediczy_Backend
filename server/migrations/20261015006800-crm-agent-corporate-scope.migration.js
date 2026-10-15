/**
 * Add the optional corporate dimension used by AgenticCRM when a hospital tenant
 * services more than one corporate account. Tenant scope remains authoritative;
 * corporate_uid is an additional filter only when authCRM supplies it.
 */
import pool from '../db/pgPool.js';

const TABLES = [
  'crm_leads_v2',
  'crm_contacts_v2',
  'crm_deals',
  'crm_activities',
  'crm_tasks',
  'crm_conversations',
  'crm_communication_events',
  'crm_agent_proposals',
  'crm_agent_memories',
  'crm_audit_log',
];

export async function up(db = pool) {
  for (const table of TABLES) {
    await db.query(`
      DO $$
      BEGIN
        IF to_regclass('public.${table}') IS NOT NULL THEN
          ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS corporate_uid TEXT;
        END IF;
      END $$;
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_${table}_corporate_uid
        ON ${table} (tenant_uid, corporate_uid)
        WHERE corporate_uid IS NOT NULL;
    `).catch((error) => {
      // A legacy table without tenant_uid can still be used by the rest of the
      // application; the AgenticCRM tools only query tables with tenant_uid.
      if (!/column .*tenant_uid.*does not exist|relation .* does not exist/i.test(error.message)) throw error;
    });
  }
  // Replace the pre-A3 memory key with a corporate-aware key. The expression index
  // treats NULL (tenant-wide memory) as one scope while keeping each corporate's
  // memory independent.
  await db.query(`
    DO $$
    BEGIN
      IF to_regclass('public.crm_agent_memories') IS NOT NULL THEN
        ALTER TABLE crm_agent_memories
          DROP CONSTRAINT IF EXISTS crm_agent_memories_tenant_uid_actor_user_id_category_memory_key;
      END IF;
    END $$;
  `);
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_agent_memories_scope_key
      ON crm_agent_memories (tenant_uid, (COALESCE(corporate_uid, '')), actor_user_id, category, memory_key);
  `);
}

export async function down(db = pool) {
  for (const table of TABLES) {
    await db.query(`DROP INDEX IF EXISTS idx_${table}_corporate_uid`);
    await db.query(`ALTER TABLE ${table} DROP COLUMN IF EXISTS corporate_uid`).catch((error) => {
      if (!/relation .* does not exist|column .* does not exist/i.test(error.message)) throw error;
    });
  }
  await db.query('DROP INDEX IF EXISTS idx_crm_agent_memories_scope_key');
}

if (process.argv[1]?.includes('20261015006800-crm-agent-corporate-scope')
  || process.argv[2]?.includes('20261015006800-crm-agent-corporate-scope')) {
  up().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
}
