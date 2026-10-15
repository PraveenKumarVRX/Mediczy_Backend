import pool from '../db/pgPool.js';

/** Migration-owned canonical hospital tariff master. */
export async function up() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hospital_tariffs (
      id BIGSERIAL PRIMARY KEY,
      hospital_id INTEGER NOT NULL,
      code VARCHAR(80) NOT NULL,
      item_name VARCHAR(200) NOT NULL,
      category VARCHAR(80) NOT NULL,
      unit VARCHAR(40) NOT NULL,
      room_category VARCHAR(80),
      payer_type VARCHAR(80),
      package_code VARCHAR(80),
      rate NUMERIC(12,2) NOT NULL CHECK (rate >= 0),
      gst NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (gst >= 0 AND gst <= 100),
      effective_from DATE NOT NULL,
      effective_to DATE,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (effective_to IS NULL OR effective_to >= effective_from)
    );
    CREATE INDEX IF NOT EXISTS hospital_tariffs_lookup_idx
      ON hospital_tariffs (hospital_id, code, active, effective_from DESC);
    CREATE INDEX IF NOT EXISTS hospital_tariffs_scope_idx
      ON hospital_tariffs (hospital_id, category, payer_type, room_category);
  `);
  console.log('[migration] hospital tariff master ready');
}

export async function down() {
  await pool.query('DROP TABLE IF EXISTS hospital_tariffs CASCADE');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  up().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
}

export default { up, down };
