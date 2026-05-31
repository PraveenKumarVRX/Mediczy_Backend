-- =============================================================================
-- MIGRATION 026: Anonymous Patient Registry + Consent Management
-- =============================================================================
-- Anonymous patients: walk-in care continuity without a registered account
-- Consent management: DPDPA (India) + HIPAA compliance
-- =============================================================================

-- ── 1. ANONYMOUS PATIENTS ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS anonymous_patients (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     INTEGER NOT NULL,
  organization_type   VARCHAR(50),

  -- De-identified token (hash of phone+org+date — for re-identification via ABHA)
  identity_token      VARCHAR(128) UNIQUE NOT NULL,

  -- Minimal demographic (not stored if not provided)
  age_range           VARCHAR(20),        -- e.g. '30-40' (not exact DOB)
  gender              VARCHAR(10),

  -- ABHA linkage (for future re-identification if patient consents)
  abha_link_token     VARCHAR(128),       -- encrypted reference to ABHA ID
  abha_linked_at      TIMESTAMPTZ,
  linked_user_id      INTEGER REFERENCES users(id),  -- set when account is created

  -- Visit metadata
  first_visit_at      TIMESTAMPTZ DEFAULT NOW(),
  last_visit_at       TIMESTAMPTZ DEFAULT NOW(),
  visit_count         INTEGER DEFAULT 1,

  -- PHI retention policy
  purge_after         TIMESTAMPTZ,        -- auto-delete after this date per DPDPA
  metadata            JSONB DEFAULT '{}',

  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anon_patients_org     ON anonymous_patients (organization_id);
CREATE INDEX IF NOT EXISTS idx_anon_patients_token   ON anonymous_patients (identity_token);
CREATE INDEX IF NOT EXISTS idx_anon_patients_linked  ON anonymous_patients (linked_user_id) WHERE linked_user_id IS NOT NULL;

-- ── 2. CONSENT MANAGEMENT ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS patient_consents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Subject — either registered user or anonymous patient
  user_id             INTEGER REFERENCES users(id) ON DELETE CASCADE,
  anonymous_patient_id UUID REFERENCES anonymous_patients(id) ON DELETE CASCADE,
  organization_id     INTEGER,

  -- Consent classification
  consent_type        VARCHAR(80) NOT NULL
                      CHECK (consent_type IN (
                        'DATA_PROCESSING',          -- DPDPA §4 — general data processing
                        'SENSITIVE_DATA',            -- DPDPA §9 — health/biometric data
                        'TELEMEDICINE',              -- Telemedicine Practice Guidelines 2020
                        'RESEARCH',                  -- ICMR ethical guidelines
                        'MARKETING',                 -- DPDPA §6 — promotional comms
                        'DATA_SHARING',              -- sharing with third parties
                        'AI_TRAINING',               -- use of de-identified data for AI
                        'ABHA_LINKING',              -- ABDM health ID linkage
                        'EMERGENCY_OVERRIDE'         -- implied consent in emergencies
                      )),
  consent_category    VARCHAR(30) DEFAULT 'explicit'
                      CHECK (consent_category IN ('explicit','implicit','emergency')),

  -- Consent state
  consented           BOOLEAN NOT NULL,
  consented_at        TIMESTAMPTZ,
  withdrawn_at        TIMESTAMPTZ,
  expires_at          TIMESTAMPTZ,

  -- Policy version
  policy_version      VARCHAR(20) NOT NULL DEFAULT '1.0',
  policy_url          TEXT,

  -- Evidence
  ip_address          VARCHAR(45),
  user_agent          TEXT,
  consent_method      VARCHAR(50) DEFAULT 'digital'
                      CHECK (consent_method IN ('digital','written','verbal','implied')),
  witness_id          INTEGER REFERENCES users(id),

  -- Audit
  created_by          INTEGER REFERENCES users(id),
  notes               TEXT,
  metadata            JSONB DEFAULT '{}',

  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),

  -- Enforce: at least one of user_id or anonymous_patient_id must be set
  CONSTRAINT consent_subject_check CHECK (
    user_id IS NOT NULL OR anonymous_patient_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_consents_user        ON patient_consents (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_consents_anon        ON patient_consents (anonymous_patient_id) WHERE anonymous_patient_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_consents_type        ON patient_consents (consent_type, consented);
CREATE INDEX IF NOT EXISTS idx_consents_org         ON patient_consents (organization_id);
CREATE INDEX IF NOT EXISTS idx_consents_expires     ON patient_consents (expires_at) WHERE expires_at IS NOT NULL;

-- ── 3. CONSENT HISTORY (audit trail — immutable) ─────────────────────────────

CREATE TABLE IF NOT EXISTS patient_consent_history (
  id              BIGSERIAL PRIMARY KEY,
  consent_id      UUID NOT NULL REFERENCES patient_consents(id),
  user_id         INTEGER,
  action          VARCHAR(20) NOT NULL CHECK (action IN ('granted','withdrawn','expired','updated')),
  old_state       JSONB,
  new_state       JSONB,
  changed_by      INTEGER REFERENCES users(id),
  ip_address      VARCHAR(45),
  reason          TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consent_history_consent ON patient_consent_history (consent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consent_history_user    ON patient_consent_history (user_id, created_at DESC);

-- Trigger: auto-log consent changes
CREATE OR REPLACE FUNCTION consent_audit_trigger_fn() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    INSERT INTO patient_consent_history (consent_id, user_id, action, old_state, new_state)
    VALUES (
      NEW.id,
      NEW.user_id,
      CASE
        WHEN OLD.consented = TRUE AND NEW.consented = FALSE THEN 'withdrawn'
        WHEN OLD.consented = FALSE AND NEW.consented = TRUE THEN 'granted'
        ELSE 'updated'
      END,
      row_to_json(OLD)::JSONB,
      row_to_json(NEW)::JSONB
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS consent_audit_trigger ON patient_consents;
CREATE TRIGGER consent_audit_trigger
  AFTER UPDATE ON patient_consents
  FOR EACH ROW EXECUTE FUNCTION consent_audit_trigger_fn();

-- ── 4. DATA PURGE POLICY (DPDPA Right to Erasure) ───────────────────────────

CREATE TABLE IF NOT EXISTS data_deletion_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             INTEGER REFERENCES users(id),
  anonymous_patient_id UUID REFERENCES anonymous_patients(id),
  organization_id     INTEGER,

  request_type        VARCHAR(30) NOT NULL
                      CHECK (request_type IN ('erasure','portability','correction','access')),
  status              VARCHAR(20) DEFAULT 'pending'
                      CHECK (status IN ('pending','in_progress','completed','rejected','partial')),

  requested_at        TIMESTAMPTZ DEFAULT NOW(),
  deadline_at         TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
  completed_at        TIMESTAMPTZ,
  rejection_reason    TEXT,

  -- What was deleted / exported
  tables_affected     TEXT[],
  records_deleted     INTEGER DEFAULT 0,
  export_path         TEXT,         -- S3 path for portability requests

  processed_by        INTEGER REFERENCES users(id),
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deletion_user     ON data_deletion_requests (user_id);
CREATE INDEX IF NOT EXISTS idx_deletion_status   ON data_deletion_requests (status);
CREATE INDEX IF NOT EXISTS idx_deletion_deadline ON data_deletion_requests (deadline_at) WHERE status = 'pending';
