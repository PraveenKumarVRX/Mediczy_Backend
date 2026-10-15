# AgenticCRM A3 corporate sub-filter — ready-to-apply patch specification

**Status:** Ready for application after the active `crm-agent` rewrite is merged  
**Owner:** CRM platform  
**Scope:** AgenticCRM tools, proposal confirmation, operator memory and audit records  
**Security requirement:** Tenant UID remains mandatory and authoritative. `corporate_uid` is an
additional scope only when the authenticated CRM request has a corporate context.

This document is the merge hand-off for A3. It is deliberately implementation-specific so the
remaining `crm-agent` rewrite can incorporate the change without re-designing the data or security
contract.

## 1. Contract to preserve

`authCRM` must populate the request context as follows:

```js
req.crmUser = {
  id,                 // numeric users.id; required for actor-bound proposals/memory/audit
  tenantId,           // legacy numeric compatibility only
  tenantUid,          // owning tenant entity UID; required for every CRM query
  corporateUid,       // nullable corporate entity UID; optional sub-scope
  role,
  crmRole,
  permissions,
};
```

Corporate users resolve to their owning tenant before the request reaches AgenticCRM. Their
corporate UID is retained separately:

```text
tenantUid    = owning tenant UID
corporateUid = corporate entity UID
```

If `corporateUid` is null, the operation keeps the existing tenant-wide behavior. Do not infer a
corporate UID from a lead, contact, integer `tenant_id`, email domain or request body. A missing
corporate context must never broaden a corporate-scoped request.

## 2. Patch order

Apply the patch in this order. Each step is independently reviewable.

1. Apply the database migration and verify the columns/indexes.
2. Pass `corporateUid` from `req.crmUser` into the agent runner context.
3. Add one shared SQL scope helper in the tool registry.
4. Update every AgenticCRM read and write to scope the base entity by tenant UID and, when set,
   corporate UID.
5. Store corporate UID on new leads, contacts, tasks, activities, proposals and audit rows.
6. Bind proposal lookup, confirmation and mismatch checks to corporate UID.
7. Scope memory reads, deletes and upserts by corporate UID.
8. Add unit tests for a corporate context and a tenant-wide context.
9. Run the rollback UAT and only then run authenticated API UAT with provisioned CRM credentials.

Do not merge only the route or only the migration. A3 is complete only when the schema, request
context, tool queries, confirmation path, memory path and tests are present together.

## 3. Database patch

Create a migration named with the next repository migration sequence, using the following logical
operations. The repository's current implementation is
`server/migrations/20261015006800-crm-agent-corporate-scope.migration.js`.

### 3.1 Add the optional dimension

For each table below, add `corporate_uid TEXT` if it does not already exist:

```text
crm_leads_v2
crm_contacts_v2
crm_deals
crm_activities
crm_tasks
crm_conversations
crm_communication_events
crm_agent_proposals
crm_agent_memories
crm_audit_log
```

For every table that has `tenant_uid`, create this partial index:

```sql
CREATE INDEX IF NOT EXISTS idx_<table>_corporate_uid
  ON <table> (tenant_uid, corporate_uid)
  WHERE corporate_uid IS NOT NULL;
```

The migration may skip an absent legacy table or a legacy table that has no `tenant_uid`; it must
not silently skip a failure on a current AgenticCRM table.

### 3.2 Make memory keys corporate-aware

Drop the old pre-A3 memory constraint if present:

```sql
ALTER TABLE crm_agent_memories
  DROP CONSTRAINT IF EXISTS crm_agent_memories_tenant_uid_actor_user_id_category_memory_key;
```

Create the replacement unique index:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_agent_memories_scope_key
  ON crm_agent_memories
     (tenant_uid, (COALESCE(corporate_uid, '')), actor_user_id, category, memory_key);
