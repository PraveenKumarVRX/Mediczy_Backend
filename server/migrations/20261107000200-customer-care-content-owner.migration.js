import pool from '../db/pgPool.js';
import { pathToFileURL } from 'node:url';

/** Adds an auditable business owner for deployment-managed support content. */
export async function up(database = pool) {
  await database.query(`
    ALTER TABLE customer_care_knowledge_documents
      ADD COLUMN IF NOT EXISTS content_owner VARCHAR(160) NOT NULL DEFAULT 'Unassigned';
  `);
}

export async function down(database = pool) {
  await database.query(`
    ALTER TABLE customer_care_knowledge_documents
      DROP COLUMN IF EXISTS content_owner;
  `);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  up().then(() => pool.end()).catch(async (error) => { console.error(error); await pool.end(); process.exitCode = 1; });
}

export default { up, down };
