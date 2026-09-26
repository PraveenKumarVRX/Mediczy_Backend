import express from 'express';
import { verifyHospitalToken } from '../../middleware/hospitalAuth.middleware.js';
import { requireBillingRead, requireBillingWrite } from '../../middleware/billingAuth.middleware.js';
import { requireModuleEntitlement } from '../../services/entitlement.service.js';
import finance from '../../services/finance-ledger.service.js';
import financeReports from '../../services/finance-reports.service.js';
import reconciliation from '../../services/finance-reconciliation.service.js';
import glPosting from '../../services/finance-gl-posting.service.js';
import { sendRouteError } from '../../utils/route-errors.js';

const router = express.Router();
router.use(verifyHospitalToken);

const org = (req) => Number(req.hospitalId);
// Audit FIN-08: every error used to become HTTP 400 with the raw message, losing 409/404/422 and leaking database text.
const send = (res, fn) => fn().catch((err) => sendRouteError(res, err));
const range = (req) => ({ from: req.query.from, to: req.query.to });

router.get('/accounts', requireModuleEntitlement('accounts_finance', 'view'), requireBillingRead, (req, res) => send(res, async () => res.json({ success: true, data: await finance.listAccounts(org(req)) })));
router.get('/vendors', requireModuleEntitlement('accounts_finance', 'view'), requireBillingRead, (req, res) => send(res, async () => res.json({ success: true, data: await finance.listVendors(org(req)) })));
router.post('/vendors', requireModuleEntitlement('accounts_finance', 'create'), requireBillingWrite, (req, res) => send(res, async () => res.status(201).json({ success: true, data: await finance.createVendor(org(req), req.body, req.userId) })));
router.get('/expenses', requireModuleEntitlement('accounts_finance', 'view'), requireBillingRead, (req, res) => send(res, async () => res.json({ success: true, data: await finance.listExpenses(org(req), req.query) })));
router.post('/expenses', requireModuleEntitlement('accounts_finance', 'create'), requireBillingWrite, (req, res) => send(res, async () => res.status(201).json({ success: true, data: await finance.createExpense(org(req), req.body, req.userId) })));
router.post('/expenses/:id/approve', requireModuleEntitlement('accounts_finance', 'edit'), requireBillingWrite, (req, res) => send(res, async () => res.json({ success: true, data: await glPosting.approveExpense(org(req), Number(req.params.id), req.userId) })));
router.get('/budgets', requireModuleEntitlement('accounts_finance', 'view'), requireBillingRead, (req, res) => send(res, async () => res.json({ success: true, data: await finance.listBudgets(org(req)) })));
router.post('/budgets', requireModuleEntitlement('accounts_finance', 'create'), requireBillingWrite, (req, res) => send(res, async () => res.status(201).json({ success: true, data: await finance.upsertBudget(org(req), req.body, req.userId) })));
router.get('/tax-codes', requireModuleEntitlement('accounts_finance', 'view'), requireBillingRead, (req, res) => send(res, async () => res.json({ success: true, data: await finance.listTaxCodes(org(req)) })));
router.get('/journal-entries', requireModuleEntitlement('accounts_finance', 'view'), requireBillingRead, (req, res) => send(res, async () => res.json({ success: true, data: await finance.listJournalEntries(org(req), req.query) })));
router.post('/journal-entries', requireModuleEntitlement('accounts_finance', 'create'), requireBillingWrite, (req, res) => send(res, async () => res.status(201).json({ success: true, data: await finance.postJournalEntry(org(req), req.body, req.userId) })));
router.post('/journal-entries/:id/reverse', requireModuleEntitlement('accounts_finance', 'edit'), requireBillingWrite, (req, res) => send(res, async () => res.json({ success: true, data: await finance.reverseJournalEntry(org(req), req.params.id, req.body?.reason, req.userId) })));

router.get('/fiscal-periods', requireModuleEntitlement('accounts_finance', 'view'), requireBillingRead, (req, res) => send(res, async () => res.json({ success: true, data: await finance.listFiscalPeriods(org(req)) })));
router.post('/fiscal-periods', requireModuleEntitlement('accounts_finance', 'create'), requireBillingWrite, (req, res) => send(res, async () => res.status(201).json({ success: true, data: await finance.createFiscalPeriod(org(req), req.body) })));
router.post('/fiscal-periods/:periodCode/close', requireModuleEntitlement('accounts_finance', 'edit'), requireBillingWrite, (req, res) => send(res, async () => res.json({ success: true, data: await finance.closeFiscalPeriod(org(req), req.params.periodCode, req.userId) })));

router.get('/reports/trial-balance', requireModuleEntitlement('accounts_finance', 'view'), requireBillingRead, (req, res) => send(res, async () => res.json({ success: true, data: await financeReports.trialBalance(org(req), range(req)) })));
router.get('/reports/profit-and-loss', requireModuleEntitlement('accounts_finance', 'view'), requireBillingRead, (req, res) => send(res, async () => res.json({ success: true, data: await financeReports.profitAndLoss(org(req), range(req)) })));
router.get('/reports/balance-sheet', requireModuleEntitlement('accounts_finance', 'view'), requireBillingRead, (req, res) => send(res, async () => res.json({ success: true, data: await financeReports.balanceSheet(org(req), req.query.asOf) })));
router.get('/reports/tax-summary', requireModuleEntitlement('accounts_finance', 'view'), requireBillingRead, (req, res) => send(res, async () => res.json({ success: true, data: await financeReports.taxSummary(org(req), range(req)) })));
router.get('/reports/ledger.csv', requireModuleEntitlement('accounts_finance', 'export'), requireBillingRead, (req, res) => send(res, async () => {
  const csv = await financeReports.ledgerCsv(org(req), range(req));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${csv.filename}"`);
  return res.send(csv.content);
}));

// Ledger reconciliation (audit FIN-09): billing documents with no journal entry, and a safe idempotent re-post.
router.get('/reconciliation', requireModuleEntitlement('accounts_finance', 'view'), requireBillingRead,
  (req, res) => send(res, async () => res.json({ success: true, data: await reconciliation.reconcile(org(req), { limit: req.query.limit }) })));
router.post('/reconciliation/repost', requireModuleEntitlement('accounts_finance', 'edit'), requireBillingWrite,
  (req, res) => send(res, async () => res.json({ success: true, data: await reconciliation.repostMissing(org(req), req.userId || null, { limit: req.body?.limit }) })));

export default router;
