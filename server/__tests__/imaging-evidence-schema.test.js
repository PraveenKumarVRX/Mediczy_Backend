import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

describe('imaging evidence governance schema ownership', () => {
  it('keeps evidence, validation, knowledge and provenance DDL in the migration chain', () => {
    const serviceFiles = [
      'services/imaging/imaging-evidence-graph.service.js',
      'services/imaging/imaging-validation-factory.service.js',
      'services/imaging/imaging-knowledge-base.service.js',
      'services/imaging/imaging-report-provenance.service.js',
    ];
    for (const file of serviceFiles) {
      const source = read(file);
      expect(source).not.toMatch(/CREATE TABLE|CREATE INDEX|ALTER TABLE|CREATE EXTENSION/i);
      expect(source).toContain('SCHEMA_NOT_MIGRATED');
    }
    const migration = read('migrations/20261015004500-imaging-evidence-governance.migration.js');
    expect((migration.match(/^\s*CREATE TABLE IF NOT EXISTS/gm) || []).length).toBe(9);
    expect(migration).toContain('DROP TABLE IF EXISTS imaging_evidence_facts CASCADE');
  });
});
