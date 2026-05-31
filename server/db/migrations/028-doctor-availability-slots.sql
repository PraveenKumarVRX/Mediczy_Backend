-- =============================================================================
-- MIGRATION 028: Doctor Availability Slots
-- =============================================================================
-- Replaces the JSONB `availabilitySlots` blob on the doctors table with a
-- proper relational structure. Enables:
--   - O(1) slot availability lookup by doctor + date + time
--   - Atomic slot booking (no lost-update race conditions)
--   - Calendar UI rendering without JSON deserialization on every request
--   - Real-time availability via DB-level locking during booking
-- =============================================================================

-- ── 1. DOCTOR SCHEDULES (weekly recurring pattern) ───────────────────────────

CREATE TABLE IF NOT EXISTS doctor_schedules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id       INTEGER NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  organization_id INTEGER,

  -- Day of week: 0=Sun, 1=Mon, ..., 6=Sat
  day_of_week     SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),

  -- Time window for this day
  start_time      TIME NOT NULL,
  end_time        TIME NOT NULL,

  -- Slot configuration
  slot_duration_minutes SMALLINT DEFAULT 15 NOT NULL,
  max_patients_per_slot SMALLINT DEFAULT 1  NOT NULL,   -- >1 enables group consultations

  -- Consultation type(s) available in this window
  consultation_types TEXT[] DEFAULT ARRAY['in_person'],

  -- Validity period (null = recurring indefinitely)
  valid_from      DATE,
  valid_until     DATE,

  is_active       BOOLEAN DEFAULT TRUE,

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (doctor_id, day_of_week, start_time, valid_from)
);

CREATE INDEX IF NOT EXISTS idx_doctor_schedules_doctor   ON doctor_schedules (doctor_id, day_of_week) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_doctor_schedules_org      ON doctor_schedules (organization_id);

-- ── 2. DOCTOR AVAILABILITY SLOTS (concrete per-date instances) ───────────────

CREATE TABLE IF NOT EXISTS doctor_availability_slots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id       INTEGER NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  organization_id INTEGER,
  schedule_id     UUID    REFERENCES doctor_schedules(id) ON DELETE SET NULL,

  -- When
  slot_date       DATE    NOT NULL,
  slot_start      TIME    NOT NULL,
  slot_end        TIME    NOT NULL,

  -- Capacity
  max_bookings    SMALLINT DEFAULT 1 NOT NULL,
  current_bookings SMALLINT DEFAULT 0 NOT NULL,
  is_available    BOOLEAN GENERATED ALWAYS AS (current_bookings < max_bookings) STORED,

  -- Type
  consultation_type TEXT DEFAULT 'in_person',

  -- Override / block
  is_blocked      BOOLEAN DEFAULT FALSE,
  block_reason    TEXT,

  -- Booking lock (prevents double-booking under concurrent requests)
  locked_until    TIMESTAMPTZ,
  locked_by       UUID,    -- session ID of the user mid-booking

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (doctor_id, slot_date, slot_start, consultation_type)
);

CREATE INDEX IF NOT EXISTS idx_slots_doctor_date     ON doctor_availability_slots (doctor_id, slot_date) WHERE NOT is_blocked;
CREATE INDEX IF NOT EXISTS idx_slots_available       ON doctor_availability_slots (doctor_id, slot_date, is_available) WHERE NOT is_blocked;
CREATE INDEX IF NOT EXISTS idx_slots_org             ON doctor_availability_slots (organization_id, slot_date);

-- ── 3. TRIGGER: update updated_at ────────────────────────────────────────────

CREATE TRIGGER doctor_slots_updated_at
  BEFORE UPDATE ON doctor_availability_slots
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER doctor_schedules_updated_at
  BEFORE UPDATE ON doctor_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── 4. SLOT GENERATION FUNCTION ──────────────────────────────────────────────
-- Call this to expand a doctor_schedule row into concrete slot rows for a date range.