```

`NULL` means tenant-wide memory. A non-null corporate UID creates an independent memory scope.
Do not backfill existing rows to a corporate UID without an authoritative ownership mapping.

### 3.3 Rollback

The down migration must drop the corporate indexes, drop `corporate_uid` from the ten tables, and
drop `idx_crm_agent_memories_scope_key`. Rollback is destructive to corporate attribution, so take
the normal database backup before running it.

## 4. Shared SQL scope helper

Add this helper once in `server/services/crm-agent/tool-registry.js` (or the equivalent registry
module in the rewrite). It must append a parameter rather than interpolate a UID:

```js
function addCorporateScope(where, params, alias, corporateUid) {
  if (corporateUid) {
    params.push(corporateUid);
    where.push(`${alias ? `${alias}.` : ''}corporate_uid = $${params.length}`);
  }
}
```

Every handler must start with tenant UID scope, then call the helper on the base table:

```js
const params = [tenantUid];
const where = ['l.tenant_uid = $1', 'l.deleted_at IS NULL'];
addCorporateScope(where, params, 'l', corporateUid);
```

For an unaliased table use an empty alias:

```js
const where = ['tenant_uid = $1', 'deleted_at IS NULL'];
addCorporateScope(where, params, '', corporateUid);
```

Do not apply the corporate predicate only to a joined contact table. The lead, deal, task or
conversation being acted on must itself be in the corporate scope.

## 5. Agent context propagation

The runner context must carry the nullable value in both read and transactional write paths:

```js
const ctx = {
  pool,
  tenantUid: crmUser.tenantUid,
  tenantId: crmUser.tenantId,
  corporateUid: crmUser.corporateUid || null,
  crmUser,
};
```

Use the same shape in `runCrmAgent()` and `applyCrmAgentAction()`. Reject a request with no
`tenantUid`; do not reject a null `corporateUid` because tenant-wide CRM users are valid.

## 6. Tool registry changes

The rewrite must pass `corporateUid` in the handler context and apply the shared helper to the
following tools. The listed base table is the table that must receive the corporate predicate.

| Tool(s) | Operation | Base table |
|---|---|---|
| `search_leads`, `get_lead`, `list_recent_leads` | read | `crm_leads_v2 l` |
| `search_contacts` | read | `crm_contacts_v2 c` |
| `lead_pipeline_summary` | aggregate read | `crm_leads_v2` |
| `assign_lead` | preview + update | `crm_leads_v2` |
| `update_lead_status` | preview + update | `crm_leads_v2` |
| `update_lead_stage` | preview + update | `crm_leads_v2` |
| `bulk_update_lead_status` | preview + update | `crm_leads_v2` |
| `bulk_assign_leads` | preview + update | `crm_leads_v2` |
| `create_lead` | insert | `crm_contacts_v2`, then `crm_leads_v2` |
| `search_deals`, `get_deal` | read | `crm_deals d` |
| `update_deal_stage` | preview + update | `crm_deals` |
| `deal_pipeline_summary` | aggregate read | `crm_deals` |
| `list_tasks` | read | `crm_tasks` |
| `create_task` | insert | `crm_tasks` |
| `add_lead_note` | preview + insert | `crm_activities` and scoped lead lookup |
| `get_conversation_history` | read | `crm_communication_events e` |
| `escalate_to_human` | preview + update | `crm_conversations` |
| `recall_agent_memory` | read | `crm_agent_memories` |
| `remember_agent_memory` | upsert | `crm_agent_memories` |

### 6.1 Inserts

Corporate-aware inserts must include the column and value. Examples:

```sql
INSERT INTO crm_contacts_v2 (tenant_uid, corporate_uid, ...)
VALUES ($1, $2, ...);

INSERT INTO crm_leads_v2 (tenant_uid, corporate_uid, contact_id, ...)
VALUES ($1, $2, $3, ...);
```

For `create_task`, `add_lead_note`, communication events and other writes, use the same
`corporateUid || null` value. If a referenced lead is looked up first, that lookup must also use
the corporate predicate.

### 6.2 Memory upsert

Use the exact expression matching the unique index:

```sql
INSERT INTO crm_agent_memories
  (tenant_uid, corporate_uid, actor_user_id, memory_key, category, value, source)
VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
ON CONFLICT
  (tenant_uid, (COALESCE(corporate_uid, '')), actor_user_id, category, memory_key)
DO UPDATE SET value = EXCLUDED.value,
              source = EXCLUDED.source,
              updated_at = NOW()
RETURNING memory_key, category, value, source, updated_at;
```

## 7. Proposal and audit enforcement

### 7.1 Proposal creation

`persistProposal()` must write `corporate_uid`:

```sql
INSERT INTO crm_agent_proposals
  (tenant_uid, corporate_uid, actor_user_id, tool_name, args, preview, expires_at)
VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, NOW() + INTERVAL '15 minutes');
```

### 7.2 Proposal confirmation

The atomic confirmation update must include a null-safe corporate comparison:

```sql
WHERE id = $1
  AND tenant_uid = $2
  AND corporate_uid IS NOT DISTINCT FROM $3
  AND actor_user_id = $4
  AND tool_name = $5
  AND args = $6::jsonb
  AND status = 'pending'
  AND expires_at > NOW()
```

The fallback `SELECT` used for `proposal_not_found`, expiry and mismatch handling must carry the
same tenant, corporate and actor predicates. `proposalMatches()` must compare:

```js
String(proposal.tenant_uid || '') === String(tenantUid || '') &&
String(proposal.corporate_uid || '') === String(corporateUid || '') &&
Number(proposal.actor_user_id) === Number(actorUserId)
```

A proposal from Corporate A must be rejected for Corporate B even when both corporations share the
same owning tenant and actor ID is otherwise valid.

### 7.3 Audit rows

Every AgenticCRM read, preview and apply audit row must write `corporate_uid` from the request
context. The audit insert remains in the same transaction as a confirmed mutation and must fail
closed if the insert fails:

```sql
INSERT INTO crm_audit_log
  (tenant_id, tenant_uid, corporate_uid, entity_type, entity_id, event_type,
   actor_user_id, actor_role, new_value, reason, metadata)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11::jsonb);
