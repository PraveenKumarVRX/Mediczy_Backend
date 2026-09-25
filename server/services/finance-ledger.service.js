import pool from '../db/pgPool.js';
import { withRlsTransaction } from '../middleware/rls-context.middleware.js';
import { todayIST } from '../utils/ist-date.js';

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

const fail = (message, code, status = 409) => Object.assign(new Error(message), { code, status });
const invalid = (message) => fail(message, 'INVALID_JOURNAL', 400);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Money is compared in integer paise: summing floats and comparing toFixed strings can disagree by a paisa.
const paise = (v) => Math.round(Number(v || 0) * 100);

async function assertPeriodOpen(client, organizationId, date) {
  const { rows } = await client.query(
    `SELECT period_code, status FROM finance_fiscal_periods
     WHERE organization_id = $1 AND $2::date BETWEEN start_date AND end_date
     ORDER BY start_date DESC LIMIT 1`,
    [organizationId, date]
  );
  // Audit FIN-03: a date with NO covering period used to be accepted silently, i.e. entirely uncontrolled.
  if (!rows[0]) throw fail(`No fiscal period covers ${date}; create one before posting`, 'NO_FISCAL_PERIOD');
  if (rows[0].status === 'closed') throw fail(`Fiscal period ${rows[0].period_code} is closed; entries cannot be posted to it`, 'FISCAL_PERIOD_CLOSED');
}

function validateJournal(input) {
  const lines = Array.isArray(input?.lines) ? input.lines : [];
  if (!input?.description || lines.length < 2) throw invalid('description and at least two journal lines are required');
  if (input.entry_date != null && !DATE_RE.test(String(input.entry_date))) throw invalid('entry_date must be YYYY-MM-DD');
  for (const l of lines) {
    const d = paise(l.debit); const c = paise(l.credit);
    if (!l.accountId || !Number.isFinite(d) || !Number.isFinite(c) || d < 0 || c < 0 || (d === 0) === (c === 0)) {
      throw invalid('Each journal line needs one account and exactly one positive debit or credit amount');
    }
  }
  const debit = lines.reduce((s, l) => s + paise(l.debit), 0);
  const credit = lines.reduce((s, l) => s + paise(l.credit), 0);
  if (debit <= 0 || debit !== credit) throw fail('Journal entry must balance with positive debit and credit totals', 'JOURNAL_UNBALANCED', 422);
  return lines;
}

/**
 * Inserts one balanced entry inside the caller's transaction. Idempotent on (organization, source_type, source_id):
 * a replay returns the original entry untouched and never re-inserts lines.
 */
async function insertEntry(client, organizationId, input, actorId, { reversalOf = null } = {}) {
  const lines = validateJournal(input);
  const sourceType = input.source_type || 'manual';
  const entryDate = input.entry_date || todayIST();
  await assertPeriodOpen(client, organizationId, entryDate);

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
      `INSERT INTO finance_journal_entries (organization_id, entry_number, entry_date, description, source_type, source_id, created_by, reversal_of)
       VALUES ($1, 'JE-' || TO_CHAR(NOW(),'YYYYMMDD') || '-' || LPAD(nextval('finance_journal_entry_seq')::TEXT,8,'0'), $2::date, $3, $4, $5, $6, $7)
       RETURNING *`,
      [organizationId, entryDate, input.description, sourceType, input.source_id || null, actorId || null, reversalOf]
    );
  } catch (err) {
    // 23505 = lost the race against a concurrent writer for the same source. The transaction is now aborted, so the
    // replay lookup MUST run on a fresh transaction — querying here would fail with 25P02.
    if (err.code === '23505' && input.source_id) {
      throw Object.assign(err, { __lostIdempotencyRace: true, organizationId, sourceType, sourceId: input.source_id });
    }
    throw err;
  }

  const ids = [...new Set(lines.map((l) => Number(l.accountId)))];
  const owned = await client.query('SELECT id FROM finance_accounts WHERE organization_id = $1 AND id = ANY($2::bigint[])', [organizationId, ids]);
  if (owned.rows.length !== ids.length) {
    const have = new Set(owned.rows.map((r) => Number(r.id)));
    throw invalid(`Account ${ids.find((id) => !have.has(id))} is not available to this organization`);
  }
  for (const line of lines) {
    await client.query(
      'INSERT INTO finance_journal_lines (journal_entry_id, account_id, debit, credit, narration) VALUES ($1,$2,$3,$4,$5)',
      [entry.rows[0].id, line.accountId, Number(line.debit || 0), Number(line.credit || 0), line.narration || null]
    );
  }
  return entry.rows[0];
}

