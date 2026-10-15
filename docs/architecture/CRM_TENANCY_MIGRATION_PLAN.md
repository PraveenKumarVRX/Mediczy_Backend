# CRM tenancy migration & rescope plan (hospital / clinic / corporate)

**Status:** Plan / needs an architecture decision before execution.
**Date:** 2026-10-16.
**Goal:** Make CRM tenant isolation correct and unambiguous for tenants that may be a **hospital,
clinic, or corporate** — safely, and coordinated with the concurrent sessions editing CRM files.

> The concrete, data-present leak is already closed: `crm.route.js` is scoped by `tenant_uid`
> (commit `ed772fa3`), the new `crm_deals`/`crm_activities`/`crm_contacts` carry kind-agnostic
> tenancy (migration `684cc497`, applied), and `authCRM` now resolves `tenantUid`+kind (`3d7ef42f`).
> There is **no active cross-tenant leak today** — all CRM data belongs to one tenant (`VUXHMM`,
> tenant 7). This plan covers the *remaining, latent* work for true multi-tenant correctness.

---

## 1. The real scope (measured, not assumed)

- **Platform-wide pattern:** `tenant_uid` on the v2/scoped tables is maintained by a DB trigger
  `uid_ref_sync('tenant_id','tenant_uid','tenants','unique_id')` — **hard-bound to the `tenants`
  table** — across **95 tables** (CRM, imaging, hospital, careos, HR, …). CRM is a small slice of this.
- **CRM tables with `tenant_id`:** ~85. Of these, **only 7 have `tenant_uid`** today
  (`crm_leads_v2`, `crm_contacts_v2`, `crm_person_identities`, `crm_identity_keys`,
  `crm_source_taxonomy`, `crm_specialty_profiles`, `crm_audit_log`). The other ~78 are `tenant_id`-only.
- **Services take `tenantId` as a parameter** from the route layer (`req.crmUser.tenantId`), then scope
  DB queries by the integer `tenant_id`. ~13 service/route files, ~300 references
  (`hospital-crm-worldclass` 74, `hospital-crm-growth` 53, `communication-hub` 37, `specialty` 27,
  `foundation` 26, `growth-processor` 14, `crm-segments`/`crm-v2-sync` 13 each, …).

**Consequence:** the `tenants`-bound trigger means these tables *structurally cannot hold a corporate
tenant*, and a hospital↔corporate integer-id collision (e.g. id 49) is the only real leak vector —
which cannot occur until a second tenant has CRM data.

---

## 2. The decision that gates everything: how is a corporate a CRM tenant?

This is a **product/architecture decision**, not a code detail. Two viable models:

