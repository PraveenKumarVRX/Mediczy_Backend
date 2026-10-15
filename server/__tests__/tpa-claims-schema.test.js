import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

describe('TPA claims lifecycle schema ownership', () => {
  it('keeps all claims tables in the migration chain', () => {
    const service = read('services/tpa-claims-lifecycle.service.js');
    const migration = read('migrations/20261015003500-tpa-claims-lifecycle-governance.migration.js');
    expect(service).not.toMatch(/CREATE TABLE|CREATE INDEX|DROP TABLE/i);
    expect(service).toContain('SCHEMA_NOT_MIGRATED');
    expect((migration.match(/CREATE TABLE IF NOT EXISTS/g) || []).length).toBe(29);
    expect(migration).toContain('DROP TABLE IF EXISTS tpa_claims CASCADE');
  });
});
