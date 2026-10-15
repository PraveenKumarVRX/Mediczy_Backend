import pool from '../db/pgPool.js';

/** Traceability columns for the payroll → general-ledger posting boundary. */
export async function up() {
  await pool.query(`
    ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS finance_journal_entry_id BIGINT;
    ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS finance_posted_at TIMESTAMPTZ;
    ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS finance_posted_by INTEGER;
    CREATE INDEX IF NOT EXISTS idx_payroll_runs_finance_entry ON payroll_runs (tenant_id, finance_journal_entry_id);
  `);
  console.log('[migration] Payroll finance link ready');
}

export async function down() {
  await pool.query(`
    DROP INDEX IF EXISTS idx_payroll_runs_finance_entry;
    ALTER TABLE payroll_runs DROP COLUMN IF EXISTS finance_posted_by;
    ALTER TABLE payroll_runs DROP COLUMN IF EXISTS finance_posted_at;
    ALTER TABLE payroll_runs DROP COLUMN IF EXISTS finance_journal_entry_id;
  `);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  up().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
}

export default { up, down };
