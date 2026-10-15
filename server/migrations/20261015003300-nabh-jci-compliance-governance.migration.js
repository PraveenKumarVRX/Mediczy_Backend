import pool from '../db/pgPool.js';

/** Migration-owned NABH/JCI compliance catalogue, evidence and incident schema. */
export async function up() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS compliance_standards (
      id           SERIAL PRIMARY KEY,
      framework    VARCHAR(20) NOT NULL,
      version      VARCHAR(20),
      chapter_code VARCHAR(10) NOT NULL,
      chapter_name TEXT NOT NULL,
      description  TEXT,
      UNIQUE(framework, chapter_code)
    );
    CREATE TABLE IF NOT EXISTS compliance_checkpoints (
      id                 SERIAL PRIMARY KEY,
      standard_id        INTEGER REFERENCES compliance_standards(id),
      checkpoint_code    VARCHAR(30) UNIQUE NOT NULL,
      description        TEXT NOT NULL,
      measurable_element TEXT,
      criticality        VARCHAR(10) DEFAULT 'standard',
      auto_collectable   BOOLEAN DEFAULT FALSE,
      auto_query         TEXT
    );
    CREATE TABLE IF NOT EXISTS compliance_evidence (
      id             BIGSERIAL PRIMARY KEY,
      tenant_id      INTEGER NOT NULL,
      checkpoint_id  INTEGER REFERENCES compliance_checkpoints(id),
      status         VARCHAR(20) DEFAULT 'not_assessed',
      evidence_text  TEXT,
      evidence_url   TEXT,
      assessed_by    INTEGER,
      assessed_at    TIMESTAMPTZ,
      score          INTEGER DEFAULT 0,
      notes          TEXT,
      created_at     TIMESTAMPTZ DEFAULT NOW(),
      updated_at     TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tenant_id, checkpoint_id)
    );
    CREATE TABLE IF NOT EXISTS compliance_incidents (
      id                BIGSERIAL PRIMARY KEY,
      tenant_id         INTEGER NOT NULL,
      framework         VARCHAR(20) DEFAULT 'NABH',
      incident_type     VARCHAR(50),
      severity          VARCHAR(20),
      description       TEXT,
      patient_id        INTEGER,
      occurred_at       TIMESTAMPTZ,
      reported_by       INTEGER,
      root_cause        TEXT,
      corrective_action TEXT,
      status            VARCHAR(20) DEFAULT 'open',
      closed_at         TIMESTAMPTZ,
      created_at        TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_evidence_tenant_cp ON compliance_evidence(tenant_id, checkpoint_id);
    CREATE INDEX IF NOT EXISTS idx_incidents_tenant ON compliance_incidents(tenant_id, created_at DESC);
  `);
  console.log('[migration] NABH/JCI compliance governance schema ready');
}

export async function down() {
  await pool.query(`
    DROP TABLE IF EXISTS compliance_incidents CASCADE;
    DROP TABLE IF EXISTS compliance_evidence CASCADE;
    DROP TABLE IF EXISTS compliance_checkpoints CASCADE;
    DROP TABLE IF EXISTS compliance_standards CASCADE;
  `);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  up().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
}

export default { up, down };
