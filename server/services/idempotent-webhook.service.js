/**
 * Idempotent Webhook Service — Eve-Healthcare pattern ported to Mediqzy
 *
 * Provides a durable idempotency layer for inbound webhooks (TPA claim status,
 * insurer remittances, NHCX callbacks, payment gateways). Each inbound event is
 * keyed by an `event_id`. The first delivery is processed; subsequent deliveries
 * with the same `event_id` are detected as duplicates and rejected, preventing
 * double processing of claim submissions, payments, and remittances.
 *
 * Permanent retention: event_ids are never purged, matching Eve-Healthcare's
 * "idempotency keys permanently retained in the database audit log" guarantee.
 */
import pool from '../db/pgPool.js';
import WebhookEventLog from '../models/postgres/webhookEventLog.model.postgres.js';

const IDEMPOTENT_SOURCES = new Set([
  'tpa', 'insurer', 'nhcx', 'razorpay', 'azadea', 'cashfree', 'phonepe'
]);

/**
 * Check whether an event_id has already been recorded.
 * Returns { exists: true, record } if already processed, { exists: false } otherwise.
 */
export async function isDuplicate(eventId) {
  if (!eventId) return { exists: false };
  const where = { eventId: String(eventId).trim() };

  const record = await WebhookEventLog.findOne({ where });
  return { exists: Boolean(record), record: record ? record.toJSON() : null };
}

/**
 * Record a new inbound webhook event. Throws if the event_id already exists
 * (duplicate delivery) — callers should catch and return a 200/202 to the sender
 * to avoid redelivery loops.
 */
export async function recordEvent({
  eventId,
  source,
  provider,
  eventType,
  organizationId,
  claimNumber,
  payload,
  headers,
  hmacSignature,
  hmacVerified = false
}) {
  if (!eventId || !source || !provider || !eventType) {
    throw new Error('eventId, source, provider, and eventType are required');
  }

  // Guard against duplicate insertion at the application layer too
  const existing = await isDuplicate(eventId, { source, provider });
  if (existing.exists) {
    const err = new Error(`Duplicate webhook event_id: ${eventId}`);
    err.statusCode = 409;
    err.isDuplicate = true;
    err.existingRecord = existing.record;
    throw err;
  }

  const record = await WebhookEventLog.create({
    eventId: String(eventId).trim(),
    source,
    provider,
    eventType,
    organizationId: organizationId || null,
    claimNumber: claimNumber || null,
    payload: payload || {},
    headers: headers || {},
    hmacSignature: hmacSignature || null,
    hmacVerified: Boolean(hmacVerified),
    processed: false,
    processingStatus: 'pending',
    retryCount: 0,
    maxRetries: 5
  });

  return record.toJSON ? record.toJSON() : record;
}

/**
 * Mark an event as successfully processed.
 */
export async function markProcessed(eventId, result = null) {
  const record = await WebhookEventLog.findOne({ where: { eventId: String(eventId).trim() } });
  if (!record) return null;

  await record.update({
    processed: true,
    processingStatus: 'processed',
    processedAt: new Date(),
    payload: result ? { ...record.get('payload'), result } : record.get('payload')
  });
  return record.toJSON ? record.toJSON() : record;
}

/**
 * Mark an event as failed, incrementing retry count.
 */
export async function markFailed(eventId, errorMessage) {
  const record = await WebhookEventLog.findOne({ where: { eventId: String(eventId).trim() } });
  if (!record) return null;

  const retryCount = Number(record.get('retryCount') || 0) + 1;
  const maxRetries = Number(record.get('maxRetries') || 5);
  const processingStatus = retryCount >= maxRetries ? 'failed' : 'pending';

  await record.update({
    processingStatus,
    errorMessage,
    retryCount,
    processed: processingStatus === 'processed'
  });
  return record.toJSON ? record.toJSON() : record;
}

/**
 * Mark an event as a duplicate (detected at processing time, not insertion).
 */
export async function markDuplicate(eventId) {
  const record = await WebhookEventLog.findOne({ where: { eventId: String(eventId).trim() } });
  if (!record) return null;
  await record.update({ processingStatus: 'duplicate' });
  return record.toJSON ? record.toJSON() : record;
}

/**
 * List webhook events for an organization, with optional filtering.
 */
export async function listEvents({
  organizationId,
  source,
  provider,
  processingStatus,
  claimNumber,
  limit = 50,
  offset = 0
}) {
  const where = {};
  if (organizationId) where.organizationId = organizationId;
  if (source) where.source = source;
  if (provider) where.provider = provider;
  if (processingStatus) where.processingStatus = processingStatus;
  if (claimNumber) where.claimNumber = claimNumber;

  const { count, rows } = await WebhookEventLog.findAndCountAll({
    where,
    limit: Math.min(parseInt(limit, 10) || 50, 200),
    offset: parseInt(offset, 10) || 0,
    order: [['received_at', 'DESC']]
  });

  return {
    total: count,
    limit: Math.min(parseInt(limit, 10) || 50, 200),
    offset: parseInt(offset, 10) || 0,
    events: rows.map((r) => r.toJSON())
  };
}

/**
 * Get a single event by event_id.
 */
export async function getEvent(eventId) {
  const record = await WebhookEventLog.findOne({ where: { eventId: String(eventId).trim() } });
  return record ? record.toJSON() : null;
}

/**
 * Check whether a source is configured for idempotent logging.
 */
export function isIdempotentSource(source) {
  return IDEMPOTENT_SOURCES.has(String(source).toLowerCase());
}

export default {
  isDuplicate,
  recordEvent,
  markProcessed,
  markFailed,
  markDuplicate,
  listEvents,
  getEvent,
  isIdempotentSource
};
