-- Add richer payment tracking fields for API-v1 lab bookings
ALTER TABLE api_lab_bookings
ADD COLUMN IF NOT EXISTS payment_completed_at TIMESTAMP;
ALTER TABLE api_lab_bookings
ADD COLUMN IF NOT EXISTS payment_failed_at TIMESTAMP;
ALTER TABLE api_lab_bookings
ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50);
ALTER TABLE api_lab_bookings
ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(100);
ALTER TABLE api_lab_bookings
ADD COLUMN IF NOT EXISTS payment_metadata JSONB DEFAULT '{}'::jsonb;