CREATE OR REPLACE FUNCTION generate_doctor_slots(
  p_doctor_id   INTEGER,
  p_from_date   DATE DEFAULT CURRENT_DATE,
  p_to_date     DATE DEFAULT CURRENT_DATE + INTERVAL '30 days'
) RETURNS INTEGER AS $$
DECLARE
  schedule      RECORD;
  current_date  DATE;
  slot_start    TIME;
  slot_end      TIME;
  inserted      INTEGER := 0;
BEGIN
  FOR schedule IN
    SELECT * FROM doctor_schedules
    WHERE doctor_id = p_doctor_id AND is_active = TRUE
      AND (valid_from IS NULL OR valid_from <= p_to_date)
      AND (valid_until IS NULL OR valid_until >= p_from_date)
  LOOP
    current_date := p_from_date;
    WHILE current_date <= p_to_date LOOP
      -- Only generate slots for the matching day of week
      IF EXTRACT(DOW FROM current_date)::INTEGER = schedule.day_of_week THEN
        slot_start := schedule.start_time;
        WHILE slot_start < schedule.end_time LOOP
          slot_end := slot_start + (schedule.slot_duration_minutes || ' minutes')::INTERVAL;
          IF slot_end > schedule.end_time THEN EXIT; END IF;

          -- Insert each consultation type separately
          FOR i IN 1..array_length(schedule.consultation_types, 1) LOOP
            INSERT INTO doctor_availability_slots
              (doctor_id, organization_id, schedule_id, slot_date, slot_start, slot_end,
               max_bookings, consultation_type)
            VALUES
              (p_doctor_id, schedule.organization_id, schedule.id, current_date,
               slot_start, slot_end, schedule.max_patients_per_slot,
               schedule.consultation_types[i])
            ON CONFLICT (doctor_id, slot_date, slot_start, consultation_type) DO NOTHING;

            inserted := inserted + 1;
          END LOOP;

          slot_start := slot_end;
        END LOOP;
      END IF;
      current_date := current_date + INTERVAL '1 day';
    END LOOP;
  END LOOP;

  RETURN inserted;
END;
$$ LANGUAGE plpgsql;

-- ── 5. ATOMIC BOOKING FUNCTION ───────────────────────────────────────────────
-- Increments current_bookings atomically — prevents double-booking.

CREATE OR REPLACE FUNCTION book_doctor_slot(
  p_slot_id     UUID,
  p_session_id  UUID DEFAULT gen_random_uuid()
) RETURNS BOOLEAN AS $$
DECLARE
  slot RECORD;
BEGIN
  -- Lock the row for update
  SELECT * INTO slot FROM doctor_availability_slots
  WHERE id = p_slot_id
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN FALSE;   -- slot locked by another transaction
  END IF;

  IF slot.is_blocked THEN
    RETURN FALSE;
  END IF;

  IF slot.current_bookings >= slot.max_bookings THEN
    RETURN FALSE;   -- slot full
  END IF;

  -- Check optimistic lock (slot reserved by another user mid-booking)
  IF slot.locked_until IS NOT NULL AND slot.locked_until > NOW() AND slot.locked_by != p_session_id THEN
    RETURN FALSE;
  END IF;

  UPDATE doctor_availability_slots
  SET current_bookings = current_bookings + 1,
      locked_until     = NULL,
      locked_by        = NULL,
      updated_at       = NOW()
  WHERE id = p_slot_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ── 6. MIGRATE existing JSONB availability data ──────────────────────────────
-- NOTE: run only if doctors.availability_slots JSONB is populated.
-- This is a best-effort migration; manual review recommended.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='doctors' AND column_name='availability_slots') THEN
    RAISE NOTICE 'Doctor availability_slots JSONB column exists — manual migration required.';
    RAISE NOTICE 'Run generate_doctor_slots(doctor_id) after populating doctor_schedules.';
  END IF;
END;
$$;
