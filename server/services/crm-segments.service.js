/**
 * CRM Growth Engine — Phase 1: segments.
 * A segment is a saved filter over crm_leads_v2; membership is materialized
 * into crm_segment_members (not computed per request) and kept current by a
 * periodic refresh cron — see crm-segment-refresh-cron.service.js.
 */
import sharedPool from '../db/pgPool.js';

import { schemaVerifier, guardedQuery } from '../utils/schema-guard.js';
// Whitelisted fields — never interpolate an arbitrary column name from user input.
const FIELD_COLUMNS = {
  lifecycle_stage: 'lv.lifecycle_stage',
  status: 'lv.status',
  priority: 'lv.priority',
  score: 'lv.score',
  source_detail: 'lv.source_detail',
  source: 'lv.source_detail',
  owner_user_id: 'lv.owner_user_id',
  created_at: 'lv.created_at',
  // Contact-level fields (Audiences in Engage): read through the lead's v2 contact.
  city: '(SELECT c.city FROM crm_contacts_v2 c WHERE c.id = lv.contact_id)',
  preferred_language: '(SELECT c.preferred_language FROM crm_contacts_v2 c WHERE c.id = lv.contact_id)',
  consent_status: '(SELECT c.consent_status FROM crm_contacts_v2 c WHERE c.id = lv.contact_id)',
};

const OPERATORS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains', 'since_days']);

const SCHEMA_TABLES = ['crm_segments', 'crm_segment_members'];

// Owned by the migration and only verified here: creating these on demand
// would let a skipped migration look healthy on tables without its indexes
// and constraints, and would let a request hold an ACCESS EXCLUSIVE lock.
const ensureCrmSegmentsSchema = schemaVerifier({
  sequelize: sharedPool,
  tables: SCHEMA_TABLES,
  code: 'SCHEMA_NOT_MIGRATED',
  message: 'Apply the platform-edge governance migrations before using this service',
});


const guardedSharedPool = guardedQuery(sharedPool, 'Apply the platform-edge governance migrations before using this service');

// Reported at startup so an unmigrated environment shows in the log, not
// only when the first request fails. Boot is not blocked.

