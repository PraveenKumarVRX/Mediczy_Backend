-- Hospital Portal Backend Tables Migration
-- Created: 2026-01-09
-- Purpose: Support hospital practice management features

-- ============================================================================
-- INSURANCE CLAIMS
-- ============================================================================
CREATE TABLE IF NOT EXISTS insurance_claims (
    id SERIAL PRIMARY KEY,
    claim_number VARCHAR(50) UNIQUE NOT NULL,
    patient_id INTEGER NOT NULL,
    patient_name VARCHAR(255) NOT NULL,
    uhid VARCHAR(50),
    hospital_id INTEGER NOT NULL,
    insurer_id INTEGER,
    insurer_name VARCHAR(255),
    policy_number VARCHAR(100),
    admission_date DATE,
    claim_type VARCHAR(50), -- cashless, reimbursement
    estimated_amount DECIMAL(10,2),
    approved_amount DECIMAL(10,2),
    status VARCHAR(50) DEFAULT 'under_review', -- under_review, approved, rejected, pending, settled
    priority VARCHAR(20), -- normal, urgent, emergency
    diagnosis TEXT,
    procedure_codes JSONB DEFAULT '[]',
    documents JSONB DEFAULT '[]',
    remarks TEXT,
    updated_by INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (hospital_id) REFERENCES "Hospitals"(id) ON DELETE CASCADE
);

CREATE INDEX idx_insurance_claims_hospital ON insurance_claims(hospital_id);
CREATE INDEX idx_insurance_claims_patient ON insurance_claims(patient_id);
CREATE INDEX idx_insurance_claims_status ON insurance_claims(status);

-- ============================================================================
-- CLAIM TIMELINE
-- ============================================================================
CREATE TABLE IF NOT EXISTS claim_timeline (
    id SERIAL PRIMARY KEY,
    claim_id INTEGER NOT NULL,
    status VARCHAR(50) NOT NULL,
    remarks TEXT,
    updated_by INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (claim_id) REFERENCES insurance_claims(id) ON DELETE CASCADE
);

CREATE INDEX idx_claim_timeline_claim ON claim_timeline(claim_id);

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
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (hospital_id) REFERENCES "Hospitals"(id) ON DELETE CASCADE
);

CREATE INDEX idx_medical_records_hospital ON medical_records(hospital_id);
CREATE INDEX idx_medical_records_patient ON medical_records(patient_id);

-- ============================================================================
-- DIGITIZATION QUEUE
-- ============================================================================
CREATE TABLE IF NOT EXISTS digitization_queue (
    id SERIAL PRIMARY KEY,
    record_id INTEGER NOT NULL,
    mrd_number VARCHAR(50) NOT NULL,
    patient_name VARCHAR(255) NOT NULL,
    total_pages INTEGER DEFAULT 0,
    scanned_pages INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'pending', -- pending, in_progress, quality_check, completed, failed
    priority VARCHAR(20) DEFAULT 'normal', -- normal, high
    assigned_to INTEGER,
    hospital_id INTEGER NOT NULL,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (record_id) REFERENCES medical_records(id) ON DELETE CASCADE,
    FOREIGN KEY (hospital_id) REFERENCES "Hospitals"(id) ON DELETE CASCADE
);

CREATE INDEX idx_digitization_queue_hospital ON digitization_queue(hospital_id);
CREATE INDEX idx_digitization_queue_status ON digitization_queue(status);

-- ============================================================================
-- DISCHARGE SUMMARIES
-- ============================================================================
CREATE TABLE IF NOT EXISTS discharge_summaries (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL,
    admission_id INTEGER,
    hospital_id INTEGER NOT NULL,
    diagnosis JSONB DEFAULT '[]',
    procedures JSONB DEFAULT '[]',
    medications JSONB DEFAULT '[]',
    follow_up TEXT,
    status VARCHAR(50) DEFAULT 'draft', -- draft, pending_approval, approved, rejected
    created_by INTEGER,
    approved_by INTEGER,
    submitted_at TIMESTAMP,
    approved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (hospital_id) REFERENCES "Hospitals"(id) ON DELETE CASCADE
);

