-- ============================================================================
-- Mediczy Cloud Mother - Local AI Node Multi-Tenancy
-- Hospital Edge Computing Infrastructure
-- ============================================================================
-- This migration creates the control plane tables for managing local AI nodes
-- at hospital sites, enabling offline-first AI capabilities while maintaining
-- central cloud oversight.
-- ============================================================================

-- ============================================================================
-- 1. LOCAL AI NODES REGISTRY
-- ============================================================================
-- Central registry of all local AI compute nodes deployed at hospital sites
-- Each hospital tenant can have multiple nodes (main server, backup, edge devices)

CREATE TABLE IF NOT EXISTS local_ai_nodes (
    -- Primary Key
    node_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Tenant Relationship
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    entity_id UUID,  -- Optional: specific department/branch within tenant
    
    -- Node Identity
    node_code VARCHAR(50) NOT NULL UNIQUE,  -- e.g., "APOLLO-CHN-NODE-01"
    node_name VARCHAR(255) NOT NULL,
    node_type VARCHAR(20) NOT NULL DEFAULT 'ON_PREMISE' 
        CHECK (node_type IN ('ON_PREMISE', 'EDGE', 'HYBRID', 'MOBILE')),
    
    -- Hardware Specifications
    hardware_specs JSONB DEFAULT '{}',
    -- Example: {
    --   "cpu": "Intel Xeon E5-2690 v4",
    --   "cpu_cores": 14,
    --   "ram_gb": 64,
    --   "storage_type": "NVMe SSD",
    --   "storage_gb": 1000,
    --   "os": "Ubuntu 22.04 LTS"
    -- }
    
    gpu_info JSONB DEFAULT '{}',
    -- Example: {
    --   "type": "NVIDIA RTX 4090",
    --   "vram_gb": 24,
    --   "cuda_version": "12.1",
    --   "driver_version": "535.104.05"
    -- }
    -- OR for CPU-only: {"type": "CPU_ONLY", "note": "Using llama.cpp CPU inference"}
    
    -- Network Configuration
    endpoint_url VARCHAR(255),            -- e.g., "https://ai.apollo.local:8006"
    internal_ip VARCHAR(45),              -- Private network IP
    external_ip VARCHAR(45),              -- Public IP if available
    vpn_endpoint VARCHAR(255),            -- VPN tunnel endpoint for cloud connectivity
    
    -- Authentication
    api_key_hash VARCHAR(255),            -- Hashed API key for node authentication
    api_key_prefix VARCHAR(8),            -- First 8 chars of API key for identification
    client_cert_fingerprint VARCHAR(64),  -- TLS client certificate fingerprint
    
    -- AI Models & Capabilities
    installed_models JSONB DEFAULT '[]',
    -- Example: [
    --   {"name": "indic-gemma-2b-navarasa", "version": "2.0", "quantization": "Q4_K_M", "size_gb": 1.5},
    --   {"name": "whisper-medium", "version": "1.0", "size_gb": 1.5}
    -- ]
    
    capabilities JSONB DEFAULT '[]',
    -- Example: ["scribe", "prescription", "opd_notes", "discharge_summary", "transcription"]
    
    supported_languages JSONB DEFAULT '["en", "hi"]',
    -- Example: ["en", "hi", "ta", "te", "kn", "ml", "mr", "bn", "gu", "pa"]
    
    -- Status & Health
    status VARCHAR(20) NOT NULL DEFAULT 'PROVISIONING'
        CHECK (status IN ('PROVISIONING', 'ACTIVE', 'OFFLINE', 'MAINTENANCE', 'DEGRADED', 'DECOMMISSIONED')),
    
    last_heartbeat_at TIMESTAMPTZ,
    heartbeat_interval_seconds INTEGER DEFAULT 60,
    
    health_metrics JSONB DEFAULT '{}',
    -- Example: {
    --   "uptime_seconds": 86400,
    --   "cpu_usage_percent": 45,
    --   "memory_usage_percent": 62,
    --   "gpu_usage_percent": 30,
    --   "disk_usage_percent": 55,
    --   "avg_latency_ms": 120,
    --   "requests_today": 450,
    --   "errors_today": 2
    -- }
    
    -- Sync Configuration
    sync_enabled BOOLEAN DEFAULT true,
    sync_interval_minutes INTEGER DEFAULT 60,
    last_sync_at TIMESTAMPTZ,
    sync_status JSONB DEFAULT '{}',
    -- Example: {
    --   "models": {"status": "synced", "last_sync": "2026-02-01T10:00:00Z"},
    --   "config": {"status": "synced", "last_sync": "2026-02-01T10:00:00Z"},
    --   "metrics": {"status": "pending", "queued_at": "2026-02-01T11:00:00Z"}
    -- }
    
    -- Configuration
    config JSONB DEFAULT '{}',
    -- Example: {
    --   "max_concurrent_requests": 10,
    --   "request_timeout_seconds": 300,
    --   "log_level": "INFO",
    --   "data_retention_days": 90,
    --   "auto_update_models": false,
    --   "fallback_to_cloud": true
    -- }
    
    -- Metadata
    location JSONB DEFAULT '{}',
    -- Example: {
    --   "building": "Main Hospital",
    --   "floor": "2",
    --   "room": "Server Room A",
    --   "city": "Chennai",
    --   "state": "Tamil Nadu"
    -- }
    
    notes TEXT,
    tags JSONB DEFAULT '[]',
    
    -- Timestamps
    provisioned_at TIMESTAMPTZ,
    activated_at TIMESTAMPTZ,
    decommissioned_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for local_ai_nodes
CREATE INDEX idx_local_ai_nodes_tenant ON local_ai_nodes(tenant_id);
CREATE INDEX idx_local_ai_nodes_status ON local_ai_nodes(status);
CREATE INDEX idx_local_ai_nodes_type ON local_ai_nodes(node_type);
CREATE INDEX idx_local_ai_nodes_heartbeat ON local_ai_nodes(last_heartbeat_at);
CREATE INDEX idx_local_ai_nodes_capabilities ON local_ai_nodes USING GIN(capabilities);

-- ============================================================================
-- 2. AI ROUTING RULES
-- ============================================================================
-- Define rules for routing AI requests to local nodes vs cloud
-- Enables intelligent request distribution based on use case, data sensitivity, etc.

CREATE TABLE IF NOT EXISTS ai_routing_rules (
    -- Primary Key
    rule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Tenant Scope
    tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
    -- NULL tenant_id = platform-wide rule
    
    -- Rule Identity
    rule_name VARCHAR(255) NOT NULL,
    rule_code VARCHAR(50) NOT NULL,
    description TEXT,
    
    -- Use Case Matching
    use_case VARCHAR(50) NOT NULL
        CHECK (use_case IN (
            'SCRIBE', 'TRANSCRIPTION', 'PRESCRIPTION', 'OPD_NOTES', 'IPD_NOTES',
            'DISCHARGE_SUMMARY', 'DIAGNOSIS_ASSIST', 'CHAT', 'IMAGE_ANALYSIS',
            'LAB_ANALYSIS', 'DRUG_INTERACTION', 'REFERRAL', 'TRIAGE', 'ALL'
        )),
    
    -- Priority (lower number = higher priority)
    priority INTEGER NOT NULL DEFAULT 100,
    
    -- Conditions for Rule Matching
    conditions JSONB DEFAULT '{}',
    -- Example: {
    --   "data_sensitivity": ["PHI", "SENSITIVE"],
    --   "latency_requirement": "low",
    --   "file_size_max_mb": 50,
    --   "languages": ["hi", "ta", "te"],
    --   "time_of_day": {"start": "08:00", "end": "20:00"},
    --   "department_codes": ["OPD", "EMERGENCY"]
    -- }
    
    -- Target Configuration
    target_type VARCHAR(20) NOT NULL DEFAULT 'LOCAL_NODE'
        CHECK (target_type IN ('LOCAL_NODE', 'CLOUD', 'HYBRID', 'ROUND_ROBIN')),
    
    local_node_id UUID REFERENCES local_ai_nodes(node_id) ON DELETE SET NULL,
    -- NULL = use any available node for tenant
    
    cloud_endpoint VARCHAR(255),  -- Override default cloud endpoint
    
    -- Fallback Configuration
    fallback_enabled BOOLEAN DEFAULT true,
    fallback_target VARCHAR(20) DEFAULT 'CLOUD'
        CHECK (fallback_target IN ('CLOUD', 'LOCAL_NODE', 'QUEUE', 'REJECT')),
    fallback_timeout_seconds INTEGER DEFAULT 30,
    
    -- Load Balancing (for ROUND_ROBIN target)
    load_balance_config JSONB DEFAULT '{}',
    -- Example: {
    --   "strategy": "LEAST_CONNECTIONS",  -- or "ROUND_ROBIN", "WEIGHTED"
    --   "node_weights": {"node1": 3, "node2": 2},
    --   "health_check_interval": 30
    -- }
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'INACTIVE', 'TESTING')),
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    
    -- Unique constraint for rule priority per tenant/use_case
    CONSTRAINT unique_tenant_usecase_priority UNIQUE (tenant_id, use_case, priority)
);

