#!/usr/bin/env node
/**
 * Offline lab auth unit smoke — no DB required.
 * Verifies password hashing + JWT payload contract for lab login.
 */
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'lab-login-unit-test-secret';

const { JWT_CONFIG } = await import('../../config/auth.config.js');
const { hashPasswordIfPlaintext } = await import('../../utils/passwordHashing.js');

const PASSWORD = 'Lab@123';

async function main() {
  const hashed = await hashPasswordIfPlaintext(PASSWORD, 10);
  assert.match(hashed, /^\$2[aby]\$/, 'password must be bcrypt-hashed');
  assert.equal(await bcrypt.compare(PASSWORD, hashed), true, 'Lab@123 must verify');
  assert.equal(await bcrypt.compare('Lab123', hashed), false, 'old Lab123 must not verify');

  // Re-hashing an already-hashed value must be a no-op (prevents lockouts).
  const rehashed = await hashPasswordIfPlaintext(hashed, 10);
  assert.equal(rehashed, hashed, 'must not double-hash bcrypt passwords');

  const labLike = {
    id: 42,
    email: 'lab@mediczy.com',
    name: 'Mediczy Diagnostics Lab',
    isVerified: true,
    department: 'pathology',
    metadata: {},
  };

  // Mirror generateAuthToken payload contract (without Sequelize instance).
  const payload = {
    id: labLike.id,
    labId: labLike.id,
    user_id: labLike.id,
    email: labLike.email,
    role: 'lab',
    userType: 'lab',
    type: 'lab',
    name: labLike.name,
    labName: labLike.name,
    isVerified: labLike.isVerified,
    department: labLike.department,
    scopes: ['labs.read', 'labs.write'],
  };

  const token = jwt.sign(payload, JWT_CONFIG.SECRET, {
    expiresIn: JWT_CONFIG.EXPIRY?.NORMAL || '24h',
  });
  const decoded = jwt.verify(token, JWT_CONFIG.SECRET);

  assert.equal(decoded.role, 'lab');
  assert.equal(decoded.userType, 'lab');
  assert.equal(decoded.labId, 42);
  assert.equal(decoded.id, 42);
  assert.ok(decoded.exp * 1000 > Date.now() + 60 * 60 * 1000, 'token TTL should be > 1h');

  console.log('✅ Lab login unit smoke passed (password + JWT contract)');
}

main().catch((err) => {
  console.error('❌ Lab login unit smoke failed');
  console.error(err?.stack || err?.message || String(err));
  process.exit(1);
});
