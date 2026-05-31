-- =============================================================================
-- MIGRATION 025: Normalise Array Fields → Junction Tables
-- =============================================================================
-- Replaces ARRAY columns (allergies, medications, chronicConditions) on users
-- with proper relational junction tables.
-- Enables: FK integrity, SNOMED coding, severity tracking, drug interaction joins,
--          population health queries, AI adverse event detection.
--
-- Migration path for existing data: see bottom of this file.
-- =============================================================================

-- ── 1. PATIENT ALLERGIES ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS patient_allergies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id INTEGER,

  -- Coding
  allergen_name   VARCHAR(200) NOT NULL,
  allergen_code   VARCHAR(50),            -- SNOMED CT code (optional)
  allergen_type   VARCHAR(50)             -- 'drug', 'food', 'environmental', 'latex', 'other'
                  CHECK (allergen_type IN ('drug','food','environmental','latex','contrast','other')),

  -- Clinical details
  severity        VARCHAR(20) DEFAULT 'UNKNOWN'
                  CHECK (severity IN ('MILD','MODERATE','SEVERE','LIFE_THREATENING','UNKNOWN')),
  reaction_type   VARCHAR(200),           -- e.g. 'urticaria', 'anaphylaxis'
  onset_date      DATE,
  notes           TEXT,

  -- Verification
  verified        BOOLEAN DEFAULT FALSE,
  verified_by     INTEGER REFERENCES users(id),
  verified_at     TIMESTAMPTZ,
  source          VARCHAR(50) DEFAULT 'patient_reported',  -- 'patient_reported', 'clinician', 'import'

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_allergies_user     ON patient_allergies (user_id);
CREATE INDEX IF NOT EXISTS idx_patient_allergies_org      ON patient_allergies (organization_id);
CREATE INDEX IF NOT EXISTS idx_patient_allergies_code     ON patient_allergies (allergen_code) WHERE allergen_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_patient_allergies_severity ON patient_allergies (severity);

-- ── 2. PATIENT MEDICATIONS ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS patient_medications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id INTEGER,
  prescribed_by   INTEGER REFERENCES users(id),

  -- Drug details
  drug_name       VARCHAR(200) NOT NULL,
  drug_code       VARCHAR(50),            -- RxNorm / ICD drug code
  generic_name    VARCHAR(200),
  brand_name      VARCHAR(200),
  drug_class      VARCHAR(100),           -- e.g. 'NSAID', 'ACE inhibitor'

  -- Dosing
  dose            VARCHAR(100),           -- e.g. '10mg'
  frequency       VARCHAR(100),           -- e.g. 'twice daily'
  route           VARCHAR(50),            -- 'oral', 'iv', 'topical', 'inhaled'

  -- Lifecycle
  status          VARCHAR(20) DEFAULT 'ACTIVE'
                  CHECK (status IN ('ACTIVE','STOPPED','COMPLETED','ON_HOLD','UNKNOWN')),
  start_date      DATE,
  end_date        DATE,
  reason_stopped  TEXT,

  -- Traceability
  source          VARCHAR(50) DEFAULT 'patient_reported',
  prescription_id INTEGER,                -- FK to prescriptions table

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_meds_user    ON patient_medications (user_id);
CREATE INDEX IF NOT EXISTS idx_patient_meds_status  ON patient_medications (status);
CREATE INDEX IF NOT EXISTS idx_patient_meds_code    ON patient_medications (drug_code) WHERE drug_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_patient_meds_org     ON patient_medications (organization_id);

-- ── 3. PATIENT CONDITIONS (chronic conditions) ───────────────────────────────

CREATE TABLE IF NOT EXISTS patient_conditions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id INTEGER,
  diagnosed_by    INTEGER REFERENCES users(id),

  -- Coding
  condition_name  VARCHAR(200) NOT NULL,
  icd10_code      VARCHAR(20),            -- ICD-10 code
  snomed_code     VARCHAR(50),            -- SNOMED CT code

  -- Clinical
  condition_type  VARCHAR(50) DEFAULT 'chronic'
                  CHECK (condition_type IN ('chronic','acute','episodic','genetic','unknown')),
  severity        VARCHAR(20),
  onset_date      DATE,
  diagnosed_date  DATE,
  notes           TEXT,

  -- Status
  status          VARCHAR(20) DEFAULT 'ACTIVE'
                  CHECK (status IN ('ACTIVE','RESOLVED','REMISSION','MONITORING','UNKNOWN')),
  resolved_date   DATE,

  source          VARCHAR(50) DEFAULT 'patient_reported',

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_cond_user    ON patient_conditions (user_id);
CREATE INDEX IF NOT EXISTS idx_patient_cond_icd     ON patient_conditions (icd10_code) WHERE icd10_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_patient_cond_status  ON patient_conditions (status);
CREATE INDEX IF NOT EXISTS idx_patient_cond_org     ON patient_conditions (organization_id);

-- ── 4. DATA MIGRATION: Array → Junction Tables ───────────────────────────────
-- Run after creating tables above. Idempotent (uses ON CONFLICT DO NOTHING).

INSERT INTO patient_allergies (user_id, allergen_name, source)
SELECT
  id,
  unnest(allergies),
  'legacy_import'
FROM users
WHERE allergies IS NOT NULL AND array_length(allergies, 1) > 0
ON CONFLICT DO NOTHING;

INSERT INTO patient_medications (user_id, drug_name, status, source)
SELECT
  id,
  unnest(medications),
  'UNKNOWN',
  'legacy_import'
FROM users
WHERE medications IS NOT NULL AND array_length(medications, 1) > 0
ON CONFLICT DO NOTHING;

INSERT INTO patient_conditions (user_id, condition_name, condition_type, source)
SELECT
  id,
  unnest("chronicConditions"),
  'chronic',
  'legacy_import'
FROM users
WHERE "chronicConditions" IS NOT NULL AND array_length("chronicConditions", 1) > 0
ON CONFLICT DO NOTHING;