-- Indexes for ai_routing_rules
CREATE INDEX idx_ai_routing_rules_tenant ON ai_routing_rules(tenant_id);
CREATE INDEX idx_ai_routing_rules_usecase ON ai_routing_rules(use_case);
CREATE INDEX idx_ai_routing_rules_status ON ai_routing_rules(status);
CREATE INDEX idx_ai_routing_rules_priority ON ai_routing_rules(priority);

-- ============================================================================
-- 3. AI NODE SYNC LOGS
-- ============================================================================
-- Audit trail for all sync operations between cloud and local nodes

CREATE TABLE IF NOT EXISTS ai_node_sync_logs (
    -- Primary Key
    log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Node Reference
    node_id UUID NOT NULL REFERENCES local_ai_nodes(node_id) ON DELETE CASCADE,
    
    -- Sync Operation Details
    sync_type VARCHAR(30) NOT NULL
        CHECK (sync_type IN (
            'MODEL_UPDATE', 'MODEL_DOWNLOAD', 'CONFIG_PUSH', 'CONFIG_PULL',
            'METRICS_PUSH', 'HEALTH_CHECK', 'CERTIFICATE_RENEWAL',
            'FULL_SYNC', 'INCREMENTAL_SYNC', 'EMERGENCY_UPDATE'
        )),
    
    sync_direction VARCHAR(10) NOT NULL DEFAULT 'PULL'
        CHECK (sync_direction IN ('PUSH', 'PULL', 'BIDIRECTIONAL')),
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'IN_PROGRESS', 'SUCCESS', 'FAILED', 'PARTIAL', 'CANCELLED')),
    
    -- Details
    details JSONB DEFAULT '{}',
    -- Example for MODEL_UPDATE:
    -- {
    --   "model_name": "indic-gemma-2b-navarasa",
    --   "from_version": "1.0",
    --   "to_version": "2.0",
    --   "file_size_mb": 1500,
    --   "checksum": "sha256:abc123..."
    -- }
    
    -- Progress Tracking
    progress_percent INTEGER DEFAULT 0,
    bytes_transferred BIGINT DEFAULT 0,
    
    -- Error Information
    error_code VARCHAR(50),
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    
    -- Timing
    scheduled_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    
    -- Initiator
    initiated_by VARCHAR(50),  -- 'SYSTEM', 'ADMIN', 'SCHEDULE', 'NODE'
    initiated_by_user_id INTEGER REFERENCES users(id),
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for ai_node_sync_logs
CREATE INDEX idx_ai_node_sync_logs_node ON ai_node_sync_logs(node_id);
CREATE INDEX idx_ai_node_sync_logs_status ON ai_node_sync_logs(status);
CREATE INDEX idx_ai_node_sync_logs_type ON ai_node_sync_logs(sync_type);
CREATE INDEX idx_ai_node_sync_logs_created ON ai_node_sync_logs(created_at);

