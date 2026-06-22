#!/usr/bin/env node
/** GAP-IPD-003 — 10-bed hospital seed */
import pool from '../../db/pgPool.js';

const slug = process.argv[2] || 'greenfield-hospital';

const { rows: orgRows } = await pool.query(
  `SELECT id FROM organizations WHERE slug = $1 OR name ILIKE $2 LIMIT 1`,
  [slug, `%${slug}%`],
);
const orgId = orgRows[0]?.id;
if (!orgId) {
  console.error('Organization not found:', slug);
  process.exit(1);
}

const { rows: wardRows } = await pool.query(
  `INSERT INTO wards (organization_id, name, ward_type, floor, capacity, charge_per_day, active, created_at, updated_at)
   VALUES ($1, 'General Ward A', 'general', 2, 10, 2500, true, NOW(), NOW())
   ON CONFLICT DO NOTHING RETURNING id`,
  [orgId],
).catch(async () => {
  const w = await pool.query(`SELECT id FROM wards WHERE organization_id = $1 LIMIT 1`, [orgId]);
  return w;
});

const wardId = wardRows[0]?.id;
if (wardId) {
  for (let i = 1; i <= 10; i++) {
    await pool.query(
      `INSERT INTO beds (organization_id, ward_id, bed_number, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'available', NOW(), NOW())
       ON CONFLICT DO NOTHING`,
      [orgId, wardId, `A-${String(i).padStart(2, '0')}`],
    ).catch(() => null);
  }
}

await pool.query(
  `INSERT INTO charge_master (organization_id, code, name, category, unit_price, active, created_at, updated_at)
   VALUES ($1, 'BED-DAY-GENERAL', 'General ward bed day', 'bed_day', 2500, true, NOW(), NOW())
   ON CONFLICT DO NOTHING`,
  [orgId],
).catch(() => null);

console.log('Seeded ward + 10 beds + bed-day charge for org', orgId);
await pool.end();
