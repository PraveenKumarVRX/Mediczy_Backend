/** One-time, idempotent consolidation of templates, audiences and campaigns into their canonical tables.
 *
 *   templates   crm_marketing_templates, crm_email_templates, crm_whatsapp_templates -> crm_communication_templates
 *   audiences   crm_marketing_lists (+ members)                                     -> crm_segments (static lists)
 *   campaigns   crm_marketing_campaigns                                             -> crm_campaigns_unified (archived history)
 * Each moved row records its origin in metadata.legacy_ref, so re-running moves nothing twice. Also
 * creates crm_campaign_recipients (per-recipient campaign progress for Engage). Runs as the owner:
 *
 *   docker compose run --rm --no-deps -v /mnt/medstar/secrets/owner-password:/run/bootstrap/owner-password:ro \
 *     api node installations/crm/consolidate-engagement.mjs */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

process.env.POSTGRES_USER = 'medstar_owner';
process.env.POSTGRES_PASSWORD = readFileSync(process.env.CRM_OWNER_PASSWORD_FILE || '/run/bootstrap/owner-password', 'utf8').trim();
if (process.env.CRM_TENANT_UID !== 'H98VG4') throw new Error('Wrong installation');
const TENANT = Number(process.env.CRM_TENANT_ID);
const { default: pool } = await import('../../db/pgPool.js');

const out = {};
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query(`
    CREATE TABLE IF NOT EXISTS crm_campaign_recipients (
      id BIGSERIAL PRIMARY KEY,
      tenant_id BIGINT NOT NULL,
      campaign_id BIGINT NOT NULL REFERENCES crm_campaigns_unified(id) ON DELETE CASCADE,
      lead_id BIGINT NOT NULL,
      status VARCHAR(20) NOT NULL CHECK (status IN ('sent','failed','skipped')),
      reason TEXT,
      event_id BIGINT,
      sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (campaign_id, lead_id)
    );
    CREATE INDEX IF NOT EXISTS crm_campaign_recipients_tenant ON crm_campaign_recipients (tenant_id, campaign_id, status);
    GRANT SELECT, INSERT, UPDATE, DELETE ON crm_campaign_recipients TO medstar_app;
    GRANT USAGE, SELECT ON SEQUENCE crm_campaign_recipients_id_seq TO medstar_app;`);

  const owner = (await client.query(`SELECT id FROM users WHERE tenant_id = $1 AND status = 'active' ORDER BY "isAdmin" DESC, id LIMIT 1`, [TENANT])).rows[0]?.id || null;
  const moved = async (ref) => (await client.query(`SELECT 1 FROM crm_communication_templates WHERE tenant_id = $1 AND metadata->>'legacy_ref' = $2`, [TENANT, ref])).rows.length > 0;

  let n = 0;
  for (const t of (await client.query(`SELECT * FROM crm_marketing_templates`)).rows) {
    const ref = `crm_marketing_templates:${t.id}`; if (await moved(ref)) continue;
    await client.query(`INSERT INTO crm_communication_templates (tenant_id, name, channel, category, subject, body, status, created_by, metadata)
      VALUES ($1, $2, 'email', $3, $4, $5, 'approved', $6, jsonb_build_object('legacy_ref', $7::text, 'html', $8::text))`,
      [TENANT, t.name, t.category || 'marketing', t.subject, t.text_content || t.html_content || '', owner, ref, t.html_content]); n += 1;
  }
  for (const t of (await client.query(`SELECT * FROM crm_email_templates`)).rows) {
    const ref = `crm_email_templates:${t.id}`; if (await moved(ref)) continue;
    await client.query(`INSERT INTO crm_communication_templates (tenant_id, name, channel, category, subject, body, status, created_by, metadata)
      VALUES ($1, $2, 'email', $3, $4, $5, 'approved', $6, jsonb_build_object('legacy_ref', $7::text))`,
      [TENANT, t.name, t.category || 'utility', t.subject, t.body || '', t.crm_user_id || owner, ref]); n += 1;
  }
  for (const t of (await client.query(`SELECT * FROM crm_whatsapp_templates`)).rows) {
    const ref = `crm_whatsapp_templates:${t.id}`; if (await moved(ref)) continue;
    // BrightBean drafts carry Meta components, not a reviewed Gupshup template: brought in as drafts to resubmit.
    const body = (Array.isArray(t.components) ? t.components : []).find((c) => String(c.type).toUpperCase() === 'BODY')?.text || '';
    await client.query(`INSERT INTO crm_communication_templates (tenant_id, name, channel, category, body, status, language_code, created_by, metadata)
      VALUES ($1, $2, 'whatsapp', $3, $4, 'draft', $5, $6, jsonb_build_object('legacy_ref', $7::text, 'needs_resubmit', true))`,
      [TENANT, t.name, String(t.category || 'utility').toLowerCase(), body, t.language || 'en', owner, ref]); n += 1;
  }
  out.templates_moved = n;

  n = 0;
  for (const list of (await client.query(`SELECT * FROM crm_marketing_lists`)).rows) {
    const ref = `crm_marketing_lists:${list.id}`;
    if ((await client.query(`SELECT 1 FROM crm_segments WHERE tenant_id = $1 AND filter_definition->>'legacy_ref' = $2`, [TENANT, ref])).rows.length) continue;
    const { rows: members } = await client.query(
      `SELECT DISTINCT lv.id FROM crm_marketing_list_members m JOIN crm_leads_v2 lv ON lv.tenant_id = $1 AND lv.legacy_lead_id = m.lead_id WHERE m.list_id = $2`, [TENANT, list.id]);
    const ids = members.map((r) => Number(r.id));
    const { rows: [seg] } = await client.query(
      `INSERT INTO crm_segments (tenant_id, name, description, filter_definition, created_by, member_count, last_refreshed_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, now())
       ON CONFLICT (tenant_id, name) DO UPDATE SET name = crm_segments.name || ' (list)' RETURNING id`,
      [TENANT, list.name, list.description, JSON.stringify({ type: 'static', lead_ids: ids, legacy_ref: ref }), owner, ids.length]);
    for (const id of ids) await client.query(`INSERT INTO crm_segment_members (tenant_id, segment_id, lead_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [TENANT, seg.id, id]);
    n += 1;
  }
  out.lists_moved = n;

  n = 0;
  for (const c of (await client.query(`SELECT * FROM crm_marketing_campaigns`)).rows) {
    const ref = `crm_marketing_campaigns:${c.id}`;
    if ((await client.query(`SELECT 1 FROM crm_campaigns_unified WHERE tenant_id = $1 AND legacy_email_campaign_id = $2`, [TENANT, c.id])).rows.length) continue;
    await client.query(
      `INSERT INTO crm_campaigns_unified (tenant_id, channel, platform, external_campaign_id, name, description, lifecycle_status, starts_at, legacy_email_campaign_id, metadata, created_by)
       VALUES ($1, 'email', 'legacy-email', $2, $3, $4, 'archived', $5, $6, $7::jsonb, $8)`,
      [TENANT, randomUUID(), c.name, c.description, c.scheduled_at, c.id, JSON.stringify({ legacy_ref: ref, subject: c.subject, recipient_count: c.recipient_count, sent_at: c.sent_at }), c.created_by || owner]);
    n += 1;
  }
  out.campaigns_moved = n;
  await client.query('COMMIT');
  console.log(JSON.stringify({ ok: true, ...out }));
} catch (error) { await client.query('ROLLBACK').catch(() => {}); console.error(error.message); process.exitCode = 1; }
finally { client.release(); await pool.end(); }
