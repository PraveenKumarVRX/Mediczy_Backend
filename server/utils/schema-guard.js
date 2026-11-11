/**
 * Schema belongs to migrations, not to the service that reads it.
 *
 * Services used to run an ensureTables() at import that issued
 * CREATE TABLE IF NOT EXISTS for everything they touched. That hid an unmigrated
 * environment: the first request created the tables, so a deployment that had
 * skipped its migration looked healthy while the real migration — with its
 * indexes, constraints, defaults and row-level security — never ran, leaving
 * tables that merely resembled the intended ones. It also let any request issue
 * DDL, which takes an ACCESS EXCLUSIVE lock and can stall live traffic.
 *
 * A service now verifies its tables once and refuses to work without them,
 * naming the migration to apply.
 */

import { QueryTypes } from 'sequelize';

export const SCHEMA_NOT_MIGRATED = 'SCHEMA_NOT_MIGRATED';

/**
 * information_schema rows come back either as objects or, with the
 * Sequelize/Postgres pairing used in production, as positional arrays
 * (`["fitness_certificates"]`). Reading only `table_name` once made every table
 * look missing while they were all present, and every corporate certificate read
 * failed with a misleading 500.
 */
export const tableNameFromSchemaRow = (row) => row?.tableName || row?.table_name || row?.[0] || null;

/** 42P01 undefined_table, 42703 undefined_column — the shapes a missed migration takes. */
export const isMissingSchema = (error) =>
  ['42P01', '42703'].includes(error?.original?.code || error?.parent?.code || error?.code);

export const schemaError = (message, missingTables = []) => {
  const error = new Error(message);
  error.status = 503;
  error.statusCode = 503;
  error.code = SCHEMA_NOT_MIGRATED;
  if (missingTables.length) error.details = { missingTables };
  return error;
};

/**
 * Builds the `ensureTables` a service awaits before touching its tables.
 *
 * The check runs once and the result is memoised, so it costs one
 * information_schema query per process rather than one per request. A failure
 * clears the memo, so applying the migration fixes the service without a
 * restart.
 */
export const schemaVerifier = ({ sequelize, tables, message, code = SCHEMA_NOT_MIGRATED }) => {
  let pending = null;
  return async function ensureSchema() {
    if (!pending) {
      pending = sequelize
        .query(
          `SELECT table_name AS "tableName"
             FROM information_schema.tables
            WHERE table_schema = current_schema()
              AND table_name = ANY(ARRAY[:tables]::text[])`,
          { replacements: { tables }, type: QueryTypes.SELECT }
        )
        .then((rows) => {
          const present = new Set(rows.map(tableNameFromSchemaRow).filter(Boolean));
          const missingTables = tables.filter((table) => !present.has(table));
          if (missingTables.length) {
            const error = schemaError(message, missingTables);
            error.code = code;
            throw error;
          }
        })
        .catch((error) => {
          // Not cached, so the service recovers once the migration is applied.
          pending = null;
          throw error;
        });
    }
    return pending;
  };
};

/** Maps a missing-table error from any query onto the same contract. */
export const schemaGuard = (message) => (error) => {
  if (isMissingSchema(error)) throw schemaError(message);
  throw error;
};

export const guardedQuery = (sequelize, message) => {
  const onError = schemaGuard(message);
  return (sql, options) => sequelize.query(sql, options).catch(onError);
};

export default {
  SCHEMA_NOT_MIGRATED, tableNameFromSchemaRow, isMissingSchema,
  schemaError, schemaVerifier, schemaGuard, guardedQuery,
};
