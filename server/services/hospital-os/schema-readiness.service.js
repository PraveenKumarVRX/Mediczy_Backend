/**
 * Hospital OS services must never create tables while serving a request.
 * Migrations are run by server/scripts/migrate-all.mjs; this helper only
 * verifies that the required tables exist and fails closed when they do not.
 */
import pool from '../../db/pgPool.js';

const REQUIRED_TABLES = [
  'hospital_os_events',
  'hospital_os_approvals',
  'hospital_os_kg_nodes',
  'hospital_os_kg_edges',
  'hospital_os_simulations',
  'hospital_os_journey_plans',
  'hospital_os_voice_drafts',
  'hospital_copilot_log',
];

const REQUIRED_COLUMNS = {
  hospital_os_events: ['event_id', 'facility_id', 'correlation_id', 'schema_version'],
};

let readyPromise = null;

export async function ensureHospitalOsSchema(db = pool) {
  readyPromise ??= (async () => {
    const { rows } = await db.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      [REQUIRED_TABLES],
    );
    const found = new Set(rows.map((row) => row.table_name));
    const missing = REQUIRED_TABLES.filter((name) => !found.has(name));
    if (missing.length) {
      const error = new Error(`Hospital OS schema is not migrated: ${missing.join(', ')}`);
      error.code = 'SCHEMA_NOT_MIGRATED';
      error.status = 503;
      throw error;
    }
    const { rows: columnRows } = await db.query(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      [Object.keys(REQUIRED_COLUMNS)],
    );
    const columnsByTable = new Map();
    for (const row of columnRows) {
      if (!columnsByTable.has(row.table_name)) columnsByTable.set(row.table_name, new Set());
      columnsByTable.get(row.table_name).add(row.column_name);
    }
    const missingColumns = Object.entries(REQUIRED_COLUMNS).flatMap(([table, columns]) =>
      columns.filter((column) => !columnsByTable.get(table)?.has(column)).map((column) => `${table}.${column}`));
    if (missingColumns.length) {
      const error = new Error(`Hospital OS schema is not migrated: ${missingColumns.join(', ')}`);
      error.code = 'SCHEMA_NOT_MIGRATED';
      error.status = 503;
      throw error;
    }
    return true;
  })().catch((error) => { readyPromise = null; throw error; });
  return readyPromise;
}

export const hospitalOsRequiredTables = REQUIRED_TABLES;
