-- Home collection phlebotomist workflow tables
-- Created: 2026-05-28
CREATE TABLE IF NOT EXISTS api_lab_home_collection_jobs (
    job_id VARCHAR(50) PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    booking_id VARCHAR(50) NOT NULL REFERENCES api_lab_bookings(booking_id),
    -- Assignment
    phlebotomist_id VARCHAR(50),
    phlebotomist_name VARCHAR(255),
    phlebotomist_phone VARCHAR(30),
    -- Lifecycle
    status VARCHAR(30) NOT NULL DEFAULT 'unassigned',
    scheduled_date DATE,
    scheduled_slot VARCHAR(100),
    pickup_address JSONB DEFAULT '{}'::jsonb,
    -- Execution details
    proof_of_collection JSONB DEFAULT '{}'::jsonb,
    handover_details JSONB DEFAULT '{}'::jsonb,
    notes TEXT,
    -- Milestones
    assigned_at TIMESTAMP,
    en_route_at TIMESTAMP,
    arrived_at TIMESTAMP,
    collected_at TIMESTAMP,
    in_transit_at TIMESTAMP,
    handed_over_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_api_lab_home_collection_status CHECK (
        status IN (
            'unassigned',
            'assigned',
            'en_route',
            'arrived',
            'collected',
            'in_transit',
            'handed_over',
            'cancelled'
        )
    )
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_lab_home_collection_jobs_booking_unique ON api_lab_home_collection_jobs(tenant_id, booking_id)
WHERE status NOT IN ('cancelled', 'handed_over');
CREATE INDEX IF NOT EXISTS idx_api_lab_home_collection_jobs_tenant ON api_lab_home_collection_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_lab_home_collection_jobs_status ON api_lab_home_collection_jobs(status);
CREATE INDEX IF NOT EXISTS idx_api_lab_home_collection_jobs_phlebotomist ON api_lab_home_collection_jobs(phlebotomist_id);
CREATE TABLE IF NOT EXISTS api_lab_home_collection_events (
    id BIGSERIAL PRIMARY KEY,
    event_id VARCHAR(60) UNIQUE NOT NULL,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    job_id VARCHAR(50) NOT NULL REFERENCES api_lab_home_collection_jobs(job_id),
    booking_id VARCHAR(50) NOT NULL REFERENCES api_lab_bookings(booking_id),
    event_type VARCHAR(80) NOT NULL,
    event_payload JSONB DEFAULT '{}'::jsonb,
    actor_id VARCHAR(50),
    actor_role VARCHAR(80),
    actor_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_api_lab_home_collection_events_job ON api_lab_home_collection_events(job_id);
CREATE INDEX IF NOT EXISTS idx_api_lab_home_collection_events_tenant ON api_lab_home_collection_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_lab_home_collection_events_created ON api_lab_home_collection_events(created_at DESC);
DO $$ BEGIN IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_api_lab_home_collection_jobs_updated_at'
) THEN CREATE TRIGGER update_api_lab_home_collection_jobs_updated_at BEFORE
UPDATE ON api_lab_home_collection_jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
END IF;
END;
$$;