-- ============================================================================
-- 4. AI NODE HEARTBEATS (Time-series for monitoring)
-- ============================================================================
-- Detailed heartbeat history for monitoring and alerting

CREATE TABLE IF NOT EXISTS ai_node_heartbeats (
    -- Primary Key
    heartbeat_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Node Reference
    node_id UUID NOT NULL REFERENCES local_ai_nodes(node_id) ON DELETE CASCADE,
    
    -- Heartbeat Data
    received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    round_trip_ms INTEGER,
    
    -- Health Snapshot
    health_status VARCHAR(20) NOT NULL DEFAULT 'HEALTHY'
        CHECK (health_status IN ('HEALTHY', 'DEGRADED', 'UNHEALTHY', 'CRITICAL')),
    
    metrics JSONB NOT NULL DEFAULT '{}',
    -- Example: {
    --   "cpu_percent": 45.2,
    --   "memory_percent": 62.1,
    --   "gpu_percent": 30.5,
    --   "gpu_memory_percent": 55.0,
    --   "disk_percent": 48.0,
    --   "network_in_mbps": 12.5,
    --   "network_out_mbps": 8.3,
    --   "active_requests": 3,
    --   "queued_requests": 0,
    --   "model_loaded": true,
    --   "uptime_seconds": 86400
    -- }
    
    -- Issues/Alerts
    alerts JSONB DEFAULT '[]'
    -- Example: [
    --   {"level": "WARNING", "code": "HIGH_CPU", "message": "CPU usage above 80%"},
    --   {"level": "INFO", "code": "MODEL_RELOADED", "message": "Model reloaded after update"}
    -- ]
);

