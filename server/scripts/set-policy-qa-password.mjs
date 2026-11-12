/**
 * Give the seeded policy-wallet test account a known password so QA can sign
 * in. The account was created by the seed with a random password nobody holds,
 * and its address is a reserved .invalid domain, so neither password nor OTP
 * login was possible.
 *
 * Refuses to touch anything that is not the marked test account.
 */
import bcrypt from 'bcrypt';
import pool from '../db/pgPool.js';

const USER_ID = 7646;
const EXPECT_EMAIL = 'test.policy.employee@example.invalid';
const PASSWORD = process.argv.find(a => a.startsWith('--password='))?.slice(11) || 'QaPolicy2026';
const apply = process.argv.includes('--apply');

const { rows: [u] } = await pool.query(`SELECT id, email, "firstName", status FROM users WHERE id=$1`, [USER_ID]);
if (!u) { console.error(`user ${USER_ID} not found`); process.exit(1); }
if (u.email !== EXPECT_EMAIL) { console.error(`refusing: user ${USER_ID} is ${u.email}, not the marked test account`); process.exit(1); }
if (!String(u.firstName).includes('[TEST]')) { console.error(`refusing: ${USER_ID} is not marked [TEST]`); process.exit(1); }

if (PASSWORD.length < 8 || !/\d/.test(PASSWORD) || !/[A-Za-z]/.test(PASSWORD)) {
  console.error('refusing: the password would fail validatePassword (8+ chars, a letter and a number)');
  process.exit(1);
}
console.log(`account : ${u.id}  ${u.email}  (${u.status})`);
console.log(`password: ${PASSWORD}`);
if (!apply) { console.log('\nDRY RUN — pass --apply'); await pool.end(); process.exit(0); }

await pool.query(`UPDATE users SET password=$1, "updatedAt"=NOW() WHERE id=$2`, [await bcrypt.hash(PASSWORD, 10), USER_ID]);
const { rows: [after] } = await pool.query(`SELECT password FROM users WHERE id=$1`, [USER_ID]);
console.log(`\nstored : ${after.password.slice(0, 7)}… · verifies = ${await bcrypt.compare(PASSWORD, after.password)}`);
await pool.end();
