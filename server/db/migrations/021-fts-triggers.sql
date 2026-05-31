-- =============================================================================
-- MIGRATION 021: DB-Level Full-Text Search Triggers
-- =============================================================================
-- Replaces the fragile Sequelize hook-based search_vector update.
-- Triggers fire on INSERT and UPDATE regardless of how data enters the DB
-- (ORM, bulk import, direct SQL, migrations).
-- =============================================================================

-- ── 1. USERS full-text search ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION users_fts_update() RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW."firstName", '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW."lastName",  '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.email,       '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW."phoneNumber", '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_fts_trigger ON users;
CREATE TRIGGER users_fts_trigger
  BEFORE INSERT OR UPDATE OF "firstName", "lastName", email, "phoneNumber"
  ON users
  FOR EACH ROW EXECUTE FUNCTION users_fts_update();

-- Backfill existing rows
UPDATE users SET "firstName" = "firstName" WHERE search_vector IS NULL OR search_vector = '';

-- ── 2. DOCTORS full-text search ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION doctors_fts_update() RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(to_jsonb(NEW)->>'firstName',      '')), 'A') ||
    setweight(to_tsvector('english', coalesce(to_jsonb(NEW)->>'lastName',       '')), 'A') ||
    setweight(to_tsvector('english', coalesce(to_jsonb(NEW)->>'specialization', '')), 'B') ||
    setweight(to_tsvector('english', coalesce(to_jsonb(NEW)->>'hospitalName',   to_jsonb(NEW)->>'clinicAddress', '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='doctors' AND column_name='search_vector') THEN
    DROP TRIGGER IF EXISTS doctors_fts_trigger ON doctors;
    CREATE TRIGGER doctors_fts_trigger
      BEFORE INSERT OR UPDATE
      ON doctors
      FOR EACH ROW EXECUTE FUNCTION doctors_fts_update();
  END IF;
END;
$$;

-- ── 3. HOSPITALS full-text search ────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='hospitals') THEN
    -- Add search_vector column if absent
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='hospitals' AND column_name='search_vector') THEN
      ALTER TABLE hospitals ADD COLUMN search_vector TSVECTOR;
    END IF;

    EXECUTE $inner$
      CREATE OR REPLACE FUNCTION hospitals_fts_update() RETURNS TRIGGER AS $fn$
      BEGIN
        NEW.search_vector :=
          setweight(to_tsvector('english', coalesce(to_jsonb(NEW)->>'name', to_jsonb(NEW)->>'hospital_name', '')), 'A') ||
          setweight(to_tsvector('english', coalesce(to_jsonb(NEW)->>'city', '')), 'B') ||
          setweight(to_tsvector('english', coalesce(to_jsonb(NEW)->>'state', '')), 'C');
        RETURN NEW;
      END; $fn$ LANGUAGE plpgsql;
    $inner$;

    DROP TRIGGER IF EXISTS hospitals_fts_trigger ON hospitals;
    CREATE TRIGGER hospitals_fts_trigger
      BEFORE INSERT OR UPDATE
      ON hospitals
      FOR EACH ROW EXECUTE FUNCTION hospitals_fts_update();
  END IF;
END;
$$;
