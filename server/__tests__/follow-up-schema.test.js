import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

describe('follow-up and recovery schema ownership', () => {
  it('uses migration-owned continuity tables and typed readiness', () => {
    const migration = read('migrations/20260526000001-create-hmis-phase3-5-tables.js');
    for (const table of ['follow_up_plans', 'recovery_checkins', 'remote_monitoring_alerts', 'patient_feedback', 'outcome_records']) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    const service = read('services/follow-up-hmis.service.js');
    expect(service).not.toMatch(/CREATE TABLE|ALTER TABLE|DROP TABLE/i);
    expect(service).toContain('SCHEMA_NOT_MIGRATED');
  });
});
