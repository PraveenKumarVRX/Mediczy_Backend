import fs from 'node:fs';
import path from 'node:path';

const root = fs.existsSync(path.join(process.cwd(), 'services'))
  ? path.resolve(process.cwd(), '..')
  : path.resolve(process.cwd());
const serviceFiles = [
  'server/services/imaging/imaging-clinical-claims.service.js',
  'server/services/imaging/imaging-daily-minio-transfer.service.js',
  'server/services/imaging/imaging-guidelines.service.js',
  'server/services/imaging/pacs-minio-archive.service.js',
];

test('imaging operations services are migration-owned and fail closed when absent', () => {
  for (const relative of serviceFiles) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    expect(source).not.toMatch(/CREATE\s+(TABLE|INDEX)|ALTER\s+TABLE|CREATE\s+EXTENSION/i);
    expect(source).toContain('SCHEMA_NOT_MIGRATED');
    // The information_schema lookup moved into the shared verifier so every
    // service checks the same way and the awkward row shape is handled once.
    // schema-guard.test.js asserts that it really queries information_schema.
    expect(source).toContain('schema-guard.js');
    expect(source).toMatch(/schemaVerifier\(\{/);
  }
});

test('imaging operations migration contains all four persistence tables', () => {
  const source = fs.readFileSync(
    path.join(root, 'server/migrations/20261015004600-imaging-ops-governance.migration.js'),
    'utf8',
  );
  for (const table of [
    'imaging_clinical_claims',
    'imaging_daily_transfer_log',
    'imaging_guidelines',
    'pacs_minio_archive_log',
  ]) expect(source).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
  expect(source).toContain('DROP TABLE IF EXISTS pacs_minio_archive_log CASCADE');
});