export async function postJournalEntry(organizationId, input, actorId) {
  validateJournal(input);
  try {
    return await scoped(organizationId, actorId, (client) => insertEntry(client, organizationId, input, actorId));
  } catch (err) {
    // A concurrent writer already committed this source document; its entry is authoritative, so read it back on a
    // clean transaction and treat this as a replay.
    if (err.__lostIdempotencyRace) {
      const prior = await scoped(organizationId, actorId, (client) => client.query(
        `SELECT * FROM finance_journal_entries WHERE organization_id = $1 AND source_type = $2 AND source_id = $3`,
        [organizationId, err.sourceType, err.sourceId]
      ));
      if (prior.rows[0]) return { ...prior.rows[0], idempotentReplay: true };
      throw new Error('Conflicting journal entry for this source could not be resolved');
    }
    throw err;
  }
}

// ── Fiscal periods ───────────────────────────────────────────────────────────
export async function listFiscalPeriods(organizationId) {
  return scoped(organizationId, 0, async (client) =>
    (await client.query('SELECT * FROM finance_fiscal_periods WHERE organization_id = $1 ORDER BY start_date DESC', [organizationId])).rows);
}

export async function createFiscalPeriod(organizationId, input) {
  if (!input?.period_code || !input?.start_date || !input?.end_date) throw invalid('period_code, start_date and end_date are required');
  if (!DATE_RE.test(input.start_date) || !DATE_RE.test(input.end_date)) throw invalid('start_date and end_date must be YYYY-MM-DD');
  if (input.end_date < input.start_date) throw invalid('end_date cannot be before start_date');
  return scoped(organizationId, 0, async (client) => {
    // Serialise period maintenance per organization so two concurrent edits cannot both pass the overlap check.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`fiscal-period:${organizationId}`]);
    const existing = (await client.query(
      `SELECT *, (start_date = $3::date AND end_date = $4::date) AS same_dates
         FROM finance_fiscal_periods WHERE organization_id = $1 AND period_code = $2`,
      [organizationId, input.period_code, input.start_date, input.end_date])).rows[0];

    // Audit FIN-03: the old upsert let anyone move the dates of a CLOSED period, silently reopening its boundaries.
    if (existing?.status === 'closed') throw fail(`Fiscal period ${input.period_code} is closed and cannot be changed`, 'FISCAL_PERIOD_CLOSED');

    const overlap = (await client.query(
      `SELECT period_code FROM finance_fiscal_periods
       WHERE organization_id = $1 AND period_code <> $2 AND daterange(start_date, end_date, '[]') && daterange($3::date, $4::date, '[]') LIMIT 1`,
      [organizationId, input.period_code, input.start_date, input.end_date])).rows[0];
    if (overlap) throw fail(`Period overlaps ${overlap.period_code}`, 'FISCAL_PERIOD_OVERLAP');

    if (existing) {
      if (!existing.same_dates) {
        // Compared in SQL: pg returns DATE columns as JS Dates, and round-tripping them as parameters can shift a day.
        const posted = (await client.query(
          `SELECT 1 FROM finance_journal_entries e
             JOIN finance_fiscal_periods p ON p.organization_id = e.organization_id AND p.period_code = $2
            WHERE e.organization_id = $1 AND e.entry_date BETWEEN p.start_date AND p.end_date LIMIT 1`,
          [organizationId, input.period_code])).rows[0];
        if (posted) throw fail(`Period ${input.period_code} already has entries; its dates can no longer change`, 'FISCAL_PERIOD_HAS_ENTRIES');
      }
      return (await client.query(
        'UPDATE finance_fiscal_periods SET start_date = $3, end_date = $4 WHERE organization_id = $1 AND period_code = $2 RETURNING *',
        [organizationId, input.period_code, input.start_date, input.end_date])).rows[0];
    }
    return (await client.query(
      'INSERT INTO finance_fiscal_periods (organization_id, period_code, start_date, end_date) VALUES ($1,$2,$3,$4) RETURNING *',
      [organizationId, input.period_code, input.start_date, input.end_date])).rows[0];
  });
}

