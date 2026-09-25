# Implementation status and next steps

Canonical merged plan: `docs/MEDIQZY_COMPREHENSIVE_IMPLEMENTATION_PLAN.md`. This file remains a
historical status tracker for the audit-remediation plan, but the comprehensive plan is now the
single execution document for backend, frontend, UI, validation, deployment, and phase exit gates.

Cross-checked 2026-09-23 against the full audit remediation plan (Claude Docs
`f13b5222-7b0f-448a-bafb-1429af842699`, "MediQzy Audit Remediation — Detailed Implementation Plan").
This file exists because that check found real gaps between what prior sessions reported as "done"
and what the plan actually specifies — most notably WP-0.3, which turned out to be four sub-packages
covering ~20 specific screens, of which only a handful had been touched. Re-run this cross-check
whenever picking this project back up after a gap; both the plan and the codebase move.

## Verified implementation tranche — 2026-09-26

The following local, testable gaps were implemented and verified in this pass; this is not a claim that
Phase 0/1 is complete:

- **Discharge signing is fail-closed.** `POST /api/v1/discharge/sign` now checks the admission's
  mandatory discharge-readiness items, including `medication_reconciliation`. Incomplete readiness
  returns HTTP 409 with the pending dimensions. An authorised, audited override remains available to
  `admin`, `super_admin`, `medical_director`, and `discharge_officer`.
- **Hospital discharge/MRD records are database-backed.** Added live list endpoints, a real MRD create
  endpoint, sequence-backed MRD numbers, and idempotent migration
  `server/migrations/20260926000001-hospital-practice-real-records.sql`. The MRD, lab, imaging, and
  discharge screens no longer seed or persist fabricated patient/order/queue records; lab and imaging
  patient selection now calls the live `/hospital/practice/patients?search=` endpoint.
- **ER registration has a guided four-question ESI path.** The deterministic decision tree is in
  `client/src/utils/erGuidedTriage.ts`; the selected level and answers are posted as
  `esiLevel`/`triageInputs` to the existing ER registration route. Manual ESI and colour-hint modes
  remain available and are still never inferred from one another.
- **Cron tasks are single-flight per process.** `withCron()` refuses a second overlapping execution of
  the same task and returns `{ skipped: true, reason: 'already_running' }`.
- **Regression coverage added:** `server/__tests__/discharge-signing-gate.test.js`,
  `server/__tests__/cron-single-flight.test.js`, and
  `client/src/utils/erGuidedTriage.test.ts`.

Known follow-up: `client` full `tsc` still reports the existing app-wide backlog. The touched MRD file
had a pre-existing `BrowserMultiFormatReader.reset()` typing mismatch; the reference is now narrowed
locally, but the full check must not be described as green until the backlog is cleared. Cloud backup
IAM, GitHub branch protection, MFA, broader RLS work, and clinical sign-off remain external or
separately scoped work.

## Verified implementation tranche — Phase 1 shared foundations

The following local, testable foundation work was added and verified on 2026-09-26. The new finance
endpoints are intentionally fail-closed until the migration is applied and an administrator grants the
`accounts_finance` entitlement to a tenant.

- **Migration-backed Phase 1 foundation** —
  `server/migrations/20260926000002-phase1-foundations.migration.js` and the migration manifest now
  include tenant entitlements, finance accounts, fiscal periods, vendors, expenses, budgets, tax
  codes, balanced journal entries/lines, and durable cron leases.
- **Server-side entitlements** — `server/services/entitlement.service.js` provides fail-closed
  module checks. `server/routes/module-access.route.js` adds admin list/grant APIs and an authenticated
  check endpoint. The finance route is mounted at `/api/hospital/finance` and requires both the
  appropriate billing role and the `accounts_finance` entitlement.
- **Real Accounts data surfaces** — expenses, vendors, budgets, chart of accounts, journal entries, and
  tax codes now use `client/src/services/hospital-finance.service.ts` and live API responses. The
  remaining Accounts placeholders were not converted without a real source.
- **Durable cron lease** — `server/services/cron-lease.service.js` provides acquire, heartbeat, release,
  and admin lease status. It is available for job-by-job migration; existing jobs still use their
  current schedulers until that migration is deliberately performed.
