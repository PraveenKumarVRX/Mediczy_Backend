/**
 * Blood Bank schema ownership.
 *
 * The Blood Bank route historically created its tables on the first request.
 * Keep schema creation in the migration chain and apply the shared tenant
 * isolation policy before the route is allowed to serve traffic.
 */
import pool from '../db/pgPool.js';
import { bloodBankScope } from '../services/dept-tenant-scope.service.js';

const SQL = `
CREATE TABLE IF NOT EXISTS blood_bank_units (
  id SERIAL PRIMARY KEY,
  unit_number VARCHAR(80) UNIQUE NOT NULL,
  blood_group VARCHAR(4) NOT NULL,
  component VARCHAR(40) NOT NULL DEFAULT 'whole_blood',
  donor_name VARCHAR(160),
  collected_at DATE NOT NULL,
  expires_at DATE NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'available',
  location VARCHAR(120),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS blood_bank_requisitions (
  id SERIAL PRIMARY KEY,
  requisition_number VARCHAR(80) UNIQUE NOT NULL,
  patient_id VARCHAR(80),
  patient_name VARCHAR(160) NOT NULL,
  ward VARCHAR(120),
  blood_group VARCHAR(4) NOT NULL,
  component VARCHAR(40) NOT NULL DEFAULT 'whole_blood',
  units_requested INTEGER NOT NULL DEFAULT 1,
  urgency VARCHAR(24) NOT NULL DEFAULT 'routine',
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  requested_by VARCHAR(160),
  notes TEXT,
  issued_unit_ids INTEGER[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS blood_bank_donors (
  id SERIAL PRIMARY KEY,
  donor_id VARCHAR(80) UNIQUE NOT NULL,
  name VARCHAR(160) NOT NULL,
  blood_group VARCHAR(4) NOT NULL,
  phone VARCHAR(24),
  whatsapp VARCHAR(24),
  email VARCHAR(160),
  age INTEGER,
  gender VARCHAR(10),
  address TEXT,
  city VARCHAR(100),
  pincode VARCHAR(12),
  donor_type VARCHAR(20) NOT NULL DEFAULT 'voluntary',
  total_donations INTEGER NOT NULL DEFAULT 0,
  last_donation_date DATE,
  next_eligible_date DATE,
  eligible BOOLEAN NOT NULL DEFAULT TRUE,
  health_notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notification_consent BOOLEAN NOT NULL DEFAULT TRUE,
  preferred_channel VARCHAR(20) NOT NULL DEFAULT 'whatsapp',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bb_donors_group ON blood_bank_donors(blood_group);
CREATE INDEX IF NOT EXISTS idx_bb_donors_eligible ON blood_bank_donors(eligible, is_active);
CREATE TABLE IF NOT EXISTS blood_donor_donations (
  id SERIAL PRIMARY KEY,
  donor_id INTEGER NOT NULL REFERENCES blood_bank_donors(id) ON DELETE CASCADE,
  donation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  blood_group VARCHAR(4) NOT NULL,
  component VARCHAR(40) NOT NULL DEFAULT 'whole_blood',
  units_collected NUMERIC(4,2) DEFAULT 1,
  bag_number VARCHAR(80),
  hb_level NUMERIC(5,2),
  blood_pressure VARCHAR(20),
  pulse INTEGER,
  weight NUMERIC(5,1),
  temperature NUMERIC(4,1),
  screening_passed BOOLEAN DEFAULT TRUE,
  adverse_reactions TEXT,
  camp_location VARCHAR(200),
  recorded_by VARCHAR(160),
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bb_donations_donor ON blood_donor_donations(donor_id);
CREATE TABLE IF NOT EXISTS blood_donor_communications (
  id SERIAL PRIMARY KEY,
  blood_group_needed VARCHAR(4),
  component VARCHAR(40),
  units_needed INTEGER DEFAULT 1,
  urgency VARCHAR(20) NOT NULL DEFAULT 'routine',
  message_subject VARCHAR(255),
  message_body TEXT NOT NULL,
  channel VARCHAR(20) NOT NULL DEFAULT 'whatsapp',
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  total_donors INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  responded_count INTEGER DEFAULT 0,
  created_by VARCHAR(160),
  sent_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS blood_donor_comm_recipients (
  id SERIAL PRIMARY KEY,
  comm_id INTEGER NOT NULL REFERENCES blood_donor_communications(id) ON DELETE CASCADE,
  donor_id INTEGER NOT NULL REFERENCES blood_bank_donors(id) ON DELETE CASCADE,
  phone VARCHAR(24),
  status VARCHAR(20) DEFAULT 'pending',
  response TEXT,
  responded_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bb_comm_recipients_comm ON blood_donor_comm_recipients(comm_id);
CREATE TABLE IF NOT EXISTS blood_bank_audit_events (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(80) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id VARCHAR(80),
  actor VARCHAR(160),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bb_audit_created ON blood_bank_audit_events(created_at DESC);
`;

export async function up() {
  await pool.query(SQL);
  await bloodBankScope.apply(pool, (message) => console.log('[Blood Bank tenant]', message));
}

export async function down() {
  await pool.query(`DROP TABLE IF EXISTS blood_donor_comm_recipients, blood_donor_communications,
    blood_donor_donations, blood_bank_audit_events, blood_bank_requisitions,
    blood_bank_units, blood_bank_donors CASCADE`);
}

if (process.argv[1] && process.argv[1].includes('20261015000300-blood-bank-schema-hardening')) {
  up().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
}
