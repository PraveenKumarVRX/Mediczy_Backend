import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import pool from '../db/pgPool.js';
import { JWT_CONFIG } from '../config/auth.config.js';

const TABLES = ['mfa_factors', 'mfa_audit_events'];
const STEP_SECONDS = 30;
const CODE_DIGITS = 6;

function userKey(userId) {
  if (userId === undefined || userId === null || String(userId).trim() === '') {
    throw Object.assign(new Error('Authenticated user id is required'), { status: 401, code: 'unauthenticated' });
  }
  return String(userId);
}

function tenantKey(organizationId) {
  return organizationId === undefined || organizationId === null || organizationId === ''
    ? null : String(organizationId);
}

function fail(code, message, status = 503) {
  throw Object.assign(new Error(message), { code, status });
}

export async function ensureMfaSchemaReady() {
  const result = await pool.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = current_schema() AND table_name = ANY($1::text[])`,
    [TABLES]
  );
  const present = new Set(result.rows.map((row) => row.table_name));
  const missing = TABLES.filter((name) => !present.has(name));
  if (missing.length) fail('MFA_SCHEMA_NOT_READY', `MFA storage is not migrated: ${missing.join(', ')}`);
  return true;
}

function base32Encode(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let buffer = 0;
  let output = '';
  for (const byte of value) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(buffer << (5 - bits)) & 31];
  return output;
}

function base32Decode(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const normalized = String(value || '').toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let buffer = 0;
  const out = [];
  for (const char of normalized) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error('Invalid MFA secret');
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateTotpSecret() {
  return base32Encode(crypto.randomBytes(20));
}

export function totpCode(secret, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 1000 / STEP_SECONDS);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac('sha1', base32Decode(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);
  return String(binary % (10 ** CODE_DIGITS)).padStart(CODE_DIGITS, '0');
}

export function verifyTotp(secret, code, timestamp = Date.now()) {
  const supplied = String(code || '').trim();
  if (!/^\d{6}$/.test(supplied)) return false;
  for (const drift of [-1, 0, 1]) {
    const expected = totpCode(secret, timestamp + drift * STEP_SECONDS * 1000);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) return true;
  }
  return false;
}

function encryptionKey() {
  const configured = process.env.MFA_ENCRYPTION_KEY || JWT_CONFIG.SECRET;
  return crypto.createHash('sha256').update(String(configured)).digest();
}

function encryptSecret(secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64url')).join('.');
}

function decryptSecret(value) {
  const [ivEncoded, tagEncoded, ciphertextEncoded] = String(value || '').split('.');
  if (!ivEncoded || !tagEncoded || !ciphertextEncoded) throw new Error('Invalid MFA secret ciphertext');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivEncoded, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagEncoded, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextEncoded, 'base64url')), decipher.final()]).toString('utf8');
}

async function audit(client, values) {
  await client.query(
    `INSERT INTO mfa_audit_events (user_id, organization_id, event_type, factor_id, success, request_id, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [values.userId, values.organizationId, values.eventType, values.factorId || null, values.success !== false,
      values.requestId || null, JSON.stringify(values.metadata || {})]
  );
}

export async function getMfaStatus({ userId, organizationId }) {
  await ensureMfaSchemaReady();
  const result = await pool.query(
    `SELECT id, factor_type, status, enrolled_at, disabled_at, last_used_at
       FROM mfa_factors WHERE user_id = $1 AND organization_id IS NOT DISTINCT FROM $2
       ORDER BY created_at DESC LIMIT 1`,
    [userKey(userId), tenantKey(organizationId)]
  );
  const factor = result.rows[0] || null;
  return { enabled: factor?.status === 'active', pending: factor?.status === 'pending', factor: factor && {
    id: factor.id, type: factor.factor_type, status: factor.status,
    enrolledAt: factor.enrolled_at, disabledAt: factor.disabled_at, lastUsedAt: factor.last_used_at,
  }};
}

