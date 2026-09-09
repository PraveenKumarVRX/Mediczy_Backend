import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../db/pgPool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.join(__dirname, '20260908000001-hospital-crm-worldclass-domains.sql');

export async function up(client = null) {
  const sql = await fs.readFile(sqlPath, 'utf8');
  const db = client || await pool.connect();
  const ownsClient = !client;
  try {
    if (ownsClient) await db.query('BEGIN');
    await db.query(sql);
    if (ownsClient) await db.query('COMMIT');
    console.log('Hospital CRM world-class domains migration applied');
  } catch (error) {
    if (ownsClient) await db.query('ROLLBACK');
    throw error;
  } finally {
    if (ownsClient) db.release();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  up().then(() => process.exit(0)).catch((error) => {
    console.error(`Hospital CRM world-class domains migration failed: ${error.message}`);
    process.exit(1);
  });
}

export default { up };
