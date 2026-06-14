/**
 * ITEM-14: SFTP credential re-encryption migration.
 *
 * Re-encrypts all SFTP credentials using the new SFTP_CREDENTIAL_KEY env var
 * in place of the old JWT_SECRET fallback.
 *
 * Run ONCE after adding SFTP_CREDENTIAL_KEY to server/.env.
 * Safe to run multiple times (skips already-migrated rows).
 *
 * Usage:
 *   node server/migrations/sftp-rekey.migration.js
 *
 * Old key is read from OLD_SFTP_KEY env var (or defaults to JWT_SECRET for
 * backwards compatibility with the original insecure fallback).
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import pool from '../db/pgPool.js';

function makeKey(hex) {
  if (!hex) throw new Error('Key is required');
  return Buffer.from(hex.slice(0, 64), 'hex');
}

function encryptNew(plaintext, key) {
  const iv     = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc    = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

function decryptOld(ciphertext, key) {
  if (!ciphertext) return null;
  try {
    const [ivHex, tagHex, encHex] = ciphertext.split(':');
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]).toString('utf8');
  } catch {
    return null; // Decryption failed — already migrated or different format
  }
}

export async function runMigration(pgPool = pool) {
  const newKeyHex = process.env.SFTP_CREDENTIAL_KEY;
  const oldKeyHex = process.env.OLD_SFTP_KEY || process.env.JWT_SECRET;

  if (!newKeyHex) throw new Error('SFTP_CREDENTIAL_KEY env var is required');
  if (!oldKeyHex) throw new Error('OLD_SFTP_KEY (or JWT_SECRET) env var is required to read old credentials');

  const newKey = makeKey(newKeyHex.padEnd(64, '0'));
  const oldKey = makeKey(oldKeyHex.padEnd(64, '0'));

  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      'SELECT id, password_enc, private_key_enc FROM sftp_connections WHERE password_enc IS NOT NULL OR private_key_enc IS NOT NULL'
    );

    console.log(`[sftp-rekey] Found ${rows.length} connections to check`);
    let rekeyed = 0;
    let skipped = 0;

    for (const row of rows) {
      const newPassEnc = row.password_enc
        ? encryptNew(decryptOld(row.password_enc, oldKey) ?? decryptOld(row.password_enc, newKey) ?? '', newKey)
        : null;
      const newKeyEnc = row.private_key_enc
        ? encryptNew(decryptOld(row.private_key_enc, oldKey) ?? decryptOld(row.private_key_enc, newKey) ?? '', newKey)
        : null;

      // Verify decryption succeeded before writing
      if (row.password_enc && !decryptOld(row.password_enc, oldKey)) {
        console.log(`[sftp-rekey] Connection ${row.id}: password already uses new key or is unreadable — skipping`);
        skipped++;
        continue;
      }

      await client.query(
        'UPDATE sftp_connections SET password_enc = $1, private_key_enc = $2 WHERE id = $3',
        [newPassEnc, newKeyEnc, row.id]
      );
      rekeyed++;
    }

    await client.query('COMMIT');
    console.log(`[sftp-rekey] Done — rekeyed: ${rekeyed}, skipped: ${skipped}`);
    return { success: true, rekeyed, skipped };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[sftp-rekey] Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

if (process.argv[1]?.endsWith('sftp-rekey.migration.js')) {
  runMigration().then(() => process.exit(0)).catch(() => process.exit(1));
}
