/**
 * Single journey token across departments (kiosk → OPD → lab → radiology → pharmacy).
 * Public slip number (token_number) is reused; each stop is a new queue row.
 */
export async function up(client) {
  const q = client.query.bind(client);

  await q(`ALTER TABLE hospital_queue_entries ADD COLUMN IF NOT EXISTS journey_id UUID`);
  await q(`ALTER TABLE hospital_queue_entries ADD COLUMN IF NOT EXISTS journey_token VARCHAR(32)`);
  await q(`ALTER TABLE hospital_queue_entries ADD COLUMN IF NOT EXISTS parent_entry_id INTEGER`);
  await q(`ALTER TABLE hospital_queue_entries ADD COLUMN IF NOT EXISTS step_order SMALLINT DEFAULT 1`);
  await q(`ALTER TABLE hospital_queue_entries ADD COLUMN IF NOT EXISTS next_department VARCHAR(40)`);

  // Backfill: existing rows are single-step journeys with token_number as journey token
  await q(`
    UPDATE hospital_queue_entries
    SET journey_id = COALESCE(journey_id, gen_random_uuid()),
        journey_token = COALESCE(journey_token, token_number),
        step_order = COALESCE(step_order, 1)
    WHERE journey_id IS NULL OR journey_token IS NULL
  `);

  await q(`
    CREATE INDEX IF NOT EXISTS idx_hqe_journey_id
    ON hospital_queue_entries (organization_id, journey_id)
  `);
  await q(`
    CREATE INDEX IF NOT EXISTS idx_hqe_journey_token_day
    ON hospital_queue_entries (organization_id, journey_token, ((check_in_at)::date))
  `);

  // Org-day sequence for public journey tokens (T-001 …) — department-agnostic
  await q(`
    CREATE TABLE IF NOT EXISTS hospital_queue_journey_sequences (
      organization_id INTEGER NOT NULL,
      seq_date DATE NOT NULL,
      last_seq INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (organization_id, seq_date)
    )
  `);

  console.log('✅ QMS journey token migration applied');
}

export async function down(client) {
  const q = client.query.bind(client);
  await q(`DROP INDEX IF EXISTS idx_hqe_journey_id`);
  await q(`DROP INDEX IF EXISTS idx_hqe_journey_token_day`);
  await q(`DROP TABLE IF EXISTS hospital_queue_journey_sequences`);
  await q(`ALTER TABLE hospital_queue_entries DROP COLUMN IF EXISTS next_department`);
  await q(`ALTER TABLE hospital_queue_entries DROP COLUMN IF EXISTS step_order`);
  await q(`ALTER TABLE hospital_queue_entries DROP COLUMN IF EXISTS parent_entry_id`);
  await q(`ALTER TABLE hospital_queue_entries DROP COLUMN IF EXISTS journey_token`);
  await q(`ALTER TABLE hospital_queue_entries DROP COLUMN IF EXISTS journey_id`);
}

export default { up, down };
