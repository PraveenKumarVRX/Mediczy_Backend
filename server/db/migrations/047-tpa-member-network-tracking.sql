-- TPA native member eligibility, e-card verification, network intelligence, and public claim tracking.
-- Date: 2026-09-06

CREATE TABLE IF NOT EXISTS tpa_members (
  id BIGSERIAL PRIMARY KEY,
  member_id VARCHAR(64) NOT NULL UNIQUE,
  tpa_id INTEGER,
  employee_id VARCHAR(64),
  employee_name VARCHAR(255) NOT NULL,
  relation VARCHAR(40) NOT NULL DEFAULT 'self',
  corporate_name VARCHAR(255),
  policy_number VARCHAR(100) NOT NULL,
  policy_start_date DATE,
  policy_end_date DATE,
  coverage_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  used_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  room_rent_limit NUMERIC(14,2),
  co_pay_percent NUMERIC(6,2) NOT NULL DEFAULT 0,
  exclusions JSONB NOT NULL DEFAULT '[]'::jsonb,
  dependents JSONB NOT NULL DEFAULT '[]'::jsonb,
  phone_last4 VARCHAR(4),
  status VARCHAR(40) NOT NULL DEFAULT 'active',
  ecard_verification_code VARCHAR(80) UNIQUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tpa_network_hospitals (
  id BIGSERIAL PRIMARY KEY,
  hospital_code VARCHAR(64) NOT NULL UNIQUE,
  tpa_id INTEGER,
  hospital_name VARCHAR(255) NOT NULL,
  city VARCHAR(120),
  state VARCHAR(120),
  pincode VARCHAR(12),
  address TEXT,
  specialties JSONB NOT NULL DEFAULT '[]'::jsonb,
  cashless_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  preferred_provider BOOLEAN NOT NULL DEFAULT FALSE,
  tariff_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  contact_phone VARCHAR(40),
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  status VARCHAR(40) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tpa_public_claim_access (
  id BIGSERIAL PRIMARY KEY,
  claim_id BIGINT NOT NULL REFERENCES tpa_claims(id) ON DELETE CASCADE,
  public_token VARCHAR(96) NOT NULL UNIQUE,
  verification_hint VARCHAR(120),
  allowed_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tpa_members_tpa_policy ON tpa_members (tpa_id, policy_number);
CREATE INDEX IF NOT EXISTS idx_tpa_members_member_tpa ON tpa_members (member_id, tpa_id);
CREATE INDEX IF NOT EXISTS idx_tpa_network_hospitals_tpa_city ON tpa_network_hospitals (tpa_id, city);
CREATE INDEX IF NOT EXISTS idx_tpa_network_hospitals_cashless ON tpa_network_hospitals (cashless_enabled, preferred_provider);
CREATE INDEX IF NOT EXISTS idx_tpa_public_claim_access_claim ON tpa_public_claim_access (claim_id);
