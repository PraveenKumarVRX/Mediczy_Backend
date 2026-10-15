import pool from '../db/pgPool.js';

/** Migration-owned CRM AI, RFQ analysis/underwriting and email storage schema. */
export async function up() {
  await pool.query(`
CREATE TABLE IF NOT EXISTS crm_ai_email_communications (
      id                 BIGSERIAL PRIMARY KEY,
      entity_type        VARCHAR(40),
      entity_id          BIGINT,
      lead_id            BIGINT,
      deal_id            BIGINT,
      contact_email      VARCHAR(255),
      subject            TEXT,
      body               TEXT,
      intent             VARCHAR(100),
      tone               VARCHAR(80),
      status             VARCHAR(40) DEFAULT 'draft',
      event_type         VARCHAR(40),
      sentiment          VARCHAR(40),
      engagement_score   INTEGER DEFAULT 0,
      conversion_signal  VARCHAR(40),
      urgency            VARCHAR(40),
      next_action        JSONB DEFAULT '{}'::jsonb,
      suggested_stage    VARCHAR(100),
      revenue_impact     NUMERIC(15,2) DEFAULT 0,
      ai_payload         JSONB DEFAULT '{}'::jsonb,
      learning_tags      JSONB DEFAULT '[]'::jsonb,
      created_by         INTEGER,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_ai_email_entity ON crm_ai_email_communications(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_ai_email_lead ON crm_ai_email_communications(lead_id);
    CREATE INDEX IF NOT EXISTS idx_ai_email_deal ON crm_ai_email_communications(deal_id);
    CREATE INDEX IF NOT EXISTS idx_ai_email_status ON crm_ai_email_communications(status);
    CREATE INDEX IF NOT EXISTS idx_ai_email_created ON crm_ai_email_communications(created_at DESC);

-- Year-wise historical policy records (retrospective data)
    CREATE TABLE IF NOT EXISTS crm_rfq_policy_history (
      id                      BIGSERIAL    PRIMARY KEY,
      rfq_id                  BIGINT       NOT NULL REFERENCES crm_rfqs(id) ON DELETE CASCADE,
      year_label              VARCHAR(10)  NOT NULL,        -- 'Y-1', 'Y-2', 'Y-3'
      policy_year_start       DATE,
      policy_year_end         DATE,
      insurer_name            VARCHAR(255),
      tpa_name                VARCHAR(255),
      -- Premium data
      gross_premium           NUMERIC(15,2) DEFAULT 0,
      net_premium             NUMERIC(15,2) DEFAULT 0,
      -- Claims data
      total_claims_incurred   NUMERIC(15,2) DEFAULT 0,
      total_claims_count      INTEGER       DEFAULT 0,
      cat_claims_count        INTEGER       DEFAULT 0,      -- claims > 2L
      cat_claims_amount       NUMERIC(15,2) DEFAULT 0,
      avg_claim_size          NUMERIC(12,2),
      claim_frequency_pct     NUMERIC(6,3),                 -- claims per 100 lives
      -- Risk indicators
      loss_ratio              NUMERIC(6,3),                 -- claims/premium
      copay_collected         NUMERIC(12,2) DEFAULT 0,
      ibnr_reserve            NUMERIC(12,2) DEFAULT 0,
      -- Member counts
      lives_count             INTEGER       DEFAULT 0,
      employee_count          INTEGER       DEFAULT 0,
      -- Top diagnoses / notes
      top_diagnoses           JSONB         DEFAULT '[]'::jsonb,
      notes                   TEXT,
      created_by              INTEGER,
      updated_by              INTEGER,
      created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
      UNIQUE(rfq_id, year_label)
    );
    CREATE INDEX IF NOT EXISTS idx_policy_hist_rfq  ON crm_rfq_policy_history(rfq_id);

    -- Cached analysis results (re-generated on demand)
    CREATE TABLE IF NOT EXISTS crm_rfq_analysis_cache (
      id                      BIGSERIAL    PRIMARY KEY,
      rfq_id                  BIGINT       NOT NULL REFERENCES crm_rfqs(id) ON DELETE CASCADE,
      version                 INTEGER      NOT NULL DEFAULT 1,
      -- Risk scoring
      risk_score              NUMERIC(5,2),   -- 0–100 (100 = highest risk)
      risk_tier               VARCHAR(20),    -- 'green','amber','red','black'
      renewal_probability     NUMERIC(4,3),   -- 0–1
      -- Retrospective summary
      avg_loss_ratio          NUMERIC(6,3),
      trend_factor            NUMERIC(6,4),
      claim_frequency_trend   VARCHAR(20),    -- 'improving','stable','deteriorating'
      top_diagnoses           JSONB DEFAULT '[]'::jsonb,
      -- Cost model outputs
      pure_premium_per_life   NUMERIC(12,2),
      loaded_premium_per_life NUMERIC(12,2),
      gross_premium_per_life  NUMERIC(12,2),  -- incl. GST
      total_projected_premium NUMERIC(15,2),
      projected_loss_ratio    NUMERIC(6,3),
      -- Quote strategies (array of 3)
      quote_strategies        JSONB DEFAULT '[]'::jsonb,
      -- AI narrative
      ai_narrative            TEXT,
      ai_executive_summary    TEXT,
      -- Meta
      inputs_snapshot         JSONB DEFAULT '{}'::jsonb,
      generated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      generated_by            INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_analysis_rfq ON crm_rfq_analysis_cache(rfq_id);

CREATE TABLE IF NOT EXISTS crm_insurance_products (
      id            BIGSERIAL PRIMARY KEY,
      code          VARCHAR(30)  NOT NULL UNIQUE,
      name          VARCHAR(200) NOT NULL,
      category      VARCHAR(50)  NOT NULL,
      description   TEXT,
      irdai_ref     VARCHAR(100),
      is_active     BOOLEAN NOT NULL DEFAULT true,
      sort_order    INTEGER DEFAULT 0,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_ins_products_code ON crm_insurance_products(code);

    CREATE TABLE IF NOT EXISTS crm_product_coverage_matrix (
      id                BIGSERIAL PRIMARY KEY,
      product_id        BIGINT NOT NULL REFERENCES crm_insurance_products(id) ON DELETE CASCADE,
      coverage_head     VARCHAR(200) NOT NULL,
      category          VARCHAR(50)  NOT NULL DEFAULT 'hospitalization',
      status            VARCHAR(20)  NOT NULL DEFAULT 'included',
      description       TEXT,
      limit_type        VARCHAR(50),
      limit_value       VARCHAR(200),
      waiting_period    VARCHAR(100),
      sub_limit_notes   TEXT,
      regulatory_ref    VARCHAR(200),
      is_optional       BOOLEAN NOT NULL DEFAULT false,
      is_standard_excl  BOOLEAN NOT NULL DEFAULT false,
      sort_order        INTEGER DEFAULT 0,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_coverage_matrix_product ON crm_product_coverage_matrix(product_id);
    CREATE INDEX IF NOT EXISTS idx_coverage_matrix_status ON crm_product_coverage_matrix(status);

    CREATE TABLE IF NOT EXISTS crm_rfq_underwriting (
      id                  BIGSERIAL PRIMARY KEY,
      rfq_id              BIGINT NOT NULL REFERENCES crm_rfqs(id) ON DELETE CASCADE,
      product_id          BIGINT REFERENCES crm_insurance_products(id),
      product_code        VARCHAR(30),
      uw_status           VARCHAR(50) NOT NULL DEFAULT 'pending',
      risk_score          INTEGER DEFAULT 50,
      loading_pct         NUMERIC(5,2) DEFAULT 0,
      decision            VARCHAR(100),
      ai_narrative        TEXT,
      slip_parsed         JSONB DEFAULT '{}'::jsonb,
      requested_coverages JSONB DEFAULT '[]'::jsonb,
      coverage_gap        JSONB DEFAULT '[]'::jsonb,
      conditions          JSONB DEFAULT '[]'::jsonb,
      exclusions_applied  JSONB DEFAULT '[]'::jsonb,
      risk_flags          JSONB DEFAULT '[]'::jsonb,
      created_by          INTEGER,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_rfq_uw_rfq ON crm_rfq_underwriting(rfq_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_rfq_uw_rfq_product ON crm_rfq_underwriting(rfq_id, product_code);
  

    ALTER TABLE crm_rfq_files ADD COLUMN IF NOT EXISTS extracted_text TEXT;

CREATE TABLE IF NOT EXISTS crm_email_settings (
        id            BIGSERIAL PRIMARY KEY,
        crm_user_id   INTEGER NOT NULL,
        display_name  VARCHAR(255),
        email         VARCHAR(255) NOT NULL,
        provider      VARCHAR(50) DEFAULT 'custom',
        smtp_host     VARCHAR(255),
        smtp_port     INTEGER DEFAULT 587,
        smtp_secure   BOOLEAN DEFAULT false,
        smtp_username VARCHAR(255),
        smtp_password TEXT,
        imap_host     VARCHAR(255),
        imap_port     INTEGER DEFAULT 993,
        imap_secure   BOOLEAN DEFAULT true,
        imap_username VARCHAR(255),
        imap_password TEXT,
        is_default    BOOLEAN DEFAULT false,
        is_active     BOOLEAN DEFAULT true,
        last_synced_at TIMESTAMPTZ,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_crm_email_settings_user ON crm_email_settings(crm_user_id);

      CREATE TABLE IF NOT EXISTS crm_email_inbox (
        id            BIGSERIAL PRIMARY KEY,
        crm_user_id   INTEGER NOT NULL,
        settings_id   BIGINT REFERENCES crm_email_settings(id) ON DELETE SET NULL,
        message_id    TEXT,
        folder        VARCHAR(50) DEFAULT 'inbox',
        from_addr     TEXT NOT NULL DEFAULT '',
        from_name     TEXT DEFAULT '',
        to_addrs      TEXT[] DEFAULT '{}',
        cc_addrs      TEXT[] DEFAULT '{}',
        subject       TEXT DEFAULT '',
        body_text     TEXT,
        body_html     TEXT,
        is_read       BOOLEAN DEFAULT false,
        is_starred    BOOLEAN DEFAULT false,
        received_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(crm_user_id, message_id)
      );
      CREATE INDEX IF NOT EXISTS idx_crm_email_inbox_user ON crm_email_inbox(crm_user_id, received_at DESC);
      CREATE INDEX IF NOT EXISTS idx_crm_email_inbox_folder ON crm_email_inbox(crm_user_id, folder);

      CREATE TABLE IF NOT EXISTS crm_email_templates (
        id            BIGSERIAL PRIMARY KEY,
        crm_user_id   INTEGER NOT NULL,
        name          VARCHAR(255) NOT NULL,
        subject       TEXT,
        body          TEXT,
        category      VARCHAR(100) DEFAULT 'general',
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_crm_email_templates_user ON crm_email_templates(crm_user_id);
  `);
}

export async function down() {
  await pool.query(`
    DROP TABLE IF EXISTS crm_email_templates CASCADE;
    DROP TABLE IF EXISTS crm_email_inbox CASCADE;
    DROP TABLE IF EXISTS crm_email_settings CASCADE;
    DROP TABLE IF EXISTS crm_rfq_underwriting CASCADE;
    DROP TABLE IF EXISTS crm_product_coverage_matrix CASCADE;
    DROP TABLE IF EXISTS crm_insurance_products CASCADE;
    DROP TABLE IF EXISTS crm_rfq_analysis_cache CASCADE;
    DROP TABLE IF EXISTS crm_rfq_policy_history CASCADE;
    DROP TABLE IF EXISTS crm_ai_email_communications CASCADE;
  `);
}
