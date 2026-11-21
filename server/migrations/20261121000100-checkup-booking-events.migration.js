/**
 * Status history for corporate health check-up bookings: who moved a booking
 * from which status to which, and when (Team QA 2026-11-21, items 8 and 13).
 *
 * One table for both kinds of booking:
 *   booking_source 'team'     -> lab_orders.id (booked by the wellness team)
 *   booking_source 'employee' -> health_checkup_bookings.id (booked in the app)
 * booking_id is therefore not a foreign key; the pair (source, id) is.
 *
 * Not row-level secured: it holds no clinical data, only booking states, and is
 * read and written only through the Team corporate-bookings routes, which check
 * corporate access first (the same footing as health_checkup_bookings).
 *
 * Run: node scripts/ssm-env-loader.mjs scripts/run-one-migration.mjs migrations/20261121000100-checkup-booking-events.migration.js
 */
export async function up(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS checkup_booking_events (
      id                bigserial PRIMARY KEY,
      corporate_id      integer NOT NULL REFERENCES corporates(id) ON DELETE CASCADE,
      corporate_uid     varchar(6),
      booking_source    text NOT NULL CHECK (booking_source IN ('team', 'employee')),
      booking_id        bigint NOT NULL,
      employee_user_id  integer REFERENCES users(id) ON DELETE CASCADE,
      employee_uid      varchar(6),
      from_status       text,
      to_status         text NOT NULL,
      actor_user_id     integer REFERENCES users(id) ON DELETE SET NULL,
      actor_uid         varchar(6),
      note              varchar(500),
      created_at        timestamptz NOT NULL DEFAULT now()
    )`);
  await client.query(`CREATE INDEX IF NOT EXISTS checkup_booking_events_booking
    ON checkup_booking_events (booking_source, booking_id, created_at)`);
  await client.query(`CREATE INDEX IF NOT EXISTS checkup_booking_events_corporate
    ON checkup_booking_events (corporate_id, created_at DESC)`);

  // Entity UID rule: every cross-entity reference carries its uid twin, kept in step by trigger.
  await client.query(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'attach_uid_reference') THEN
        PERFORM attach_uid_reference('checkup_booking_events', 'corporate_id', 'corporate_uid', 'corporates');
        PERFORM attach_uid_reference('checkup_booking_events', 'employee_user_id', 'employee_uid', 'users');
        PERFORM attach_uid_reference('checkup_booking_events', 'actor_user_id', 'actor_uid', 'users');
      END IF;
    END
    $$;`);
}

export async function down(client) {
  await client.query('DROP TABLE IF EXISTS checkup_booking_events');
}
