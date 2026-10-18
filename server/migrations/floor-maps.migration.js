/**
 * Migration: Hospital floor maps + wayfinding — run once per environment.
 * Applies: server/migrations/20261008000200-hospital-floor-maps.sql
 * Safe to re-run (all DDL uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
 */

import pool from '../db/pgPool.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const sql   = readFileSync(join(__dir, '20261008000200-hospital-floor-maps.sql'), 'utf8');

const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query(sql);
  await client.query('COMMIT');
  console.log('✅  floor-maps migration complete');
} catch (err) {
  await client.query('ROLLBACK');
  console.error('❌  floor-maps migration failed:', err.message);
  process.exit(1);
} finally {
  client.release();
  process.exit(0);
}
