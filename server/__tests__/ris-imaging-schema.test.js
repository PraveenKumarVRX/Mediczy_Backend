import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

describe('RIS imaging schema ownership', () => {
  it('moves RIS/PACS tables out of the request path', () => {
    const route = read('routes/lab/ris-imaging.route.js');
    const migration = read('migrations/20261015003600-ris-imaging-governance.migration.js');
    expect(route).not.toMatch(/CREATE TABLE|CREATE INDEX|ALTER TABLE/i);
    expect(route).toContain('SCHEMA_NOT_MIGRATED');
    expect(route).toContain('requireRisSchema');
    expect((migration.match(/CREATE TABLE IF NOT EXISTS/g) || []).length).toBe(7);
    expect(migration).toContain('DROP TABLE IF EXISTS ris_studies CASCADE');
  });
});
