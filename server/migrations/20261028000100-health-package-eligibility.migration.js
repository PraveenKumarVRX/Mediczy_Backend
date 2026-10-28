/** Existing packages remain self-only and inherit the corporate network. */
export async function up(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS health_package_venues (
      package_id VARCHAR(150) NOT NULL REFERENCES corporate_health_package_catalog(id) ON DELETE CASCADE,
      partner_id INTEGER NOT NULL,
      partner_type VARCHAR(20) NOT NULL DEFAULT 'lab' CHECK (partner_type IN ('lab','hospital')),
      relation VARCHAR(20) NOT NULL DEFAULT 'all' CHECK (relation IN ('all','self','spouse','child','parent','parent_in_law','sibling')),
      lab_id INTEGER GENERATED ALWAYS AS (CASE WHEN partner_type='lab' THEN partner_id END) STORED REFERENCES labs(id) ON DELETE RESTRICT,
      hospital_id INTEGER GENERATED ALWAYS AS (CASE WHEN partner_type='hospital' THEN partner_id END) STORED REFERENCES hospitals(id) ON DELETE RESTRICT,
      PRIMARY KEY (package_id, partner_id, partner_type, relation)
    );
    ALTER TABLE health_checkup_bookings ALTER COLUMN lab_id DROP NOT NULL;
    ALTER TABLE health_checkup_bookings ADD COLUMN IF NOT EXISTS hospital_id INTEGER REFERENCES hospitals(id) ON DELETE RESTRICT;
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='health_checkup_bookings'::regclass AND conname='health_checkup_one_venue') THEN
        ALTER TABLE health_checkup_bookings ADD CONSTRAINT health_checkup_one_venue CHECK ((lab_id IS NOT NULL)::int + (hospital_id IS NOT NULL)::int = 1);
      END IF;
    END $$;
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_health_checkup_active_hospital_slot ON health_checkup_bookings(hospital_id,appointment_date,time_slot) WHERE status IN ('payment_pending','confirmed','scheduled','rescheduled');
    ALTER TABLE health_checkup_bookings ADD COLUMN IF NOT EXISTS beneficiary_relation VARCHAR(20) NOT NULL DEFAULT 'self'
      CHECK (beneficiary_relation IN ('self','spouse','child','parent','parent_in_law','sibling'));
  `);
}
export async function down(pool) {
  await pool.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM health_checkup_bookings WHERE hospital_id IS NOT NULL) THEN RAISE EXCEPTION 'Hospital bookings exist; eligibility migration cannot be rolled back without losing venue history'; END IF; END $$; ALTER TABLE health_checkup_bookings DROP CONSTRAINT IF EXISTS health_checkup_one_venue; ALTER TABLE health_checkup_bookings DROP COLUMN IF EXISTS beneficiary_relation; DROP INDEX IF EXISTS uniq_health_checkup_active_hospital_slot; ALTER TABLE health_checkup_bookings DROP COLUMN IF EXISTS hospital_id; ALTER TABLE health_checkup_bookings ALTER COLUMN lab_id SET NOT NULL; DROP TABLE IF EXISTS health_package_venues;`);
}
