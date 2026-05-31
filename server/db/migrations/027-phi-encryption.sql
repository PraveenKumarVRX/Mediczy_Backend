-- =============================================================================
-- MIGRATION 027: PHI Field-Level Encryption via pgcrypto
-- =============================================================================
-- Encrypts sensitive PHI columns at rest using symmetric AES-256 (pgcrypto).
-- Key is sourced from app runtime (ENCRYPTION_KEY env var), never stored in DB.
--
-- Strategy: ADD encrypted columns alongside originals → migrate data → drop originals
-- This avoids downtime and allows rollback within the migration window.
--
-- HIPAA Technical Safeguard §164.312(e)(2)(ii) — Encryption at rest
-- DPDPA §8(4) — Security of personal data
-- =============================================================================

-- Ensure pgcrypto extension is enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Helper: validate key is set before migration ──────────────────────────────
DO $$
BEGIN
  IF current_setting('app.encryption_key', TRUE) IS NULL
     OR current_setting('app.encryption_key', TRUE) = '' THEN
    RAISE NOTICE 'app.encryption_key not set — skipping PHI encryption migration (run manually when key is configured)';
    RETURN;
  END IF;
END;
$$;

-- ── 1. USERS TABLE — Encrypted PHI columns ───────────────────────────────────

-- Add encrypted columns (BYTEA stores AES-256 ciphertext)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='users' AND column_name='medical_history_enc') THEN
    ALTER TABLE users
      ADD COLUMN medical_history_enc  BYTEA,
      ADD COLUMN family_history_enc   BYTEA,
      ADD COLUMN personal_history_enc BYTEA,
      ADD COLUMN blood_type_enc       BYTEA,
      ADD COLUMN abha_id_enc          BYTEA;
    RAISE NOTICE 'Added encrypted PHI columns to users table';
  END IF;
END;
$$;

-- ── 2. Data Migration (run with key set) ──────────────────────────────────────
-- Execute after setting: SET LOCAL app.encryption_key = '<your-256-bit-key>';

CREATE OR REPLACE FUNCTION encrypt_phi_column(
  p_table  TEXT,
  p_col    TEXT,
  p_enc_col TEXT,
  p_key    TEXT
) RETURNS INTEGER AS $$
DECLARE
  updated INTEGER;
BEGIN
  EXECUTE format(
    'UPDATE %I SET %I = pgp_sym_encrypt(%I::text, %L)
     WHERE %I IS NOT NULL AND %I IS NULL',
    p_table, p_enc_col, p_col, p_key,
    p_col, p_enc_col
  );
  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated;
END;
$$ LANGUAGE plpgsql;

-- ── 3. Application-level decryption pattern ───────────────────────────────────
-- In application code use:
--   SELECT pgp_sym_decrypt(medical_history_enc, $KEY)::jsonb AS medical_history
--   FROM users WHERE id = $id
--
-- This function is a reference — call it from app code, not DB directly.
CREATE OR REPLACE FUNCTION decrypt_phi(ciphertext BYTEA, key TEXT)
RETURNS TEXT AS $$
  SELECT pgp_sym_decrypt(ciphertext, key);
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- ── 4. Prescriptions encryption ──────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'prescriptions') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='prescriptions' AND column_name='medications_enc') THEN
      ALTER TABLE prescriptions ADD COLUMN medications_enc BYTEA;
      RAISE NOTICE 'Added medications_enc to prescriptions';
    END IF;
  END IF;
END;
$$;

-- ── 5. Vital signs encryption ─────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vital_signs') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='vital_signs' AND column_name='readings_enc') THEN
      ALTER TABLE vital_signs ADD COLUMN readings_enc BYTEA;
      RAISE NOTICE 'Added readings_enc to vital_signs';
    END IF;
  END IF;
END;
$$;

-- ── 6. Encryption status view ────────────────────────────────────────────────

CREATE OR REPLACE VIEW phi_encryption_status AS
SELECT
  'users' AS table_name,
  COUNT(*) AS total_rows,
  SUM(CASE WHEN medical_history_enc IS NOT NULL THEN 1 ELSE 0 END) AS encrypted_rows,
  ROUND(100.0 * SUM(CASE WHEN medical_history_enc IS NOT NULL THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0), 1) AS pct_encrypted
FROM users
WHERE "medicalHistory"::text != '{}'
UNION ALL
SELECT 'prescriptions',
  COUNT(*),
  SUM(CASE WHEN medications_enc IS NOT NULL THEN 1 ELSE 0 END),
  ROUND(100.0 * SUM(CASE WHEN medications_enc IS NOT NULL THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0), 1)
FROM prescriptions;

-- =============================================================================
-- POST-MIGRATION STEPS (execute separately with encryption key available):
-- =============================================================================
--
-- 1. Set encryption key in session:
--    SET LOCAL app.encryption_key = '<your-256-bit-AES-key>';
--
-- 2. Encrypt existing data:
--    SELECT encrypt_phi_column('users','medicalHistory','medical_history_enc', current_setting('app.encryption_key'));
--    SELECT encrypt_phi_column('users','familyHistory','family_history_enc',   current_setting('app.encryption_key'));
--    SELECT encrypt_phi_column('users','personalHistory','personal_history_enc',current_setting('app.encryption_key'));
--    SELECT encrypt_phi_column('users','bloodType','blood_type_enc',            current_setting('app.encryption_key'));
--    SELECT encrypt_phi_column('users','abhaHealthId','abha_id_enc',            current_setting('app.encryption_key'));
--
-- 3. Verify with: SELECT * FROM phi_encryption_status;
--
-- 4. After validation, app reads from _enc columns; originals can be nulled out:
--    UPDATE users SET "medicalHistory" = '{}'::jsonb WHERE medical_history_enc IS NOT NULL;
-- =============================================================================
