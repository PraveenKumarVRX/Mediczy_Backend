import pg from 'pg';

const { Client } = pg;

const statements = [
  `CREATE TABLE IF NOT EXISTS lab_portal_state (
    id BIGSERIAL PRIMARY KEY,
    lab_id INTEGER NOT NULL,
    state_key VARCHAR(120) NOT NULL,
    state_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (lab_id, state_key)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_lab_portal_state_lab ON lab_portal_state(lab_id)`,
  `CREATE TABLE IF NOT EXISTS team_plan_customization_approvals (
    id SERIAL PRIMARY KEY,
    target_user_id INTEGER NOT NULL,
    corporate_id INTEGER NOT NULL,
    master_plan_id INTEGER NOT NULL,
    customized_plan_id INTEGER NOT NULL,
    requested_by_team_user_id INTEGER NOT NULL,
    requested_price NUMERIC(12,2) NOT NULL DEFAULT 0,
    apply_to_user BOOLEAN NOT NULL DEFAULT TRUE,
    request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decided_at TIMESTAMPTZ,
    decided_by_team_user_id INTEGER,
    decision_notes TEXT,
    assigned_user_plan_id INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tpca_status_requested_at ON team_plan_customization_approvals(status, requested_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_tpca_target_user ON team_plan_customization_approvals(target_user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tpca_corporate ON team_plan_customization_approvals(corporate_id)`,
  `CREATE TABLE IF NOT EXISTS corporate_network_assignments (
    id SERIAL PRIMARY KEY,
    corporate_id INTEGER NOT NULL,
    partner_id INTEGER NOT NULL,
    partner_type VARCHAR(20) NOT NULL,
    employee_ids JSONB DEFAULT '"all"',
    assigned_by INTEGER,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (corporate_id, partner_id, partner_type)
  )`,
  `CREATE TABLE IF NOT EXISTS corporate_welcome_email_deliveries (
    id BIGSERIAL PRIMARY KEY,
    corporate_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL DEFAULT 0,
    employee_id VARCHAR(100),
    recipient_email VARCHAR(320) NOT NULL,
    subject TEXT,
    idempotency_key VARCHAR(160) NOT NULL,
    request_scope VARCHAR(40) NOT NULL DEFAULT 'batch_send',
    status VARCHAR(24) NOT NULL DEFAULT 'prepared',
    attempts INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_corp_welcome_delivery_idempotency ON corporate_welcome_email_deliveries (corporate_id, user_id, recipient_email, idempotency_key, request_scope)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_corp_welcome_active_recipient ON corporate_welcome_email_deliveries (corporate_id, LOWER(recipient_email)) WHERE status IN ('queued', 'sent')`,
  `CREATE INDEX IF NOT EXISTS idx_corp_welcome_delivery_status ON corporate_welcome_email_deliveries (corporate_id, status, updated_at DESC)`,
  `CREATE TABLE IF NOT EXISTS corporate_wellness_events (
    id BIGSERIAL PRIMARY KEY,
    corporate_id INTEGER NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    event_type VARCHAR(80) NOT NULL DEFAULT 'Wellness Session',
    event_date DATE NOT NULL,
    event_time TIME,
    end_date DATE,
    end_time TIME,
    location VARCHAR(255),
    organizer VARCHAR(255),
    max_participants INTEGER,
    registered_count INTEGER DEFAULT 0,
    status VARCHAR(30) DEFAULT 'upcoming',
    color VARCHAR(20) DEFAULT 'teal',
    notify_employees BOOLEAN DEFAULT FALSE,
    invites_sent BOOLEAN DEFAULT FALSE,
    invites_sent_at TIMESTAMPTZ,
    participant_selection VARCHAR(50),
    total_invited INTEGER DEFAULT 0,
    created_by INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_cwe_corporate ON corporate_wellness_events(corporate_id)`,
  `CREATE INDEX IF NOT EXISTS idx_cwe_event_date ON corporate_wellness_events(event_date)`,
];

export async function up() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try { await client.query('BEGIN'); for (const statement of statements) await client.query(statement); await client.query('COMMIT'); }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { await client.end(); }
}

export async function down() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('DROP TABLE IF EXISTS corporate_wellness_events, corporate_welcome_email_deliveries, corporate_network_assignments, team_plan_customization_approvals, lab_portal_state CASCADE');
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { await client.end(); }
}

if (process.argv[1] && process.argv[1].endsWith('20261015004900-admin-portal-governance.migration.js')) {
  up().then(() => console.log('admin-portal-governance migration applied')).catch((error) => { console.error(error); process.exitCode = 1; });
}