- **Validation** — finance, entitlement, cron lease, discharge gate, and in-process cron tests pass:
  5 suites / 13 tests. Server syntax and `git diff --check` pass. Client production build passed in
  1m36s. The full client TypeScript backlog remains unrelated to this tranche.

Remaining Phase 1 work is substantial: seed/assign the first real package data, migrate each cron
caller to the durable lease, broaden RLS coverage, complete prescribing-path coverage, and build the
finance invoice/payment posting adapters and department acceptance workflows. No migration was
applied to a live database in this session, and no deployment or production sign-off is claimed.

## Phase 0 (weeks 0–3)

| WP | Status | Evidence / what's left |
|---|---|---|
| 0.1 Secrets | **Safe subset only** | `.gitignore` fixed, 10 real-value `.env*` files untracked, a silent default-password endpoint closed, `SSM_REQUIRED` fail-closed option added, local pre-commit gitleaks hook added. **Owner action, not done**: rotate the live DB password and JWT secrets (signs out every user — needs an announced window), rotate third-party keys, reset every test account password, then `git-filter-repo` + force-push to purge history (freezes merges, everyone re-clones). |
| 0.2 Access-rules deploy | Live | Deployed and verified against real role logins. |
| 0.3 No invented data | **WP-0.3a–d implementation complete; walkthrough and TypeScript backlog remain** | See below. |
| 0.4 Payments | Live | Migration applied to production. |
| 0.5 Tenant isolation (SCM/blood bank/CSSD/dietary) | Done | 98-check verification script, non-superuser role. |
| 0.6 CI gate and release pipeline | Partial | `ci.yml`, gitleaks CI job, `/healthz`, real gating health check + auto-revert all built and now proven across 4 real deploys today. **Not done**: the pipeline itself has never actually run on GitHub Actions (no `gh auth login` access to verify); branch protection not applied; `CODEOWNERS` still has placeholder usernames. |
| 0.7 Backup integrity | Partial | Scripts built and tested locally, live for nightly runs. **Not done**: off-host S3 upload fails with `AccessDenied` (IAM), so there is currently no off-host copy; freshness cron not installed; no restore drill ever run. |
| 0.8 Allergy hotfix | Live | Verified against real production rows. |

### WP-0.3 in full — what the plan actually asks for

The plan splits this into four sub-packages. Status as of 2026-09-25:

- **WP-0.3a — Framework, lint and tests: DONE (2026-09-23).** Shipped: `client/src/components/ui/
  placeholder-banner.tsx`, `client/src/components/ui/data-state.tsx` (five-states wrapper), the real
  CI gate `client/scripts/ci/check-invented-data-statics.mjs` (wired into `.github/workflows/ci.yml`),
  and the test helper `client/src/test-utils/assertNoInventedData.tsx`. Commit `b78d958e`.
- **WP-0.3b — Clinical screens: DONE (2026-09-23).** All six named screens / seven files fixed and
  verified (isolated tsc typecheck + vitest + the WP-0.3a static gate) across four commits:
  - `hospital/HospitalClinicalCDSS.tsx`, `hospital/HospitalTeleconsult.tsx` — fake active patient/
    suggestions/hardcoded card replaced with `EmptyState`. Commit `c26ceee6`.
  - `hospital/HospitalEHR.tsx` — removed the seeded fake "Rajesh Kumar" patient and the bug that kept
    it visible even after a genuinely-empty real API response; added retry-on-error. Commit `c26ceee6`.
  - `doctor/PatientEMR.tsx` — hardcoded prescriptions/labs/appointments replaced with real API calls.
    Commit `c26ceee6`.
  - `dept/BloodBankDashboardPage.tsx` — rewired to the real `server/routes/dept/bloodBank.route.js`
    endpoints; unbacked widgets (cross-match queue, 7-day trend, cold-chain temps) relabeled or
    placeholder'd rather than faked. Commit `df6043f9`.
  - `icu/ICUModulePages.tsx` + `icu/useICUPortalData.ts` — full rewrite; removed invented bed/nurse-
    ratio math and the dangerous fake-vitals `jitter()` simulation from the live monitor page. Commit
    `3da69c10`.
  - `ot/OTModulePages.tsx` + `ot/OTDashboard.tsx` + new `ot/useOTPortalData.ts` — full rewrite; removed
    the fabricated "live" vitals/HVAC/gas/IoT-registry theatre view (the module's most severe finding —
    fake vitals shown during "Active Surgery" with a "● live" badge) and a silent double-`/api`-prefix
    bug that had made the dashboard's own schedule fetch always 404. Commit `82ed5fe8`.
  
  Byproduct of this work: discovered `npx tsc --noEmit -p tsconfig.app.json` (the command CI actually
  runs) had been blocked by pre-existing JSX syntax errors in `src/components/admin/ChatDashboard.tsx`
  and `src/pages/chat/VideoChatdoctor.tsx`. Those syntax blockers are now fixed, but full client
  typecheck still reports an app-wide backlog, so CI typecheck remains advisory.
