/**
 * CRM agent tool registry — WS-A Phase A1 (read-only).
 *
 * Each tool is a validated, tenant-scoped wrapper over mediqzy's existing CRM data (the v2
 * tenant-scoped tables crm_leads_v2 / crm_contacts_v2). A1 is deliberately READ-ONLY: no writes,
 * and NO clinical tools — this agent operates the administrative CRM only, never diagnosis, triage
 * or treatment (SaMD fence, per docs/architecture/CRM_COMMS_HUB_UPGRADE_PLAN.md).
 *
 * Pattern inspired by AgenticCRM (MIT); the schema, queries and tenant-scoping are mediqzy's own.
 *
 * A tool = { description, parameters (JSON-schema), capability (CRM RBAC), handler(args, ctx) }.
 * ctx = { pool, tenantUid, tenantId, crmUser }. Every handler MUST scope by tenantUid (the unambiguous
 * entity uid — NOT the ambiguous integer tenantId) and `deleted_at IS NULL`.
 * Handlers return a plain object (JSON-serialised into the tool result fed back to the model).
 */

const clampLimit = (n, def = 10, max = 50) => {
  const v = Number.parseInt(n, 10);
  if (!Number.isFinite(v) || v < 1) return def;
  return Math.min(v, max);
};

// Valid values enforced by the crm_leads_v2 CHECK constraints — validated here so a bad write is
// rejected before it reaches the DB (and so the model gets a clear error it can correct).
const VALID_STATUSES = ['open', 'paused', 'converted', 'closed', 'merged'];
const VALID_STAGES = ['new', 'attempting_contact', 'contacted', 'qualified', 'appointment_requested',
  'appointment_booked', 'appointment_confirmed', 'visited', 'consulted', 'investigation_advised',
  'procedure_advised', 'admission_advised', 'billing_completed', 'won', 'lost', 'dormant', 'nurture', 'duplicate'];

async function fetchLead(pool, tenantUid, id) {
  const { rows } = await pool.query(
    `SELECT l.id, c.name AS contact_name, l.status, l.lifecycle_stage, l.owner_user_id
       FROM crm_leads_v2 l LEFT JOIN crm_contacts_v2 c ON c.id = l.contact_id
      WHERE l.tenant_uid = $1 AND l.id = $2 AND l.deleted_at IS NULL`, [tenantUid, id]);
  return rows[0] || null;
}

const LEAD_SELECT = `
  SELECT l.id, l.lead_number, c.name AS contact_name, c.phone_e164, c.email,
         l.status, l.lifecycle_stage, l.priority, l.score, l.service_line, l.inquiry_type,
         l.next_action, l.next_action_at, l.expected_value, l.owner_user_id, l.created_at
    FROM crm_leads_v2 l
    LEFT JOIN crm_contacts_v2 c ON c.id = l.contact_id`;

