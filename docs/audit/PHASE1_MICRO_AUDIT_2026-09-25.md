# Micro Audit — Phase 1 Foundations and Related Features

**Date:** 2026-09-25 · **Scope:** everything built or changed in the 2026-09-25 delivery
**Production at time of audit:** `3941b30d` · **Repository `main`:** `179abb9d` (pushed, **not deployed**)
**Reviewed through four lenses:** CTO (architecture, security, delivery) · Medical Superintendent (patient safety, clinical governance) · CEO (business readiness, risk, value) · COO (operations, data integrity, process)

---

## 1. Bottom line

| Area | Verdict | One-line reason |
|---|---|---|
| **Finance ledger (GL)** | **Do not enable for any tenant yet** | Reports double-count after a reversal (demonstrated); fiscal-period controls can be undone; tenant identity is unreliable for staff logins |
| **Entitlements** | Sound design, **needs audit trail** | Fails closed, correct RLS use; no record of who revoked what |
| **Discharge gates** | **Do not rely on as a safety control** | Override approver is asserted by the caller; sign routes have no role check; packet lookup is not tenant-scoped |
| **ER guided triage (ESI)** | **Keep off clinical use** until vitals up-triage exists | Omits ESI's vital-sign step and age; "nurse must review" is not enforced |
| **MRD screen** (rewritten today) | Works; **role and audit gaps** | Runs on the real tables and is tested; any hospital role can create records; no audit log |
| **Cron single-owner (WP-1.4)** | **Not delivered** | The lease service is dead code; only a per-process guard exists |
| **Corporate bulk upload / packages / partners** | Works; **data-quality and audit trade-offs** | Invalid fields are blanked with a warning; package delete is a hard delete with no audit row |
| **Delivery process** | Improved, **still fragile** | Live-tree deploys stash other people's work; 51 stash entries; CI has never run |

**What is safe today:** none of the finance or entitlement code can affect a real tenant yet, because no tenant has been granted the finance package and no tenant has a chart of accounts (verified: all 11 new tables are empty). The exposure that exists **now** is in the discharge-signing routes, the tenant-identity fallback, and the deployed-but-dormant ledger hooks in billing.

**Recommended order:** fix P0 items (Section 6) **before** deploying `179abb9d` and **before** enabling finance for any hospital.

---

## 2. Method and limits

- **Read** every new/changed service, route, migration, and client page in scope; ran the code's own tests (29 server, 5 client — all pass).
- **Demonstrated** claims marked *Demonstrated* were reproduced against the production database inside transactions that were rolled back (nothing persisted; row counts re-checked afterwards).
- **Code-read** claims are from reading the source and were not executed.
- **Not done:** the reported "38/38 dry-run" against a disposable database was **not re-run** (it needs a scratch database on this host); GitHub Actions has never run for this repo and its status cannot be read (private repo); no load or penetration testing; no clinician review of the ESI tree.
- **Severity:** *Critical* = can cause patient harm, cross-tenant access or writes, or materially wrong financial statements with no compensating control · *High* · *Medium* · *Low*.
- **Live?** says whether the defect exists in the code running in production today.

---

## 3. What was built (inventory and status)

