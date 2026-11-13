/**
 * Which financial year a roster row belongs to.
 *
 * The employer uploads its employee list once per financial year (1 April –
 * 31 March); that upload IS the live employee set for the year. Without
 * recording the year on the row, a new year's upload cannot be distinguished
 * from the previous one, so people who have left stay "active" forever and the
 * list grows without bound — Equitas is carrying 5,545 associated accounts for
 * about 860 current staff.
 *
 * `roster_financial_year` holds the label from utils/ist-date.js `fiscalYearOf`
 * (e.g. 'FY2026-27'), so the year is computed in IST and matches the finance
 * ledger's definition rather than a second one.
 */
export async function up(pool) {
  await pool.query(`
    ALTER TABLE corporate_employees
      ADD COLUMN IF NOT EXISTS roster_financial_year VARCHAR(12),
      ADD COLUMN IF NOT EXISTS roster_uploaded_at TIMESTAMPTZ;
    CREATE INDEX IF NOT EXISTS idx_corporate_employees_roster_fy
      ON corporate_employees (corporate_id, roster_financial_year);
  `);
}

export async function down(pool) {
  // Keeping the columns: dropping them would lose which year each row came from.
  await pool.query('SELECT 1');
}
