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

const corporateClause = (alias, params, corporateUid) => {
  if (corporateUid === null || corporateUid === undefined || corporateUid === '') return '';
  params.push(corporateUid);
  return ` AND ${alias}.corporate_uid = $${params.length}`;
};

const actorId = (crmUser) => {
  const id = Number.parseInt(crmUser?.id, 10);
  return Number.isFinite(id) ? id : null;
};

const sensitiveMemoryKey = (key) => /patient|phone|email|mrn|dob|address|clinical|diagnos|prescri|password|secret|token/i.test(String(key || ''));

async function fetchLead(pool, tenantUid, id, corporateUid) {
  const params = [tenantUid, id];
  const { rows } = await pool.query(
    `SELECT l.id, c.name AS contact_name, l.status, l.lifecycle_stage, l.owner_user_id
       FROM crm_leads_v2 l LEFT JOIN crm_contacts_v2 c ON c.id = l.contact_id
      WHERE l.tenant_uid = $1 AND l.id = $2 AND l.deleted_at IS NULL${corporateClause('l', params, corporateUid)}`, params);
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
    async handler(args, { pool, tenantUid, corporateUid }) {
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
      const corp = corporateClause('l', params, corporateUid);
      const limit = clampLimit(args.limit);
      const { rows } = await pool.query(`${LEAD_SELECT} WHERE ${where.join(' AND ')}${corp} ORDER BY l.created_at DESC LIMIT ${limit}`, params);
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
    async handler(args, { pool, tenantUid, corporateUid }) {
      const id = Number.parseInt(args.id, 10);
      if (!Number.isFinite(id)) return { error: 'invalid_id' };
      const params = [tenantUid, id];
      const { rows } = await pool.query(`${LEAD_SELECT} WHERE l.tenant_uid = $1 AND l.id = $2 AND l.deleted_at IS NULL${corporateClause('l', params, corporateUid)}`, params);
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
    async handler(args, { pool, tenantUid, corporateUid }) {
      const limit = clampLimit(args.limit);
      const params = [tenantUid];
      const { rows } = await pool.query(
        `${LEAD_SELECT} WHERE l.tenant_uid = $1 AND l.deleted_at IS NULL${corporateClause('l', params, corporateUid)} ORDER BY l.created_at DESC LIMIT ${limit}`, params);
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
    async handler(args, { pool, tenantUid, corporateUid }) {
      const q = String(args.query || '').trim();
      if (!q) return { error: 'query_required' };
      const limit = clampLimit(args.limit);
      const params = [tenantUid, `%${q}%`];
      const { rows } = await pool.query(
        `SELECT id, name, full_name, email, phone_e164, company, designation, city, preferred_channel, created_at
           FROM crm_contacts_v2
          WHERE tenant_uid = $1 AND deleted_at IS NULL
            AND (name ILIKE $2 OR full_name ILIKE $2 OR email ILIKE $2 OR phone_e164 ILIKE $2)${corporateClause('crm_contacts_v2', params, corporateUid)}
          ORDER BY created_at DESC LIMIT ${limit}`, params);
      return { count: rows.length, contacts: rows };
    },
  },

  lead_pipeline_summary: {
    description: 'Summarise this tenant\'s lead pipeline: counts by lifecycle stage and by status. Read-only.',
    capability: 'foundation:read',
    parameters: { type: 'object', properties: {} },
    async handler(_args, { pool, tenantUid, corporateUid }) {
      const params = [tenantUid];
      const corp = corporateClause('crm_leads_v2', params, corporateUid);
      const byStage = await pool.query(
        `SELECT lifecycle_stage, COUNT(*)::int AS n FROM crm_leads_v2
          WHERE tenant_uid = $1 AND deleted_at IS NULL${corp} GROUP BY lifecycle_stage ORDER BY n DESC`, params);
      const byStatus = await pool.query(
        `SELECT status, COUNT(*)::int AS n FROM crm_leads_v2
          WHERE tenant_uid = $1 AND deleted_at IS NULL${corp} GROUP BY status ORDER BY n DESC`, params);
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
    async preview(args, { pool, tenantUid, corporateUid }) {
      const id = Number.parseInt(args.leadId, 10);
      const owner = Number.parseInt(args.ownerUserId, 10);
      if (!Number.isFinite(id) || !Number.isFinite(owner)) return { error: 'invalid_args' };
      const lead = await fetchLead(pool, tenantUid, id, corporateUid);
      if (!lead) return { error: 'not_found' };
      return {
        ok: true, action: 'assign_lead', requiresConfirmation: true,
        summary: `Assign lead #${id} (${lead.contact_name || '—'}) to user ${owner}`,
        current: { owner_user_id: lead.owner_user_id }, proposed: { owner_user_id: owner },
      };
    },
    async apply(args, { pool, tenantUid, corporateUid }) {
      const id = Number.parseInt(args.leadId, 10);
      const owner = Number.parseInt(args.ownerUserId, 10);
      if (!Number.isFinite(id) || !Number.isFinite(owner)) return { error: 'invalid_args' };
      const params = [tenantUid, id, owner];
      const { rows } = await pool.query(
        `UPDATE crm_leads_v2 SET owner_user_id = $3, assigned_at = NOW(), updated_at = NOW()
          WHERE tenant_uid = $1 AND id = $2 AND deleted_at IS NULL${corporateClause('crm_leads_v2', params, corporateUid)} RETURNING id, owner_user_id, assigned_at`, params);
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
    async preview(args, { pool, tenantUid, corporateUid }) {
      const id = Number.parseInt(args.leadId, 10);
      const status = String(args.status || '').trim();
      if (!Number.isFinite(id)) return { error: 'invalid_args' };
      if (!VALID_STATUSES.includes(status)) return { error: 'invalid_status', allowed: VALID_STATUSES };
      const lead = await fetchLead(pool, tenantUid, id, corporateUid);
      if (!lead) return { error: 'not_found' };
      return {
        ok: true, action: 'update_lead_status', requiresConfirmation: true,
        summary: `Change lead #${id} (${lead.contact_name || '—'}) status: ${lead.status} → ${status}`,
        current: { status: lead.status }, proposed: { status },
      };
    },
    async apply(args, { pool, tenantUid, corporateUid }) {
      const id = Number.parseInt(args.leadId, 10);
      const status = String(args.status || '').trim();
      if (!Number.isFinite(id)) return { error: 'invalid_args' };
      if (!VALID_STATUSES.includes(status)) return { error: 'invalid_status', allowed: VALID_STATUSES };
      const params = [tenantUid, id, status];
      const { rows } = await pool.query(
        `UPDATE crm_leads_v2 SET status = $3, updated_at = NOW()
          WHERE tenant_uid = $1 AND id = $2 AND deleted_at IS NULL${corporateClause('crm_leads_v2', params, corporateUid)} RETURNING id, status`, params);
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
    async preview(args, { pool, tenantUid, corporateUid }) {
      const id = Number.parseInt(args.leadId, 10);
      const stage = String(args.stage || '').trim();
      if (!Number.isFinite(id)) return { error: 'invalid_args' };
      if (!VALID_STAGES.includes(stage)) return { error: 'invalid_stage', allowed: VALID_STAGES };
      const lead = await fetchLead(pool, tenantUid, id, corporateUid);
      if (!lead) return { error: 'not_found' };
      return {
        ok: true, action: 'update_lead_stage', requiresConfirmation: true,
        summary: `Move lead #${id} (${lead.contact_name || '—'}) stage: ${lead.lifecycle_stage} → ${stage}`,
        current: { lifecycle_stage: lead.lifecycle_stage }, proposed: { lifecycle_stage: stage },
      };
    },
    async apply(args, { pool, tenantUid, corporateUid }) {
      const id = Number.parseInt(args.leadId, 10);
      const stage = String(args.stage || '').trim();
      if (!Number.isFinite(id)) return { error: 'invalid_args' };
      if (!VALID_STAGES.includes(stage)) return { error: 'invalid_stage', allowed: VALID_STAGES };
      const params = [tenantUid, id, stage];
      const { rows } = await pool.query(
        `UPDATE crm_leads_v2 SET lifecycle_stage = $3, updated_at = NOW()
          WHERE tenant_uid = $1 AND id = $2 AND deleted_at IS NULL${corporateClause('crm_leads_v2', params, corporateUid)} RETURNING id, lifecycle_stage`, params);
      if (!rows[0]) return { error: 'not_found' };
      return { applied: true, lead: rows[0] };
    },
  },

  create_lead: {
    write: true,
    description: 'Create an administrative CRM lead and its contact. Proposes the change; applied only after confirmation.',
    capability: 'foundation:write',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' },
        company: { type: 'string' }, status: { type: 'string', enum: VALID_STATUSES },
      }, required: ['name'],
    },
    async preview(args) {
      const name = String(args.name || '').trim();
      if (!name) return { error: 'name_required' };
      return { ok: true, action: 'create_lead', requiresConfirmation: true, summary: `Create lead for ${name}`, proposed: { name } };
    },
    async apply(args, { pool, tenantUid, corporateUid, crmUser }) {
      const name = String(args.name || '').trim();
      if (!name) return { error: 'name_required' };
      const actor = actorId(crmUser);
      const contact = await pool.query(
        `INSERT INTO crm_contacts_v2 (tenant_uid, corporate_uid, name, full_name, email, phone_e164, company, created_by)
         VALUES ($1,$2,$3,$3,$4,$5,$6,$7) RETURNING id, name`,
        [tenantUid, corporateUid || null, name, args.email || null, args.phone || null, args.company || null, actor]);
      const lead = await pool.query(
        `INSERT INTO crm_leads_v2 (tenant_uid, corporate_uid, contact_id, status, lifecycle_stage, priority, owner_user_id, created_by)
         VALUES ($1,$2,$3,$4,'new',$5,$6,$7) RETURNING id, contact_id, status, lifecycle_stage`,
        [tenantUid, corporateUid || null, contact.rows[0]?.id, args.status || 'open', args.priority || 'medium', args.ownerUserId || null, actor]);
      return { applied: true, lead: lead.rows[0], contact: contact.rows[0] };
    },
  },

  search_deals: {
    description: 'Search this tenant\'s administrative CRM deals by title, company or stage. Read-only.',
    capability: 'foundation:read',
    parameters: { type: 'object', properties: { query: { type: 'string' }, stage: { type: 'string' }, limit: { type: 'integer' } } },
    async handler(args, { pool, tenantUid, corporateUid }) {
      const params = [tenantUid]; const where = ['tenant_uid = $1'];
      if (args.query) { params.push(`%${String(args.query).trim()}%`); where.push(`(title ILIKE $${params.length} OR company ILIKE $${params.length})`); }
      if (args.stage) { params.push(String(args.stage)); where.push(`stage = $${params.length}`); }
      const corp = corporateClause('crm_deals', params, corporateUid);
      const { rows } = await pool.query(`SELECT id,title,lead_id,value,currency,stage,probability,expected_close,assigned_to,company,updated_at FROM crm_deals WHERE ${where.join(' AND ')}${corp} ORDER BY updated_at DESC LIMIT ${clampLimit(args.limit)}`, params);
      return { count: rows.length, deals: rows };
    },
  },

  get_deal: {
    description: 'Fetch one administrative CRM deal by id. Read-only; tenant-scoped.',
    capability: 'foundation:read',
    parameters: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
    async handler(args, { pool, tenantUid, corporateUid }) {
      const id = Number.parseInt(args.id, 10); if (!Number.isFinite(id)) return { error: 'invalid_id' };
      const params = [tenantUid, id];
      const { rows } = await pool.query(`SELECT * FROM crm_deals WHERE tenant_uid=$1 AND id=$2${corporateClause('crm_deals', params, corporateUid)}`, params);
      return rows[0] ? { deal: rows[0] } : { error: 'not_found' };
    },
  },

  create_task: {
    write: true,
    description: 'Create a CRM follow-up task for a lead. Proposes the change; applied only after confirmation.',
    capability: 'foundation:write',
    parameters: { type: 'object', properties: { leadId: { type: 'integer' }, title: { type: 'string' }, priority: { type: 'string' }, dueAt: { type: 'string' } }, required: ['leadId', 'title'] },
    async preview(args, { pool, tenantUid, corporateUid }) {
      const leadId = Number.parseInt(args.leadId, 10); const title = String(args.title || '').trim();
      if (!Number.isFinite(leadId) || !title) return { error: 'invalid_args' };
      if (!(await fetchLead(pool, tenantUid, leadId, corporateUid))) return { error: 'not_found' };
      return { ok: true, action: 'create_task', requiresConfirmation: true, summary: `Create follow-up task for lead #${leadId}: ${title}`, proposed: { leadId, title } };
    },
    async apply(args, { pool, tenantUid, corporateUid, crmUser }) {
      const leadId = Number.parseInt(args.leadId, 10); const title = String(args.title || '').trim();
      if (!Number.isFinite(leadId) || !title) return { error: 'invalid_args' };
      const params = [tenantUid, corporateUid || null, leadId, args.taskType || 'follow_up', title, args.description || null, args.priority || 'medium', args.assignedToUserId || null, args.dueAt || null, actorId(crmUser)];
      const { rows } = await pool.query(
        `INSERT INTO crm_tasks (tenant_uid, corporate_uid, lead_id, task_type, title, description, priority, assigned_to_user_id, due_at, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, params);
      return { applied: true, task: rows[0] };
    },
  },

  add_lead_note: {
    write: true,
    description: 'Add a non-clinical administrative note to a CRM lead. Proposes the change; applied only after confirmation.',
    capability: 'foundation:write',
    parameters: { type: 'object', properties: { leadId: { type: 'integer' }, note: { type: 'string' } }, required: ['leadId', 'note'] },
    async preview(args, { pool, tenantUid, corporateUid }) {
      const leadId = Number.parseInt(args.leadId, 10); const note = String(args.note || '').trim();
      if (!Number.isFinite(leadId) || !note) return { error: 'invalid_args' };
      if (!(await fetchLead(pool, tenantUid, leadId, corporateUid))) return { error: 'not_found' };
      return { ok: true, action: 'add_lead_note', requiresConfirmation: true, summary: `Add a note to lead #${leadId}`, proposed: { leadId, note } };
    },
    async apply(args, { pool, tenantUid, corporateUid, crmUser }) {
      const leadId = Number.parseInt(args.leadId, 10); const note = String(args.note || '').trim();
      if (!Number.isFinite(leadId) || !note) return { error: 'invalid_args' };
      const { rows } = await pool.query(
        `INSERT INTO crm_activities (tenant_uid, corporate_uid, type, title, description, lead_id, created_by)
         VALUES ($1,$2,'note','CRM note',$3,$4,$5) RETURNING id, lead_id, description, created_at`,
        [tenantUid, corporateUid || null, note, leadId, actorId(crmUser)]);
      return { applied: true, activity: rows[0] };
    },
  },

  update_deal_stage: {
    write: true,
    description: 'Move an administrative CRM deal to another stage. Proposes the change; applied only after confirmation.',
    capability: 'foundation:write',
    parameters: { type: 'object', properties: { dealId: { type: 'integer' }, stage: { type: 'string' } }, required: ['dealId', 'stage'] },
    async preview(args, { pool, tenantUid, corporateUid }) {
      const dealId = Number.parseInt(args.dealId, 10); const stage = String(args.stage || '').trim();
      if (!Number.isFinite(dealId) || !stage) return { error: 'invalid_args' };
      const params = [tenantUid, dealId];
      const { rows } = await pool.query(`SELECT id,title,stage FROM crm_deals WHERE tenant_uid=$1 AND id=$2${corporateClause('crm_deals', params, corporateUid)}`, params);
      if (!rows[0]) return { error: 'not_found' };
      return { ok: true, action: 'update_deal_stage', requiresConfirmation: true, summary: `Move deal #${dealId} to ${stage}`, current: { stage: rows[0].stage }, proposed: { stage } };
    },
    async apply(args, { pool, tenantUid, corporateUid }) {
      const dealId = Number.parseInt(args.dealId, 10); const stage = String(args.stage || '').trim();
      if (!Number.isFinite(dealId) || !stage) return { error: 'invalid_args' };
      const params = [tenantUid, dealId, stage];
      const { rows } = await pool.query(`UPDATE crm_deals SET stage=$3, updated_at=NOW() WHERE tenant_uid=$1 AND id=$2${corporateClause('crm_deals', params, corporateUid)} RETURNING id,stage`, params);
      return rows[0] ? { applied: true, deal: rows[0] } : { error: 'not_found' };
    },
  },

  get_conversation_history: {
    description: 'Read the administrative CRM message history for one conversation. No clinical interpretation.',
    capability: 'foundation:read',
    parameters: { type: 'object', properties: { conversationId: { type: 'integer' }, leadId: { type: 'integer' }, limit: { type: 'integer' } } },
    async handler(args, { pool, tenantUid, corporateUid }) {
      const conversationId = Number.parseInt(args.conversationId, 10);
      const leadId = Number.parseInt(args.leadId, 10);
      const params = [tenantUid]; const where = ['e.tenant_uid=$1'];
      if (Number.isFinite(conversationId)) { params.push(conversationId); where.push(`e.conversation_id=$${params.length}`); }
      if (Number.isFinite(leadId)) { params.push(leadId); where.push(`e.lead_id=$${params.length}`); }
      if (corporateUid) { params.push(corporateUid); where.push(`e.corporate_uid=$${params.length}`); }
      const { rows } = await pool.query(`SELECT e.id,e.conversation_id,e.channel,e.direction,e.message_type,e.subject,e.body_preview,e.created_at FROM crm_communication_events e WHERE ${where.join(' AND ')} ORDER BY e.created_at ASC LIMIT ${clampLimit(args.limit, 50, 200)}`, params);
      return { count: rows.length, events: rows };
    },
  },

  escalate_to_human: {
    write: true,
    description: 'Escalate an administrative CRM conversation to a human operator. Proposes the change; applied only after confirmation.',
    capability: 'foundation:write',
    parameters: { type: 'object', properties: { conversationId: { type: 'integer' }, reason: { type: 'string' } }, required: ['conversationId', 'reason'] },
    async preview(args, { pool, tenantUid, corporateUid }) {
      const id = Number.parseInt(args.conversationId, 10); const reason = String(args.reason || '').trim();
      if (!Number.isFinite(id) || !reason) return { error: 'invalid_args' };
      const params = [tenantUid, id];
      const { rows } = await pool.query(`SELECT id,status,channel FROM crm_conversations WHERE tenant_uid=$1 AND id=$2${corporateClause('crm_conversations', params, corporateUid)}`, params);
      if (!rows[0]) return { error: 'not_found' };
      return { ok: true, action: 'escalate_to_human', requiresConfirmation: true, summary: `Escalate conversation #${id} to a human`, current: rows[0], proposed: { reason } };
    },
    async apply(args, { pool, tenantUid, corporateUid }) {
      const id = Number.parseInt(args.conversationId, 10); const params = [tenantUid, id];
      const { rows } = await pool.query(`UPDATE crm_conversations SET status='pending', updated_at=NOW() WHERE tenant_uid=$1 AND id=$2${corporateClause('crm_conversations', params, corporateUid)} RETURNING id,status`, params);
      return rows[0] ? { applied: true, conversation: rows[0] } : { error: 'not_found' };
    },
  },

  list_tasks: {
    description: 'List open administrative CRM follow-up tasks for this tenant. Read-only.',
    capability: 'foundation:read',
    parameters: { type: 'object', properties: { status: { type: 'string' }, limit: { type: 'integer' } } },
    async handler(args, { pool, tenantUid, corporateUid }) {
      const params = [tenantUid]; const where = ['tenant_uid=$1'];
      if (args.status) { params.push(String(args.status)); where.push(`status=$${params.length}`); }
      const { rows } = await pool.query(`SELECT id,lead_id,task_type,title,description,priority,status,assigned_to_user_id,due_at,created_at FROM crm_tasks WHERE ${where.join(' AND ')}${corporateClause('crm_tasks', params, corporateUid)} ORDER BY due_at NULLS LAST, created_at DESC LIMIT ${clampLimit(args.limit)}`, params);
      return { count: rows.length, tasks: rows };
    },
  },

  recall_agent_memory: {
    description: 'Recall non-sensitive workflow preferences saved for this CRM operator.',
    capability: 'foundation:read',
    parameters: { type: 'object', properties: { key: { type: 'string' }, category: { type: 'string' }, limit: { type: 'integer' } } },
    async handler(args, { pool, tenantUid, corporateUid, crmUser }) {
      const params = [tenantUid, actorId(crmUser)]; const where = ['tenant_uid=$1', 'actor_user_id=$2'];
      if (corporateUid) { params.push(corporateUid); where.push(`corporate_uid=$${params.length}`); }
      if (args.key) { params.push(String(args.key)); where.push(`memory_key=$${params.length}`); }
      if (args.category) { params.push(String(args.category)); where.push(`category=$${params.length}`); }
      const { rows } = await pool.query(`SELECT memory_key AS key,category,value,source,updated_at AS "updatedAt" FROM crm_agent_memories WHERE ${where.join(' AND ')} ORDER BY updated_at DESC LIMIT ${clampLimit(args.limit)}`, params);
      return { count: rows.length, memories: rows };
    },
  },

  remember_agent_memory: {
    write: true,
    description: 'Save a non-sensitive workflow preference for this CRM operator. Never store patient identifiers or clinical data.',
    capability: 'foundation:write',
    parameters: { type: 'object', properties: { key: { type: 'string' }, category: { type: 'string' }, value: {}, source: { type: 'string' } }, required: ['key', 'value'] },
    async preview(args) {
      if (!String(args.key || '').trim()) return { error: 'memory_key_required' };
      if (sensitiveMemoryKey(args.key)) return { error: 'sensitive_memory_key' };
      return { ok: true, action: 'remember_agent_memory', requiresConfirmation: true, summary: `Remember the workflow preference "${String(args.key).trim()}"`, proposed: { key: args.key, category: args.category || 'general' } };
    },
    async apply(args, { pool, tenantUid, corporateUid, crmUser }) {
      if (!String(args.key || '').trim()) return { error: 'memory_key_required' };
      if (sensitiveMemoryKey(args.key)) return { error: 'sensitive_memory_key' };
      const { rows } = await pool.query(
        `INSERT INTO crm_agent_memories (tenant_uid, corporate_uid, actor_user_id, memory_key, category, value, source)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
         ON CONFLICT (tenant_uid, actor_user_id, category, memory_key) DO UPDATE SET corporate_uid=EXCLUDED.corporate_uid, value=EXCLUDED.value, source=EXCLUDED.source, updated_at=NOW()
         RETURNING memory_key AS key, category, value, source`,
        [tenantUid, corporateUid || null, actorId(crmUser), String(args.key).trim(), args.category || 'general', JSON.stringify(args.value), args.source || 'agent']);
      return { applied: true, memory: rows[0] };
    },
  },

  bulk_update_lead_status: {
    write: true,
    description: 'Update the status of up to 50 administrative CRM leads. Proposes the change; applied only after confirmation.',
    capability: 'foundation:write',
    parameters: { type: 'object', properties: { leadIds: { type: 'array', items: { type: 'integer' }, maxItems: 50 }, status: { type: 'string', enum: VALID_STATUSES } }, required: ['leadIds', 'status'] },
    async preview(args, { pool, tenantUid, corporateUid }) {
      const ids = Array.isArray(args.leadIds) ? args.leadIds : [];
      if (!ids.length || ids.length > 50 || ids.some((id) => !Number.isInteger(Number(id)))) return { error: 'lead_ids_required', max: 50 };
      if (!VALID_STATUSES.includes(args.status)) return { error: 'invalid_status', allowed: VALID_STATUSES };
      const params = [tenantUid, ids.map(Number)];
      const corp = corporateUid ? ' AND corporate_uid = $3' : '';
      if (corporateUid) params.push(corporateUid);
      const { rows } = await pool.query(`SELECT id,status FROM crm_leads_v2 WHERE tenant_uid=$1 AND id=ANY($2::bigint[])${corp}`, params);
      return { ok: true, action: 'bulk_update_lead_status', requiresConfirmation: true, summary: `Update ${rows.length} lead status(es) to ${args.status}`, current: rows, proposed: { status: args.status, leadIds: ids.map(Number) } };
    },
    async apply(args, { pool, tenantUid, corporateUid }) {
      const ids = Array.isArray(args.leadIds) ? args.leadIds : [];
      if (!ids.length || ids.length > 50 || ids.some((id) => !Number.isInteger(Number(id)))) return { error: 'lead_ids_required', max: 50 };
      if (!VALID_STATUSES.includes(args.status)) return { error: 'invalid_status', allowed: VALID_STATUSES };
      const params = [tenantUid, ids.map(Number), args.status];
      const corp = corporateUid ? ' AND corporate_uid = $4' : '';
      if (corporateUid) params.push(corporateUid);
      const { rows } = await pool.query(`UPDATE crm_leads_v2 SET status=$3, updated_at=NOW() WHERE tenant_uid=$1 AND id=ANY($2::bigint[])${corp} RETURNING id,status`, params);
      return { applied: true, count: rows.length, leads: rows };
    },
  },

  bulk_assign_leads: {
    write: true,
    description: 'Assign up to 50 administrative CRM leads to a CRM user. Proposes the change; applied only after confirmation.',
    capability: 'foundation:write',
    parameters: { type: 'object', properties: { leadIds: { type: 'array', items: { type: 'integer' }, maxItems: 50 }, ownerUserId: { type: 'integer' } }, required: ['leadIds', 'ownerUserId'] },
    async preview(args, { pool, tenantUid, corporateUid }) {
      const ids = Array.isArray(args.leadIds) ? args.leadIds : [];
      if (!ids.length || ids.length > 50 || ids.some((id) => !Number.isInteger(Number(id))) || !Number.isInteger(Number(args.ownerUserId))) return { error: 'invalid_args', max: 50 };
      const params = [tenantUid, ids.map(Number)]; const corp = corporateUid ? ' AND corporate_uid = $3' : '';
      if (corporateUid) params.push(corporateUid);
      const { rows } = await pool.query(`SELECT id,owner_user_id FROM crm_leads_v2 WHERE tenant_uid=$1 AND id=ANY($2::bigint[])${corp}`, params);
      return { ok: true, action: 'bulk_assign_leads', requiresConfirmation: true, summary: `Assign ${rows.length} lead(s) to user ${args.ownerUserId}`, current: rows, proposed: { ownerUserId: Number(args.ownerUserId), leadIds: ids.map(Number) } };
    },
    async apply(args, { pool, tenantUid, corporateUid }) {
      const ids = Array.isArray(args.leadIds) ? args.leadIds : [];
      if (!ids.length || ids.length > 50 || ids.some((id) => !Number.isInteger(Number(id))) || !Number.isInteger(Number(args.ownerUserId))) return { error: 'invalid_args', max: 50 };
      const params = [tenantUid, ids.map(Number), Number(args.ownerUserId)]; const corp = corporateUid ? ' AND corporate_uid = $4' : '';
      if (corporateUid) params.push(corporateUid);
      const { rows } = await pool.query(`UPDATE crm_leads_v2 SET owner_user_id=$3, assigned_at=NOW(), updated_at=NOW() WHERE tenant_uid=$1 AND id=ANY($2::bigint[])${corp} RETURNING id,owner_user_id`, params);
      return { applied: true, count: rows.length, leads: rows };
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