| # | Feature | Where | Live | Notes |
|---|---|---|---|---|
| 1 | Finance ledger: accounts, vendors, expenses, budgets, tax codes, fiscal periods, journal entries, reversal | `finance-ledger.service.js`, `hospital/finance.route.js` | Yes (dormant) | 9 RLS tables |
| 2 | GL posting adapters (invoice, payment, adjustment, refund, expense, insurance settlement) | `finance-gl-posting.service.js` | Yes — **called from billing** | Best-effort; silent when no chart of accounts |
| 3 | Finance reports: trial balance, P&L, balance sheet, tax summary, CSV | `finance-reports.service.js` | Yes (dormant) | `taxSummary` fix is in `179abb9d` only |
| 4 | Entitlements: packages, grants, revoke, bootstrap seed | `entitlement.service.js`, `module-access.route.js` | Yes (dormant) | Seeds chart of accounts, tax codes, one fiscal period |
| 5 | Cron single-flight + DB leases | `cronRegistry.js`, `cron-lease.service.js` | Guard yes; **lease unused** | |
| 6 | Discharge readiness gate + override audit | `discharge-workflow.service.js` | Yes | |
| 7 | Medication-reconciliation gate (per-org setting, default required) | `adt.service.js`, `discharge-workflow.service.js`, `prescription-safety.service.js` | **No — `179abb9d` only** | |
| 8 | Hospital MRD screen on real MRD tables | `hospital-mrd.service.js`, `practice.route.js`, `HospitalMRD.tsx` | Yes | Rewritten today |
| 9 | Discharge summaries / practice records (new columns) | `practice.route.js`, migration 1 | Yes | |
| 10 | ER guided ESI decision tree | `erGuidedTriage.ts`, `ERRegister.tsx` | Yes (client) | |
| 11 | Lab/imaging order pages, discharge summary page, Accounts pages moved to live endpoints | client | Yes | |
| 12 | Corporate: bulk-upload QC, package status/delete, bulk partner assignment, team health uploads → employee reports | `admin.route.js`, `corporate*.route.js` | Yes | |
| 13 | Ops: memory preflight, OOM protection, deploy auto-revert target, FORCE-RLS script | `scripts/` | Yes | FORCE RLS **not applied** to live DB |

---

## 4. Findings register

### 4.1 Finance

| ID | Sev | Finding | Evidence | Live? |
|---|---|---|---|---|
| **FIN-01** | **Critical** | **Reports double-count after a reversal.** Reports exclude entries marked `reversed` but *include* the reversal entry, so the reversal offsets nothing. The comment "a reversal nets its original out" is wrong. | *Demonstrated:* post a 1,000 sale, reverse it exactly as `reverseJournalEntry` does, run the report SQL → **revenue −1,000, cash −1,000** (correct: 0). The trial balance still shows "balanced", so nothing flags it. | Code live, dormant |
| **FIN-02** | High | **Reversal flags are inverted.** The service sets `reversal_of` on the *original* pointing at the reversal; the column means "this entry reverses X". The guard "a reversal cannot itself be reversed" therefore never fires: a reversal can be reversed, re-instating amounts while the original stays `reversed`. | *Demonstrated:* after reversal, original has `reversal_of=<reversal id>`, reversal has `reversal_of=null, status=posted`. | Yes, dormant |
| **FIN-03** | High | **Fiscal-period controls can be undone.** `createFiscalPeriod` upserts dates on conflict with no status check, so dates of a **closed** period can be changed; there is no overlap check; a date with **no covering period** is accepted silently. | Code-read (`ON CONFLICT … DO UPDATE SET start_date, end_date`; `assertPeriodOpen` passes when no row) | Yes, dormant |
| **FIN-04** | Medium | **Fiscal-year seed is wrong Jan–Mar.** The seed builds the year from the calendar year, so from January to March it creates a *future* FY (April→March) and the current date has no period. It also creates one 12-month period, so "close period" locks a whole year. | Code-read (`seedDefaultFinanceSetup`) | Yes, dormant |
| **FIN-05** | Medium | **Dates use UTC, not IST.** Entry dates come from `toISOString()`; between 00:00 and 05:30 IST entries are dated the previous day — wrong month/quarter at period boundaries. | Code-read (ledger + all posting adapters) | Yes |
| **FIN-06** | High | **Posting adapters have accounting-design faults.** *Refund:* debits Refunds Payable (never credited earlier) and credits Cash — revenue/receivable never reversed, and card refunds hit Cash not Bank. *Adjustment:* moves revenue ↔ contra-revenue but **never reduces the receivable**, so A/R stays overstated. *Insurance settlement:* idempotency key is the claim id, so a **second partial remittance is dropped as a replay**. *Expense:* input tax is debited to the expense account (defensible for exempt supplies, wrong for taxable ones). *Invoice:* if patient share + insurance ≠ total (discount, rounding) the entry is unbalanced and silently not posted. | Code-read | Refund and adjustment adapters are **called from billing** today |
| **FIN-07** | Medium | **Balance is enforced only in application code.** No database constraint or deferred trigger; a direct write can post an unbalanced entry. Entry numbers come from one global sequence (gaps, not per-organisation). | Code-read + schema | Yes |
| **FIN-08** | Low | **Every route error becomes HTTP 400 with the raw message.** `err.status` (e.g. 409 period closed) is ignored and database error text can reach the client. | Code-read (`send()` in `finance.route.js`) | Yes |
| **FIN-09** | Medium | **Ledger posting is fire-and-forget with no retry or reconciliation.** A failed post is logged and the invoice proceeds; nothing later detects revenue missing from the GL. | Code-read (`attempt()`) | Yes |
| **FIN-10** | Medium | **RLS is ENABLE-only on the live database.** The app role owns the tables, so the isolation policies do not apply to the app connection. Isolation is **proven safe to switch on** (rolled-back test: own org sees/writes own rows; other org cannot read or write, including journal lines; no context sees nothing; platform admin sees all). | *Demonstrated.* Live check today: all 9 tables `forced=false`. | **Open — needs a privileged human to run `force-rls-phase1.mjs`** |
| FIN-11 | Info | Tax summary covers **expense-side only**; output GST on invoices and input-credit reconciliation are not built (the code says so). | Code-read | — |