- **WP-0.3c — Executive and finance screens: DONE (2026-09-24).**
  - `server/routes/hospital/executive-dashboard.route.js`: `/coo/operations` now real (beds by ward, hourly
    admissions/discharges/ER arrivals, ALOS by ward, pending discharges, ER wait); `/cfo/financials` returns
    honest `null` + `dataAvailable` for AP/DSO/budget/cash-flow/dept-margin (no expense ledger exists) and
    real day-bucketed AR aging; new `/accounts/today` backs the Accounts dashboard.
    `hospital-billing.service.js`'s `getCeoDashboard` gained a real 12-month OPD/IPD/ER volume series and MTD surgeries.
  - Also fixed a latent bug found on the way: `liveStats()` filtered `beds.is_active`, a column that doesn't
    exist, so every exec dashboard silently reported 0 beds (the `.catch` swallowed it).
  - `COODashboard`, `CFODashboard`, `CEODashboard`, `AccountsDashboard` rewritten with loading/error/empty
    states. Removed fabricated NABH/JCI/AERB/CDSCO/Fire-NOC compliance scores, a fake insurance-settlement alert,
    strategic-initiative progress, and named fake patients/payers.
  - `AccountsModulePages`: Patient Accounts is real (aggregated from invoices, by patient ID); Insurance Billing,
    Expenses, Vendors, Payroll, Budget, Ledger, Journal, Chart of Accounts, Reports, Tax, Analytics and Settings
    (which pre-filled a fake GSTIN/PAN) are honest "not connected" pages. Bills and Payments were already real.
  - **Still placeholder (need real features, not just wiring):** COO staffing (HRMS attendance exists but needs
    aggregating), supply alerts (no reorder levels in SCM), maintenance/equipment (WP-1.7), per-payer settlements,
    department revenue (invoices carry no department), all Accounts finance-ledger pages.
  - Not touched: `AccountsSupportPage` (static help text; its helpdesk phone/email look invented — confirm or remove).
- **WP-0.3d — Department screens + server-side fabrication: IMPLEMENTED (2026-09-25).** The committed department pass (`03dc1eac`) rewired dietary, biomedical, and consent screens to live endpoints and removed fabricated records. The follow-up pass in the current worktree removes quality-portal fallback datasets, replaces quality empty/error states with database-backed or explicit unavailable states, removes random triage/remote-monitoring clinical fallbacks, and surfaces ICU-board load/SSE failures with retry/last-updated status. `node scripts/ci/check-invented-data-statics.mjs` passes with an empty operational allow-list; 29 static catalog/config arrays across 26 files are covered by file-local `invented-data-check: static-reference` annotations. The documented client JSX blockers were fixed in `ChatDashboard.tsx` and `VideoChatdoctor.tsx`; full client typecheck still has unrelated backlog and remains advisory.

- **Whole-package acceptance criteria (from the plan, verbatim):** with every API mocked to fail, no
  page shows a person name/count/trend that didn't come from the API; with every API returning empty,
  every page shows an explicit empty state; the lint rule passes with an **empty allow-list**; server
  responses never contain fabricated fallback objects (`null` + `dataAvailable: false` instead); the
  clinical lead signs off a walkthrough of ICU, EHR, theatre and blood-bank screens on a hospital with
  no data. **Remaining acceptance work:** clear the app-wide client TypeScript backlog and complete
  the clinical walkthrough.

