-- ============================================
-- WEBINAR EVENT SYSTEM INTEGRATION
-- Add reminder tracking and notification fields
-- ============================================

-- Add reminder tracking columns to webinars table
ALTER TABLE webinars
ADD COLUMN IF NOT EXISTS reminder_1week_sent BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS reminder_24h_sent BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS reminder_2h_sent BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS reminder_15min_sent BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS ical_sent BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS registration_email_sent BOOLEAN DEFAULT FALSE;

-- Add email notification tracking to webinar_registrations
ALTER TABLE webinar_registrations
ADD COLUMN IF NOT EXISTS confirmation_email_sent BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS reminder_email_sent BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS ical_attachment_sent BOOLEAN DEFAULT FALSE;

-- Add index for reminder cron jobs (finds webinars needing reminders)
CREATE INDEX IF NOT EXISTS idx_webinars_reminders 
ON webinars(scheduled_start, status) 
WHERE status IN ('scheduled', 'live');

-- Add index for registration email tracking
CREATE INDEX IF NOT EXISTS idx_registrations_email_tracking 
ON webinar_registrations(webinar_id, confirmation_email_sent, status);

COMMENT ON COLUMN webinars.reminder_1week_sent IS 'Tracks if 1-week reminder was sent';
COMMENT ON COLUMN webinars.reminder_24h_sent IS 'Tracks if 24-hour reminder was sent';
COMMENT ON COLUMN webinars.reminder_2h_sent IS 'Tracks if 2-hour reminder was sent';
COMMENT ON COLUMN webinars.reminder_15min_sent IS 'Tracks if 15-minute reminder was sent';
COMMENT ON COLUMN webinars.ical_sent IS 'Tracks if calendar invite was sent';
COMMENT ON COLUMN webinar_registrations.confirmation_email_sent IS 'Registration confirmation email sent';
COMMENT ON COLUMN webinar_registrations.ical_attachment_sent IS 'Calendar invite attached to email';
