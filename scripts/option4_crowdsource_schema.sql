-- Option 4: Crowdsource Verification Schema
-- Tables for user-submitted verification and profile claiming

-- 1. Verification Reports Table (users report incorrect data)
CREATE TABLE IF NOT EXISTS verification_reports (
    id SERIAL PRIMARY KEY,
    
    -- What entity is being reported
    entity_type VARCHAR(50) NOT NULL, -- 'doctor', 'hospital', 'lab', 'clinic'
    entity_id INTEGER NOT NULL,
    entity_unique_id VARCHAR(20), -- D-XXXXXX, H-XXXXXX, etc.
    
    -- Who is reporting
    reporter_user_id INTEGER REFERENCES users(id),
    reporter_name VARCHAR(255),
    reporter_email VARCHAR(255),
    reporter_phone VARCHAR(20),
    is_anonymous BOOLEAN DEFAULT false,
    
    -- What's being reported
    report_type VARCHAR(100) NOT NULL, -- 'incorrect_info', 'closed_permanently', 'fake_listing', 'duplicate', 'other'
    field_reported VARCHAR(100), -- Which field is incorrect: 'name', 'address', 'phone', 'timings', etc.
    
    -- Details
    current_value TEXT, -- What's currently shown
    suggested_value TEXT, -- What it should be
    additional_notes TEXT,
    supporting_evidence TEXT[], -- URLs to supporting docs/images
    
    -- Status tracking
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'under_review', 'verified', 'rejected', 'resolved'
    reviewed_by INTEGER,
    reviewed_at TIMESTAMP,
    admin_notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Profile Claims Table (doctors/hospitals claim their profiles)
CREATE TABLE IF NOT EXISTS profile_claims (
    id SERIAL PRIMARY KEY,
    
    -- Profile being claimed
    entity_type VARCHAR(50) NOT NULL, -- 'doctor', 'hospital', 'lab', 'clinic'
    entity_id INTEGER NOT NULL,
    entity_unique_id VARCHAR(20),
    
    -- Claimant info
    claimant_user_id INTEGER REFERENCES users(id),
    claimant_name VARCHAR(255) NOT NULL,
    claimant_email VARCHAR(255) NOT NULL,
    claimant_phone VARCHAR(20),
    claimant_role VARCHAR(100), -- 'owner', 'manager', 'doctor_self', 'authorized_representative'
    
    -- Verification documents
    registration_number VARCHAR(100), -- Medical registration number
    license_number VARCHAR(100),
    proof_documents TEXT[], -- URLs to uploaded documents
    
    -- For doctors - additional verification
    medical_council VARCHAR(100), -- State medical council
    qualification_proof TEXT[], -- Degree certificates
    
    -- For hospitals/labs - additional verification
    establishment_certificate TEXT,
    gst_number VARCHAR(50),
    nabh_nabl_certificate TEXT,
    
    -- Verification method
    verification_method VARCHAR(50), -- 'document', 'otp', 'video_call', 'in_person'
    otp_verified BOOLEAN DEFAULT false,
    video_verified BOOLEAN DEFAULT false,
    
    -- Status
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'under_review', 'approved', 'rejected'
    rejection_reason TEXT,
    approved_by INTEGER,
    approved_at TIMESTAMP,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Verification Badges Table
CREATE TABLE IF NOT EXISTS verification_badges (
    id SERIAL PRIMARY KEY,
    
    entity_type VARCHAR(50) NOT NULL,
    entity_id INTEGER NOT NULL,
    entity_unique_id VARCHAR(20),
    
    -- Badge types
    badge_type VARCHAR(100) NOT NULL, -- 'verified', 'claimed', 'nabh_accredited', 'nabl_accredited', 'nmc_registered', 'top_rated', 'trusted'
    badge_level VARCHAR(50), -- 'bronze', 'silver', 'gold', 'platinum'
    
    -- Source of badge
    awarded_by VARCHAR(100), -- 'system', 'admin', 'government', 'users'
    awarded_reason TEXT,
    
    -- Validity
    is_active BOOLEAN DEFAULT true,
    valid_from DATE DEFAULT CURRENT_DATE,
    valid_until DATE, -- NULL = permanent
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(entity_type, entity_id, badge_type)
);

-- 4. User Ratings & Reviews Table
CREATE TABLE IF NOT EXISTS provider_reviews (
    id SERIAL PRIMARY KEY,
    
    -- What's being reviewed
    entity_type VARCHAR(50) NOT NULL,
    entity_id INTEGER NOT NULL,
    entity_unique_id VARCHAR(20),
    
    -- Who's reviewing
    user_id INTEGER REFERENCES users(id),
    reviewer_name VARCHAR(255),
    is_verified_patient BOOLEAN DEFAULT false, -- Had an appointment
    appointment_id INTEGER, -- Link to actual appointment if verified
    
    -- Ratings (1-5)
    overall_rating DECIMAL(2,1) NOT NULL CHECK (overall_rating >= 1 AND overall_rating <= 5),
    cleanliness_rating DECIMAL(2,1),
    staff_behavior_rating DECIMAL(2,1),
    wait_time_rating DECIMAL(2,1),
    value_for_money_rating DECIMAL(2,1),
    
    -- Review content
    title VARCHAR(255),
    review_text TEXT,
    visit_date DATE,
    treatment_type VARCHAR(100),
    
    -- Helpful votes
    helpful_count INTEGER DEFAULT 0,
    not_helpful_count INTEGER DEFAULT 0,
    
    -- Verification
    is_verified BOOLEAN DEFAULT false,
    verification_method VARCHAR(50), -- 'appointment', 'phone', 'manual'
    
    -- Status
    status VARCHAR(50) DEFAULT 'active', -- 'active', 'hidden', 'flagged', 'removed'
    flagged_reason TEXT,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Community Verification Votes
CREATE TABLE IF NOT EXISTS community_verifications (
    id SERIAL PRIMARY KEY,
    
    entity_type VARCHAR(50) NOT NULL,
    entity_id INTEGER NOT NULL,
    
    -- User voting
    user_id INTEGER REFERENCES users(id),
    
    -- What they're verifying
    verification_type VARCHAR(100) NOT NULL, -- 'exists', 'correct_address', 'correct_phone', 'correct_timings', 'still_operating'
    
    -- Vote
    vote VARCHAR(20) NOT NULL, -- 'confirm', 'deny', 'unsure'
    confidence_level INTEGER CHECK (confidence_level >= 1 AND confidence_level <= 5),
    
    -- Additional info
    notes TEXT,
    last_visit_date DATE,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(entity_type, entity_id, user_id, verification_type)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_verification_reports_entity ON verification_reports(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_verification_reports_status ON verification_reports(status);
CREATE INDEX IF NOT EXISTS idx_profile_claims_entity ON profile_claims(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_profile_claims_status ON profile_claims(status);
CREATE INDEX IF NOT EXISTS idx_verification_badges_entity ON verification_badges(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_provider_reviews_entity ON provider_reviews(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_community_verifications_entity ON community_verifications(entity_type, entity_id);

-- Insert default badge types
INSERT INTO verification_badges (entity_type, entity_id, entity_unique_id, badge_type, awarded_by, awarded_reason)
SELECT 'system', 0, 'SYSTEM', badge_type, 'system', 'Default badge definition'
FROM (VALUES 
    ('verified'),
    ('claimed'),
    ('nabh_accredited'),
    ('nabl_accredited'),
    ('nmc_registered'),
    ('top_rated'),
    ('trusted'),
    ('community_verified')
) AS badges(badge_type)
ON CONFLICT DO NOTHING;

-- Views for aggregated verification status

-- Hospital verification summary
CREATE OR REPLACE VIEW hospital_verification_summary AS
SELECT 
    h.id,
    h.unique_id,
    h.hospital_name,
    h.city,
    COALESCE((h.metadata->>'nabh_accredited')::boolean, false) AS nabh_accredited,
    COALESCE((h.metadata->>'web_verified')::boolean, false) AS web_verified,
    EXISTS(SELECT 1 FROM profile_claims pc WHERE pc.entity_type = 'hospital' AND pc.entity_id = h.id AND pc.status = 'approved') AS profile_claimed,
    (SELECT COUNT(*) FROM provider_reviews pr WHERE pr.entity_type = 'hospital' AND pr.entity_id = h.id) AS review_count,
    (SELECT AVG(overall_rating) FROM provider_reviews pr WHERE pr.entity_type = 'hospital' AND pr.entity_id = h.id) AS avg_rating,
    (SELECT COUNT(*) FROM community_verifications cv WHERE cv.entity_type = 'hospital' AND cv.entity_id = h.id AND cv.vote = 'confirm') AS community_confirmations
FROM hospitals h;

-- Doctor verification summary  
CREATE OR REPLACE VIEW doctor_verification_summary AS
SELECT 
    d.id,
    d.unique_id,
    d."firstName" || ' ' || d."lastName" AS full_name,
    d.specialization,
    COALESCE((d.metadata->>'nmc_verified')::boolean, false) AS nmc_verified,
    COALESCE((d.metadata->>'web_verified')::boolean, false) AS web_verified,
    EXISTS(SELECT 1 FROM profile_claims pc WHERE pc.entity_type = 'doctor' AND pc.entity_id = d.id AND pc.status = 'approved') AS profile_claimed,
    (SELECT COUNT(*) FROM provider_reviews pr WHERE pr.entity_type = 'doctor' AND pr.entity_id = d.id) AS review_count,
    (SELECT AVG(overall_rating) FROM provider_reviews pr WHERE pr.entity_type = 'doctor' AND pr.entity_id = d.id) AS avg_rating
FROM doctors d;

COMMENT ON TABLE verification_reports IS 'User-submitted reports about incorrect or outdated provider information';
COMMENT ON TABLE profile_claims IS 'Doctors/hospitals claiming ownership of their profiles for verification';
COMMENT ON TABLE verification_badges IS 'Verification badges awarded to providers';
COMMENT ON TABLE provider_reviews IS 'User ratings and reviews for healthcare providers';
COMMENT ON TABLE community_verifications IS 'Community-based verification votes from users';
