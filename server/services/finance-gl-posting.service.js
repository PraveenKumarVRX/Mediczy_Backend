/**
 * Source-document → general ledger posting adapters (WP-1.3).
 *
 * Each adapter is idempotent on the source document id, so a retried payment webhook or a replayed invoice cannot
 * double-post. Posting is best-effort by design: the finance ledger is a separate subsystem from clinical billing,
 * and a ledger outage must not roll back a paid invoice. Failures are logged and surfaced as
 * `ledger: { posted: false, error }` on the billing response — and `finance-reconciliation.service.js` finds and
 * re-posts anything that failed, so a failure is never permanent or invisible.
 *
 * Accounting conventions (audit FIN-06):
 *   invoice     Dr Patient A/R (total − insurance) · Dr Insurance A/R (insurance)  |  Cr Revenue (total − GST) · Cr GST Payable
 *   payment     Dr Cash/Bank                        |  Cr Patient A/R (or Insurance A/R when it settles an insurer claim)
 *   refund      Dr Patient A/R (reinstated)         |  Cr Cash/Bank (by the original payment method)
 *   adjustment  Dr Contractual Adj. (contra-revenue)|  Cr Patient A/R          — a NEGATIVE amount posts the mirror image
 *   settlement  Dr Bank                             |  Cr Insurance A/R        — one entry per remittance, not per claim
 *   expense     Dr Expense · Dr GST Input (if the account exists)  |  Cr Accounts Payable
 * Amounts are computed in integer paise so every entry balances by construction.
 */
import pool from '../db/pgPool.js';
import { withRlsTransaction } from '../middleware/rls-context.middleware.js';
import { postJournalEntry } from './finance-ledger.service.js';
import { istDate, todayIST } from '../utils/ist-date.js';

export const DEFAULT_ACCOUNTS = {
  cash: '1000',
  bank: '1010',
  patientReceivable: '1200',
  insuranceReceivable: '1210',
  inputTax: '1300',
  revenue: '4000',
  contractualAdjustment: '4010',
  refundsPayable: '2100',
  expense: '5000',
  accountsPayable: '2000',
  gstPayable: '2500',
};

const BANK_METHODS = new Set(['card', 'upi', 'netbanking', 'bank', 'cheque', 'neft', 'rtgs', 'imps']);
const toPaise = (v) => Math.round(Number(v || 0) * 100);
const fromPaise = (p) => p / 100;
const bad = (message) => Object.assign(new Error(message), { code: 'INVALID_SOURCE_DOCUMENT', status: 422 });

/** A document's business date in IST: its own timestamp when it has one, otherwise now. */
const docDate = (doc, ...fields) => {
  for (const f of fields) {
    const v = doc?.[f];
    if (!v) continue;
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) && v.length === 10) return v;
    const d = v instanceof Date ? v : new Date(v);
    if (!Number.isNaN(d.getTime())) return istDate(d);
  }
  return todayIST();
};

const cashOrBank = (pick, method) => (BANK_METHODS.has(String(method || 'cash').toLowerCase()) ? pick('bank') : pick('cash'));

/**
 * Pure builders: source document → { source_type, source_id, description, entry_date, lines(pick) }.
 * Exported so the accounting can be unit-tested without a database.
 */
