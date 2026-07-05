/**
 * HealthOS — Webhook delivery engine
 */
import crypto from 'crypto';
import pool from '../../db/pgPool.js';
import { up as migrate } from '../../migrations/healthos-phases-2-4.migration.js';

let ready = false;
async function ensure() { if (!ready) { await migrate(); ready = true; } }

export async function dispatchWebhooks(organizationId, event, payload) {
  await ensure();
  const { rows: hooks } = await pool.query(
    `SELECT * FROM healthos_webhooks WHERE organization_id = $1 AND status = 'active' AND $2 = ANY(events)`,
    [organizationId, event]
  );
  if (!hooks.length) return { delivered: 0 };

  const body = JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload });
  let delivered = 0;

  for (const hook of hooks) {
    try {
      const sig = crypto.createHmac('sha256', hook.secret_hash || 'healthos').update(body).digest('hex');
      const res = await fetch(hook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-HealthOS-Event': event,
          'X-HealthOS-Signature': sig,
        },
        body,
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) delivered += 1;
    } catch (err) {
      console.warn(`[HealthOS webhook] delivery failed ${hook.url}:`, err.message);
    }
  }
  return { delivered, total: hooks.length };
}

export default { dispatchWebhooks };
