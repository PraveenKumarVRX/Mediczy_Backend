/**
 * Nightly reset of the shared sales demo login at 04:00 IST (22:30 UTC), after the 02:00 membership sync
 * and the 03:00 roster QC, before anyone is likely to demo it. See demo-account-reset.service.js.
 */
import cron from 'node-cron';
import { withCron } from '../utils/cronRegistry.js';
import { resetDemoAccounts } from './demo-account-reset.service.js';

export async function runDemoAccountReset() {
  const { accounts } = await resetDemoAccounts({ apply: true });
  for (const a of accounts) {
    if (a.error) throw new Error(`demo account ${a.userId}: ${a.error}`);
    if (a.unhandled?.length) console.warn(`🎭 [demo-reset] account ${a.userId} still has rows the reset does not cover: ${a.unhandled.join(', ')}`);
  }
  return { accounts: accounts.length, results: accounts };
}

class DemoAccountResetCronService {
  constructor() { this._job = null; }

  start() {
    if (this._job) return;
    this._job = cron.schedule('30 22 * * *', async () => {
      try {
        const result = await withCron('demo_account_reset', runDemoAccountReset);
        if (!result?.skipped) console.log(`🎭 [demo-reset] ${JSON.stringify(result.results)}`);
      } catch (err) {
        console.error('🎭 [demo-reset] Error:', err.message);
      }
    });
    console.log('🎭 Demo account reset cron started (runs daily at 4:00 AM IST)');
  }

  stop() {
    if (this._job) { this._job.destroy(); this._job = null; }
  }
}

export default new DemoAccountResetCronService();
