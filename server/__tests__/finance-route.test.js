/**
 * /api/hospital/finance — entitlement action per endpoint, tenant passing, error mapping (audit FIN-08), and the new
 * reconciliation / expense-approval endpoints.
 */
import { jest } from '@jest/globals';

const guardCalls = [];                                   // [moduleId, action] in registration order
jest.unstable_mockModule('../middleware/hospitalAuth.middleware.js', () => ({
  verifyHospitalToken: (req, _res, next) => { req.hospitalId = req.headers['x-test-org'] || '7'; req.userId = 42; next(); },
}));
jest.unstable_mockModule('../middleware/billingAuth.middleware.js', () => ({
  requireBillingRead: (_req, _res, next) => next(),
  requireBillingWrite: (req, res, next) => (req.headers['x-test-billing'] === 'deny' ? res.status(403).json({ success: false, code: 'BILLING_WRITE_REQUIRED' }) : next()),
}));
jest.unstable_mockModule('../services/entitlement.service.js', () => ({
  requireModuleEntitlement: (moduleId, action) => {
    guardCalls.push([moduleId, action]);
    return (req, res, next) => (req.headers['x-test-entitled'] === 'no' ? res.status(403).json({ success: false, code: 'MODULE_NOT_ENTITLED' }) : next());
  },
}));
const finance = Object.fromEntries(['listAccounts', 'listVendors', 'createVendor', 'listExpenses', 'createExpense', 'listBudgets', 'listTaxCodes',
  'listJournalEntries', 'postJournalEntry', 'listFiscalPeriods', 'createFiscalPeriod', 'closeFiscalPeriod', 'reverseJournalEntry'].map((k) => [k, jest.fn()]));
jest.unstable_mockModule('../services/finance-ledger.service.js', () => ({ default: finance }));
const reports = { trialBalance: jest.fn(), profitAndLoss: jest.fn(), balanceSheet: jest.fn(), taxSummary: jest.fn(), ledgerCsv: jest.fn() };
jest.unstable_mockModule('../services/finance-reports.service.js', () => ({ default: reports }));
const recon = { reconcile: jest.fn(), repostMissing: jest.fn() };
jest.unstable_mockModule('../services/finance-reconciliation.service.js', () => ({ default: recon }));
const gl = { approveExpense: jest.fn() };
jest.unstable_mockModule('../services/finance-gl-posting.service.js', () => ({ default: gl }));

const { default: request } = await import('supertest');
const { default: express } = await import('express');
const { default: router } = await import('../routes/hospital/finance.route.js');
const app = express();
app.use(express.json());
app.use('/api/hospital/finance', router);
const registered = [...guardCalls];                      // captured at import time

beforeEach(() => { for (const m of [...Object.values(finance), ...Object.values(reports), ...Object.values(recon), ...Object.values(gl)]) m.mockReset(); });

describe('entitlement action per endpoint — least privilege', () => {
  it('every route is behind the accounts_finance module', () => {
    expect(registered.length).toBeGreaterThan(15);   // 21 endpoints
    expect(new Set(registered.map((c) => c[0]))).toEqual(new Set(['accounts_finance']));
  });

  it('reads need "view", creates "create", reversals/closes/approvals/reposts "edit", CSV export "export"', () => {
    const count = (a) => registered.filter((c) => c[1] === a).length;
    expect(count('view')).toBe(12);     // accounts, vendors, expenses, budgets, tax-codes, journal, periods, 4 reports, reconciliation
    expect(count('create')).toBe(4);    // vendors, expenses, journal-entries, fiscal-periods
    expect(count('edit')).toBe(4);      // reverse, close period, approve expense, repost
    expect(count('export')).toBe(1);
    expect(registered).toHaveLength(21);
  });

  it('an un-entitled tenant is refused on a read and a write, and the service is never reached', async () => {
    const a = await request(app).get('/api/hospital/finance/accounts').set('x-test-entitled', 'no');
    const b = await request(app).post('/api/hospital/finance/vendors').set('x-test-entitled', 'no').send({});
    expect([a.status, b.status]).toEqual([403, 403]);
    expect(a.body.code).toBe('MODULE_NOT_ENTITLED');
    expect(finance.listAccounts).not.toHaveBeenCalled();
    expect(finance.createVendor).not.toHaveBeenCalled();
  });

  it('writes additionally need billing-write permission', async () => {
    const res = await request(app).post('/api/hospital/finance/journal-entries').set('x-test-billing', 'deny').send({});
    expect(res.status).toBe(403);
    expect(finance.postJournalEntry).not.toHaveBeenCalled();
  });
});

describe('tenant and actor are taken from the token, never the body', () => {
  it('passes the numeric hospital id and the authenticated user id to the ledger', async () => {
    finance.createVendor.mockResolvedValueOnce({ id: 1 });
    await request(app).post('/api/hospital/finance/vendors').send({ vendor_code: 'V1', vendor_name: 'X', organization_id: 999 });
    expect(finance.createVendor).toHaveBeenCalledWith(7, expect.objectContaining({ vendor_code: 'V1' }), 42);
  });

  it('ignores an organization id supplied in the query string', async () => {
    finance.listExpenses.mockResolvedValueOnce([]);
    await request(app).get('/api/hospital/finance/expenses?organization_id=999&from=2026-04-01');
    expect(finance.listExpenses).toHaveBeenCalledWith(7, expect.objectContaining({ from: '2026-04-01' }));
  });
});

