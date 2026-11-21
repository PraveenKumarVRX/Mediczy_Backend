/**
 * A generated corporate report keeps the rows it was generated with (HR QA 2026-11-21,
 * items 3-4): before this only a title was saved and the data was recomputed at every
 * download, so a report changed after it was made and its preview showed no data.
 *
 * Run: node scripts/ssm-env-loader.mjs scripts/run-one-migration.mjs migrations/20261121000200-corporate-report-snapshots.migration.js
 */
export async function up(client) {
  await client.query(`ALTER TABLE corporate_generated_reports
    ADD COLUMN IF NOT EXISTS report_type text,
    ADD COLUMN IF NOT EXISTS snapshot jsonb,
    ADD COLUMN IF NOT EXISTS row_count integer`);
}

export async function down(client) {
  await client.query(`ALTER TABLE corporate_generated_reports
    DROP COLUMN IF EXISTS report_type, DROP COLUMN IF EXISTS snapshot, DROP COLUMN IF EXISTS row_count`);
}
