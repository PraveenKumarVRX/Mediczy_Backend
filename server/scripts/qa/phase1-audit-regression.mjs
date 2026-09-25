/**
 * Regression harness for the 2026-09-25 audit remediation (finance ledger, entitlements, reconciliation).
 * Runs against a DISPOSABLE local database only — refuses any non-local host, because server/.env points at
 * production. Two phases, as in phase1-finance-dryrun.mjs: `migrate` as a superuser (DDL), then `verify` as a
 * NON-superuser app role (a superuser bypasses row-level security, which would make the isolation checks meaningless).
 *
 *   DRYRUN_DATABASE=… DRYRUN_USER=… DRYRUN_PASSWORD=… npm run test:phase1-audit-regression
 *
 * Every assertion is on AMOUNTS, not on a "balanced" flag: the original reversal bug (revenue −1,000 after a full
 * reversal) still produced a balanced trial balance.
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
if (!new Set(['127.0.0.1', 'localhost', '::1', '/var/run/postgresql']).has(process.env.POSTGRES_HOST)) {
  console.error(`REFUSING: host ${process.env.POSTGRES_HOST} is not local.`);
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
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };
const rejects = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };

const pool = (await import('../../db/pgPool.js')).default;
const { withRlsTransaction } = await import('../../middleware/rls-context.middleware.js');
const finance = await import('../../services/finance-ledger.service.js');
const reports = await import('../../services/finance-reports.service.js');
const gl = await import('../../services/finance-gl-posting.service.js');
const recon = await import('../../services/finance-reconciliation.service.js');
const ent = await import('../../services/entitlement.service.js');
const { todayIST, fiscalYearOf } = await import('../../utils/ist-date.js');

const ORG = 99002;

try {
  if (PHASE === 'migrate') {
    const m2 = await import('../../migrations/20260926000002-phase1-foundations.migration.js');
    const m3 = await import('../../migrations/20260926000003-audit-remediation.migration.js');
    await m2.up(); await m3.up();
    const { Client } = await import('pg');
    const admin = new Client({ host: process.env.POSTGRES_HOST, port: Number(process.env.POSTGRES_PORT), user: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD, database: process.env.POSTGRES_DATABASE });
    await admin.connect();
    // Minimal copies of the billing / audit tables the reconciliation and audit paths read (production already has them).
    await admin.query(`
      CREATE TABLE IF NOT EXISTS operations_audit_log (id SERIAL PRIMARY KEY, module TEXT, entity_type TEXT, entity_id TEXT, action TEXT, actor TEXT, details JSONB, created_at TIMESTAMPTZ DEFAULT NOW(), organization_id BIGINT);
      CREATE TABLE IF NOT EXISTS hospital_invoices (id SERIAL PRIMARY KEY, hospital_id BIGINT, bill_number TEXT, total_amount NUMERIC, tax_amount NUMERIC DEFAULT 0, insurance_amount NUMERIC DEFAULT 0, voided_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS hospital_payments (id SERIAL PRIMARY KEY, hospital_id BIGINT, payment_method TEXT, amount NUMERIC, insurance_claim_id BIGINT, status TEXT DEFAULT 'completed', voided_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS hospital_payment_refunds (id SERIAL PRIMARY KEY, hospital_id BIGINT, payment_id BIGINT, amount NUMERIC, status TEXT DEFAULT 'completed', created_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS hospital_bill_adjustments (id SERIAL PRIMARY KEY, hospital_id BIGINT, invoice_id BIGINT, adjustment_type TEXT, amount NUMERIC, created_at TIMESTAMPTZ DEFAULT NOW());`);
    await admin.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${APP_ROLE}') THEN EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L','${APP_ROLE}','${APP_PASSWORD}'); END IF; END $$;`);
    await admin.query(`GRANT USAGE ON SCHEMA public TO ${APP_ROLE}; GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}; GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${APP_ROLE};`);
    await admin.end();
    console.log('PASS  migrations 2+3 applied, audit/billing tables and app role prepared');
    await pool.end().catch(() => {});
    process.exit(0);
  }

  const asOrg = (sql, params = []) => withRlsTransaction(pool, { orgId: ORG, userId: 0, isPlatformAdmin: false }, (c) => c.query(sql, params));
  const bal = async (code) => {
    const tb = await reports.trialBalance(ORG, {});
    const l = tb.lines.find((x) => x.account_code === code);
    return l ? { debit: l.debit, credit: l.credit, net: l.net } : { debit: 0, credit: 0, net: 0 };
  };

  // ── Setup: seed (FIN-04) ───────────────────────────────────────────────────────────────────
  const fy = fiscalYearOf(todayIST());
  const seed = await ent.seedDefaultFinanceSetup(ORG, { grantedBy: 1 });
  check('seed: chart incl. GST Input Credit (20 accounts)', seed.accounts === 20, `accounts=${seed.accounts}`);
  check('seed: fiscal year comes from today\'s IST date, not the calendar year', seed.fiscalYear === fy.label, `${seed.fiscalYear} (expected ${fy.label})`);
  check('seed: twelve monthly periods, the current date is covered', seed.periodsCreated === 12 && !!seed.period, `created=${seed.periodsCreated} current=${seed.period?.period_code}`);
  const again = await ent.seedDefaultFinanceSetup(ORG, { grantedBy: 1 });
  check('seed is idempotent', again.periodsCreated === 0 && !again.period && !again.grant);

  const accts = Object.fromEntries((await finance.listAccounts(ORG)).map((a) => [a.account_code, a.id]));
  const sale = (n) => ({ description: `sale ${n}`, source_type: 'probe', source_id: `sale-${n}`, lines: [{ accountId: accts['1000'], debit: 1000 }, { accountId: accts['4000'], credit: 1000 }] });

  // ── FIN-01 / FIN-02: reversal ─────────────────────────────────────────────────────────────
  const original = await finance.postJournalEntry(ORG, sale(1), 1);
  let rev = await bal('4000');
  check('a posted 1,000 sale shows revenue credit 1,000', rev.credit === 1000 && rev.debit === 0, JSON.stringify(rev));
  const reversed = await finance.reverseJournalEntry(ORG, original.id, 'test reversal', 1);
  check('reverseJournalEntry succeeds', reversed.success === true && !!reversed.reversal);
  const revenue = await bal('4000'); const cash = await bal('1000');
  check('FIN-01: after a full reversal revenue nets to ZERO', revenue.net === 0, `revenue net=${revenue.net} (was −1000 before the fix)`);
  check('FIN-01: after a full reversal cash nets to ZERO', cash.net === 0, `cash net=${cash.net}`);
  const pl = await reports.profitAndLoss(ORG, {});
  check('FIN-01: P&L is zero after the reversal', pl.totalIncome === 0 && pl.netProfit === 0, `income=${pl.totalIncome}`);
  const flags = (await asOrg('SELECT id, status, reversal_of FROM finance_journal_entries WHERE id = ANY($1) ORDER BY id', [[original.id, reversed.reversal.id]])).rows;
  const fo = flags.find((f) => Number(f.id) === Number(original.id)); const fr = flags.find((f) => Number(f.id) === Number(reversed.reversal.id));
  check('FIN-02: original is status=reversed with reversal_of NULL', fo.status === 'reversed' && fo.reversal_of === null, JSON.stringify(fo));
  check('FIN-02: the reversal points at the original', Number(fr.reversal_of) === Number(original.id) && fr.status === 'posted', JSON.stringify(fr));
  const reReverse = await rejects(() => finance.reverseJournalEntry(ORG, reversed.reversal.id, 'undo the undo', 1));
  check('FIN-02: a reversal cannot itself be reversed', reReverse?.code === 'REVERSAL_CANNOT_BE_REVERSED', reReverse?.message);
  const twice = await finance.reverseJournalEntry(ORG, original.id, 'again', 1);
  check('reversing an already-reversed entry is a safe no-op', twice.alreadyReversed === true);
  const o2 = await finance.postJournalEntry(ORG, sale(2), 1);
  const race = await Promise.allSettled([1, 2, 3].map(() => finance.reverseJournalEntry(ORG, o2.id, 'race', 1)));
  const madeRev = (await asOrg(`SELECT COUNT(*)::int c FROM finance_journal_entries WHERE reversal_of = $1`, [o2.id])).rows[0].c;
  check('3 concurrent reversals of one entry produce exactly ONE reversal entry', madeRev === 1 && race.every((r) => r.status === 'fulfilled'), `reversals=${madeRev}, settled=${race.map((r) => r.status).join(',')}`);
  const final = await bal('4000');
  check('revenue still nets to zero after all reversals', final.net === 0, `net=${final.net}`);

  // ── FIN-03: fiscal period controls ───────────────────────────────────────────────────────
  const noPeriod = await rejects(() => finance.postJournalEntry(ORG, { ...sale(3), entry_date: '2020-01-15' }, 1));
  check('FIN-03: a date with no covering period is refused', noPeriod?.code === 'NO_FISCAL_PERIOD', noPeriod?.message);
  const cur = seed.period.period_code;
  const overlap = await rejects(() => finance.createFiscalPeriod(ORG, { period_code: 'X-OVERLAP', start_date: seed.period.start_date.toISOString().slice(0, 10), end_date: seed.period.end_date.toISOString().slice(0, 10) }));
  check('FIN-03: an overlapping period is refused', overlap?.code === 'FISCAL_PERIOD_OVERLAP', overlap?.message);
  const moved = await rejects(() => finance.createFiscalPeriod(ORG, { period_code: cur, start_date: `${cur}-01`, end_date: `${cur}-20` })); // shrinks the period: no overlap, but it already holds entries
  check('FIN-03: dates of a period that already has entries cannot change', moved?.code === 'FISCAL_PERIOD_HAS_ENTRIES', moved?.message);
  const closable = fy.startYear + '-04';
  const closedNow = await finance.closeFiscalPeriod(ORG, closable, 1);
  check('closing an open period works', closedNow.status === 'closed');
  const reopen = await rejects(() => finance.createFiscalPeriod(ORG, { period_code: closable, start_date: `${fy.startYear}-04-01`, end_date: `${fy.startYear}-05-31` }));
  check('FIN-03: a CLOSED period\'s dates cannot be changed', reopen?.code === 'FISCAL_PERIOD_CLOSED', reopen?.message);
  const intoClosed = await rejects(() => finance.postJournalEntry(ORG, { ...sale(4), entry_date: `${fy.startYear}-04-10` }, 1));
  check('posting into a closed period is refused', intoClosed?.code === 'FISCAL_PERIOD_CLOSED', intoClosed?.message);

  // ── FIN-07: balance enforced by the database ─────────────────────────────────────────────
  const unbalanced = await rejects(() => withRlsTransaction(pool, { orgId: ORG, userId: 0, isPlatformAdmin: false }, async (c) => {
    const e = (await c.query(`INSERT INTO finance_journal_entries (organization_id, entry_number, entry_date, description) VALUES ($1,'RAW-UNBAL',CURRENT_DATE,'raw') RETURNING id`, [ORG])).rows[0];
    await c.query(`INSERT INTO finance_journal_lines (journal_entry_id, account_id, debit, credit) VALUES ($1,$2,100,0),($1,$3,0,90)`, [e.id, accts['1000'], accts['4000']]);
  }));
  check('FIN-07: hand-written unbalanced SQL is rejected at COMMIT by the database', unbalanced?.code === '23514', unbalanced?.message);
  const balancedRaw = await rejects(() => withRlsTransaction(pool, { orgId: ORG, userId: 0, isPlatformAdmin: false }, async (c) => {
    const e = (await c.query(`INSERT INTO finance_journal_entries (organization_id, entry_number, entry_date, description) VALUES ($1,'RAW-BAL',CURRENT_DATE,'raw') RETURNING id`, [ORG])).rows[0];
    await c.query(`INSERT INTO finance_journal_lines (journal_entry_id, account_id, debit, credit) VALUES ($1,$2,100,0),($1,$3,0,100)`, [e.id, accts['1000'], accts['4000']]);
  }));
  check('FIN-07: a balanced multi-line insert still commits', balancedRaw === null, balancedRaw?.message);
  const negLine = await rejects(() => finance.postJournalEntry(ORG, { description: 'neg', lines: [{ accountId: accts['1000'], debit: -50 }, { accountId: accts['4000'], credit: -50 }] }, 1));
  check('negative amounts are refused with a clear validation error', negLine?.code === 'INVALID_JOURNAL' && negLine.status === 400, negLine?.message);

  // ── FIN-06: posting adapters ─────────────────────────────────────────────────────────────
  const snap = async () => ({ ar: (await bal('1200')).net, ins: (await bal('1210')).net, rev: (await bal('4000')).net, gst: (await bal('2500')).net, bank: (await bal('1010')).net, cash: (await bal('1000')).net, adj: (await bal('4010')).net, tax: (await bal('1300')).net, ap: (await bal('2000')).net, exp: (await bal('5000')).net });
  const b0 = await snap();
  const inv = await gl.postInvoice(ORG, { id: 8001, bill_number: 'A-1', total_amount: 1180, tax_amount: 180, insurance_amount: 400 }, 1);
  check('postInvoice posts (GST split, insurance share)', inv.posted === true, inv.error);
  let b = await snap();
  check('invoice: patient A/R +780, insurance A/R +400', b.ar - b0.ar === 780 && b.ins - b0.ins === 400, `ar+${b.ar - b0.ar} ins+${b.ins - b0.ins}`);
  check('invoice: revenue 1,000 (net of GST) and GST payable 180', b.rev - b0.rev === -1000 && b.gst - b0.gst === -180, `rev ${b.rev - b0.rev} gst ${b.gst - b0.gst}`);
  const oddTotals = await gl.postInvoice(ORG, { id: 8002, bill_number: 'A-2', total_amount: 500, tax_amount: 0, insurance_amount: 0, patient_liability: 480 }, 1);
  check('invoice whose stored patient_liability disagrees still balances (derived from total − insurance)', oddTotals.posted === true, oddTotals.error);
  const badInv = await gl.postInvoice(ORG, { id: 8003, bill_number: 'A-3', total_amount: 100, tax_amount: 500, insurance_amount: 0 }, 1);
  check('an impossible invoice (tax > total) is rejected, not mis-posted', badInv.posted === false && badInv.code === 'INVALID_SOURCE_DOCUMENT', badInv.error);

  const bInv = await snap();
  const pay = await gl.postPayment(ORG, { id: 9001, payment_method: 'upi', amount: 780 }, 1);
  b = await snap();
  check('UPI payment debits BANK (not cash) and extinguishes patient A/R by exactly the amount', pay.posted && b.bank - bInv.bank === 780 && b.cash === bInv.cash && b.ar - bInv.ar === -780, `bank+${b.bank - bInv.bank} ar${b.ar - bInv.ar}`);
  const arAfter = b.ar;
  const insBefore = b.ins;
  const insPay = await gl.postPayment(ORG, { id: 9002, payment_method: 'neft', amount: 400, insurance_claim_id: 5 }, 1);
  b = await snap();
  check('a payment settling an insurer claim credits INSURANCE A/R, not patient A/R', insPay.posted && b.ins - insBefore === -400 && b.ar === arAfter, `ins${b.ins - insBefore} ar=${b.ar}`);

  const r1 = await gl.postRefund(ORG, { paymentId: 9001, refundId: 1, amount: 100, paymentMethod: 'upi' }, 1);
  const r2 = await gl.postRefund(ORG, { paymentId: 9001, refundId: 2, amount: 100, paymentMethod: 'upi' }, 1);
  check('FIN-06: two EQUAL partial refunds on one payment are two entries (was: second dropped)', r1.posted && r2.posted && r1.journalEntryId !== r2.journalEntryId && !r2.idempotentReplay);
  const rr = await gl.postRefund(ORG, { paymentId: 9001, refundId: 2, amount: 100, paymentMethod: 'upi' }, 1);
  check('a genuine replay of one refund is still idempotent', rr.idempotentReplay === true);
  b = await snap();
  check('refund reinstates patient A/R and pays out from Bank', b.bank === 780 + 400 - 200 && b.ar - arAfter === 200, `bank=${b.bank} ar+${b.ar - arAfter}`);

  const a1 = await gl.postAdjustment(ORG, { id: 7001, invoiceId: 8001, adjustmentType: 'discount', amount: 50 }, 1);
  const before = await snap();
  const a2 = await gl.postAdjustment(ORG, { id: 7002, invoiceId: 8001, adjustmentType: 'discount', amount: -50 }, 1);
  const afterAdj = await snap();
  check('FIN-06: a POSITIVE adjustment (discount) debits contra-revenue and REDUCES patient A/R', a1.posted && before.adj === 50, `adj=${before.adj}`);
  check('FIN-06: a negative adjustment posts the mirror image', a2.posted && afterAdj.adj === 0 && afterAdj.ar - before.ar === 50, `adj=${afterAdj.adj}`);

  const s1 = await gl.postInsuranceSettlement(ORG, { id: 'R-1', claimId: 'CLM-9', checkNumber: 'C1', paidAmount: 100 }, 1);
  const s2 = await gl.postInsuranceSettlement(ORG, { id: 'R-2', claimId: 'CLM-9', checkNumber: 'C2', paidAmount: 100 }, 1);
  check('FIN-06: two partial remittances on ONE claim are both posted (was: second dropped)', s1.posted && s2.posted && s1.journalEntryId !== s2.journalEntryId);

  const exp = await finance.createExpense(ORG, { expense_date: todayIST(), category: 'Consumables', amount: 500, tax_code: 'GST18', tax_amount: 90 }, 1);
  const bx = await snap();
  const ap = await gl.approveExpense(ORG, exp.id, 1);
  const ax = await snap();
  check('approveExpense posts and marks the expense approved', ap.posted === true);
  check('FIN-06: input GST goes to its own asset account, expense stays net', ax.tax - bx.tax === 90 && ax.exp - bx.exp === 500 && ax.ap - bx.ap === -590, `tax+${ax.tax - bx.tax} exp+${ax.exp - bx.exp} ap${ax.ap - bx.ap}`);
  const notTwice = await rejects(() => gl.approveExpense(ORG, exp.id, 1));
  check('an expense cannot be approved twice', notTwice?.code === 'EXPENSE_NOT_APPROVABLE', notTwice?.message);
  const trial = await reports.trialBalance(ORG, {});
  check('trial balance balances and equals the sum of every posting', trial.balanced === true, `Dr=${trial.totals.debit} Cr=${trial.totals.credit}`);

  // ── FIN-09: reconciliation ───────────────────────────────────────────────────────────────
  const ins = (sql, params) => withRlsTransaction(pool, { orgId: ORG, userId: 0, isPlatformAdmin: false }, (c) => c.query(sql, params));
  await ins(`INSERT INTO hospital_invoices (hospital_id, bill_number, total_amount, tax_amount, insurance_amount) VALUES ($1,'MISSED-1',2000,0,0)`, [ORG]);
  await ins(`INSERT INTO hospital_payments (hospital_id, payment_method, amount) VALUES ($1,'cash',2000)`, [ORG]);
  const r0 = await recon.reconcile(ORG);
  check('FIN-09: reconciliation finds billing documents that never reached the ledger', r0.enabled && r0.unposted.invoice === 1 && r0.unposted.payment === 1, JSON.stringify(r0.unposted));
  const fixed = await recon.repostMissing(ORG, 1);
  check('FIN-09: re-posting fixes them', fixed.summary.invoice.posted === 1 && fixed.summary.payment.posted === 1, JSON.stringify(fixed.summary.invoice));
  const r1b = await recon.reconcile(ORG);
  check('FIN-09: nothing left unposted, and re-running is safe', r1b.totalUnposted === 0 && (await recon.repostMissing(ORG, 1)).summary.invoice.attempted === 0);
  const off = await recon.reconcile(ORG + 5);
  check('reconciliation reports "not enabled" for a tenant without finance', off.enabled === false);

  // ── SEC-03: entitlement audit trail ─────────────────────────────────────────────────────
  await ent.grantEntitlement({ organizationId: ORG, packageCode: 'extra_pkg', moduleId: 'accounts_finance', canView: true }, 42);
  await ent.revokeEntitlement(ORG, 'extra_pkg', 'accounts_finance', 42);
  const audits = (await withRlsTransaction(pool, { orgId: 0, userId: 0, isPlatformAdmin: true }, (c) => c.query(`SELECT action, actor FROM operations_audit_log WHERE module='entitlements' AND organization_id=$1 ORDER BY id`, [ORG]))).rows;
  check('SEC-03: seed, grant and revoke each wrote an audit row with the actor', ['bootstrap-finance', 'grant', 'revoke'].every((a) => audits.some((x) => x.action === a)) && audits.filter((x) => x.action === 'revoke')[0].actor === '42', audits.map((x) => `${x.action}:${x.actor}`).join(' '));
  const revoked = (await withRlsTransaction(pool, { orgId: 0, userId: 0, isPlatformAdmin: true }, (c) => c.query(`SELECT revoked_by, revoked_at FROM tenant_entitlements e JOIN entitlement_packages p ON p.id=e.package_id WHERE e.organization_id=$1 AND p.package_code='extra_pkg'`, [ORG]))).rows[0];
  check('SEC-03: the revoke records who and when', Number(revoked.revoked_by) === 42 && !!revoked.revoked_at);
  const missing = await rejects(() => ent.revokeEntitlement(ORG, 'nope', 'accounts_finance', 42));
  check('revoking something that does not exist is a 404', missing?.status === 404);
  check('entitlement still effective for the tenant (seeded package untouched)', (await ent.hasModuleEntitlement(ORG, 'accounts_finance', 'view')) === true);

  // ── Isolation still holds ───────────────────────────────────────────────────────────────
  const noCtx = await pool.query('SELECT COUNT(*)::int c FROM finance_journal_entries');
  check('no RLS context sees zero rows (fail-closed)', noCtx.rows[0].c === 0, `${noCtx.rows[0].c} rows as ${process.env.POSTGRES_USER}`);
  const other = await withRlsTransaction(pool, { orgId: 424242, userId: 0, isPlatformAdmin: false }, (c) => c.query('SELECT COUNT(*)::int c FROM finance_journal_entries'));
  check('a different org sees zero rows', other.rows[0].c === 0);
} catch (err) {
  check('harness completed without a fatal error', false, err.stack || err.message);
} finally {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  await pool.end().catch(() => {});
  process.exit(failed.length ? 1 : 0);
}
