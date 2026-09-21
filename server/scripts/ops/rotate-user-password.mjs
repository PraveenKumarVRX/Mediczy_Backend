#!/usr/bin/env node
/**
 * Rotate one user's password, revoke their sessions, and print the new random password ONCE.
 *
 *   node server/scripts/ops/rotate-user-password.mjs <email> <tenant_id> [--dry-run]
 *
 * Connects with the server's normal environment (production when run on the production host), so it asks you to
 * confirm the target database before it changes anything. The password is generated here, never stored in a file
 * and never logged anywhere except this terminal. Existing refresh tokens for the user are deleted so old sessions
 * cannot be renewed (an already-issued access token lives out its short lifetime).
 */
import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import bcrypt from 'bcrypt';
import pool from '../../db/pgPool.js';

const [email, tenantArg] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const dry = process.argv.includes('--dry-run');
const tenantId = Number(tenantArg);
if (!email || !Number.isInteger(tenantId) || tenantId <= 0) { console.error('usage: rotate-user-password.mjs <email> <tenant_id> [--dry-run]'); process.exit(2); }

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const randomPassword = () => {
  const pick = (n) => Array.from(crypto.randomBytes(n), (b) => ALPHABET[b % ALPHABET.length]).join('');
  return `${pick(5)}-${pick(5)}-${pick(5)}-${pick(5)}-Aa9`;
};

try {
  const db = (await pool.query(`SELECT current_database() AS db, inet_server_addr()::text AS addr, current_user AS usr`)).rows[0];
  const user = (await pool.query(`SELECT id, email, role, tenant_id, status FROM users WHERE lower(email) = lower($1) AND tenant_id = $2`, [email, tenantId])).rows;
  if (user.length !== 1) { console.error(`Expected exactly one user for ${email} in tenant ${tenantId}; found ${user.length}. Nothing changed.`); process.exit(1); }
  const u = user[0];
  console.log(`Target: user #${u.id} ${u.email} (${u.role}, tenant ${u.tenant_id}, ${u.status}) on database ${db.db} @ ${db.addr || 'local socket'} as ${db.usr}`);
  if (dry) { console.log('Dry run: nothing changed.'); process.exit(0); }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ok = (await rl.question('Type the user id to confirm the rotation: ')).trim();
  rl.close();
  if (ok !== String(u.id)) { console.error('Not confirmed. Nothing changed.'); process.exit(1); }

  const password = randomPassword();
  const hash = await bcrypt.hash(password, 12);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE users SET password = $1, "updatedAt" = NOW() WHERE id = $2 AND tenant_id = $3`, [hash, u.id, tenantId]);
    // Session revocation: column names differ per table and may be integer or text, so compare as text.
    let revoked = 0;
    for (const t of ['hospital_refresh_tokens', 'portal_refresh_tokens']) {
      const cols = (await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name = $1`, [t])).rows.map((r) => r.column_name);
      const idCol = ['user_id', 'userId', 'hospital_user_id', 'staff_id'].find((c) => cols.includes(c));
      if (idCol) revoked += (await client.query(`DELETE FROM ${t} WHERE "${idCol}"::text = $1::text`, [String(u.id)])).rowCount;
    }
    await client.query('COMMIT');
    console.log(`\nPassword rotated for ${u.email}. Sessions revoked: ${revoked}.\n\nNEW PASSWORD (shown once, store it in your password manager):\n\n  ${password}\n`);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
} catch (e) {
  console.error('Failed, nothing was changed:', e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