CREATE INDEX idx_discharge_summaries_hospital ON discharge_summaries(hospital_id);
CREATE INDEX idx_discharge_summaries_patient ON discharge_summaries(patient_id);
CREATE INDEX idx_discharge_summaries_status ON discharge_summaries(status);

-- ============================================================================
-- PRESCRIPTIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS prescriptions (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL,
    doctor_id INTEGER,
    hospital_id INTEGER NOT NULL,
    diagnosis TEXT,
    medications JSONB DEFAULT '[]',
    notes TEXT,
    status VARCHAR(50) DEFAULT 'active', -- active, completed, cancelled
    valid_until DATE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (hospital_id) REFERENCES "Hospitals"(id) ON DELETE CASCADE
);

CREATE INDEX idx_prescriptions_hospital ON prescriptions(hospital_id);
CREATE INDEX idx_prescriptions_patient ON prescriptions(patient_id);
CREATE INDEX idx_prescriptions_doctor ON prescriptions(doctor_id);

-- ============================================================================
-- IP SHEETS (Inpatient Monitoring Sheets)
-- ============================================================================
CREATE TABLE IF NOT EXISTS ip_sheets (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL,
    hospital_id INTEGER NOT NULL,
    sheet_type VARCHAR(50) NOT NULL, -- vitals, intake_output, medication_chart, nursing_notes
    data JSONB DEFAULT '{}',
    created_by INTEGER,
    recorded_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (hospital_id) REFERENCES "Hospitals"(id) ON DELETE CASCADE
);

CREATE INDEX idx_ip_sheets_hospital ON ip_sheets(hospital_id);
CREATE INDEX idx_ip_sheets_patient ON ip_sheets(patient_id);
CREATE INDEX idx_ip_sheets_type ON ip_sheets(sheet_type);
CREATE INDEX idx_ip_sheets_recorded ON ip_sheets(recorded_at);

-- ============================================================================
-- HOSPITAL BRANCHES
-- ============================================================================
CREATE TABLE IF NOT EXISTS hospital_branches (
    id SERIAL PRIMARY KEY,
    hospital_id INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) DEFAULT 'branch', -- main, branch
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    pincode VARCHAR(10),
    phone VARCHAR(20),
    email VARCHAR(255),
    manager JSONB DEFAULT '{}',
    total_beds INTEGER DEFAULT 0,
    departments JSONB DEFAULT '[]',
    facilities JSONB DEFAULT '[]',
    status VARCHAR(50) DEFAULT 'active', -- active, inactive, opening_soon
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (hospital_id) REFERENCES "Hospitals"(id) ON DELETE CASCADE
);

CREATE INDEX idx_hospital_branches_hospital ON hospital_branches(hospital_id);
CREATE INDEX idx_hospital_branches_status ON hospital_branches(status);

-- ============================================================================
-- OUTREACH CLINICS
-- ============================================================================
CREATE TABLE IF NOT EXISTS outreach_clinics (
    id SERIAL PRIMARY KEY,
    hospital_id INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) DEFAULT 'daily', -- daily, weekly, monthly, mobile
    parent_branch VARCHAR(50),
    location JSONB DEFAULT '{}',
    schedule JSONB DEFAULT '{}',
    doctor JSONB DEFAULT '{}',
    services JSONB DEFAULT '[]',
    capacity INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'active', -- active, inactive
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (hospital_id) REFERENCES "Hospitals"(id) ON DELETE CASCADE
);

CREATE INDEX idx_outreach_clinics_hospital ON outreach_clinics(hospital_id);
CREATE INDEX idx_outreach_clinics_type ON outreach_clinics(type);

-- ============================================================================
-- AMBULANCE VEHICLES
-- ============================================================================
CREATE TABLE IF NOT EXISTS ambulance_vehicles (
    id SERIAL PRIMARY KEY,
    hospital_id INTEGER NOT NULL,
    vehicle_number VARCHAR(50) UNIQUE NOT NULL,
    type VARCHAR(50) NOT NULL, -- BLS, ALS, PICU, NICU, Mortuary
    driver JSONB DEFAULT '{}',
    paramedic JSONB DEFAULT '{}',
    equipment JSONB DEFAULT '[]',
    status VARCHAR(50) DEFAULT 'available', -- available, on_duty, maintenance, offline
    fuel_level INTEGER DEFAULT 100,
    current_location VARCHAR(255),
    last_updated TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (hospital_id) REFERENCES "Hospitals"(id) ON DELETE CASCADE
);

