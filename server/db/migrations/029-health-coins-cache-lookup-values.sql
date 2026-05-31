-- =============================================================================
-- MIGRATION 029: Health Coins Balance Cache + Lookup Values Table
-- =============================================================================
-- Part A: Health Coins denormalized balance cache
--   Problem: Every wallet display requires SUM() over potentially thousands of
--            micro-transactions → expensive at scale.
--   Solution: `current_balance` column with trigger-based sync.
--
-- Part B: Lookup Values table
--   Problem: ENUM fields in models (organization_type, gender, status) require
--            a migration to add new values.
--   Solution: `lookup_values` table — designer/PM configurable via admin API.
-- =============================================================================

-- =============================================================================
-- PART A: HEALTH COINS BALANCE CACHE
-- =============================================================================

-- ── 1. Wallet balance cache ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_wallets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  organization_id INTEGER,

  -- Denormalized balance (maintained by trigger — never update directly)
  current_balance DECIMAL(12, 2) DEFAULT 0.00 NOT NULL,

  -- Lifetime stats (cached aggregates)
  total_earned    DECIMAL(12, 4) DEFAULT 0.00 NOT NULL,
  total_spent     DECIMAL(12, 4) DEFAULT 0.00 NOT NULL,
  total_expired   DECIMAL(12, 4) DEFAULT 0.00 NOT NULL,

  currency        VARCHAR(10) DEFAULT 'COINS',
  is_active       BOOLEAN DEFAULT TRUE,
  last_transaction_at TIMESTAMPTZ,

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallets_user ON user_wallets (user_id);
CREATE INDEX IF NOT EXISTS idx_wallets_org  ON user_wallets (organization_id);

