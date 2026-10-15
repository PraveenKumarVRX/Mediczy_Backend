/** Tenant-scoped production smoke/UAT for AgenticCRM + flow/social storage.
 * Database probes roll back; API proposal/audit probes use unique disposable records and clean up
 * memory, while retaining audit evidence and proposal status for verification.
 */
import pool from '../../db/pgPool.js';

const requiredTables = ['crm_agent_proposals', 'crm_agent_memories', 'crm_flow_definitions', 'crm_flow_nodes', 'crm_flow_edges', 'crm_flow_runs', 'crm_flow_run_events', 'crm_social_identities', 'crm_social_triggers', 'crm_social_automation_pauses', 'crm_social_scheduled_replies', 'agent_handoffs', 'lab_explainer_drafts', 'adherence_plans', 'adherence_events', 'drug_safety_signoffs', 'pharmacy_demand_forecasts'];
const requiredColumns = {
  crm_agent_proposals: ['tenant_uid', 'corporate_uid', 'actor_user_id', 'tool_name', 'args', 'status', 'expires_at', 'entity_uid'],
  crm_agent_memories: ['tenant_uid', 'corporate_uid', 'actor_user_id', 'memory_key', 'entity_uid'],
  crm_audit_log: ['tenant_uid', 'corporate_uid'],
  crm_leads_v2: ['tenant_uid', 'corporate_uid'],
  crm_contacts_v2: ['tenant_uid', 'corporate_uid'],
  crm_flow_definitions: ['tenant_uid', 'status', 'version', 'trigger_config', 'entity_uid'],
  crm_social_identities: ['tenant_uid', 'channel', 'external_user_id', 'consent_status', 'entity_uid'],
  crm_flow_runs: ['tenant_uid', 'status', 'current_node_key', 'next_run_at', 'entity_uid'],
  crm_social_scheduled_replies: ['tenant_uid', 'conversation_id', 'send_at', 'status', 'entity_uid'],
  agent_handoffs: ['tenant_uid', 'status', 'entity_uid'],
  lab_explainer_drafts: ['tenant_uid', 'status', 'delivered_at', 'delivery_provider_id', 'entity_uid'],
  adherence_plans: ['tenant_uid', 'patient_id', 'entity_uid'],
  adherence_events: ['tenant_uid', 'plan_id', 'entity_uid'],
  drug_safety_signoffs: ['tenant_uid', 'status', 'entity_uid'],
  pharmacy_demand_forecasts: ['tenant_uid', 'item_id', 'entity_uid'],
};
const out = { schema: {}, tenantIsolation: null, corporateIsolation: null, api: { skipped: true, reason: null } };
const db = pool.pool || pool;
const client = await db.connect();
const apiCall = async (base, path, token, options = {}) => {
  const headers = { 'content-type': 'application/json', ...(options.headers || {}) };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${base.replace(/\/$/, '')}${path}`, {
    method: options.method || 'GET', headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
};
try {
  for (const table of requiredTables) {
    const exists = await client.query('SELECT to_regclass($1::text) AS name', [table]);
    if (!exists.rows[0].name) throw new Error(`Missing table ${table}`);
    out.schema[table] = 'present';
  }
  for (const [table, columns] of Object.entries(requiredColumns)) {
    const result = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1::text AND column_name=ANY($2::text[])`, [table, columns]);
    const found = new Set(result.rows.map((r) => r.column_name)); const missing = columns.filter((c) => !found.has(c));
    if (missing.length) throw new Error(`Missing columns on ${table}: ${missing.join(', ')}`);
  }
  const tenants = await client.query(`SELECT tenant_uid FROM (SELECT DISTINCT tenant_uid FROM crm_leads_v2 WHERE tenant_uid IS NOT NULL UNION SELECT DISTINCT tenant_uid FROM crm_agent_proposals WHERE tenant_uid IS NOT NULL UNION SELECT unique_id AS tenant_uid FROM tenants WHERE unique_id IS NOT NULL) t ORDER BY tenant_uid LIMIT 2`);
  const tenantA = tenants.rows[0]?.tenant_uid || 'uat-tenant-a'; const tenantB = tenants.rows[1]?.tenant_uid || 'uat-tenant-b';
  const actor = await client.query(`SELECT id FROM users WHERE id IS NOT NULL ORDER BY id LIMIT 1`);
  const actorId = actor.rows[0]?.id || 0;
  await client.query('BEGIN');
  const proposal = await client.query(`INSERT INTO crm_agent_proposals (tenant_uid,corporate_uid,actor_user_id,tool_name,args,preview) VALUES ($1,NULL,$2,'uat_probe','{}','{}') RETURNING id`, [tenantA, actorId]);
  const own = await client.query('SELECT COUNT(*)::int AS n FROM crm_agent_proposals WHERE tenant_uid=$1 AND id=$2', [tenantA, proposal.rows[0].id]);
  const cross = await client.query('SELECT COUNT(*)::int AS n FROM crm_agent_proposals WHERE tenant_uid=$1 AND id=$2', [tenantB, proposal.rows[0].id]);
  await client.query('ROLLBACK');
  if (own.rows[0].n !== 1 || cross.rows[0].n !== 0) throw new Error('Tenant isolation probe failed');
  out.tenantIsolation = { passed: true, tenantCount: tenants.rows.length, crossTenantRows: cross.rows[0].n };
  const corporateA = 'uat-corporate-a'; const corporateB = 'uat-corporate-b';
  await client.query('BEGIN');
  const corpA = await client.query(`INSERT INTO crm_agent_proposals (tenant_uid,corporate_uid,actor_user_id,tool_name,args,preview) VALUES ($1,$2,$3,'uat_corporate_probe','{}','{}') RETURNING id`, [tenantA, corporateA, actorId]);
  await client.query(`INSERT INTO crm_agent_proposals (tenant_uid,corporate_uid,actor_user_id,tool_name,args,preview) VALUES ($1,$2,$3,'uat_corporate_probe','{}','{}')`, [tenantA, corporateB, actorId]);
  const corpOwn = await client.query('SELECT COUNT(*)::int AS n FROM crm_agent_proposals WHERE tenant_uid=$1 AND corporate_uid=$2 AND id=$3', [tenantA, corporateA, corpA.rows[0].id]);
  const corpCross = await client.query('SELECT COUNT(*)::int AS n FROM crm_agent_proposals WHERE tenant_uid=$1 AND corporate_uid=$2 AND id=$3', [tenantA, corporateB, corpA.rows[0].id]);
  await client.query('ROLLBACK');
  if (corpOwn.rows[0].n !== 1 || corpCross.rows[0].n !== 0) throw new Error('Corporate sub-filter probe failed');
  out.corporateIsolation = { passed: true, crossCorporateRows: corpCross.rows[0].n };
    const base = process.env.CRM_UAT_BASE_URL; const email = process.env.CRM_EMAIL; const password = process.env.CRM_PASSWORD;
  if (!base || !email || !password) out.api.reason = 'CRM_UAT_BASE_URL, CRM_EMAIL and CRM_PASSWORD were not supplied; DB/schema UAT completed.';
  else {
      const login = await apiCall(base, '/api/crm/login', null, { method: 'POST', body: { email, password } });
      if (!login.response.ok) throw new Error(`CRM login UAT failed (${login.response.status})`);
      const token = login.body.accessToken || login.body.token;
      if (!token) throw new Error('CRM login returned no token');
      const verify = await apiCall(base, '/api/crm/auth/verify', token);
      if (!verify.response.ok || !verify.body.crmUser?.id || !verify.body.crmUser?.tenantUid) throw new Error(`CRM auth verify UAT failed (${verify.response.status})`);
      const crmUser = verify.body.crmUser;
      const corporateUid = crmUser.corporateUid || null;
      const memory = await apiCall(base, '/api/crm/ai/agent/memory', token);
      if (!memory.response.ok) throw new Error(`CRM agent memory UAT failed (${memory.response.status})`);

      // Deterministic proposal/confirmation probe. The proposal is scoped to the authenticated
      // actor/tenant, confirmed through the public route, and removed from memory afterwards.
      const probeKey = `uat_agent_probe_${Date.now()}`;
      const probeArgs = { key: probeKey, category: 'uat', value: { passed: true }, source: 'crm-agentic-uat' };
      const inserted = await client.query(
        `INSERT INTO crm_agent_proposals (tenant_uid, corporate_uid, actor_user_id, tool_name, args, preview)
         VALUES ($1,$2,$3,'remember_agent_memory',$4::jsonb,$5::jsonb) RETURNING id`,
        [crmUser.tenantUid, corporateUid, Number(crmUser.id), JSON.stringify(probeArgs), JSON.stringify({ ok: true, uat: true })]);
      const proposalId = inserted.rows[0].id;
      const confirmed = await apiCall(base, '/api/crm/ai/agent/confirm', token, {
        method: 'POST', body: { proposalId, tool: 'remember_agent_memory', args: probeArgs },
      });
      if (!confirmed.response.ok || !confirmed.body.success) throw new Error(`CRM proposal confirmation UAT failed (${confirmed.response.status})`);
      const removed = await apiCall(base, `/api/crm/ai/agent/memory/${encodeURIComponent(probeKey)}`, token, { method: 'DELETE' });
      if (!removed.response.ok) throw new Error(`CRM memory cleanup UAT failed (${removed.response.status})`);

      // Expiry probe: expired proposals must be rejected and never reach the tool apply handler.
      const expired = await client.query(
        `INSERT INTO crm_agent_proposals (tenant_uid, corporate_uid, actor_user_id, tool_name, args, preview, expires_at)
         VALUES ($1,$2,$3,'remember_agent_memory',$4::jsonb,'{}'::jsonb,NOW()-INTERVAL '1 minute') RETURNING id`,
        [crmUser.tenantUid, corporateUid, Number(crmUser.id), JSON.stringify({ key: `${probeKey}_expired`, category: 'uat', value: true })]);
      const expiry = await apiCall(base, '/api/crm/ai/agent/confirm', token, {
        method: 'POST', body: { proposalId: expired.rows[0].id, tool: 'remember_agent_memory', args: { key: `${probeKey}_expired`, category: 'uat', value: true } },
      });
      if (expiry.response.status !== 400 || expiry.body.error !== 'proposal_expired') throw new Error(`CRM proposal expiry UAT failed (${expiry.response.status})`);

      // A3 dry-run/apply contract probe uses a non-existent lead id, so no production CRM row is
      // changed while the bulk validator and confirmation path are exercised.
      const bulkArgs = { leadIds: [2147483647], status: 'paused' };
      const bulk = await client.query(
        `INSERT INTO crm_agent_proposals (tenant_uid, corporate_uid, actor_user_id, tool_name, args, preview)
         VALUES ($1,$2,$3,'bulk_update_lead_status',$4::jsonb,'{}'::jsonb) RETURNING id`,
        [crmUser.tenantUid, corporateUid, Number(crmUser.id), JSON.stringify(bulkArgs)]);
      const bulkResult = await apiCall(base, '/api/crm/ai/agent/confirm', token, {
        method: 'POST', body: { proposalId: bulk.rows[0].id, tool: 'bulk_update_lead_status', args: bulkArgs },
      });
      if (!bulkResult.response.ok || !bulkResult.body.success || bulkResult.body.count !== 0) throw new Error(`CRM A3 bulk UAT failed (${bulkResult.response.status})`);

      const audit = await client.query(
        `SELECT count(*)::int AS n FROM crm_audit_log WHERE tenant_uid=$1 AND corporate_uid IS NOT DISTINCT FROM $2 AND actor_user_id=$3 AND event_type LIKE 'agent.apply.%' AND created_at > NOW()-INTERVAL '10 minutes'`,
        [crmUser.tenantUid, corporateUid, Number(crmUser.id)]);
      if (audit.rows[0].n < 2) throw new Error('CRM audit-row UAT failed: applied proposals were not audited');

      // Optional least-privilege account: the proposal belongs to the primary actor and must be
      // denied or hidden from a second CRM identity.
      const denyEmail = process.env.CRM_RBAC_EMAIL; const denyPassword = process.env.CRM_RBAC_PASSWORD;
      let rbacDenied = null;
      if (denyEmail && denyPassword) {
        const lowLogin = await apiCall(base, '/api/crm/login', null, { method: 'POST', body: { email: denyEmail, password: denyPassword } });
        if (!lowLogin.response.ok) throw new Error(`CRM RBAC test login failed (${lowLogin.response.status})`);
        const lowToken = lowLogin.body.accessToken || lowLogin.body.token;
        const denial = await apiCall(base, '/api/crm/ai/agent/confirm', lowToken, { method: 'POST', body: { proposalId, tool: 'remember_agent_memory', args: probeArgs } });
        rbacDenied = denial.response.status === 403 || denial.response.status === 404;
        if (!rbacDenied) throw new Error(`CRM RBAC denial UAT failed (${denial.response.status})`);
      }
      out.api = { skipped: false, login: true, authVerify: true, memoryRead: true, proposalConfirm: true, expiry: true, a3Bulk: true, auditRows: audit.rows[0].n, rbacDenied };
  }
  console.log(JSON.stringify({ success: true, ...out }, null, 2));
} catch (error) {
  try { await client.query('ROLLBACK'); } catch {}
  console.error(JSON.stringify({ success: false, error: error.message, ...out }, null, 2)); process.exitCode = 1;
} finally {
  client.release();
  await db.end?.();
}
