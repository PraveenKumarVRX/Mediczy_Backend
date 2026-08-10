-- Real per-employee RSVP tracking for corporate wellness events. Previously
-- the employee wellness calendar's RSVP action was entirely client-side
-- (`// Simulate API call` + setTimeout) with no backend persistence, and
-- every active employee saw every invites_sent event regardless of who was
-- actually selected as a participant (send-invites only ever wrote an
-- aggregate total_invited count, never who).
CREATE TABLE IF NOT EXISTS corporate_wellness_event_rsvps (
  id SERIAL PRIMARY KEY,
  event_id BIGINT NOT NULL REFERENCES corporate_wellness_events(id) ON DELETE CASCADE,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "employeeId" VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'declined', 'attended', 'missed')),
  invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  UNIQUE (event_id, "userId")
);
CREATE INDEX IF NOT EXISTS idx_cwer_user ON corporate_wellness_event_rsvps("userId");
CREATE INDEX IF NOT EXISTS idx_cwer_event ON corporate_wellness_event_rsvps(event_id);