-- ── 2. Health coins transactions ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS health_coins_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id       UUID NOT NULL REFERENCES user_wallets(id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL,
  organization_id INTEGER,

  -- Transaction details
  transaction_type VARCHAR(30) NOT NULL
    CHECK (transaction_type IN (
      'EARNED_ACTIVITY',      -- steps, workouts, streaks
      'EARNED_APPOINTMENT',   -- completed consultation
      'EARNED_ASSESSMENT',    -- completed health assessment
      'EARNED_REFERRAL',      -- referral bonus
      'EARNED_MILESTONE',     -- health goal achievement
      'EARNED_ADMIN',         -- manual admin credit
      'SPENT_CONSULTATION',   -- used for booking
      'SPENT_PRODUCT',        -- redeemed for product
      'SPENT_PREMIUM',        -- upgraded plan
      'EXPIRED',              -- coins expired
      'ADJUSTED',             -- correction
      'TRANSFERRED'           -- org-to-user transfer
    )),

  amount          DECIMAL(10, 2) NOT NULL,
  balance_before  DECIMAL(12, 2) NOT NULL,
  balance_after   DECIMAL(12, 2) NOT NULL,

  -- Source reference
  reference_type  VARCHAR(50),   -- 'appointment', 'health_goal', 'activity_log'
  reference_id    VARCHAR(100),  -- ID of the source record

  description     TEXT,
  expires_at      TIMESTAMPTZ,
  metadata        JSONB DEFAULT '{}',

  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coins_txn_wallet   ON health_coins_transactions (wallet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coins_txn_user     ON health_coins_transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coins_txn_expires  ON health_coins_transactions (expires_at) WHERE expires_at IS NOT NULL;

-- ── 3. Trigger: sync balance cache ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION sync_wallet_balance() RETURNS TRIGGER AS $$
BEGIN
  UPDATE user_wallets
  SET
    current_balance = NEW.balance_after,
    total_earned    = total_earned + CASE WHEN NEW.amount > 0 THEN NEW.amount ELSE 0 END,
    total_spent     = total_spent  + CASE WHEN NEW.amount < 0 AND NEW.transaction_type NOT LIKE 'EXPIRED%' THEN ABS(NEW.amount) ELSE 0 END,
    total_expired   = total_expired + CASE WHEN NEW.transaction_type = 'EXPIRED' THEN ABS(NEW.amount) ELSE 0 END,
    last_transaction_at = NOW(),
    updated_at      = NOW()
  WHERE id = NEW.wallet_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS health_coins_balance_sync ON health_coins_transactions;
CREATE TRIGGER health_coins_balance_sync
  AFTER INSERT ON health_coins_transactions
  FOR EACH ROW EXECUTE FUNCTION sync_wallet_balance();

-- ── 4. Wallet auto-creation trigger ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION auto_create_wallet() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_wallets (user_id, organization_id)
  VALUES (NEW.id, NEW.organization_id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_create_wallet_trigger ON users;
CREATE TRIGGER auto_create_wallet_trigger
  AFTER INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION auto_create_wallet();

-- Backfill wallets for existing users
INSERT INTO user_wallets (user_id, organization_id)
SELECT id, organization_id FROM users
ON CONFLICT (user_id) DO NOTHING;

-- =============================================================================
-- PART B: LOOKUP VALUES TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS lookup_values (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       INTEGER,          -- NULL = global (platform-level), else tenant-specific

  -- Classification
  category        VARCHAR(80) NOT NULL,  -- e.g. 'organization_type', 'gender', 'blood_type'
  code            VARCHAR(50) NOT NULL,  -- e.g. 'hospital', 'Male', 'A+'
  label           VARCHAR(200) NOT NULL, -- Display label (may be translated)
  label_hi        VARCHAR(200),          -- Hindi label
  label_mr        VARCHAR(200),          -- Marathi label
  label_ta        VARCHAR(200),          -- Tamil label

  -- Ordering and display
  sort_order      SMALLINT DEFAULT 0,
  icon_code       VARCHAR(50),           -- Material icon or emoji
  color_code      VARCHAR(10),           -- hex colour for UI chips

  -- Metadata
  is_active       BOOLEAN DEFAULT TRUE,
  is_system       BOOLEAN DEFAULT FALSE, -- system values cannot be deleted
  metadata        JSONB DEFAULT '{}',

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (tenant_id, category, code)
);

CREATE INDEX IF NOT EXISTS idx_lookup_category ON lookup_values (category, is_active);
CREATE INDEX IF NOT EXISTS idx_lookup_tenant   ON lookup_values (tenant_id, category);

-- ── Seed global lookup values ─────────────────────────────────────────────────

INSERT INTO lookup_values (category, code, label, sort_order, is_system) VALUES
-- Organization types
('organization_type','hospital',         'Hospital',            1,  TRUE),
('organization_type','clinic',           'Clinic',              2,  TRUE),
('organization_type','corporate',        'Corporate',           3,  TRUE),
('organization_type','lab',              'Diagnostic Lab',      4,  TRUE),
('organization_type','pharmacy',         'Pharmacy',            5,  TRUE),
('organization_type','insurance_broker', 'Insurance Broker',    6,  TRUE),
('organization_type','tpa',              'Third Party Admin',   7,  TRUE),
('organization_type','ngo',              'NGO / Trust',         8,  TRUE),
('organization_type','psu',              'PSU / Government',    9,  TRUE),
('organization_type','homecare',         'Home Care',           10, TRUE),
('organization_type','ambulance',        'Ambulance Service',   11, TRUE),
('organization_type','individual',       'Individual',          12, TRUE),
-- Gender
('gender','Male',   'Male',   1, TRUE),
('gender','Female', 'Female', 2, TRUE),
('gender','Other',  'Other',  3, TRUE),
-- Blood types
('blood_type','A+',  'A Positive',  1, TRUE),
('blood_type','A-',  'A Negative',  2, TRUE),
('blood_type','B+',  'B Positive',  3, TRUE),
('blood_type','B-',  'B Negative',  4, TRUE),
('blood_type','AB+', 'AB Positive', 5, TRUE),
('blood_type','AB-', 'AB Negative', 6, TRUE),
('blood_type','O+',  'O Positive',  7, TRUE),
('blood_type','O-',  'O Negative',  8, TRUE),
-- Consultation types
('consultation_type','in_person', 'In-Person', 1, TRUE),
('consultation_type','video',     'Video Call', 2, TRUE),
('consultation_type','audio',     'Audio Call', 3, TRUE),
('consultation_type','chat',      'Chat',       4, TRUE),
-- Appointment status
('appointment_status','scheduled',   'Scheduled',   1, TRUE),
('appointment_status','confirmed',   'Confirmed',   2, TRUE),
('appointment_status','completed',   'Completed',   3, TRUE),
('appointment_status','cancelled',   'Cancelled',   4, TRUE),
('appointment_status','no_show',     'No Show',     5, TRUE),
('appointment_status','rescheduled', 'Rescheduled', 6, TRUE),
-- Allergy severity
('allergy_severity','MILD',             'Mild',             1, TRUE),
('allergy_severity','MODERATE',         'Moderate',         2, TRUE),
('allergy_severity','SEVERE',           'Severe',           3, TRUE),
('allergy_severity','LIFE_THREATENING', 'Life-Threatening', 4, TRUE),
-- Consent types
('consent_type','DATA_PROCESSING', 'Data Processing Consent',  1, TRUE),
('consent_type','SENSITIVE_DATA',  'Sensitive Data Consent',   2, TRUE),
('consent_type','TELEMEDICINE',    'Telemedicine Consent',     3, TRUE),
('consent_type','RESEARCH',        'Research Participation',   4, TRUE),
('consent_type','MARKETING',       'Marketing Communications', 5, TRUE)
ON CONFLICT (tenant_id, category, code) DO NOTHING;
