import pool from '../db/pgPool.js';

/** Migration-owned hospital display, kiosk, broadcast and check-in schema. */
export async function up() {
  await pool.query(`
CREATE TABLE IF NOT EXISTS display_zones (
        id SERIAL PRIMARY KEY,
        zone_id VARCHAR(80) UNIQUE NOT NULL,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        floor VARCHAR(50),
        building VARCHAR(100),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    

      CREATE TABLE IF NOT EXISTS display_devices (
        id SERIAL PRIMARY KEY,
        device_token VARCHAR(120) UNIQUE NOT NULL,
        name VARCHAR(200),
        zone_id VARCHAR(80),
        display_type VARCHAR(40),
        url_path VARCHAR(200),
        ip_address VARCHAR(60),
        organization_id INTEGER,
        last_seen TIMESTAMPTZ,
        active BOOLEAN DEFAULT TRUE,
        config JSONB DEFAULT '{}',
        registered_at TIMESTAMPTZ DEFAULT NOW()
      );
    
ALTER TABLE display_devices ADD COLUMN IF NOT EXISTS organization_id INTEGER;

      CREATE TABLE IF NOT EXISTS emergency_broadcasts (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        severity VARCHAR(30) DEFAULT 'critical',
        zone_id VARCHAR(80),
        organization_id INTEGER,
        pushed_by VARCHAR(200),
        dismissed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    
ALTER TABLE emergency_broadcasts ADD COLUMN IF NOT EXISTS organization_id INTEGER;

      CREATE TABLE IF NOT EXISTS checkin_tokens (
        id SERIAL PRIMARY KEY,
        token_number VARCHAR(20) NOT NULL,
        patient_name VARCHAR(200),
        appointment_id VARCHAR(100),
        doctor_name VARCHAR(200),
        counter VARCHAR(50),
        zone_id VARCHAR(80),
        status VARCHAR(30) DEFAULT 'waiting',
        issued_at TIMESTAMPTZ DEFAULT NOW(),
        called_at TIMESTAMPTZ
      );
  `);
}

export async function down() {
  await pool.query(`
    DROP TABLE IF EXISTS checkin_tokens CASCADE;
    DROP TABLE IF EXISTS emergency_broadcasts CASCADE;
    DROP TABLE IF EXISTS display_devices CASCADE;
    DROP TABLE IF EXISTS display_zones CASCADE;
  `);
}
