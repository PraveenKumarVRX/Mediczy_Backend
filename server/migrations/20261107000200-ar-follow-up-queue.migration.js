/**
 * RCM / AR depth — Phase 2: AR follow-up / collections work-queue.
 *
 * A first-class worklist for AR executives, distinct from the denial work-queue
 * (claim_denial_work_items). Items are created:
 *   - automatically from short-paid ERA remittances (Phase 1 detection), and
 *   - by the aging-escalation cron for claims sitting in old AR buckets, and
 *   - manually by RCM staff.
 *
 * This is an operational work-item table, not a registered platform entity — it
 * mirrors the sibling claim_denial_work_items / era_remittances pattern (bare
 * hospital_id INTEGER, no unique_id), so the entity-UID verify stays green. The
 * hospital_id integer reference is left to the in-progress UID-reference waves
 * (see docs/architecture/ENTITY_REFERENCE_AUDIT.md), consistent with the rest of
 * the RCM module.
 *
 * Manual-run:
 *   node server/scripts/ssm-env-loader.mjs server/scripts/run-one-migration.mjs \
 *     migrations/20261107000200-ar-follow-up-queue.migration.js
 */
import sharedPool from '../db/pgPool.js';

export async function up(pool = sharedPool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ar_follow_up_items (
      id                 BIGSERIAL PRIMARY KEY,
      hospital_id        INTEGER NOT NULL,
      claim_id           INTEGER,                 -- insurance_claims.id (nullable for standalone AR)
      era_remittance_id  BIGINT,                  -- source short-pay remittance, if any
      payer_name         VARCHAR(200),
      category           VARCHAR(40)  NOT NULL DEFAULT 'ar_followup',  -- ar_followup | short_pay | aging
      aging_bucket       VARCHAR(16),             -- 0-30 | 31-60 | 61-90 | 91-180 | 180+
      outstanding_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
      priority           VARCHAR(10)  NOT NULL DEFAULT 'normal',       -- low | normal | high | urgent
      status             VARCHAR(20)  NOT NULL DEFAULT 'open',         -- open | in_progress | snoozed | resolved | closed
      owner_user_id      INTEGER,
      next_action_at     TIMESTAMPTZ,
      sla_due_at         TIMESTAMPTZ,
      last_contact_at    TIMESTAMPTZ,
      resolution_note    TEXT,
      history            JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_by_user_id INTEGER,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- One auto work-item per short-paid remittance (idempotent re-posting / re-import).
    CREATE UNIQUE INDEX IF NOT EXISTS uq_ar_follow_up_remittance
      ON ar_follow_up_items(era_remittance_id) WHERE era_remittance_id IS NOT NULL;

    -- One open aging work-item per claim (cron re-runs must not duplicate).
    CREATE UNIQUE INDEX IF NOT EXISTS uq_ar_follow_up_open_claim
      ON ar_follow_up_items(claim_id, category)
      WHERE claim_id IS NOT NULL AND status IN ('open','in_progress','snoozed');

    CREATE INDEX IF NOT EXISTS idx_ar_follow_up_queue
      ON ar_follow_up_items(hospital_id, status, priority, sla_due_at);
  `);
  return { ok: true };
}

export default { up };