export async function closeFiscalPeriod(organizationId, periodCode, actorId) {
  return scoped(organizationId, actorId, async (client) => {
    const { rows } = await client.query(
      `UPDATE finance_fiscal_periods SET status = 'closed', closed_by = $3, closed_at = NOW()
       WHERE organization_id = $1 AND period_code = $2 AND status = 'open' RETURNING *`,
      [organizationId, periodCode, actorId || null]
    );
    if (!rows[0]) throw fail(`Fiscal period ${periodCode} is not open`, 'PERIOD_NOT_OPEN');
    return rows[0];
  });
}

// ── Reversal (never mutate posted amounts — post an offsetting entry) ─────────
/**
 * Atomic: the offsetting entry and the "reversed" flag on the original commit together or not at all.
 *
 * Flag semantics (audit FIN-02): `reversal_of` lives on the REVERSAL and points at the original; the original only
 * gets status = 'reversed'. A reversal therefore can never itself be reversed. Reports keep both entries — each in
 * its own period — so they net to zero over any range that contains both.
 */
export async function reverseJournalEntry(organizationId, entryId, reason, actorId) {
  if (!String(reason || '').trim()) throw invalid('A reason is required to reverse a journal entry');
  return scoped(organizationId, actorId, async (client) => {
    const original = (await client.query(
      'SELECT * FROM finance_journal_entries WHERE id = $1 AND organization_id = $2 FOR UPDATE', [entryId, organizationId])).rows[0];
    if (!original) throw fail('Journal entry not found', 'JOURNAL_ENTRY_NOT_FOUND', 404);
    if (original.reversal_of) throw fail('A reversal entry cannot itself be reversed', 'REVERSAL_CANNOT_BE_REVERSED');
    if (original.status === 'reversed') return { success: true, alreadyReversed: true, original };
    if (original.status !== 'posted') throw fail(`Only posted entries can be reversed (this one is ${original.status})`, 'ENTRY_NOT_POSTED');

    const lines = (await client.query(
      'SELECT account_id, debit, credit, narration FROM finance_journal_lines WHERE journal_entry_id = $1', [entryId])).rows;
    if (!lines.length) throw fail('Journal entry has no lines to reverse', 'ENTRY_HAS_NO_LINES');

    const reversal = await insertEntry(client, organizationId, {
      description: `Reversal of ${original.entry_number}: ${reason}`,
      entry_date: todayIST(),
      source_type: 'reversal',
      source_id: `rev-${entryId}`,
      lines: lines.map((l) => ({ accountId: l.account_id, debit: Number(l.credit || 0), credit: Number(l.debit || 0), narration: l.narration })),
    }, actorId, { reversalOf: entryId });

    await client.query(
      `UPDATE finance_journal_entries SET status = 'reversed', reversed_by = $3 WHERE id = $1 AND organization_id = $2`,
      [entryId, organizationId, actorId || null]
    );
    return { success: true, original: { ...original, status: 'reversed', reversed_by: actorId || null }, reversal };
  });
}

export default {
  listAccounts, listVendors, createVendor, listExpenses, createExpense, listBudgets, listTaxCodes,
  listJournalEntries, postJournalEntry, listFiscalPeriods, createFiscalPeriod, closeFiscalPeriod,
  reverseJournalEntry,
};
