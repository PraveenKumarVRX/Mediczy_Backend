/**
 * One-off: hide the seeded test membership plans ("Basic Test Plan", "Free Trial") from the
 * public plans list. Both /api/membership/plans and /api/membership-plans/plans already filter
 * isActive=true, so flipping these to isActive=false removes them. Reversible.
 *
 * Run:  node server/scripts/ssm-env-loader.mjs server/scripts/deactivate-test-membership-plans.mjs
 */
import pool from '../db/pgPool.js';
const { rows: before } = await pool.query(
  `SELECT id,name,"isActive" FROM membership_plans WHERE name ILIKE '%test%' OR name ILIKE '%free trial%' OR name ILIKE '%demo%'`
);
console.log('matched test plans:', JSON.stringify(before));
const res = await pool.query(
  `UPDATE membership_plans SET "isActive"=false WHERE name ILIKE '%test%' OR name ILIKE '%free trial%' OR name ILIKE '%demo%'`
);
console.log('deactivated:', res.rowCount);
process.exit(0);
