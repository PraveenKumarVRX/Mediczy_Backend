import sharedPool from '../db/pgPool.js';

export async function up() {
  const db = sharedPool.pool || sharedPool;
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      ALTER TABLE lab_collection_tasks
        ADD COLUMN IF NOT EXISTS instructions TEXT
    `);
    await client.query(`
      ALTER TABLE lab_collection_tasks
        DROP CONSTRAINT IF EXISTS lab_collection_tasks_instructions_length
    `);
    await client.query(`
      ALTER TABLE lab_collection_tasks
        ADD CONSTRAINT lab_collection_tasks_instructions_length
        CHECK (instructions IS NULL OR char_length(instructions) <= 2000)
    `);
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
    await client.query('ALTER TABLE lab_collection_tasks DROP CONSTRAINT IF EXISTS lab_collection_tasks_instructions_length');
    await client.query('ALTER TABLE lab_collection_tasks DROP COLUMN IF EXISTS instructions');
  } finally {
    client.release();
  }
}

if (process.argv[1] && process.argv[1].endsWith('20261015005600-lab-collection-instructions.migration.js')) {
  up().then(() => console.log('lab-collection-instructions migration applied')).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
