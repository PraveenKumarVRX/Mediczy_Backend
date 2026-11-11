/**
 * corporate_ahc_entitlement_notifications.email_status / whatsapp_status were
 * VARCHAR(20), but the service writes 'pending_template_approval' (25) and
 * 'sent_no_file' (12). The first overflowed, so the UPDATE that records a
 * delivery threw 22001 *after* the mail had already gone out: five Equitas
 * employees received their invitation while the audit row still read 'pending'.
 */
export async function up(pool) {
  await pool.query(`
    ALTER TABLE corporate_ahc_entitlement_notifications
      ALTER COLUMN email_status TYPE VARCHAR(40),
      ALTER COLUMN whatsapp_status TYPE VARCHAR(40);
  `);
}

export async function down(pool) {
  // Deliberately not narrowing back: any row holding a longer status would be
  // truncated or the statement would fail.
  await pool.query('SELECT 1');
}
