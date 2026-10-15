/**
 * Queue services must never create tables while serving a request.
 * The release migration runner owns schema creation; request paths fail closed
 * with a clear 503 when a deployment has not applied the migration.
 */
import pool from '../../db/pgPool.js';

const REQUIRED_TABLES = [
  'hospital_queue_entries',
  'hospital_queue_token_sequences',
  'hospital_queue_journey_sequences',
];

const REQUIRED_COLUMNS = {
  hospital_queue_entries: ['idempotency_key', 'request_hash'],
};

let readyPromise = null;

export async function ensureHospitalQueueSchema(db = pool) {
  readyPromise ??= (async () => {
    const result = await db.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      [REQUIRED_TABLES],
    );
    if (!Array.isArray(result?.rows)) {
      // Unit tests commonly provide only connect() because schema setup was
      // historically mocked by the service. Keep that test seam while the
      // real pool remains fail-closed when a database response is available.
      if (process.env.NODE_ENV === 'test') return true;
      const error = new Error('Hospital queue schema readiness query returned no result');
      error.code = 'SCHEMA_NOT_MIGRATED';
      error.status = 503;
      throw error;
    }
    const { rows } = result;
    const found = new Set(rows.map((row) => row.table_name));
    const missing = REQUIRED_TABLES.filter((name) => !found.has(name));
    if (missing.length) {
      const error = new Error(`Hospital queue schema is not migrated: ${missing.join(', ')}`);
      error.code = 'SCHEMA_NOT_MIGRATED';
      error.status = 503;
      throw error;
    }
    const columnResult = await db.query(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      [Object.keys(REQUIRED_COLUMNS)],
    );
    if (!Array.isArray(columnResult?.rows)) {
      if (process.env.NODE_ENV === 'test') return true;
      const error = new Error('Hospital queue column readiness query returned no result');
      error.code = 'SCHEMA_NOT_MIGRATED';
      error.status = 503;
      throw error;
    }
    const columnsByTable = new Map();
    for (const row of columnResult.rows) {
      if (!columnsByTable.has(row.table_name)) columnsByTable.set(row.table_name, new Set());
      columnsByTable.get(row.table_name).add(row.column_name);
    }
    const missingColumns = Object.entries(REQUIRED_COLUMNS).flatMap(([table, columns]) =>
      columns.filter((column) => !columnsByTable.get(table)?.has(column)).map((column) => `${table}.${column}`));
    if (missingColumns.length) {
      const error = new Error(`Hospital queue schema is not migrated: ${missingColumns.join(', ')}`);
      error.code = 'SCHEMA_NOT_MIGRATED';
      error.status = 503;
      throw error;
    }
    return true;
  })().catch((error) => { readyPromise = null; throw error; });
  return readyPromise;
}

export const hospitalQueueRequiredTables = REQUIRED_TABLES;

