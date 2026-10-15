import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

describe('CRM campaign schema ownership', () => {
  it('keeps campaign storage DDL in the migration chain', () => {
    const route = read('routes/crmCampaigns.route.js');
    const migration = read('migrations/20261015003800-crm-campaigns-governance.migration.js');
    expect(route).not.toMatch(/CREATE TABLE|CREATE INDEX|ALTER TABLE/i);
    expect(route).toContain('SCHEMA_NOT_MIGRATED');
    expect((migration.match(/CREATE TABLE IF NOT EXISTS/g) || []).length).toBe(10);
    expect(migration).toContain('DROP TABLE IF EXISTS crm_marketing_campaigns CASCADE');
  });
});
