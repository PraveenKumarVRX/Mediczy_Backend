import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

describe('OT safety schema ownership', () => {
  it('owns the override audit table in the migration manifest', () => {
    const migration = read('migrations/20261015002900-ot-safety-governance.migration.js');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS ot_safety_overrides');
    expect(migration).toContain('idx_ot_safety_overrides_org_booking');
    expect(read('scripts/migrate-all.mjs')).toContain('ot-safety-governance');
  });

  it('does not create OT safety tables at service import/request time', () => {
    const service = read('services/ot-scheduling.service.js');
    expect(service).not.toMatch(/CREATE TABLE|ALTER TABLE|DROP TABLE/i);
    expect(service).toContain('SCHEMA_NOT_MIGRATED');
    const route = read('routes/ot-scheduling.route.js');
    expect(route).toContain("code: err.code || 'OT_STATUS_BLOCKED'");
  });
});
