/**
 * Idempotent Webhook Event Log — Eve-Healthcare pattern ported to Mediqzy
 *
 * Creates a durable, append-only log of every inbound webhook event keyed by
 * an idempotency key (event_id). Once an event_id is recorded, any subsequent
 * delivery with the same key is detected as a duplicate and rejected, preventing
 * double processing of TPA / insurer / NHCX claim callbacks, payment webhooks,
 * and remittance advices.
 *
 * Run: node server/migrations/20261028000000-idempotent-webhook-event-log.migration.js
 */
import pool from '../db/pgPool.js';
import { pathToFileURL } from 'url';

const SQL = `
CREATE TABLE IF NOT EXISTS webhook_event_log (
  id BIGSERIAL PRIMARY KEY,
  event_id VARCHAR(128) NOT NULL UNIQUE,
  source VARCHAR(80) NOT NULL,              -- 'tpa', 'insurer', 'nhcx', 'razorpay', 'azadea', etc.
  provider VARCHAR(80) NOT NULL,            -- 'heritage', 'mdindia', 'starhealth', 'nhcx', etc.
  event_type VARCHAR(80) NOT NULL,          -- 'claim.status', 'preauth.decision', 'remittance', 'payment', etc.
  organization_id INTEGER,
  claim_number VARCHAR(64),                 -- linked insurance claim, if any
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  hmac_signature VARCHAR(255),              -- raw HMAC signature header value
  hmac_verified BOOLEAN NOT NULL DEFAULT FALSE,
  processed BOOLEAN NOT NULL DEFAULT FALSE,
  processing_status VARCHAR(40) NOT NULL DEFAULT 'pending', -- pending, processed, failed, duplicate
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 5,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_event_log_event_id ON webhook_event_log(event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_event_log_source_provider ON webhook_event_log(source, provider);
CREATE INDEX IF NOT EXISTS idx_webhook_event_log_org_status ON webhook_event_log(organization_id, processing_status);
CREATE INDEX IF NOT EXISTS idx_webhook_event_log_claim ON webhook_event_log(claim_number);
CREATE INDEX IF NOT EXISTS idx_webhook_event_log_received_at ON webhook_event_log(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_event_log_processing_status ON webhook_event_log(processing_status);
`;

export async function up(client = pool) {
  await client.query(SQL);
}

async function run() {
  console.log('[migration] Creating idempotent webhook event log table...');
  await up(pool);
  console.log('[migration] webhook_event_log migration complete.');
  await pool.end();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((e) => { console.error(e); process.exit(1); });
}

export default { up };
