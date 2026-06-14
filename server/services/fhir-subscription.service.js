/**
 * FHIR R4 Subscription Service — ITEM-23
 *
 * Manages FHIR Subscription resources and delivers push notifications to
 * partner systems when matching FHIR resources are written.
 *
 * Supported channel types: rest-hook, websocket, email
 *
 * Standards: HL7 FHIR R4 §26.2 (Subscription)
 */

import pool from '../db/pgPool.js';

// ── Table initialisation ─────────────────────────────────────────────────────

async function start() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fhir_subscriptions (
      id               SERIAL PRIMARY KEY,
      criteria         TEXT NOT NULL,
      channel_type     TEXT NOT NULL CHECK (channel_type IN ('rest-hook', 'websocket', 'email')),
      channel_endpoint TEXT,
      channel_payload  TEXT DEFAULT 'application/fhir+json',
      status           TEXT NOT NULL DEFAULT 'requested'
                         CHECK (status IN ('requested', 'active', 'error', 'off')),
      reason           TEXT,
      contact          JSONB,
      end_date         TIMESTAMPTZ,
      error_message    TEXT,
      created_at       TIMESTAMPTZ DEFAULT NOW(),
      updated_at       TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

// ── FHIR Subscription shape mapper ──────────────────────────────────────────

function mapToFhirResource(row) {
  const resource = {
    resourceType: 'Subscription',
    id: String(row.id),
    meta: {
      lastUpdated: row.updated_at
        ? new Date(row.updated_at).toISOString()
        : new Date().toISOString(),
    },
    status: row.status,
    reason: row.reason || '',
    criteria: row.criteria,
    channel: {
      type: row.channel_type,
      endpoint: row.channel_endpoint || undefined,
      payload: row.channel_payload || 'application/fhir+json',
    },
  };

  if (row.contact) {
    resource.contact = row.contact;
  }

  if (row.end_date) {
    resource.end = new Date(row.end_date).toISOString();
  }

  if (row.error_message) {
    resource.error = row.error_message;
  }

  return resource;
}

// ── CRUD operations ──────────────────────────────────────────────────────────

/**
 * Create a new Subscription and immediately activate it.
 */
async function createSubscription(data) {
  const {
    criteria,
    channel_type,
    channel_endpoint = null,
    channel_payload = 'application/fhir+json',
    reason = null,
    contact = null,
    end_date = null,
  } = data;

  const { rows } = await pool.query(
    `INSERT INTO fhir_subscriptions
       (criteria, channel_type, channel_endpoint, channel_payload,
        status, reason, contact, end_date)
     VALUES ($1, $2, $3, $4, 'active', $5, $6, $7)
     RETURNING *`,
    [
      criteria,
      channel_type,
      channel_endpoint,
      channel_payload,
      reason,
      contact ? JSON.stringify(contact) : null,
      end_date || null,
    ]
  );

  return mapToFhirResource(rows[0]);
}

/**
 * List subscriptions, optionally filtered by status.
 * Returns a FHIR Bundle (searchset).
 */
async function listSubscriptions(filters = {}) {
  const conditions = [];
  const values = [];

  if (filters.status) {
    values.push(filters.status);
    conditions.push(`status = $${values.length}`);
  }

  if (filters.criteria) {
    values.push(`${filters.criteria}%`);
    conditions.push(`criteria LIKE $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT * FROM fhir_subscriptions ${where} ORDER BY created_at DESC`,
    values
  );

  const entries = rows.map((row) => ({
    fullUrl: `Subscription/${row.id}`,
    resource: mapToFhirResource(row),
  }));

  return {
    resourceType: 'Bundle',
    id: `subscription-list-${Date.now()}`,
    type: 'searchset',
    total: entries.length,
    entry: entries,
  };
}

/**
 * Retrieve a single Subscription by id.
 */
async function getSubscription(id) {
  const { rows } = await pool.query(
    'SELECT * FROM fhir_subscriptions WHERE id = $1',
    [id]
  );

  if (!rows.length) return null;
  return mapToFhirResource(rows[0]);
}

/**
 * Cancel (deactivate) a Subscription by setting status = 'off'.
 */
async function cancelSubscription(id) {
  const { rows } = await pool.query(
    `UPDATE fhir_subscriptions
        SET status = 'off', updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [id]
  );

  if (!rows.length) return null;
  return mapToFhirResource(rows[0]);
}

// ── Notification delivery ────────────────────────────────────────────────────

/**
 * Deliver a notification to a single rest-hook subscriber.
 * On failure the subscription's error_message is updated and status set to 'error'.
 */
async function deliverRestHook(subscription, resource) {
  try {
    const response = await fetch(subscription.channel.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': subscription.channel.payload || 'application/fhir+json',
        'X-FHIR-Subscription-Id': subscription.id,
      },
      body: JSON.stringify(resource),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      throw new Error(`HTTP ${response.status}: ${text}`);
    }
  } catch (err) {
    console.error(
      `[fhir-subscription] rest-hook delivery failed for subscription ${subscription.id}:`,
      err.message
    );
    // Mark subscription as error so the operator can investigate
    await pool.query(
      `UPDATE fhir_subscriptions
          SET status = 'error', error_message = $1, updated_at = NOW()
        WHERE id = $2`,
      [err.message, subscription.id]
    );
  }
}

/**
 * Deliver a notification via WebSocket using Socket.IO (global.io).
 */
function deliverWebSocket(subscription, resource) {
  if (typeof global.io === 'undefined' || !global.io) {
    console.warn(
      `[fhir-subscription] WebSocket delivery skipped for subscription ${subscription.id}: global.io not available`
    );
    return;
  }

  const room = subscription.channel.endpoint || 'fhir-subscriptions';
  global.io.to(room).emit('fhir-notification', {
    subscriptionId: subscription.id,
    criteria: subscription.criteria,
    resource,
  });
}

/**
 * Fan-out notifications to all active subscriptions matching the written resource type.
 *
 * Matching rule: criteria prefix equals the resourceType string.
 * e.g.  criteria = 'Patient'        matches Patient writes
 *        criteria = 'Observation'   matches Observation writes
 *
 * Called by FHIR write routes (POST / PUT / DELETE).
 */
async function notifySubscribers(resourceType, resource) {
  try {
    // Select active, non-expired subscriptions whose criteria starts with the resource type
    const { rows } = await pool.query(
      `SELECT * FROM fhir_subscriptions
        WHERE status = 'active'
          AND criteria LIKE $1
          AND (end_date IS NULL OR end_date > NOW())`,
      [`${resourceType}%`]
    );

    if (!rows.length) return;

    for (const row of rows) {
      const subscription = mapToFhirResource(row);

      switch (row.channel_type) {
        case 'rest-hook':
          // Fire-and-forget; errors are logged and subscription marked 'error'
          deliverRestHook(subscription, resource).catch((err) =>
            console.error('[fhir-subscription] unhandled rest-hook error:', err)
          );
          break;

        case 'websocket':
          deliverWebSocket(subscription, resource);
          break;

        case 'email':
          // Email delivery is out of scope; log for operator awareness
          console.warn(
            `[fhir-subscription] email delivery not implemented for subscription ${row.id} (criteria: ${row.criteria})`
          );
          break;

        default:
          console.warn(
            `[fhir-subscription] unknown channel_type '${row.channel_type}' for subscription ${row.id}`
          );
      }
    }
  } catch (err) {
    // Never throw — notification failures must not interrupt the primary FHIR write
    console.error('[fhir-subscription] notifySubscribers error:', err);
  }
}

// ── Exports ──────────────────────────────────────────────────────────────────

export default {
  start,
  createSubscription,
  listSubscriptions,
  getSubscription,
  cancelSubscription,
  notifySubscribers,
  mapToFhirResource,
};
