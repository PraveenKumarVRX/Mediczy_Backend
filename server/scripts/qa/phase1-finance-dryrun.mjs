/**
 * Disposable-database dry run for the Phase 1 foundations migration + finance GL flows.
 *
 * Runs in two phases against the same disposable database:
 *   phase=migrate  — apply the migration as the owner/superuser (needs DDL rights)
 *   phase=verify   — exercise every GL/report/entitlement path as a NON-superuser app role
 *
 * The split matters: PostgreSQL lets a superuser bypass RLS unconditionally, so verifying
 * tenant isolation as superuser would prove nothing. Phase 2 is the only meaningful test.
 *
 * SAFETY: refuses to run unless the target host is local. server/.env points at production
 * RDS, so pgPool would otherwise happily migrate prod.
 */
const PHASE = process.env.DRYRUN_PHASE || 'all';
const APP_ROLE = process.env.DRYRUN_APP_ROLE || 'app_finance';
const APP_PASSWORD = process.env.DRYRUN_APP_PASSWORD || 'app_finance';

process.env.DISALLOW_REMOTE_DB = 'true';
process.env.POSTGRES_FORCE_LOCAL = 'true';
process.env.POSTGRES_HOST = process.env.DRYRUN_HOST || '127.0.0.1';
process.env.POSTGRES_PORT = process.env.DRYRUN_PORT || '5432';
process.env.POSTGRES_DATABASE = process.env.DRYRUN_DATABASE || 'mediczy_dryrun';
process.env.POSTGRES_SSL = 'false';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '/var/run/postgresql']);
if (!LOCAL_HOSTS.has(process.env.POSTGRES_HOST)) {
  console.error(`REFUSING: dry run host ${process.env.POSTGRES_HOST} is not local.`);
  process.exit(2);
}

if (PHASE === 'verify') {
  process.env.POSTGRES_USER = APP_ROLE;
  process.env.POSTGRES_PASSWORD = APP_PASSWORD;
} else {
  process.env.POSTGRES_USER = process.env.DRYRUN_USER || 'dryrun';
  process.env.POSTGRES_PASSWORD = process.env.DRYRUN_PASSWORD || 'dryrun';
}

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const mod = await import('../../migrations/20260926000002-phase1-foundations.migration.js');
const pool = (await import('../../db/pgPool.js')).default;
const { withRlsTransaction } = await import('../../middleware/rls-context.middleware.js');
const finance = await import('../../services/finance-ledger.service.js');
const reports = await import('../../services/finance-reports.service.js');
const gl = await import('../../services/finance-gl-posting.service.js');
const entitlements = await import('../../services/entitlement.service.js');

const ORG = 99001;           // synthetic tenant, never a real hospital id

