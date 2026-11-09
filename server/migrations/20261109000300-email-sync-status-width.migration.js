/**
 * Widen email_settings.last_sync_status (and test_result) from VARCHAR(50).
 *
 * The periodic email-sync worker records why a mailbox failed to sync. At 50
 * characters Zoho's diagnostic
 *   "IMAP error: You are yet to enable IMAP for <mailbox>. Please contact your
 *    administrator"
 * was stored as
 *   "error: IMAP error: You are yet to enable IMAP for "
 * — exactly 50 characters, with the mailbox name and the instruction cut off.
 * The one field an operator checks to find out what is wrong held a sentence
 * with the actionable half removed, which is how hello@mysmarthealth.in sat
 * failing every 15 minutes without anyone being able to see why.
 *
 * The model already declares these as DataTypes.STRING (VARCHAR(255)); only
 * the database was narrower, so this brings the column in line with the model.
 */
import pool from '../db/pgPool.js';

export async function up() {
  await pool.query(`
    ALTER TABLE email_settings
      ALTER COLUMN last_sync_status TYPE VARCHAR(255),
      ALTER COLUMN test_result      TYPE VARCHAR(255);
  `);
}

export async function down() {
  // Truncate first: narrowing a column with longer values in it would fail.
  await pool.query(`
    UPDATE email_settings
       SET last_sync_status = LEFT(last_sync_status, 50),
           test_result      = LEFT(test_result, 50);
    ALTER TABLE email_settings
      ALTER COLUMN last_sync_status TYPE VARCHAR(50),
      ALTER COLUMN test_result      TYPE VARCHAR(50);
  `);
}

export default { up, down };