export async function beginEnrollment({ userId, organizationId, issuer = 'Mediqzy', account }) {
  await ensureMfaSchemaReady();
  const uid = userKey(userId);
  const tenant = tenantKey(organizationId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      `SELECT id, status FROM mfa_factors WHERE user_id = $1 AND organization_id IS NOT DISTINCT FROM $2
       FOR UPDATE`, [uid, tenant]
    );
    if (existing.rows[0]?.status === 'active') fail('MFA_ALREADY_ENABLED', 'MFA is already enabled', 409);
    const secret = generateTotpSecret();
    const row = await client.query(
      `INSERT INTO mfa_factors (user_id, organization_id, secret_ciphertext, status)
       VALUES ($1,$2,$3,'pending')
       ON CONFLICT (user_id, organization_id, factor_type)
       DO UPDATE SET secret_ciphertext = EXCLUDED.secret_ciphertext, status = 'pending', disabled_at = NULL, updated_at = NOW()
       RETURNING id`, [uid, tenant, encryptSecret(secret)]
    );
    await audit(client, { userId: uid, organizationId: tenant, eventType: 'enrollment_started', factorId: row.rows[0].id });
    await client.query('COMMIT');
    const label = account || uid;
    return { factorId: row.rows[0].id, secret, otpauthUrl: `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30` };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}

