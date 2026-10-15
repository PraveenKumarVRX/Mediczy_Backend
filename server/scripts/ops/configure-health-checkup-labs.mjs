#!/usr/bin/env node
/**
 * Configure the standard lab-visit health-checkup slots for active labs.
 * This changes lab availability only. It never creates corporate users or
 * health packages; those remain HR/lab-portal responsibilities.
 *
 * Usage:
 *   node scripts/ops/configure-health-checkup-labs.mjs
 *   node scripts/ops/configure-health-checkup-labs.mjs --apply
 */
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: new URL('../../.env', import.meta.url) });

const { Client } = pg;
const apply = process.argv.includes('--apply');
const slots = [
  { id: 'slot-1', label: '07:00 AM – 09:00 AM', value: '07:00' },
  { id: 'slot-2', label: '09:00 AM – 11:00 AM', value: '09:00' },
  { id: 'slot-3', label: '11:00 AM – 01:00 PM', value: '11:00' },
];

for (const key of ['POSTGRES_HOST', 'POSTGRES_DATABASE', 'POSTGRES_USER', 'POSTGRES_PASSWORD']) {
  if (!process.env[key]) throw new Error(`Missing ${key}`);
}

const client = new Client({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT || 5432),
  database: process.env.POSTGRES_DATABASE,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

await client.connect();
try {
  const before = await client.query(`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE LOWER(COALESCE(status, 'active')) = 'active')::int AS active,
           COUNT(*) FILTER (WHERE metadata ? 'healthCheckupSlots')::int AS configured
    FROM labs
  `);
  const active = before.rows[0].active;
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', before: before.rows[0], slots }));
  if (!apply) process.exit(0);

  await client.query('BEGIN');
  const result = await client.query(`
    UPDATE labs
       SET metadata = COALESCE(metadata, '{}'::jsonb)
                    || jsonb_build_object('healthCheckupSlots', $1::jsonb),
           "updatedAt" = NOW()
     WHERE LOWER(COALESCE(status, 'active')) = 'active'
  `, [JSON.stringify(slots)]);
  const after = await client.query(`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE LOWER(COALESCE(status, 'active')) = 'active')::int AS active,
           COUNT(*) FILTER (WHERE metadata ? 'healthCheckupSlots')::int AS configured
    FROM labs
  `);
  if (after.rows[0].active !== active || after.rows[0].configured < active) {
    throw new Error(`Verification failed: ${JSON.stringify(after.rows[0])}`);
  }
  await client.query('COMMIT');
  console.log(JSON.stringify({ updated: result.rowCount, after: after.rows[0] }));
} catch (error) {
  try { await client.query('ROLLBACK'); } catch { /* no-op */ }
  throw error;
} finally {
  await client.end();
}
