import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

describe('CRM extension schema ownership', () => {
  it('keeps AI, analysis, underwriting and email DDL in the migration chain', () => {
    for (const file of ['routes/crm-ai.route.js', 'routes/crm-analysis.route.js', 'routes/crm-underwriting.route.js', 'routes/crmEmail.route.js']) {
      const route = read(file);
      expect(route).not.toMatch(/CREATE TABLE|CREATE INDEX|ALTER TABLE/i);
      expect(route).toContain('SCHEMA_NOT_MIGRATED');
    }
    const migration = read('migrations/20261015003900-crm-extensions-governance.migration.js');
    expect((migration.match(/CREATE TABLE IF NOT EXISTS/g) || []).length).toBe(9);
    expect(migration).toContain('DROP TABLE IF EXISTS crm_email_settings CASCADE');
  });
});
