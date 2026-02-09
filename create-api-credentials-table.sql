-- Create api_credentials table for managing API authentication credentials
-- This table stores hashed client secrets and credentials for third-party integrations

CREATE TABLE IF NOT EXISTS api_credentials (
    id SERIAL PRIMARY KEY,
    client_id VARCHAR(64) UNIQUE NOT NULL,
    client_secret_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    integration_type VARCHAR(100) NOT NULL,
    organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id),
    expires_at TIMESTAMP,
    last_rotated_at TIMESTAMP,
    rotation_required_at TIMESTAMP,
    rotation_grace_period_days INTEGER DEFAULT 7,
    last_used_at TIMESTAMP,
    revoked_at TIMESTAMP,
    revoked_by INTEGER REFERENCES users(id),
    revoke_reason TEXT,
    metadata JSONB DEFAULT '{}',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_api_credentials_client_id ON api_credentials(client_id);
CREATE INDEX IF NOT EXISTS idx_api_credentials_organization_id ON api_credentials(organization_id);
CREATE INDEX IF NOT EXISTS idx_api_credentials_is_active ON api_credentials(is_active);
CREATE INDEX IF NOT EXISTS idx_api_credentials_integration_type ON api_credentials(integration_type);
CREATE INDEX IF NOT EXISTS idx_api_credentials_expires_at ON api_credentials(expires_at);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_api_credentials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER api_credentials_updated_at
    BEFORE UPDATE ON api_credentials
    FOR EACH ROW
    EXECUTE FUNCTION update_api_credentials_updated_at();

-- Grant permissions to mediczy_helper
GRANT ALL PRIVILEGES ON api_credentials TO mediczy_helper;
GRANT USAGE, SELECT ON SEQUENCE api_credentials_id_seq TO mediczy_helper;

COMMENT ON TABLE api_credentials IS 'Stores API credentials for third-party integrations with SmartHealth RN and other systems';
COMMENT ON COLUMN api_credentials.client_id IS 'Unique identifier for the API client (e.g., smarthealth_rn_prod_abc123)';
COMMENT ON COLUMN api_credentials.client_secret_hash IS 'Bcrypt hash of the client secret (never store plaintext)';
COMMENT ON COLUMN api_credentials.rotation_required_at IS 'Timestamp when credential rotation becomes mandatory';
COMMENT ON COLUMN api_credentials.rotation_grace_period_days IS 'Days allowed for both old and new credentials to work during rotation';
