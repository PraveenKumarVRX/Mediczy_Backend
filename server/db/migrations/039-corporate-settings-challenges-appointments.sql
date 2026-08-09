-- Real per-corporate tables to replace shared in-memory stores that were
-- (a) never persisted across restarts and (b) not scoped by corporate_id,
-- causing every corporate to read/write the exact same in-process object.

-- Generic JSONB blob: the corporate settings UI persists a handful of
-- loosely-typed sub-objects (general/notifs/security/billing/integrations)
-- that vary by frontend revision, so this table stores the whole object
-- rather than pinning individual columns to a shape that will drift.
-- corporate_employees rows created via bulk-upload/manual-add never had a
-- place to store the employee's email before they self-activate an account
-- (userId is NULL until then), which made "Send Invite" impossible to wire
-- for real — there was no address to send to.
ALTER TABLE corporate_employees ADD COLUMN IF NOT EXISTS email VARCHAR(255);

CREATE TABLE IF NOT EXISTS corporate_settings (
  corporate_id INTEGER PRIMARY KEY REFERENCES corporates(id) ON DELETE CASCADE,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS corporate_challenges (
  id SERIAL PRIMARY KEY,
  corporate_id INTEGER NOT NULL REFERENCES corporates(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(50) NOT NULL,
  target NUMERIC NOT NULL,
  unit VARCHAR(50) NOT NULL DEFAULT 'points',
  "startDate" DATE NOT NULL,
  "endDate" DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'cancelled')),
  rewards JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_corporate_challenges_corp ON corporate_challenges(corporate_id);

CREATE TABLE IF NOT EXISTS corporate_challenge_participants (
  id SERIAL PRIMARY KEY,
  challenge_id INTEGER NOT NULL REFERENCES corporate_challenges(id) ON DELETE CASCADE,
  "userId" INTEGER REFERENCES users(id) ON DELETE CASCADE,
  "employeeId" VARCHAR(100) NOT NULL,
  score NUMERIC NOT NULL DEFAULT 0,
  "joinedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (challenge_id, "employeeId")
);

CREATE TABLE IF NOT EXISTS corporate_scheduled_appointments (
  id SERIAL PRIMARY KEY,
  corporate_id INTEGER NOT NULL REFERENCES corporates(id) ON DELETE CASCADE,
  "employeeId" VARCHAR(100) NOT NULL,
  "employeeName" VARCHAR(255),
  department VARCHAR(255),
  "appointmentType" VARCHAR(255) NOT NULL,
  "doctorName" VARCHAR(255),
  facility VARCHAR(255),
  date DATE NOT NULL,
  time VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no-show')),
  notes TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_corporate_sched_appt_corp ON corporate_scheduled_appointments(corporate_id);
