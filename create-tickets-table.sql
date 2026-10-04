-- Create tickets table for the support ticketing system
-- Compatible with MongoDB-style ticket structure

CREATE TABLE IF NOT EXISTS tickets (
  id SERIAL PRIMARY KEY,
  ticket_id VARCHAR(50) UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50) DEFAULT 'general',
  priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'in-progress', 'pending', 'resolved', 'closed')),
  requester JSONB DEFAULT '{}',
  assignee JSONB,
  messages JSONB DEFAULT '[]',
  tags TEXT[],
  due_date TIMESTAMP,
  resolved_at TIMESTAMP,
  closed_at TIMESTAMP,
  resolution TEXT,
  escalation JSONB DEFAULT '{"level": 0}',
  satisfaction JSONB,
  analytics JSONB DEFAULT '{"viewCount": 0, "responseTime": null, "resolutionTime": null}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_tickets_ticket_id ON tickets(ticket_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets(priority);
CREATE INDEX IF NOT EXISTS idx_tickets_category ON tickets(category);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at);
CREATE INDEX IF NOT EXISTS idx_tickets_assignee ON tickets USING GIN(assignee);
CREATE INDEX IF NOT EXISTS idx_tickets_requester ON tickets USING GIN(requester);
CREATE INDEX IF NOT EXISTS idx_tickets_tags ON tickets USING GIN(tags);

-- Create function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_tickets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-updating updated_at
DROP TRIGGER IF EXISTS tickets_updated_at ON tickets;
CREATE TRIGGER tickets_updated_at
  BEFORE UPDATE ON tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_tickets_updated_at();

-- Sample data (optional)
-- INSERT INTO tickets (ticket_id, title, description, category, priority, status, requester)
-- VALUES 
--   ('DEMO001', 'Test Ticket', 'This is a test ticket', 'technical', 'medium', 'open', '{"name": "Test User", "email": "test@example.com"}');