### Option A — Corporate CRM data lives under its owning `tenants` row (recommended)
Corporates already link to a tenant: `corporates.owned_by_tenant_id` / `corporates.tenant_id`
(both uid-ref'd to `tenants`). So a corporate's CRM records are scoped under the **hospital/clinic
tenant that owns the corporate relationship**; the corporate is a *dimension* (a `corporate_uid`
column / filter), not a separate CRM tenant.
- **Pros:** zero change to the 95-table tenancy model; works with the existing trigger; no schema
  churn; matches how `corporates` already relates to `tenants`.
- **Cons:** a corporate is not an independent CRM tenant — fine if corporates are always serviced
  *by* a hospital/clinic on the platform, which is the current data shape.
- **Work:** small — `authCRM` already resolves the right `tenants` uid for hospital/clinic users;
  for corporate-portal users, resolve the **owning tenant's** uid (via `corporates.owned_by_tenant_id`)
  and optionally stamp `corporate_uid` for sub-filtering. The 13 services keep scoping by `tenant_id`,
  which is then always a valid `tenants` id.

### Option B — Corporate is a first-class CRM tenant (kind-agnostic tenancy)
Make the tenant reference point at `entity_registry(uid)` (any kind) instead of `tenants`, like the
new deals/activities/contacts columns.
- **Pros:** a corporate is a true independent CRM tenant.
- **Cons:** **very large and risky.** It diverges CRM from the other ~88 platform tables; requires
  adding/altering `tenant_uid` on ~85 CRM tables (most lack it); changing a framework-installed
  trigger on **populated** tables (`crm_leads_v2` etc.); and backfilling. High blast radius.

**Recommendation: Option A**, unless the product genuinely requires corporates to run their own CRM
independently of any hospital/clinic. Option A closes the ambiguity (scoping always resolves to a real
`tenants` id, chosen unambiguously from the user's entity) without touching the platform tenancy model.

---

## 3. Execution plan — Option A (recommended)

**A1. Resolver (code, small).** In `authCRM`, for a corporate-portal CRM user, resolve the **owning
tenant** uid/id (`corporates.owned_by_tenant_id` → `tenants`), and keep `tenantKind='corporate'` +
`corporateUid` on `req.crmUser` for optional sub-filtering. Hospital/clinic users already resolve
correctly. Net effect: `req.crmUser.tenantId` is **always a valid, unambiguous `tenants` id**.

**A2. Verify, don't rewrite (code).** With A1, the 13 services' existing `tenant_id` scoping becomes
correct (the integer is always a real `tenants` id, never a colliding corporate id). Audit each of the
13 files to confirm they scope **every** read/write by the passed `tenantId` (grep for unscoped
`FROM crm_*` / `UPDATE crm_*` without a `tenant_id` predicate), and fix any genuinely-unscoped query.
This is targeted hardening, not a 300-reference rewrite.

**A3. Optional corporate sub-filter.** Where a hospital services multiple corporates and wants
per-corporate CRM views, add a `corporate_uid` filter on the relevant CRM tables (additive column,
like the deals/activities/contacts migration).

**Sequence:** A1 → A2 (file by file, verified) → A3 (only if needed).

---

## 4. Execution plan — Option B (only if a corporate must be an independent CRM tenant)

**B1. Schema (big, staged, dry-run heavily — populated tables):**
  - Add `tenant_uid TEXT` to the ~78 CRM tables that lack it; `REFERENCES entity_registry(uid)`
    (kind-agnostic), nullable, indexed.
  - For the 7 tables already on the `tenants`-bound trigger, introduce a kind-agnostic path without
    breaking the existing `tenant_id↔tenant_uid` sync (new validation that accepts any registry uid,
    replacing the `tenants`-only check) — **prototype on a copy first.**
  - Backfill `tenant_uid` from existing `tenant_id` (→ `tenants` uid) for all current rows.
**B2. Code (big):** change the 13 services + their routes to accept and scope by `tenant_uid`
  (text), updating every signature and call site (~300 refs). Keep `tenant_id` writes for parity until
  a later NOT-NULL/cleanup pass.
**B3. Enforce:** once populated, make `tenant_uid` NOT NULL; add a CI check that no CRM query scopes by
  `tenant_id` alone.

**Sequence:** B1 (per table group, dry-run → apply) → B2 (per file) → B3. Weeks of careful work;
every step coordinated with concurrent sessions.

---

## 5. Risk & coordination (both options)

- **Concurrent sessions** are actively editing these CRM files (the schema-readiness refactor). **Do
  not mass-edit** — take one file at a time, after that session's refactor for it is committed, then
  layer the tenancy change and commit immediately to minimize overlap.
- **Populated-table schema changes (Option B)** are the highest risk — the `uid_ref_sync` trigger is
  framework-managed and shared by 95 tables; never alter it globally. Prototype on a DB copy.
- **Fail-closed everywhere:** a null/unresolved tenant must match **nothing** (never fall back to
  all-tenants), as already done in `crm.route.js` and `crm-agent`.
- **Verification per file:** a cross-tenant read/write must return 0 rows; a same-tenant one must work.
  Reuse the rolled-back-transaction test pattern from the deals/activities/contacts migration.

---

## 6. What's already done (baseline)

- `authCRM` resolves unambiguous `tenantUid`+kind (`3d7ef42f`).
- CRM agentic operator scopes by `tenant_uid` (`3d7ef42f`, `5c27edee`).
- `crm.route.js` leads/deals/activities/contacts scoped by `tenant_uid`, fail-closed (`ed772fa3`).
- Kind-agnostic tenancy columns on `crm_deals`/`crm_activities`/`crm_contacts` (`684cc497`, applied).

## 7. Progress — Option A executed (2026-10-16)

**Decision: Option A.**

- **A1 — resolver: DONE** (commit `fed36e16`). `authCRM` now redirects a corporate-resolved CRM user
  to its owning `tenants` row (`corporates.owned_by_tenant_id → tenants`) and stamps `corporateUid`.
  `req.crmUser.tenantId` is therefore always an unambiguous `tenants` id. Additive/forward-looking: 0
  CRM users resolve to a corporate today, so hospital/clinic/broker users are unchanged. Verified:
  hospital user unchanged; corporate user (Ninjacart `CMR4ET`) redirects to its owning tenant
  (`Z34Y8W`) with `corporateUid` preserved.

- **A2 — per-file audit: DONE (no fixes needed).** Audited the 13 services. Every **user-facing**
  read/write is tenant-scoped (`WHERE … tenant_id = $n`); confirmed especially on the only
  data-bearing tables, `crm_leads_v2` / `crm_contacts_v2` (52 rows each). The only non-tenant-predicated
  queries are (a) **by-id writes on entities already resolved within the tenant** (transitively safe —
  e.g. `crm-v2-sync` twin update, automation/segment action handlers) and (b) **intentional
  cross-tenant cron processors** (`WHERE status='published'`, segment refresh). The systemic leak was
  `crm.route.js` (legacy endpoints), already fixed. With A1, the services' integer `tenant_id` scoping
  is now unambiguous. **No service rewrites required** — the ~300-reference Option-B rewrite is avoided.

### Remaining (forward-looking, low priority)
- **A3 — per-corporate sub-filter:** only needed once corporate CRM users exist *and* one owning tenant
  serves multiple corporates (they'd otherwise share the owning tenant's CRM view). Add a `corporate_uid`
  filter (additive column) keyed on `req.crmUser.corporateUid`.
- **Defense-in-depth:** add `AND tenant_id = $n` to the handful of by-id writes (`crm-v2-sync:115`,
  automation/segment action handlers) — currently transitively safe, not a live risk.
- **Deploy:** all of the above is committed but **not yet live** — the running server loads the whole
  working tree, which still holds other sessions' uncommitted work, so activation waits for a clean,
  coordinated reload.
