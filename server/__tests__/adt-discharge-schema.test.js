import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

describe('ADT discharge readiness schema ownership', () => {
  it('owns readiness and override tables in the migration manifest', () => {
    const migration = read('migrations/20261015003100-discharge-readiness-governance.migration.js');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS discharge_readiness_items');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS discharge_overrides');
    expect(migration).toContain('idx_dri_org_admission_dimension');
    expect(read('scripts/migrate-all.mjs')).toContain('discharge-readiness-governance');
  });

  it('fails closed instead of creating readiness tables during service import', () => {
    const service = read('services/adt.service.js');
    expect(service).not.toMatch(/CREATE TABLE|ALTER TABLE|DROP TABLE/i);
    expect(service).toContain('SCHEMA_NOT_MIGRATED');
    const route = read('routes/adt.route.js');
    expect(route).toContain('code: err.code');
  });
});
