-- Floor maps for the lobby wayfinding kiosk, and a log of what visitors asked.  (2026-10-08)
--
-- Both tables already exist in production (created from the June "prod" branch; hospital_floor_maps is empty,
-- wayfinding_queries holds one June test row), so this only adds what the org-scoped implementation needs:
-- the tenant twin on hospital_floor_maps, who edited a floor, and which device asked what.
--
-- `hospital_id` holds the TENANT id, exactly as display_devices.organization_id does (the kiosk reads it from the
-- device registry). wayfinding_queries.hospital_uid is already twinned to `tenants`; hospital_floor_maps gets the
-- same twin here. `departments` is an array of { id, name, aliases?, directions?, landmark? }; the kiosk only ever
-- says what an administrator wrote. Until a hospital configures a floor it answers "ask at reception".

-- Fresh environments (production already has these, so these are no-ops there).
CREATE TABLE IF NOT EXISTS hospital_floor_maps (
  id           BIGSERIAL PRIMARY KEY,
  hospital_id  INTEGER NOT NULL,
  floor_number INTEGER NOT NULL DEFAULT 0,
  floor_name   VARCHAR(100),
  map_svg      TEXT,
  departments  JSONB NOT NULL DEFAULT '[]',
  paths        JSONB NOT NULL DEFAULT '[]',
  landmarks    JSONB NOT NULL DEFAULT '[]',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (hospital_id, floor_number)
);
CREATE TABLE IF NOT EXISTS wayfinding_queries (
  id          BIGSERIAL PRIMARY KEY,
  hospital_id INTEGER NOT NULL,
  kiosk_id    VARCHAR(100),
  query_text  TEXT,
  from_loc    VARCHAR(255),
  to_loc      VARCHAR(255),
  route_json  JSONB,
  lang        VARCHAR(10) DEFAULT 'en',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wayfinding_hospital_ts ON wayfinding_queries (hospital_id, created_at DESC);

-- What this change adds.
ALTER TABLE hospital_floor_maps ADD COLUMN IF NOT EXISTS updated_by BIGINT;
ALTER TABLE wayfinding_queries  ADD COLUMN IF NOT EXISTS device_id  BIGINT;
ALTER TABLE wayfinding_queries  ADD COLUMN IF NOT EXISTS matched    VARCHAR(255);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM entity_uid_references WHERE table_name = 'hospital_floor_maps' AND uid_col = 'hospital_uid') THEN
    PERFORM attach_uid_reference('hospital_floor_maps', 'hospital_id', 'hospital_uid', 'tenants');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM entity_uid_references WHERE table_name = 'wayfinding_queries' AND uid_col = 'hospital_uid') THEN
    PERFORM attach_uid_reference('wayfinding_queries', 'hospital_id', 'hospital_uid', 'tenants');
  END IF;
END $$;
