/**
 * CareOS Ecosystem — federation, identity, passport, graph tables
 */
import pool from '../db/pgPool.js';

export async function up() {
  await pool.query(`
    -- Participating organizations in the CareOS network
    CREATE TABLE IF NOT EXISTS careos_network_orgs (
      id BIGSERIAL PRIMARY KEY,
      organization_id BIGINT,
      display_name VARCHAR(255) NOT NULL,
      country_code CHAR(2),
      org_type VARCHAR(40) DEFAULT 'hospital',
      fhir_endpoint TEXT,
      status VARCHAR(30) DEFAULT 'active',
      capabilities TEXT[] DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Trust agreements between organizations (federation)
    CREATE TABLE IF NOT EXISTS careos_federation_trust (
      id BIGSERIAL PRIMARY KEY,
      org_a_id BIGINT NOT NULL REFERENCES careos_network_orgs(id),
      org_b_id BIGINT NOT NULL REFERENCES careos_network_orgs(id),
      trust_level VARCHAR(30) DEFAULT 'referral',
      purposes TEXT[] DEFAULT '{second_opinion,referral}',
      status VARCHAR(30) DEFAULT 'pending',
      approved_by BIGINT,
      approved_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (org_a_id, org_b_id)
    );

    CREATE TABLE IF NOT EXISTS careos_federation_audit_log (
      id BIGSERIAL PRIMARY KEY,
      session_id BIGINT,
      actor_user_id BIGINT,
      actor_org_id BIGINT,
      action VARCHAR(80) NOT NULL,
      resource_type VARCHAR(60),
      resource_id VARCHAR(120),
      patient_id BIGINT,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Global professional identity (multi-affiliation)
    CREATE TABLE IF NOT EXISTS careos_professional_identity (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      careos_professional_id VARCHAR(64) UNIQUE NOT NULL,
      display_name VARCHAR(255),
      primary_specialty VARCHAR(80),
      license_number VARCHAR(80),
      license_country CHAR(2),
      verification_status VARCHAR(30) DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS careos_professional_affiliations (
      id BIGSERIAL PRIMARY KEY,
      professional_id BIGINT NOT NULL REFERENCES careos_professional_identity(id) ON DELETE CASCADE,
      organization_id BIGINT NOT NULL,
      org_network_id BIGINT REFERENCES careos_network_orgs(id),
      role VARCHAR(60) NOT NULL,
      department VARCHAR(80),
      status VARCHAR(30) DEFAULT 'active',
      started_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (professional_id, organization_id, role)
    );

    -- Patient Medical Passport (portable profile)
    CREATE TABLE IF NOT EXISTS careos_patient_passports (
      id BIGSERIAL PRIMARY KEY,
      patient_id BIGINT NOT NULL,
      careos_patient_id VARCHAR(64) UNIQUE NOT NULL,
      organization_id BIGINT,
      allergies JSONB DEFAULT '[]'::jsonb,
      diagnoses JSONB DEFAULT '[]'::jsonb,
      medications JSONB DEFAULT '[]'::jsonb,
      surgeries JSONB DEFAULT '[]'::jsonb,
      vaccinations JSONB DEFAULT '[]'::jsonb,
      imaging_summaries JSONB DEFAULT '[]'::jsonb,
      lab_summaries JSONB DEFAULT '[]'::jsonb,
      emergency_contacts JSONB DEFAULT '[]'::jsonb,
      summary_text TEXT,
      last_synced_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Consent-based passport sharing
    CREATE TABLE IF NOT EXISTS careos_passport_shares (
      id BIGSERIAL PRIMARY KEY,
      passport_id BIGINT NOT NULL REFERENCES careos_patient_passports(id) ON DELETE CASCADE,
      shared_with_org_id BIGINT REFERENCES careos_network_orgs(id),
      shared_with_user_id BIGINT,
      purpose VARCHAR(80) NOT NULL,
      share_token VARCHAR(128) UNIQUE,
      scopes TEXT[] DEFAULT '{summary}',
      granted_by BIGINT,
      expires_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Care Graph nodes and edges
    CREATE TABLE IF NOT EXISTS careos_graph_nodes (
      id BIGSERIAL PRIMARY KEY,
      node_type VARCHAR(40) NOT NULL,
      external_id VARCHAR(120) NOT NULL,
      organization_id BIGINT,
      label VARCHAR(255),
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (node_type, external_id, organization_id)
    );

    CREATE TABLE IF NOT EXISTS careos_graph_edges (
      id BIGSERIAL PRIMARY KEY,
      from_node_id BIGINT NOT NULL REFERENCES careos_graph_nodes(id) ON DELETE CASCADE,
      to_node_id BIGINT NOT NULL REFERENCES careos_graph_nodes(id) ON DELETE CASCADE,
      relationship VARCHAR(60) NOT NULL,
      weight NUMERIC(5,2) DEFAULT 1,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (from_node_id, to_node_id, relationship)
    );
    CREATE INDEX IF NOT EXISTS idx_careos_graph_edges_from ON careos_graph_edges(from_node_id);
    CREATE INDEX IF NOT EXISTS idx_careos_graph_edges_to ON careos_graph_edges(to_node_id);

    -- Cross-border / multi-org clinical sessions
    CREATE TABLE IF NOT EXISTS careos_global_sessions (
      id BIGSERIAL PRIMARY KEY,
      organization_id BIGINT NOT NULL,
      patient_id BIGINT NOT NULL,
      passport_id BIGINT REFERENCES careos_patient_passports(id),
      title VARCHAR(255) NOT NULL,
      session_type VARCHAR(40) DEFAULT 'global_mdt',
      status VARCHAR(30) DEFAULT 'active',
      host_user_id BIGINT,
      livekit_room VARCHAR(120),
      invited_orgs BIGINT[] DEFAULT '{}',
      languages JSONB DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      closed_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS careos_global_session_participants (
      id BIGSERIAL PRIMARY KEY,
      session_id BIGINT NOT NULL REFERENCES careos_global_sessions(id) ON DELETE CASCADE,
      org_network_id BIGINT REFERENCES careos_network_orgs(id),
      user_id BIGINT,
      role VARCHAR(60),
      display_name VARCHAR(120),
      language_preference VARCHAR(10) DEFAULT 'en',
      status VARCHAR(30) DEFAULT 'invited',
      joined_at TIMESTAMPTZ
    );
  `);
  console.log('✓ CareOS Ecosystem tables ready');
}

export async function down() {
  await pool.query(`
    DROP TABLE IF EXISTS careos_global_session_participants;
    DROP TABLE IF EXISTS careos_global_sessions;
    DROP TABLE IF EXISTS careos_graph_edges;
    DROP TABLE IF EXISTS careos_graph_nodes;
    DROP TABLE IF EXISTS careos_passport_shares;
    DROP TABLE IF EXISTS careos_patient_passports;
    DROP TABLE IF EXISTS careos_professional_affiliations;
    DROP TABLE IF EXISTS careos_professional_identity;
    DROP TABLE IF EXISTS careos_federation_audit_log;
    DROP TABLE IF EXISTS careos_federation_trust;
    DROP TABLE IF EXISTS careos_network_orgs;
  `);
}
