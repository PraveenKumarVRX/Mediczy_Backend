-- Employee-facing "book my annual health checkup benefit" flow
-- (/corporate/my-appointments, /corporate/book-checkup) was backed by an
-- in-memory Map keyed by userId -- lost on every restart/deploy and not
-- shared across the cluster. Real per-employee persisted table.
CREATE TABLE IF NOT EXISTS corporate_checkup_bookings (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "checkupId" VARCHAR(100) NOT NULL,
  "checkupName" VARCHAR(255),
  "appointmentType" VARCHAR(255) NOT NULL DEFAULT 'Annual Health Checkup',
  date DATE NOT NULL,
  time VARCHAR(20) NOT NULL,
  hospital VARCHAR(255),
  location VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no-show')),
  "specialInstructions" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_corporate_checkup_bookings_user ON corporate_checkup_bookings("userId");