### 4.2 Security and tenancy

| ID | Sev | Finding | Evidence | Live? |
|---|---|---|---|---|
| **SEC-01** | High | **Staff tokens are mapped to the wrong tenant.** `verifyHospitalToken` builds the tenant from `hospital_id → tenant_id → id → hospitalId` and **never reads `organization_id`**, but department logins mint `{id, role, organization_id}`. Result: for those users the tenant becomes **their own user id**. Effects: finance/MRD/practice endpoints hit the wrong tenant or find nothing, and the new entitlement check fails closed for them. | DB: **14** hospital-role users have an `organization_id`; the middleware has no `organization_id` reference. Checked for collisions today: **none** (no hospital-role user id equals an org id that holds data). *Not traced:* whether other login paths (multi-entity, hospital-account login) add `hospital_id`. | Yes |
| **SEC-02** | Medium | **Same fallback in the discharge routes** (`organization_id \|\| tenant_id \|\| user.id`). | Code-read | Yes |
| **SEC-03** | Medium | **Entitlement changes are not auditable.** Grants record `granted_by`; revoke records nothing (no actor, no time); no audit-log row. Each finance request also costs ~6 round trips (no caching). | Code-read | Yes |
| SEC-04 | Low | Entitlement check endpoint reads `organization_id` while hospital routes read `hospitalId` — two identity sources can disagree. | Code-read | Yes |

### 4.3 Clinical safety (Medical Superintendent)

| ID | Sev | Finding | Evidence | Live? |
|---|---|---|---|---|
| **CLN-01** | **Critical** | **Discharge override is asserted, not verified.** `override.approverId` and `override.approverRole` come straight from the request body. Anyone able to call the sign route can bypass the readiness gate (and, in `179abb9d`, the reconciliation gate) by sending `{reasonCode, approverId, approverRole:'medical_director'}`; the audit row then records a **forged approver**. | Code-read (`discharge-workflow.route.js`, `signDischargePacket`) | Readiness gate: **yes**. Reconciliation gate: `179abb9d` only |
| **CLN-02** | **Critical** | **Sign routes accept any authenticated user.** `POST /api/v1/discharge/sign` and `/sign/:packetId` use `authUser` with no `requireRole`. | Code-read | Yes |
| **CLN-03** | High | **Discharge packet lookup and update are not tenant-scoped** (`WHERE id = :id AND status='draft'`). Combined with CLN-01, a caller in one hospital can sign another hospital's draft. The consent check also trusts a **body-supplied `patientId`**, not the packet's patient. | Code-read | Yes |
| **CLN-04** | High | **Guided ESI omits ESI's vital-sign step and age.** The four-question tree (life-saving → high-risk → resources) has no danger-zone vitals up-triage and no paediatric input, so a patient who "looks stable" with dangerous vitals can be under-triaged. A NEWS2 service exists elsewhere but is not linked. | Code-read; 5 unit tests pass but test only the tree, not clinical validity | Yes (client) |
| **CLN-05** | High | **"A nurse must review the result" is not enforced.** The server marks `triage_reviewed = true` whenever a level is supplied; there is no confirm step or role check. | Code-read (`er-workflow.route.js`) | Yes |
| **CLN-06** | Medium | **Two parallel discharge flows, only one guarded.** The practice discharge-summary flow (`/discharge-summaries`, `/submit`) has **no readiness or reconciliation gate**. It also trusts body `patientId`/`admissionId` with no tenant check, and `/submit` inserts a **new row every time** (draft + submit = duplicates) and creates a **WhatsApp survey invitation each time** (patient spam). No approve route was found in this router (approval may live elsewhere — unverified). | Code-read | Yes |
| **CLN-07** | Medium | **Override rows are written before the sign succeeds.** A later failure (e.g. already signed) leaves override records for a discharge that did not happen; retries duplicate them. | Code-read | Yes |
| CLN-08 | Info | **Good:** reconciliation requirement defaults to *required* and to *required on any error*; there is no API to switch it off (no caller of `setReconciliationRequired`). | Code-read | `179abb9d` |