Separately fixed this session, outside the plan's own WP-0.3 file list (found via a narrower, more
precise search than the plan's heuristic): `Ayushman.tsx` (fabricated government health-scheme coverage
data with no visible demo indicator — the highest-severity find of that pass), `HomecareModulePages.tsx`
(4 fake write actions, no backend at all), `TeamPharmacyEdit.tsx`. These are now honestly labeled, not
wired to real endpoints (none exist yet for any of them).

## Phase 1 (months 1–3) — status of packages touched so far

| WP | Status | Notes |
|---|---|---|
| 1.1 Allergy/problem list/reconciliation | Built, shadow mode | **Unverified**: the plan's acceptance criteria requires admission-cannot-complete / discharge-cannot-sign while reconciliation is unsigned, override-only. Confirm this specific hard gate exists (vs. just the underlying data model) before calling 1.1 fully done. |
| 1.2 Prescribing-time safety | Built, shadow mode, 41 test cases (plan asks 30+) | **Unverified**: plan specifies exactly "eight server paths" blocked. Recount actual gated routes against that number. |
| 1.3 Ledger/GST | Not started | |
| 1.4 Reliability (cron ownership, restore drill) | Not started | Directly related to today's shutdown-consolidation work but not the same scope — that fixed process shutdown, not cron job ownership/dedup. |
| 1.5 RLS scoping, remove on-request table creation | Not started | WP-0.5's tenant isolation is a dependency, already done; 1.5 itself is broader and separate. |
| 1.6 Entitlements/module packaging | Not started | |
| 1.7 CMMS/cold chain | Not started | |
| 1.8 NEWS2 + ER triage | **Done, server and client** | Matches every acceptance criterion in the plan. One gap: the plan's "four decision-point questions" guided ESI algorithm was not built into `ERRegister.tsx` — a manual 1–5 level picker was built instead. |
| 1.9 Auth consolidation / MFA | Not started | |
| 1.10 Essentials pack | Not started | |

## Phase 2 (months 4–9) — detailed implementation plan

This audit-remediation phase has not been re-cross-checked against the original Claude plan yet. The
v2 architecture docs (`MEDIQZY_V2_PHASE2_3_IMPLEMENTATION_STATUS.md` and
`MEDIQZY_V2_ALL_PHASES_IMPLEMENTATION_STATUS.md`) say a clinical-intelligence baseline exists, but
the remaining work below is what must be implemented or verified before Phase 2 can be called
production-complete under the stricter remediation-plan standard.

