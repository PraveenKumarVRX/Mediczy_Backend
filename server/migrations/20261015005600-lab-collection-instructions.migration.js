import pg from 'pg';

const { Client } = pg;

export async function up() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
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
    await client.end();
  }
}

export async function down() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('ALTER TABLE lab_collection_tasks DROP CONSTRAINT IF EXISTS lab_collection_tasks_instructions_length');
    await client.query('ALTER TABLE lab_collection_tasks DROP COLUMN IF EXISTS instructions');
  } finally {
    await client.end();
  }
}

if (process.argv[1] && process.argv[1].endsWith('20261015005600-lab-collection-instructions.migration.js')) {
  up().then(() => console.log('lab-collection-instructions migration applied')).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
