#!/usr/bin/env node
/**
 * Explicit, tenant-bound legacy CRM backfill.
 *
 * Required: CRM_DEFAULT_TENANT_ID=123
 * Optional: --dry-run
 *
 * The tenant is intentionally mandatory because legacy crm_leads did not carry
 * a tenant key and guessing one would create a cross-hospital data leak.
 */
import pool from '../db/pgPool.js';
import { createLead } from '../services/hospital-crm-foundation.service.js';

const tenantId = Number(process.env.CRM_DEFAULT_TENANT_ID);
const dryRun = process.argv.includes('--dry-run');

if (!Number.isInteger(tenantId) || tenantId < 1) {
  console.error('CRM_DEFAULT_TENANT_ID must be a positive integer');
  process.exit(1);
}

const stageMap = {
  new: 'new',
  contacted: 'contacted',
  qualified: 'qualified',
  converted: 'won',
  won: 'won',
  lost: 'lost',
  nurture: 'nurture',
};

function jsonValue(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

try {
  const { rows } = await pool.query(`
    SELECT id, name, email, phone, source, status, priority, assigned_to,
           notes, tags, custom_fields, created_by, created_at, updated_at
      FROM crm_leads
     ORDER BY id
  `);

  console.log(`[crm-backfill] tenant=${tenantId} legacy_leads=${rows.length} dry_run=${dryRun}`);
  if (dryRun) process.exit(0);

  let processed = 0;
  for (const row of rows) {
    const source = String(row.source || 'legacy_crm').trim() || 'legacy_crm';
    await pool.query(
      `INSERT INTO crm_source_taxonomy (tenant_id, channel, source, display_name)
       VALUES ($1, 'legacy', $2, $3)
       ON CONFLICT DO NOTHING`,
      [tenantId, source, `Legacy: ${source}`]
    );
    const sourceTaxonomy = await pool.query(
      `SELECT id FROM crm_source_taxonomy
        WHERE tenant_id = $1 AND channel = 'legacy' AND source = $2
        ORDER BY id LIMIT 1`,
      [tenantId, source]
    );

    const lead = await createLead({
      tenantId,
      legacyLeadId: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      lifecycleStage: stageMap[String(row.status || 'new').toLowerCase()] || 'new',
      priority: ['low', 'medium', 'high', 'urgent'].includes(row.priority) ? row.priority : 'medium',
      ownerUserId: row.assigned_to,
      sourceDetail: source,
      sourceTaxonomyId: sourceTaxonomy.rows[0]?.id,
      metadata: {
        legacy_notes: row.notes || null,
        legacy_tags: jsonValue(row.tags, []),
        legacy_custom_fields: jsonValue(row.custom_fields, {}),
        legacy_created_by: row.created_by || null,
        legacy_created_at: row.created_at || null,
      },
      idempotencyKey: `legacy-crm-lead:${tenantId}:${row.id}`,
      source: 'legacy_crm_backfill',
    }, row.created_by || null);

    await pool.query(
      `UPDATE crm_leads_v2
          SET created_at = COALESCE($1::timestamptz, created_at),
              updated_at = COALESCE($2::timestamptz, updated_at)
        WHERE id = $3 AND tenant_id = $4`,
      [row.created_at, row.updated_at, lead.id, tenantId]
    );
    processed += 1;
    if (processed % 100 === 0) console.log(`[crm-backfill] processed=${processed}`);
  }
  console.log(`[crm-backfill] completed processed=${processed}`);
} catch (error) {
  console.error(`[crm-backfill] failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => {});
}
