import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

describe('operative note governance', () => {
  it('owns operative note storage in the migration manifest', () => {
    const migration = read('migrations/20261015003000-operative-notes-governance.migration.js');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS operative_notes');
    expect(migration).toContain('idx_op_note_booking_signed');
    expect(read('scripts/migrate-all.mjs')).toContain('operative-notes-governance');
  });

  it('fails closed when note storage is unavailable and requires a signed note for closure', () => {
    const service = read('services/operative-notes.service.js');
    expect(service).not.toMatch(/CREATE TABLE|ALTER TABLE|DROP TABLE/i);
    expect(service).toContain('SCHEMA_NOT_MIGRATED');
    const scheduling = read('services/ot-scheduling.service.js');
    expect(scheduling).toContain("code = 'OPERATIVE_NOTE_REQUIRED'");
  });
});
