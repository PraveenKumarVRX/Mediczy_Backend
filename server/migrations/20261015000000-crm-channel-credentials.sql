-- Tenant-owned CRM channel credentials. Secrets are encrypted by the
-- application with CRM_CREDENTIAL_ENCRYPTION_KEY and never returned by API.
ALTER TABLE crm_marketing_integrations ADD COLUMN IF NOT EXISTS encrypted_credentials TEXT;
ALTER TABLE crm_marketing_integrations ADD COLUMN IF NOT EXISTS credentials_updated_at TIMESTAMPTZ;
ALTER TABLE crm_marketing_integrations ADD COLUMN IF NOT EXISTS credentials_fingerprint VARCHAR(64);
CREATE INDEX IF NOT EXISTS idx_crm_marketing_integrations_communication
  ON crm_marketing_integrations (tenant_id, integration_type, provider);