```

Never use `tenant_id` alone as the security predicate. It is retained only for legacy audit schema
compatibility.

## 8. Memory route changes

The explicit memory endpoints in `server/routes/crm-ai.route.js` must use:

```sql
WHERE tenant_uid = $1
  AND corporate_uid IS NOT DISTINCT FROM $2
  AND actor_user_id = $3
```

Use this for both `GET /agent/memory` and `DELETE /agent/memory/:key`. The values are:

```js
[req.crmUser.tenantUid, req.crmUser.corporateUid || null, Number(req.crmUser.id)]
```

The route must remain behind `authCRM` and the existing CRM capability middleware.

## 9. Tests to add before merge

### 9.1 Unit tests

Add a registry test with a mocked pool and this context:

```js
{ pool, tenantUid: 'HOSP-A', corporateUid: 'CORP-A' }
```

Assert that preview and apply SQL both contain `corporate_uid = $N`, and that the parameter list
contains `['HOSP-A', ..., 'CORP-A']`. Cover at least one single-lead write and both A3 bulk tools.

Add a tenant-wide test with `corporateUid: null` and assert no corporate predicate is appended.

Add guardrail tests asserting:

```text
Corporate A proposal + Corporate B confirmation => proposal_not_found or proposal_mismatch
Corporate A memory read + Corporate B context => no rows
Corporate A memory upsert + tenant-wide memory => independent rows
```

### 9.2 Database rollback UAT

Run:

```bash
node server/scripts/ssm-env-loader.mjs server/scripts/qa/crm-agentic-uat.mjs
```

The harness must verify:

```json
{
  "tenantIsolation": { "passed": true, "crossTenantRows": 0 },
  "corporateIsolation": { "passed": true, "crossCorporateRows": 0 }
}
```

The corporate probe should insert same-tenant proposals for `CORP-A` and `CORP-B`, query under one
corporate scope, assert the other row is invisible, and roll back.

### 9.3 Authenticated API UAT

With temporary test credentials only, provide:

```bash
CRM_UAT_BASE_URL=https://<crm-host> \
CRM_EMAIL=<operator-email> \
CRM_PASSWORD=<operator-password> \
CRM_RBAC_EMAIL=<least-privilege-email> \
CRM_RBAC_PASSWORD=<least-privilege-password> \
node server/scripts/ssm-env-loader.mjs server/scripts/qa/crm-agentic-uat.mjs
```

The authenticated run must cover login, `/agent`, proposal confirmation, expiry, audit-row creation,
A3 bulk dry-run/apply and RBAC denial. Do not commit credentials or put them in the environment
template.

## 10. Merge conflict instructions for the active rewrite

When the `crm-agent` rewrite lands, resolve conflicts in this order:

1. Keep the rewrite's tool definitions and business behavior.
2. Reintroduce `addCorporateScope()` near its SQL utility section.
3. Add `corporateUid` to every handler's context destructuring; do not rely on a global variable.
4. Apply the table/tool matrix in §6 to the rewrite's final tool list, including newly added bulk
   tools.
5. Preserve the runner's transaction boundary: mutation → audit insert → proposal status update →
   commit.
6. Preserve null-safe `IS NOT DISTINCT FROM` in proposal/memory scope comparisons.
7. Run `git diff --check`, focused Jest suites and the rollback UAT before resolving the branch.

If the rewrite introduces a new CRM table or new agent tool, add its `corporate_uid` column and
partial `(tenant_uid, corporate_uid)` index in a follow-up migration before enabling the tool.

## 11. Release and rollback checklist

Before release:

- [ ] Migration applied and all ten tables expose `corporate_uid`.
- [ ] `idx_crm_agent_memories_scope_key` exists and memory upsert succeeds in a transaction.
- [ ] Tenant-wide users still see tenant-wide rows when `corporateUid` is null.
- [ ] Corporate users cannot read or mutate another corporation in the same tenant.
- [ ] Proposal confirmation is tenant, corporate, actor, tool and argument bound.
- [ ] Audit failure aborts a confirmed mutation.
- [ ] Unit tests and rollback UAT pass.
- [ ] Authenticated API UAT passes with temporary credentials.
- [ ] `CRM_AGENT_ENABLED` remains disabled until operator UAT and deployment review are complete.

Rollback is: disable the feature flag, stop new proposals, restore the previous application revision,
then use the migration down path only after confirming that corporate attribution can be discarded.
Do not drop the column as an emergency first step; old application code can safely ignore a nullable
column.

