import pool from '../db/pgPool.js';
import { withRlsTransaction } from '../middleware/rls-context.middleware.js';

const money = (value) => Number(value || 0).toFixed(2);
const scoped = (organizationId, userId, work) => withRlsTransaction(pool, { orgId: organizationId, userId: userId || 0, isPlatformAdmin: false }, work);

export async function listAccounts(organizationId) {
  return scoped(organizationId, 0, async (client) => (await client.query('SELECT * FROM finance_accounts WHERE organization_id = $1 ORDER BY account_code', [organizationId])).rows);
}

export async function listVendors(organizationId) {
  return scoped(organizationId, 0, async (client) => (await client.query('SELECT * FROM finance_vendors WHERE organization_id = $1 ORDER BY vendor_name', [organizationId])).rows);
}

export async function createVendor(organizationId, input, actorId) {
  if (!input?.vendor_code || !input?.vendor_name) throw new Error('vendor_code and vendor_name are required');
  return scoped(organizationId, actorId, async (client) => {
    const { rows } = await client.query(
      `INSERT INTO finance_vendors (organization_id, vendor_code, vendor_name, gstin, pan, email, phone, payment_terms_days, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [organizationId, input.vendor_code, input.vendor_name, input.gstin || null, input.pan || null, input.email || null, input.phone || null, Number(input.payment_terms_days || 30), actorId || null]
    );
    return rows[0];
  });
}

export async function listExpenses(organizationId, { from, to, status } = {}) {
  const params = [organizationId];
  const clauses = ['e.organization_id = $1'];
  if (from) { params.push(from); clauses.push(`e.expense_date >= $${params.length}::date`); }
  if (to) { params.push(to); clauses.push(`e.expense_date <= $${params.length}::date`); }
  if (status) { params.push(status); clauses.push(`e.status = $${params.length}`); }
  return scoped(organizationId, 0, async (client) => {
    const { rows } = await client.query(`SELECT e.*, v.vendor_name FROM finance_expenses e LEFT JOIN finance_vendors v ON v.id = e.vendor_id WHERE ${clauses.join(' AND ')} ORDER BY e.expense_date DESC, e.id DESC`, params);
    return rows;
  });
}

export async function createExpense(organizationId, input, actorId) {
  if (!input?.expense_date || !input?.category || Number(input.amount) <= 0) throw new Error('expense_date, category and a positive amount are required');
  return scoped(organizationId, actorId, async (client) => {
    const { rows } = await client.query(
      `INSERT INTO finance_expenses (organization_id, vendor_id, expense_date, category, description, amount, tax_code, tax_amount, gstin, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [organizationId, input.vendor_id || null, input.expense_date, input.category, input.description || null, Number(input.amount), input.tax_code || null, Number(input.tax_amount || 0), input.gstin || null, actorId || null]
    );
    return rows[0];
  });
}

export async function listBudgets(organizationId) {
  return scoped(organizationId, 0, async (client) => {
    const { rows } = await client.query(
      `SELECT b.*, p.period_code, p.start_date, p.end_date FROM finance_budgets b
       JOIN finance_fiscal_periods p ON p.id = b.fiscal_period_id
       WHERE b.organization_id = $1 ORDER BY p.start_date DESC, b.category`, [organizationId]);
    return rows;
  });
}

export async function listTaxCodes(organizationId) {
  return scoped(organizationId, 0, async (client) => (await client.query('SELECT * FROM finance_tax_codes WHERE organization_id = $1 ORDER BY tax_code', [organizationId])).rows);
}

export async function listJournalEntries(organizationId, { from, to, limit = 100 } = {}) {
  const params = [organizationId];
  const clauses = ['j.organization_id = $1'];
  if (from) { params.push(from); clauses.push(`j.entry_date >= $${params.length}::date`); }
  if (to) { params.push(to); clauses.push(`j.entry_date <= $${params.length}::date`); }
  params.push(Math.min(Math.max(Number(limit) || 100, 1), 500));
  return scoped(organizationId, 0, async (client) => {
    const { rows } = await client.query(
      `SELECT j.*, COALESCE(SUM(l.debit),0) AS total_debit, COALESCE(SUM(l.credit),0) AS total_credit,
              json_agg(json_build_object('id', l.id, 'accountId', l.account_id, 'accountCode', a.account_code, 'accountName', a.account_name, 'debit', l.debit, 'credit', l.credit, 'narration', l.narration) ORDER BY l.id) FILTER (WHERE l.id IS NOT NULL) AS lines
       FROM finance_journal_entries j LEFT JOIN finance_journal_lines l ON l.journal_entry_id = j.id
       LEFT JOIN finance_accounts a ON a.id = l.account_id
       WHERE ${clauses.join(' AND ')} GROUP BY j.id ORDER BY j.entry_date DESC, j.id DESC LIMIT $${params.length}`, params);
    return rows;
  });
}

async function assertPeriodOpen(client, organizationId, date) {
  const { rows } = await client.query(
    `SELECT period_code, status FROM finance_fiscal_periods
     WHERE organization_id = $1 AND $2::date BETWEEN start_date AND end_date LIMIT 1`,
    [organizationId, date]
  );
  if (rows[0]?.status === 'closed') {
    const err = new Error(`Fiscal period ${rows[0].period_code} is closed; entries cannot be posted to it`);
    err.code = 'FISCAL_PERIOD_CLOSED';
    err.status = 409;
    throw err;
  }
}

export async function postJournalEntry(organizationId, input, actorId) {
  const lines = Array.isArray(input?.lines) ? input.lines : [];
  const sourceType = input?.source_type || 'manual';
  if (!input?.description || lines.length < 2) throw new Error('description and at least two journal lines are required');
  if (lines.some((l) => !l.accountId || (Number(l.debit || 0) === 0 && Number(l.credit || 0) === 0) || (Number(l.debit || 0) > 0 && Number(l.credit || 0) > 0))) throw new Error('Each journal line needs one account and exactly one debit or credit amount');
  const debit = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const credit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  if (debit <= 0 || credit <= 0 || money(debit) !== money(credit)) throw new Error('Journal entry must balance with positive debit and credit totals');
  return scoped(organizationId, actorId, async (client) => {
    const entryDate = input.entry_date || new Date().toISOString().slice(0, 10);
    await assertPeriodOpen(client, organizationId, entryDate);

    // Idempotency is keyed on (organization, source_type, source_id). A replay returns the
    // original entry untouched — it must never re-insert its lines.
    if (input.source_id) {
      const prior = await client.query(
        `SELECT * FROM finance_journal_entries WHERE organization_id = $1 AND source_type = $2 AND source_id = $3`,
        [organizationId, sourceType, input.source_id]
      );
      if (prior.rows[0]) return { ...prior.rows[0], idempotentReplay: true };
    }

    let entry;
    try {
      entry = await client.query(
        `INSERT INTO finance_journal_entries (organization_id, entry_number, entry_date, description, source_type, source_id, created_by)
         VALUES ($1, 'JE-' || TO_CHAR(NOW(),'YYYYMMDD') || '-' || LPAD(nextval('finance_journal_entry_seq')::TEXT,8,'0'), $2::date, $3, $4, $5, $6)
         RETURNING *`,
        [organizationId, entryDate, input.description, sourceType, input.source_id || null, actorId || null]
      );
    } catch (err) {
      // 23505 = lost the race against a concurrent writer for the same source.
      if (err.code === '23505' && input.source_id) {
        const prior = await client.query(
          `SELECT * FROM finance_journal_entries WHERE organization_id = $1 AND source_type = $2 AND source_id = $3`,
          [organizationId, sourceType, input.source_id]
        );
        if (prior.rows[0]) return { ...prior.rows[0], idempotentReplay: true };
      }
      throw err;
    }
    for (const line of lines) {
      const account = await client.query('SELECT id FROM finance_accounts WHERE id = $1 AND organization_id = $2', [line.accountId, organizationId]);
      if (!account.rows[0]) throw new Error(`Account ${line.accountId} is not available to this organization`);
      await client.query('INSERT INTO finance_journal_lines (journal_entry_id, account_id, debit, credit, narration) VALUES ($1,$2,$3,$4,$5)', [entry.rows[0].id, line.accountId, Number(line.debit || 0), Number(line.credit || 0), line.narration || null]);
    }
    return entry.rows[0];
  });
}

// ── Fiscal periods ───────────────────────────────────────────────────────────
export async function listFiscalPeriods(organizationId) {
  return scoped(organizationId, 0, async (client) =>
    (await client.query('SELECT * FROM finance_fiscal_periods WHERE organization_id = $1 ORDER BY start_date DESC', [organizationId])).rows);
}

export async function createFiscalPeriod(organizationId, input) {
  if (!input?.period_code || !input?.start_date || !input?.end_date) throw new Error('period_code, start_date and end_date are required');
  if (input.end_date < input.start_date) throw new Error('end_date cannot be before start_date');
  return scoped(organizationId, 0, async (client) => (await client.query(
    `INSERT INTO finance_fiscal_periods (organization_id, period_code, start_date, end_date) VALUES ($1,$2,$3,$4)
     ON CONFLICT (organization_id, period_code) DO UPDATE SET start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date
     RETURNING *`, [organizationId, input.period_code, input.start_date, input.end_date])).rows[0]);
}

export async function closeFiscalPeriod(organizationId, periodCode, actorId) {
  return scoped(organizationId, actorId, async (client) => {
    const { rows } = await client.query(
      `UPDATE finance_fiscal_periods SET status = 'closed', closed_by = $3, closed_at = NOW()
       WHERE organization_id = $1 AND period_code = $2 AND status = 'open' RETURNING *`,
      [organizationId, periodCode, actorId || null]
    );
    if (!rows[0]) {
      const err = new Error(`Fiscal period ${periodCode} is not open`);
      err.code = 'PERIOD_NOT_OPEN';
      err.status = 409;
      throw err;
    }
    return rows[0];
  });
}

// ── Reversal (never mutate posted amounts — post an offsetting entry) ─────────
export async function reverseJournalEntry(organizationId, entryId, reason, actorId) {
  if (!String(reason || '').trim()) throw new Error('A reason is required to reverse a journal entry');
  const original = await scoped(organizationId, actorId, async (client) =>
    (await client.query('SELECT * FROM finance_journal_entries WHERE id = $1 AND organization_id = $2', [entryId, organizationId])).rows[0]);
  if (!original) throw new Error('Journal entry not found');
  if (original.status === 'reversed') return { success: true, alreadyReversed: true };
  if (original.reversal_of) throw new Error('A reversal entry cannot itself be reversed');

  const lines = await scoped(organizationId, actorId, async (client) =>
    (await client.query('SELECT account_id, debit, credit, narration FROM finance_journal_lines WHERE journal_entry_id = $1', [entryId])).rows);
  if (!lines.length) throw new Error('Journal entry has no lines to reverse');

  const reversal = await postJournalEntry(organizationId, {
    description: `Reversal of ${original.entry_number}: ${reason}`,
    entry_date: new Date().toISOString().slice(0, 10),
    source_type: 'reversal',
    source_id: `rev-${entryId}`,
    lines: lines.map((l) => ({ accountId: l.account_id, debit: Number(l.credit || 0), credit: Number(l.debit || 0), narration: l.narration })),
  }, actorId);

  await scoped(organizationId, actorId, async (client) => {
    await client.query(
      `UPDATE finance_journal_entries SET status = 'reversed', reversed_by = $3, reversal_of = $4 WHERE id = $1 AND organization_id = $2`,
      [entryId, organizationId, actorId || null, reversal.id]
    );
  });
  return { success: true, original, reversal };
}

export default {
  listAccounts, listVendors, createVendor, listExpenses, createExpense, listBudgets, listTaxCodes,
  listJournalEntries, postJournalEntry, listFiscalPeriods, createFiscalPeriod, closeFiscalPeriod,
  reverseJournalEntry,
};
