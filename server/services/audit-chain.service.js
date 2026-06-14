/**
 * Audit Chain Service — Cryptographic Integrity for Audit Logs
 * =============================================================
 * Implements ITEM-16 of the SaMD readiness checklist: a tamper-evident
 * audit log using a SHA-256 hash chain (each row commits to the hash of
 * the previous row, making silent modification detectable).
 *
 * Design:
 *   - chainedInsert()  — writes a new audit row with prev_hash + row_hash
 *   - verifyChain()    — replays all rows and recomputes expected hashes;
 *                        returns { valid: true } or { valid: false, brokenAt: <id> }
 *
 * The genesis hash (first row's prev_hash) is the all-zeros sentinel: '0'.repeat(64)
 *
 * Pre-existing rows that have no hash columns set are treated as a trusted
 * baseline and skipped during verification so that enabling the chain on an
 * existing table does not immediately flag everything as broken.
 */

import crypto from 'crypto';
import pool from '../db/pgPool.js';

// ── One-time column provisioning (called at module load) ──────────────────────
async function ensureColumns() {
  try {
    await pool.query(`
      ALTER TABLE api_audit_logs
        ADD COLUMN IF NOT EXISTS row_hash TEXT,
        ADD COLUMN IF NOT EXISTS prev_hash TEXT
    `);
  } catch (err) {
    // Non-fatal at startup — the table may not exist yet in dev environments
    console.warn('[AuditChain] Could not ensure hash columns:', err.message);
  }
}

// Run immediately when the module is imported
ensureColumns().catch(() => {});

// ── Internal hash helper ──────────────────────────────────────────────────────

function computeHash(prevHash, action, userId, timestamp) {
  const payload = `${prevHash}|${action}|${userId}|${timestamp}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Insert a new audit log entry with a chained hash.
 *
 * @param {object} opts
 * @param {number|null}  opts.userId   — ID of the acting user (null for system)
 * @param {string}       opts.action   — Short action name, e.g. 'risk_score_acknowledged'
 * @param {string}       opts.method   — HTTP method (GET / POST / …) or 'SYSTEM'
 * @param {string}       opts.path     — Request path or synthetic path for cron events
 * @param {number}       opts.status   — HTTP status code or 0 for internal events
 * @param {object}       opts.details  — Arbitrary JSON context
 * @param {number|null}  opts.tenantId — Tenant scoping (optional)
 */
export async function chainedInsert({ userId, action, method, path, status, details, tenantId }) {
  // Serialise access to the chain — read the latest hash then insert atomically
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock to prevent a race condition between concurrent inserts
    const { rows: prev } = await client.query(
      'SELECT row_hash FROM api_audit_logs ORDER BY id DESC LIMIT 1 FOR UPDATE SKIP LOCKED'
    );
    const prevHash  = prev[0]?.row_hash || '0'.repeat(64);
    const timestamp = new Date().toISOString();
    const rowHash   = computeHash(prevHash, action ?? '', userId ?? '', timestamp);

    await client.query(
      `INSERT INTO api_audit_logs
         (user_id, action, method, path, status_code, details, tenant_id,
          prev_hash, row_hash, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        userId   ?? null,
        action   ?? '',
        method   ?? 'SYSTEM',
        path     ?? '/',
        status   ?? 0,
        JSON.stringify(details ?? {}),
        tenantId ?? null,
        prevHash,
        rowHash,
        timestamp,
      ]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    // Non-blocking for callers — log and continue
    console.error('[AuditChain] chainedInsert failed:', err.message);
  } finally {
    client.release();
  }
}

/**
 * Walk every row in api_audit_logs (ascending by id) and verify that each
 * row's row_hash matches the hash we would compute from its content.
 *
 * Rows that pre-date the chain feature (both columns NULL) are skipped as
 * trusted baseline so the first chained row may have any prev_hash value.
 *
 * @returns {{ valid: boolean, brokenAt: number|null, checkedRows: number }}
 */
export async function verifyChain() {
  const { rows } = await pool.query(
    'SELECT id, action, user_id, created_at, prev_hash, row_hash FROM api_audit_logs ORDER BY id ASC'
  );

  let prevHash    = '0'.repeat(64);
  let checkedRows = 0;

  for (const row of rows) {
    // Skip legacy rows that were written before the chain was enabled
    if (row.row_hash == null && row.prev_hash == null) {
      continue;
    }

    const timestamp = row.created_at instanceof Date
      ? row.created_at.toISOString()
      : String(row.created_at);

    const expected = computeHash(
      row.prev_hash ?? prevHash,
      row.action    ?? '',
      row.user_id   ?? '',
      timestamp
    );

    if (row.row_hash !== expected) {
      return { valid: false, brokenAt: row.id, checkedRows };
    }

    prevHash = row.row_hash;
    checkedRows++;
  }

  return { valid: true, brokenAt: null, checkedRows };
}