-- Partition by time for efficient queries and retention
-- Note: In production, consider TimescaleDB or partitioning

CREATE INDEX idx_ai_node_heartbeats_node ON ai_node_heartbeats(node_id);
CREATE INDEX idx_ai_node_heartbeats_time ON ai_node_heartbeats(received_at);
CREATE INDEX idx_ai_node_heartbeats_status ON ai_node_heartbeats(health_status);

-- ============================================================================
-- 5. AI NODE API KEYS
-- ============================================================================
-- Secure API key management for node authentication

CREATE TABLE IF NOT EXISTS ai_node_api_keys (
    -- Primary Key
    key_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Node Reference
    node_id UUID NOT NULL REFERENCES local_ai_nodes(node_id) ON DELETE CASCADE,
    
    -- Key Details
    key_prefix VARCHAR(8) NOT NULL,  -- First 8 chars for identification
    key_hash VARCHAR(255) NOT NULL,  -- bcrypt hash of full key
    key_name VARCHAR(100),           -- Human-readable name
    
    -- Permissions
    scopes JSONB DEFAULT '["heartbeat", "sync", "metrics"]',
    -- Available: heartbeat, sync, metrics, config, model_download, admin
    
    -- Rate Limiting
    rate_limit_per_minute INTEGER DEFAULT 100,
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'REVOKED', 'EXPIRED')),
    
    -- Expiry
    expires_at TIMESTAMPTZ,
    
    -- Usage Tracking
    last_used_at TIMESTAMPTZ,
    use_count BIGINT DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMPTZ,
    revoked_by INTEGER REFERENCES users(id)
);

CREATE INDEX idx_ai_node_api_keys_node ON ai_node_api_keys(node_id);
CREATE INDEX idx_ai_node_api_keys_prefix ON ai_node_api_keys(key_prefix);
CREATE INDEX idx_ai_node_api_keys_status ON ai_node_api_keys(status);

-- ============================================================================
-- 6. UPDATE TENANTS TABLE - Add AI Node Configuration
-- ============================================================================

-- Add AI-specific columns to tenants table if they don't exist
DO $$
BEGIN
    -- Add local_ai_enabled flag
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tenants' AND column_name = 'local_ai_enabled'
    ) THEN
        ALTER TABLE tenants ADD COLUMN local_ai_enabled BOOLEAN DEFAULT false;
    END IF;
    
    -- Add ai_config JSONB
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tenants' AND column_name = 'ai_config'
    ) THEN
        ALTER TABLE tenants ADD COLUMN ai_config JSONB DEFAULT '{}';
        COMMENT ON COLUMN tenants.ai_config IS 'AI configuration: {
            "local_node_count": 2,
            "ai_capabilities": ["scribe", "diagnosis"],
            "data_residency": "ON_PREMISE",
            "fallback_to_cloud": true,
            "preferred_languages": ["hi", "en"],
            "model_preferences": {"scribe": "indic-gemma-2b"}
        }';
    END IF;
END $$;

-- ============================================================================
-- 7. HELPER FUNCTIONS
-- ============================================================================

-- Function to check if a node is online (heartbeat within threshold)
CREATE OR REPLACE FUNCTION is_node_online(
    p_node_id UUID,
    p_threshold_seconds INTEGER DEFAULT 120
) RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM local_ai_nodes
        WHERE node_id = p_node_id
        AND status = 'ACTIVE'
        AND last_heartbeat_at > NOW() - (p_threshold_seconds || ' seconds')::INTERVAL
    );
END;
$$ LANGUAGE plpgsql;

