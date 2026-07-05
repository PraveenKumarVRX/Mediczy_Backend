/**
 * CareOS Phase 1 — patient-centric collaboration tables
 */
import pool from '../db/pgPool.js';

export async function up() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS careos_care_teams (
      id BIGSERIAL PRIMARY KEY,
      organization_id BIGINT NOT NULL,
      patient_id BIGINT NOT NULL,
      admission_id BIGINT,
      name VARCHAR(120) DEFAULT 'Care Team',
      status VARCHAR(30) DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (organization_id, patient_id, admission_id)
    );

    CREATE TABLE IF NOT EXISTS careos_team_members (
      id BIGSERIAL PRIMARY KEY,
      team_id BIGINT NOT NULL REFERENCES careos_care_teams(id) ON DELETE CASCADE,
      user_id BIGINT,
      role VARCHAR(60) NOT NULL,
      specialty VARCHAR(80),
      display_name VARCHAR(120),
      status VARCHAR(30) DEFAULT 'active',
      invited_by VARCHAR(30) DEFAULT 'manual',
      joined_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (team_id, role, user_id)
    );

    CREATE TABLE IF NOT EXISTS careos_clinical_events (
      id BIGSERIAL PRIMARY KEY,
      organization_id BIGINT,
      patient_id BIGINT NOT NULL,
      admission_id BIGINT,
      event_type VARCHAR(40) NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      actor_type VARCHAR(30),
      actor_id BIGINT,
      actor_name VARCHAR(120),
      severity VARCHAR(20) DEFAULT 'info',
      metadata JSONB DEFAULT '{}'::jsonb,
      event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_careos_events_patient ON careos_clinical_events(patient_id, event_at DESC);
    CREATE INDEX IF NOT EXISTS idx_careos_events_type ON careos_clinical_events(event_type);

    CREATE TABLE IF NOT EXISTS careos_tasks (
      id BIGSERIAL PRIMARY KEY,
      organization_id BIGINT,
      patient_id BIGINT NOT NULL,
      team_id BIGINT REFERENCES careos_care_teams(id),
      title VARCHAR(255) NOT NULL,
      owner_role VARCHAR(60),
      owner_user_id BIGINT,
      status VARCHAR(30) DEFAULT 'pending',
      priority VARCHAR(20) DEFAULT 'normal',
      due_at TIMESTAMPTZ,
      source_event_id BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS careos_treatment_pathways (
      id BIGSERIAL PRIMARY KEY,
      organization_id BIGINT,
      patient_id BIGINT NOT NULL,
      admission_id BIGINT,
      current_goal VARCHAR(255),
      current_progress INTEGER DEFAULT 0,
      steps JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (patient_id, admission_id)
    );

    CREATE TABLE IF NOT EXISTS careos_mdt_sessions (
      id BIGSERIAL PRIMARY KEY,
      organization_id BIGINT,
      patient_id BIGINT NOT NULL,
      title VARCHAR(255) NOT NULL,
      status VARCHAR(30) DEFAULT 'active',
      started_by BIGINT,
      livekit_room VARCHAR(120),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      closed_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS careos_mdt_opinions (
      id BIGSERIAL PRIMARY KEY,
      session_id BIGINT NOT NULL REFERENCES careos_mdt_sessions(id) ON DELETE CASCADE,
      specialist_role VARCHAR(80) NOT NULL,
      specialist_name VARCHAR(120),
      opinion TEXT NOT NULL,
      recommendation VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS careos_coordinator_alerts (
      id BIGSERIAL PRIMARY KEY,
      organization_id BIGINT,
      patient_id BIGINT NOT NULL,
      alert_type VARCHAR(60) NOT NULL,
      message TEXT NOT NULL,
      evidence JSONB DEFAULT '{}'::jsonb,
      severity VARCHAR(20) DEFAULT 'warning',
      status VARCHAR(30) DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      acknowledged_at TIMESTAMPTZ,
      acknowledged_by BIGINT
    );

    CREATE TABLE IF NOT EXISTS careos_hospital_cases (
      id BIGSERIAL PRIMARY KEY,
      organization_id BIGINT,
      patient_id BIGINT,
      case_number VARCHAR(40) UNIQUE,
      presentation_summary TEXT,
      final_diagnosis TEXT,
      lessons_learned TEXT,
      keywords TEXT[],
      closed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS careos_family_updates (
      id BIGSERIAL PRIMARY KEY,
      organization_id BIGINT,
      patient_id BIGINT NOT NULL,
      title VARCHAR(255) NOT NULL,
      body TEXT NOT NULL,
      stage VARCHAR(60),
      approved_by BIGINT,
      visible_to_family BOOLEAN DEFAULT false,
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  console.log('✓ CareOS Phase 1 tables ready');
}

export async function down() {
  await pool.query(`
    DROP TABLE IF EXISTS careos_family_updates;
    DROP TABLE IF EXISTS careos_hospital_cases;
    DROP TABLE IF EXISTS careos_coordinator_alerts;
    DROP TABLE IF EXISTS careos_mdt_opinions;
    DROP TABLE IF EXISTS careos_mdt_sessions;
    DROP TABLE IF EXISTS careos_treatment_pathways;
    DROP TABLE IF EXISTS careos_tasks;
    DROP TABLE IF EXISTS careos_clinical_events;
    DROP TABLE IF EXISTS careos_team_members;
    DROP TABLE IF EXISTS careos_care_teams;
  `);
}