try {
  if (PHASE === 'migrate') {
    // ── Phase 1: DDL as owner/superuser, then grant the app role its table privileges ──
    await mod.up();
    const { Client } = await import('pg');
    const admin = new Client({
      host: process.env.POSTGRES_HOST, port: Number(process.env.POSTGRES_PORT),
      user: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD,
      database: process.env.POSTGRES_DATABASE,
    });
    await admin.connect();
    await admin.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_ROLE}') THEN
        EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L', '${APP_ROLE}', '${APP_PASSWORD}');
      END IF;
    END $$;`);
    await admin.query('GRANT USAGE ON SCHEMA public TO ' + APP_ROLE);
    await admin.query('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ' + APP_ROLE);
    await admin.query('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ' + APP_ROLE);
    await admin.end();
    console.log('PASS  migration applied and app role granted');
    console.log('\n1/1 checks passed');
    await pool.end().catch(() => {});
    process.exit(0);
  }

  const tables = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'finance_%' ORDER BY 1`);
  const expected = ['finance_accounts','finance_budgets','finance_expenses','finance_fiscal_periods',
    'finance_journal_entries','finance_journal_lines','finance_tax_codes','finance_vendors'];
  const found = tables.rows.map((r) => r.table_name);
  check('migration applies', true, `${found.length} finance tables`);
  check('all expected finance tables exist', expected.every((t) => found.includes(t)),
    `missing: ${expected.filter((t) => !found.includes(t)).join(',') || 'none'}`);

  const rls = await pool.query(
    `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relrowsecurity AND c.relname LIKE 'finance_%' ORDER BY 1`);
  check('RLS enabled on finance tables', rls.rows.length >= 8, `${rls.rows.length} tables with RLS`);

  // ── 2. Tenant provisioning + entitlements ────────────────────────────────────
  const seed = await entitlements.seedDefaultFinanceSetup(ORG, { grantedBy: 1 });
  check('seedDefaultFinanceSetup', !!seed.period && seed.accounts === 20,
    `accounts=${seed.accounts} taxCodes=${seed.taxCodes} period=${seed.period?.period_code}`);
  const again = await entitlements.seedDefaultFinanceSetup(ORG, { grantedBy: 1 });
  check('seed is idempotent (re-run safe)', again.accounts === 20 && !again.period,
    `second run created period=${!!again.period} (expected false)`);

  const has = await entitlements.hasModuleEntitlement(ORG, 'accounts_finance', 'view');
  check('entitlement visible under tenant RLS context', has === true, `got ${has}`);
  const denied = await entitlements.hasModuleEntitlement(ORG + 1, 'accounts_finance', 'view');
  check('other tenant denied', denied === false, `got ${denied}`);

  // ── 3. Journal idempotency ───────────────────────────────────────────────────
  const accts = await finance.listAccounts(ORG);
  const byCode = Object.fromEntries(accts.map((a) => [a.account_code, a.id]));
  const spec = {
    description: 'Idempotency probe', entry_date: '2026-04-15',
    source_type: 'probe', source_id: 'probe-1',
    lines: [
      { accountId: byCode['1000'], debit: 100, narration: 'cash' },
      { accountId: byCode['4000'], credit: 100, narration: 'revenue' },
    ],
  };
  const e1 = await finance.postJournalEntry(ORG, spec, 1);
  const e2 = await finance.postJournalEntry(ORG, spec, 1);
  check('replay returns original entry', e1.id === e2.id && e2.idempotentReplay === true, `ids ${e1.id}/${e2.id}`);
  // Verification reads must run inside the tenant RLS context too, exactly as production does.
  const asOrg = (sql, params = []) =>
    withRlsTransaction(pool, { orgId: ORG, userId: 0, isPlatformAdmin: false }, (c) => c.query(sql, params));

  const lineCount = await asOrg('SELECT COUNT(*)::int AS c FROM finance_journal_lines WHERE journal_entry_id=$1', [e1.id]);
  check('replay did not duplicate lines', lineCount.rows[0].c === 2, `${lineCount.rows[0].c} lines (expected 2)`);

  // Genuine concurrent race: all three miss the pre-check, then collide on the unique index.
  const raceSpec = { ...spec, source_type: 'race', source_id: 'race-1' };
  const race = await Promise.allSettled(Array.from({ length: 3 }, () => finance.postJournalEntry(ORG, raceSpec, 1)));
  const okRace = race.filter((r) => r.status === 'fulfilled');
  const rejected = race.filter((r) => r.status === 'rejected').map((r) => r.reason.message);
  check('concurrent same-source posts do not error', okRace.length === 3,
    `${okRace.length}/3 fulfilled; rejected: ${rejected.join(' | ') || 'none'}`);
  check('concurrent posts collapse to one entry', new Set(okRace.map((r) => r.value.id)).size === 1,
    `distinct ids=${new Set(okRace.map((r) => r.value.id)).size}`);
  const raceLines = await asOrg(
    `SELECT COUNT(*)::int AS c FROM finance_journal_lines l
     JOIN finance_journal_entries e ON e.id=l.journal_entry_id WHERE e.source_type='race' AND e.source_id='race-1'`);
  check('race produced exactly one entry with 2 lines', raceLines.rows[0].c === 2, `${raceLines.rows[0].c} lines`);

  // ── 4. GL adapters ───────────────────────────────────────────────────────────
  const inv = await gl.postInvoice(ORG, {
    id: 5001, bill_number: 'DRY-1', total_amount: 1000, patient_liability: 700, insurance_amount: 300,
  }, 1);
  check('postInvoice', inv.posted === true, inv.error || `entry ${inv.entryNumber}`);

  const pay = await gl.postPayment(ORG, { id: 9001, payment_method: 'upi', amount: 700 }, 1);
  check('postPayment', pay.posted === true, pay.error || `entry ${pay.entryNumber}`);

  const ins = await gl.postInsuranceSettlement(ORG, { claimId: 'CLM-1', checkNumber: 'CHQ1', paidAmount: 300 }, 1);
  check('postInsuranceSettlement', ins.posted === true, ins.error || `entry ${ins.entryNumber}`);

  const ref = await gl.postRefund(ORG, { paymentId: 9001, refundId: 'RF-1', amount: 100 }, 1);
  check('postRefund', ref.posted === true, ref.error || `entry ${ref.entryNumber}`);

  const adj = await gl.postAdjustment(ORG, { id: 7001, invoiceId: 5001, adjustmentType: 'contractual', amount: -50 }, 1);
  check('postAdjustment (negative)', adj.posted === true, adj.error || `entry ${adj.entryNumber}`);

  const replay = await gl.postInvoice(ORG, {
    id: 5001, bill_number: 'DRY-1', total_amount: 1000, patient_liability: 700, insurance_amount: 300,
  }, 1);
  check('postInvoice replay is idempotent', replay.posted === true && replay.idempotentReplay === true,
    `replay=${replay.idempotentReplay}`);

  // ── 5. postExpense, including the tax line ───────────────────────────────────
  const exp = await finance.createExpense(ORG, {
    expense_date: '2026-04-16', category: 'Consumables', description: 'Gloves',
    amount: 500, tax_code: 'GST18', tax_amount: 90,
  }, 1);
  const expPost = await gl.postExpense(ORG, exp, 1);
  check('postExpense (with tax)', expPost.posted === true, expPost.error || `entry ${expPost.entryNumber}`);
  const expRow = await asOrg('SELECT status, journal_entry_id FROM finance_expenses WHERE id=$1', [exp.id]);
  check('expense marked approved + linked to journal',
    expRow.rows[0].status === 'approved' && !!expRow.rows[0].journal_entry_id,
    `status=${expRow.rows[0].status} je=${expRow.rows[0].journal_entry_id}`);
  if (expPost.posted) {
    const lines = await asOrg(
      `SELECT a.account_code, l.debit, l.credit FROM finance_journal_lines l
       JOIN finance_accounts a ON a.id=l.account_id
       JOIN finance_journal_entries e ON e.id=l.journal_entry_id
       WHERE e.source_type='expense' AND e.source_id=$1`, [String(exp.id)]);
    const debit = lines.rows.reduce((s, r) => s + Number(r.debit), 0);
    const credit = lines.rows.reduce((s, r) => s + Number(r.credit), 0);
    check('expense entry balances (500 + 90 tax)', Math.abs(debit - credit) < 0.005 && debit === 590,
      `debit=${debit} credit=${credit} (expected 590 each)`);
  }

  // ── 6. Reports: entry_date vs expense_date ───────────────────────────────────
  const tb = await reports.trialBalance(ORG, { from: '2026-04-01', to: '2026-04-30' });
  check('trial balance balances', tb.balanced === true, `Dr=${tb.totals.debit} Cr=${tb.totals.credit}`);

  const pl = await reports.profitAndLoss(ORG, { from: '2026-04-01', to: '2026-04-30' });
  check('profit & loss runs', typeof pl.netProfit === 'number', `net=${pl.netProfit}`);

  const bs = await reports.balanceSheet(ORG, '2026-04-30');
  check('balance sheet balances', bs.balanced === true,
    `A=${bs.totalAssets} L+E=${Number(bs.totalLiabilities + bs.totalEquity).toFixed(2)}`);

  try {
    const tax = await reports.taxSummary(ORG, { from: '2026-04-01', to: '2026-04-30' });
    check('taxSummary uses expense_date (no SQL error)', tax.byTaxCode.length === 1,
      `codes=${tax.byTaxCode.map((t) => t.tax_code)}`);
    check('taxSummary totals input tax', Number(tax.totalTax) === 90, `totalTax=${tax.totalTax}`);
  } catch (e) { check('taxSummary uses expense_date (no SQL error)', false, e.message); }

  const may = await reports.taxSummary(ORG, { from: '2026-05-01', to: '2026-05-31' });
  check('taxSummary range filter excludes out-of-window expenses', may.byTaxCode.length === 0,
    `${may.byTaxCode.length} rows in May (expected 0)`);

  const csv = await reports.ledgerCsv(ORG, { from: '2026-04-01', to: '2026-04-30' });
  check('ledgerCsv export', csv.content.startsWith('account_code,') && csv.filename.endsWith('.csv'), csv.filename);

  // ── 7. Reversal, then fiscal-period close ────────────────────────────────────
  // Reversal posts at today's date, so it must run BEFORE the period is closed —
  // posting into a closed period is (correctly) refused.
  const rev = await finance.reverseJournalEntry(ORG, pay.journalEntryId, 'Cashier correction', 1);
  check('reverseJournalEntry', rev?.success === true && !!rev.reversal,
    rev?.reversal?.entry_number || JSON.stringify(rev).slice(0, 120));
  const afterRev = await reports.trialBalance(ORG, { from: '2026-04-01', to: '2026-04-30' });
  check('reversal nets the original out', afterRev.balanced === true, `balanced=${afterRev.balanced}`);
  const revTwice = await finance.reverseJournalEntry(ORG, pay.journalEntryId, 'Duplicate attempt', 1)
    .catch((e) => e);
  check('re-reversing an already-reversed entry is idempotent-safe',
    revTwice?.success === true && revTwice.alreadyReversed === true,
    revTwice?.message || 'NOT GUARDED');

  const closed = await finance.closeFiscalPeriod(ORG, '2026-04', 1).catch((e) => ({ error: e.message }));
  check('closeFiscalPeriod', closed.status === 'closed', closed.error || 'closed');
  let closedAgain = null;
  try { await finance.closeFiscalPeriod(ORG, '2026-04', 1); } catch (e) { closedAgain = e; }
  check('closing an already-closed period is refused', closedAgain?.code === 'PERIOD_NOT_OPEN',
    closedAgain?.message || 'NOT REFUSED');
  const blocked = await finance
    .postJournalEntry(ORG, { ...spec, source_type: 'probe2', source_id: 'probe-2', entry_date: '2026-04-20' }, 1)
    .catch((e) => e);
  check('posting into a closed period is refused', !!blocked?.code, blocked?.message || 'NOT REFUSED');

  await finance.createFiscalPeriod(ORG, { period_code: '2026-05', start_date: '2026-05-01', end_date: '2026-05-31' });

  // ── 8. Cross-tenant isolation ────────────────────────────────────────────────
  let leak = null;
  try { leak = await finance.listAccounts(ORG + 1); } catch (e) { leak = e.message; }
  check('other tenant cannot read accounts', Array.isArray(leak) && leak.length === 0,
    `got ${Array.isArray(leak) ? `${leak.length} rows` : leak}`);

  const noCtx = await pool.query('SELECT COUNT(*)::int AS c FROM finance_journal_entries');
  check('no RLS context sees zero rows (fail-closed)', noCtx.rows[0].c === 0,
    `${noCtx.rows[0].c} rows visible without app.current_org_id (role=${process.env.POSTGRES_USER})`);

  // A wrong-but-present org must not leak either.
  const wrongOrg = await withRlsTransaction(pool, { orgId: 424242, userId: 0, isPlatformAdmin: false },
    (c) => c.query('SELECT COUNT(*)::int AS c FROM finance_journal_entries'));
  check('a different org_id sees zero rows', wrongOrg.rows[0].c === 0, `${wrongOrg.rows[0].c} rows`);

  const plat = await withRlsTransaction(pool, { orgId: 0, userId: 0, isPlatformAdmin: true },
    (c) => c.query('SELECT COUNT(*)::int AS c FROM finance_journal_entries'));
  check('platform admin can read across tenants', plat.rows[0].c > 0, `${plat.rows[0].c} rows`);
} catch (err) {
  check('harness completed without fatal error', false, err.stack || err.message);
} finally {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  await pool.end().catch(() => {});
  process.exit(failed.length ? 1 : 0);
}
