-- Replaces hardcoded, globally-shared in-memory mock data in corporate.route.js
-- (corporateDepartments, corporateBusinessUnits, corporateComplaints,
-- corporateReports, corporateNotifications) with real, corporate-scoped tables.
-- insurance_claims (existing table) is reused for claims, not duplicated here.

CREATE TABLE IF NOT EXISTS corporate_departments (
    id BIGSERIAL PRIMARY KEY,
    corporate_id BIGINT NOT NULL REFERENCES corporates(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    manager VARCHAR(200),
    budget VARCHAR(50),
    location VARCHAR(200),
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_corp_departments_corporate ON corporate_departments (corporate_id);

CREATE TABLE IF NOT EXISTS corporate_business_units (
    id BIGSERIAL PRIMARY KEY,
    corporate_id BIGINT NOT NULL REFERENCES corporates(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    head VARCHAR(200),
    budget VARCHAR(50),
    region VARCHAR(200),
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_corp_business_units_corporate ON corporate_business_units (corporate_id);

CREATE TABLE IF NOT EXISTS corporate_complaints (
    id BIGSERIAL PRIMARY KEY,
    corporate_id BIGINT NOT NULL REFERENCES corporates(id) ON DELETE CASCADE,
    employee_user_id BIGINT,
    employee_name VARCHAR(200),
    employee_id VARCHAR(100),
    category VARCHAR(100) NOT NULL,
    subject VARCHAR(300) NOT NULL,
    description TEXT NOT NULL,
    priority VARCHAR(20) NOT NULL DEFAULT 'medium',
    status VARCHAR(20) NOT NULL DEFAULT 'open',
    assigned_to VARCHAR(200),
    submitted_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_corp_complaints_corporate ON corporate_complaints (corporate_id, status);

CREATE TABLE IF NOT EXISTS corporate_generated_reports (
    id BIGSERIAL PRIMARY KEY,
    corporate_id BIGINT NOT NULL REFERENCES corporates(id) ON DELETE CASCADE,
    title VARCHAR(300) NOT NULL,
    category VARCHAR(100),
    period VARCHAR(100),
    format VARCHAR(20) NOT NULL DEFAULT 'CSV',
    status VARCHAR(20) NOT NULL DEFAULT 'ready',
    generated_by BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_corp_reports_corporate ON corporate_generated_reports (corporate_id, created_at DESC);

CREATE TABLE IF NOT EXISTS corporate_notifications (
    id BIGSERIAL PRIMARY KEY,
    corporate_id BIGINT NOT NULL REFERENCES corporates(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(300) NOT NULL,
    message TEXT NOT NULL,
    priority VARCHAR(20) NOT NULL DEFAULT 'medium',
    read BOOLEAN NOT NULL DEFAULT FALSE,
    source_key VARCHAR(200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_corp_notifications_source ON corporate_notifications (corporate_id, source_key) WHERE source_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_corp_notifications_corporate ON corporate_notifications (corporate_id, read, created_at DESC);
