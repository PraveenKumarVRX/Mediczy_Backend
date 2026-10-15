import pg from 'pg';

const { Client } = pg;

/**
 * Label replacement is an auditable dispatch action.  The active specimen row
 * carries the replacement barcode, while this immutable ledger retires the
 * original value permanently and records who approved the change and why.
 */
export async function up() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS lab_collection_specimen_replacements (
        id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_uid          text NOT NULL REFERENCES entity_registry (uid),
        task_id            uuid NOT NULL REFERENCES lab_collection_tasks (id),
        specimen_id        uuid NOT NULL REFERENCES lab_collection_specimens (id),
        original_barcode   text NOT NULL CHECK (original_barcode ~ '^[A-Za-z0-9._-]{4,64}$'),
        replacement_barcode text NOT NULL CHECK (replacement_barcode ~ '^[A-Za-z0-9._-]{4,64}$'),
        reason             text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 300),
        approved_by        text NOT NULL,
        operation_id       text,
        created_at         timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_lab_collection_specimen_replacement_specimen
        ON lab_collection_specimen_replacements (specimen_id)
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_lab_collection_specimen_replacement_original
        ON lab_collection_specimen_replacements (owner_uid, original_barcode)
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_lab_collection_specimen_replacement_barcode
        ON lab_collection_specimen_replacements (owner_uid, replacement_barcode)
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_lab_collection_exception_open
        ON lab_collection_exceptions (task_id, specimen_id, code) WHERE status = 'open'
    `);
    await client.query(`
      ALTER TABLE lab_specimen_custody_events
        DROP CONSTRAINT IF EXISTS lab_specimen_custody_events_event_type_check
    `);
    await client.query(`
      ALTER TABLE lab_specimen_custody_events
        ADD CONSTRAINT lab_specimen_custody_events_event_type_check
        CHECK (event_type IN ('scanned', 'collected', 'in_transit', 'handed_over', 'received', 'rejected', 'barcode_replaced'))
    `);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

export async function down() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('DROP TABLE IF EXISTS lab_collection_specimen_replacements');
    await client.query('DROP INDEX IF EXISTS uq_lab_collection_exception_open');
    await client.query('ALTER TABLE lab_specimen_custody_events DROP CONSTRAINT IF EXISTS lab_specimen_custody_events_event_type_check');
    await client.query(`
      ALTER TABLE lab_specimen_custody_events
        ADD CONSTRAINT lab_specimen_custody_events_event_type_check
        CHECK (event_type IN ('scanned', 'collected', 'in_transit', 'handed_over', 'received', 'rejected'))
    `);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && process.argv[1].endsWith('20261015005700-lab-collection-label-replacement.migration.js')) {
  up().then(() => console.log('lab-collection-label-replacement migration applied')).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
