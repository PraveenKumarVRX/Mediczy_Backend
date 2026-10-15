import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

describe('OT consumables schema ownership', () => {
  it('owns consumables, implants and family notifications in the migration manifest', () => {
    const migration = read('migrations/20261015003200-ot-consumables-governance.migration.js');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS procedure_consumables');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS implant_records');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS family_notifications');
    expect(read('scripts/migrate-all.mjs')).toContain('ot-consumables-governance');
  });

  it('does not create OT consumable tables at service import/request time', () => {
    const service = read('services/ot-consumables.service.js');
    expect(service).not.toMatch(/CREATE TABLE|ALTER TABLE|DROP TABLE/i);
    expect(service).toContain('SCHEMA_NOT_MIGRATED');
    expect(service.match(/await ensureTables\(\);/g)).toHaveLength(7);
  });
});
