import sharedPool from '../db/pgPool.js';

/**
 * Standalone collection-safety incident log.  It is intentionally separate from
 * the dispatch exception queue: an incident can remain open after the task has
 * completed, and quality staff may need to investigate it independently.
 */
export async function up() {
  const db = sharedPool.pool || sharedPool;
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS lab_collection_incidents (
        id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_uid      text NOT NULL REFERENCES entity_registry (uid),
        task_id        uuid NOT NULL REFERENCES lab_collection_tasks (id),
        specimen_id    uuid REFERENCES lab_collection_specimens (id),
        incident_type  text NOT NULL CHECK (incident_type IN (
          'needlestick', 'adverse_reaction', 'wrong_patient_order', 'spill',
          'mislabeled_tube', 'delay', 'missing_sample', 'unsafe_location',
          'payment_dispute', 'privacy_incident', 'other'
        )),
        severity       text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
        description    text NOT NULL CHECK (char_length(description) BETWEEN 2 AND 2000),
        status         text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_review', 'resolved')),
        occurred_at    timestamptz NOT NULL DEFAULT now(),
        reported_by    text NOT NULL,
        reported_role  text NOT NULL CHECK (reported_role IN ('phlebotomist', 'dispatch')),
        operation_id   text,
        correlation_id text,
        metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
        resolution     text,
        resolved_by    text,
        resolved_at    timestamptz,
        created_at     timestamptz NOT NULL DEFAULT now(),
        updated_at     timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_lab_collection_incidents_owner_status
      ON lab_collection_incidents (owner_uid, status, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_lab_collection_incidents_task
      ON lab_collection_incidents (task_id, created_at DESC)`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_lab_collection_incidents_operation
      ON lab_collection_incidents (reported_by, operation_id) WHERE operation_id IS NOT NULL`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function down() {
  const db = sharedPool.pool || sharedPool;
  const client = await db.connect();
  try {
    await client.query('DROP TABLE IF EXISTS lab_collection_incidents CASCADE');
  } finally {
    client.release();
  }
}

if (process.argv[1] && process.argv[1].endsWith('20261015005800-lab-collection-incidents.migration.js')) {
  up().then(() => console.log('lab-collection-incidents migration applied')).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
