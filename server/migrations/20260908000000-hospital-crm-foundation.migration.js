import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../db/pgPool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.join(__dirname, '20260908000000-hospital-crm-foundation.sql');

export async function up(client = null) {
  const sql = await fs.readFile(sqlPath, 'utf8');
  const db = client || await pool.connect();
  const ownsClient = !client;

  try {
    if (ownsClient) await db.query('BEGIN');
    await db.query(sql);
    if (ownsClient) await db.query('COMMIT');
    console.log('Hospital CRM foundation migration applied');
  } catch (error) {
    if (ownsClient) await db.query('ROLLBACK');
    throw error;
  } finally {
    if (ownsClient) db.release();
  }
}

export async function down(client = null) {
  const db = client || await pool.connect();
  const ownsClient = !client;
  const statements = [
    'DROP TABLE IF EXISTS crm_lead_merge_audit',
    'DROP TABLE IF EXISTS crm_funnel_events',
    'DROP TABLE IF EXISTS crm_lead_sla_instances',
    'DROP TABLE IF EXISTS crm_sla_policies',
    'DROP TABLE IF EXISTS crm_lead_assignments',
    'DROP TABLE IF EXISTS crm_leads_v2',
    'DROP TABLE IF EXISTS crm_campaigns_unified',
    'DROP TABLE IF EXISTS crm_source_taxonomy',
    'DROP TABLE IF EXISTS crm_contacts_v2',
    'DROP TABLE IF EXISTS crm_identity_keys',
    'DROP TABLE IF EXISTS crm_person_identities',
    'DROP TABLE IF EXISTS crm_org_units',
  ];

  try {
    if (ownsClient) await db.query('BEGIN');
    for (const statement of statements) await db.query(statement);
    if (ownsClient) await db.query('COMMIT');
  } catch (error) {
    if (ownsClient) await db.query('ROLLBACK');
    throw error;
  } finally {
    if (ownsClient) db.release();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  up().then(() => process.exit(0)).catch((error) => {
    console.error(`Hospital CRM foundation migration failed: ${error.message}`);
    process.exit(1);
  });
}

export default { up, down };
