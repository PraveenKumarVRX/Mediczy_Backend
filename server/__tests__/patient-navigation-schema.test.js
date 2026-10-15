import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

describe('patient navigation schema ownership', () => {
  it('uses the migration-owned navigation event table', () => {
    const migration = read('migrations/20260526000001-create-hmis-phase3-5-tables.js');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS patient_navigation_events');
    const service = read('services/patient-navigation.service.js');
    expect(service).not.toMatch(/CREATE TABLE|ALTER TABLE|DROP TABLE/i);
    expect(service).toContain('SCHEMA_NOT_MIGRATED');
  });
});
