import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

describe('display and kiosk schema ownership', () => {
  it('keeps display storage DDL in the migration chain', () => {
    const route = read('routes/hospital-display.route.js');
    const middleware = read('middleware/authDisplayDevice.middleware.js');
    const migration = read('migrations/20261015004200-display-kiosk-governance.migration.js');
    expect(route).not.toMatch(/CREATE TABLE|CREATE INDEX|ALTER TABLE/i);
    expect(middleware).not.toMatch(/CREATE TABLE|CREATE INDEX|ALTER TABLE/i);
    expect(middleware).toContain('SCHEMA_NOT_MIGRATED');
    expect((migration.match(/CREATE TABLE IF NOT EXISTS/g) || []).length).toBe(4);
    expect(migration).toContain('DROP TABLE IF EXISTS display_devices CASCADE');
  });
});
