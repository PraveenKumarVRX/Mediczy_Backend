-- ========================================================================================
-- Mediczy Cloud Mother - Local AI Node Multi-Tenancy (Revised)
-- Hospital Edge Computing Infrastructure
-- ========================================================================================
-- This migration creates the control plane tables for managing local AI nodes
-- at hospital sites, enabling offline-first AI capabilities while maintaining
-- central cloud oversight.
-- ========================================================================================

-- ========================================================================================
-- 1. LOCAL AI NODES REGISTRY
-- ========================================================================================
-- Central registry of all local AI compute nodes deployed at hospital sites
-- Each hospital tenant can have multiple nodes (main server, backup, edge devices)

CREATE TABLE IF NOT EXISTS local_ai_nodes (
    -- Primary Key
    node_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Tenant Relationship (links to hospital/tenant)
    hospital_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
    hospital_name VARCHAR(255),
    
    -- Node Identity
    node_code VARCHAR(50) NOT NULL UNIQUE,  -- e.g., "MCZ-123-ABC123"
    node_type VARCHAR(20) NOT NULL DEFAULT 'ON_PREMISE' 
        CHECK (node_type IN ('ON_PREMISE', 'EDGE', 'HYBRID', 'MOBILE')),
    
    -- Network Configuration
    endpoint_url VARCHAR(255),  -- e.g., "https://ai.hospital.local:8006"
    
    -- AI Capabilities
    capabilities JSONB DEFAULT '["SCRIBE", "TRANSCRIPTION"]'::jsonb,
    -- Example: ["SCRIBE", "TRANSCRIPTION", "PRESCRIPTION", "CHAT", "IMAGE_ANALYSIS"]
    
    models_available JSONB DEFAULT '["indic-gemma-2b", "whisper-small"]'::jsonb,
    -- Example: ["indic-gemma-2b", "whisper-small", "whisper-medium"]
    
    -- Configuration
    config JSONB DEFAULT '{}'::jsonb,
    -- Example: {"max_concurrent_requests": 10, "timeout_seconds": 120}
    
    -- Health Metrics
    health_metrics JSONB DEFAULT '{}'::jsonb,
    -- Example: {"cpu_usage": 45, "memory_usage": 62, "gpu_usage": 30, "avg_latency_ms": 120}
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'ACTIVE', 'DEGRADED', 'OFFLINE', 'SUSPENDED', 'MAINTENANCE')),
    
    -- Timestamps
    last_heartbeat TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for local_ai_nodes
CREATE INDEX IF NOT EXISTS idx_local_ai_nodes_hospital ON local_ai_nodes(hospital_id);
CREATE INDEX IF NOT EXISTS idx_local_ai_nodes_status ON local_ai_nodes(status);
CREATE INDEX IF NOT EXISTS idx_local_ai_nodes_heartbeat ON local_ai_nodes(last_heartbeat);
CREATE INDEX IF NOT EXISTS idx_local_ai_nodes_capabilities ON local_ai_nodes USING GIN(capabilities);

-- ========================================================================================
-- 2. AI ROUTING RULES
-- ========================================================================================
-- Defines how AI requests should be routed (local node vs cloud)

CREATE TABLE IF NOT EXISTS ai_routing_rules (
    -- Primary Key
    rule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Tenant Scope
    hospital_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Rule Definition
    request_type VARCHAR(50) NOT NULL,  -- SCRIBE, TRANSCRIPTION, PRESCRIPTION, CHAT, IMAGE
    priority INTEGER DEFAULT 0,  -- Higher = more specific
    
    -- Matching Conditions (all must match)
    conditions JSONB DEFAULT '{}'::jsonb,
    -- Example: {"min_audio_length": 30, "language": "hi", "time_range": "09:00-18:00"}
    
    -- Routing Configuration
    routing_strategy VARCHAR(20) DEFAULT 'PREFER_LOCAL'
        CHECK (routing_strategy IN ('PREFER_LOCAL', 'PREFER_CLOUD', 'LOCAL_ONLY', 'CLOUD_ONLY', 'ROUND_ROBIN')),
    
    fallback_strategy VARCHAR(20) DEFAULT 'CLOUD'
        CHECK (fallback_strategy IN ('CLOUD', 'QUEUE', 'FAIL')),
    
    -- Target Configuration
    target_node_id UUID REFERENCES local_ai_nodes(node_id) ON DELETE SET NULL,
    cloud_endpoint VARCHAR(255),
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for routing rules
CREATE INDEX IF NOT EXISTS idx_ai_routing_hospital ON ai_routing_rules(hospital_id);
CREATE INDEX IF NOT EXISTS idx_ai_routing_type ON ai_routing_rules(request_type);
CREATE INDEX IF NOT EXISTS idx_ai_routing_active ON ai_routing_rules(is_active) WHERE is_active = true;

-- ========================================================================================
-- 3. AI NODE SYNC LOGS
-- ========================================================================================
-- Audit trail of sync operations between cloud and local nodes

CREATE TABLE IF NOT EXISTS ai_node_sync_logs (
    -- Primary Key
    sync_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Node Reference
    node_id UUID NOT NULL REFERENCES local_ai_nodes(node_id) ON DELETE CASCADE,
    
    -- Sync Details
    sync_type VARCHAR(30) NOT NULL,  -- CONFIG_PUSH, MODEL_UPDATE, METRICS_PULL, FULL_SYNC, HEARTBEAT
    
    -- Status Tracking
    status VARCHAR(20) DEFAULT 'IN_PROGRESS'
        CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'FAILED', 'PARTIAL')),
    
    -- Data Transferred
    data_summary JSONB DEFAULT '{}'::jsonb,
    -- Example: {"records_synced": 150, "bytes_transferred": 1024000}
    
    error_message TEXT,
    
    -- Timestamps
    started_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ
);

