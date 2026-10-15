import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

describe('nursing schema ownership', () => {
  it('uses the migration-owned nursing tables', () => {
    const legacyMigration = read('migrations/20260526000001-create-hmis-phase3-5-tables.js');
    const echartMigration = read('migrations/20261015003400-nursing-echart-governance.migration.js');
    for (const table of ['nursing_assessments', 'nursing_tasks']) expect(legacyMigration).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    for (const table of ['nursing_flowsheet_entries', 'nursing_io_summary']) expect(echartMigration).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    expect(read('scripts/migrate-all.mjs')).toContain('nursing-echart-governance');
    for (const serviceFile of ['services/nursing-echart.service.js', 'services/nursing-ipd.service.js']) {
      const service = read(serviceFile);
      expect(service).not.toMatch(/CREATE TABLE|ALTER TABLE|DROP TABLE/i);
      expect(service).toContain('SCHEMA_NOT_MIGRATED');
    }
  });
});
