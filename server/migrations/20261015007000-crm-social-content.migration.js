import sharedPool from '../db/pgPool.js';

export async function up(pool) {
  await pool.query(`
    INSERT INTO entity_kinds (kind, prefix, label, is_org, tenant_type)
    VALUES ('crm_social_post', 'Q', 'CRM social post', false, NULL)
    ON CONFLICT (kind) DO NOTHING;

    CREATE TABLE IF NOT EXISTS crm_social_posts (
      id BIGSERIAL PRIMARY KEY,
      tenant_uid TEXT NOT NULL,
      caption TEXT NOT NULL,
      platforms TEXT[] NOT NULL,
      platform_captions JSONB NOT NULL DEFAULT '{}'::jsonb,
      media_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
      category VARCHAR(80),
      tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      status VARCHAR(24) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft','pending_approval','approved','rejected')),
      planned_at TIMESTAMPTZ,
      submitted_at TIMESTAMPTZ,
      approved_by BIGINT,
      approved_at TIMESTAMPTZ,
      rejection_reason TEXT,
      created_by BIGINT NOT NULL,
      updated_by BIGINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_uid, id)
    );
    CREATE INDEX IF NOT EXISTS idx_crm_social_posts_calendar
      ON crm_social_posts (tenant_uid, planned_at);
    CREATE INDEX IF NOT EXISTS idx_crm_social_posts_status
      ON crm_social_posts (tenant_uid, status, updated_at DESC);

    CREATE TABLE IF NOT EXISTS crm_social_post_comments (
      id BIGSERIAL PRIMARY KEY,
      tenant_uid TEXT NOT NULL,
      post_id BIGINT NOT NULL,
      body TEXT NOT NULL,
      created_by BIGINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      FOREIGN KEY (tenant_uid, post_id) REFERENCES crm_social_posts(tenant_uid, id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_crm_social_post_comments
      ON crm_social_post_comments (tenant_uid, post_id, created_at);

    CREATE TABLE IF NOT EXISTS crm_social_post_events (
      id BIGSERIAL PRIMARY KEY,
      tenant_uid TEXT NOT NULL,
      post_id BIGINT NOT NULL,
      action VARCHAR(40) NOT NULL,
      from_status VARCHAR(24),
      to_status VARCHAR(24),
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      actor_user_id BIGINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      FOREIGN KEY (tenant_uid, post_id) REFERENCES crm_social_posts(tenant_uid, id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_crm_social_post_events
      ON crm_social_post_events (tenant_uid, post_id, created_at);
  `);
  await pool.query("SELECT attach_entity_uid_rule('crm_social_posts', 'crm_social_post', 'unique_id', false)");
}

export async function down(pool) {
  const { rows } = await pool.query('SELECT EXISTS (SELECT 1 FROM crm_social_posts) AS has_posts');
  if (rows[0]?.has_posts) throw new Error('Refusing to remove social-content tables while posts exist.');
  await pool.query(`
    DROP TABLE IF EXISTS crm_social_post_events, crm_social_post_comments, crm_social_posts CASCADE;
  `);
}

if ((process.argv[1] && process.argv[1].endsWith('20261015007000-crm-social-content.migration.js')) || (process.argv[2] && process.argv[2].endsWith('20261015007000-crm-social-content.migration.js'))) {
  const db = sharedPool.pool || sharedPool;
  db.connect().then(async (client) => {
    try { await up(client); console.log('crm social content migration applied'); }
    finally { client.release(); }
  }).catch((error) => { console.error(error); process.exitCode = 1; });
}