export const specs = {
  invoice(invoice) {
    const total = toPaise(invoice.total_amount);
    const tax = toPaise(invoice.tax_amount);
    const insurance = toPaise(invoice.insurance_amount);
    if (total <= 0) throw bad('Invoice total must be positive to post');
    if (tax < 0 || tax > total) throw bad('Invoice tax must be between 0 and the total');
    if (insurance < 0 || insurance > total) throw bad('Insurance share must be between 0 and the total');
    return {
      source_type: 'invoice', source_id: String(invoice.id),
      description: `Invoice ${invoice.bill_number} issued`,
      entry_date: docDate(invoice, 'created_at'),
      lines: (a) => [
        { accountId: a('patientReceivable'), debit: fromPaise(total - insurance), narration: 'Patient receivable' },
        { accountId: a('insuranceReceivable'), debit: fromPaise(insurance), narration: 'Insurance receivable' },
        { accountId: a('revenue'), credit: fromPaise(total - tax), narration: 'Patient revenue' },
        { accountId: a('gstPayable'), credit: fromPaise(tax), narration: 'GST collected' },
      ].filter((l) => (l.debit || 0) > 0 || (l.credit || 0) > 0),
    };
  },

  payment(payment) {
    const amount = toPaise(payment.amount);
    if (amount <= 0) throw bad('Payment amount must be positive to post');
    const method = String(payment.payment_method || 'cash').toLowerCase();
    // A payment that settles an insurer's claim extinguishes the insurance receivable, not the patient's.
    const settlesInsurer = Boolean(payment.insurance_claim_id);
    return {
      source_type: 'payment', source_id: String(payment.id),
      description: `Payment ${payment.id} received (${method})`,
      entry_date: docDate(payment, 'created_at'),
      lines: (a) => [
        { accountId: cashOrBank(a, method), debit: fromPaise(amount), narration: `Received via ${method}` },
        { accountId: a(settlesInsurer ? 'insuranceReceivable' : 'patientReceivable'), credit: fromPaise(amount), narration: settlesInsurer ? 'Insurance receivable' : 'Patient receivable' },
      ],
    };
  },

  insuranceSettlement(remittance) {
    const paid = toPaise(remittance.paidAmount);
    if (paid <= 0) throw bad('Settlement amount must be positive to post');
    // One entry per REMITTANCE. Keying on the claim alone dropped every partial payment after the first.
    const key = remittance.id ?? `${remittance.claimId}:${remittance.checkNumber || ''}:${paid}`;
    return {
      source_type: 'insurance_settlement', source_id: String(key),
      description: `Insurance settlement ${remittance.checkNumber || key}`,
      entry_date: docDate(remittance, 'receivedAt', 'created_at'),
      lines: (a) => [
        { accountId: a('bank'), debit: fromPaise(paid), narration: 'Insurance remittance' },
        { accountId: a('insuranceReceivable'), credit: fromPaise(paid), narration: 'Insurance receivable' },
      ],
    };
  },

  refund(refund) {
    const amount = toPaise(refund.amount ?? refund.refundAmount);
    if (amount <= 0) throw bad('Refund amount must be positive to post');
    // Keyed on the refund row, never payment+amount: two equal partial refunds on one payment are two events.
    const key = refund.refundId ?? `${refund.paymentId}:${amount}:${refund.refundedAt || ''}`;
    const method = refund.paymentMethod || refund.payment_method || 'cash';
    return {
      source_type: 'refund', source_id: String(key),
      description: `Refund on payment ${refund.paymentId}`,
      entry_date: docDate(refund, 'refundedAt'),
      lines: (a) => [
        { accountId: a('patientReceivable'), debit: fromPaise(amount), narration: 'Receivable reinstated by refund' },
        { accountId: cashOrBank(a, method), credit: fromPaise(amount), narration: 'Refunded to patient' },
      ],
    };
  },

  adjustment(adjustment) {
    const raw = toPaise(adjustment.amount);
    if (raw === 0) throw bad('Adjustment amount must be non-zero to post');
    const amount = Math.abs(raw);
    // A POSITIVE amount reduces the invoice (discount / write-off / contractual allowance); negative increases it.
    return {
      source_type: 'adjustment', source_id: String(adjustment.id),
      description: `${adjustment.adjustmentType || 'contractual'} adjustment on invoice ${adjustment.invoiceId}`,
      entry_date: docDate(adjustment, 'created_at'),
      lines: (a) => (raw > 0
        ? [{ accountId: a('contractualAdjustment'), debit: fromPaise(amount), narration: 'Adjustment / write-off' },
           { accountId: a('patientReceivable'), credit: fromPaise(amount), narration: 'Receivable reduced' }]
        : [{ accountId: a('patientReceivable'), debit: fromPaise(amount), narration: 'Receivable increased' },
           { accountId: a('contractualAdjustment'), credit: fromPaise(amount), narration: 'Adjustment reversed' }]),
    };
  },

  expense(expense) {
    const amount = toPaise(expense.amount);
    const tax = toPaise(expense.tax_amount);
    if (amount <= 0 || tax < 0) throw bad('Expense amount must be positive to post');
    return {
      source_type: 'expense', source_id: String(expense.id),
      description: `Expense ${expense.category}${expense.description ? `: ${expense.description}` : ''}`,
      entry_date: docDate(expense, 'expense_date'),
      lines: (a, has) => [
        { accountId: a('expense'), debit: fromPaise(amount), narration: 'Expense' },
        // Input GST goes to its own asset account when the chart has one; otherwise it is expensed (exempt supplies).
        ...(tax > 0 ? [{ accountId: has('inputTax') ? a('inputTax') : a('expense'), debit: fromPaise(tax), narration: 'Input tax' }] : []),
        { accountId: a('accountsPayable'), credit: fromPaise(amount + tax), narration: 'Vendor payable' },
      ],
    };
  },
};

