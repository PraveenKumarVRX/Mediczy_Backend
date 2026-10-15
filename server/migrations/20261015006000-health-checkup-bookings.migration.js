/** Patient health-checkup booking persistence. */
// Use the shared SSM-aware pool so direct-run migrations receive production
// credentials and TLS exactly like the application and other migrations.
import sharedPool from '../db/pgPool.js';

export async function up(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS health_checkup_bookings (
      id BIGSERIAL PRIMARY KEY,
      booking_reference VARCHAR(40) NOT NULL UNIQUE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      member_type VARCHAR(20) NOT NULL CHECK (member_type IN ('individual', 'corporate')),
      corporate_id INTEGER REFERENCES corporates(id) ON DELETE SET NULL,
      package_id VARCHAR(150) NOT NULL,
      package_name VARCHAR(255) NOT NULL,
      package_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      lab_id INTEGER NOT NULL REFERENCES labs(id) ON DELETE RESTRICT,
      lab_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      patient_details JSONB NOT NULL DEFAULT '{}'::jsonb,
      appointment_date DATE NOT NULL,
      time_slot VARCHAR(100) NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'payment_pending',
      payment_status VARCHAR(30) NOT NULL DEFAULT 'not_required',
      payment_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      currency VARCHAR(10) NOT NULL DEFAULT 'INR',
      payment_order_id VARCHAR(100),
      payment_id VARCHAR(100),
      payment_details JSONB NOT NULL DEFAULT '{}'::jsonb,
      cancellation_reason TEXT,
      rescheduled_from BIGINT REFERENCES health_checkup_bookings(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_health_checkup_bookings_user ON health_checkup_bookings(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_health_checkup_bookings_lab_slot ON health_checkup_bookings(lab_id, appointment_date, time_slot);
    CREATE INDEX IF NOT EXISTS idx_health_checkup_bookings_corporate ON health_checkup_bookings(corporate_id, status);
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_health_checkup_active_package ON health_checkup_bookings(user_id, package_id) WHERE status NOT IN ('cancelled', 'completed');
  `);
}
export async function down(pool) { await pool.query('DROP TABLE IF EXISTS health_checkup_bookings CASCADE;'); }

if (process.argv[1] && process.argv[1].endsWith('20261015006000-health-checkup-bookings.migration.js')) {
  const db = sharedPool.pool || sharedPool;
  db.connect()
    .then((client) => up(client).finally(() => client.release()))
    .then(() => console.log('health-checkup-bookings migration applied'))
    .catch((error) => { console.error(error); process.exitCode = 1; })
    .finally(() => db.end());
}
