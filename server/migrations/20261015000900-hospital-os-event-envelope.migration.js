/**
 * Adds the common event envelope fields used by Hospital OS integrations.
 * Existing rows receive generated IDs and schema version 1.
 */
import pool from '../db/pgPool.js';

export async function up() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hospital_os_events (
      id BIGSERIAL PRIMARY KEY,
      tenant_id VARCHAR(64) DEFAULT 'default',
      event_type VARCHAR(80) NOT NULL,
      source VARCHAR(80),
      entity_type VARCHAR(40),
      entity_id VARCHAR(64),
      payload JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_hospital_os_events_type
      ON hospital_os_events(event_type, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_hospital_os_events_entity
      ON hospital_os_events(entity_type, entity_id);

    ALTER TABLE hospital_os_events
      ADD COLUMN IF NOT EXISTS event_id UUID,
      ADD COLUMN IF NOT EXISTS facility_id VARCHAR(64),
      ADD COLUMN IF NOT EXISTS correlation_id VARCHAR(128),
      ADD COLUMN IF NOT EXISTS schema_version INTEGER NOT NULL DEFAULT 1;

    UPDATE hospital_os_events
    SET event_id = gen_random_uuid()
    WHERE event_id IS NULL;

    ALTER TABLE hospital_os_events
      ALTER COLUMN event_id SET NOT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS uq_hospital_os_events_event_id
      ON hospital_os_events(event_id);
    CREATE INDEX IF NOT EXISTS idx_hospital_os_events_tenant_created
      ON hospital_os_events(tenant_id, created_at DESC);
  `);
  console.log('[migration] Hospital OS event envelope ready');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  up().then(() => process.exit(0)).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

