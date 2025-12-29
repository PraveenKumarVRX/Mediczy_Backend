#!/usr/bin/env node
/**
 * Reset default nurse passwords in Postgres to a known value.
 *
 * Usage:
 *   node scripts/reset-nurse-passwords.mjs [password] [email1 email2 ...]
 *
 * Defaults:
 *   password -> Nurse123
 *   emails   -> nurse@mediczy.com, priya.nurse@mediqzy.com, anjali.nurse@mediqzy.com
 */

import pg from 'pg';
import bcrypt from 'bcrypt';

// Optional .env support without hard dependency
const dotenv = await import('dotenv').catch(() => null);
if (dotenv?.config) {
  dotenv.config();
} else {
  console.warn('ℹ️  dotenv not found; using existing environment variables only');
}

const password = process.argv[2] || 'Nurse123';
const fallbackEmails = [
  'nurse@mediczy.com',
  'priya.nurse@mediqzy.com',
  'anjali.nurse@mediqzy.com'
];
const emails = process.argv.slice(3);
const targetEmails = emails.length ? emails : fallbackEmails;

const client = new pg.Client({
  host: process.env.POSTGRES_PRIMARY_HOST || process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PRIMARY_PORT || process.env.POSTGRES_PORT || '5432', 10),
  database: process.env.POSTGRES_PRIMARY_DATABASE || process.env.POSTGRES_DATABASE || 'mediczy_ai',
  user: process.env.POSTGRES_PRIMARY_USER || process.env.POSTGRES_USER || 'mediczy_helper',
  password: process.env.POSTGRES_PRIMARY_PASSWORD || process.env.POSTGRES_PASSWORD || 'Mediczy2024Helper'
});

(async () => {
  try {
    await client.connect();
    const hash = await bcrypt.hash(password, 10);
    console.log(`🔐 Resetting nurse passwords to "${password}" for ${targetEmails.length} account(s)...`);

    for (const email of targetEmails) {
      const { rowCount, rows } = await client.query(
        `UPDATE nurses
         SET password = $1,
             status   = COALESCE(status, 'active')
         WHERE LOWER(email) = LOWER($2)
         RETURNING id, email, status`,
        [hash, email]
      );

      if (!rowCount) {
        console.warn(`⚠️  No nurse found for ${email}`);
        continue;
      }

      const updated = rows[0];
      console.log(`✅ ${updated.email} (id=${updated.id}) set to status=${updated.status}`);
    }

    console.log('🏁 Nurse credential reset complete.');
  } catch (err) {
    console.error('❌ Failed to reset nurse passwords:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
})();
