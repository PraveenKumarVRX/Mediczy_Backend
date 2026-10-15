import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

describe('ABDM/HFR/HPR schema ownership', () => {
  it('keeps ABDM persistence DDL in the migration chain', () => {
    const service = read('services/abdm-client.service.js');
    const migration = read('migrations/20261015004300-abdm-hfr-hpr-governance.migration.js');
    expect(service).not.toMatch(/CREATE TABLE|CREATE INDEX|ALTER TABLE/i);
    expect(service).toContain('SCHEMA_NOT_MIGRATED');
    expect((migration.match(/CREATE TABLE IF NOT EXISTS/g) || []).length).toBe(5);
    expect(migration).toContain('DROP TABLE IF EXISTS abha_registrations CASCADE');
  });
});
