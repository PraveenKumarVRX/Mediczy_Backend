-- ============================================================================
-- Migration: 001-api-credentials.sql
-- Purpose: Create API Credentials Management System for SmartHealth RN
-- Date: February 8, 2026
-- Status: Production-Ready
-- ============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- TABLE 1: api_credentials
-- Purpose: Store API client credentials with lifecycle management
-- ============================================================================

CREATE TABLE IF NOT EXISTS api_credentials (
  -- Primary key and identifiers
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  corporate_id UUID REFERENCES corporates(id) ON DELETE SET NULL,
  
  -- Credential identifiers (OAuth-like)
  client_id VARCHAR(100) NOT NULL UNIQUE,  -- Format: cred_smarthealth_abc123xyz789
  client_secret_hash VARCHAR(255) NOT NULL,  -- Bcrypt hash, never plain text
  
  -- Metadata and naming
  name VARCHAR(255) NOT NULL,
  description TEXT,
  integration_type VARCHAR(50) NOT NULL DEFAULT 'smarthealth_rn_mobile',
  
  -- Version control (tracks rotation history)
  version INTEGER NOT NULL DEFAULT 1,
  
  -- Scopes and permissions (JSON array)
  scopes JSONB NOT NULL DEFAULT '["mobile:auth", "doctors:search", "appointments:view"]',
  
  -- Lifecycle dates
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  
  last_used_at TIMESTAMP,
  last_rotated_at TIMESTAMP,
  expires_at TIMESTAMP,
  rotation_required_at TIMESTAMP,
  
  -- Rotation grace period tracking
  rotation_scheduled_date TIMESTAMP,
  new_client_secret_hash VARCHAR(255),  -- Temporarily holds new secret during grace period
  grace_period_ends_at TIMESTAMP,
  
  -- Status tracking
  status VARCHAR(20) NOT NULL DEFAULT 'active',  -- active, expired, rotated, revoked
  is_active BOOLEAN NOT NULL DEFAULT true,  -- Quick lookup for active credentials
  
  -- Revocation details
  revoked_at TIMESTAMP,
  revoked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  revocation_reason VARCHAR(255),
  
  -- Audit and tracking
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  failed_attempts_last_reset TIMESTAMP,
  usage_count BIGINT NOT NULL DEFAULT 0,
  
  -- Additional metadata (flexible extension point)
  metadata JSONB DEFAULT '{}',
  
  -- Multi-tenancy and security
  tenant_id VARCHAR(100),
  
  -- Soft delete support
  deleted_at TIMESTAMP,
  
  -- Timestamps
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT api_credentials_status_check CHECK (
    status IN ('active', 'expired', 'rotated', 'revoked')
  ),
  CONSTRAINT api_credentials_version_check CHECK (version >= 1),
  CONSTRAINT api_credentials_failed_attempts_check CHECK (failed_attempts >= 0),
  CONSTRAINT api_credentials_usage_count_check CHECK (usage_count >= 0)
);

