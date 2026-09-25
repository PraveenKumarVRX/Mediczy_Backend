/**
 * Finance reports (WP-1.3). Read-only projections over the tenant-scoped ledger.
 * Reversed entries are excluded from every report, so a reversal nets its original out.
 */
import pool from '../db/pgPool.js';
import { withRlsTransaction } from '../middleware/rls-context.middleware.js';

const money = (v) => Number(v || 0).toFixed(2);
const scoped = (organizationId, work) => withRlsTransaction(pool, { orgId: organizationId, userId: 0, isPlatformAdmin: false }, work);
const rangeArgs = (range = {}) => {
  const params = [range.from || null, range.to || null];
  return {
    from: '($1::date IS NULL OR e.entry_date >= $1::date)',
    to: '($2::date IS NULL OR e.entry_date <= $2::date)',
    params,
  };
};

const NET_BALANCE = `
  SELECT a.id, a.account_code, a.account_name, a.account_type,
         COALESCE(SUM(l.debit),0)::NUMERIC AS debit,
         COALESCE(SUM(l.credit),0)::NUMERIC AS credit,
         COALESCE(SUM(l.debit - l.credit),0)::NUMERIC AS net
  FROM finance_accounts a
  LEFT JOIN finance_journal_lines l ON l.account_id = a.id
  LEFT JOIN finance_journal_entries e ON e.id = l.journal_entry_id
  WHERE a.organization_id = $3 AND (e.id IS NULL OR (e.status <> 'reversed' AND %FROM% AND %TO%))
  GROUP BY a.id, a.account_code, a.account_name, a.account_type
  ORDER BY a.account_code`;

const debitBalance = (a) => Number(a.debit) - Number(a.credit);
const creditBalance = (a) => Number(a.credit) - Number(a.debit);

async function accountBalances(organizationId, range) {
  const r = rangeArgs(range);
  const sql = NET_BALANCE.replace('%FROM%', r.from).replace('%TO%', r.to);
  const rows = await scoped(organizationId, (client) => client.query(sql, [...r.params, organizationId]));
  return rows.rows.map((x) => ({ ...x, debit: Number(x.debit), credit: Number(x.credit), net: Number(x.net) }));
}

export async function trialBalance(organizationId, range = {}) {
  const all = await accountBalances(organizationId, range);
  const lines = all.filter((a) => a.debit !== 0 || a.credit !== 0);
  const totals = lines.reduce((acc, l) => ({ debit: acc.debit + l.debit, credit: acc.credit + l.credit }), { debit: 0, credit: 0 });
  return { range, lines, totals, balanced: money(totals.debit) === money(totals.credit) };
}

export async function profitAndLoss(organizationId, range = {}) {
  const all = await accountBalances(organizationId, range);
  const income = all.filter((a) => a.account_type === 'income');
  const expense = all.filter((a) => a.account_type === 'expense');
  const totalIncome = income.reduce((s, a) => s + creditBalance(a), 0);
  const totalExpense = expense.reduce((s, a) => s + debitBalance(a), 0);
  return { range, income, expense, totalIncome, totalExpense, netProfit: totalIncome - totalExpense };
}

export async function balanceSheet(organizationId, asOf) {
  const all = await accountBalances(organizationId, { to: asOf });
  const assets = all.filter((a) => a.account_type === 'asset');
  const liabilities = all.filter((a) => a.account_type === 'liability');
  const equity = all.filter((a) => a.account_type === 'equity');
  const income = all.filter((a) => a.account_type === 'income');
  const expense = all.filter((a) => a.account_type === 'expense');
  const totalAssets = assets.reduce((s, a) => s + debitBalance(a), 0);
  const totalLiabilities = liabilities.reduce((s, a) => s + creditBalance(a), 0);
  const retained = income.reduce((s, a) => s + creditBalance(a), 0) - expense.reduce((s, a) => s + debitBalance(a), 0);
  const totalEquity = equity.reduce((s, a) => s + creditBalance(a), 0) + retained;
  return {
    asOf, assets, liabilities, equity, retainedEarnings: retained,
    totalAssets, totalLiabilities, totalEquity,
    balanced: money(totalAssets) === money(totalLiabilities + totalEquity),
  };
}

export async function taxSummary(organizationId, range = {}) {
  const r = rangeArgs(range);
  // finance_expenses has no entry_date; the range must be applied to expense_date.
  const from = r.from.replace('e.entry_date', 'e.expense_date');
  const to = r.to.replace('e.entry_date', 'e.expense_date');
  const rows = await scoped(organizationId, (client) => client.query(
    `SELECT e.tax_code, COALESCE(SUM(e.amount),0)::NUMERIC AS taxable_value,
            COALESCE(SUM(e.tax_amount),0)::NUMERIC AS tax_amount, COUNT(*)::int AS entries
     FROM finance_expenses e
     WHERE e.organization_id = $3 AND e.status <> 'void' AND e.tax_code IS NOT NULL AND ${from} AND ${to}
     GROUP BY e.tax_code ORDER BY e.tax_code`,
    [...r.params, organizationId]
  ));
  return {
    range,
    byTaxCode: rows.rows,
    totalTax: rows.rows.reduce((s, x) => s + Number(x.tax_amount), 0),
    note: 'Expense-side tax only. Output GST on invoices and input GST credit reconciliation are not yet wired.',
  };
}

export async function ledgerCsv(organizationId, range = {}) {
  const { lines } = await trialBalance(organizationId, range);
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = 'account_code,account_name,account_type,debit,credit,net\n';
  const body = lines.map((l) => [l.account_code, l.account_name, l.account_type, l.debit, l.credit, l.net].map(esc).join(',')).join('\n');
  return { format: 'csv', filename: `trial-balance-${range.from || 'all'}-${range.to || 'all'}.csv`, content: header + body };
}

export default { trialBalance, profitAndLoss, balanceSheet, taxSummary, ledgerCsv };
