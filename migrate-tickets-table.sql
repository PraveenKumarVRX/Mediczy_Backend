-- Add missing JSONB columns to the tickets table for the support ticketing system
-- Run this as the table owner (postgres or admin user)

-- Add new columns
DO $$ 
BEGIN
  -- Check and add columns one by one
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tickets' AND column_name='requester') THEN
    ALTER TABLE tickets ADD COLUMN requester JSONB DEFAULT '{}';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tickets' AND column_name='assignee') THEN
    ALTER TABLE tickets ADD COLUMN assignee JSONB;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tickets' AND column_name='messages') THEN
    ALTER TABLE tickets ADD COLUMN messages JSONB DEFAULT '[]';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tickets' AND column_name='escalation') THEN
    ALTER TABLE tickets ADD COLUMN escalation JSONB DEFAULT '{"level": 0}';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tickets' AND column_name='satisfaction') THEN
    ALTER TABLE tickets ADD COLUMN satisfaction JSONB;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tickets' AND column_name='analytics') THEN
    ALTER TABLE tickets ADD COLUMN analytics JSONB DEFAULT '{"viewCount": 0, "responseTime": null, "resolutionTime": null}';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tickets' AND column_name='resolution') THEN
    ALTER TABLE tickets ADD COLUMN resolution TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tickets' AND column_name='due_date') THEN
    ALTER TABLE tickets ADD COLUMN due_date TIMESTAMP;
  END IF;

  -- Update ticketNumber to allow nulls if it doesn't
  ALTER TABLE tickets ALTER COLUMN "ticketNumber" DROP NOT NULL;
  
END $$;

-- Add indexes for JSONB columns
CREATE INDEX IF NOT EXISTS idx_tickets_requester ON tickets USING GIN(requester);
CREATE INDEX IF NOT EXISTS idx_tickets_assignee ON tickets USING GIN(assignee);
CREATE INDEX IF NOT EXISTS idx_tickets_messages ON tickets USING GIN(messages);

GRANT SELECT, INSERT, UPDATE, DELETE ON tickets TO mediczy_helper;
GRANT USAGE, SELECT ON SEQUENCE tickets_id_seq TO mediczy_helper;

\echo 'Tickets table migration complete!'