-- Indexes for api_credentials
CREATE INDEX idx_api_credentials_client_id ON api_credentials(client_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_api_credentials_organization_id ON api_credentials(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_api_credentials_corporate_id ON api_credentials(corporate_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_api_credentials_status ON api_credentials(status) WHERE is_active = true AND deleted_at IS NULL;
CREATE INDEX idx_api_credentials_is_active ON api_credentials(is_active) WHERE deleted_at IS NULL;
CREATE INDEX idx_api_credentials_created_by ON api_credentials(created_by);
CREATE INDEX idx_api_credentials_expires_at ON api_credentials(expires_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_api_credentials_rotation_required_at ON api_credentials(rotation_required_at) WHERE deletion_at IS NULL;
CREATE INDEX idx_api_credentials_created_at ON api_credentials(created_at DESC);
CREATE INDEX idx_api_credentials_last_used_at ON api_credentials(last_used_at DESC);

-- ============================================================================
-- TABLE 2: api_credential_audit_log
-- Purpose: Complete audit trail for all API credential operations
-- Requirement: HIPAA & DPDP compliance
-- ============================================================================

CREATE TABLE IF NOT EXISTS api_credential_audit_log (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Reference to credential
  credential_id UUID NOT NULL REFERENCES api_credentials(id) ON DELETE CASCADE,
  
  -- Organization context
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Action tracking
  action VARCHAR(50) NOT NULL,  -- created, rotated, revoked, accessed, failed_access, grace_period_started, grace_period_ended, viewed, exported
  action_status VARCHAR(20) NOT NULL DEFAULT 'success',  -- success, failure
  
  -- Detailed information about the action
  action_details JSONB,  -- Can include: old_version, new_version, scopes_changed, etc.
  
  -- Performer information
  performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  performer_role VARCHAR(100),  -- super_admin, admin, developer, system
  performer_email VARCHAR(255),
  
  -- Client context
  ip_address INET,
  ip_version INTEGER,  -- 4 or 6
  user_agent TEXT,
  client_name VARCHAR(255),  -- Browser, API Client, Mobile App, etc.
  client_version VARCHAR(100),
  
  -- Request tracking
  request_id VARCHAR(100),  -- For correlating with other logs
  session_id VARCHAR(100),
  
  -- Error handling
  error_message TEXT,
  error_code VARCHAR(50),
  
  -- Metadata and context
  metadata JSONB DEFAULT '{}',
  
  -- Temporal tracking (immutable after creation)
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Multi-tenancy
  tenant_id VARCHAR(100),
  
  -- Compliance tracking
  is_compliant BOOLEAN NOT NULL DEFAULT true,
  compliance_notes TEXT,
  
  -- Constraints
  CONSTRAINT api_credential_audit_log_action_check CHECK (
    action IN (
      'created', 'rotated', 'revoked', 'accessed', 'failed_access',
      'grace_period_started', 'grace_period_ended', 'viewed', 'exported',
      'permission_changed', 'reminder_sent', 'failure_threshold_reached'
    )
  ),
  CONSTRAINT api_credential_audit_log_status_check CHECK (
    action_status IN ('success', 'failure')
  )
);

-- Indexes for api_credential_audit_log
CREATE INDEX idx_api_credential_audit_log_credential_id ON api_credential_audit_log(credential_id);
CREATE INDEX idx_api_credential_audit_log_organization_id ON api_credential_audit_log(organization_id);
CREATE INDEX idx_api_credential_audit_log_timestamp ON api_credential_audit_log(timestamp DESC);
CREATE INDEX idx_api_credential_audit_log_created_at ON api_credential_audit_log(created_at DESC);
CREATE INDEX idx_api_credential_audit_log_action ON api_credential_audit_log(action);
CREATE INDEX idx_api_credential_audit_log_performer_by ON api_credential_audit_log(performed_by);
CREATE INDEX idx_api_credential_audit_log_ip_address ON api_credential_audit_log(ip_address);
CREATE INDEX idx_api_credential_audit_log_action_status ON api_credential_audit_log(action_status);
CREATE INDEX idx_api_credential_audit_log_credential_timestamp ON api_credential_audit_log(credential_id, timestamp DESC);  -- For credential history
CREATE INDEX idx_api_credential_audit_log_week ON api_credential_audit_log(DATE_TRUNC('week', timestamp DESC));  -- For weekly reports
CREATE INDEX idx_api_credential_audit_log_month ON api_credential_audit_log(DATE_TRUNC('month', timestamp DESC));  -- For monthly reports

-- Composite index for common queries (find all actions for a credential in a date range)
CREATE INDEX idx_api_credential_audit_log_credential_timestamp_action 
  ON api_credential_audit_log(credential_id, timestamp DESC, action);

-- ============================================================================
-- TABLE 3: api_credential_rotation_templates
-- Purpose: Store reusable rotation policies and templates
-- ============================================================================

CREATE TABLE IF NOT EXISTS api_credential_rotation_templates (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Organization context
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Template information
  name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Rotation policy
  rotation_interval_days INTEGER NOT NULL DEFAULT 90,  -- How often to rotate
  grace_period_days INTEGER NOT NULL DEFAULT 7,  -- How long old secret works after rotation
  expiration_interval_days INTEGER NOT NULL DEFAULT 365,  -- How long credential is valid total
  
  -- Preferences
  require_approval BOOLEAN NOT NULL DEFAULT false,  -- Require super admin approval?
  auto_rotate BOOLEAN NOT NULL DEFAULT false,  -- Auto-rotate on schedule?
  notify_before_days INTEGER DEFAULT 14,  -- Notify days before rotation due
  
  -- Metadata
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Soft delete
  deleted_at TIMESTAMP
);

-- Indexes for api_credential_rotation_templates
CREATE INDEX idx_api_credential_rotation_templates_organization_id ON api_credential_rotation_templates(organization_id);
CREATE INDEX idx_api_credential_rotation_templates_is_default ON api_credential_rotation_templates(is_default);
CREATE INDEX idx_api_credential_rotation_templates_deleted_at ON api_credential_rotation_templates(deleted_at);

-- ============================================================================
-- SEQUENCE FOR CLIENT ID GENERATION
-- Purpose: Generate unique sequential client IDs
-- ============================================================================

CREATE SEQUENCE IF NOT EXISTS api_credential_client_id_seq
  START WITH 1000
  INCREMENT BY 1
  NO MAXVALUE;

-- ============================================================================
-- FUNCTION: generate_client_id()
-- Purpose: Generate unique OAuth-like client_id
-- Returns: VARCHAR in format "cred_smarthealth_<random_string>"
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_client_id()
RETURNS VARCHAR AS $$
DECLARE
  random_suffix VARCHAR;
  new_client_id VARCHAR;
BEGIN
  -- Generate random suffix (combination of sequence and random hex)
  random_suffix := CONCAT(
    LPAD(nextval('api_credential_client_id_seq')::TEXT, 5, '0'),
    SUBSTR(MD5(RANDOM()::TEXT || NOW()::TEXT), 1, 15)
  );
  
  new_client_id := CONCAT('cred_smarthealth_', random_suffix);
  
  RETURN new_client_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: log_credential_audit()
-- Purpose: Log all credential actions to audit table
-- Called from application code, not triggers
-- ============================================================================

CREATE OR REPLACE FUNCTION log_credential_audit(
  p_credential_id UUID,
  p_organization_id UUID,
  p_action VARCHAR,
  p_performed_by UUID,
  p_performer_role VARCHAR DEFAULT 'admin',
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_action_details JSONB DEFAULT '{}'::jsonb,
  p_request_id VARCHAR DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  audit_id UUID;
BEGIN
  INSERT INTO api_credential_audit_log (
    credential_id,
    organization_id,
    action,
    action_status,
    performed_by,
    performer_role,
    ip_address,
    user_agent,
    action_details,
    request_id,
    error_message,
    timestamp
  ) VALUES (
    p_credential_id,
    p_organization_id,
    p_action,
    CASE WHEN p_error_message IS NULL THEN 'success' ELSE 'failure' END,
    p_performed_by,
    p_performer_role,
    p_ip_address,
    p_user_agent,
    p_action_details,
    p_request_id,
    p_error_message,
    NOW()
  )
  RETURNING id INTO audit_id;
  
  RETURN audit_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: check_rotation_required()
-- Purpose: Check if credential is past rotation date
-- Returns: BOOLEAN (true if rotation required)
-- ============================================================================

CREATE OR REPLACE FUNCTION check_rotation_required(cred_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  is_required BOOLEAN;
BEGIN
  SELECT (rotation_required_at IS NOT NULL AND rotation_required_at <= NOW())
  INTO is_required
  FROM api_credentials
  WHERE id = cred_id AND is_active = true AND deleted_at IS NULL;
  
  RETURN COALESCE(is_required, false);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: check_credential_expired()
-- Purpose: Check if credential has expired
-- Returns: BOOLEAN (true if expired)
-- ============================================================================

CREATE OR REPLACE FUNCTION check_credential_expired(cred_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  is_expired BOOLEAN;
BEGIN
  SELECT (expires_at IS NOT NULL AND expires_at <= NOW())
  INTO is_expired
  FROM api_credentials
  WHERE id = cred_id AND deleted_at IS NULL;
  
  RETURN COALESCE(is_expired, false);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: get_credential_status()
-- Purpose: Get detailed status of a credential (active, expired, rotation_pending, etc)
-- Returns: VARCHAR status
-- ============================================================================

CREATE OR REPLACE FUNCTION get_credential_status(cred_id UUID)
RETURNS VARCHAR AS $$
DECLARE
  cred_status VARCHAR;
  is_revoked BOOLEAN;
  is_expired BOOLEAN;
  rotation_due BOOLEAN;
BEGIN
  SELECT 
    (revoked_at IS NOT NULL),
    (expires_at IS NOT NULL AND expires_at <= NOW()),
    (rotation_required_at IS NOT NULL AND rotation_required_at <= NOW())
  INTO is_revoked, is_expired, rotation_due
  FROM api_credentials
  WHERE id = cred_id AND deleted_at IS NULL;
  
  IF is_revoked THEN
    cred_status := 'revoked';
  ELSIF is_expired THEN
    cred_status := 'expired';
  ELSIF rotation_due THEN
    cred_status := 'rotation_pending';
  ELSE
    cred_status := 'active';
  END IF;
  
  RETURN cred_status;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGER: update_api_credentials_timestamp
-- Purpose: Auto-update updated_at timestamp on record change
-- ============================================================================

CREATE OR REPLACE FUNCTION update_api_credentials_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS api_credentials_update_timestamp ON api_credentials;
CREATE TRIGGER api_credentials_update_timestamp
  BEFORE UPDATE ON api_credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_api_credentials_timestamp();

-- ============================================================================
-- TRIGGER: api_credential_audit_log_timestamp
-- Purpose: Ensure audit log timestamp is always set
-- ============================================================================

CREATE OR REPLACE FUNCTION api_credential_audit_log_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.timestamp IS NULL THEN
    NEW.timestamp = NOW();
  END IF;
  IF NEW.created_at IS NULL THEN
    NEW.created_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS api_credential_audit_log_set_timestamp ON api_credential_audit_log;
CREATE TRIGGER api_credential_audit_log_set_timestamp
  BEFORE INSERT ON api_credential_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION api_credential_audit_log_timestamp();

-- ============================================================================
-- VIEWS FOR MONITORING AND REPORTING
-- ============================================================================

-- ============================================================================
-- VIEW: active_api_credentials
-- Purpose: Quick view of all active credentials requiring management
-- ============================================================================

CREATE OR REPLACE VIEW active_api_credentials AS
SELECT 
  id,
  organization_id,
  corporate_id,
  client_id,
  name,
  status,
  version,
  created_at,
  last_used_at,
  rotation_required_at,
  expires_at,
  CASE 
    WHEN rotation_required_at <= NOW() THEN 'OVERDUE'
    WHEN rotation_required_at <= NOW() + INTERVAL '14 days' THEN 'UPCOMING'
    ELSE 'SCHEDULED'
  END AS rotation_urgency,
  CASE
    WHEN expires_at <= NOW() THEN 'EXPIRED'
    WHEN expires_at <= NOW() + INTERVAL '30 days' THEN 'EXPIRING_SOON'
    ELSE 'VALID'
  END AS expiration_status,
  usage_count,
  failed_attempts,
  created_by
FROM api_credentials
WHERE deleted_at IS NULL 
  AND is_active = true
  AND status IN ('active', 'rotated')
ORDER BY rotation_required_at ASC;

-- ============================================================================
-- VIEW: credential_audit_summary
-- Purpose: Summary of recent audit activities
-- ============================================================================

CREATE OR REPLACE VIEW credential_audit_summary AS
SELECT 
  DATE_TRUNC('day', timestamp)::DATE as date,
  action,
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE action_status = 'failure') as failures,
  COUNT(DISTINCT credential_id) as credentials_affected,
  COUNT(DISTINCT performed_by) as unique_performers
FROM api_credential_audit_log
WHERE timestamp >= NOW() - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', timestamp)::DATE, action
ORDER BY date DESC, count DESC;

-- ============================================================================
-- PERMISSIONS AND SECURITY
-- ============================================================================

-- Note: These permission statements should be adjusted based on your actual role structure
-- Ensure proper row-level security (RLS) policies are in place

-- ALTER TABLE api_credentials ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE api_credential_audit_log ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- DATA VALIDATION
-- ============================================================================

-- Verify tables were created
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'api_credentials') THEN
    RAISE NOTICE 'SUCCESS: api_credentials table created';
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'api_credential_audit_log') THEN
    RAISE NOTICE 'SUCCESS: api_credential_audit_log table created';
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'api_credential_rotation_templates') THEN
    RAISE NOTICE 'SUCCESS: api_credential_rotation_templates table created';
  END IF;
END $$;

-- ============================================================================
-- MIGRATION COMPLETION
-- ============================================================================
-- Run this migration with:
-- psql -U <user> -d <database> -f server/database/migrations/001-api-credentials.sql
--
-- Verify tables:
-- SELECT * FROM information_schema.tables WHERE table_name LIKE 'api_credential%';
--
-- Verify functions:
-- SELECT * FROM pg_proc WHERE proname LIKE 'generate_client_id%' OR proname LIKE 'log_credential_audit%';
--
-- Verify views:
-- SELECT * FROM information_schema.views WHERE table_schema = 'public';
-- ============================================================================
