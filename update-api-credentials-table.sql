-- Add missing columns to existing api_credentials table

ALTER TABLE api_credentials 
ADD COLUMN IF NOT EXISTS client_secret_salt VARCHAR(32),
ADD COLUMN IF NOT EXISTS corporate_id INTEGER,
ADD COLUMN IF NOT EXISTS scopes JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active',
ADD COLUMN IF NOT EXISTS usage_count INTEGER DEFAULT 0;

-- Update existing rows to have default values
UPDATE api_credentials 
SET status = 'active' 
WHERE status IS NULL;

UPDATE api_credentials 
SET scopes = '[]' 
WHERE scopes IS NULL;

UPDATE api_credentials 
SET usage_count = 0 
WHERE usage_count IS NULL;

-- Show updated table structure
\d api_credentials
