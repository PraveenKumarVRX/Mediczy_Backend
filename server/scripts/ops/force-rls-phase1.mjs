#!/usr/bin/env node
/**
 * Turn on FORCE ROW LEVEL SECURITY for the Phase 1 tenant tables (finance_* and tenant_entitlements).
 *
 * Why: the app role OWNS these tables, and an owner bypasses its own policies unless the table is FORCEd — so
 * with only ENABLE, tenant isolation on them did not apply to the app connection at all. Every code path
 * (services/finance-*.js, entitlement.service.js) already runs inside withRlsTransaction, which sets the org
 * context, so FORCE is compatible. Verified 2026-09-25 in a rolled-back transaction: org A sees/writes only its
 * rows, org B cannot read or write them (incl. journal lines via the parent policy), no context sees nothing,
 * platform admin sees all.
 *
 * Idempotent. Run through the SSM env loader like the other prod scripts:
 *   NODE_ENV=production AWS_REGION=ap-south-1 SSM_PARAM_PATH=/mediczy/prod \
 *     node server/scripts/ssm-env-loader.mjs server/scripts/ops/force-rls-phase1.mjs          # apply
 *   ... force-rls-phase1.mjs --check                                                          # report only
 * Rollback (if ever needed): ALTER TABLE <t> NO FORCE ROW LEVEL SECURITY;
 */
import pool from '../../db/pgPool.js';

const TABLES = [
  'tenant_entitlements', 'finance_accounts', 'finance_fiscal_periods', 'finance_vendors', 'finance_expenses',
  'finance_budgets', 'finance_journal_entries', 'finance_tax_codes', 'finance_journal_lines',
];
const checkOnly = process.argv.includes('--check');

const state = async () => (await pool.query(
  `SELECT relname, relrowsecurity AS enabled, relforcerowsecurity AS forced FROM pg_class
    WHERE relnamespace = 'public'::regnamespace AND relname = ANY($1) ORDER BY relname`, [TABLES])).rows;

const before = await state();
const missing = TABLES.filter((t) => !before.some((r) => r.relname === t));
if (missing.length) { console.error('Missing tables (run the phase1-foundations migration first):', missing.join(', ')); process.exit(1); }

if (!checkOnly) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const t of TABLES) await client.query(`ALTER TABLE ${t} FORCE ROW LEVEL SECURITY`);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('FAILED, rolled back:', e.message);
    process.exit(1);
  } finally { client.release(); }
}

for (const r of await state()) console.log(r.relname.padEnd(26), `enabled=${r.enabled}`, `forced=${r.forced}`);
process.exit(0);