function positiveInt(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Compile a whitelisted { conditions: [{field, op, value}] } definition into a parameterized SQL fragment. AND-only for v1. */
export function compileFilterToSql(filterDefinition, paramsStart = []) {
  const params = [...paramsStart];
  // Static audiences (the former marketing Lists): an explicit set of leads instead of rules.
  if (filterDefinition?.type === 'static') {
    const ids = (Array.isArray(filterDefinition.lead_ids) ? filterDefinition.lead_ids : []).map(Number).filter((n) => Number.isSafeInteger(n) && n > 0);
    params.push(ids);
    return { whereSql: `lv.id = ANY($${params.length}::bigint[])`, params };
  }
  const conditions = Array.isArray(filterDefinition?.conditions) ? filterDefinition.conditions : [];
  const clauses = [];

  for (const cond of conditions) {
    const column = FIELD_COLUMNS[cond?.field];
    if (!column || !OPERATORS.has(cond?.op)) continue; // silently skip unknown fields/ops — fail closed, not fail loud

    if (cond.op === 'since_days') {
      const days = Number(cond.value);
      if (!Number.isFinite(days) || days < 0) continue;
      params.push(days);
      clauses.push(`${column} >= NOW() - ($${params.length} || ' days')::interval`);
      continue;
    }
    if (cond.op === 'in') {
      const values = Array.isArray(cond.value) ? cond.value : [cond.value];
      if (!values.length) continue;
      params.push(values);
      clauses.push(`${column} = ANY($${params.length})`);
      continue;
    }
    if (cond.op === 'contains') {
      params.push(`%${String(cond.value)}%`);
      clauses.push(`${column} ILIKE $${params.length}`);
      continue;
    }
    const opSql = { eq: '=', neq: '!=', gt: '>', gte: '>=', lt: '<', lte: '<=' }[cond.op];
    params.push(cond.value);
    clauses.push(`${column} ${opSql} $${params.length}`);
  }

  return { whereSql: clauses.length ? clauses.join(' AND ') : 'TRUE', params };
}

export async function createSegment({ tenantId, name, description, filterDefinition, createdBy }) {
  const { rows } = await guardedSharedPool(
    `INSERT INTO crm_segments (tenant_id, name, description, filter_definition, created_by)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [tenantId, name, description || null, JSON.stringify(filterDefinition || {}), createdBy || null]
  );
  const segment = rows[0];
  await refreshSegmentMembership(segment.id, tenantId);
  return getSegment(tenantId, segment.id);
}

export async function updateSegment(tenantId, segmentId, { name, description, filterDefinition, isActive }) {
  const { rows } = await guardedSharedPool(
    `UPDATE crm_segments SET
       name = COALESCE($1, name), description = COALESCE($2, description),
       filter_definition = COALESCE($3, filter_definition), is_active = COALESCE($4, is_active),
       updated_at = NOW()
     WHERE tenant_id = $5 AND id = $6 RETURNING *`,
    [name || null, description ?? null, filterDefinition ? JSON.stringify(filterDefinition) : null, isActive ?? null, tenantId, segmentId]
  );
  if (!rows[0]) throw Object.assign(new Error('Segment not found'), { statusCode: 404 });
  if (filterDefinition) await refreshSegmentMembership(segmentId, tenantId);
  return getSegment(tenantId, segmentId);
}

export async function listSegments(tenantId) {
  const { rows } = await guardedSharedPool(
    `SELECT * FROM crm_segments WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [tenantId]
  );
  return rows;
}

export async function getSegment(tenantId, segmentId) {
  const { rows } = await guardedSharedPool(`SELECT * FROM crm_segments WHERE tenant_id = $1 AND id = $2`, [tenantId, positiveInt(segmentId)]);
  if (!rows[0]) throw Object.assign(new Error('Segment not found'), { statusCode: 404 });
  return rows[0];
}

export async function deleteSegment(tenantId, segmentId) {
  const { rowCount } = await guardedSharedPool(`DELETE FROM crm_segments WHERE tenant_id = $1 AND id = $2`, [tenantId, positiveInt(segmentId)]);
  if (!rowCount) throw Object.assign(new Error('Segment not found'), { statusCode: 404 });
}

export async function listSegmentMembers(tenantId, segmentId, { limit = 50 } = {}) {
  const cappedLimit = Math.min(Math.max(positiveInt(limit) || 50, 1), 500);
  const { rows } = await guardedSharedPool(
    `SELECT lv.id AS lead_id, lv.legacy_lead_id, lv.lifecycle_stage, lv.status, lv.score, ct.name, ct.email, ct.phone_e164 AS phone, sm.added_at
     FROM crm_segment_members sm
     JOIN crm_leads_v2 lv ON lv.id = sm.lead_id
     JOIN crm_contacts_v2 ct ON ct.id = lv.contact_id
     WHERE sm.tenant_id = $1 AND sm.segment_id = $2
     ORDER BY sm.added_at DESC
     LIMIT $3`,
    [tenantId, positiveInt(segmentId), cappedLimit]
  );
  return rows;
}

/** Recompute a segment's membership from its filter_definition. Delete-then-insert — safe at today's row counts. */
export async function refreshSegmentMembership(segmentId, tenantId) {
  const { rows: segRows } = await guardedSharedPool(`SELECT * FROM crm_segments WHERE id = $1 AND ($2::bigint IS NULL OR tenant_id = $2)`, [positiveInt(segmentId), tenantId || null]);
  const segment = segRows[0];
  if (!segment) throw Object.assign(new Error('Segment not found'), { statusCode: 404 });

  const { whereSql, params } = compileFilterToSql(segment.filter_definition, [segment.tenant_id]);
  const matchQuery = `SELECT lv.id FROM crm_leads_v2 lv WHERE lv.tenant_id = $1 AND lv.deleted_at IS NULL AND (${whereSql})`;
  const { rows: matches } = await guardedSharedPool(matchQuery, params);
  const matchedIds = matches.map((r) => r.id);

  const client = await sharedPool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM crm_segment_members WHERE segment_id = $1`, [segment.id]);
    if (matchedIds.length) {
      const values = matchedIds.map((_, i) => `($1, $2, $${i + 3})`).join(',');
      await client.query(
        `INSERT INTO crm_segment_members (tenant_id, segment_id, lead_id) VALUES ${values}`,
        [segment.tenant_id, segment.id, ...matchedIds]
      );
    }
    await client.query(
      `UPDATE crm_segments SET member_count = $1, last_refreshed_at = NOW() WHERE id = $2`,
      [matchedIds.length, segment.id]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  return matchedIds.length;
}

export async function refreshAllActiveSegments() {
  const { rows } = await guardedSharedPool(`SELECT id, tenant_id FROM crm_segments WHERE is_active = TRUE`);
  let refreshed = 0;
  let failed = 0;
  for (const seg of rows) {
    try {
      await refreshSegmentMembership(seg.id, seg.tenant_id);
      refreshed++;
    } catch (err) {
      failed++;
      console.warn('[CRM Segments] refresh failed for segment', seg.id, ':', err.message);
    }
  }
  return { total: rows.length, refreshed, failed };
}

export default {
  ensureCrmSegmentsSchema, compileFilterToSql, createSegment, updateSegment, listSegments,
  getSegment, deleteSegment, listSegmentMembers, refreshSegmentMembership, refreshAllActiveSegments,
};
