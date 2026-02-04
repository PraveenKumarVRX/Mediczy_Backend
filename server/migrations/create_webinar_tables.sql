-- =====================================================
-- Webinar System Database Migration
-- Created: February 4, 2026
-- Description: Schema for LiveKit-powered webinar system
-- =====================================================

-- Table: webinars
CREATE TABLE IF NOT EXISTS webinars (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    doctor_id INTEGER REFERENCES doctors(id) ON DELETE SET NULL,
    scheduled_at TIMESTAMP NOT NULL,
    duration INTEGER NOT NULL DEFAULT 60, -- Duration in minutes
    max_participants INTEGER DEFAULT 100,
    status VARCHAR(50) DEFAULT 'scheduled', -- scheduled, live, completed, cancelled
    livekit_room_name VARCHAR(255) UNIQUE,
    meeting_url TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL, -- Super admin who created it
    started_at TIMESTAMP,
    ended_at TIMESTAMP,
    recording_enabled BOOLEAN DEFAULT true,
    chat_enabled BOOLEAN DEFAULT true,
    qa_enabled BOOLEAN DEFAULT true,
    registration_required BOOLEAN DEFAULT true,
    auto_approve_registration BOOLEAN DEFAULT false,
    thumbnail_url TEXT,
    tags TEXT[], -- Array of tags for categorization
    metadata JSONB, -- Additional metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: webinar_registrations
CREATE TABLE IF NOT EXISTS webinar_registrations (
    id SERIAL PRIMARY KEY,
    webinar_id INTEGER NOT NULL REFERENCES webinars(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    registration_status VARCHAR(50) DEFAULT 'pending', -- pending, approved, rejected, cancelled
    joined_at TIMESTAMP,
    left_at TIMESTAMP,
    duration INTEGER, -- Duration in seconds
    approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMP,
    rejection_reason TEXT,
    attendance_status VARCHAR(50), -- registered, attended, missed, left_early
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(webinar_id, user_id)
);

-- Table: webinar_recordings
CREATE TABLE IF NOT EXISTS webinar_recordings (
    id SERIAL PRIMARY KEY,
    webinar_id INTEGER NOT NULL REFERENCES webinars(id) ON DELETE CASCADE,
    recording_url TEXT NOT NULL,
    recording_id VARCHAR(255), -- LiveKit recording ID
    file_size BIGINT, -- Size in bytes
    duration INTEGER, -- Duration in seconds
    format VARCHAR(50) DEFAULT 'mp4',
    status VARCHAR(50) DEFAULT 'processing', -- processing, available, failed, deleted
    started_at TIMESTAMP,
    ended_at TIMESTAMP,
    is_public BOOLEAN DEFAULT false,
    download_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: webinar_chat_messages
CREATE TABLE IF NOT EXISTS webinar_chat_messages (
    id SERIAL PRIMARY KEY,
    webinar_id INTEGER NOT NULL REFERENCES webinars(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    message_type VARCHAR(50) DEFAULT 'text', -- text, question, announcement
    is_pinned BOOLEAN DEFAULT false,
    is_answered BOOLEAN DEFAULT false,
    answered_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    answer TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table: webinar_analytics
CREATE TABLE IF NOT EXISTS webinar_analytics (
    id SERIAL PRIMARY KEY,
    webinar_id INTEGER NOT NULL REFERENCES webinars(id) ON DELETE CASCADE,
    total_registrations INTEGER DEFAULT 0,
    total_attendees INTEGER DEFAULT 0,
    peak_concurrent_users INTEGER DEFAULT 0,
    average_watch_duration INTEGER, -- In seconds
    total_questions INTEGER DEFAULT 0,
    total_chat_messages INTEGER DEFAULT 0,
    engagement_score DECIMAL(5,2), -- 0-100 score
    completion_rate DECIMAL(5,2), -- Percentage who watched till end
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(webinar_id)
);

-- Indexes for better query performance
CREATE INDEX idx_webinars_doctor_id ON webinars(doctor_id);
CREATE INDEX idx_webinars_scheduled_at ON webinars(scheduled_at);
CREATE INDEX idx_webinars_status ON webinars(status);
CREATE INDEX idx_webinars_created_by ON webinars(created_by);
CREATE INDEX idx_webinar_registrations_webinar_id ON webinar_registrations(webinar_id);
CREATE INDEX idx_webinar_registrations_user_id ON webinar_registrations(user_id);
CREATE INDEX idx_webinar_registrations_status ON webinar_registrations(registration_status);
CREATE INDEX idx_webinar_recordings_webinar_id ON webinar_recordings(webinar_id);
CREATE INDEX idx_webinar_chat_webinar_id ON webinar_chat_messages(webinar_id);
CREATE INDEX idx_webinar_analytics_webinar_id ON webinar_analytics(webinar_id);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_webinars_updated_at BEFORE UPDATE ON webinars
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_webinar_registrations_updated_at BEFORE UPDATE ON webinar_registrations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_webinar_recordings_updated_at BEFORE UPDATE ON webinar_recordings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_webinar_analytics_updated_at BEFORE UPDATE ON webinar_analytics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE webinars IS 'Stores webinar information and scheduling';
COMMENT ON TABLE webinar_registrations IS 'Tracks user registrations and attendance for webinars';
COMMENT ON TABLE webinar_recordings IS 'Stores webinar recording metadata and links';
COMMENT ON TABLE webinar_chat_messages IS 'Stores chat messages and Q&A during webinars';
COMMENT ON TABLE webinar_analytics IS 'Stores analytics and engagement metrics for webinars';
