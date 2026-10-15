import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

describe('anesthesia schema ownership', () => {
  it('uses migration-owned assessment and record tables', () => {
    const migration = read('migrations/20260526000001-create-hmis-phase3-5-tables.js');
    for (const table of ['anesthesia_assessments', 'anesthesia_records']) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    const service = read('services/anesthesia.service.js');
    expect(service).not.toMatch(/CREATE TABLE|ALTER TABLE|DROP TABLE/i);
    expect(service).toContain('SCHEMA_NOT_MIGRATED');
  });
});
