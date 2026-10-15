import pool from '../db/pgPool.js';

/** Migration-owned payroll structures, runs, and immutable run lines. */
export async function up() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payroll_structures (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      employee_code VARCHAR(80),
      employee_name VARCHAR(180),
      department VARCHAR(120),
      designation VARCHAR(120),
      basic NUMERIC(12,2) NOT NULL CHECK (basic >= 0),
      hra NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (hra >= 0),
      allowances NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (allowances >= 0),
      deductions NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (deductions >= 0),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, employee_code)
    );
    CREATE TABLE IF NOT EXISTS payroll_runs (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      month VARCHAR(7) NOT NULL CHECK (month ~ '^\\d{4}-(0[1-9]|1[0-2])$'),
      status VARCHAR(24) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','finalized','exported','cancelled')),
      gross_total NUMERIC(14,2) NOT NULL DEFAULT 0,
      pf_total NUMERIC(14,2) NOT NULL DEFAULT 0,
      esi_total NUMERIC(14,2) NOT NULL DEFAULT 0,
      tds_total NUMERIC(14,2) NOT NULL DEFAULT 0,
      net_total NUMERIC(14,2) NOT NULL DEFAULT 0,
      created_by INTEGER,
      finalized_by INTEGER,
      finalized_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, month)
    );
    CREATE TABLE IF NOT EXISTS payroll_run_lines (
      id BIGSERIAL PRIMARY KEY,
      run_id BIGINT NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
      structure_id BIGINT REFERENCES payroll_structures(id) ON DELETE SET NULL,
      employee_code VARCHAR(80) NOT NULL,
      employee_name VARCHAR(180) NOT NULL,
      gross NUMERIC(12,2) NOT NULL CHECK (gross >= 0),
      pf NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (pf >= 0),
      esi NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (esi >= 0),
      tds NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (tds >= 0),
      other_deductions NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (other_deductions >= 0),
      net NUMERIC(12,2) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (run_id, employee_code)
    );
    CREATE INDEX IF NOT EXISTS idx_payroll_structures_tenant ON payroll_structures (tenant_id, active, employee_name);
    CREATE INDEX IF NOT EXISTS idx_payroll_runs_tenant ON payroll_runs (tenant_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_payroll_lines_run ON payroll_run_lines (run_id);
    ALTER TABLE payroll_structures ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS created_by INTEGER;
    ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS finalized_by INTEGER;
    ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ;
    ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    ALTER TABLE payroll_run_lines ADD COLUMN IF NOT EXISTS employee_code VARCHAR(80);
    ALTER TABLE payroll_run_lines ADD COLUMN IF NOT EXISTS employee_name VARCHAR(180);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_structures_tenant_employee ON payroll_structures (tenant_id, employee_code);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_runs_tenant_month ON payroll_runs (tenant_id, month);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_lines_run_employee ON payroll_run_lines (run_id, employee_code) WHERE employee_code IS NOT NULL;
  `);
  console.log('[migration] Payroll schema ready');
}

export async function down() {
  await pool.query('DROP TABLE IF EXISTS payroll_run_lines CASCADE, payroll_runs CASCADE, payroll_structures CASCADE;');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  up().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
}

export default { up, down };