async function readFactor(client, userId, organizationId, status = null) {
  const params = [userKey(userId), tenantKey(organizationId)];
  const statusClause = status ? ' AND status = $3' : '';
  if (status) params.push(status);
  const result = await client.query(
    `SELECT * FROM mfa_factors WHERE user_id = $1 AND organization_id IS NOT DISTINCT FROM $2${statusClause}
     ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, params
  );
  return result.rows[0] || null;
}

export async function verifyEnrollment({ userId, organizationId, code, requestId }) {
  await ensureMfaSchemaReady();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const factor = await readFactor(client, userId, organizationId, 'pending');
    if (!factor) fail('MFA_ENROLLMENT_NOT_FOUND', 'Start MFA enrollment first', 404);
    const valid = verifyTotp(decryptSecret(factor.secret_ciphertext), code);
    if (!valid) {
      await audit(client, { userId: userKey(userId), organizationId: tenantKey(organizationId), eventType: 'enrollment_failed', factorId: factor.id, success: false, requestId });
      await client.query('COMMIT');
      fail('MFA_CODE_INVALID', 'Invalid MFA code', 401);
    }
    await client.query(`UPDATE mfa_factors SET status='active', enrolled_at=NOW(), updated_at=NOW() WHERE id=$1`, [factor.id]);
    await audit(client, { userId: userKey(userId), organizationId: tenantKey(organizationId), eventType: 'enrollment_completed', factorId: factor.id, requestId });
    await client.query('COMMIT');
    return { enabled: true };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}

export async function issueStepUpToken({ user, authToken, code, requestId }) {
  await ensureMfaSchemaReady();
  const client = await pool.connect();
  const userId = userKey(user?.id || authToken?.id || authToken?.sub);
  const organizationId = tenantKey(user?.tenant_id || user?.tenantId || authToken?.tenant_id || authToken?.tenantId);
  try {
    await client.query('BEGIN');
    const factor = await readFactor(client, userId, organizationId, 'active');
    if (!factor) fail('MFA_NOT_ENABLED', 'MFA is not enabled for this account', 409);
    const valid = verifyTotp(decryptSecret(factor.secret_ciphertext), code);
    if (!valid) {
      await audit(client, { userId, organizationId, eventType: 'step_up_failed', factorId: factor.id, success: false, requestId });
      await client.query('COMMIT');
      fail('MFA_CODE_INVALID', 'Invalid MFA code', 401);
    }
    await client.query(`UPDATE mfa_factors SET last_used_at=NOW(), updated_at=NOW() WHERE id=$1`, [factor.id]);
    await audit(client, { userId, organizationId, eventType: 'step_up_verified', factorId: factor.id, requestId });
    await client.query('COMMIT');
    const payload = {
      sub: authToken?.sub || userId, id: authToken?.id || userId, userId,
      email: authToken?.email || user?.email, role: authToken?.role || user?.role || 'user',
      userType: authToken?.userType || user?.userType, isAdmin: Boolean(authToken?.isAdmin || user?.isAdmin),
      isTeam: Boolean(authToken?.isTeam || user?.isTeam), organization_id: organizationId,
      tenant_id: organizationId, tenantId: organizationId, org_id: organizationId,
      organization_type: authToken?.organization_type || user?.organization_type,
      token_type: 'access', tokenVersion: authToken?.tokenVersion || 0,
      mfaVerified: true, mfaAt: new Date().toISOString(), mfaFactorId: factor.id,
    };
    return { stepUpToken: jwt.sign(payload, JWT_CONFIG.SECRET, { expiresIn: '10m', algorithm: 'HS256', issuer: 'mediczy', audience: 'mediczy-api' }), expiresIn: 600 };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}

export async function disableMfa({ userId, organizationId, code, requestId }) {
  await ensureMfaSchemaReady();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const factor = await readFactor(client, userId, organizationId, 'active');
    if (!factor) fail('MFA_NOT_ENABLED', 'MFA is not enabled for this account', 404);
    if (!verifyTotp(decryptSecret(factor.secret_ciphertext), code)) {
      await audit(client, { userId: userKey(userId), organizationId: tenantKey(organizationId), eventType: 'disable_failed', factorId: factor.id, success: false, requestId });
      await client.query('COMMIT');
      fail('MFA_CODE_INVALID', 'Invalid MFA code', 401);
    }
    await client.query(`UPDATE mfa_factors SET status='disabled', disabled_at=NOW(), updated_at=NOW() WHERE id=$1`, [factor.id]);
    await audit(client, { userId: userKey(userId), organizationId: tenantKey(organizationId), eventType: 'disabled', factorId: factor.id, requestId });
    await client.query('COMMIT');
    return { enabled: false };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}

export default { ensureMfaSchemaReady, generateTotpSecret, totpCode, verifyTotp, getMfaStatus, beginEnrollment, verifyEnrollment, issueStepUpToken, disableMfa };

/** Consume one TOTP counter under a row lock for password+MFA portal login. */
export async function verifyLoginFactor({ userId, organizationId, code, requestId }) {
  await ensureMfaSchemaReady();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const factor = await readFactor(client, userId, organizationId, 'active');
    if (!factor) fail('MFA_NOT_ENABLED', 'MFA is not enabled for this account', 409);
    const secret = decryptSecret(factor.secret_ciphertext);
    const now = Date.now();
    let counter = null;
    if (/^\d{6}$/.test(String(code || ''))) {
      for (const drift of [-1, 0, 1]) {
        const timestamp = now + drift * STEP_SECONDS * 1000;
        if (crypto.timingSafeEqual(Buffer.from(totpCode(secret, timestamp)), Buffer.from(String(code)))) counter = Math.floor(timestamp / (STEP_SECONDS * 1000));
      }
    }
    const consumed = factor.last_used_at ? Math.floor(new Date(factor.last_used_at).getTime() / (STEP_SECONDS * 1000)) : -1;
    if (counter === null || counter <= consumed) {
      await audit(client, { userId: userKey(userId), organizationId: tenantKey(organizationId), eventType: 'login_failed', factorId: factor.id, success: false, requestId });
      await client.query('COMMIT');
      fail('MFA_CODE_INVALID', 'Enter a fresh authenticator code', 401);
    }
    await client.query('UPDATE mfa_factors SET last_used_at=$2,updated_at=NOW() WHERE id=$1', [factor.id, new Date(counter * STEP_SECONDS * 1000)]);
    await audit(client, { userId: userKey(userId), organizationId: tenantKey(organizationId), eventType: 'login_verified', factorId: factor.id, requestId });
    await client.query('COMMIT');
    return { mfaVerified: true, mfaFactorId: factor.id, mfaAt: new Date(now).toISOString() };
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
}
