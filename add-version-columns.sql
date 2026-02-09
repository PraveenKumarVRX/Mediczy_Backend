-- Add version tracking columns to api_credentials

ALTER TABLE api_credentials 
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS previous_version INTEGER,
ADD COLUMN IF NOT EXISTS failed_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_failed_at TIMESTAMP;

-- Update existing rows
UPDATE api_credentials 
SET version = 1 
WHERE version IS NULL;

UPDATE api_credentials 
SET failed_attempts = 0 
WHERE failed_attempts IS NULL;

-- Show updated table structure  
\d api_credentials
