-- Mediqzy Platform API v1 Database Schema Migration
-- Created: February 6, 2026
-- Description: Multi-tenant platform schema for comprehensive wellness services

-- ============================================
-- TENANT MANAGEMENT
-- ============================================

CREATE TABLE IF NOT EXISTS tenants (
    tenant_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL, -- clinic, hospital, corporate, broker, tpa, insurance
    tier VARCHAR(50) DEFAULT 'basic', -- free, basic, pro, enterprise
    status VARCHAR(50) DEFAULT 'active',
    
    -- Configuration
    config JSONB DEFAULT '{}',
    branding JSONB DEFAULT '{}',
    features JSONB DEFAULT '{}',
    business_rules JSONB DEFAULT '{}',
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deactivated_at TIMESTAMP NULL
);

CREATE INDEX idx_tenants_type ON tenants(type);
CREATE INDEX idx_tenants_status ON tenants(status);

-- ============================================
-- USER MANAGEMENT
-- ============================================

CREATE TABLE IF NOT EXISTS api_users (
    user_id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(tenant_id),
    external_user_id VARCHAR(255) NOT NULL,
    
    -- Basic Info
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    date_of_birth DATE,
    gender VARCHAR(20),
    
    -- Address
    address JSONB,
    
    -- Emergency Contact
    emergency_contact JSONB,
    
    -- Status
    status VARCHAR(50) DEFAULT 'active',
    profile_complete BOOLEAN DEFAULT false,
    email_verified BOOLEAN DEFAULT false,
    phone_verified BOOLEAN DEFAULT false,
    
    -- Tenant-specific metadata
    tenant_meta JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    
    UNIQUE(tenant_id, external_user_id),
    UNIQUE(tenant_id, email)
);

CREATE INDEX idx_api_users_tenant ON api_users(tenant_id);
CREATE INDEX idx_api_users_email ON api_users(email);
CREATE INDEX idx_api_users_phone ON api_users(phone);
CREATE INDEX idx_api_users_external_id ON api_users(external_user_id);

-- ============================================
-- DOCTOR PROFILES
-- ============================================

CREATE TABLE IF NOT EXISTS api_doctors (
    doctor_id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(tenant_id),
    
    -- Basic Info
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(20),
    gender VARCHAR(20),
    
    -- Professional Info
    specialty VARCHAR(100),
    sub_specialty VARCHAR(100),
    qualification VARCHAR(500),
    experience_years INTEGER,
    registration_number VARCHAR(100),
    languages VARCHAR(255)[], 
    
    -- Bio & Profile
    bio TEXT,
    profile_image VARCHAR(500),
    
    -- Ratings
    rating DECIMAL(3,2) DEFAULT 0.0,
    total_reviews INTEGER DEFAULT 0,
    
    -- Consultation
    consultation_fee DECIMAL(10,2),
    currency VARCHAR(10) DEFAULT 'INR',
    consultation_types VARCHAR(50)[], -- online, offline, home-visit
    
    -- Availability
    working_hours JSONB,
    
    -- Hospital Affiliations
    hospital_affiliations TEXT[],
    
    -- Additional Info
    education JSONB,
    awards JSONB,
    publications JSONB,
    
    -- Status
    status VARCHAR(50) DEFAULT 'active',
    verified BOOLEAN DEFAULT false,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(tenant_id, email)
);

CREATE INDEX idx_api_doctors_tenant ON api_doctors(tenant_id);
CREATE INDEX idx_api_doctors_specialty ON api_doctors(specialty);
CREATE INDEX idx_api_doctors_rating ON api_doctors(rating DESC);
CREATE INDEX idx_api_doctors_status ON api_doctors(status);

-- ============================================
-- APPOINTMENTS
-- ============================================

