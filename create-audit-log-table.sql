-- Create audit log table for API credentials

CREATE TABLE IF NOT EXISTS api_credential_audit_log (
    id SERIAL PRIMARY KEY,
    credential_id INTEGER,
    action VARCHAR(100) NOT NULL,
    action_details JSONB DEFAULT '{}',
    performed_by INTEGER,
    ip_address VARCHAR(45),
    user_agent TEXT,
    performed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_audit_credential_id ON api_credential_audit_log(credential_id);
CREATE INDEX IF NOT EXISTS idx_audit_performed_at ON api_credential_audit_log(performed_at);
CREATE INDEX IF NOT EXISTS idx_audit_action ON api_credential_audit_log(action);

-- Grant permissions
GRANT ALL PRIVILEGES ON api_credential_audit_log TO mediczy_helper;
GRANT USAGE, SELECT ON SEQUENCE api_credential_audit_log_id_seq TO mediczy_helper;

-- Show table structure
\d api_credential_audit_log