-- Indexes for sync logs
CREATE INDEX IF NOT EXISTS idx_ai_sync_node ON ai_node_sync_logs(node_id);
CREATE INDEX IF NOT EXISTS idx_ai_sync_type ON ai_node_sync_logs(sync_type);
CREATE INDEX IF NOT EXISTS idx_ai_sync_started ON ai_node_sync_logs(started_at);

-- ========================================================================================
-- 4. AI NODE HEARTBEATS
-- ========================================================================================
-- Time-series health data from local nodes

CREATE TABLE IF NOT EXISTS ai_node_heartbeats (
    -- Primary Key
    heartbeat_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Node Reference
    node_id UUID NOT NULL REFERENCES local_ai_nodes(node_id) ON DELETE CASCADE,
    
    -- Health Status
    status VARCHAR(20) DEFAULT 'HEALTHY'
        CHECK (status IN ('HEALTHY', 'DEGRADED', 'ERROR', 'OVERLOADED', 'STARTING')),
    
    -- Metrics
    metrics JSONB DEFAULT '{}'::jsonb,
    -- Example: {"cpu": 45, "memory": 62, "disk": 55, "gpu": 30, "temperature": 65}
    
    -- Load Information
    active_requests INTEGER DEFAULT 0,
    queue_length INTEGER DEFAULT 0,
    error_rate DECIMAL(5, 2) DEFAULT 0,  -- Percentage
    avg_response_time_ms INTEGER DEFAULT 0,
    
    -- Timestamp
    recorded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for heartbeats
CREATE INDEX IF NOT EXISTS idx_ai_heartbeat_node ON ai_node_heartbeats(node_id);
CREATE INDEX IF NOT EXISTS idx_ai_heartbeat_time ON ai_node_heartbeats(recorded_at);
CREATE INDEX IF NOT EXISTS idx_ai_heartbeat_status ON ai_node_heartbeats(status);

-- Partition hint: In production, consider partitioning by recorded_at for better performance
-- CREATE TABLE ai_node_heartbeats (
--     ...
-- ) PARTITION BY RANGE (recorded_at);

-- ========================================================================================
-- 5. AI NODE API KEYS
-- ========================================================================================
-- Secure API keys for node authentication

CREATE TABLE IF NOT EXISTS ai_node_api_keys (
    -- Primary Key
    key_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Node Reference
    node_id UUID NOT NULL REFERENCES local_ai_nodes(node_id) ON DELETE CASCADE,
    
    -- Key Details (we store hash, not the actual key)
    key_prefix VARCHAR(8) NOT NULL,  -- First 8 chars for identification
    key_hash VARCHAR(255) NOT NULL,  -- bcrypt hash of the full key
    key_name VARCHAR(100),           -- Human-readable name
    
    -- Permissions
    scopes JSONB DEFAULT '["heartbeat", "sync", "metrics"]'::jsonb,
    -- Example: ["heartbeat", "sync", "metrics", "ai_request", "admin"]
    
    -- Rate Limiting
    rate_limit_per_minute INTEGER DEFAULT 100,
    
    -- Status
    status VARCHAR(20) DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'REVOKED', 'EXPIRED')),
    
    -- Timestamps
    expires_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    use_count BIGINT DEFAULT 0,
    
    -- Revocation
    revoked_at TIMESTAMPTZ,
    revoked_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    
    -- Created
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for API keys
CREATE INDEX IF NOT EXISTS idx_ai_keys_node ON ai_node_api_keys(node_id);
CREATE INDEX IF NOT EXISTS idx_ai_keys_prefix ON ai_node_api_keys(key_prefix);
CREATE INDEX IF NOT EXISTS idx_ai_keys_status ON ai_node_api_keys(status);

