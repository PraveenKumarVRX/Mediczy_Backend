/**
 * RCM Phase 3 — PM-JAY / state-scheme depth: package master + scheme pre-auth (TMS).
 *
 * Today PM-JAY/Ayushman support is NHA-portal scraping only (ayushman.route.js,
 * puppeteer) — there is no procedure package catalogue and no scheme pre-auth
 * lifecycle. This adds:
 *
 *   scheme_packages  — national/state procedure package catalogue (HBP-style):
 *                      scheme + package_code + revision are the natural key. This is
 *                      REFERENCE data (not hospital-scoped); real masters are loaded
 *                      via the bulk-import endpoint — no rates are seeded here, to
 *                      avoid shipping fabricated clinical/financial figures.
 *   scheme_preauths  — hospital-scoped scheme pre-authorisation with a TMS-style
 *                      blocking lifecycle (initiated → submitted → query → approved
 *                      → bed_blocked → claimed → closed), referencing a package.
 *
 * Both are operational/reference tables (no unique_id, bare hospital_id), matching
 * the sibling RCM tables — the entity-UID verify stays green.
 *
 * Manual-run:
 *   node server/scripts/ssm-env-loader.mjs server/scripts/run-one-migration.mjs \
 *     migrations/20261107000300-scheme-package-master.migration.js
 */
import sharedPool from '../db/pgPool.js';

export async function up(pool = sharedPool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS scheme_packages (
      id               BIGSERIAL PRIMARY KEY,
      scheme           VARCHAR(40)  NOT NULL,          -- PMJAY | CGHS | ECHS | ESIC | <state scheme code>
      state_code       VARCHAR(10),                    -- for state schemes (e.g. MH, TN); NULL = national
      package_code     VARCHAR(40)  NOT NULL,
      package_name     VARCHAR(300) NOT NULL,
      specialty        VARCHAR(120),
      procedure_name   VARCHAR(300),
      package_rate     NUMERIC(12,2) NOT NULL DEFAULT 0,
      stratification   VARCHAR(40),                    -- tier/strata label where applicable
      implant_allowed  BOOLEAN NOT NULL DEFAULT FALSE,
      pre_auth_required BOOLEAN NOT NULL DEFAULT TRUE,
      max_los_days     INTEGER,
      revision         VARCHAR(40) NOT NULL DEFAULT 'HBP',  -- master revision (e.g. HBP-2.2)
      active           BOOLEAN NOT NULL DEFAULT TRUE,
      source           VARCHAR(80),                    -- where the row was imported from
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_scheme_package
      ON scheme_packages(scheme, COALESCE(state_code,''), package_code, revision);
    CREATE INDEX IF NOT EXISTS idx_scheme_package_search
      ON scheme_packages(scheme, active) ;

    CREATE TABLE IF NOT EXISTS scheme_preauths (
      id               BIGSERIAL PRIMARY KEY,
      hospital_id      INTEGER NOT NULL,
      patient_id       INTEGER,
      scheme           VARCHAR(40) NOT NULL,
      beneficiary_id   VARCHAR(80),                    -- PMJAY card / scheme beneficiary id
      package_id       BIGINT REFERENCES scheme_packages(id) ON DELETE SET NULL,
      package_code     VARCHAR(40),
      package_name     VARCHAR(300),                   -- frozen snapshot
      package_rate     NUMERIC(12,2) NOT NULL DEFAULT 0,  -- frozen snapshot
      status           VARCHAR(20) NOT NULL DEFAULT 'initiated',
      tms_reference    VARCHAR(80),                    -- NHA/TMS case id
      admission_date   DATE,
      los_days         INTEGER,
      query_note       TEXT,
      approved_amount  NUMERIC(12,2),
      approved_at      TIMESTAMPTZ,
      blocked_at       TIMESTAMPTZ,                    -- bed-blocked under TMS
      claim_id         INTEGER,                        -- links to insurance_claims once claimed
      created_by_user_id INTEGER,
      history          JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_scheme_preauth_queue
      ON scheme_preauths(hospital_id, status, created_at DESC);
  `);
  return { ok: true };
}

export default { up };