async function accountMap(organizationId) {
  const rows = await withRlsTransaction(pool, { orgId: organizationId, userId: 0, isPlatformAdmin: false },
    (client) => client.query('SELECT account_code, id FROM finance_accounts WHERE organization_id = $1', [organizationId]));
  const byCode = Object.fromEntries(rows.rows.map((r) => [r.account_code, r.id]));
  const missing = [];
  const pick = (role) => {
    const id = byCode[DEFAULT_ACCOUNTS[role]];
    if (!id) missing.push(DEFAULT_ACCOUNTS[role]);
    return id;
  };
  const has = (role) => Boolean(byCode[DEFAULT_ACCOUNTS[role]]);
  return { byCode, pick, has, missing };
}

async function post(organizationId, spec, actorId) {
  const { pick, has, missing } = await accountMap(organizationId);
  const lines = spec.lines(pick, has);
  if (missing.length) {
    const err = new Error(`Chart of accounts is missing required codes: ${[...new Set(missing)].join(', ')}`);
    err.code = 'CHART_OF_ACCOUNTS_INCOMPLETE';
    throw err;
  }
  const { lines: _lines, ...rest } = spec;
  return postJournalEntry(organizationId, { ...rest, lines }, actorId);
}

const attempt = async (organizationId, fn) => {
  try {
    const entry = await fn();
    return { posted: true, journalEntryId: entry.id, entryNumber: entry.entry_number, idempotentReplay: !!entry.idempotentReplay };
  } catch (err) {
    console.error(`[finance-gl] posting failed for org ${organizationId}:`, err.message);
    return { posted: false, error: err.message, code: err.code || 'GL_POSTING_FAILED' };
  }
};

export const postInvoice = (organizationId, invoice, actorId) => attempt(organizationId, () => post(organizationId, specs.invoice(invoice), actorId));
export const postPayment = (organizationId, payment, actorId) => attempt(organizationId, () => post(organizationId, specs.payment(payment), actorId));
export const postInsuranceSettlement = (organizationId, remittance, actorId) => attempt(organizationId, () => post(organizationId, specs.insuranceSettlement(remittance), actorId));
export const postRefund = (organizationId, refund, actorId) => attempt(organizationId, () => post(organizationId, specs.refund(refund), actorId));
export const postAdjustment = (organizationId, adjustment, actorId) => attempt(organizationId, () => post(organizationId, specs.adjustment(adjustment), actorId));

// Expense approval posts the spend and links the journal back to the expense row.
export const postExpense = (organizationId, expense, actorId) => attempt(organizationId, async () => {
  const entry = await post(organizationId, specs.expense(expense), actorId);
  await withRlsTransaction(pool, { orgId: organizationId, userId: actorId || 0, isPlatformAdmin: false },
    (client) => client.query(
      `UPDATE finance_expenses SET journal_entry_id = $3, status = 'approved' WHERE id = $1 AND organization_id = $2`,
      [expense.id, organizationId, entry.id]
    ));
  return entry;
});

/** Approves a recorded expense: posts it to the ledger and marks it approved. A posting failure is surfaced, not hidden. */
export async function approveExpense(organizationId, expenseId, actorId) {
  const expense = await withRlsTransaction(pool, { orgId: organizationId, userId: actorId || 0, isPlatformAdmin: false },
    async (client) => (await client.query('SELECT * FROM finance_expenses WHERE id = $1 AND organization_id = $2', [expenseId, organizationId])).rows[0]);
  if (!expense) throw Object.assign(new Error('Expense not found'), { status: 404, code: 'EXPENSE_NOT_FOUND' });
  if (expense.status !== 'recorded') throw Object.assign(new Error(`Only recorded expenses can be approved (this one is ${expense.status})`), { status: 409, code: 'EXPENSE_NOT_APPROVABLE' });
  const result = await postExpense(organizationId, expense, actorId);
  if (!result.posted) throw Object.assign(new Error(result.error), { status: 409, code: result.code });
  return { expenseId: expense.id, ...result };
}

export default { postInvoice, postPayment, postInsuranceSettlement, postRefund, postAdjustment, postExpense, approveExpense, specs };
