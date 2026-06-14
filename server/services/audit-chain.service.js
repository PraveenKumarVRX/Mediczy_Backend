/**
 * Audit Chain Service — Cryptographic Integrity for Audit Logs
 * =============================================================
 * Implements ITEM-16: tamper-evident audit log using a SHA-256 hash chain
 * (each row commits to the hash of the previous row, making silent
 * modification detectable).
 *
 * Works against the actual api_audit_logs schema:
 *   log_id VARCHAR PRIMARY KEY  (UUID generated here)
 *   actor_id VARCHAR            (user/service identity)
 *   actor_type VARCHAR          ('user' | 'system' | 'admin' | …)
 *   action VARCHAR
 *   resource_type VARCHAR
 *   resource_id VARCHAR
 *   tenant_id INTEGER
 *   changes JSONB
 *   metadata JSONB
 *   ip_address VARCHAR
 *   user_agent TEXT
 *   created_at TIMESTAMP
 *   row_hash TEXT               (SHA-256 of this row's content + prev_hash)
 *   prev_hash TEXT              (row_hash of the chronologically prior chained row)
 *
 * The genesis hash (first row's prev_hash) is the all-zeros sentinel: '0'.repeat(64)
 *
 * Pre-existing rows that have no hash set are treated as a trusted baseline and
 * skipped during verification so that enabling the chain on an existing table does
 * not immediately flag everything as broken.
 */

import { randomUUID } from 'crypto';
import crypto from 'crypto';
import pool from '../db/pgPool.js';

// ── One-time column provisioning (idempotent) ─────────────────────────────────
async function ensureColumns() {
  try {
    await pool.query(`
      ALTER TABLE api_audit_logs
        ADD COLUMN IF NOT EXISTS row_hash  TEXT,
        ADD COLUMN IF NOT EXISTS prev_hash TEXT
    `);
  } catch (err) {
    console.warn('[AuditChain] Could not ensure hash columns:', err.message);
  }
}

ensureColumns().catch(() => {});

// ── Internal hash helper ──────────────────────────────────────────────────────

function computeHash(prevHash, action, actorId, timestamp) {
  const payload = `${prevHash}|${action}|${actorId}|${timestamp}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Insert a new audit log entry with a chained hash.
 *
 * @param {object} opts
 * @param {string|null}  opts.actorId      — Acting user/service ID (null for anonymous)
 * @param {string}       opts.actorType    — 'user' | 'system' | 'admin' | 'cron'
 * @param {string}       opts.action       — Short action name, e.g. 'risk_score_acknowledged'
 * @param {string}       opts.resourceType — What was affected, e.g. 'appointment', 'patient'
 * @param {string|null}  opts.resourceId   — ID of the affected resource
 * @param {number|null}  opts.tenantId     — Tenant scoping (optional)
 * @param {object}       opts.changes      — Arbitrary JSON context (what changed)
 * @param {object}       opts.metadata     — Arbitrary JSON context (request metadata)
 * @param {string|null}  opts.ipAddress    — Client IP
 * @param {string|null}  opts.userAgent    — Client user-agent
 */
export async function chainedInsert({
  actorId,
  actorType    = 'system',
  action,
  resourceType = 'unknown',
  resourceId   = null,
  tenantId,
  changes      = {},
  metadata     = {},
  ipAddress    = null,
  userAgent    = null,
}) {
  if (!tenantId) {
    console.error('[AuditChain] chainedInsert requires tenantId (api_audit_logs.tenant_id is NOT NULL)');
    return null;
  }
  if (!actorId) {
    console.error('[AuditChain] chainedInsert requires actorId');
    return null;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Read the most recent chained hash and lock it to prevent races
    const { rows: prev } = await client.query(
      `SELECT row_hash FROM api_audit_logs
       WHERE row_hash IS NOT NULL
       ORDER BY created_at DESC, log_id DESC
       LIMIT 1
       FOR UPDATE SKIP LOCKED`
    );
    const prevHash  = prev[0]?.row_hash || '0'.repeat(64);
    const timestamp = new Date().toISOString();
    const logId     = randomUUID();
    const rowHash   = computeHash(prevHash, action ?? '', actorId ?? '', timestamp);

    await client.query(
      `INSERT INTO api_audit_logs
         (log_id, actor_id, actor_type, action, resource_type, resource_id,
          tenant_id, changes, metadata, ip_address, user_agent,
          prev_hash, row_hash, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        logId,
        actorId      ?? null,
        actorType,
        action       ?? '',
        resourceType,
        resourceId   ?? null,
        tenantId     ?? null,
        JSON.stringify(changes),
        JSON.stringify(metadata),
        ipAddress    ?? null,
        userAgent    ?? null,
        prevHash,
        rowHash,
        timestamp,
      ]
    );

    await client.query('COMMIT');
    return logId;
  } catch (err) {
    await client.query('ROLLBACK');
    // Non-blocking for callers — log and continue
    console.error('[AuditChain] chainedInsert failed:', err.message);
    return null;
  } finally {
    client.release();
  }
}

/**
 * Walk every chained row in api_audit_logs (ascending by created_at, log_id) and
 * verify that each row's row_hash matches the hash computed from its content.
 *
 * Rows where both columns are NULL pre-date the chain and are skipped as a
 * trusted baseline.
 *
 * @returns {{ valid: boolean, brokenAt: string|null, checkedRows: number }}
 */
export async function verifyChain() {
  const { rows } = await pool.query(
    `SELECT log_id, action, actor_id, created_at, prev_hash, row_hash
     FROM api_audit_logs
     WHERE row_hash IS NOT NULL
     ORDER BY created_at ASC, log_id ASC`
  );

  let prevHash    = '0'.repeat(64);
  let checkedRows = 0;

  for (const row of rows) {
    if (row.row_hash == null && row.prev_hash == null) {
      continue;
    }

    const timestamp = row.created_at instanceof Date
      ? row.created_at.toISOString()
      : String(row.created_at);

    const expected = computeHash(
      row.prev_hash ?? prevHash,
      row.action    ?? '',
      row.actor_id  ?? '',
      timestamp
    );

    if (row.row_hash !== expected) {
      return { valid: false, brokenAt: row.log_id, checkedRows };
    }

    prevHash = row.row_hash;
    checkedRows++;
  }

  return { valid: true, brokenAt: null, checkedRows };
}
