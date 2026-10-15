import pool from '../db/pgPool.js';

/** Migration-owned OT consumables, implants and family-notification schema. */
export async function up() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS procedure_consumables (
      id                BIGSERIAL PRIMARY KEY,
      organization_id   BIGINT,
      ot_booking_id     BIGINT NOT NULL,
      admission_id      BIGINT,
      scanned_by        TEXT,
      item_code         TEXT,
      item_name         TEXT NOT NULL,
      category          TEXT,
      quantity          NUMERIC(10,3) NOT NULL DEFAULT 1,
      unit              TEXT DEFAULT 'piece',
      unit_cost         NUMERIC(12,2),
      lot_number        TEXT,
      expiry_date       DATE,
      is_billable       BOOLEAN DEFAULT TRUE,
      notes             TEXT,
      scanned_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE procedure_consumables ADD COLUMN IF NOT EXISTS organization_id BIGINT;
    ALTER TABLE procedure_consumables ADD COLUMN IF NOT EXISTS admission_id BIGINT;
    ALTER TABLE procedure_consumables ADD COLUMN IF NOT EXISTS scanned_by TEXT;
    ALTER TABLE procedure_consumables ADD COLUMN IF NOT EXISTS item_code TEXT;
    ALTER TABLE procedure_consumables ADD COLUMN IF NOT EXISTS item_name TEXT;
    ALTER TABLE procedure_consumables ADD COLUMN IF NOT EXISTS category TEXT;
    ALTER TABLE procedure_consumables ADD COLUMN IF NOT EXISTS quantity NUMERIC(10,3) DEFAULT 1;
    ALTER TABLE procedure_consumables ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'piece';
    ALTER TABLE procedure_consumables ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(12,2);
    ALTER TABLE procedure_consumables ADD COLUMN IF NOT EXISTS lot_number TEXT;
    ALTER TABLE procedure_consumables ADD COLUMN IF NOT EXISTS expiry_date DATE;
    ALTER TABLE procedure_consumables ADD COLUMN IF NOT EXISTS is_billable BOOLEAN DEFAULT TRUE;
    ALTER TABLE procedure_consumables ADD COLUMN IF NOT EXISTS notes TEXT;
    ALTER TABLE procedure_consumables ADD COLUMN IF NOT EXISTS scanned_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE procedure_consumables ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
    CREATE INDEX IF NOT EXISTS idx_consumables_booking ON procedure_consumables(ot_booking_id);

    CREATE TABLE IF NOT EXISTS implant_records (
      id                BIGSERIAL PRIMARY KEY,
      organization_id   BIGINT,
      ot_booking_id     BIGINT NOT NULL,
      admission_id      BIGINT,
      patient_id        BIGINT,
      recorded_by       TEXT,
      implant_name      TEXT NOT NULL,
      manufacturer      TEXT,
      model_number      TEXT,
      serial_number     TEXT,
      lot_number        TEXT,
      size_details      TEXT,
      implant_date      DATE,
      body_location     TEXT,
      unit_cost         NUMERIC(12,2),
      is_billable       BOOLEAN DEFAULT TRUE,
      notes             TEXT,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE implant_records ADD COLUMN IF NOT EXISTS organization_id BIGINT;
    ALTER TABLE implant_records ADD COLUMN IF NOT EXISTS admission_id BIGINT;
    ALTER TABLE implant_records ADD COLUMN IF NOT EXISTS patient_id BIGINT;
    ALTER TABLE implant_records ADD COLUMN IF NOT EXISTS recorded_by TEXT;
    ALTER TABLE implant_records ADD COLUMN IF NOT EXISTS implant_name TEXT;
    ALTER TABLE implant_records ADD COLUMN IF NOT EXISTS manufacturer TEXT;
    ALTER TABLE implant_records ADD COLUMN IF NOT EXISTS model_number TEXT;
    ALTER TABLE implant_records ADD COLUMN IF NOT EXISTS serial_number TEXT;
    ALTER TABLE implant_records ADD COLUMN IF NOT EXISTS lot_number TEXT;
    ALTER TABLE implant_records ADD COLUMN IF NOT EXISTS size_details TEXT;
    ALTER TABLE implant_records ADD COLUMN IF NOT EXISTS implant_date DATE;
    ALTER TABLE implant_records ADD COLUMN IF NOT EXISTS body_location TEXT;
    ALTER TABLE implant_records ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(12,2);
    ALTER TABLE implant_records ADD COLUMN IF NOT EXISTS is_billable BOOLEAN DEFAULT TRUE;
    ALTER TABLE implant_records ADD COLUMN IF NOT EXISTS notes TEXT;
    ALTER TABLE implant_records ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
    CREATE INDEX IF NOT EXISTS idx_implants_booking ON implant_records(ot_booking_id);
    CREATE INDEX IF NOT EXISTS idx_implants_patient ON implant_records(patient_id);

    CREATE TABLE IF NOT EXISTS family_notifications (
      id                BIGSERIAL PRIMARY KEY,
      organization_id   BIGINT,
      ot_booking_id     BIGINT NOT NULL,
      patient_id        BIGINT,
      notification_type TEXT NOT NULL,
      message           TEXT,
      sent_by           TEXT,
      channel           TEXT DEFAULT 'manual',
      sent_to           TEXT,
      sent_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE family_notifications ADD COLUMN IF NOT EXISTS organization_id BIGINT;
    ALTER TABLE family_notifications ADD COLUMN IF NOT EXISTS patient_id BIGINT;
    ALTER TABLE family_notifications ADD COLUMN IF NOT EXISTS notification_type TEXT;
    ALTER TABLE family_notifications ADD COLUMN IF NOT EXISTS message TEXT;
    ALTER TABLE family_notifications ADD COLUMN IF NOT EXISTS sent_by TEXT;
    ALTER TABLE family_notifications ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'manual';
    ALTER TABLE family_notifications ADD COLUMN IF NOT EXISTS sent_to TEXT;
    ALTER TABLE family_notifications ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ DEFAULT NOW();
    CREATE INDEX IF NOT EXISTS idx_family_notif_booking ON family_notifications(ot_booking_id);
  `);
  console.log('[migration] OT consumables governance schema ready');
}

export async function down() {
  await pool.query(`
    DROP TABLE IF EXISTS family_notifications CASCADE;
    DROP TABLE IF EXISTS implant_records CASCADE;
    DROP TABLE IF EXISTS procedure_consumables CASCADE;
  `);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  up().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
}

export default { up, down };
