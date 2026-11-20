/**
 * One account per email, whatever the letter case.
 *
 * users_email_key is case-sensitive, so user@mediczy.com and User@mediczy.com could both be
 * created. Login matches emails without case, so it then checked whichever row came back first
 * and refused the right password. The 3 existing pairs were merged on 2026-11-20 (rows backed up
 * in backup_dup_email_merge_20261120); this index stops new ones.
 *
 * Run: node scripts/ssm-env-loader.mjs scripts/run-one-migration.mjs migrations/20261120000100-users-email-unique-ignoring-case.migration.js
 */
export async function up(client) {
  const { rows: [dup] } = await client.query(`
    SELECT lower(email) AS email, count(*)::int AS accounts FROM users
     WHERE email IS NOT NULL GROUP BY 1 HAVING count(*) > 1 LIMIT 1`);
  if (dup) throw new Error(`users still has ${dup.accounts} accounts for one email; merge them first`);
  await client.query('CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key ON users (lower(email))');
}

export async function down(client) {
  await client.query('DROP INDEX IF EXISTS users_email_lower_key');
}
