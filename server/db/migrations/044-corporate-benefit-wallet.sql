-- Corporate Benefits Wallet foundation
--
-- Adds employer-funded, auditable benefit wallets that are separate from
-- consumer Health Coins. These tables support HR-configured programs,
-- employee-level eligibility/balance, ledger entries, and cashless/pre-auth
-- requests.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'corporate_benefit_category') THEN
    CREATE TYPE corporate_benefit_category AS ENUM (
      'opd',
      'diagnostics',
      'pharmacy',
      'dental',
      'vision',
      'health_checkup',
      'mental_wellness',
      'fitness',
      'vaccination',
      'other'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'corporate_benefit_program_status') THEN
    CREATE TYPE corporate_benefit_program_status AS ENUM (
      'draft',
      'active',
      'paused',
      'expired',
      'archived'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'corporate_benefit_wallet_status') THEN
    CREATE TYPE corporate_benefit_wallet_status AS ENUM (
      'active',
      'paused',
      'exhausted',
      'expired',
      'archived'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'corporate_benefit_transaction_type') THEN
    CREATE TYPE corporate_benefit_transaction_type AS ENUM (
      'allocation',
      'reservation',
      'reservation_release',
      'settlement',
      'adjustment',
      'expiry',
      'reversal'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'corporate_benefit_authorization_status') THEN
    CREATE TYPE corporate_benefit_authorization_status AS ENUM (
      'submitted',
      'approved',
      'declined',
      'cancelled',
      'settled',
      'expired'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS corporate_benefit_programs (
  id BIGSERIAL PRIMARY KEY,
  corporate_id BIGINT NOT NULL REFERENCES corporates(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  category corporate_benefit_category NOT NULL,
  funding_type VARCHAR(40) NOT NULL DEFAULT 'employer_funded'
    CHECK (funding_type IN ('employer_funded', 'co_pay', 'reimbursement', 'cashless')),
  annual_budget NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (annual_budget >= 0),
  per_employee_limit NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (per_employee_limit >= 0),
  family_coverage BOOLEAN NOT NULL DEFAULT false,
  max_dependents INTEGER NOT NULL DEFAULT 0 CHECK (max_dependents >= 0),
  eligibility JSONB NOT NULL DEFAULT '{}'::jsonb,
  coverage_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  network_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  status corporate_benefit_program_status NOT NULL DEFAULT 'active',
  created_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT corporate_benefit_program_dates_chk CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_corp_benefit_programs_corp
  ON corporate_benefit_programs(corporate_id, status, category);

CREATE INDEX IF NOT EXISTS idx_corp_benefit_programs_active_dates
  ON corporate_benefit_programs(corporate_id, start_date, end_date)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS employee_benefit_wallets (
  id BIGSERIAL PRIMARY KEY,
  corporate_id BIGINT NOT NULL REFERENCES corporates(id) ON DELETE CASCADE,
  program_id BIGINT NOT NULL REFERENCES corporate_benefit_programs(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  employee_id VARCHAR(100),
  coverage_period_start DATE NOT NULL,
  coverage_period_end DATE,
  allocated_limit NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (allocated_limit >= 0),
  utilized_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (utilized_amount >= 0),
  reserved_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (reserved_amount >= 0),
  status corporate_benefit_wallet_status NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT employee_benefit_wallet_dates_chk CHECK (coverage_period_end IS NULL OR coverage_period_end >= coverage_period_start),
  CONSTRAINT employee_benefit_wallet_amounts_chk CHECK (utilized_amount + reserved_amount <= allocated_limit)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_employee_benefit_wallet_user_period
  ON employee_benefit_wallets(program_id, user_id, coverage_period_start)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_employee_benefit_wallet_employee_period
  ON employee_benefit_wallets(program_id, employee_id, coverage_period_start)
  WHERE user_id IS NULL AND employee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_employee_benefit_wallets_corp
  ON employee_benefit_wallets(corporate_id, status, program_id);

CREATE INDEX IF NOT EXISTS idx_employee_benefit_wallets_user
  ON employee_benefit_wallets(user_id, status);

CREATE INDEX IF NOT EXISTS idx_employee_benefit_wallets_employee
  ON employee_benefit_wallets(corporate_id, employee_id);

CREATE TABLE IF NOT EXISTS corporate_benefit_wallet_transactions (
  id BIGSERIAL PRIMARY KEY,
  wallet_id BIGINT NOT NULL REFERENCES employee_benefit_wallets(id) ON DELETE CASCADE,
  transaction_type corporate_benefit_transaction_type NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  previous_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  new_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  reference_type VARCHAR(80),
  reference_id VARCHAR(120),
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_corp_benefit_wallet_tx_wallet
  ON corporate_benefit_wallet_transactions(wallet_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_corp_benefit_wallet_tx_reference
  ON corporate_benefit_wallet_transactions(reference_type, reference_id)
  WHERE reference_type IS NOT NULL AND reference_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS corporate_benefit_authorizations (
  id BIGSERIAL PRIMARY KEY,
  corporate_id BIGINT NOT NULL REFERENCES corporates(id) ON DELETE CASCADE,
  wallet_id BIGINT NOT NULL REFERENCES employee_benefit_wallets(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  employee_id VARCHAR(100),
  category corporate_benefit_category NOT NULL,
  requested_amount NUMERIC(12,2) NOT NULL CHECK (requested_amount > 0),
  approved_amount NUMERIC(12,2) CHECK (approved_amount IS NULL OR approved_amount >= 0),
  provider_type VARCHAR(40),
  provider_id BIGINT,
  provider_name VARCHAR(255),
  service_type VARCHAR(160),
  status corporate_benefit_authorization_status NOT NULL DEFAULT 'submitted',
  authorization_code VARCHAR(60) NOT NULL UNIQUE,
  valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_to TIMESTAMPTZ,
  settlement_amount NUMERIC(12,2),
  settled_at TIMESTAMPTZ,
  settled_by BIGINT,
  cancelled_at TIMESTAMPTZ,
  cancelled_by BIGINT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE corporate_benefit_authorizations
  ADD COLUMN IF NOT EXISTS settlement_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS settled_by BIGINT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by BIGINT;

CREATE INDEX IF NOT EXISTS idx_corp_benefit_auth_corp
  ON corporate_benefit_authorizations(corporate_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_corp_benefit_auth_wallet
  ON corporate_benefit_authorizations(wallet_id, status);

CREATE INDEX IF NOT EXISTS idx_corp_benefit_auth_user
  ON corporate_benefit_authorizations(user_id, created_at DESC);

COMMENT ON TABLE corporate_benefit_programs IS 'Employer-funded corporate wellness/OPD benefit programs configured by HR or Mediqzy admins.';
COMMENT ON TABLE employee_benefit_wallets IS 'Per-employee employer-funded rupee wallet balances for corporate benefit programs.';
COMMENT ON TABLE corporate_benefit_wallet_transactions IS 'Auditable ledger for corporate benefit wallet allocations, reservations, settlements, and reversals.';
COMMENT ON TABLE corporate_benefit_authorizations IS 'Cashless/pre-authorization requests against employee corporate benefit wallets.';
