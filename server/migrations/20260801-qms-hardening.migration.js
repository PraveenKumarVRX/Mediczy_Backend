/**
 * QMS hardening: appointment-day uniqueness, token sequence table, display device org, retention helper index.
 */
export async function up(client) {
  const q = client.query.bind(client);

  await q(`ALTER TABLE display_devices ADD COLUMN IF NOT EXISTS organization_id INTEGER`);

  await q(`
    CREATE TABLE IF NOT EXISTS hospital_queue_token_sequences (
      organization_id INTEGER NOT NULL,
      department VARCHAR(40) NOT NULL,
      doctor_id INTEGER NOT NULL DEFAULT 0,
      queue_zone VARCHAR(80) NOT NULL DEFAULT '',
      seq_date DATE NOT NULL,
      last_seq INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (organization_id, department, doctor_id, queue_zone, seq_date)
    )
  `);

  // One active token per appointment per calendar day (idempotency under concurrency)
  await q(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_hqe_appointment_day_unique
    ON hospital_queue_entries (appointment_id, ((check_in_at)::date))
    WHERE appointment_id IS NOT NULL
      AND status IN ('waiting','called','serving')
  `);

  await q(`CREATE INDEX IF NOT EXISTS idx_hqe_appointment_id ON hospital_queue_entries (appointment_id)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_hqe_org_checkin_date ON hospital_queue_entries (organization_id, check_in_at)`);

  console.log('✅ QMS hardening migration applied');
}

export async function down(client) {
  const q = client.query.bind(client);
  await q(`DROP INDEX IF EXISTS idx_hqe_appointment_day_unique`);
  await q(`DROP INDEX IF EXISTS idx_hqe_appointment_id`);
  await q(`DROP INDEX IF EXISTS idx_hqe_org_checkin_date`);
  await q(`DROP TABLE IF EXISTS hospital_queue_token_sequences`);
}

export default { up, down };