| Workstream | Current state | Pending implementation / verification | Acceptance gate |
|---|---|---|---|
| 2.1 Normalized clinical data foundation | Vitals-driven intelligence exists; cohort search intentionally supports a safe structured subset. | Normalize lab results into a dependable queryable model; map lab observations to stable units/ranges; backfill representative historical rows; make unsupported lab-query language explicit in UI/API. | HbA1c-style and similar lab-threshold queries either return verified results or a clear unsupported response; no cohort result is inferred from free text alone. |
| 2.2 Deterioration scoring and alert operations | NEWS2/qSOFA alerting is documented as implemented. | Verify `/hospital/practice/vitals` emits `intelligence.score`; verify alert creation for NEWS2 `>= 5`, qSOFA `>= 2`, and any single extreme parameter; add/confirm alert acknowledgement, owner, escalation, snooze, resolution, and audit trail. | A clinical SME can create test vitals, see the alert, acknowledge/escalate/resolve it, and export the audit trail. |
| 2.3 Clinical-alert governance | Alerts exist, but escalation ownership is not formalized. | Define alert routing by ward/department/role; document daily review responsibility; add stale-alert dashboard or report; define notification fallbacks when push/WhatsApp/email fail. | No critical alert can remain ownerless; unresolved alert aging is visible to an accountable role. |
| 2.4 Coding suggestions | Signed notes generate reviewable coding suggestions; suggestions are not auto-finalized. | Verify ICD/CPT suggestions never bypass clinician/coder approval; add precision sampling queue; log accepted/rejected suggestions and reasons; prevent billing finalization from unreviewed AI codes. | A signed note produces suggestions, a reviewer approves/rejects them, and only approved codes flow into billing. |
| 2.5 Doctor cohort search | Doctor-scoped cohort endpoint and dashboard UI exist. | Validate natural-language queries against known patient lists; restrict export/outreach actions until validation; add clear limitations for unsupported filters; log cohort-query provenance. | At least 10 representative queries have known expected cohorts and match within agreed tolerance; unsupported queries fail closed. |
| 2.6 Ambient scribe productionization | Ambient scribe MVP uses progressive HTTP chunk capture over the offline-scribe pipeline. | Build or verify production WebSocket streaming; add explicit patient/doctor consent capture; define audio retention/deletion policy; add pause/resume/delete controls; add transcript correction audit. | Controlled pilot can complete start, pause, resume, finalize, review, sign, and delete/retain flows with consent recorded. |
| 2.7 Clinical pilot and sign-off | Software paths exist but are not signed off as production clinical workflows here. | Run controlled pilots for deterioration alerts, coding suggestions, cohort search, and ambient scribe; collect false-positive/false-negative notes and usability defects. | Clinical lead signs off pilot results, limitations, and go/no-go criteria before broad rollout. |
| 2.8 Observability and rollback | Not documented for this phase. | Add metrics for alert volume, suggestion acceptance, cohort query failure rate, scribe finalization failures, and notification delivery; add feature flags for each clinical-intelligence feature. | Each Phase 2 feature can be disabled independently without redeploying and has dashboard/log evidence. |

Suggested Phase 2 build order:

1. Re-cross-check original Phase 2 plan against code and update this table with exact WP numbers if the source plan names them.
2. Close the normalized lab-result foundation first, because cohort search and future clinical analytics depend on it.
3. Harden deterioration alerts: owner/escalation/audit before any high-severity clinical rollout.
4. Lock down coding-suggestion governance so AI cannot silently become billing truth.
5. Productionize ambient scribe only after consent, retention, and transport decisions are signed off.
6. Run clinical pilot and sign-off as the exit gate.

## Phase 3 (months 10–18) — detailed implementation plan

The v2 docs say a department-operations baseline exists for CSSD, procurement/GRN, discharge planning,
central-store posting, payroll, and cross-department audit. There is one internal doc conflict: the
Phase 2/3 status file says GRN-to-stock posting is complete, while the implementation runbook says not
to treat GRN completion as central-store posting yet. Phase 3 should start with verification rather
than new scope.

| Workstream | Current state | Pending implementation / verification | Acceptance gate |
|---|---|---|---|
| 3.1 CSSD end-to-end workflow | CSSD API/pages are documented as implemented. | Verify create instrument set, raise job, run sterilization cycle, release cycle, release job, and return set to `available`; verify failed/held cycle behavior. | CSSD department champion signs off one clean workflow and one exception workflow with audit trail. |
| 3.2 Procurement and GRN workflow | Vendor, PO, approval, GRN, and metrics are documented as implemented. | Verify add vendor, create PO, approve PO, create GRN, and confirm PO moves to `received`; verify partial GRN, rejected approval, and duplicate invoice/GRN protections. | Procurement lead signs off full and partial receiving flows with audit/export evidence. |
| 3.3 Central-store stock ledger | Status docs disagree on whether GRN completion posts stock. | Inspect actual code/data path; if missing, implement GRN-to-stock posting with ledger entries, item/batch/expiry/location, reversal/correction workflow, and stock valuation hooks. | Completing a GRN posts auditable stock ledger rows exactly once; rollback/correction is controlled and audited. |
| 3.4 Payroll structures and runs | Payroll structures/run processing are documented as implemented. | Verify salary structures, allowances/deductions, payroll run creation, approval, payslip generation, and integration boundary with finance ledger/GST work. | HR/payroll owner can run a test payroll, approve it, export payslips, and reconcile totals; no payroll data is fabricated. |
| 3.5 Payroll-finance integration cleanup | Phase 1 `WP-1.3 Ledger/GST` is not started, so finance integration is necessarily incomplete. | Define interim accounting export if full ledger is unavailable; later connect payroll liabilities, payments, and statutory deductions to the real ledger. | Payroll can either export a signed accounting file or post to ledger; the limitation is visible and documented. |
| 3.6 Discharge planning | Owner, target date, blockers, and multidisciplinary tasks are documented as implemented. | Verify admission-linked discharge plans, blockers, task ownership, target date changes, escalation, completion, and handoff to discharge summary/counselling/PREMS. | A real inpatient can move from discharge-planning start to completed discharge with every blocker/task audited. |
| 3.7 Cross-department approvals and audit | Audit expansion across CSSD, procurement, dietary, and stores is documented as complete. | Verify approval policy, role checks, event log completeness, exportability, and immutable fields for each department workflow. | For each department, an approver and auditor can reconstruct who changed what, when, and why. |
| 3.8 Department dashboards and empty/error states | Baseline pages exist. | Ensure every Phase 3 page has loading, empty, error, retry, and permission-denied states; remove any operational fallback data that escaped WP-0.3. | With APIs failing or empty, no Phase 3 page presents invented counts, trends, or records. |
| 3.9 Training, SOPs, and go-live readiness | Not documented as completed. | Write SOPs and quick-start scripts for CSSD, procurement/stores, payroll, and discharge planning; assign department champions; prepare migration/import templates. | Implementation owner can run a go-live rehearsal with named owners and rollback path. |