**SaMD note (per project governance).** Guided ESI is deterministic, not ML, but it assigns acuity that orders the ER queue — a risk-stratification output. It has no clinical sign-off record, no model-card entry, and no quality-gate log. Treat it as clinical decision support that needs medical-director approval before use.

### 4.4 Operations and data integrity (COO)

| ID | Sev | Finding | Evidence | Live? |
|---|---|---|---|---|
| **OPS-01** | High | **Cron single-owner is not delivered.** `cron-lease.service.js` is used by nothing except an admin listing import. Only a per-process "already running" guard exists, so the same job can still run in two PM2 processes. | Code-read (no callers) | Yes |
| **OPS-02** | Medium | **MRD: any hospital role can create/index records and queue digitisation** (receptionist, billing, etc.), with no audit-log row. | Code-read | Yes |
| **OPS-03** | Medium | **No patient has a UHID** (`mrn` and `unique_id` null for all 18 patients), so MRD create-by-UHID cannot succeed today; the Patient-ID alternative is the only working path. | *DB fact* | Yes |
| **OPS-04** | Medium | **Deploys stash other people's uncommitted work** and a restart loads whatever is in the tree. 51 stash entries exist; a second agent edits the same tree continuously. | Observed twice today | Process |
| **OPS-05** | Medium | **CI has never run.** The gates (typecheck baseline of 934 errors, tests, secret scan) are unproven on GitHub; branch protection is not applied. | Docs + API 404 | Process |
| OPS-06 | Low | `client/dist/assets` grows ~700 files per deploy (old chunks are kept deliberately). | Observed | Live |
| OPS-07 | Low | Discharge/practice endpoints return raw `error.message` on 500s. | Code-read | Yes |

### 4.5 Corporate features built earlier the same day

| ID | Sev | Finding |
|---|---|---|
| **COR-01** | Medium | **Bulk-upload QC now blanks bad fields instead of rejecting rows.** Invalid phone, gender, DOB, joining date and pin are stored as empty with a warning in the report. This fixed the 134-row failure, but a missing DOB silently affects age-band eligibility; the report must be reviewed. Welcome-email failures now appear as warnings, not failures. |
| **COR-02** | Medium | **Health-package delete is a hard delete** of all employee assignments (and edits linked plans) with no audit row and no undo; status toggle also has no audit row. |
| **COR-03** | Low | **Bulk partner assignment overwrites** the stored employee list for a partner (upsert), not a merge. |
| **COR-04** | Low | Team-uploaded health reports are now inserted into each employee's own `reports` table with `analysisStatus='pending'`; whether that triggers automatic AI analysis was **not verified**. |
| COR-05 | Info | **Good:** DOB month-name dates (`1-Jun-85`) now resolve in both browser and server; typecheck baseline unchanged. |

---

## 5. Verified good (worth keeping)

