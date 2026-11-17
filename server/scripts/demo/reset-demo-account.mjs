/**
 * Reset the sales demo login now (the same reset the 04:00 IST cron runs), or record its baseline.
 *
 *   node scripts/ssm-env-loader.mjs scripts/demo/reset-demo-account.mjs                 # dry run: what would be cleared
 *   node scripts/ssm-env-loader.mjs scripts/demo/reset-demo-account.mjs --apply         # reset now
 *   node scripts/ssm-env-loader.mjs scripts/demo/reset-demo-account.mjs --capture-baseline --apply
 *       # after setup-corporate-demo-employee.mjs: record family/wallet/entitlement as the state to return to
 *
 * --user=<id> limits it to one demo account. Only accounts with metadata.demoAccount = true are touched.
 */
import pool from '../../db/pgPool.js';
import { resetDemoAccounts } from '../../services/demo-account-reset.service.js';

const arg = (name) => process.argv.includes(`--${name}`);
const userArg = process.argv.find((a) => a.startsWith('--user='));
try {
  const result = await resetDemoAccounts({ apply: arg('apply'), captureBaseline: arg('capture-baseline'), userId: userArg ? Number(userArg.split('=')[1]) : null });
  console.log(result.applied ? 'APPLIED' : 'DRY RUN (rolled back; pass --apply to write)');
  console.log(JSON.stringify(result.accounts, null, 2));
  if (result.accounts.some((a) => a.error)) process.exitCode = 1;
} finally {
  await pool.end();
}
