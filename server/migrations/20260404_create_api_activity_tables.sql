-- ============================================
-- Activity Monitor Tables - Mobile App API
-- Created: April 4, 2026
-- ============================================
-- Main activity log table (one row per metric per recording)
CREATE TABLE IF NOT EXISTS api_activity_logs (
    activity_id VARCHAR(60) PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    user_id VARCHAR(50) NOT NULL REFERENCES api_users(user_id),
    -- Metric classification
    metric_type VARCHAR(50) NOT NULL,
    -- Allowed: heart_rate | bmi | calories | distance | sleep
    -- Recorded value and unit
    value DECIMAL(12, 4) NOT NULL,
    unit VARCHAR(30) NOT NULL,
    -- heart_rate → bpm
    -- bmi        → kg/m2
    -- calories   → kcal
    -- distance   → km
    -- sleep      → hours
    -- When this data point represents
    recorded_at TIMESTAMP NOT NULL,
    date DATE NOT NULL,
    -- derived from recorded_at for fast range queries
    -- Data source
    source VARCHAR(50) DEFAULT 'manual',
    -- manual | wearable | google_fit | apple_health | fitbit | garmin
    -- Optional rich metadata (e.g. resting vs active HR, sleep stages, step count)
    metadata JSONB DEFAULT '{}',
    -- Notes
    notes TEXT,
    -- Soft delete
    deleted_at TIMESTAMP,
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_api_activity_tenant ON api_activity_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_activity_user ON api_activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_api_activity_metric ON api_activity_logs(metric_type);
CREATE INDEX IF NOT EXISTS idx_api_activity_date ON api_activity_logs(date);
CREATE INDEX IF NOT EXISTS idx_api_activity_user_metric ON api_activity_logs(user_id, metric_type, date);
CREATE INDEX IF NOT EXISTS idx_api_activity_recorded_at ON api_activity_logs(recorded_at);
-- Auto-update updated_at
DO $$ BEGIN IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_api_activity_logs_updated_at'
) THEN CREATE TRIGGER update_api_activity_logs_updated_at BEFORE
UPDATE ON api_activity_logs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
END IF;
END;
$$;
-- ============================================
-- Lab Partners table (extends the existing lab tests catalog)
-- ============================================
CREATE TABLE IF NOT EXISTS api_lab_partners (
    partner_id VARCHAR(50) PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    name VARCHAR(255) NOT NULL,
    brand VARCHAR(255),
    logo_url VARCHAR(500),
    -- Contact
    phone VARCHAR(30),
    email VARCHAR(255),
    website VARCHAR(500),
    -- Address
    address JSONB DEFAULT '{}',
    -- {street, city, state, pincode, lat, lng}
    -- Capabilities
    home_collection BOOLEAN DEFAULT TRUE,
    lab_visit BOOLEAN DEFAULT TRUE,
    pickup_slots JSONB DEFAULT '[]',
    -- [{slot_label, start_time, end_time, days:[mon,tue,...]}]
    -- Status
    status VARCHAR(30) DEFAULT 'active',
    -- Metadata
    tenant_meta JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_api_lab_partners_tenant ON api_lab_partners(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_lab_partners_status ON api_lab_partners(status);
DO $$ BEGIN IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_api_lab_partners_updated_at'
) THEN CREATE TRIGGER update_api_lab_partners_updated_at BEFORE
UPDATE ON api_lab_partners FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
END IF;
END;
$$;
-- Add partner_id column to api_lab_bookings if not present
ALTER TABLE api_lab_bookings
ADD COLUMN IF NOT EXISTS partner_id VARCHAR(50);
-- Add payment_initiated_at column
ALTER TABLE api_lab_bookings
ADD COLUMN IF NOT EXISTS payment_initiated_at TIMESTAMP;
-- Add cancellation_reason column
ALTER TABLE api_lab_bookings
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
-- Add collected_at column (when phlebotomist collected sample)
ALTER TABLE api_lab_bookings
ADD COLUMN IF NOT EXISTS collected_at TIMESTAMP;