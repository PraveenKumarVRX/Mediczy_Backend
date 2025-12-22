---
title: CRM Stabilization Checklist
owner: platform-foundation
last_updated: 2025-02-14
---

> Stop fixing symptoms. This checklist keeps CRM work focused on a single, observable stabilization path.

## 1. Freeze Scope (blockers before work starts)
- ✅ Halt **all** new CRM features/UI tweaks until the checklist is green.
- ✅ Lock deployments to a single environment; mismatched data shapes are a major regression source.
- ✅ Create a worklog entry for each stabilization task so future “quick fixes” can be rejected.

## 2. Golden Path Validation
1. Document the canonical flow: `login → tenant resolve → lead create → lead read/update`.
2. Enumerate every service/component/API in that flow and set expected payload contracts.
3. Add structured logs (`contextId`, `tenantId`, `leadId`) at each hop so a full trace exists for every request.
4. Add a smoke script (or Playwright test) that runs this flow per tenant daily; fail the build if any step breaks.

## 3. Single Source of Truth
- [ ] Inventory all modules touching leads, activities, notes, tasks.
- [ ] Migrate raw queries/models to a single repository layer (e.g., `crmLeadService`).
- [ ] Ensure the repository auto-injects `tenant_id` and `user_id` from middleware; **no controller should set them manually**.
- [ ] Document deprecated entry points and guard them with assertions to prevent re-use.

## 4. Auth & Tenant Guardrails
- [ ] Require `authUser` + `requireTenant` on **every** CRM route. Block merge if a route bypasses them.
- [ ] Remove (or env-gate) header/query tenant overrides; domain/JWT must be the only tenant source.
- [ ] Embed code comments where tenant context is bound, e.g. `// RULE: tenantId must come from JWT/domain`.
- [ ] Add logging for tenant mismatches so attackers/noisy clients surface immediately.

## 5. Cheap Tests & Monitors
- [ ] Write two smoke tests:
  - `test:lead-access`: create/read/update a lead under one tenant.
  - `test:tenant-block`: attempt to read the same lead from another tenant; expect 403.
- [ ] Add a cron job (or CI step) that fires both tests and posts to Slack on failure.
- [ ] Emit structured metrics (`crm.leads.4xx`, `crm.leads.5xx`) and alert when thresholds spike.

## 6. Regression Locks
- [ ] For each bug fix, state a “hard rule” inline (comment or guard clause). Example:  
  `// RULE: Lead imports must go through crmLeadService.upsert()`
- [ ] Update the PR template with a checklist:  
  `☐ Tenant/auth middleware confirmed ☐ Repository-only DB access ☐ Rule documented`
- [ ] Reject PRs that violate standing rules, even if they “work” locally.

## 7. Communication Loop
- Weekly stabilization standup: review traces, failing smoke tests, and new guardrails.
- Share a “what broke / what rule guards it now” memo so the team internalizes the process change.

> Once this list is consistently green, unfreeze features one flow at a time. Never drop the smoke tests or guardrails—they are the regression lock that keeps the CRM stable.
