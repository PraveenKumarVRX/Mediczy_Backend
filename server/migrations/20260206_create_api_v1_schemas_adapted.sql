-- Mediqzy Platform API v1 Database Schema Migration (Adapted for existing DB)
-- Created: February 6, 2026
-- Description: Multi-tenant API schema using existing tenants table

-- Note: Using existing 'tenants' table with INTEGER id column

-- ============================================
-- USER MANAGEMENT
-- ============================================

CREATE TABLE IF NOT EXISTS api_users (
    user_id VARCHAR(50) PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
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

CREATE INDEX IF NOT EXISTS idx_api_users_tenant ON api_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_users_email ON api_users(email);
CREATE INDEX IF NOT EXISTS idx_api_users_phone ON api_users(phone);
CREATE INDEX IF NOT EXISTS idx_api_users_external_id ON api_users(external_user_id);

-- ============================================
-- DOCTOR PROFILES
-- ============================================

CREATE TABLE IF NOT EXISTS api_doctors (
    doctor_id VARCHAR(50) PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    
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
    profile_image_url VARCHAR(500),
    
    -- Availability
    available_days VARCHAR(20)[] DEFAULT '{"Monday","Tuesday","Wednesday","Thursday","Friday"}',
    consultation_mode VARCHAR(20)[] DEFAULT '{"in-person","video","chat"}',
    
    -- Pricing
    consultation_fee DECIMAL(10,2),
    follow_up_fee DECIMAL(10,2),
    currency VARCHAR(10) DEFAULT 'INR',
    
    -- Status
    status VARCHAR(50) DEFAULT 'active',
    verified BOOLEAN DEFAULT false,
    
    -- Metadata
    tenant_meta JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL
);

CREATE INDEX IF NOT EXISTS idx_api_doctors_tenant ON api_doctors(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_doctors_specialty ON api_doctors(specialty);
CREATE INDEX IF NOT EXISTS idx_api_doctors_status ON api_doctors(status);

-- ============================================
-- APPOINTMENTS
-- ============================================

CREATE TABLE IF NOT EXISTS api_appointments (
    appointment_id VARCHAR(50) PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    user_id VARCHAR(50) NOT NULL REFERENCES api_users(user_id),
    doctor_id VARCHAR(50) NOT NULL REFERENCES api_doctors(doctor_id),
    
    -- Appointment Details
    appointment_type VARCHAR(50) NOT NULL, -- consultation, follow-up, emergency
    consultation_mode VARCHAR(50) NOT NULL, -- in-person, video, chat, home-visit
    scheduled_date DATE NOT NULL,
    scheduled_time TIME NOT NULL,
    duration_minutes INTEGER DEFAULT 30,
    timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
    
    -- Status Management
    status VARCHAR(50) DEFAULT 'scheduled',
    cancellation_reason TEXT,
    cancelled_by VARCHAR(20),
    rescheduled_from VARCHAR(50),
    
    -- Visit Info
    visit_type VARCHAR(50), -- first-visit, follow-up
    symptoms TEXT,
    chief_complaint TEXT,
    notes TEXT,
    
    -- Location (for in-person/home-visit)
    location JSONB,
    
    -- Financial
    amount DECIMAL(10,2),
    currency VARCHAR(10) DEFAULT 'INR',
    payment_status VARCHAR(50) DEFAULT 'pending',
    payment_id VARCHAR(100),
    
    -- Metadata
    tenant_meta JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    cancelled_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_appointments_tenant ON api_appointments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_appointments_user ON api_appointments(user_id);
CREATE INDEX IF NOT EXISTS idx_api_appointments_doctor ON api_appointments(doctor_id);
CREATE INDEX IF NOT EXISTS idx_api_appointments_date ON api_appointments(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_api_appointments_status ON api_appointments(status);

-- ============================================
-- CHAT (Real-time Messaging)
-- ============================================

CREATE TABLE IF NOT EXISTS api_chat_rooms (
    room_id VARCHAR(50) PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    
    -- Participants
    patient_id VARCHAR(50) NOT NULL REFERENCES api_users(user_id),
    doctor_id VARCHAR(50) NOT NULL REFERENCES api_doctors(doctor_id),
    appointment_id VARCHAR(50) REFERENCES api_appointments(appointment_id),
    
    -- Room Info
    room_type VARCHAR(50) DEFAULT 'consultation', -- consultation, support, follow-up
    status VARCHAR(50) DEFAULT 'active', -- active, closed, archived
    
    -- Metadata
    last_message_at TIMESTAMP,
    last_message_preview TEXT,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_chat_rooms_tenant ON api_chat_rooms(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_chat_rooms_patient ON api_chat_rooms(patient_id);
CREATE INDEX IF NOT EXISTS idx_api_chat_rooms_doctor ON api_chat_rooms(doctor_id);
CREATE INDEX IF NOT EXISTS idx_api_chat_rooms_status ON api_chat_rooms(status);

CREATE TABLE IF NOT EXISTS api_chat_messages (
    message_id VARCHAR(50) PRIMARY KEY,
    room_id VARCHAR(50) NOT NULL REFERENCES api_chat_rooms(room_id),
    
    -- Sender Info
    sender_id VARCHAR(50) NOT NULL,
    sender_type VARCHAR(20) NOT NULL, -- patient, doctor, system
    
    -- Message Content
    content TEXT NOT NULL,
    message_type VARCHAR(50) DEFAULT 'text', -- text, image, file, prescription, report
    
    -- Attachments
    attachment JSONB, -- {url, type, size, filename}
    
    -- Status
    is_read BOOLEAN DEFAULT false,
    is_edited BOOLEAN DEFAULT false,
    is_deleted BOOLEAN DEFAULT false,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_chat_messages_room ON api_chat_messages(room_id);
CREATE INDEX IF NOT EXISTS idx_api_chat_messages_sender ON api_chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_api_chat_messages_created ON api_chat_messages(created_at DESC);

-- ============================================
-- LAB TESTS
-- ============================================

CREATE TABLE IF NOT EXISTS api_lab_tests (
    test_id VARCHAR(50) PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    
    -- Test Details
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100), -- blood, urine, radiology, pathology
    sub_category VARCHAR(100),
    
    -- Test Info
    test_code VARCHAR(50),
    sample_type VARCHAR(100), -- blood, urine, stool, etc.
    preparation_instructions TEXT,
    turnaround_time_hours INTEGER,
    
    -- Pricing
    price DECIMAL(10,2),
    home_collection_charge DECIMAL(10,2),
    currency VARCHAR(10) DEFAULT 'INR',
    
    -- Status
    status VARCHAR(50) DEFAULT 'active',
    
    -- Provider
    provider_name VARCHAR(255),
    provider_lab_id VARCHAR(100),
    
    -- Metadata
    tenant_meta JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_lab_tests_tenant ON api_lab_tests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_lab_tests_category ON api_lab_tests(category);
CREATE INDEX IF NOT EXISTS idx_api_lab_tests_status ON api_lab_tests(status);

CREATE TABLE IF NOT EXISTS api_lab_bookings (
    booking_id VARCHAR(50) PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    user_id VARCHAR(50) NOT NULL REFERENCES api_users(user_id),
    
    -- Test Details
    tests JSONB NOT NULL, -- [{test_id, name, price}]
    
    -- Collection Details
    collection_type VARCHAR(50) NOT NULL, -- home-collection, lab-visit
    collection_date DATE,
    collection_time_slot VARCHAR(50),
    collection_address JSONB,
    
    -- Patient Info
    patient_name VARCHAR(255),
    patient_age INTEGER,
    patient_gender VARCHAR(20),
    
    -- Status
    status VARCHAR(50) DEFAULT 'pending',
    payment_status VARCHAR(50) DEFAULT 'pending',
    
    -- Financial
    total_amount DECIMAL(10,2),
    currency VARCHAR(10) DEFAULT 'INR',
    payment_id VARCHAR(100),
    
    -- Reports
    report_url VARCHAR(500),
    report_uploaded_at TIMESTAMP,
    
    -- Notes
    doctor_notes TEXT,
    lab_notes TEXT,
    
    -- Metadata
    tenant_meta JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    cancelled_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_lab_bookings_tenant ON api_lab_bookings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_lab_bookings_user ON api_lab_bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_api_lab_bookings_status ON api_lab_bookings(status);
CREATE INDEX IF NOT EXISTS idx_api_lab_bookings_date ON api_lab_bookings(collection_date);

-- ============================================
-- PHARMACY & PRESCRIPTIONS
-- ============================================

CREATE TABLE IF NOT EXISTS api_prescriptions (
    prescription_id VARCHAR(50) PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    user_id VARCHAR(50) NOT NULL REFERENCES api_users(user_id),
    doctor_id VARCHAR(50) NOT NULL REFERENCES api_doctors(doctor_id),
    appointment_id VARCHAR(50) REFERENCES api_appointments(appointment_id),
    
    -- Prescription Details
    diagnosis TEXT,
    medications JSONB NOT NULL, -- [{name, dosage, frequency, duration, instructions}]
    
    -- Validity
    valid_until DATE,
    refills_allowed INTEGER DEFAULT 0,
    refills_used INTEGER DEFAULT 0,
    
    -- Status
    status VARCHAR(50) DEFAULT 'active',
    
    -- Digital Signature
    signed_by VARCHAR(50) REFERENCES api_doctors(doctor_id),
    signature_url VARCHAR(500),
    signed_at TIMESTAMP,
    
    -- Notes
    doctor_notes TEXT,
    pharmacy_notes TEXT,
    
    -- Metadata
    tenant_meta JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expired_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_prescriptions_tenant ON api_prescriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_prescriptions_user ON api_prescriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_api_prescriptions_doctor ON api_prescriptions(doctor_id);
CREATE INDEX IF NOT EXISTS idx_api_prescriptions_status ON api_prescriptions(status);

CREATE TABLE IF NOT EXISTS api_pharmacy_orders (
    order_id VARCHAR(50) PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    user_id VARCHAR(50) NOT NULL REFERENCES api_users(user_id),
    prescription_id VARCHAR(50) REFERENCES api_prescriptions(prescription_id),
    
    -- Order Details
    items JSONB NOT NULL, -- [{medicine_name, quantity, price}]
    
    -- Delivery
    delivery_type VARCHAR(50) NOT NULL, -- home-delivery, pickup
    delivery_address JSONB,
    delivery_date DATE,
    delivery_time_slot VARCHAR(50),
    
    -- Status
    status VARCHAR(50) DEFAULT 'pending',
    payment_status VARCHAR(50) DEFAULT 'pending',
    
    -- Financial
    subtotal DECIMAL(10,2),
    delivery_charge DECIMAL(10,2),
    discount DECIMAL(10,2),
    total_amount DECIMAL(10,2),
    currency VARCHAR(10) DEFAULT 'INR',
    payment_id VARCHAR(100),
    
    -- Tracking
    tracking_number VARCHAR(100),
    delivered_at TIMESTAMP,
    
    -- Notes
    customer_notes TEXT,
    pharmacy_notes TEXT,
    
    -- Metadata
    tenant_meta JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    cancelled_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_pharmacy_orders_tenant ON api_pharmacy_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_pharmacy_orders_user ON api_pharmacy_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_api_pharmacy_orders_prescription ON api_pharmacy_orders(prescription_id);
CREATE INDEX IF NOT EXISTS idx_api_pharmacy_orders_status ON api_pharmacy_orders(status);

-- ============================================
-- HOMECARE SERVICES
-- ============================================

CREATE TABLE IF NOT EXISTS api_homecare_services (
    service_id VARCHAR(50) PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    
    -- Service Details
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100), -- nursing, physiotherapy, lab-collection, doctor-visit
    
    -- Service Info
    qualifications_required VARCHAR(500),
    equipment_needed VARCHAR(500),
    duration_minutes INTEGER,
    
    -- Pricing
    price DECIMAL(10,2),
    price_per_session BOOLEAN DEFAULT true,
    currency VARCHAR(10) DEFAULT 'INR',
    
    -- Availability
    available BOOLEAN DEFAULT true,
    
    -- Metadata
    tenant_meta JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_homecare_services_tenant ON api_homecare_services(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_homecare_services_category ON api_homecare_services(category);

CREATE TABLE IF NOT EXISTS api_homecare_bookings (
    booking_id VARCHAR(50) PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    user_id VARCHAR(50) NOT NULL REFERENCES api_users(user_id),
    service_id VARCHAR(50) NOT NULL REFERENCES api_homecare_services(service_id),
    
    -- Booking Details
    service_date DATE NOT NULL,
    service_time_slot VARCHAR(50) NOT NULL,
    duration_days INTEGER DEFAULT 1,
    sessions_count INTEGER DEFAULT 1,
    
    -- Patient Details
    patient_name VARCHAR(255),
    patient_age INTEGER,
    patient_gender VARCHAR(20),
    patient_condition TEXT,
    
    -- Service Location
    service_address JSONB NOT NULL,
    
    -- Professional Assignment
    professional_id VARCHAR(50),
    professional_name VARCHAR(255),
    professional_phone VARCHAR(20),
    
    -- Status
    status VARCHAR(50) DEFAULT 'pending',
    payment_status VARCHAR(50) DEFAULT 'pending',
    
    -- Financial
    total_amount DECIMAL(10,2),
    currency VARCHAR(10) DEFAULT 'INR',
    payment_id VARCHAR(100),
    
    -- Notes
    special_instructions TEXT,
    service_notes TEXT,
    
    -- Metadata
    tenant_meta JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    cancelled_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_homecare_bookings_tenant ON api_homecare_bookings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_homecare_bookings_user ON api_homecare_bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_api_homecare_bookings_service ON api_homecare_bookings(service_id);
CREATE INDEX IF NOT EXISTS idx_api_homecare_bookings_date ON api_homecare_bookings(service_date);
CREATE INDEX IF NOT EXISTS idx_api_homecare_bookings_status ON api_homecare_bookings(status);

-- ============================================
-- WELLNESS & HRA
-- ============================================

CREATE TABLE IF NOT EXISTS api_hra_assessments (
    assessment_id VARCHAR(50) PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    user_id VARCHAR(50) NOT NULL REFERENCES api_users(user_id),
    
    -- Assessment Data
    responses JSONB NOT NULL,
    
    -- Results
    risk_score INTEGER, -- 0-100
    risk_level VARCHAR(50), -- low, moderate, high, critical
    risk_factors JSONB, -- [{factor, level, description}]
    recommendations JSONB, -- [{category, action, priority}]
    
    -- Health Metrics
    bmi DECIMAL(5,2),
    bp_systolic INTEGER,
    bp_diastolic INTEGER,
    heart_rate INTEGER,
    blood_sugar INTEGER,
    
    -- Lifestyle Factors
    smoking_status VARCHAR(50),
    alcohol_consumption VARCHAR(50),
    exercise_frequency VARCHAR(50),
    diet_pattern VARCHAR(50),
    
    -- Status
    status VARCHAR(50) DEFAULT 'completed',
    reviewed_by VARCHAR(50),
    reviewed_at TIMESTAMP,
    
    -- Metadata
    tenant_meta JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_hra_assessments_tenant ON api_hra_assessments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_hra_assessments_user ON api_hra_assessments(user_id);
CREATE INDEX IF NOT EXISTS idx_api_hra_assessments_risk_level ON api_hra_assessments(risk_level);

CREATE TABLE IF NOT EXISTS api_wellness_plans (
    plan_id VARCHAR(50) PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    
    -- Plan Details
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100), -- weight-loss, diabetes-management, fitness, mental-health
    
    -- Duration & Goals
    duration_weeks INTEGER,
    goals JSONB, -- [{metric, target, unit}]
    
    -- Program Content
    modules JSONB, -- [{week, title, activities}]
    activities JSONB, -- [{type, frequency, duration}]
    
    -- Pricing
    price DECIMAL(10,2),
    currency VARCHAR(10) DEFAULT 'INR',
    
    -- Status
    status VARCHAR(50) DEFAULT 'active',
    
    -- Metadata
    tenant_meta JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_wellness_plans_tenant ON api_wellness_plans(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_wellness_plans_category ON api_wellness_plans(category);
CREATE INDEX IF NOT EXISTS idx_api_wellness_plans_status ON api_wellness_plans(status);

-- ============================================
-- WEBHOOKS
-- ============================================

CREATE TABLE IF NOT EXISTS api_webhooks (
    webhook_id VARCHAR(50) PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    
    -- Webhook Details
    name VARCHAR(255) NOT NULL,
    url VARCHAR(500) NOT NULL,
    secret VARCHAR(255) NOT NULL,
    
    -- Events
    events VARCHAR(50)[] NOT NULL, -- appointment.created, payment.completed, etc.
    
    -- Configuration
    enabled BOOLEAN DEFAULT true,
    retry_enabled BOOLEAN DEFAULT true,
    max_retries INTEGER DEFAULT 3,
    timeout_seconds INTEGER DEFAULT 30,
    
    -- Headers
    headers JSONB DEFAULT '{}',
    
    -- Status
    status VARCHAR(50) DEFAULT 'active',
    last_triggered_at TIMESTAMP,
    failure_count INTEGER DEFAULT 0,
    
    -- Metadata
    tenant_meta JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_webhooks_tenant ON api_webhooks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_webhooks_enabled ON api_webhooks(enabled);

CREATE TABLE IF NOT EXISTS api_webhook_deliveries (
    delivery_id VARCHAR(50) PRIMARY KEY,
    webhook_id VARCHAR(50) NOT NULL REFERENCES api_webhooks(webhook_id),
    
    -- Event Info
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB NOT NULL,
    
    -- Delivery Attempt
    attempt_number INTEGER DEFAULT 1,
    status VARCHAR(50) DEFAULT 'pending', -- pending, success, failed
    
    -- Request/Response
    request_url VARCHAR(500),
    request_headers JSONB,
    request_body JSONB,
    response_status INTEGER,
    response_body TEXT,
    response_time_ms INTEGER,
    
    -- Error
    error_message TEXT,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    delivered_at TIMESTAMP,
    failed_at TIMESTAMP,
    next_retry_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_webhook_deliveries_webhook ON api_webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_api_webhook_deliveries_status ON api_webhook_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_api_webhook_deliveries_event ON api_webhook_deliveries(event_type);
CREATE INDEX IF NOT EXISTS idx_api_webhook_deliveries_created ON api_webhook_deliveries(created_at DESC);

-- ============================================
-- CONSENT MANAGEMENT
-- ============================================

CREATE TABLE IF NOT EXISTS api_consent_logs (
    consent_id VARCHAR(50) PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    user_id VARCHAR(50) NOT NULL REFERENCES api_users(user_id),
    
    -- Consent Details
    consent_type VARCHAR(100) NOT NULL, -- data-sharing, marketing, research
    purpose TEXT NOT NULL,
    scope JSONB, -- {data_types: [], duration: '', recipients: []}
    
    -- Status
    granted BOOLEAN NOT NULL,
    
    -- Metadata
    ip_address VARCHAR(45),
    user_agent TEXT,
    
    -- Revocation
    revoked BOOLEAN DEFAULT false,
    revoked_at TIMESTAMP,
    revocation_reason TEXT,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_consent_logs_tenant ON api_consent_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_consent_logs_user ON api_consent_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_api_consent_logs_type ON api_consent_logs(consent_type);

-- ============================================
-- AUDIT LOGS
-- ============================================

CREATE TABLE IF NOT EXISTS api_audit_logs (
    log_id VARCHAR(50) PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    
    -- Actor
    actor_id VARCHAR(50) NOT NULL,
    actor_type VARCHAR(50) NOT NULL, -- user, doctor, system, admin
    
    -- Action
    action VARCHAR(100) NOT NULL, -- create, read, update, delete
    resource_type VARCHAR(100) NOT NULL, -- appointment, prescription, etc.
    resource_id VARCHAR(50),
    
    -- Details
    changes JSONB, -- {field: {old: '', new: ''}}
    metadata JSONB DEFAULT '{}',
    
    -- Context
    ip_address VARCHAR(45),
    user_agent TEXT,
    
    -- Timestamp
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_audit_logs_tenant ON api_audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_audit_logs_actor ON api_audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_api_audit_logs_action ON api_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_api_audit_logs_resource ON api_audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_api_audit_logs_created ON api_audit_logs(created_at DESC);

-- ============================================
-- AUTO-UPDATE TRIGGERS
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply to all tables with updated_at
CREATE TRIGGER update_api_users_updated_at BEFORE UPDATE ON api_users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_api_doctors_updated_at BEFORE UPDATE ON api_doctors FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_api_appointments_updated_at BEFORE UPDATE ON api_appointments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_api_chat_rooms_updated_at BEFORE UPDATE ON api_chat_rooms FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_api_chat_messages_updated_at BEFORE UPDATE ON api_chat_messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_api_lab_tests_updated_at BEFORE UPDATE ON api_lab_tests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_api_lab_bookings_updated_at BEFORE UPDATE ON api_lab_bookings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_api_prescriptions_updated_at BEFORE UPDATE ON api_prescriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_api_pharmacy_orders_updated_at BEFORE UPDATE ON api_pharmacy_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_api_homecare_services_updated_at BEFORE UPDATE ON api_homecare_services FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_api_homecare_bookings_updated_at BEFORE UPDATE ON api_homecare_bookings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_api_hra_assessments_updated_at BEFORE UPDATE ON api_hra_assessments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_api_wellness_plans_updated_at BEFORE UPDATE ON api_wellness_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_api_webhooks_updated_at BEFORE UPDATE ON api_webhooks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- MIGRATION COMPLETE
-- ============================================

-- Migration completed successfully
SELECT 'API v1 Database Schema Created Successfully!' as status;
