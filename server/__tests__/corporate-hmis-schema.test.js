import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tableNameFromSchemaRow } from '../services/corporate-hmis.service.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

describe('corporate HMIS schema ownership', () => {
  it('keeps corporate referral and occupational-health DDL in migrations', () => {
    const service = read('services/corporate-hmis.service.js');
    const migration = read('migrations/20261015004400-corporate-hmis-governance.migration.js');
    expect(service).not.toMatch(/CREATE TABLE|CREATE INDEX|ALTER TABLE/i);
    expect(service).toContain('SCHEMA_NOT_MIGRATED');
    expect((migration.match(/CREATE TABLE IF NOT EXISTS/g) || []).length).toBe(4);
    expect(migration).toContain('DROP TABLE IF EXISTS corporate_referrals CASCADE');
  });

  it('normalizes Sequelize information_schema rows across driver result shapes', () => {
    expect(tableNameFromSchemaRow({ tableName: 'fitness_certificates' })).toBe('fitness_certificates');
    expect(tableNameFromSchemaRow({ table_name: 'fitness_certificates' })).toBe('fitness_certificates');
    expect(tableNameFromSchemaRow(['fitness_certificates'])).toBe('fitness_certificates');
  });
});
