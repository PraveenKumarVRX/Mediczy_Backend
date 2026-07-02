/**
 * Hospital GL journal export — Phase 3
 */
import pool from '../db/pgPool.js';

const DEFAULT_ACCOUNTS = {
  cash: { code: '1000', name: 'Cash' },
  card: { code: '1010', name: 'Card Receivable' },
  upi: { code: '1015', name: 'UPI Receivable' },
  insurance: { code: '1200', name: 'Insurance Receivable' },
  credit: { code: '1300', name: 'Patient Credit' },
  revenue: { code: '4000', name: 'Patient Revenue' },
  adjustment: { code: '4100', name: 'Contractual Adjustment' },
  refund: { code: '2100', name: 'Refunds Payable' },
};

function entryNumber(hospitalId) {
  return `JE-${hospitalId}-${Date.now().toString(36).toUpperCase()}`;
}

export async function postGlEntry(hospitalId, entry, actor) {
  const { entryType, debitAccount, creditAccount, amount, referenceType, referenceId, description, entryDate } = entry;
  if (!entryType || !amount) throw new Error('entryType and amount required');

  const debit = debitAccount || DEFAULT_ACCOUNTS.cash;
  const credit = creditAccount || DEFAULT_ACCOUNTS.revenue;
  const num = entryNumber(hospitalId);
  const amt = Number(amount);

  const rows = [];
  const r1 = await pool.query(
    `INSERT INTO gl_journal_entries
       (hospital_id, entry_number, entry_date, account_code, account_name, debit, credit, source_type, source_id, description)
     VALUES ($1,$2,COALESCE($3::date,CURRENT_DATE),$4,$5,$6,0,$7,$8,$9) RETURNING *`,
    [hospitalId, num, entryDate || null, debit.code || debit, debit.name || debit, amt, referenceType, referenceId, description]
  );
  rows.push(r1.rows[0]);

  const r2 = await pool.query(
    `INSERT INTO gl_journal_entries
       (hospital_id, entry_number, entry_date, account_code, account_name, debit, credit, source_type, source_id, description)
     VALUES ($1,$2,COALESCE($3::date,CURRENT_DATE),$4,$5,0,$6,$7,$8,$9) RETURNING *`,
    [hospitalId, num, entryDate || null, credit.code || credit, credit.name || credit, amt, referenceType, referenceId, description]
  );
  rows.push(r2.rows[0]);

  return rows;
}

export async function postPaymentGl(hospitalId, payment, actor) {
  const mode = (payment.payment_method || 'cash').toLowerCase();
  const debit = DEFAULT_ACCOUNTS[mode] || DEFAULT_ACCOUNTS.cash;
  return postGlEntry(hospitalId, {
    entryType: 'payment_received',
    debitAccount: debit,
    creditAccount: DEFAULT_ACCOUNTS.revenue,
    amount: payment.amount,
    referenceType: 'payment',
    referenceId: String(payment.id),
    description: `Payment #${payment.id}`,
  }, actor);
}

export async function exportGlJournal(hospitalId, { from, to, format = 'json' } = {}) {
  const fromDate = from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const toDate = to || new Date().toISOString().slice(0, 10);

  const rows = await pool.query(
    `SELECT * FROM gl_journal_entries
     WHERE hospital_id = $1 AND entry_date >= $2::date AND entry_date <= $3::date
     ORDER BY entry_date, created_at`,
    [hospitalId, fromDate, toDate]
  );

  if (format === 'csv') {
    const header = 'entry_number,date,account_code,account_name,debit,credit,source,description\n';
    const lines = rows.rows.map((r) =>
      [r.entry_number, r.entry_date, r.account_code, r.account_name, r.debit, r.credit, r.source_id, `"${(r.description || '').replace(/"/g, '""')}"`].join(',')
    ).join('\n');
    return { format: 'csv', content: header + lines };
  }

  return { format: 'json', entries: rows.rows, period: { from: fromDate, to: toDate } };
}

export async function getGlSummary(hospitalId, { from, to } = {}) {
  const fromDate = from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const toDate = to || new Date().toISOString().slice(0, 10);

  const r = await pool.query(
    `SELECT account_code, account_name, SUM(debit) AS total_debit, SUM(credit) AS total_credit, COUNT(*) AS cnt
     FROM gl_journal_entries
     WHERE hospital_id = $1 AND entry_date >= $2::date AND entry_date <= $3::date
     GROUP BY account_code, account_name
     ORDER BY total_credit DESC`,
    [hospitalId, fromDate, toDate]
  );

  return { period: { from: fromDate, to: toDate }, lines: r.rows };
}

export default { postGlEntry, postPaymentGl, exportGlJournal, getGlSummary };
