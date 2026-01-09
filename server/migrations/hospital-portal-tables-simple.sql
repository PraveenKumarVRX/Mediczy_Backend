-- ============================================================================
-- Hospital Portal Tables Migration (Simplified)
-- NO FOREIGN KEY CONSTRAINTS - Just create tables with indexes
-- ============================================================================

-- ============================================================================
-- INSURANCE CLAIMS
-- ============================================================================
CREATE TABLE IF NOT EXISTS insurance_claims (
    id SERIAL PRIMARY KEY,
    claim_number VARCHAR(100) UNIQUE NOT NULL,
    patient_id INTEGER NOT NULL,
    hospital_id INTEGER NOT NULL,
    policy_number VARCHAR(100),
    insurance_company VARCHAR(255),
    claim_amount DECIMAL(10, 2),
    approved_amount DECIMAL(10, 2),
    status VARCHAR(50) DEFAULT 'pending', -- pending, approved, rejected, under_review
    remarks TEXT,
    submitted_at TIMESTAMP,
    approved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_insurance_claims_hospital ON insurance_claims(hospital_id);
CREATE INDEX IF NOT EXISTS idx_insurance_claims_patient ON insurance_claims(patient_id);
CREATE INDEX IF NOT EXISTS idx_insurance_claims_status ON insurance_claims(status);

-- ============================================================================
-- CLAIM TIMELINE
-- ============================================================================
CREATE TABLE IF NOT EXISTS claim_timeline (
    id SERIAL PRIMARY KEY,
    claim_id INTEGER NOT NULL,
    status VARCHAR(50) NOT NULL,
    remarks TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_claim_timeline_claim ON claim_timeline(claim_id);

-- ============================================================================
-- MEDICAL RECORDS
-- ============================================================================
CREATE TABLE IF NOT EXISTS medical_records (
    id SERIAL PRIMARY KEY,
    mrd_number VARCHAR(50) UNIQUE NOT NULL,
    patient_id INTEGER NOT NULL,
    patient_name VARCHAR(255) NOT NULL,
    uhid VARCHAR(50),
    hospital_id INTEGER NOT NULL,
    record_type VARCHAR(50), -- physical, digital, hybrid
    department VARCHAR(100),
    admission_date DATE,
    discharge_date DATE,
    total_pages INTEGER DEFAULT 0,
    location VARCHAR(255),
    status VARCHAR(50) DEFAULT 'active', -- active, archived, digitized
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_medical_records_hospital ON medical_records(hospital_id);
CREATE INDEX IF NOT EXISTS idx_medical_records_patient ON medical_records(patient_id);

-- ============================================================================
-- DIGITIZATION QUEUE
-- ============================================================================
CREATE TABLE IF NOT EXISTS digitization_queue (
    id SERIAL PRIMARY KEY,
    record_id INTEGER NOT NULL,
    mrd_number VARCHAR(50),
    patient_name VARCHAR(255),
    hospital_id INTEGER NOT NULL,
    total_pages INTEGER DEFAULT 0,
    pages_scanned INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'pending', -- pending, in_progress, completed, failed
    priority VARCHAR(20) DEFAULT 'normal', -- urgent, high, normal, low
    assigned_to VARCHAR(255),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_digitization_queue_hospital ON digitization_queue(hospital_id);
CREATE INDEX IF NOT EXISTS idx_digitization_queue_status ON digitization_queue(status);

-- ============================================================================
-- DISCHARGE SUMMARIES
-- ============================================================================
CREATE TABLE IF NOT EXISTS discharge_summaries (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL,
    admission_id INTEGER,
    hospital_id INTEGER NOT NULL,
    diagnosis JSONB,
    procedures JSONB,
    medications JSONB,
    follow_up TEXT,
    status VARCHAR(50) DEFAULT 'draft', -- draft, pending_approval, approved, sent
    submitted_at TIMESTAMP,
    approved_at TIMESTAMP,
    approved_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discharge_summaries_hospital ON discharge_summaries(hospital_id);
CREATE INDEX IF NOT EXISTS idx_discharge_summaries_patient ON discharge_summaries(patient_id);
CREATE INDEX IF NOT EXISTS idx_discharge_summaries_status ON discharge_summaries(status);

-- ============================================================================
-- PRESCRIPTIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS prescriptions (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL,
    doctor_id VARCHAR(255),
    hospital_id INTEGER NOT NULL,
    diagnosis TEXT,
    medications JSONB,
    notes TEXT,
    status VARCHAR(50) DEFAULT 'active', -- active, completed, cancelled
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prescriptions_hospital ON prescriptions(hospital_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient ON prescriptions(patient_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_doctor ON prescriptions(doctor_id);

-- ============================================================================
-- IP SHEETS (In-Patient Monitoring Sheets)
-- ============================================================================
CREATE TABLE IF NOT EXISTS ip_sheets (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL,
    hospital_id INTEGER NOT NULL,
    sheet_type VARCHAR(50) NOT NULL, -- vitals, intake_output, medication_chart, nursing_notes
    data JSONB,
    recorded_at TIMESTAMP NOT NULL,
    recorded_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ip_sheets_hospital ON ip_sheets(hospital_id);
CREATE INDEX IF NOT EXISTS idx_ip_sheets_patient ON ip_sheets(patient_id);
CREATE INDEX IF NOT EXISTS idx_ip_sheets_type ON ip_sheets(sheet_type);
CREATE INDEX IF NOT EXISTS idx_ip_sheets_recorded_at ON ip_sheets(recorded_at);

-- ============================================================================
-- HOSPITAL BRANCHES
-- ============================================================================
CREATE TABLE IF NOT EXISTS hospital_branches (
    id SERIAL PRIMARY KEY,
    hospital_id INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) DEFAULT 'branch', -- branch, satellite, collection_center
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    pincode VARCHAR(10),
    phone VARCHAR(20),
    email VARCHAR(255),
    manager JSONB,
    status VARCHAR(50) DEFAULT 'active', -- active, inactive, closed
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hospital_branches_hospital ON hospital_branches(hospital_id);
CREATE INDEX IF NOT EXISTS idx_hospital_branches_status ON hospital_branches(status);

-- ============================================================================
-- OUTREACH CLINICS
-- ============================================================================
CREATE TABLE IF NOT EXISTS outreach_clinics (
    id SERIAL PRIMARY KEY,
    hospital_id INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) DEFAULT 'daily', -- daily, weekly, monthly, special
    parent_branch VARCHAR(255),
    location JSONB,
    schedule JSONB,
    doctor JSONB,
    services JSONB,
    capacity INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'active', -- active, inactive, cancelled
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outreach_clinics_hospital ON outreach_clinics(hospital_id);
CREATE INDEX IF NOT EXISTS idx_outreach_clinics_status ON outreach_clinics(status);

-- ============================================================================
-- AMBULANCE VEHICLES
-- ============================================================================
CREATE TABLE IF NOT EXISTS ambulance_vehicles (
    id SERIAL PRIMARY KEY,
    hospital_id INTEGER NOT NULL,
    vehicle_number VARCHAR(50) UNIQUE NOT NULL,
    type VARCHAR(50), -- basic, advanced, critical_care, air
    driver JSONB,
    paramedic JSONB,
    equipment JSONB,
    status VARCHAR(50) DEFAULT 'available', -- available, in_use, maintenance, offline
    fuel_level INTEGER DEFAULT 100,
    last_maintenance DATE,
    next_maintenance DATE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ambulance_vehicles_hospital ON ambulance_vehicles(hospital_id);
CREATE INDEX IF NOT EXISTS idx_ambulance_vehicles_status ON ambulance_vehicles(status);

-- ============================================================================
-- LAB ORDERS
-- ============================================================================
CREATE TABLE IF NOT EXISTS lab_orders (
    id SERIAL PRIMARY KEY,
    order_number VARCHAR(100) UNIQUE NOT NULL,
    patient_id INTEGER NOT NULL,
    hospital_id INTEGER NOT NULL,
    tests JSONB,
    priority VARCHAR(20) DEFAULT 'routine', -- stat, urgent, routine
    notes TEXT,
    total_amount DECIMAL(10, 2),
    status VARCHAR(50) DEFAULT 'ordered', -- ordered, sample_collected, in_progress, completed, cancelled
    ordered_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lab_orders_hospital ON lab_orders(hospital_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_patient ON lab_orders(patient_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_status ON lab_orders(status);

-- ============================================================================
-- IMAGING ORDERS (X-Ray, CT, MRI, Ultrasound, etc.)
-- ============================================================================
CREATE TABLE IF NOT EXISTS imaging_orders (
    id SERIAL PRIMARY KEY,
    order_number VARCHAR(100) UNIQUE NOT NULL,
    patient_id INTEGER NOT NULL,
    hospital_id INTEGER NOT NULL,
    tests JSONB,
    priority VARCHAR(20) DEFAULT 'routine', -- stat, urgent, routine
    notes TEXT,
    total_amount DECIMAL(10, 2),
    status VARCHAR(50) DEFAULT 'ordered', -- ordered, scheduled, in_progress, completed, cancelled
    ordered_at TIMESTAMP DEFAULT NOW(),
    scheduled_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_imaging_orders_hospital ON imaging_orders(hospital_id);
CREATE INDEX IF NOT EXISTS idx_imaging_orders_patient ON imaging_orders(patient_id);
CREATE INDEX IF NOT EXISTS idx_imaging_orders_status ON imaging_orders(status);

-- ============================================================================
-- PROCEDURE SCHEDULES (OT Scheduling)
-- ============================================================================
CREATE TABLE IF NOT EXISTS procedure_schedules (
    id SERIAL PRIMARY KEY,
    procedure_id VARCHAR(100) NOT NULL,
    patient_id INTEGER NOT NULL,
    hospital_id INTEGER NOT NULL,
    scheduled_date DATE NOT NULL,
    scheduled_time TIME NOT NULL,
    priority VARCHAR(20) DEFAULT 'routine', -- emergency, urgent, routine
    anesthesia_type VARCHAR(50),
    room VARCHAR(50),
    notes TEXT,
    estimated_duration INTEGER, -- in minutes
    status VARCHAR(50) DEFAULT 'scheduled', -- scheduled, in_progress, completed, cancelled
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_procedure_schedules_hospital ON procedure_schedules(hospital_id);
CREATE INDEX IF NOT EXISTS idx_procedure_schedules_patient ON procedure_schedules(patient_id);
CREATE INDEX IF NOT EXISTS idx_procedure_schedules_date ON procedure_schedules(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_procedure_schedules_status ON procedure_schedules(status);

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
