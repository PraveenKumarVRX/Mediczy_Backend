import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

describe('PREMS feedback workflow contract', () => {
  it('owns invitation and response tables in the migration chain', () => {
    const migration = read('migrations/20261015002700-prems-feedback.migration.js');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS prems_survey_invitations');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS prems_responses');
    expect(migration).toContain('prems_inv_discharge_once_idx');
    expect(migration).toContain('prems_response_invitation_once_idx');
    expect(read('scripts/migrate-all.mjs')).toContain('prems-feedback');
  });

  it('does not execute DDL from PREMS request handlers', () => {
    const route = read('routes/hospital/practice.route.js');
    const section = route.slice(route.indexOf("router.get('/prems/responses'"), route.indexOf("// Phase 1: discharge-facing readmission risk"));
    expect(section).not.toMatch(/CREATE TABLE|ALTER TABLE|DROP TABLE/i);
    expect(section).toContain("ON CONFLICT DO NOTHING RETURNING *");
    expect(section).toContain('IDEMPOTENCY_KEY_REQUIRED');
    expect(section).toContain('ticket_sla');
    expect(section).toContain("router.get('/prems/metrics'");
    expect(section).toContain('complaint_ticket_id');
  });

  it('moves discharge planning DDL into the migration chain', () => {
    const migration = read('migrations/20261015002800-discharge-planning.migration.js');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS discharge_plans');
    expect(migration).toContain('discharge_plans_hospital_updated_idx');
    const route = read('routes/hospital/practice.route.js');
    const section = route.slice(route.indexOf('const ensureDischargePlanningTables'), route.indexOf("router.post('/prescriptions'"));
    expect(section).not.toMatch(/CREATE TABLE|ALTER TABLE|DROP TABLE/i);
    expect(section).toContain('SCHEMA_NOT_MIGRATED');
  });

  it('records survey version, channel, consent and department dimensions', () => {
    const migration = read('migrations/20261015002700-prems-feedback.migration.js');
    for (const field of ['survey_version', 'response_channel', 'consent_captured', 'department', 'nps_score']) {
      expect(migration).toContain(field);
    }
  });
});