export const TOOLS = Object.freeze({
  search_leads: {
    description: 'Search this CRM tenant\'s leads by contact name, phone or email, optionally filtered by status. Read-only.',
    capability: 'foundation:read',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Name, phone or email fragment to match (optional).' },
        status: { type: 'string', description: 'Filter by lead status, e.g. "open" (optional).' },
        limit: { type: 'integer', description: 'Max rows (default 10, max 50).' },
      },
    },
    async handler(args, { pool, tenantUid }) {
      const params = [tenantUid];
      const where = ['l.tenant_uid = $1', 'l.deleted_at IS NULL'];
      if (args.query && String(args.query).trim()) {
        params.push(`%${String(args.query).trim()}%`);
        where.push(`(c.name ILIKE $${params.length} OR c.full_name ILIKE $${params.length} OR c.phone_e164 ILIKE $${params.length} OR c.email ILIKE $${params.length})`);
      }
      if (args.status && String(args.status).trim()) {
        params.push(String(args.status).trim());
        where.push(`l.status = $${params.length}`);
      }
      const limit = clampLimit(args.limit);
      const { rows } = await pool.query(`${LEAD_SELECT} WHERE ${where.join(' AND ')} ORDER BY l.created_at DESC LIMIT ${limit}`, params);
      return { count: rows.length, leads: rows };
    },
  },

  get_lead: {
    description: 'Fetch one lead by its numeric id, with the linked contact. Read-only; tenant-scoped.',
    capability: 'foundation:read',
    parameters: {
      type: 'object',
      properties: { id: { type: 'integer', description: 'The lead id.' } },
      required: ['id'],
    },
    async handler(args, { pool, tenantUid }) {
      const id = Number.parseInt(args.id, 10);
      if (!Number.isFinite(id)) return { error: 'invalid_id' };
      const { rows } = await pool.query(`${LEAD_SELECT} WHERE l.tenant_uid = $1 AND l.id = $2 AND l.deleted_at IS NULL`, [tenantUid, id]);
      if (!rows[0]) return { error: 'not_found' };
      return { lead: rows[0] };
    },
  },

  list_recent_leads: {
    description: 'List the most recently created leads for this tenant. Read-only.',
    capability: 'foundation:read',
    parameters: {
      type: 'object',
      properties: { limit: { type: 'integer', description: 'Max rows (default 10, max 50).' } },
    },
    async handler(args, { pool, tenantUid }) {
      const limit = clampLimit(args.limit);
      const { rows } = await pool.query(
        `${LEAD_SELECT} WHERE l.tenant_uid = $1 AND l.deleted_at IS NULL ORDER BY l.created_at DESC LIMIT ${limit}`, [tenantUid]);
      return { count: rows.length, leads: rows };
    },
  },

  search_contacts: {
    description: 'Search this tenant\'s CRM contacts by name, email or phone. Read-only.',
    capability: 'foundation:read',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Name, email or phone fragment to match.' },
        limit: { type: 'integer', description: 'Max rows (default 10, max 50).' },
      },
      required: ['query'],
    },
    async handler(args, { pool, tenantUid }) {
      const q = String(args.query || '').trim();
      if (!q) return { error: 'query_required' };
      const limit = clampLimit(args.limit);
      const { rows } = await pool.query(
        `SELECT id, name, full_name, email, phone_e164, company, designation, city, preferred_channel, created_at
           FROM crm_contacts_v2
          WHERE tenant_uid = $1 AND deleted_at IS NULL
            AND (name ILIKE $2 OR full_name ILIKE $2 OR email ILIKE $2 OR phone_e164 ILIKE $2)
          ORDER BY created_at DESC LIMIT ${limit}`, [tenantUid, `%${q}%`]);
      return { count: rows.length, contacts: rows };
    },
  },

  lead_pipeline_summary: {
    description: 'Summarise this tenant\'s lead pipeline: counts by lifecycle stage and by status. Read-only.',
    capability: 'foundation:read',
    parameters: { type: 'object', properties: {} },
    async handler(_args, { pool, tenantUid }) {
      const byStage = await pool.query(
        `SELECT lifecycle_stage, COUNT(*)::int AS n FROM crm_leads_v2
          WHERE tenant_uid = $1 AND deleted_at IS NULL GROUP BY lifecycle_stage ORDER BY n DESC`, [tenantUid]);
      const byStatus = await pool.query(
        `SELECT status, COUNT(*)::int AS n FROM crm_leads_v2
          WHERE tenant_uid = $1 AND deleted_at IS NULL GROUP BY status ORDER BY n DESC`, [tenantUid]);
      const total = byStage.rows.reduce((s, r) => s + r.n, 0);
      return { total, byStage: byStage.rows, byStatus: byStatus.rows };
    },
  },

  // ── Write tools (WS-A Phase A2) ──────────────────────────────────────────────
  // Each write tool is `write: true` and splits into preview(args, ctx) and apply(args, ctx).
  // The agent loop may ONLY call preview (it stages a proposal, never mutating). Mutation happens
  // exclusively through applyCrmAgentAction() after an explicit human confirmation — see agent-runner.js.
  // NOTE: add_lead_note is intentionally NOT shipped in A2: crm_activities has no tenant_id column,
  // so a tenant-safe note write needs the activity-table scoping decision resolved first.

  assign_lead: {
    write: true,
    description: 'Assign a lead to a CRM user (owner). Proposes the change; it is applied only after the user explicitly confirms.',
    capability: 'foundation:write',
    parameters: {
      type: 'object',
      properties: {
        leadId: { type: 'integer', description: 'The lead id.' },
        ownerUserId: { type: 'integer', description: 'The users.id to set as the lead owner.' },
      },
      required: ['leadId', 'ownerUserId'],
    },
    async preview(args, { pool, tenantUid }) {
      const id = Number.parseInt(args.leadId, 10);
      const owner = Number.parseInt(args.ownerUserId, 10);
      if (!Number.isFinite(id) || !Number.isFinite(owner)) return { error: 'invalid_args' };
      const lead = await fetchLead(pool, tenantUid, id);
      if (!lead) return { error: 'not_found' };
      return {
        ok: true, action: 'assign_lead', requiresConfirmation: true,
        summary: `Assign lead #${id} (${lead.contact_name || '—'}) to user ${owner}`,
        current: { owner_user_id: lead.owner_user_id }, proposed: { owner_user_id: owner },
      };
    },
    async apply(args, { pool, tenantUid }) {
      const id = Number.parseInt(args.leadId, 10);
      const owner = Number.parseInt(args.ownerUserId, 10);
      if (!Number.isFinite(id) || !Number.isFinite(owner)) return { error: 'invalid_args' };
      const { rows } = await pool.query(
        `UPDATE crm_leads_v2 SET owner_user_id = $3, assigned_at = NOW(), updated_at = NOW()
          WHERE tenant_uid = $1 AND id = $2 AND deleted_at IS NULL RETURNING id, owner_user_id, assigned_at`,
        [tenantUid, id, owner]);
      if (!rows[0]) return { error: 'not_found' };
      return { applied: true, lead: rows[0] };
    },
  },

  update_lead_status: {
    write: true,
    description: `Change a lead's status. Allowed: ${VALID_STATUSES.join(', ')}. Proposes the change; applied only after confirmation.`,
    capability: 'foundation:write',
    parameters: {
      type: 'object',
      properties: {
        leadId: { type: 'integer', description: 'The lead id.' },
        status: { type: 'string', enum: VALID_STATUSES, description: 'New status.' },
      },
      required: ['leadId', 'status'],
    },
    async preview(args, { pool, tenantUid }) {
      const id = Number.parseInt(args.leadId, 10);
      const status = String(args.status || '').trim();
      if (!Number.isFinite(id)) return { error: 'invalid_args' };
      if (!VALID_STATUSES.includes(status)) return { error: 'invalid_status', allowed: VALID_STATUSES };
      const lead = await fetchLead(pool, tenantUid, id);
      if (!lead) return { error: 'not_found' };
      return {
        ok: true, action: 'update_lead_status', requiresConfirmation: true,
        summary: `Change lead #${id} (${lead.contact_name || '—'}) status: ${lead.status} → ${status}`,
        current: { status: lead.status }, proposed: { status },
      };
    },
    async apply(args, { pool, tenantUid }) {
      const id = Number.parseInt(args.leadId, 10);
      const status = String(args.status || '').trim();
      if (!Number.isFinite(id)) return { error: 'invalid_args' };
      if (!VALID_STATUSES.includes(status)) return { error: 'invalid_status', allowed: VALID_STATUSES };
      const { rows } = await pool.query(
        `UPDATE crm_leads_v2 SET status = $3, updated_at = NOW()
          WHERE tenant_uid = $1 AND id = $2 AND deleted_at IS NULL RETURNING id, status`,
        [tenantUid, id, status]);
      if (!rows[0]) return { error: 'not_found' };
      return { applied: true, lead: rows[0] };
    },
  },

  update_lead_stage: {
    write: true,
    description: `Move a lead to a new lifecycle stage. Allowed: ${VALID_STAGES.join(', ')}. Proposes the change; applied only after confirmation.`,
    capability: 'foundation:write',
    parameters: {
      type: 'object',
      properties: {
        leadId: { type: 'integer', description: 'The lead id.' },
        stage: { type: 'string', enum: VALID_STAGES, description: 'New lifecycle stage.' },
      },
      required: ['leadId', 'stage'],
    },
    async preview(args, { pool, tenantUid }) {
      const id = Number.parseInt(args.leadId, 10);
      const stage = String(args.stage || '').trim();
      if (!Number.isFinite(id)) return { error: 'invalid_args' };
      if (!VALID_STAGES.includes(stage)) return { error: 'invalid_stage', allowed: VALID_STAGES };
      const lead = await fetchLead(pool, tenantUid, id);
      if (!lead) return { error: 'not_found' };
      return {
        ok: true, action: 'update_lead_stage', requiresConfirmation: true,
        summary: `Move lead #${id} (${lead.contact_name || '—'}) stage: ${lead.lifecycle_stage} → ${stage}`,
        current: { lifecycle_stage: lead.lifecycle_stage }, proposed: { lifecycle_stage: stage },
      };
    },
    async apply(args, { pool, tenantUid }) {
      const id = Number.parseInt(args.leadId, 10);
      const stage = String(args.stage || '').trim();
      if (!Number.isFinite(id)) return { error: 'invalid_args' };
      if (!VALID_STAGES.includes(stage)) return { error: 'invalid_stage', allowed: VALID_STAGES };
      const { rows } = await pool.query(
        `UPDATE crm_leads_v2 SET lifecycle_stage = $3, updated_at = NOW()
          WHERE tenant_uid = $1 AND id = $2 AND deleted_at IS NULL RETURNING id, lifecycle_stage`,
        [tenantUid, id, stage]);
      if (!rows[0]) return { error: 'not_found' };
      return { applied: true, lead: rows[0] };
    },
  },
});

/** OpenAI-format tool definitions for the model, derived from the registry. */
export function toolDefinitions() {
  return Object.entries(TOOLS).map(([name, t]) => ({
    type: 'function',
    function: { name, description: t.description, parameters: t.parameters },
  }));
}
