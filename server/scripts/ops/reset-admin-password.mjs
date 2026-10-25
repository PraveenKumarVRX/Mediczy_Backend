import pool from '../../db/pgPool.js';
import bcrypt from 'bcrypt';
const NEW_PASSWORD = process.argv[process.argv.length - 1];
if (!NEW_PASSWORD) { console.error('Usage: node reset-admin-password.mjs <new-password>'); process.exit(1); }
const hash = await bcrypt.hash(NEW_PASSWORD, 10);
const { rows } = await pool.query(
  `UPDATE users SET password = $1, "updatedAt" = NOW() WHERE email = 'admin@mediqzy.com' RETURNING id, email`,
  [hash]
);
console.log('Updated:', rows);
process.exit(0);
