/**
 * Source-document → general ledger posting adapters (WP-1.3).
 *
 * Each adapter is idempotent on the source document id, so a retried payment webhook or a
 * replayed invoice cannot double-post. Posting is best-effort by design: the finance ledger is a
 * separate subsystem from clinical billing, and a ledger outage must not roll back a paid invoice.
 * Failures are logged and surfaced as `ledger: { posted: false, error }` on the billing response.
 */
import pool from '../db/pgPool.js';
import { withRlsTransaction } from '../middleware/rls-context.middleware.js';
import { postJournalEntry } from './finance-ledger.service.js';

export const DEFAULT_ACCOUNTS = {
  cash: '1000',
  bank: '1010',
  patientReceivable: '1200',
  insuranceReceivable: '1210',
  revenue: '4000',
  contractualAdjustment: '4010',
  refundsPayable: '2100',
  expense: '5000',
  accountsPayable: '2000',
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
  return { byCode, pick, missing };
}

async function post(organizationId, spec) {
  const { pick, missing } = await accountMap(organizationId);
  if (missing.length) {
    const err = new Error(`Chart of accounts is missing required codes: ${missing.join(', ')}`);
    err.code = 'CHART_OF_ACCOUNTS_INCOMPLETE';
    throw err;
  }
  return postJournalEntry(organizationId, { ...spec, lines: spec.lines(pick) }, spec.actorId);
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

const today = () => new Date().toISOString().slice(0, 10);

// Invoice issued: recognise revenue, establish the patient/insurance receivable.
export const postInvoice = (organizationId, invoice, actorId) => attempt(organizationId, () =>
  post(organizationId, {
    entry_date: today(), actorId,
    source_type: 'invoice', source_id: String(invoice.id),
    description: `Invoice ${invoice.bill_number} issued`,
    lines: (a) => {
      const total = Number(invoice.total_amount);
      const insurance = Number(invoice.insurance_amount || 0);
      const out = [{ accountId: a('patientReceivable'), debit: Number(invoice.patient_liability), narration: 'Patient receivable' }];
      if (insurance > 0) out.push({ accountId: a('insuranceReceivable'), debit: insurance, narration: 'Insurance receivable' });
      out.push({ accountId: a('revenue'), credit: total, narration: 'Patient revenue' });
      return out.filter((l) => l.debit > 0 || l.credit > 0);
    },
  }));

// Payment received: move cash/bank in, extinguish the receivable it settles.
export const postPayment = (organizationId, payment, actorId) => attempt(organizationId, () =>
  post(organizationId, {
    entry_date: today(), actorId,
    source_type: 'payment', source_id: String(payment.id),
    description: `Payment ${payment.id} received (${payment.payment_method})`,
    lines: (a) => {
      const method = String(payment.payment_method || 'cash').toLowerCase();
      const cashAccount = ['card', 'upi', 'netbanking', 'bank'].includes(method) ? a('bank') : a('cash');
      return [
        { accountId: cashAccount, debit: Number(payment.amount), narration: `Received via ${method}` },
        { accountId: a('patientReceivable'), credit: Number(payment.amount), narration: 'Patient receivable' },
      ];
    },
  }));

// Insurance remittance settles the insurer receivable rather than patient cash.
export const postInsuranceSettlement = (organizationId, remittance, actorId) => attempt(organizationId, () =>
  post(organizationId, {
    entry_date: today(), actorId,
    source_type: 'insurance_settlement', source_id: String(remittance.claimId || remittance.id),
    description: `Insurance settlement ${remittance.checkNumber || remittance.id}`,
    lines: (a) => [
      { accountId: a('bank'), debit: Number(remittance.paidAmount), narration: 'Insurance remittance' },
      { accountId: a('insuranceReceivable'), credit: Number(remittance.paidAmount), narration: 'Insurance receivable' },
    ],
  }));

// Refund: recognise a refund payable and reduce cash.
export const postRefund = (organizationId, refund, actorId) => attempt(organizationId, () =>
  post(organizationId, {
    entry_date: today(), actorId,
    source_type: 'refund', source_id: String(refund.refundId || `${refund.paymentId}-${refund.amount}`),
    description: `Refund on payment ${refund.paymentId}`,
    lines: (a) => [
      { accountId: a('refundsPayable'), debit: Number(refund.amount), narration: 'Refund payable' },
      { accountId: a('cash'), credit: Number(refund.amount), narration: 'Cash refunded' },
    ],
  }));

// Contractual/write-off adjustment moves revenue between revenue and adjustment.
export const postAdjustment = (organizationId, adjustment, actorId) => attempt(organizationId, () => {
  const amount = Math.abs(Number(adjustment.amount));
  const sign = Number(adjustment.amount) < 0 ? -1 : 1;
  return post(organizationId, {
    entry_date: today(), actorId,
    source_type: 'adjustment', source_id: String(adjustment.id),
    description: `${adjustment.adjustmentType || 'contractual'} adjustment on invoice ${adjustment.invoiceId}`,
    lines: (a) => (sign < 0
      ? [{ accountId: a('revenue'), debit: amount, narration: 'Revenue reversal' },
         { accountId: a('contractualAdjustment'), credit: amount, narration: 'Contractual adjustment' }]
      : [{ accountId: a('contractualAdjustment'), debit: amount, narration: 'Contractual adjustment' },
         { accountId: a('revenue'), credit: amount, narration: 'Revenue restored' }]),
  });
});

// Expense approval posts the spend and links the journal back to the expense row.
export const postExpense = (organizationId, expense, actorId) => attempt(organizationId, async () => {
  const entry = await post(organizationId, {
    entry_date: expense.expense_date, actorId,
    source_type: 'expense', source_id: String(expense.id),
    description: `Expense ${expense.category}${expense.description ? `: ${expense.description}` : ''}`,
    lines: (a) => [
      { accountId: a('expense'), debit: Number(expense.amount), narration: 'Expense' },
      ...(Number(expense.tax_amount) > 0 ? [{ accountId: a('expense'), debit: Number(expense.tax_amount), narration: 'Input tax' }] : []),
      { accountId: a('accountsPayable'), credit: Number(expense.amount) + Number(expense.tax_amount || 0), narration: 'Vendor payable' },
    ],
  });
  await withRlsTransaction(pool, { orgId: organizationId, userId: actorId || 0, isPlatformAdmin: false },
    (client) => client.query(
      `UPDATE finance_expenses SET journal_entry_id = $3, status = 'approved' WHERE id = $1 AND organization_id = $2`,
      [expense.id, organizationId, entry.id]
    ));
  return entry;
});

export default { postInvoice, postPayment, postInsuranceSettlement, postRefund, postAdjustment, postExpense };