-- Function to get available nodes for a tenant
CREATE OR REPLACE FUNCTION get_available_nodes(
    p_tenant_id INTEGER,
    p_capability VARCHAR DEFAULT NULL
) RETURNS TABLE (
    node_id UUID,
    node_code VARCHAR,
    endpoint_url VARCHAR,
    capabilities JSONB,
    health_status VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        n.node_id,
        n.node_code,
        n.endpoint_url,
        n.capabilities,
        CASE 
            WHEN n.last_heartbeat_at > NOW() - INTERVAL '2 minutes' THEN 'HEALTHY'
            WHEN n.last_heartbeat_at > NOW() - INTERVAL '5 minutes' THEN 'DEGRADED'
            ELSE 'OFFLINE'
        END AS health_status
    FROM local_ai_nodes n
    WHERE n.tenant_id = p_tenant_id
    AND n.status = 'ACTIVE'
    AND (p_capability IS NULL OR n.capabilities ? p_capability)
    ORDER BY n.last_heartbeat_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get the best routing rule for a request
CREATE OR REPLACE FUNCTION get_routing_rule(
    p_tenant_id INTEGER,
    p_use_case VARCHAR
) RETURNS TABLE (
    rule_id UUID,
    target_type VARCHAR,
    local_node_id UUID,
    endpoint_url VARCHAR,
    fallback_enabled BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.rule_id,
        r.target_type,
        r.local_node_id,
        COALESCE(r.cloud_endpoint, n.endpoint_url) AS endpoint_url,
        r.fallback_enabled
    FROM ai_routing_rules r
    LEFT JOIN local_ai_nodes n ON r.local_node_id = n.node_id
    WHERE (r.tenant_id = p_tenant_id OR r.tenant_id IS NULL)
    AND (r.use_case = p_use_case OR r.use_case = 'ALL')
    AND r.status = 'ACTIVE'
    ORDER BY 
        CASE WHEN r.tenant_id IS NOT NULL THEN 0 ELSE 1 END,  -- Tenant-specific first
        r.priority
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. DEFAULT ROUTING RULES (Platform-wide)
-- ============================================================================

INSERT INTO ai_routing_rules (rule_code, rule_name, use_case, priority, target_type, description)
VALUES 
    ('DEFAULT_SCRIBE', 'Default Scribe Routing', 'SCRIBE', 1000, 'LOCAL_NODE', 
     'Route all scribe requests to local node if available'),
    ('DEFAULT_TRANSCRIPTION', 'Default Transcription Routing', 'TRANSCRIPTION', 1000, 'LOCAL_NODE',
     'Route transcription to local node for faster processing'),
    ('DEFAULT_PRESCRIPTION', 'Default Prescription Routing', 'PRESCRIPTION', 1000, 'LOCAL_NODE',
     'Keep prescription generation on-premise for data privacy'),
    ('DEFAULT_CHAT', 'Default Chat Routing', 'CHAT', 1000, 'HYBRID',
     'Use hybrid routing for chat - local for simple queries, cloud for complex'),
    ('DEFAULT_IMAGE', 'Default Image Analysis Routing', 'IMAGE_ANALYSIS', 1000, 'CLOUD',
     'Route image analysis to cloud for better GPU resources')
ON CONFLICT (tenant_id, use_case, priority) DO NOTHING;

-- ============================================================================
-- 9. TRIGGERS
-- ============================================================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables
DROP TRIGGER IF EXISTS update_local_ai_nodes_timestamp ON local_ai_nodes;
CREATE TRIGGER update_local_ai_nodes_timestamp
    BEFORE UPDATE ON local_ai_nodes
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_ai_routing_rules_timestamp ON ai_routing_rules;
CREATE TRIGGER update_ai_routing_rules_timestamp
    BEFORE UPDATE ON ai_routing_rules
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Node status change logging
CREATE OR REPLACE FUNCTION log_node_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO ai_node_sync_logs (
            node_id, sync_type, sync_direction, status, details
        ) VALUES (
            NEW.node_id,
            'HEALTH_CHECK',
            'PULL',
            'SUCCESS',
            jsonb_build_object(
                'old_status', OLD.status,
                'new_status', NEW.status,
                'changed_at', CURRENT_TIMESTAMP
            )
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS log_node_status_change_trigger ON local_ai_nodes;
CREATE TRIGGER log_node_status_change_trigger
    AFTER UPDATE ON local_ai_nodes
    FOR EACH ROW EXECUTE FUNCTION log_node_status_change();

-- ============================================================================
-- 10. GRANTS (adjust based on your database roles)
-- ============================================================================

-- Grant permissions to application role
-- GRANT SELECT, INSERT, UPDATE, DELETE ON local_ai_nodes TO mediczy_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ai_routing_rules TO mediczy_app;
-- GRANT SELECT, INSERT ON ai_node_sync_logs TO mediczy_app;
-- GRANT SELECT, INSERT ON ai_node_heartbeats TO mediczy_app;
-- GRANT SELECT, INSERT, UPDATE ON ai_node_api_keys TO mediczy_app;

COMMENT ON TABLE local_ai_nodes IS 'Registry of local AI compute nodes deployed at hospital sites';
COMMENT ON TABLE ai_routing_rules IS 'Rules for routing AI requests between local nodes and cloud';
COMMENT ON TABLE ai_node_sync_logs IS 'Audit trail for sync operations between cloud and local nodes';
COMMENT ON TABLE ai_node_heartbeats IS 'Time-series health data from local AI nodes';
COMMENT ON TABLE ai_node_api_keys IS 'API keys for authenticating local AI nodes';
