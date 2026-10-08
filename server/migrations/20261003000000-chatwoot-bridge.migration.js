import fs from 'fs/promises';
import pool from '../db/pgPool.js';

export async function up(client = null) {
  const db = client || await pool.connect();
  try {
    if (!client) await db.query('BEGIN');
    await db.query(await fs.readFile(new URL('./20261003000000-chatwoot-bridge.sql', import.meta.url), 'utf8'));
    if (!client) await db.query('COMMIT');
  } catch (error) {
    if (!client) await db.query('ROLLBACK');
    throw error;
  } finally {
    if (!client) db.release();
  }
}

export async function down() {
  throw new Error('Chatwoot bridge migration has no destructive down migration');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  up().then(() => pool.end()).catch(async (error) => {
    console.error(`Chatwoot migration failed: ${error.message}`);
    await pool.end();
    process.exitCode = 1;
  });
}
