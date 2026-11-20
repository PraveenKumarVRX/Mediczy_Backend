/**
 * Women's health: an opt-in setting and a period log saved to the member's account.
 *
 * Both tables hold menstrual data, so they are FORCED row-level security: a row is visible
 * only inside withRlsTransaction() for its own user (app.current_user_id) or to a platform
 * admin. Rows go with the account (ON DELETE CASCADE) and are removed by DPDP erasure.
 *
 * Run: node scripts/ssm-env-loader.mjs scripts/run-one-migration.mjs migrations/20261120000200-womens-health.migration.js
 */
const OWN_ROW = `user_id = NULLIF(current_setting('app.current_user_id', true), '')::int
  OR current_setting('app.is_platform_admin', true) = 'true'`;

export async function up(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS womens_health_settings (
      user_id            integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      user_uid           varchar(6),
      enabled            boolean NOT NULL DEFAULT false,
      cycle_length_days  smallint NOT NULL DEFAULT 28 CHECK (cycle_length_days BETWEEN 15 AND 60),
      period_length_days smallint NOT NULL DEFAULT 5 CHECK (period_length_days BETWEEN 1 AND 15),
      status             text NOT NULL DEFAULT 'NONE'
                         CHECK (status IN ('NONE', 'MENSTRUATION', 'OVULATION', 'PREGNANCY', 'LACTATION')),
      created_at         timestamptz NOT NULL DEFAULT now(),
      updated_at         timestamptz NOT NULL DEFAULT now()
    )`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS menstrual_cycle_logs (
      id           bigserial PRIMARY KEY,
      user_id      integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_uid     varchar(6),
      period_start date NOT NULL,
      period_end   date CHECK (period_end IS NULL OR (period_end >= period_start AND period_end <= period_start + 30)),
      flow         text CHECK (flow IN ('light', 'medium', 'heavy', 'very_heavy')),
      symptoms     text[] NOT NULL DEFAULT '{}',
      notes        varchar(500),
      created_at   timestamptz NOT NULL DEFAULT now(),
      updated_at   timestamptz NOT NULL DEFAULT now(),
      UNIQUE (user_id, period_start)
    )`);
  await client.query('CREATE INDEX IF NOT EXISTS menstrual_cycle_logs_user_start ON menstrual_cycle_logs (user_id, period_start DESC)');

  for (const table of ['womens_health_settings', 'menstrual_cycle_logs']) {
    await client.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    await client.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
    await client.query(`DROP POLICY IF EXISTS ${table}_own_rows ON ${table}`);
    await client.query(`CREATE POLICY ${table}_own_rows ON ${table} USING (${OWN_ROW}) WITH CHECK (${OWN_ROW})`);
  }

  // Entity UID rule: a reference to a person carries the uid twin, kept in step by trigger.
  await client.query(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'attach_uid_reference') THEN
        PERFORM attach_uid_reference('womens_health_settings', 'user_id', 'user_uid', 'users');
        PERFORM attach_uid_reference('menstrual_cycle_logs', 'user_id', 'user_uid', 'users');
      END IF;
    END
    $$;`);
}

export async function down(client) {
  await client.query('DROP TABLE IF EXISTS menstrual_cycle_logs');
  await client.query('DROP TABLE IF EXISTS womens_health_settings');
}