Suggested Phase 3 build order:

1. Resolve the GRN-to-stock document conflict by reading code and running a controlled test transaction.
2. Run CSSD and procurement acceptance tests, including exception paths.
3. Verify discharge planning against a real inpatient journey and connect it to discharge summary/counselling/PREMS.
4. Verify payroll independently, then define the interim finance export until `WP-1.3 Ledger/GST` is complete.
5. Audit all Phase 3 pages for WP-0.3-style empty/error honesty.
6. Complete SOPs, owner training, and department sign-off as the exit gate.

Phase 2/3 shared exit criteria:

- Original phase plan has been re-cross-checked against code, not only against status docs.
- Every high-risk workflow has backend, frontend, permissions, audit trail, empty/error states, and focused tests.
- Every clinical workflow has named clinical owner sign-off.
- Every operational workflow has named department champion sign-off.
- No workflow depends on fabricated fallback data.
- Production deployment includes rollback plan, feature flags where appropriate, and post-deploy smoke tests.

## Recommended next steps, in priority order

1. ~~**WP-0.3a**~~ — done 2026-09-23.
2. ~~**WP-0.3b**~~ (clinical screens: ICU, EHR's fake-patient bug, PatientEMR, OT, Blood Bank, Clinical
   CDSS, Teleconsult) — done 2026-09-23, **deployed to production 2026-09-24** together with WP-0.3a and
   the executive/finance pass of WP-0.3c.
3. ~~**WP-0.3c remainder + WP-0.3d**~~ — implemented; WP-0.3c/0.3d production build and static fabrication checks pass. Remaining package acceptance work is the app-wide TypeScript backlog plus the clinical walkthrough below.
4. **Complete the remaining whole-package acceptance work** — clear the app-wide client TypeScript backlog and complete the clinical walkthrough. The static fabrication gate and allow-list are now clean; production build is green.
5. **Verify WP-1.1 and WP-1.2's specific unverified acceptance criteria** (the hard admission/discharge
   gate; the exact eight-server-path count) — likely small fixes if gaps are found, since the
   underlying services already exist.
6. **WP-0.7's off-host backup IAM fix** — currently zero off-host backup copies exist; this is a real
   disaster-recovery gap, not just a checklist item.
7. **WP-0.1's owner-action items** — whenever a maintenance window can be scheduled.
8. Everything else in Phase 1 (1.3–1.7, 1.9, 1.10) — not started, no evidence of urgency beyond the
   plan's own phase sequencing.
9. **Phase 2 planning gate** — re-cross-check the original Phase 2 plan, then execute the clinical-intelligence
   hardening plan above.
10. **Phase 3 planning gate** — after Phase 2 and the critical Phase 1 gaps are closed, resolve the
   GRN-to-stock conflict and execute the department-operations acceptance plan above.
