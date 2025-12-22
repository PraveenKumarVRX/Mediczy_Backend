-- Migration: Add A/B Testing and AI Routing Tables
-- Created: 2025-12-20

-- A/B Tests table
CREATE TABLE IF NOT EXISTS sib_ab_tests (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    test_type VARCHAR(50) NOT NULL DEFAULT 'notification', -- notification, workflow, message_content
    status VARCHAR(20) NOT NULL DEFAULT 'draft', -- draft, active, paused, completed
    variant_a JSONB NOT NULL DEFAULT '{}', -- Control group configuration
    variant_b JSONB NOT NULL DEFAULT '{}', -- Treatment group configuration
    allocation_ratio DECIMAL(3,2) DEFAULT 0.5, -- 0.5 = 50/50 split
    target_audience JSONB DEFAULT '{}', -- Targeting criteria
    success_metrics JSONB DEFAULT '[]', -- ['views', 'clicks', 'conversions']
    start_date TIMESTAMP,
    end_date TIMESTAMP,
    sample_size INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_ab_tests_status ON sib_ab_tests(status);
CREATE INDEX idx_ab_tests_type ON sib_ab_tests(test_type);

-- A/B Test Assignments table (user to variant mapping)
CREATE TABLE IF NOT EXISTS sib_ab_test_assignments (
    id SERIAL PRIMARY KEY,
    test_id INTEGER NOT NULL REFERENCES sib_ab_tests(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL,
    variant VARCHAR(20) NOT NULL, -- variant_a or variant_b
    assigned_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(test_id, user_id)
);

CREATE INDEX idx_ab_assignments_test ON sib_ab_test_assignments(test_id);
CREATE INDEX idx_ab_assignments_user ON sib_ab_test_assignments(user_id);

-- A/B Test Events table (tracking views, clicks, conversions)
CREATE TABLE IF NOT EXISTS sib_ab_test_events (
    id SERIAL PRIMARY KEY,
    test_id INTEGER NOT NULL REFERENCES sib_ab_tests(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL,
    variant VARCHAR(20) NOT NULL,
    event_type VARCHAR(50) NOT NULL, -- view, click, conversion, etc.
    event_data JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_ab_events_test ON sib_ab_test_events(test_id);
CREATE INDEX idx_ab_events_user ON sib_ab_test_events(user_id);
CREATE INDEX idx_ab_events_type ON sib_ab_test_events(event_type);
CREATE INDEX idx_ab_events_variant ON sib_ab_test_events(variant);

-- A/B Test Analysis Results table (periodic analysis snapshots)
CREATE TABLE IF NOT EXISTS sib_ab_test_analysis_results (
    id SERIAL PRIMARY KEY,
    test_id INTEGER NOT NULL REFERENCES sib_ab_tests(id) ON DELETE CASCADE,
    analysis_timestamp TIMESTAMP DEFAULT NOW(),
    variant_a_stats JSONB DEFAULT '{}',
    variant_b_stats JSONB DEFAULT '{}',
    summary JSONB DEFAULT '{}'
);

CREATE INDEX idx_ab_analysis_test ON sib_ab_test_analysis_results(test_id);
CREATE INDEX idx_ab_analysis_timestamp ON sib_ab_test_analysis_results(analysis_timestamp);

-- AI Routing Logs table
CREATE TABLE IF NOT EXISTS sib_routing_logs (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL,
    timestamp TIMESTAMP DEFAULT NOW(),
    risk_level VARCHAR(20) NOT NULL, -- low, moderate, high, critical
    confidence_score DECIMAL(3,2), -- 0.00 to 1.00
    workflows_recommended INTEGER DEFAULT 0,
    workflows_triggered INTEGER DEFAULT 0,
    context JSONB DEFAULT '{}', -- Full context analysis
    results JSONB DEFAULT '{}', -- Triggered workflow results
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_routing_logs_patient ON sib_routing_logs(patient_id);
CREATE INDEX idx_routing_logs_timestamp ON sib_routing_logs(timestamp);
CREATE INDEX idx_routing_logs_risk ON sib_routing_logs(risk_level);

-- Sample A/B Test data (example)
INSERT INTO sib_ab_tests (name, description, test_type, variant_a, variant_b, allocation_ratio, success_metrics, status)
VALUES 
(
    'Notification Message Length Test',
    'Testing short vs long notification messages for engagement',
    'notification',
    '{"message": "Your health check is ready. View now.", "title": "Health Alert", "channels": ["push", "email"]}',
    '{"message": "Your comprehensive health assessment has been completed. Click here to view detailed results and recommendations from our care team.", "title": "Comprehensive Health Alert", "channels": ["push", "email"]}',
    0.5,
    '["views", "clicks", "conversions"]',
    'draft'
),
(
    'WhatsApp vs Email Test',
    'Testing notification channel effectiveness',
    'notification',
    '{"channels": ["email"], "message": "Health update available"}',
    '{"channels": ["whatsapp"], "message": "Health update available"}',
    0.5,
    '["views", "clicks", "conversions"]',
    'draft'
);

COMMENT ON TABLE sib_ab_tests IS 'A/B test configurations for notification effectiveness experiments';
COMMENT ON TABLE sib_ab_test_assignments IS 'User assignments to A/B test variants (deterministic based on hash)';
COMMENT ON TABLE sib_ab_test_events IS 'A/B test event tracking (views, clicks, conversions)';
COMMENT ON TABLE sib_routing_logs IS 'AI-driven workflow routing decision logs';