-- ========================================================================================
-- 6. HELPER FUNCTIONS
-- ========================================================================================

-- Function to check if a node is online
CREATE OR REPLACE FUNCTION is_node_online(p_node_id UUID, p_timeout_minutes INTEGER DEFAULT 5)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM local_ai_nodes
        WHERE node_id = p_node_id
        AND status = 'ACTIVE'
        AND last_heartbeat > NOW() - INTERVAL '1 minute' * p_timeout_minutes
    );
END;
$$ LANGUAGE plpgsql;

-- Function to get available nodes for a hospital
CREATE OR REPLACE FUNCTION get_available_nodes(p_hospital_id INTEGER, p_capability VARCHAR DEFAULT NULL)
RETURNS TABLE (
    node_id UUID,
    node_code VARCHAR,
    endpoint_url VARCHAR,
    capabilities JSONB,
    health_metrics JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        n.node_id,
        n.node_code,
        n.endpoint_url,
        n.capabilities,
        n.health_metrics
    FROM local_ai_nodes n
    WHERE n.hospital_id = p_hospital_id
    AND n.status = 'ACTIVE'
    AND n.last_heartbeat > NOW() - INTERVAL '5 minutes'
    AND (p_capability IS NULL OR n.capabilities ? p_capability)
    ORDER BY n.last_heartbeat DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get routing rule for a request
CREATE OR REPLACE FUNCTION get_routing_rule(p_hospital_id INTEGER, p_request_type VARCHAR)
RETURNS TABLE (
    rule_id UUID,
    routing_strategy VARCHAR,
    fallback_strategy VARCHAR,
    target_node_id UUID,
    cloud_endpoint VARCHAR
) AS $$
BEGIN
    -- First try hospital-specific rule
    RETURN QUERY
    SELECT 
        r.rule_id,
        r.routing_strategy,
        r.fallback_strategy,
        r.target_node_id,
        r.cloud_endpoint
    FROM ai_routing_rules r
    WHERE r.hospital_id = p_hospital_id
    AND r.request_type = p_request_type
    AND r.is_active = true
    ORDER BY r.priority DESC
    LIMIT 1;
    
    -- If no hospital-specific rule, try global rule
    IF NOT FOUND THEN
        RETURN QUERY
        SELECT 
            r.rule_id,
            r.routing_strategy,
            r.fallback_strategy,
            r.target_node_id,
            r.cloud_endpoint
        FROM ai_routing_rules r
        WHERE r.hospital_id IS NULL
        AND r.request_type = p_request_type
        AND r.is_active = true
        ORDER BY r.priority DESC
        LIMIT 1;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ========================================================================================
-- 7. DEFAULT ROUTING RULES (Global Defaults)
-- ========================================================================================

INSERT INTO ai_routing_rules (request_type, priority, routing_strategy, fallback_strategy, is_active)
VALUES 
    ('SCRIBE', 0, 'PREFER_LOCAL', 'CLOUD', true),
    ('TRANSCRIPTION', 0, 'PREFER_LOCAL', 'CLOUD', true),
    ('PRESCRIPTION', 0, 'PREFER_LOCAL', 'CLOUD', true),
    ('CHAT', 0, 'PREFER_CLOUD', 'CLOUD', true),
    ('IMAGE', 0, 'PREFER_CLOUD', 'CLOUD', true)
ON CONFLICT DO NOTHING;

-- ========================================================================================
-- 8. UPDATE TRIGGERS
-- ========================================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_local_ai_nodes_modtime
    BEFORE UPDATE ON local_ai_nodes
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER update_ai_routing_rules_modtime
    BEFORE UPDATE ON ai_routing_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();

-- ========================================================================================
-- MIGRATION COMPLETE
-- ========================================================================================
-- Tables created:
--   1. local_ai_nodes - Registry of all AI nodes at hospital sites
--   2. ai_routing_rules - Request routing configuration
--   3. ai_node_sync_logs - Sync audit trail
--   4. ai_node_heartbeats - Health monitoring time-series
--   5. ai_node_api_keys - Secure authentication keys
--
-- Functions created:
--   - is_node_online() - Check if node is responsive
--   - get_available_nodes() - List online nodes for a hospital
--   - get_routing_rule() - Get routing config for request type
-- ========================================================================================
