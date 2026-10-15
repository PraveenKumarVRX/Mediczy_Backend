import { connectPostgres } from '../db/postgres.js';
import { postJournalEntry } from './finance-ledger.service.js';

const TABLES = ['payroll_runs', 'payroll_run_lines', 'finance_accounts', 'finance_fiscal_periods', 'finance_journal_entries', 'finance_journal_lines'];
const paise = (value) => Math.round(Number(value || 0) * 100);
const money = (value) => Number(value || 0) / 100;
const fail = (message, code, status = 409) => Object.assign(new Error(message), { code, status });

function accountId(mapping, key, amount, required = false) {
  if (amount <= 0 && !required) return null;
  const value = Number(mapping?.[key]);
  if (!Number.isInteger(value) || value <= 0) throw fail(`${key} is required for a non-zero payroll component`, 'PAYROLL_FINANCE_MAPPING_REQUIRED', 400);
  return value;
}

async function readiness(db) {
  const { rows } = await db.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name = ANY($1::text[])
  `, [TABLES]);
  const present = new Set(rows.map((row) => row.table_name));
  const missing = TABLES.filter((table) => !present.has(table));
  if (missing.length) throw fail(`Payroll/finance schema is not migrated: ${missing.join(', ')}`, 'SCHEMA_NOT_MIGRATED', 503);
}

async function loadRun(db, organizationId, runId) {
  const { rows } = await db.query(`
    SELECT r.id, r.tenant_id, r.month, r.status, r.gross_total, r.pf_total, r.esi_total, r.tds_total, r.net_total,
           r.finance_journal_entry_id, r.finance_posted_at, r.finance_posted_by,
           COALESCE(json_agg(json_build_object(
             'id', l.id, 'employeeCode', l.employee_code, 'employeeName', l.employee_name,
             'gross', l.gross, 'pf', l.pf, 'esi', l.esi, 'tds', l.tds,
             'otherDeductions', l.other_deductions, 'net', l.net
           ) ORDER BY l.id) FILTER (WHERE l.id IS NOT NULL), '[]'::json) AS lines
    FROM payroll_runs r
    LEFT JOIN payroll_run_lines l ON l.run_id = r.id
    WHERE r.id = $1 AND r.tenant_id = $2
    GROUP BY r.id
  `, [runId, organizationId]);
  if (!rows[0]) throw fail('Payroll run not found', 'PAYROLL_RUN_NOT_FOUND', 404);
  return rows[0];
}

function buildPosting(run, mapping) {
  if (!['finalized', 'exported'].includes(run.status)) throw fail('Only a finalized payroll run can be posted to finance', 'PAYROLL_NOT_FINALIZED', 409);
  const lines = Array.isArray(run.lines) ? run.lines : [];
  if (!lines.length) throw fail('Payroll run has no employee lines', 'PAYROLL_HAS_NO_LINES', 422);
  const totals = lines.reduce((sum, line) => {
    const gross = paise(line.gross); const pf = paise(line.pf); const esi = paise(line.esi);
    const tds = paise(line.tds); const other = paise(line.otherDeductions); const net = paise(line.net);
    if ([gross, pf, esi, tds, other, net].some((v) => v < 0) || gross !== net + pf + esi + tds + other) {
      throw fail(`Payroll line ${line.employeeCode || line.id} does not reconcile`, 'PAYROLL_LINE_UNBALANCED', 422);
    }
    sum.gross += gross; sum.pf += pf; sum.esi += esi; sum.tds += tds; sum.other += other; sum.net += net;
    return sum;
  }, { gross: 0, pf: 0, esi: 0, tds: 0, other: 0, net: 0 });
  if (totals.gross !== totals.net + totals.pf + totals.esi + totals.tds + totals.other) throw fail('Payroll totals do not reconcile', 'PAYROLL_TOTALS_UNBALANCED', 422);

  const ids = {
    salaryExpenseAccountId: accountId(mapping, 'salaryExpenseAccountId', totals.gross, true),
    salaryPayableAccountId: accountId(mapping, 'salaryPayableAccountId', totals.net, true),
    pfPayableAccountId: accountId(mapping, 'pfPayableAccountId', totals.pf),
    esiPayableAccountId: accountId(mapping, 'esiPayableAccountId', totals.esi),
    tdsPayableAccountId: accountId(mapping, 'tdsPayableAccountId', totals.tds),
    otherDeductionsAccountId: accountId(mapping, 'otherDeductionsAccountId', totals.other),
  };
  const entries = [
    { accountId: ids.salaryExpenseAccountId, debit: money(totals.gross), narration: 'Payroll salary expense' },
    { accountId: ids.salaryPayableAccountId, credit: money(totals.net), narration: 'Net salary payable' },
    { accountId: ids.pfPayableAccountId, credit: money(totals.pf), narration: 'Provident fund payable' },
    { accountId: ids.esiPayableAccountId, credit: money(totals.esi), narration: 'ESI payable' },
    { accountId: ids.tdsPayableAccountId, credit: money(totals.tds), narration: 'TDS payable' },
    { accountId: ids.otherDeductionsAccountId, credit: money(totals.other), narration: 'Other statutory/employee deductions payable' },
  ].filter((line) => Number(line.debit || line.credit) > 0);
  return {
    source_type: 'payroll_run', source_id: String(run.id), entry_date: `${run.month}-01`,
    description: `Payroll ${run.month} posted to finance`, lines: entries,
    totals: Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, money(value)])),
  };
}

export async function postFinalizedPayroll(organizationId, runId, mapping, actorId) {
  const db = await connectPostgres();
  await readiness(db);
  const run = await loadRun(db, organizationId, runId);
  const posting = buildPosting(run, mapping);
  const entry = await postJournalEntry(organizationId, posting, actorId);
  await db.query(`
    UPDATE payroll_runs
    SET status = 'exported', finance_journal_entry_id = $3, finance_posted_at = COALESCE(finance_posted_at, NOW()), finance_posted_by = COALESCE(finance_posted_by, $4), updated_at = NOW()
    WHERE id = $1 AND tenant_id = $2
  `, [runId, organizationId, entry.id, actorId || null]);
  return { runId: Number(runId), status: 'exported', journalEntry: entry, totals: posting.totals, idempotentReplay: !!entry.idempotentReplay };
}

export async function getPayrollFinanceStatus(organizationId, runId) {
  const db = await connectPostgres();
  await readiness(db);
  const run = await loadRun(db, organizationId, runId);
  if (!run.finance_journal_entry_id) return { runId: Number(runId), status: run.status, posted: false, journalEntry: null };
  const { rows } = await db.query(`
    SELECT e.*, COALESCE(json_agg(json_build_object('accountId', l.account_id, 'debit', l.debit, 'credit', l.credit, 'narration', l.narration) ORDER BY l.id) FILTER (WHERE l.id IS NOT NULL), '[]'::json) AS lines
    FROM finance_journal_entries e LEFT JOIN finance_journal_lines l ON l.journal_entry_id = e.id
    WHERE e.organization_id = $1 AND e.id = $2 GROUP BY e.id
  `, [organizationId, run.finance_journal_entry_id]);
  return { runId: Number(runId), status: run.status, posted: Boolean(rows[0]), journalEntry: rows[0] || null, postedAt: run.finance_posted_at, postedBy: run.finance_posted_by };
}

export default { postFinalizedPayroll, getPayrollFinanceStatus };
