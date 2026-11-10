/**
 * Makes MedCore-adoption adherence occurrences explicit, tenant-scoped and
 * claimable. Existing rows remain readable; only newly-created schedules use
 * occurrence_key, so deployment does not invent a recurrence for legacy plans.
 */
import sharedPool from '../db/pgPool.js';

export async function up(pool) {
  await pool.query(`
    ALTER TABLE adherence_events
      ADD COLUMN IF NOT EXISTS occurrence_key TEXT,
      ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS claim_token TEXT,
      ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS last_error TEXT;

    ALTER TABLE adherence_events DROP CONSTRAINT IF EXISTS adherence_events_status_check;
    ALTER TABLE adherence_events
      ADD CONSTRAINT adherence_events_status_check
      CHECK (status IN ('scheduled', 'processing', 'deferred', 'sent', 'failed', 'skipped', 'cancelled'));

    CREATE UNIQUE INDEX IF NOT EXISTS uq_adherence_event_occurrence
      ON adherence_events (tenant_uid, plan_id, occurrence_key)
      WHERE occurrence_key IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_adherence_events_claimable
      ON adherence_events (tenant_uid, status, next_attempt_at, due_at);

    ALTER TABLE lab_explainer_drafts
      ADD COLUMN IF NOT EXISTS delivery_claim_token TEXT,
      ADD COLUMN IF NOT EXISTS delivery_claimed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS delivery_channel TEXT,
      ADD COLUMN IF NOT EXISTS delivery_attempts INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS delivery_error TEXT;
    CREATE INDEX IF NOT EXISTS idx_lab_explainer_delivery_claim
      ON lab_explainer_drafts (tenant_uid, status, delivered_at)
      WHERE delivered_at IS NULL;

    ALTER TABLE metric_integrity_results ADD COLUMN IF NOT EXISTS tenant_uid TEXT NOT NULL DEFAULT 'legacy';
    CREATE INDEX IF NOT EXISTS idx_metric_integrity_results_tenant
      ON metric_integrity_results (tenant_uid, metric_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS security_visitor_passes (
      id TEXT PRIMARY KEY,
      organization_id BIGINT NOT NULL,
      visitor_name TEXT NOT NULL,
      destination TEXT NOT NULL,
      pass_type TEXT NOT NULL DEFAULT 'Visitor',
      status TEXT NOT NULL DEFAULT 'Inside' CHECK (status IN ('Inside', 'Escorted', 'Exited', 'Revoked')),
      escort TEXT,
      check_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      check_out_at TIMESTAMPTZ,
      created_by BIGINT,
      updated_by BIGINT,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_security_visitor_passes_org_updated
      ON security_visitor_passes (organization_id, updated_at DESC);
  `);
}

export async function down(pool) {
  await pool.query(`
    DROP INDEX IF EXISTS uq_adherence_event_occurrence;
    DROP INDEX IF EXISTS idx_adherence_events_claimable;
    DROP INDEX IF EXISTS idx_lab_explainer_delivery_claim;
    DROP INDEX IF EXISTS idx_metric_integrity_results_tenant;
    DROP INDEX IF EXISTS idx_security_visitor_passes_org_updated;
    ALTER TABLE adherence_events DROP CONSTRAINT IF EXISTS adherence_events_status_check;
    ALTER TABLE adherence_events
      ADD CONSTRAINT adherence_events_status_check
      CHECK (status IN ('scheduled', 'sent', 'skipped', 'failed'));
    ALTER TABLE adherence_events
      DROP COLUMN IF EXISTS occurrence_key,
      DROP COLUMN IF EXISTS next_attempt_at,
      DROP COLUMN IF EXISTS claimed_at,
      DROP COLUMN IF EXISTS claim_token,
      DROP COLUMN IF EXISTS attempt_count,
      DROP COLUMN IF EXISTS last_error;
    ALTER TABLE lab_explainer_drafts
      DROP COLUMN IF EXISTS delivery_claim_token,
      DROP COLUMN IF EXISTS delivery_claimed_at,
      DROP COLUMN IF EXISTS delivery_channel,
      DROP COLUMN IF EXISTS delivery_attempts,
      DROP COLUMN IF EXISTS delivery_error;
    ALTER TABLE metric_integrity_results DROP COLUMN IF EXISTS tenant_uid;
    DROP TABLE IF EXISTS security_visitor_passes;
  `);
}

if ((process.argv[1] || '').endsWith('20261108000100-adherence-occurrence-integrity.migration.js') || (process.argv[2] || '').endsWith('20261108000100-adherence-occurrence-integrity.migration.js')) {
  const db = sharedPool.pool || sharedPool;
  db.connect().then(async (client) => { try { await up(client); console.log('adherence occurrence integrity migration applied'); } finally { client.release(); } }).catch((error) => { console.error(error); process.exitCode = 1; });
}
