/**
 * Files attached to a Team email template.
 *
 * An HR/Team user uploads the file once against the template (for example the
 * employer's AHC information sheet); every send of that template — the test
 * send from the template studio and the AHC welcome email — carries it as a
 * real mail attachment. Nothing is generated at send time.
 *
 * The bytes live in the row rather than on disk because the production deploy
 * replaces the working tree (prebuilt archive), which would take any file
 * written under server/public with it.
 */
export async function up(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS team_email_template_attachments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      template_id UUID NOT NULL REFERENCES team_email_templates(id) ON DELETE CASCADE,
      filename VARCHAR(255) NOT NULL,
      content_type VARCHAR(150) NOT NULL DEFAULT 'application/octet-stream',
      byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 10485760),
      checksum CHAR(64),
      content BYTEA NOT NULL,
      uploaded_by_user_id INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_team_email_template_attachments_template
      ON team_email_template_attachments(template_id, created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_team_email_template_attachment_name
      ON team_email_template_attachments(template_id, lower(filename));
  `);
}

export async function down(pool) {
  await pool.query('DROP TABLE IF EXISTS team_email_template_attachments');
}
