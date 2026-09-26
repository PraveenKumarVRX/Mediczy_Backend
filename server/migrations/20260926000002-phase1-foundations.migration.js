import pool from '../db/pgPool.js';

const SQL = `
DO $$
BEGIN
  IF to_regclass('clinical_safety_settings') IS NOT NULL THEN
    ALTER TABLE clinical_safety_settings
      ADD COLUMN IF NOT EXISTS reconciliation_required BOOLEAN NOT NULL DEFAULT TRUE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS entitlement_packages (
  id BIGSERIAL PRIMARY KEY,
  package_code VARCHAR(80) UNIQUE NOT NULL,
  package_name VARCHAR(160) NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_entitlements (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL,
  package_id BIGINT NOT NULL REFERENCES entitlement_packages(id),
  module_id VARCHAR(100) NOT NULL,
  can_view BOOLEAN NOT NULL DEFAULT TRUE,
  can_create BOOLEAN NOT NULL DEFAULT FALSE,
  can_edit BOOLEAN NOT NULL DEFAULT FALSE,
  can_delete BOOLEAN NOT NULL DEFAULT FALSE,
  can_export BOOLEAN NOT NULL DEFAULT FALSE,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  granted_by BIGINT,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, package_id, module_id)
);
CREATE INDEX IF NOT EXISTS idx_tenant_entitlements_lookup
  ON tenant_entitlements (organization_id, module_id, is_active);

CREATE TABLE IF NOT EXISTS finance_accounts (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL,
  account_code VARCHAR(40) NOT NULL,
  account_name VARCHAR(200) NOT NULL,
  account_type VARCHAR(30) NOT NULL CHECK (account_type IN ('asset','liability','equity','income','expense')),
  parent_code VARCHAR(40),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, account_code)
);
CREATE INDEX IF NOT EXISTS idx_finance_accounts_org ON finance_accounts (organization_id, account_type);

CREATE TABLE IF NOT EXISTS finance_fiscal_periods (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL,
  period_code VARCHAR(20) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  closed_by BIGINT,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, period_code),
  CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS finance_vendors (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL,
  vendor_code VARCHAR(50) NOT NULL,
  vendor_name VARCHAR(200) NOT NULL,
  gstin VARCHAR(20),
  pan VARCHAR(20),
  email VARCHAR(200),
  phone VARCHAR(40),
  payment_terms_days INTEGER NOT NULL DEFAULT 30 CHECK (payment_terms_days >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, vendor_code)
);

CREATE TABLE IF NOT EXISTS finance_expenses (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL,
  vendor_id BIGINT REFERENCES finance_vendors(id),
  expense_date DATE NOT NULL,
  category VARCHAR(100) NOT NULL,
  description TEXT,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  tax_code VARCHAR(40),
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  gstin VARCHAR(20),
  status VARCHAR(24) NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded','approved','paid','void')),
  journal_entry_id BIGINT,
  created_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_finance_expenses_org_date ON finance_expenses (organization_id, expense_date DESC);

CREATE TABLE IF NOT EXISTS finance_budgets (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL,
  fiscal_period_id BIGINT NOT NULL REFERENCES finance_fiscal_periods(id),
  department VARCHAR(120),
  category VARCHAR(100) NOT NULL,
  budget_amount NUMERIC(14,2) NOT NULL CHECK (budget_amount >= 0),
  spent_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (spent_amount >= 0),
  approved_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, fiscal_period_id, department, category)
);

CREATE TABLE IF NOT EXISTS finance_journal_entries (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL,
  entry_number VARCHAR(60) NOT NULL,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  source_type VARCHAR(60),
  source_id VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'posted' CHECK (status IN ('draft','posted','reversed')),
  created_by BIGINT,
  reversed_by BIGINT,
  reversal_of BIGINT REFERENCES finance_journal_entries(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, entry_number)
);
CREATE INDEX IF NOT EXISTS idx_finance_journal_org_date ON finance_journal_entries (organization_id, entry_date DESC);

CREATE TABLE IF NOT EXISTS finance_journal_lines (
  id BIGSERIAL PRIMARY KEY,
  journal_entry_id BIGINT NOT NULL REFERENCES finance_journal_entries(id) ON DELETE CASCADE,
  account_id BIGINT NOT NULL REFERENCES finance_accounts(id),
  debit NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  narration TEXT,
  CHECK (NOT (debit > 0 AND credit > 0))
);
CREATE INDEX IF NOT EXISTS idx_finance_journal_lines_entry ON finance_journal_lines (journal_entry_id);

CREATE TABLE IF NOT EXISTS finance_tax_codes (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL,
  tax_code VARCHAR(40) NOT NULL,
  tax_name VARCHAR(120) NOT NULL,
  tax_type VARCHAR(30) NOT NULL,
  rate NUMERIC(8,4) NOT NULL CHECK (rate >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, tax_code)
);

CREATE TABLE IF NOT EXISTS cron_job_leases (
  job_key VARCHAR(160) PRIMARY KEY,
  owner_id VARCHAR(200) NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_cron_job_leases_expiry ON cron_job_leases (expires_at);
CREATE SEQUENCE IF NOT EXISTS finance_journal_entry_seq;
CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_journal_source
  ON finance_journal_entries (organization_id, source_type, source_id)
  WHERE source_id IS NOT NULL;

-- Entitlement grants/revocations are audited here. operations-governance.service.js creates this
-- table lazily at request time, but the finance/entitlement service must be able to audit on a
-- freshly migrated database, so the Phase 1 migration owns it. entity_id stays INTEGER to match the
-- existing table; callers that need a composite key put it in details.
CREATE TABLE IF NOT EXISTS operations_audit_log (
  id BIGSERIAL PRIMARY KEY,
  module VARCHAR(80) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id INTEGER NOT NULL,
  action VARCHAR(120) NOT NULL,
  actor VARCHAR(160),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  organization_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_operations_audit_org ON operations_audit_log (organization_id, created_at DESC);

-- ── Tenant isolation for the Phase 1 tables. Platform-admin sessions may bypass via app.is_platform_admin.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tenant_entitlements', 'finance_accounts', 'finance_fiscal_periods', 'finance_vendors',
    'finance_expenses', 'finance_budgets', 'finance_journal_entries', 'finance_tax_codes'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    -- The app role OWNS these tables; without FORCE an owner bypasses its own policies. Every access path
    -- (services/finance-*.js, entitlement.service.js) runs inside withRlsTransaction, which sets the org context.
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (organization_id = NULLIF(current_setting(''app.current_org_id'', true), '''')::bigint OR current_setting(''app.is_platform_admin'', true) = ''true'') WITH CHECK (organization_id = NULLIF(current_setting(''app.current_org_id'', true), '''')::bigint OR current_setting(''app.is_platform_admin'', true) = ''true'')',
      t || '_tenant_isolation', t
    );
  END LOOP;
  ALTER TABLE finance_journal_lines ENABLE ROW LEVEL SECURITY;
  ALTER TABLE finance_journal_lines FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS finance_journal_lines_tenant_isolation ON finance_journal_lines;
  CREATE POLICY finance_journal_lines_tenant_isolation ON finance_journal_lines
    USING (EXISTS (SELECT 1 FROM finance_journal_entries e WHERE e.id = journal_entry_id AND (e.organization_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint OR current_setting('app.is_platform_admin', true) = 'true')))
    WITH CHECK (EXISTS (SELECT 1 FROM finance_journal_entries e WHERE e.id = journal_entry_id AND (e.organization_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint OR current_setting('app.is_platform_admin', true) = 'true')));
END $$;
`;

export async function up() {
  await pool.query(SQL);
}

export async function down() {
  await pool.query(`
    DROP SEQUENCE IF EXISTS finance_journal_entry_seq;
    DROP TABLE IF EXISTS finance_journal_lines, finance_journal_entries, cron_job_leases,
      finance_tax_codes, finance_budgets, finance_expenses, finance_vendors,
      finance_fiscal_periods, finance_accounts, tenant_entitlements, entitlement_packages;
  `);
}

export default { up, down };

if (process.argv[1] && process.argv[1].includes('20260926000002-phase1-foundations')) {
  up().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
}
