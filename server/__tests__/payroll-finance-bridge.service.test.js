import { jest } from '@jest/globals';

const db = { query: jest.fn() };
const postJournalEntry = jest.fn();
jest.unstable_mockModule('../db/postgres.js', () => ({ connectPostgres: jest.fn().mockResolvedValue(db) }));
jest.unstable_mockModule('../services/finance-ledger.service.js', () => ({ postJournalEntry }));

const service = await import('../services/payroll-finance-bridge.service.js');
const schemaRows = ['payroll_runs', 'payroll_run_lines', 'finance_accounts', 'finance_fiscal_periods', 'finance_journal_entries', 'finance_journal_lines'].map((table_name) => ({ table_name }));
const run = { id: 19, tenant_id: 7, month: '2026-09', status: 'finalized', lines: [{ id: 1, employeeCode: 'E1', employeeName: 'A', gross: '1000.00', pf: '120.00', esi: '7.50', tds: '50.00', otherDeductions: '2.50', net: '820.00' }] };
const mapping = { salaryExpenseAccountId: 10, salaryPayableAccountId: 11, pfPayableAccountId: 12, esiPayableAccountId: 13, tdsPayableAccountId: 14, otherDeductionsAccountId: 15 };
const queueRun = (overrides = {}) => { db.query.mockResolvedValueOnce({ rows: schemaRows }).mockResolvedValueOnce({ rows: [{ ...run, ...overrides }] }); };

describe('payroll → finance bridge', () => {
  beforeEach(() => jest.clearAllMocks());
  test('posts a finalized run as one balanced, source-idempotent journal', async () => {
    queueRun(); postJournalEntry.mockResolvedValueOnce({ id: 55, entry_number: 'JE-55' }); db.query.mockResolvedValueOnce({ rows: [] });
    const result = await service.postFinalizedPayroll(7, 19, mapping, 42);
    expect(postJournalEntry).toHaveBeenCalledWith(7, expect.objectContaining({ source_type: 'payroll_run', source_id: '19', entry_date: '2026-09-01' }), 42);
    const posted = postJournalEntry.mock.calls[0][1];
    expect(posted.lines).toEqual(expect.arrayContaining([expect.objectContaining({ accountId: 10, debit: 1000 }), expect.objectContaining({ accountId: 11, credit: 820 }), expect.objectContaining({ accountId: 12, credit: 120 }), expect.objectContaining({ accountId: 13, credit: 7.5 }), expect.objectContaining({ accountId: 14, credit: 50 }), expect.objectContaining({ accountId: 15, credit: 2.5 })]));
    expect(result).toMatchObject({ status: 'exported', journalEntry: { id: 55 }, totals: { gross: 1000, net: 820 } });
    expect(db.query.mock.calls[2][0]).toContain("status = 'exported'");
  });
  test('refuses draft runs and does not call the ledger', async () => { queueRun({ status: 'draft' }); await expect(service.postFinalizedPayroll(7, 19, mapping, 42)).rejects.toMatchObject({ code: 'PAYROLL_NOT_FINALIZED', status: 409 }); expect(postJournalEntry).not.toHaveBeenCalled(); });
  test('requires explicit accounts for every non-zero liability', async () => { queueRun(); await expect(service.postFinalizedPayroll(7, 19, { salaryExpenseAccountId: 10, salaryPayableAccountId: 11 }, 42)).rejects.toMatchObject({ code: 'PAYROLL_FINANCE_MAPPING_REQUIRED', status: 400 }); });
  test('fails closed when the payroll-finance schema is not migrated', async () => { db.query.mockResolvedValueOnce({ rows: [{ table_name: 'payroll_runs' }] }); await expect(service.getPayrollFinanceStatus(7, 19)).rejects.toMatchObject({ code: 'SCHEMA_NOT_MIGRATED', status: 503 }); });
});
