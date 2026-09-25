import pool from '../db/pgPool.js';
import crypto from 'crypto';

const DEFAULT_TTL_SECONDS = 120;
const DEFAULT_HEARTBEAT_SECONDS = 30;

function ownerId() {
  return `${process.env.PM2_INSTANCE_ID || 'local'}:${process.pid}:${crypto.randomBytes(4).toString('hex')}`;
}

export async function acquireCronLease(jobKey, { ttlSeconds = DEFAULT_TTL_SECONDS, metadata = {} } = {}) {
  const owner = ownerId();
  const { rows } = await pool.query(
    `INSERT INTO cron_job_leases (job_key, owner_id, expires_at, metadata)
     VALUES ($1, $2, NOW() + ($3 || ' seconds')::interval, $4::jsonb)
     ON CONFLICT (job_key) DO UPDATE
       SET owner_id = EXCLUDED.owner_id,
           acquired_at = CASE WHEN cron_job_leases.expires_at <= NOW() THEN NOW() ELSE cron_job_leases.acquired_at END,
           heartbeat_at = NOW(), expires_at = EXCLUDED.expires_at, metadata = EXCLUDED.metadata
       WHERE cron_job_leases.expires_at <= NOW()
     RETURNING job_key, owner_id, acquired_at, heartbeat_at, expires_at, metadata`,
    [jobKey, owner, String(ttlSeconds), JSON.stringify(metadata)]
  );
  return rows[0] ? { acquired: true, ...rows[0] } : { acquired: false, jobKey, reason: 'lease_held' };
}

export async function heartbeatCronLease(jobKey, owner, { ttlSeconds = DEFAULT_TTL_SECONDS } = {}) {
  const { rows } = await pool.query(
    `UPDATE cron_job_leases
     SET heartbeat_at = NOW(), expires_at = NOW() + ($3 || ' seconds')::interval
     WHERE job_key = $1 AND owner_id = $2 AND expires_at > NOW()
     RETURNING job_key, owner_id, expires_at`,
    [jobKey, owner, String(ttlSeconds)]
  );
  return Boolean(rows[0]);
}

export async function releaseCronLease(jobKey, owner) {
  await pool.query('DELETE FROM cron_job_leases WHERE job_key = $1 AND owner_id = $2', [jobKey, owner]);
}

export async function listCronLeases() {
  const { rows } = await pool.query(
    `SELECT job_key, owner_id, acquired_at, heartbeat_at, expires_at, metadata,
            CASE WHEN expires_at <= NOW() THEN 'stale' ELSE 'running' END AS status
     FROM cron_job_leases ORDER BY job_key`
  );
  return rows;
}

export async function withCronLease(jobKey, fn, options = {}) {
  const lease = await acquireCronLease(jobKey, options);
  if (!lease.acquired) return { skipped: true, reason: 'lease_held' };
  const heartbeat = setInterval(() => { heartbeatCronLease(jobKey, lease.owner_id).catch(() => {}); }, (options.heartbeatSeconds || DEFAULT_HEARTBEAT_SECONDS) * 1000);
  heartbeat.unref?.();
  try {
    return await fn(lease);
  } finally {
    clearInterval(heartbeat);
    await releaseCronLease(jobKey, lease.owner_id).catch(() => {});
  }
}

export default { acquireCronLease, heartbeatCronLease, releaseCronLease, listCronLeases, withCronLease };
