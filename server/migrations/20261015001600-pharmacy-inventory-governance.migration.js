import pool from '../db/pgPool.js';

/** Migration-owned pharmacy traceability, controlled-drug and recall records. */
export async function up() {
  await pool.query(`
    ALTER TABLE pharmacy_stock
      ADD COLUMN IF NOT EXISTS reserved_quantity INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS organization_id INTEGER;
    ALTER TABLE pharmacy_batches
      ADD COLUMN IF NOT EXISTS reserved_quantity INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS organization_id INTEGER;
    ALTER TABLE pharmacy_transactions
      ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128),
      ADD COLUMN IF NOT EXISTS request_hash CHAR(64);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_pharmacy_transactions_idempotency
      ON pharmacy_transactions (pharmacy_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_pharmacy_stock_org_medicine
      ON pharmacy_stock (pharmacy_id, organization_id, medicine_id);
    CREATE INDEX IF NOT EXISTS idx_pharmacy_batches_fefo
      ON pharmacy_batches (pharmacy_id, medicine_id, expiry_date, created_at, id);

    CREATE TABLE IF NOT EXISTS pharmacy_stock_movements (
      id BIGSERIAL PRIMARY KEY,
      pharmacy_id INTEGER NOT NULL,
      organization_id INTEGER,
      medicine_id INTEGER NOT NULL,
      batch_id INTEGER REFERENCES pharmacy_batches(id) ON DELETE SET NULL,
      movement_type VARCHAR(32) NOT NULL CHECK (movement_type IN ('receive','issue','return','wastage','adjustment','reserve','release','recall')),
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      balance_after INTEGER,
      reference_type VARCHAR(64),
      reference_id BIGINT,
      idempotency_key VARCHAR(128),
      request_hash CHAR(64),
      reason TEXT,
      actor_id VARCHAR(128),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (pharmacy_id, idempotency_key)
    );
    CREATE INDEX IF NOT EXISTS idx_pharmacy_stock_movements_lookup
      ON pharmacy_stock_movements (pharmacy_id, medicine_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS pharmacy_controlled_movements (
      id BIGSERIAL PRIMARY KEY,
      pharmacy_id INTEGER NOT NULL,
      organization_id INTEGER,
      medicine_id INTEGER NOT NULL,
      batch_id INTEGER REFERENCES pharmacy_batches(id) ON DELETE SET NULL,
      movement_type VARCHAR(24) NOT NULL CHECK (movement_type IN ('receive','issue','return','wastage','adjustment')),
      quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
      balance_after NUMERIC(12,3),
      patient_id INTEGER,
      prescription_id INTEGER,
      witness_id VARCHAR(128),
      reason TEXT,
      idempotency_key VARCHAR(128) NOT NULL,
      request_hash CHAR(64) NOT NULL,
      actor_id VARCHAR(128),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (pharmacy_id, idempotency_key)
    );
    CREATE INDEX IF NOT EXISTS idx_pharmacy_controlled_register
      ON pharmacy_controlled_movements (pharmacy_id, medicine_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS pharmacy_wastage (
      id BIGSERIAL PRIMARY KEY,
      pharmacy_id INTEGER NOT NULL,
      organization_id INTEGER,
      medicine_id INTEGER NOT NULL,
      batch_id INTEGER REFERENCES pharmacy_batches(id) ON DELETE SET NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      reason VARCHAR(64) NOT NULL,
      notes TEXT,
      idempotency_key VARCHAR(128) NOT NULL,
      request_hash CHAR(64) NOT NULL,
      actor_id VARCHAR(128),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (pharmacy_id, idempotency_key)
    );
    CREATE INDEX IF NOT EXISTS idx_pharmacy_wastage_lookup
      ON pharmacy_wastage (pharmacy_id, medicine_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS pharmacy_recalls (
      id BIGSERIAL PRIMARY KEY,
      pharmacy_id INTEGER NOT NULL,
      organization_id INTEGER,
      recall_number VARCHAR(80) NOT NULL,
      reason TEXT NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'open' CHECK (status IN ('open','quarantined','closed')),
      opened_by VARCHAR(128),
      closed_by VARCHAR(128),
      closed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (pharmacy_id, recall_number)
    );
    CREATE TABLE IF NOT EXISTS pharmacy_recall_items (
      id BIGSERIAL PRIMARY KEY,
      recall_id BIGINT NOT NULL REFERENCES pharmacy_recalls(id) ON DELETE CASCADE,
      pharmacy_id INTEGER NOT NULL,
      medicine_id INTEGER NOT NULL,
      batch_id INTEGER REFERENCES pharmacy_batches(id) ON DELETE SET NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_pharmacy_recall_items_lookup
      ON pharmacy_recall_items (pharmacy_id, medicine_id, batch_id);
  `);
}

export async function down() {
  await pool.query(`
    DROP TABLE IF EXISTS pharmacy_recall_items, pharmacy_recalls,
      pharmacy_wastage, pharmacy_controlled_movements, pharmacy_stock_movements CASCADE;
    DROP INDEX IF EXISTS idx_pharmacy_batches_fefo;
    DROP INDEX IF EXISTS idx_pharmacy_stock_org_medicine;
    DROP INDEX IF EXISTS uq_pharmacy_transactions_idempotency;
    ALTER TABLE pharmacy_transactions DROP COLUMN IF EXISTS request_hash, DROP COLUMN IF EXISTS idempotency_key;
    ALTER TABLE pharmacy_batches DROP COLUMN IF EXISTS organization_id, DROP COLUMN IF EXISTS reserved_quantity;
    ALTER TABLE pharmacy_stock DROP COLUMN IF EXISTS organization_id, DROP COLUMN IF EXISTS reserved_quantity;
  `);
}

if (process.argv[1] && process.argv[1].includes('20261015001600-pharmacy-inventory-governance')) {
  up().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
}

export default { up, down };
