import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

describe('NABH/JCI compliance schema ownership', () => {
  it('owns the accreditation tables in the migration manifest', () => {
    const migration = read('migrations/20261015003300-nabh-jci-compliance-governance.migration.js');
    for (const table of ['compliance_standards', 'compliance_checkpoints', 'compliance_evidence', 'compliance_incidents']) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    expect(read('scripts/migrate-all.mjs')).toContain('nabh-jci-compliance-governance');
  });

  it('does not create accreditation tables at service import/request time', () => {
    const service = read('services/nabh-jci-compliance.service.js');
    expect(service).not.toMatch(/CREATE TABLE|ALTER TABLE|DROP TABLE/i);
    expect(service).toContain('SCHEMA_NOT_MIGRATED');
  });
});