describe('error mapping keeps status codes and hides database text (audit FIN-08)', () => {
  it('a closed period is a 409 with its code — not the old blanket 400', async () => {
    finance.postJournalEntry.mockRejectedValueOnce(Object.assign(new Error('Fiscal period 2026-04 is closed; entries cannot be posted to it'), { status: 409, code: 'FISCAL_PERIOD_CLOSED' }));
    const res = await request(app).post('/api/hospital/finance/journal-entries').send({});
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('FISCAL_PERIOD_CLOSED');
  });

  it('validation errors stay 400, unbalanced entries 422, missing entries 404', async () => {
    finance.postJournalEntry.mockRejectedValueOnce(Object.assign(new Error('bad'), { status: 400, code: 'INVALID_JOURNAL' }));
    finance.reverseJournalEntry.mockRejectedValueOnce(Object.assign(new Error('nope'), { status: 404, code: 'JOURNAL_ENTRY_NOT_FOUND' }));
    finance.createExpense.mockRejectedValueOnce(Object.assign(new Error('Journal entry must balance'), { status: 422, code: 'JOURNAL_UNBALANCED' }));
    expect((await request(app).post('/api/hospital/finance/journal-entries').send({})).status).toBe(400);
    expect((await request(app).post('/api/hospital/finance/journal-entries/9/reverse').send({ reason: 'x' })).status).toBe(404);
    expect((await request(app).post('/api/hospital/finance/expenses').send({})).status).toBe(422);
  });

  it('a raw database error becomes a mapped, generic reply', async () => {
    finance.createVendor.mockRejectedValueOnce(Object.assign(new Error('duplicate key value violates unique constraint "finance_vendors_organization_id_vendor_code_key"'), { code: '23505', severity: 'ERROR', routine: 'x' }));
    const res = await request(app).post('/api/hospital/finance/vendors').send({});
    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).not.toMatch(/finance_vendors|unique constraint/);
  });

  it('an unexpected database failure is a generic 500', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    finance.listAccounts.mockRejectedValueOnce(Object.assign(new Error('relation "finance_accounts" does not exist'), { code: '42P01', severity: 'ERROR', routine: 'x' }));
    const res = await request(app).get('/api/hospital/finance/accounts');
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/relation|finance_accounts/);
    console.error.mockRestore?.();
  });
});

describe('reversal, period, expense approval and reconciliation endpoints', () => {
  it('reverse passes the id, the reason and the actor', async () => {
    finance.reverseJournalEntry.mockResolvedValueOnce({ success: true });
    await request(app).post('/api/hospital/finance/journal-entries/12/reverse').send({ reason: 'Cashier correction' });
    expect(finance.reverseJournalEntry).toHaveBeenCalledWith(7, '12', 'Cashier correction', 42);
  });

  it('approving an expense calls the posting service with a NUMERIC id and the actor', async () => {
    gl.approveExpense.mockResolvedValueOnce({ expenseId: 5, posted: true });
    const res = await request(app).post('/api/hospital/finance/expenses/5/approve').send({});
    expect(res.status).toBe(200);
    expect(gl.approveExpense).toHaveBeenCalledWith(7, 5, 42);
  });

  it('an expense that cannot be approved surfaces its own 409, not a generic error', async () => {
    gl.approveExpense.mockRejectedValueOnce(Object.assign(new Error('Only recorded expenses can be approved'), { status: 409, code: 'EXPENSE_NOT_APPROVABLE' }));
    const res = await request(app).post('/api/hospital/finance/expenses/5/approve').send({});
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EXPENSE_NOT_APPROVABLE');
  });

  it('GET /reconciliation is scoped to the caller and forwards the limit', async () => {
    recon.reconcile.mockResolvedValueOnce({ enabled: true, totalUnposted: 0 });
    const res = await request(app).get('/api/hospital/finance/reconciliation?limit=50');
    expect(res.body).toMatchObject({ success: true, data: { enabled: true } });
    expect(recon.reconcile).toHaveBeenCalledWith(7, { limit: '50' });
  });

  it('POST /reconciliation/repost attributes the re-post to the authenticated user', async () => {
    recon.repostMissing.mockResolvedValueOnce({ enabled: true, summary: {} });
    await request(app).post('/api/hospital/finance/reconciliation/repost').send({ limit: 25 });
    expect(recon.repostMissing).toHaveBeenCalledWith(7, 42, { limit: 25 });
  });

  it('the trial-balance CSV export sets download headers', async () => {
    reports.ledgerCsv.mockResolvedValueOnce({ filename: 'trial-balance-all-all.csv', content: 'account_code\n1000' });
    const res = await request(app).get('/api/hospital/finance/reports/ledger.csv');
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toContain('trial-balance-all-all.csv');
    expect(res.text).toContain('account_code');
  });
});