CREATE INDEX idx_ambulance_vehicles_hospital ON ambulance_vehicles(hospital_id);
CREATE INDEX idx_ambulance_vehicles_status ON ambulance_vehicles(status);

-- ============================================================================
-- LAB ORDERS
-- ============================================================================
CREATE TABLE IF NOT EXISTS lab_orders (
    id SERIAL PRIMARY KEY,
    order_number VARCHAR(50) UNIQUE NOT NULL,
    patient_id INTEGER NOT NULL,
    hospital_id INTEGER NOT NULL,
    ordered_by INTEGER,
    tests JSONB DEFAULT '[]',
    priority VARCHAR(20) DEFAULT 'routine', -- routine, urgent, emergency
    notes TEXT,
    total_amount DECIMAL(10,2) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'ordered', -- ordered, sample_collected, processing, completed, cancelled
    ordered_date TIMESTAMP DEFAULT NOW(),
    required_date DATE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (hospital_id) REFERENCES "Hospitals"(id) ON DELETE CASCADE
);

CREATE INDEX idx_lab_orders_hospital ON lab_orders(hospital_id);
CREATE INDEX idx_lab_orders_patient ON lab_orders(patient_id);
CREATE INDEX idx_lab_orders_status ON lab_orders(status);

-- ============================================================================
-- IMAGING ORDERS
-- ============================================================================
CREATE TABLE IF NOT EXISTS imaging_orders (
    id SERIAL PRIMARY KEY,
    order_number VARCHAR(50) UNIQUE NOT NULL,
    patient_id INTEGER NOT NULL,
    hospital_id INTEGER NOT NULL,
    ordered_by INTEGER,
    tests JSONB DEFAULT '[]',
    priority VARCHAR(20) DEFAULT 'routine', -- routine, urgent, emergency
    notes TEXT,
    total_amount DECIMAL(10,2) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'ordered', -- ordered, scheduled, in_progress, completed, cancelled
    ordered_date TIMESTAMP DEFAULT NOW(),
    scheduled_date DATE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (hospital_id) REFERENCES "Hospitals"(id) ON DELETE CASCADE
);

CREATE INDEX idx_imaging_orders_hospital ON imaging_orders(hospital_id);
CREATE INDEX idx_imaging_orders_patient ON imaging_orders(patient_id);
CREATE INDEX idx_imaging_orders_status ON imaging_orders(status);

-- ============================================================================
-- PROCEDURE SCHEDULES
-- ============================================================================
CREATE TABLE IF NOT EXISTS procedure_schedules (
    id SERIAL PRIMARY KEY,
    procedure_id INTEGER NOT NULL,
    patient_id INTEGER NOT NULL,
    hospital_id INTEGER NOT NULL,
    scheduled_by INTEGER,
    scheduled_date DATE NOT NULL,
    scheduled_time TIME NOT NULL,
    priority VARCHAR(20) DEFAULT 'routine', -- routine, urgent, emergency
    anesthesia_type VARCHAR(100),
    room VARCHAR(50),
    notes TEXT,
    estimated_duration VARCHAR(50),
    status VARCHAR(50) DEFAULT 'scheduled', -- scheduled, in_progress, completed, cancelled, postponed
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (hospital_id) REFERENCES "Hospitals"(id) ON DELETE CASCADE
);

CREATE INDEX idx_procedure_schedules_hospital ON procedure_schedules(hospital_id);
CREATE INDEX idx_procedure_schedules_patient ON procedure_schedules(patient_id);
CREATE INDEX idx_procedure_schedules_status ON procedure_schedules(status);
CREATE INDEX idx_procedure_schedules_date ON procedure_schedules(scheduled_date);

-- ============================================================================
-- GRANT PERMISSIONS (if needed)
-- ============================================================================
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_db_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO your_db_user;