CREATE TABLE IF NOT EXISTS api_appointments (
    appointment_id BIGSERIAL PRIMARY KEY,
    appointment_number VARCHAR(50) UNIQUE NOT NULL,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(tenant_id),
    
    -- Participants
    doctor_id VARCHAR(50) NOT NULL REFERENCES api_doctors(doctor_id),
    user_id VARCHAR(50) NOT NULL REFERENCES api_users(user_id),
    
    -- Schedule
    appointment_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
    
    -- Type & Status
    consultation_type VARCHAR(50) NOT NULL, -- online, offline, home-visit
    status VARCHAR(50) DEFAULT 'pending', -- pending, confirmed, in_progress, completed, cancelled, rescheduled
    
    -- Clinical Info
    symptoms TEXT,
    diagnosis TEXT,
    preferred_language VARCHAR(50),
    
    -- Meeting Details (for online consultations)
    meeting_details JSONB,
    
    -- Payment
    consultation_fee DECIMAL(10,2),
    insurance_policy_id VARCHAR(100),
    insurance_covered DECIMAL(10,2),
    copay_amount DECIMAL(10,2),
    currency VARCHAR(10) DEFAULT 'INR',
    payment_status VARCHAR(50) DEFAULT 'pending',
    
    -- Cancellation
    cancelled_by VARCHAR(50),
    cancellation_reason TEXT,
    cancelled_at TIMESTAMP,
    refund_amount DECIMAL(10,2),
    refund_status VARCHAR(50),
    
    -- Rescheduling
    rescheduled_from BIGINT REFERENCES api_appointments(appointment_id),
    rescheduled_to BIGINT REFERENCES api_appointments(appointment_id),
    
    -- Prescription
    prescription_id VARCHAR(50),
    
    -- Tenant metadata
    tenant_meta JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_api_appointments_tenant ON api_appointments(tenant_id);
CREATE INDEX idx_api_appointments_doctor ON api_appointments(doctor_id);
CREATE INDEX idx_api_appointments_user ON api_appointments(user_id);
CREATE INDEX idx_api_appointments_date ON api_appointments(appointment_date);
CREATE INDEX idx_api_appointments_status ON api_appointments(status);
CREATE INDEX idx_api_appointments_number ON api_appointments(appointment_number);

-- ============================================
-- PRESCRIPTIONS
-- ============================================

CREATE TABLE IF NOT EXISTS api_prescriptions (
    prescription_id VARCHAR(50) PRIMARY KEY,
    prescription_number VARCHAR(50) UNIQUE NOT NULL,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(tenant_id),
    
    -- References
    appointment_id BIGINT REFERENCES api_appointments(appointment_id),
    doctor_id VARCHAR(50) NOT NULL REFERENCES api_doctors(doctor_id),
    patient_id VARCHAR(50) NOT NULL REFERENCES api_users(user_id),
    
    -- Clinical
    diagnosis TEXT,
    medications JSONB NOT NULL,
    notes TEXT,
    
    -- Validity
    valid_until DATE,
    
    -- Document
    prescription_url VARCHAR(500),
    
    -- Status
    status VARCHAR(50) DEFAULT 'active',
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_api_prescriptions_tenant ON api_prescriptions(tenant_id);
CREATE INDEX idx_api_prescriptions_doctor ON api_prescriptions(doctor_id);
CREATE INDEX idx_api_prescriptions_patient ON api_prescriptions(patient_id);
CREATE INDEX idx_api_prescriptions_appointment ON api_prescriptions(appointment_id);

-- ============================================
-- LAB TESTS & BOOKINGS
-- ============================================

CREATE TABLE IF NOT EXISTS api_lab_tests (
    test_id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(tenant_id),
    
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    description TEXT,
    preparation_required BOOLEAN DEFAULT false,
    preparation_instructions TEXT,
    sample_type VARCHAR(100),
    turnaround_time_hours INTEGER,
    
    -- Pricing
    price_min DECIMAL(10,2),
    price_max DECIMAL(10,2),
    currency VARCHAR(10) DEFAULT 'INR',
    
    -- Status
    status VARCHAR(50) DEFAULT 'active',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_api_lab_tests_tenant ON api_lab_tests(tenant_id);
CREATE INDEX idx_api_lab_tests_category ON api_lab_tests(category);

CREATE TABLE IF NOT EXISTS api_lab_bookings (
    booking_id VARCHAR(50) PRIMARY KEY,
    booking_number VARCHAR(50) UNIQUE NOT NULL,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(tenant_id),
    
    -- User
    user_id VARCHAR(50) NOT NULL REFERENCES api_users(user_id),
    
    -- Lab
    lab_id VARCHAR(50),
    lab_name VARCHAR(255),
    
    -- Tests
    test_ids TEXT[],
    
    -- Collection
    collection_type VARCHAR(50), -- home, lab-visit
    collection_address JSONB,
    collection_date DATE,
    collection_time_slot VARCHAR(50),
    
    -- Status
    status VARCHAR(50) DEFAULT 'pending', -- pending, confirmed, sample_collected, processing, completed, cancelled
    
    -- Prescription
    prescription_id VARCHAR(50),
    
    -- Payment
    total_amount DECIMAL(10,2),
    insurance_covered DECIMAL(10,2),
    copay DECIMAL(10,2),
    currency VARCHAR(10) DEFAULT 'INR',
    insurance_claim BOOLEAN DEFAULT false,
    
    -- Reports
    reports JSONB,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_api_lab_bookings_tenant ON api_lab_bookings(tenant_id);
CREATE INDEX idx_api_lab_bookings_user ON api_lab_bookings(user_id);
CREATE INDEX idx_api_lab_bookings_status ON api_lab_bookings(status);

-- ============================================
-- PHARMACY ORDERS
-- ============================================

CREATE TABLE IF NOT EXISTS api_pharmacy_orders (
    order_id VARCHAR(50) PRIMARY KEY,
    order_number VARCHAR(50) UNIQUE NOT NULL,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(tenant_id),
    
    -- User
    user_id VARCHAR(50) NOT NULL REFERENCES api_users(user_id),
    
    -- Prescription
    prescription_id VARCHAR(50),
    
    -- Items
    items JSONB NOT NULL,
    
    -- Delivery
    delivery_address JSONB NOT NULL,
    delivery_type VARCHAR(50), -- standard, express, same-day
    delivery_status VARCHAR(50) DEFAULT 'pending',
    estimated_delivery DATE,
    
    -- Payment
    subtotal DECIMAL(10,2),
    delivery_charges DECIMAL(10,2),
    total_amount DECIMAL(10,2),
    insurance_covered DECIMAL(10,2),
    copay DECIMAL(10,2),
    currency VARCHAR(10) DEFAULT 'INR',
    payment_status VARCHAR(50) DEFAULT 'pending',
    insurance_claim BOOLEAN DEFAULT false,
    
    -- Tracking
    tracking JSONB,
    
    -- Documents
    invoice_url VARCHAR(500),
    
    -- Status
    status VARCHAR(50) DEFAULT 'pending',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_api_pharmacy_orders_tenant ON api_pharmacy_orders(tenant_id);
CREATE INDEX idx_api_pharmacy_orders_user ON api_pharmacy_orders(user_id);
CREATE INDEX idx_api_pharmacy_orders_status ON api_pharmacy_orders(status);

-- ============================================
-- HOME CARE SERVICES & BOOKINGS
-- ============================================

CREATE TABLE IF NOT EXISTS api_homecare_services (
    service_id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(tenant_id),
    
    service_type VARCHAR(100) NOT NULL, -- nursing, physiotherapy, etc.
    service_name VARCHAR(255) NOT NULL,
    provider VARCHAR(255),
    description TEXT,
    
    -- Qualifications
    qualifications TEXT[],
    services_included TEXT[],
    
    -- Pricing
    price_per_visit DECIMAL(10,2),
    price_per_day DECIMAL(10,2),
    currency VARCHAR(10) DEFAULT 'INR',
    
    -- Rating
    rating DECIMAL(3,2) DEFAULT 0.0,
    
    -- Availability
    available_from DATE,
    
    status VARCHAR(50) DEFAULT 'active',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_api_homecare_services_tenant ON api_homecare_services(tenant_id);
CREATE INDEX idx_api_homecare_services_type ON api_homecare_services(service_type);

CREATE TABLE IF NOT EXISTS api_homecare_bookings (
    booking_id VARCHAR(50) PRIMARY KEY,
    booking_number VARCHAR(50) UNIQUE NOT NULL,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(tenant_id),
    
    -- User
    user_id VARCHAR(50) NOT NULL REFERENCES api_users(user_id),
    
    -- Service
    service_id VARCHAR(50) REFERENCES api_homecare_services(service_id),
    service_type VARCHAR(100),
    provider VARCHAR(255),
    
    -- Professional
    professional JSONB,
    
    -- Schedule
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    visits_per_day INTEGER,
    total_visits INTEGER,
    preferred_time_slots TEXT[],
    
    -- Address
    service_address JSONB NOT NULL,
    
    -- Instructions
    special_instructions TEXT,
    
    -- Payment
    total_amount DECIMAL(10,2),
    insurance_covered DECIMAL(10,2),
    copay DECIMAL(10,2),
    currency VARCHAR(10) DEFAULT 'INR',
    insurance_claim BOOLEAN DEFAULT false,
    
    -- Status
    status VARCHAR(50) DEFAULT 'pending',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_api_homecare_bookings_tenant ON api_homecare_bookings(tenant_id);
CREATE INDEX idx_api_homecare_bookings_user ON api_homecare_bookings(user_id);
CREATE INDEX idx_api_homecare_bookings_status ON api_homecare_bookings(status);

-- ============================================
-- WELLNESS & HRA
-- ============================================

CREATE TABLE IF NOT EXISTS api_hra_assessments (
    assessment_id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(tenant_id),
    
    -- User
    user_id VARCHAR(50) NOT NULL REFERENCES api_users(user_id),
    
    -- Assessment
    assessment_type VARCHAR(50) NOT NULL, -- basic, comprehensive, diabetes, cardiac
    assessment_date DATE NOT NULL,
    responses JSONB NOT NULL,
    
    -- Results
    risk_score INTEGER,
    risk_category VARCHAR(50),
    risk_factors JSONB,
    recommendations JSONB,
    
    -- Report
    report_url VARCHAR(500),
    
    -- Next Assessment
    next_assessment_due DATE,
    
    -- Status
    status VARCHAR(50) DEFAULT 'completed',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_api_hra_assessments_tenant ON api_hra_assessments(tenant_id);
CREATE INDEX idx_api_hra_assessments_user ON api_hra_assessments(user_id);

CREATE TABLE IF NOT EXISTS api_wellness_plans (
    plan_id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(tenant_id),
    
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100), -- fitness, weight-loss, diabetes-prevention, etc.
    duration_months INTEGER,
    
    -- Features
    features TEXT[],
    expected_outcomes TEXT[],
    
    -- Pricing
    price DECIMAL(10,2),
    currency VARCHAR(10) DEFAULT 'INR',
    
    -- Target
    target_audience TEXT,
    
    status VARCHAR(50) DEFAULT 'active',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_api_wellness_plans_tenant ON api_wellness_plans(tenant_id);
CREATE INDEX idx_api_wellness_plans_category ON api_wellness_plans(category);

-- ============================================
-- CHAT ROOMS & MESSAGES
-- ============================================

CREATE TABLE IF NOT EXISTS api_chat_rooms (
    room_id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(tenant_id),
    
    -- Appointment
    appointment_id BIGINT REFERENCES api_appointments(appointment_id),
    
    -- Participants
    participants TEXT[] NOT NULL,
    
    -- Status
    status VARCHAR(50) DEFAULT 'active',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_api_chat_rooms_tenant ON api_chat_rooms(tenant_id);
CREATE INDEX idx_api_chat_rooms_appointment ON api_chat_rooms(appointment_id);

CREATE TABLE IF NOT EXISTS api_chat_messages (
    message_id VARCHAR(50) PRIMARY KEY,
    room_id VARCHAR(50) NOT NULL REFERENCES api_chat_rooms(room_id),
    
    -- Sender
    sender_id VARCHAR(50) NOT NULL,
    sender_role VARCHAR(50),
    
    -- Content
    message_type VARCHAR(50) NOT NULL, -- text, image, audio, file
    content TEXT,
    attachments JSONB,
    
    -- Status
    read BOOLEAN DEFAULT false,
    delivered BOOLEAN DEFAULT false,
    
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_api_chat_messages_room ON api_chat_messages(room_id);
CREATE INDEX idx_api_chat_messages_timestamp ON api_chat_messages(timestamp DESC);

-- ============================================
-- WEBHOOKS
-- ============================================

CREATE TABLE IF NOT EXISTS api_webhooks (
    webhook_id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(tenant_id),
    
    url VARCHAR(500) NOT NULL,
    events TEXT[] NOT NULL,
    secret VARCHAR(255) NOT NULL,
    
    status VARCHAR(50) DEFAULT 'active',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_api_webhooks_tenant ON api_webhooks(tenant_id);

CREATE TABLE IF NOT EXISTS api_webhook_deliveries (
    delivery_id VARCHAR(50) PRIMARY KEY,
    webhook_id VARCHAR(50) NOT NULL REFERENCES api_webhooks(webhook_id),
    
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    
    -- Delivery
    http_status INTEGER,
    response_body TEXT,
    attempts INTEGER DEFAULT 1,
    
    -- Status
    status VARCHAR(50) DEFAULT 'pending', -- pending, success, failed
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    delivered_at TIMESTAMP
);

CREATE INDEX idx_api_webhook_deliveries_webhook ON api_webhook_deliveries(webhook_id);
CREATE INDEX idx_api_webhook_deliveries_status ON api_webhook_deliveries(status);

-- ============================================
-- AUDIT & CONSENT LOGS
-- ============================================

CREATE TABLE IF NOT EXISTS api_audit_logs (
    log_id BIGSERIAL PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    
    -- Actor
    user_id VARCHAR(50),
    user_role VARCHAR(50),
    
    -- Action
    action VARCHAR(100) NOT NULL, -- read, create, update, delete, auth
    resource_type VARCHAR(100) NOT NULL,
    resource_id VARCHAR(100),
    
    -- Request
    endpoint VARCHAR(500),
    http_method VARCHAR(10),
    ip_address VARCHAR(50),
    user_agent TEXT,
    
    -- Data
    before_state JSONB,
    after_state JSONB,
    
    -- Timestamp
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_api_audit_logs_tenant ON api_audit_logs(tenant_id);
CREATE INDEX idx_api_audit_logs_user ON api_audit_logs(user_id);
CREATE INDEX idx_api_audit_logs_timestamp ON api_audit_logs(timestamp DESC);
CREATE INDEX idx_api_audit_logs_action ON api_audit_logs(action);

CREATE TABLE IF NOT EXISTS api_consent_logs (
    consent_id BIGSERIAL PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    
    -- User
    user_id VARCHAR(50) NOT NULL,
    
    -- Consent
    consent_type VARCHAR(100) NOT NULL, -- treatment, marketing, research, data_sharing
    purpose TEXT NOT NULL,
    granted BOOLEAN NOT NULL,
    
    -- Version
    consent_version VARCHAR(50),
    
    -- Metadata
    ip_address VARCHAR(50),
    user_agent TEXT,
    digital_signature VARCHAR(500),
    
    -- Timestamps
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    withdrawn_at TIMESTAMP,
    expires_at TIMESTAMP
);

CREATE INDEX idx_api_consent_logs_tenant ON api_consent_logs(tenant_id);
CREATE INDEX idx_api_consent_logs_user ON api_consent_logs(user_id);
CREATE INDEX idx_api_consent_logs_type ON api_consent_logs(consent_type);

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_api_users_updated_at BEFORE UPDATE ON api_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_api_doctors_updated_at BEFORE UPDATE ON api_doctors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_api_appointments_updated_at BEFORE UPDATE ON api_appointments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- INITIAL SEED DATA
-- ============================================

-- Insert default tenant for testing
INSERT INTO tenants (tenant_id, name, type, tier, status)
VALUES ('clinic-demo', 'Demo Clinic', 'clinic', 'pro', 'active')
ON CONFLICT (tenant_id) DO NOTHING;

-- ============================================
-- MIGRATION COMPLETE
-- ============================================

COMMENT ON TABLE tenants IS 'Multi-tenant organizations using Mediqzy platform';
COMMENT ON TABLE api_users IS 'Patients and users across all tenants';
COMMENT ON TABLE api_doctors IS 'Healthcare providers offering consultations';
COMMENT ON TABLE api_appointments IS 'Appointment bookings and consultations';
COMMENT ON TABLE api_prescriptions IS 'Medication prescriptions from doctors';
COMMENT ON TABLE api_audit_logs IS 'Immutable audit trail for all operations';
COMMENT ON TABLE api_consent_logs IS 'Patient consent records for data processing';