- **Entitlement lookups fail closed** on error, unknown action, or missing tenant (503/403), and run inside a tenant-scoped transaction.
- **Journal idempotency and race handling** are structurally correct after `179abb9d` (the lost-race path re-reads on a fresh transaction instead of the aborted one).
- **RLS design** is right and was shown safe to force (Section 4.1, FIN-10).
- **Migrations are additive and idempotent**; row counts of existing tables were unchanged; the MRD/`medical_records` migration bug was caught and fixed before it mattered.
- **MRD rewrite** reads only what MRD owns, derives the MRD number, resolves patients inside the tenant context, and invents nothing (4 unit tests + rolled-back database checks).
- **Reconciliation default is safe** (required unless explicitly configured otherwise).
- **No secrets** found in the batch; typecheck error count unchanged at 934; all 29 server and 5 client tests pass.
- **Deploy hardening:** memory preflight, revert-to-live-commit, and OOM kill-order protection are in place and were exercised in real deploys.

---

## 6. Remediation plan

**P0 — before deploying `179abb9d` or enabling finance for any hospital**
1. **CLN-01/02/03:** add `requireRole` to the discharge sign routes; take the approver from the **authenticated session** (or a second authenticated approval), never the body; scope the packet lookup and update by organisation; take `patientId` for the consent check from the packet, not the request.
2. **SEC-01/02:** make the tenant derivation read `organization_id` first, and reject (not fall back to `id`) when no tenant claim is present for non-legacy roles; add a regression test with a real department-login token.
3. **FIN-01/02:** report on `status = 'posted'` only *and* treat a reversal as offsetting (or exclude both original and reversal consistently); fix the `reversal_of` direction; add the missing test (post → reverse → trial balance must be zero, and reversing a reversal must be refused).
4. **FIN-03:** refuse date changes to closed periods, add an overlap check, and require a covering period to post.
5. **FIN-10:** a privileged operator runs `force-rls-phase1.mjs` (start with `--check`).

**P1 — before the first tenant goes live on finance**
6. FIN-06 accounting review of refund, adjustment, settlement, expense and invoice-imbalance handling by a qualified accountant; FIN-05 IST dates; FIN-04 fiscal-year seed; FIN-07 balance constraint; FIN-08/09 error mapping and a ledger-reconciliation job.
7. CLN-04/05: add danger-zone vitals and age to guided triage, require an explicit nurse confirmation with identity, and obtain medical-director sign-off (register it as decision support in the governance model cards).
8. CLN-06: put the readiness/reconciliation gates on the practice discharge flow or retire it; de-duplicate `/submit`.
9. OPS-01: wire the lease into the cron registry, or record that it is intentionally deferred.
10. SEC-03: audit-log entitlement grants and revokes with actor and time.

**P2 — hygiene**
11. OPS-02 role checks and audit rows on MRD writes; OPS-03 assign UHIDs; COR-01/02 audit rows and review workflow; OPS-04 deploy from a clean release directory instead of the shared working tree; OPS-05 run CI once and apply branch protection; OPS-06 prune old assets.

---

## 7. Decisions needed from leadership

1. **Finance go-live scope.** Is the ledger intended for hospital revenue accounting, or for management reporting only? That changes how strict FIN-06 must be.
2. **Discharge governance.** Which roles may sign a discharge and which may approve an override (CLN-01)? This is a policy decision the code currently cannot enforce.
3. **ESI ownership.** Will the medical director approve a guided-triage tool, and will it be validated against a standard ESI workflow before use (CLN-04)?
4. **Release process.** Move to a clean release directory (OPS-04) — this ends the stash-and-restore pattern but changes how deploys work.
5. **UHID policy.** Who assigns UHIDs and when (OPS-03)?

---

## 8. Corrections and disclosures

- **Retracted:** an earlier note in this audit suspected the invoice ledger post ran *before* the invoice transaction committed. On re-check, `COMMIT` runs first; no orphan-entry risk exists there. Not a finding.
- **Checked and found fine:** the finance client calls `/api/hospital/finance/...`; the shared client strips a doubled `/api`, so paths resolve.
- **Contradicts a status report from the other working session:** it stated the phase-1 migration "has never touched a live database". It was applied to production on 2026-09-25 (11 tables, 9 policies, verified by query), and the code shipped in `3941b30d`. The `reset: moving to HEAD` entries in the reflog come from the deploy script stashing and restoring that session's uncommitted files; nothing was lost.
- **Newest fixes are not live:** `179abb9d` (taxSummary column fix, race-safe journal replay, reconciliation gate at signing) is on `main` but production still runs `3941b30d`.
