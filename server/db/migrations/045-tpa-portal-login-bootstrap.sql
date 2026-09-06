-- TPA portal login bootstrap
-- Fixes:
--   1. Adds the is_active column referenced by TPA middleware/model.
--   2. Ensures the documented demo TPA login exists:
--      tpa@mediczy.com / TPA123
--
-- This migration is intentionally idempotent and does not overwrite the password
-- if a real account with the same email already exists.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE IF EXISTS tpas
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

UPDATE tpas
SET is_active = TRUE
WHERE is_active IS NULL;

INSERT INTO tpas (
  tpa_name,
  contact_person_name,
  email,
  password,
  phone_number,
  irdai_license_number,
  office_address,
  city,
  state,
  pincode,
  network_hospitals,
  service_areas,
  claims_processed,
  average_settlement_time,
  status,
  is_active,
  is_verified,
  metadata,
  created_at,
  updated_at
)
SELECT
  'MediQzy Demo TPA',
  'TPA Admin',
  'tpa@mediczy.com',
  crypt('TPA123', gen_salt('bf', 10)),
  '+91-90000-00000',
  'DEMO-TPA-IRDAI',
  'MediQzy TPA Operations',
  'Hyderabad',
  'Telangana',
  '500001',
  '[]'::jsonb,
  '["Corporate Claims", "Pre-Authorization", "Cashless Processing"]'::jsonb,
  0,
  0,
  'active',
  TRUE,
  TRUE,
  jsonb_build_object(
    'seededBy', '045-tpa-portal-login-bootstrap',
    'portal', 'tpa',
    'demoCredentials', TRUE
  ),
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM tpas WHERE lower(email) = lower('tpa@mediczy.com')
);

UPDATE tpas
SET
  status = 'active',
  is_active = TRUE,
  updated_at = NOW()
WHERE lower(email) = lower('tpa@mediczy.com')
  AND (status IS DISTINCT FROM 'active' OR is_active IS DISTINCT FROM TRUE);
