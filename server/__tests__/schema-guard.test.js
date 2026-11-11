import { describe, expect, it, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SCHEMA_NOT_MIGRATED, schemaVerifier, schemaGuard, guardedQuery,
  isMissingSchema, tableNameFromSchemaRow, schemaError,
} from '../utils/schema-guard.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

const pgPool = (present) => ({
  query: jest.fn(async () => ({ rows: present.map((t) => ({ tableName: t })) })),
});
const sequelizeLike = (present) => ({
  query: jest.fn(async () => present.map((t) => ({ tableName: t }))),
});

describe('the verifier asks the database what exists', () => {
  // This guarantee used to be asserted in each service. It lives here now that
  // every service checks through this one helper.
  it('queries information_schema.tables for exactly the tables it was given', async () => {
    expect(read('utils/schema-guard.js')).toContain('information_schema.tables');
    const pool = pgPool(['a', 'b']);
    await schemaVerifier({ pool, tables: ['a', 'b'], message: 'x' })();
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain('information_schema.tables');
    expect(sql).toContain('current_schema()');
    expect(params).toEqual([['a', 'b']]);
  });

  it('resolves when every table is present', async () => {
    await expect(schemaVerifier({ pool: pgPool(['a', 'b']), tables: ['a', 'b'], message: 'x' })())
      .resolves.toBeUndefined();
  });

  it('throws SCHEMA_NOT_MIGRATED naming what is missing', async () => {
    const ensure = schemaVerifier({ pool: pgPool(['a']), tables: ['a', 'b'], message: 'Apply the migration' });
    await expect(ensure()).rejects.toMatchObject({
      code: SCHEMA_NOT_MIGRATED,
      status: 503,
      message: 'Apply the migration',
      details: { missingTables: ['b'] },
    });
  });

  it('checks once per process, not once per call', async () => {
    const pool = pgPool(['a']);
    const ensure = schemaVerifier({ pool, tables: ['a'], message: 'x' });
    await Promise.all([ensure(), ensure(), ensure()]);
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failure, so applying the migration recovers without a restart', async () => {
    let present = [];
    const pool = { query: jest.fn(async () => ({ rows: present.map((t) => ({ tableName: t })) })) };
    const ensure = schemaVerifier({ pool, tables: ['a'], message: 'x' });

    await expect(ensure()).rejects.toMatchObject({ code: SCHEMA_NOT_MIGRATED });
    present = ['a']; // the migration runs
    await expect(ensure()).resolves.toBeUndefined();
    expect(pool.query).toHaveBeenCalledTimes(2);
  });
});

describe('it speaks to both database handles', () => {
  // Sequelize takes named replacements and returns rows; a pg Pool takes
  // positional parameters and returns a result object. Binding one shape to the
  // other threw "sequelize is not defined" on import, which a source-reading
  // test could not catch.
  it('uses named replacements for a Sequelize handle', async () => {
    const sequelize = sequelizeLike(['a']);
    await schemaVerifier({ sequelize, tables: ['a'], message: 'x' })();
    const [, options] = sequelize.query.mock.calls[0];
    expect(options.replacements).toEqual({ tables: ['a'] });
  });

  it('uses positional parameters and reads result.rows for a pg Pool', async () => {
    const pool = pgPool(['a']);
    await schemaVerifier({ pool, tables: ['a'], message: 'x' })();
    expect(pool.query.mock.calls[0][1]).toEqual([['a']]);
  });
});

describe('reading an information_schema row', () => {
  // With this Sequelize/Postgres pairing a row can arrive as a positional array.
  // Reading only table_name once made every present table look missing and
  // failed corporate certificate reads with a misleading 500.
  it('accepts an aliased object, a raw object, or a positional array', () => {
    expect(tableNameFromSchemaRow({ tableName: 'fitness_certificates' })).toBe('fitness_certificates');
    expect(tableNameFromSchemaRow({ table_name: 'fitness_certificates' })).toBe('fitness_certificates');
    expect(tableNameFromSchemaRow(['fitness_certificates'])).toBe('fitness_certificates');
    expect(tableNameFromSchemaRow(null)).toBeNull();
  });

  it('survives a positional row without treating it as missing', async () => {
    const pool = { query: jest.fn(async () => ({ rows: [['a'], ['b']] })) };
    await expect(schemaVerifier({ pool, tables: ['a', 'b'], message: 'x' })()).resolves.toBeUndefined();
  });
});

describe('a missing table met mid-query', () => {
  it('recognises undefined_table and undefined_column', () => {
    expect(isMissingSchema({ original: { code: '42P01' } })).toBe(true);
    expect(isMissingSchema({ parent: { code: '42703' } })).toBe(true);
    expect(isMissingSchema({ code: '42P01' })).toBe(true);
    expect(isMissingSchema({ code: '23505' })).toBe(false);
    expect(isMissingSchema(new Error('boom'))).toBe(false);
  });

  it('maps it onto the same contract and leaves other errors alone', async () => {
    const guard = schemaGuard('Apply the migration');
    expect(() => guard({ code: '42P01' })).toThrow(expect.objectContaining({ code: SCHEMA_NOT_MIGRATED }));
    const other = new Error('duplicate key');
    other.code = '23505';
    expect(() => guard(other)).toThrow('duplicate key');
  });

  it('guardedQuery passes results through and only translates missing schema', async () => {
    const ok = { query: jest.fn(async () => [{ n: 1 }]) };
    await expect(guardedQuery(ok, 'x')('SELECT 1')).resolves.toEqual([{ n: 1 }]);

    const missing = { query: jest.fn(async () => { const e = new Error('no table'); e.code = '42P01'; throw e; }) };
    await expect(guardedQuery(missing, 'Apply it')).toBeInstanceOf(Function);
    await expect(guardedQuery(missing, 'Apply it')('SELECT 1')).rejects.toMatchObject({ code: SCHEMA_NOT_MIGRATED });
  });

  it('carries a 503, because an unmigrated environment is unavailable, not a bad request', () => {
    expect(schemaError('x').status).toBe(503);
    expect(schemaError('x').statusCode).toBe(503);
  });
});
