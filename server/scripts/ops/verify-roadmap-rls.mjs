#!/usr/bin/env node
/**
 * Read-only check that migration 20260926000006 is applied: every roadmap-intelligence table exists with FORCE row-level
 * security and its tenant policy. Prints row counts (rows written before the fix were keyed by whatever id the token
 * carried — a doctor id for doctors — and will not match a hospital).
 *   NODE_ENV=production AWS_REGION=ap-south-1 SSM_PARAM_PATH=/mediczy/prod node scripts/ssm-env-loader.mjs scripts/ops/verify-roadmap-rls.mjs
 */
import pool from '../../db/pgPool.js';
import { TABLES } from '../../migrations/20260926000006-roadmap-intelligence.migration.js';
let bad = 0;
for (const t of TABLES) {
  const r = (await pool.query(`SELECT c.relrowsecurity rls, c.relforcerowsecurity forced,
      EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polname = $2) AS policy
    FROM pg_class c WHERE c.relname = $1 AND c.relkind = 'r'`, [t, `${t}_tenant_isolation`])).rows[0];
  const ok = !!r && r.rls && r.forced && r.policy;
  if (!ok) bad++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${t}: ${r ? `rls=${r.rls} forced=${r.forced} policy=${r.policy}` : 'MISSING'}`);
}
await pool.end?.();
process.exit(bad ? 1 : 0);
