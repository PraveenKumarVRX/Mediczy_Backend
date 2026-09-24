# Implementation status and next steps

Cross-checked 2026-09-23 against the full audit remediation plan (Claude Docs
`f13b5222-7b0f-448a-bafb-1429af842699`, "MediQzy Audit Remediation — Detailed Implementation Plan").
This file exists because that check found real gaps between what prior sessions reported as "done"
and what the plan actually specifies — most notably WP-0.3, which turned out to be four sub-packages
covering ~20 specific screens, of which only a handful had been touched. Re-run this cross-check
whenever picking this project back up after a gap; both the plan and the codebase move.

## Phase 0 (weeks 0–3)

| WP | Status | Evidence / what's left |
|---|---|---|
| 0.1 Secrets | **Safe subset only** | `.gitignore` fixed, 10 real-value `.env*` files untracked, a silent default-password endpoint closed, `SSM_REQUIRED` fail-closed option added, local pre-commit gitleaks hook added. **Owner action, not done**: rotate the live DB password and JWT secrets (signs out every user — needs an announced window), rotate third-party keys, reset every test account password, then `git-filter-repo` + force-push to purge history (freezes merges, everyone re-clones). |
| 0.2 Access-rules deploy | Live | Deployed and verified against real role logins. |
| 0.3 No invented data | **WP-0.3a + WP-0.3b done; WP-0.3c partial; WP-0.3d remains** | See below. |
| 0.4 Payments | Live | Migration applied to production. |
| 0.5 Tenant isolation (SCM/blood bank/CSSD/dietary) | Done | 98-check verification script, non-superuser role. |
| 0.6 CI gate and release pipeline | Partial | `ci.yml`, gitleaks CI job, `/healthz`, real gating health check + auto-revert all built and now proven across 4 real deploys today. **Not done**: the pipeline itself has never actually run on GitHub Actions (no `gh auth login` access to verify); branch protection not applied; `CODEOWNERS` still has placeholder usernames. |
| 0.7 Backup integrity | Partial | Scripts built and tested locally, live for nightly runs. **Not done**: off-host S3 upload fails with `AccessDenied` (IAM), so there is currently no off-host copy; freshness cron not installed; no restore drill ever run. |
| 0.8 Allergy hotfix | Live | Verified against real production rows. |

### WP-0.3 in full — what the plan actually asks for

The plan splits this into four sub-packages. Status as of 2026-09-23:

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
  runs) silently reports zero diagnostics for the entire program, because a pre-existing syntax error in
  `src/components/admin/ChatDashboard.tsx` short-circuits type-checking once pulled in transitively —
  proven with a planted test error. Real verification for this session used a temporary isolated
  `tsconfig.isolated.json` (`"files"` list, not `"include"`) excluding that file. **Not fixed**: the
  underlying `ChatDashboard.tsx` syntax error, and therefore CI's own typecheck step, remain broken —
  see follow-ups below.
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
- **WP-0.3d — Department screens + server-side fabrication (not started):**
  `server/controller/quality-portal.controller.js` (defines and returns fallback constants when data is
  missing — delete them, return real data only), `quality/QualityModulePages.tsx` (14 seed arrays),
  `dept/DietaryDashboardPage.tsx`/`DietaryMonitoringPage.tsx`/`DietaryModulePages.tsx`,
  `dept/BiomedicalDashboardPage.tsx`/`BiomedicalMonitoringPage.tsx`/`BiomedicalModulePages.tsx`,
  `dept/ConsentDashboardPage.tsx`, random-number vitals in `doctor/DoctorTriage.tsx` **and**
  `RemoteHealthMonitoring.tsx` (the plan wants these *deleted*, not just labeled — a stricter bar than
  the "already-labeled demo mode is fine" allowance an earlier pass applied to
  `RemoteHealthMonitoring.tsx`'s ICU/ER modes; reconcile this before touching that file again),
  `display/ICUBoardDisplay.tsx` (swallows errors silently — needs a visible "data may be stale, last
  updated at" marker).
- **Whole-package acceptance criteria** (from the plan, verbatim): with every API mocked to fail, no
  page shows a person name/count/trend that didn't come from the API; with every API returning empty,
  every page shows an explicit empty state; the lint rule passes with an **empty allow-list**; server
  responses never contain fabricated fallback objects (`null` + `dataAvailable: false` instead); the
  clinical lead signs off a walkthrough of ICU, EHR, theatre and blood-bank screens on a hospital with
  no data.

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

Phase 2 (months 4–9) and Phase 3 (months 10–18) are not expected yet and were not checked in detail.

## Recommended next steps, in priority order

1. ~~**WP-0.3a**~~ — done 2026-09-23.
2. ~~**WP-0.3b**~~ (clinical screens: ICU, EHR's fake-patient bug, PatientEMR, OT, Blood Bank, Clinical
   CDSS, Teleconsult) — done 2026-09-23, **deployed to production 2026-09-24** together with WP-0.3a and
   the executive/finance pass of WP-0.3c.
3. **WP-0.3c remainder + WP-0.3d** (accounts screens; department screens + `quality-portal.controller.js`
   server-side fabrication) — lower clinical risk, real financial-integrity risk. Next up.
4. **Fix `ChatDashboard.tsx`'s syntax error** (found as a byproduct of WP-0.3b) — CI's real typecheck
   command currently passes vacuously for the whole client. This is a correctness gap in the safety net
   itself, not just a code-quality item.
5. **Verify WP-1.1 and WP-1.2's specific unverified acceptance criteria** (the hard admission/discharge
   gate; the exact eight-server-path count) — likely small fixes if gaps are found, since the
   underlying services already exist.
6. **WP-0.7's off-host backup IAM fix** — currently zero off-host backup copies exist; this is a real
   disaster-recovery gap, not just a checklist item.
7. **WP-0.1's owner-action items** — whenever a maintenance window can be scheduled.
8. Everything else in Phase 1 (1.3–1.7, 1.9, 1.10) — not started, no evidence of urgency beyond the
   plan's own phase sequencing.
