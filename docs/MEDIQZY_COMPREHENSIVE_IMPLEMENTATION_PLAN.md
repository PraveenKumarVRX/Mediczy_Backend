# MediQzy comprehensive implementation plan

Status date: 2026-09-25

This is the consolidated implementation plan for audit remediation and the MediQzy v2 roadmap. It
merges the active planning/status material from:

- `docs/IMPLEMENTATION_STATUS_AND_NEXT_STEPS.md`
- `docs/WP0.3_INVENTED_DATA_INVENTORY.md`
- `MEDIQZY_V2_PHASE1_BACKLOG.md`
- `MEDIQZY_V2_PHASE2_3_IMPLEMENTATION_STATUS.md`
- `docs/architecture/MEDIQZY_V2_ALL_PHASES_IMPLEMENTATION_STATUS.md`
- `docs/architecture/MEDIQZY_V2_CAPABILITY_MATRIX.md`
- `docs/architecture/MEDIQZY_V2_IMPLEMENTATION_ROADMAP.md`
- `docs/architecture/MEDIQZY_V2_IMPLEMENTATION_RUNBOOK.md`

Historical documents remain useful evidence, but this file is the single working plan for execution,
cross-checks, implementation sequencing, frontend/backend scope, UI design, validation, and release
gates.

## 1. Operating rules

### 1.1 Status legend

| Status | Meaning |
|---|---|
| Done | Code path exists, is deployed or deployable, and acceptance evidence exists. |
| Implemented baseline | Backend and frontend exist, but clinical/operational validation or hardening is still required. |
| Partial | Some building blocks exist, but the workflow is not production-complete. |
| Not started | No meaningful implementation or only a shell route/page exists. |
| Gated | Software may exist, but production completion depends on external data, hardware, governance, or clinical validation. |

### 1.2 Non-negotiable implementation standards

Every clinical, financial, operational, HR, insurance, or administrative workflow must meet these
standards before it is called complete:

1. Backend has real persistence, tenant scoping, validation, errors, audit trail, and no request-time table creation.
2. Frontend uses real APIs and shows loading, empty, error, retry, permission-denied, and success states.
3. UI never presents fabricated records, counts, names, trends, alerts, vitals, financials, or stock as live data.
4. User actions do not show success unless the backend write actually succeeds.
5. Role-based access is enforced on the server, not only hidden in navigation.
6. Critical workflows have audit events that answer who, what, when, where, why, and before/after state.
7. High-risk features are feature-flagged or can be disabled without a full redeploy.
8. Tests are proportional to risk: syntax checks for narrow backend changes, unit tests for pure logic, API smoke tests for routes, and browser smoke tests for user-facing workflows.
9. Production deployment has rollback notes, health checks, logs reviewed after reload, and post-deploy smoke evidence.

### 1.3 Data-state UI rule

Every data surface must be in exactly one of these visible states:

| State | UI requirement |
|---|---|
| Loading | Skeleton, spinner, or progress indicator; no guessed content. |
| Live | Data came from a successful API call or trusted server event. |
| Empty | API succeeded and returned no records; show an explicit empty state and next action if available. |
| Error / unavailable | API failed or capability lacks a data source; show reason, retry, and support/debug context where useful. |
| Demo / simulated | Only allowed when visibly labeled as demo/simulated and never mixed with live clinical or financial state. |

## 2. Shared architecture plan

### 2.1 Backend baseline

Backend work should follow the existing Express/Postgres pattern unless a module already has a more
specific local pattern.

Required backend shape for every module:

- Route file under `server/routes/...`.
- Service layer for reusable business logic under `server/services/...` when logic exceeds route CRUD.
- Migration file for new tables, indexes, enum changes, and audit tables.
- Tenant scoping through `organization_id`, `corporate_id`, `hospital_id`, or existing association tables.
- Server-side authorization middleware appropriate to the portal.
- Structured errors with stable `code` where clients need branch behavior.
- Audit insert for create/update/delete/approve/finalize/escalate/export actions.
- No silent fallbacks to invented objects.
- No local-only persistence for business records.
- Export endpoints for regulated workflows when the department needs audit packets or CSV/PDF output.

Preferred route design:

- `GET /module` list with filters, pagination, tenant scoping.
- `GET /module/:id` detail with access check.
- `POST /module` create with validation.
- `PATCH /module/:id` partial update with audit event.
- `POST /module/:id/actions/<action>` for business transitions such as approve, release, finalize, acknowledge, escalate, resolve.
- `GET /module/:id/audit` when the record has regulated history.
- `GET /module/export` for CSV/PDF export where required.

### 2.2 Frontend baseline

Frontend work should follow the current Vite/React/TypeScript/shadcn/lucide conventions.

Required frontend shape:

- Page or module component under the existing portal path.
- API wrapper functions or localized fetch helpers using `client/src/utils/api`.
- Loading, empty, error, retry, permission-denied, and success states.
- Optimistic UI only when rollback is implemented; otherwise wait for server response.
- Form validation before submit and server error display after submit.
- Stable table/list dimensions so status text and actions do not shift layout.
- Icon buttons from `lucide-react` for common actions.
- Accessible labels/tooltips for icon-only actions.
- Responsive behavior for desktop, tablet, and mobile where the portal is used outside a workstation.
- No nested cards inside cards. Use cards only for repeated items, modals, or framed tools.

### 2.3 UI design system

The product is an operational healthcare system, not a marketing site. UI should be quiet, dense, and
scan-friendly.

Layout:

- Keep portal shells consistent: sidebar, top context bar, module heading, primary action area, table/detail split where needed.
- Use full-width sections with constrained inner content, not floating decorative sections.
- Use tabs for major subviews inside a module.
- Use segmented controls for mode filters.
- Use badges for status only when the status is persisted or derived from persisted state.
- Use dialogs/drawers for create/edit flows that do not deserve a full page.
- Use detail side panels for audit history, attachments, or selected-row detail.

Tables:

- Default to searchable, filterable, paginated tables for operational lists.
- Required columns: primary identifier, patient/employee/item/vendor, status, owner, updated date, action menu.
- Put destructive actions in an overflow menu or confirmation dialog.
- Long text wraps inside cells; never allow overflow over adjacent columns.

Forms:

- Group fields by business meaning, not by database column order.
- Required fields are visually clear and validated client and server side.
- Show save state: unsaved, saving, saved, failed.
- For clinical forms, separate draft from final/sign/submit.
- For regulated actions, show irreversible action confirmation with the business effect, not generic "Are you sure?"

Clinical alerts:

- Severity colors must be consistent:
  - Critical: red.
  - Warning: amber.
  - Stable/safe: emerald.
  - Informational: blue/slate.
- Every alert shows reason, measured value, threshold, timestamp, owner, and next action.
- Alert banners must not cover patient identifiers or primary actions.

Dashboards:

- KPIs must state whether they are live, unavailable, or partial.
- Do not show fake trend charts.
- If a metric is unsupported, show unavailable with the missing data source.
- Avoid one-color dashboards; use restrained neutral base plus semantic colors.

## 3. Phase 0: safety, trust, and release foundation

Phase 0 is partly complete. Remaining work is mostly owner action, release governance, disaster
recovery, and acceptance validation.

### 3.1 WP-0.1 secrets

Status: partial; safe subset complete.

Backend implementation:

- Rotate live DB password.
- Rotate JWT and refresh-token secrets.
- Rotate third-party credentials for email, WhatsApp, SMS, payment, storage, AI, and any integration keys.
- Enable `SSM_REQUIRED` or equivalent fail-closed secret loading in production.
- Remove any permissive default credentials.
- Run `git-filter-repo` to purge leaked historical secrets after owner-approved freeze.

Frontend implementation:

- Ensure no frontend env files contain real secrets.
- Verify only public runtime config is exposed in built assets.
- Add a small environment diagnostics page only for admin/super-admin if needed, with no secret values.

UI design:

- Admin security status should show pass/fail/unknown for secret health, never secret content.
- Use a checklist UI with owner, due date, and maintenance-window status.

Acceptance:

- All users can be forced to re-authenticate after JWT rotation.
- CI secret scan passes.
- Production starts fail-closed when required secrets are missing.
- Team acknowledges force-push/re-clone window after history purge.

### 3.2 WP-0.2 access rules

Status: live.

Pending implementation:

- Keep periodic route-to-role audits.
- Add regression smoke for representative real role logins.

UI design:

- Permission-denied pages should state the portal/module and request-contact path.
- Navigation should hide inaccessible modules but server must still enforce access.

### 3.3 WP-0.3 no invented data

Status: implementation complete; acceptance still needs TypeScript backlog and clinical walkthrough.

Backend implementation:

- Maintain server responses that return `null` plus `dataAvailable: false` for unsupported metrics.
- Never mask SQL failures as empty arrays.
- Keep fabricated fallback objects out of controllers and services.

Frontend implementation:

- Keep `DataState` and `EmptyState` patterns as the default.
- Remove or label any remaining demo-only UI discovered by future greps.
- Clear app-wide TypeScript backlog so typecheck can become a hard CI gate.

UI design:

- Empty states must be operational: what is missing, why it is empty, and what action is possible.
- Error states must include retry and a short support/debug hint.
- Demo states must carry a visible badge in the module header and near generated data.

Acceptance:

- Static invented-data gate passes with an empty operational allow-list.
- With APIs mocked to fail, no page shows invented records/counts/trends.
- With APIs returning empty, every page shows explicit empty state.
- Clinical lead signs off ICU, EHR, theatre, and blood-bank walkthrough on a no-data hospital.

### 3.4 WP-0.4 payments

Status: live.

Pending implementation:

- Keep payment reconciliation smoke tests.
- Ensure error states show gateway failure without duplicate payment attempts.

### 3.5 WP-0.5 tenant isolation

Status: done for scoped modules.

Pending implementation:

- Expand tenant isolation checks as new modules are added.
- Prefer non-superuser verification scripts for every new high-risk module.

### 3.6 WP-0.6 CI gate and release pipeline

Status: partial.

Backend implementation:

- Prove GitHub Actions run on pull requests and pushes to main.
- Make health gates block bad releases.
- Keep auto-revert script tested against real failed health check.

Frontend implementation:

- Run production build in CI.
- Add focused browser smoke for changed critical routes.

UI design:

- No direct UI, but release dashboard can show branch, commit, environment, build, deploy, and health.

Acceptance:

- Branch protection enabled.
- `CODEOWNERS` has real owners.
- CI has no advisory-only checks for security or invented-data gates.

### 3.7 WP-0.7 backup integrity

Status: partial.

Backend/infrastructure implementation:

- Fix S3/IAM `AccessDenied` for off-host backup upload.
- Install backup freshness cron.
- Run restore drill into isolated database.
- Store restore logs and checksums.

Acceptance:

- At least one fresh off-host backup exists.
- Restore drill proves database can be recovered.
- Alert fires when backup freshness exceeds threshold.

### 3.8 WP-0.8 allergy hotfix

Status: live.

Pending implementation:

- Keep regression tests for allergy data visibility and safety checks.

## 4. Phase 1: enterprise readiness and core hardening

Phase 1 has two overlapping tracks:

- Audit-remediation WPs 1.1 to 1.10, where several items are still not started.
- v2 enterprise-readiness work, where many baselines are marked implemented but need owner sign-off and production hardening.

### 4.1 WP-1.1 allergy, problem list, reconciliation

Status: built in shadow mode; enforcement unverified.

Backend:

- Verify admission-complete endpoint blocks when reconciliation is unsigned.
- Verify discharge-sign endpoint blocks when reconciliation is unsigned.
- Implement override-only path with reason, user, timestamp, and patient context.
- Emit audit event for unsigned block, override, sign, and reconciliation update.

Frontend:

- Admission and discharge screens must show reconciliation status before final action.
- Blocking state must explain exactly what is unsigned and who can sign.
- Override dialog must require reason and show risk statement.

UI design:

- Use a reconciliation banner near final action, not buried in a tab.
- Status: `Signed`, `Unsigned`, `Override required`, `Blocked`.

Acceptance:

- Admission and discharge cannot complete unsigned unless override path is used.
- Override is auditable and visible in patient record.

### 4.2 WP-1.2 prescribing-time safety

Status: built in shadow mode; the eight server paths are now counted, enforced and covered by a
test. A ninth, ungated path was found and closed in `79555c53`. Behavioural verification and
clinical sign-off remain.

Recounted server paths that create or change medication — the plan's "eight" was correct, and a
ninth had appeared:

| Path | Source |
|---|---|
| `prescription.create` | `POST /api/prescriptions` |
| `prescription.update` | `PUT /api/prescriptions/:id` |
| `prescription.issue` | `POST /api/prescriptions/:id/issue` |
| `prescription.status-issued` | `PATCH /api/prescriptions/:id/status` |
| `prescription.from-appointment` | `POST /api/prescriptions/from-appointment/:appointmentId` |
| `emar.order` | `POST /api/v1/emar/orders` |
| `hospital.practice.prescription` | `POST /api/hospital/practice/prescriptions` |
| `hospital.practice.pharmacy-dispense` | `POST /api/hospital/practice/pharmacy/prescriptions` |

The ninth was found by writing the coverage test, not by reading the plan: the pharmacy dispensing
route recorded a medicine going to a patient with no gate at all, while the sibling
`POST /prescriptions` in the same file was gated. Its gate resolves `medicineId` to a drug name
first, because the class and interaction rules match on the name — a gate handed only an id would
have found nothing and passed vacuously, which reads as coverage while checking nothing.

Deliberately **not** gated, with reasons recorded in the test: bedside administration, hold, and
discontinue. They create no medication, and blocking a discontinue would block safe clinical
action. Lab and imaging orders are not drugs.

Backend delivered:

- Hard blocks for allergy (exact, class, and cross-reaction), critical interaction, drug-condition,
  duplicate therapy, and dose, from approved knowledge-fabric classes only — no model output sets a
  threshold or a class membership.
- Per-organization mode (`clinical_safety_settings`): `shadow` computes and logs and never blocks;
  `enforce` returns 409 `SAFETY_BLOCK` unless a clinical role supplies an override with a reason of
  at least 10 characters and an acknowledgement covering every blocker.
- Issuing paths **fail closed** with 503 `SAFETY_UNAVAILABLE` if the safety service itself errors;
  drafts fail open with a visible `X-Safety-Check: unavailable` header.
- `prescribing-route-coverage.test.js` reads route sources as text and asserts each write path's own
  middleware chain carries the gate, so a gate declared but never mounted cannot satisfy it. Ungated
  writes are an explicit allowlist with written justifications.

The static test proves a gate is *present*, not that it *runs* — so `prescribing-behaviour.test.js`
closes that gap (commit `d07295a2`). It drives real HTTP through a real Express app and the real
router, with the gate, `checkPrescriptionSafety`, `evaluatePrescriptionSafety` and `matchAllergy`
all real; only the data they read is stubbed, so the scenario is fixed and no assertion depends on a
seeded database. Patient 42 has a recorded penicillin allergy; issuing amoxicillin must be refused.

**Two distinctions the behavioural work made explicit, which had been assumed rather than known:**

- The gate splits DRAFT paths (create / update / from-appointment — evaluate, log, never block)
  from ISSUING paths (issue, status-issued, eMAR order, practice, pharmacy — these can be blocked).
  A draft is a working document; refusal is asserted on the issue path, where a prescription actually
  becomes an order a patient receives. Both behaviours are asserted separately.
- A non-clinical override is refused at 403 by `authDoctor` before the gate would give 409. That is
  defence in depth, and the test asserts that nothing was issued rather than a specific status.

**Regression proven by experiment, not assumed:** deleting the gate from the issue route turns 7 of
the 9 behavioural tests red, including the refusal test. That is the failure this suite exists to
catch, and the static suite alone does not catch it.

One implementation note found here: `getSafetyMode` caches per organization for 30s, so any test
needing a different mode must use a different organization id or it silently reads a stale entry.

Frontend: `PrescriptionSafetyAlert` drives itself entirely off the server response — it never decides
what is safe, only presents what the server decided and collects the override the server asked for.

Acceptance:

- [x] Every medication write route is behind the safety gate. (9/9; static coverage test)
- [x] The issuing path *behaviourally* refuses an unsafe prescription. (real Express app; deleting
      the gate turns the suite red)
- [x] No frontend-only bypass exists. (the UI component cannot decide safety)
- [ ] Clinical sign-off from a prescribing lead.
- [ ] `shadow` → `enforce` rollout, once alert volume and false positives are reviewed.


### 4.3 WP-1.3 ledger and GST

Status: implemented baseline, verified against a real PostgreSQL 16 database. Not yet applied to any
live database, and the frontend is not built.

Delivered and verified (commit `179abb9d`; `npm run test:phase1-finance-dryrun`, 38/38 checks as a
non-superuser app role on a disposable database):

- Chart of accounts, journal entries/lines, vendors, expenses, budgets, tax codes, fiscal periods, with
  `organization_id` scoping and RLS on every finance table.
- Journal numbers come from a sequence, not `COUNT(*) + 1`. Postings are idempotent on
  `(organization_id, source_type, source_id)`, enforced by a partial unique index, and a genuine
  3-way concurrent race collapses to exactly one entry.
- Reversal posts an offsetting entry; posted amounts are never mutated.
- Posting adapters for invoice, payment, insurance settlement, refund, adjustment, and expense, each
  wired to the real billing flow. Adapter failure is reported (`ledger.posted=false`) rather than
  rolling back the clinical transaction.
- Reports: trial balance, profit and loss, balance sheet, tax summary, ledger CSV. All balance in the
  dry run. Tax summary reads `finance_expenses.expense_date` (it previously queried a nonexistent
  `entry_date` column and threw on every call).
- Fiscal periods: create, close, closed-period posting refusal.

Backend still outstanding:

- **Live migration.** The migration has only ever run on a disposable local database. There is no
  staging environment (see section 11.1), so the "staging first" gate cannot currently be satisfied.
- **Payroll, procurement, pharmacy posting adapters** — not started.
- Per-transaction tax/GST treatment. The tax summary is expense-side only; output GST on invoices and
  input-GST credit reconciliation are not wired, and the summary reports this in its own `note` field,
  which the UI surfaces.

Insurance settlement is **done**, and this was verified rather than assumed. ERA remittances post
through `recordPayment()`, and the payment spec routes a payment carrying `insurance_claim_id` to the
*insurance* receivable rather than the patient's. Calling `postInsuranceSettlement()` there as well
would double-post the same cash, so it remains the standalone adapter for settlements that do not
arrive as a payment row.

Gateway refunds (commit `98610b09`): a gateway refund was previously a dead end — the row was written
as `pending_gateway` and nothing ever completed it, so a patient could be owed money indefinitely with
no ledger trace. `requestGatewayRefund` → `confirmGatewayRefund` now completes the lifecycle, and the
webhook (`POST /api/hospital/billing/refunds/webhook`) is the only path that posts a gateway refund to
the ledger, because cash only leaves when the gateway says it did. A failed refund reinstates the
invoice and posts nothing. `GET /refunds/pending` surfaces unanswered refunds.

Frontend (delivered in `98610b09`): Financial Reports (trial balance, P&L, balance sheet, tax summary
with a stated range, balanced/out-of-balance badge, CSV export), Journal Entries with reversal behind
a required reason, and Fiscal Periods with create/close. Loading, empty, error and retry states
throughout.

Frontend still outstanding: KPI-to-source drill-down, budget authoring, and a posting UI for manual
journal entries (the API exists; only list and reverse are exposed in the UI).

UI design:

- Finance UI should be dense and table-first.
- Use side panel for journal line details and source document.
- Do not show fake GST/PAN/default settings.

Acceptance:

- [x] A real invoice posts to AR and revenue. (dry run)
- [x] A real payment posts cash/bank and clears AR. (dry run)
- [x] Insurance remittance clears the insurance receivable, not patient AR. (dry run + adapter test)
- [x] A gateway refund reaches the ledger only on gateway confirmation. (6 lifecycle tests)
- [x] GST report is generated from real postings. (expense-side only; output GST still pending)
- [ ] Same, on a live tenant database.

### 4.4 WP-1.4 reliability

Status: not started.

Backend/infrastructure:

- Cron ownership/deduplication across PM2/cluster/worker processes.
- Job lease table with heartbeat and expiry.
- Restore drill operating process.
- Shutdown handler hardening for null resources.

Frontend:

- Admin operations page for job status, last run, next run, owner, failures, and replay.

UI design:

- Use status table with `Running`, `Healthy`, `Failed`, `Stale`, `Disabled`.
- Provide replay only behind explicit confirmation.

Acceptance:

- Scheduled jobs do not duplicate across reloads.
- Failed jobs are visible and replayable.

### 4.5 WP-1.5 RLS scoping and no on-request table creation

Status: not started.

Backend:

- Inventory remaining dynamic `CREATE TABLE` or migration-at-request-time patterns.
- Move schema changes to migrations.
- Apply RLS or equivalent tenant scoping to all high-risk tables.
- Add static tenant-isolation tripwire and representative runtime checks.

Frontend:

- No direct UI except clear errors when tenant context is missing.

Acceptance:

- Tenant A cannot read/write Tenant B through direct API calls.
- No production request path creates schema.

### 4.6 WP-1.6 entitlements and module packaging

Status: implemented baseline (backend only). Verified on a real database as a non-superuser role.
Admin UI, nav filtering, and request-access state are not built.

Delivered and verified (commit `179abb9d`; dry run checks "entitlement visible under tenant RLS
context" / "other tenant denied" / "a different org_id sees zero rows"):

- `entitlement_packages` and `tenant_entitlements` with `organization_id` scoping and RLS.
- `hasModuleEntitlement` / `requireModuleEntitlement` enforce module access in middleware, so
  enforcement is server-side rather than navigation-only.
- Platform-admin APIs: list, grant, revoke, and a tenant bootstrap that seeds the chart of accounts,
  GST codes, the current fiscal period, and the first `accounts_finance` grant. Bootstrap is
  idempotent.
- Entitlement reads run inside a tenant RLS transaction. They previously read the bare pool, which
  under an RLS policy returns nothing, so every check silently evaluated false.

Still outstanding:

- **Live tenant validation.** No real tenant has been provisioned with `accounts_finance`.
- Admin entitlement management UI, including package, enabled modules, exceptions, and dates.
- Portal navigation filtered by entitlements, and an upgrade/request-access state for disabled
  modules rather than a broken screen.
- Entitlement audit UX. Grants and revocations are now written to `operations_audit_log` in the
  same transaction as the change they describe, so a failed change leaves no orphan audit row and a
  successful one cannot be unaudited. There is still no viewer screen for that history.
- Coverage is not proven: only `accounts_finance` is wired to `requireModuleEntitlement`. Which
  other modules are supposed to be package-gated has not been enumerated, so "all paid modules are
  enforced" is currently an assumption rather than a verified fact.

Acceptance:

- [x] Unlicensed module is inaccessible by route and API. (enforcement implemented; UI not built)
- [x] Entitlement checks are tenant-scoped and fail closed without an RLS context.
- [x] Audit records who changed entitlements, when, and in the same transaction as the change.
      (No viewer screen yet.)
- [ ] Verified on a live tenant.

### 4.7 WP-1.7 CMMS and cold chain

Status: not started.

Backend:

- Equipment registry, preventive maintenance schedules, breakdown tickets, calibration certificates, spare parts, vendor contracts, cold-chain devices, temperature readings, excursions, corrective action.
- Device ingestion path for IoT or manual entry.

Frontend:

- Biomedical/maintenance dashboard.
- Cold-chain monitoring dashboard.
- Ticket queue, calendar, equipment detail, certificate upload.

UI design:

- Equipment detail page: asset identity, status, location, last maintenance, next due, open tickets, documents.
- Cold-chain chart must show actual readings and excursions; no generated temperatures.

Acceptance:

- Maintenance due list is real.
- Cold-chain excursion creates alert and audit entry.

### 4.8 WP-1.8 NEWS2 and ER triage

Status: mostly done. The guided ESI item previously listed as pending is now complete — this
section was stale.

Delivered:

- **Guided four-question ESI decision tree** (`client/src/utils/erGuidedTriage.ts`), wired into
  `client/src/pages/er/ERRegister.tsx` as a triage mode alongside manual ESI and legacy colour. The
  derived level is posted as `esiLevel` and the raw answers as `triageInputs`. Guarded so a nurse
  cannot submit an untouched form. Covered by `erGuidedTriage.test.ts`, including the
  multiple-triggers case (highest-acuity wins).
- **One shared NEWS2 scorer** (`server/services/news2.service.js`). Three implementations previously
  disagreed and all defaulted missing vitals to zero-scoring, so an incomplete vitals set looked
  well. `vitals-ews.service.js`, `clinical-intelligence.service.js`, and
  `ambient-deterioration.service.js` now delegate to it. Contract test in
  `server/__tests__/news2-contract.test.js`; 13 hand-verified vectors in `news2.test.js`.
- ER registration and triage-update no longer swallow database errors or return fabricated records;
  `triage_time` is set; a real ESI level is authoritative over the legacy colour, and a colour-only
  write is recorded as `triage_reviewed = false` until a nurse confirms a real level.

Pending:

- Clinical sign-off on the guided ESI path by an ER nursing lead. The decision tree is a simplification
  of ESI v4; it has not been reviewed against the full ESI handbook by a clinician.

Note: the server does persist the answers (`er_visits.triage_inputs`, written on both register and
triage-update) and `scripts/testing/verify-er-triage.mjs` asserts they round-trip. The remaining gap is
that no screen yet surfaces the stored answers for audit review.

Acceptance:

- [x] Guided ESI computes level and records answers.
- [x] Override (manual ESI / colour) is audited as an override mode.
- [x] Answers are persisted server-side for audit.
- [ ] Clinician sign-off recorded.

### 4.9 WP-1.9 auth consolidation and MFA

Status: not started.

Backend:

- Consolidate login/session behavior across portals.
- Add MFA enrollment, verification, recovery codes, trusted devices, and admin reset.
- Normalize token payloads and refresh behavior.

Frontend:

- Shared MFA enrollment and verification screens.
- Portal login screens reuse the same auth service while preserving branding/context.

UI design:

- MFA setup uses stepper: choose method, verify, backup codes, complete.
- Recovery codes are shown once with explicit download/print action.

Acceptance:

- MFA can be enforced by role/tenant.
- Lost-device recovery is audited.

### 4.10 WP-1.10 essentials pack

Status: not started; needs source-plan scoping.

Implementation:

- Re-cross-check original plan.
- Convert essentials into named workstreams with backend/frontend/UI/acceptance.

### 4.11 v2 Phase 1 enterprise readiness baselines

These are documented as implemented, but should still be validated under the common definition of done.

| Capability | Backend detail | Frontend detail | UI design detail | Acceptance |
|---|---|---|---|---|
| Blood Bank full workflow | Inventory, donors, cross-match, issue/return, expiry, shortage, audit. | Blood bank operational dashboard, donor registry, cross-match queue, issue/return flows. | Table-first inventory by blood group; critical shortage badges; audit side panel. | End-to-end requisition changes stock and audit. |
| Generic clinical autosave | Draft persistence, final status, conflict handling. | Shared autosave hook on discharge summaries, prescriptions, IP sheets, notes. | Save indicator: saving, saved, failed, conflict. | Refresh/crash/reconnect recovers draft. |
| Tariff master MVP | Room/procedure/package pricing, payer/corporate overrides, effective dates. | Tariff admin UI and billing lookup integration. | Effective-date table, override badges, preview price resolver. | Billing can resolve a real tariff line. |
| Dietary workflow | Admission-linked orders, templates, allergy-aware fields, counselling capture. | Dietitian queue, diet orders, patient diet plan, discharge counselling. | Queue by ward/meal/status; allergy alert always visible. | Diet order starts from admission and ends with counselling output. |
| PREMS feedback | Discharge invite, response capture, low-score escalation. | Dashboard, operator entry, response details. | Trend plus raw response table; negative feedback creates visible ticket. | PREMS response visible and low score escalates. |
| NABH templates | Controlled template inventory. | Quality portal template list/export. | Version, owner, approval status, export action. | Required template pack visible with ownership. |
| Readmission risk UI | Risk score/factors exposed at discharge. | Badge, factor list, follow-up CTA. | Explainable badge with top drivers and care-plan action. | Risk is visible before discharge signing. |

## 5. Phase 2: clinical intelligence production hardening

Phase 2 has a baseline in code, but production completion requires validation, governance, and owner
sign-off.

### 5.1 Normalized clinical data foundation

Backend:

- Create normalized lab observation model if not already dependable.
- Map test names, LOINC where available, units, reference ranges, abnormal flags, report source, and sample date.
- Backfill representative lab data from `reports`, lab orders, and structured lab results where possible.
- Add query constraints for cohort search so unsupported free-text lab inference fails closed.

Frontend:

- Patient record lab timeline that distinguishes structured labs from uploaded report documents.
- Cohort search UI that labels unsupported filters and explains why.

UI design:

- Use structured filter chips for lab name, operator, value, unit, date range.
- Results table shows source and confidence/normalization status.

Acceptance:

- HbA1c-style queries return verified structured results or explicit unsupported response.

### 5.2 Deterioration scoring and alert operations

Backend:

- Verify NEWS2 and qSOFA scoring at vitals capture.
- Persist score, parameters, threshold triggers, alert status, owner, escalation, resolution.
- Emit event-bus messages: `VitalsObserved`, `ClinicalAlertRaised`, `ClinicalAlertResolved`.
- Notification fanout with retry/failure audit.

Frontend:

- Alert inbox for nurses/doctors.
- Patient vital timeline with score markers.
- Acknowledge, escalate, snooze, resolve flows.

UI design:

- Critical alerts stay above fold until acknowledged.
- Alert detail shows measured value, threshold, score math, timestamp, owner, action history.

Acceptance:

- NEWS2 >= 5, qSOFA >= 2, or extreme single parameter creates alert and audit.

### 5.3 Clinical-alert governance

Backend:

- Department/ward routing rules.
- Stale alert job.
- Escalation policy table.

Frontend:

- Admin policy UI for routing and escalation.
- Stale-alert dashboard.

UI design:

- Policy table with ward, severity, first owner, escalation delay, escalation owner, channels.

Acceptance:

- No critical alert remains ownerless or invisible.

### 5.4 Coding suggestions governance

Backend:

- Suggestions generated only after note signing.
- Store suggested ICD/CPT, evidence text span, confidence, reviewer decision, reviewer, time, reason.
- Billing only receives approved codes.

Frontend:

- Coding review worklist.
- Note detail panel with suggestion evidence.
- Approve/reject/edit workflow.

UI design:

- Split view: note text left, suggestions right, evidence highlighted.
- Status badges: suggested, approved, rejected, edited.

Acceptance:

- AI suggestions never auto-finalize billable codes.

### 5.5 Doctor cohort search

Backend:

- Safe SELECT-only query compiler.
- Allowed filter registry.
- Query provenance log.
- Export lock until validation mode is complete.

Frontend:

- Natural-language search plus generated structured filter preview.
- Result validation panel for pilot users.

UI design:

- Always show the interpreted filters before results.
- Unsupported filters show inline, not hidden.

Acceptance:

- Ten representative queries match known cohorts within approved tolerance.

### 5.6 Ambient scribe productionization

Backend:

- WebSocket audio streaming or explicitly approved progressive upload architecture.
- Consent record linked to encounter and audio session.
- Retention/deletion policy enforcement.
- Transcript chunks, final transcript, generated note, correction history.

Frontend:

- Start/pause/resume/stop controls.
- Live transcript with partial/final distinction.
- Consent capture before recording.
- Review and sign workflow.

UI design:

- Recording state must be unmistakable.
- Pause/stop controls must remain visible.
- Transcript correction marks edited sections.

Acceptance:

- Controlled pilot completes consent, record, pause, resume, finalize, review, sign, and retention/delete flow.

### 5.7 Observability and rollback

Backend:

- Metrics for alert volume, alert latency, suggestion acceptance, cohort failures, scribe finalization failures, notification delivery.
- Feature flags for alerts, coding suggestions, cohort search, ambient scribe.

Frontend:

- Admin operations dashboard for Phase 2 feature health.

Acceptance:

- Each feature can be disabled independently without redeploy.

## 6. Phase 3: department depth and operations

Phase 3 has baseline modules, but it needs end-to-end acceptance and resolution of the GRN-to-stock
documentation conflict.

### 6.1 CSSD

Backend:

- Instrument sets, trays, item composition, sterilization jobs, cycle parameters, release actions, hold/fail reasons, sterility expiry, OT request linkage.
- Audit every transition.

Frontend:

- CSSD dashboard, set detail, job queue, cycle form, release screen, expiry list.
- OT integration surface for sterile-set request.

UI design:

- Lifecycle stepper: requested, decontamination, washing, packing, sterilizing, released, available, held/failed.
- Cycle form captures temperature, pressure, duration, operator, machine, biological/chemical indicator result.

Acceptance:

- Clean and exception workflows signed off by CSSD champion.

### 6.2 Procurement and GRN

Backend:

- Vendor, indent, PO, approval, GRN, partial receipt, rejection, invoice matching hooks, duplicate protections.
- PO and GRN audit trails.

Frontend:

- Vendor management, PO creation, approval inbox, GRN receiving screen, PO detail.

UI design:

- PO detail has header, line items, approval timeline, received quantities, pending quantities.
- GRN form scans line-by-line receiving with quantity validation.

Acceptance:

- Full and partial receiving flows are signed off by procurement lead.

### 6.3 Central-store stock ledger

Backend:

- Verify existing GRN-to-stock behavior.
- If missing, add ledger entries with item, batch, expiry, location, quantity, unit cost, source document, reversal/correction.
- Ensure idempotent posting.

Frontend:

- Stock ledger page, item detail, batch/expiry view, correction workflow.

UI design:

- Ledger table is append-only; corrections appear as new rows with source reference.

Acceptance:

- GRN posts stock exactly once; correction is controlled and audited.

### 6.4 Payroll and finance boundary

Backend:

- Salary structures, allowances, deductions, statutory deductions, payroll run, approval, payslip, bank export.
- Interim accounting export until ledger/GST exists.

Frontend:

- Payroll setup, run creation, approval, payslip preview/export, reconciliation summary.

UI design:

- Payroll run page shows run status, totals, exceptions, approval timeline, export actions.

Acceptance:

- HR/payroll owner runs test payroll and reconciles totals.

### 6.5 Discharge planning

Backend:

- Plan linked to admission.
- Owner, target date, blockers, tasks, escalation, completion, discharge summary handoff, PREMS/counselling handoff.

Frontend:

- Discharge planning board in hospital/inpatient workflow.
- Task detail, blocker management, owner assignment, completion checklist.

UI design:

- Board columns: planned, blocked, ready, completed.
- Patient row shows target discharge date, blockers, owner, pending tasks.

Acceptance:

- Real inpatient completes journey from plan start to discharge with audit.

### 6.6 Cross-department approvals and audit

Backend:

- Approval policy table.
- Immutable audit events.
- Export by record and department.

Frontend:

- Approval inbox and audit viewer.

UI design:

- Approval detail shows request, diffs, attachments, comments, approve/reject.

Acceptance:

- Auditor can reconstruct all high-risk changes.

### 6.7 Phase 3 dashboards, SOPs, and go-live

Backend:

- Smoke endpoints or scripts for CSSD, procurement, stores, payroll, discharge planning.

Frontend:

- Every dashboard has loading, empty, error, retry, and permission states.

UI design:

- Department dashboards must be operational: priority queues first, analytics second.

Acceptance:

- Go-live rehearsal has owners, SOPs, migration/import templates, rollback path.

## 7. Phase 4: advanced differentiators

Newer docs say Phase 4 workflow baselines exist, while older capability docs classify these as missing.
Treat Phase 4 as verification plus production hardening until code and product owners agree.

### 7.1 Wound tracking AI

Backend:

- Wound image upload, storage, measurement metadata, AI analysis result, wound timeline, nursing note integration.
- Validation dataset and SME review queue.

Frontend:

- Nurse wound capture, measurement overlay, timeline, trend chart, note generator.

UI design:

- Image viewer with overlay controls and previous-photo comparison.
- Measurement confidence and review status visible.

Acceptance:

- SME validates representative wound measurements and classifications.

### 7.2 SDoH screening

Backend:

- Questionnaire definitions, responses, risk scoring, referral task creation, scheme eligibility suggestions.
- Ownership rules for social worker/NGO referral.

Frontend:

- OPD registration screening, patient SDoH profile, referral queue.

UI design:

- Five-question flow must be fast and non-stigmatizing.
- Risk flags are visible but not alarmist.

Acceptance:

- High-risk response creates referral with owner and audit.

### 7.3 Clinical trial matching

Backend:

- CTRI sync or curated trial import.
- Eligibility matcher by diagnosis, demographics, comorbidities, medications, exclusions.
- Consent/referral tracking.

Frontend:

- Doctor alert for matching trials, trial detail, eligibility checklist, referral action.

UI design:

- Trial match card shows why matched and what criteria are missing/unknown.

Acceptance:

- Matches are explainable and not shown as guaranteed eligibility.

### 7.4 Predictive staffing

Backend:

- Historical volume ingestion, staffing model, forecast, gap calculation, override/approval.

Frontend:

- HR recommendations, shift gaps, approve/override workflow.

UI design:

- Forecast chart plus recommended FTE table by department/shift.

Acceptance:

- Forecast is compared against actuals before production staffing decisions.

### 7.5 Antibiogram and HAI surveillance

Backend:

- LIS culture/sensitivity normalization.
- Organism-antibiotic aggregation.
- Resistance thresholds and outbreak detection.
- CDSS hook for empiric antibiotic selection.

Frontend:

- Quality/infection-control antibiogram grid.
- HAI alert dashboard.
- Prescription warning when antibiotic conflicts with local resistance.

UI design:

- Organism by antibiotic grid with sensitivity percentage, sample size, date range.
- Hide or flag low-sample-size cells.

Acceptance:

- Infection-control lead signs off aggregation logic and alert thresholds.

## 8. Phase 5: strategic gated capabilities

Phase 5 has software scaffolding, but several items are gated by hardware, datasets, governance, or
clinical/model validation. Do not market these as production-complete until their external gates close.

### 8.1 Real-world evidence platform

Backend:

- De-identification pipeline, differential privacy noise, cohort query governance, subscription/partner access, privacy review.

Frontend:

- Partner analytics portal, query builder, export controls, data-use audit.

UI design:

- Every aggregate shows privacy/noise note, minimum cohort threshold, and allowed use.

Acceptance:

- Privacy/legal approval and multi-tenant data agreements complete.

### 8.2 Digital pathology AI

Backend:

- Pathology image upload, AI analysis mode, structured output, review queue, validation set.

Frontend:

- Lab/pathology review surface with image annotations and report draft.

UI design:

- AI-highlighted regions are overlays, not final diagnosis.
- Confidence and review status visible.

Acceptance:

- Validated pathology dataset and model governance exist.

### 8.3 Pharmacogenomics

Backend:

- Genetic profile storage, VCF/report parser, PharmGKB or approved knowledge-source integration, prescription CDSS hook.

Frontend:

- Patient PGx profile, medication check warnings, upload/review flow.

UI design:

- Warnings explain gene, phenotype, medication impact, and evidence source.

Acceptance:

- Approved knowledge source and clinical governance signed off.

### 8.4 Predictive revenue cycle AI

Backend:

- Denial-risk heuristic/model, payer history, documentation completeness checks, claim-field suggestions.

Frontend:

- Denial risk widget in claims workflow and review queue.

UI design:

- Risk score must show drivers and suggested fixes.

Acceptance:

- Model/heuristic evaluated against historical claim outcomes.

### 8.5 AR surgical planning

Backend:

- DICOM segmentation pipeline, mesh generation, plan storage, device readiness records.

Frontend:

- Surgical planning case registry, 3D/AR preview, annotation tools.

UI design:

- Make planning status clear: draft, segmented, reviewed, device-ready.

Acceptance:

- Device-side AR validation and surgical governance complete.

### 8.6 Ambient smart room

Backend:

- Room device registry, BLE/PIR/MQTT event contracts, room readiness, doctor presence events.

Frontend:

- Room readiness dashboard, event timeline, device health, doctor mobile triggers.

UI design:

- Room card shows patient, devices, last event, readiness, and fault state.

Acceptance:

- Real room sensors deployed and event contracts validated.

### 8.7 Voice biometric identification

Backend:

- Consent, enrollment, voice sample storage policy, verification attempts, spoofing checks, model evaluation.

Frontend:

- Enrollment flow, verification flow, consent and revocation.

UI design:

- Explicit consent language; fallback identity path always available.

Acceptance:

- Spoofing evaluation and privacy sign-off complete.

### 8.8 ESG and carbon reporting

Backend:

- Emissions factor table, data capture hooks, summary endpoints, report generation.

Frontend:

- Admin analytics ESG dashboard and PDF export.

UI design:

- Show source data quality and missing data by category.

Acceptance:

- Facilities owner validates source data and coefficients.

## 9. Corporate wellness addendum

Recent production work added or fixed corporate flows. Keep these in the plan because they affect HR
and employee-facing production readiness.

### 9.1 Corporate employee bulk upload

Backend:

- Header parsing and quality checks are relaxed enough for DairyDay-style files.
- Upload endpoint must keep row-level validation details and not return generic 500 for data errors.

Frontend:

- Upload progress bar and stage messages are implemented.
- Failed upload must show row/file reason and retry path.

UI design:

- Progress stages: parsing, validating, uploading, saving, notifying, complete/failed.

Acceptance:

- Valid DairyDay Excel uploads employees.
- Invalid file explains what failed.

### 9.2 Team health report upload to employee records

Backend:

- Team report upload writes canonical `corporate_health_reports`.
- It also mirrors each file into employee `reports` with metadata source `team_corporate_health_upload`.
- Corporate/HR union queries exclude the mirror rows to prevent duplicate HR records.

Frontend:

- Team upload page remains source for employee-wise health checkup reports.
- Employee login sees uploaded report in `/reports` backed health records.
- Corporate reports/MIS use canonical corporate health report rows.

UI design:

- Upload response should show employee, file count, report date, notification status, and employee-record link status.

Acceptance:

- Team upload appears in employee login and weekly MIS metrics without duplicate HR health rows.

### 9.3 Weekly MIS to HR/corporate login

Backend:

- `corporate_generated_reports` and `/corporate/reports/weekly-mis/generate` exist.
- MIS metrics count canonical corporate health report rows.

Frontend:

- Corporate reports page lists/generates/downloads weekly MIS.
- Clarify whether separate `/hr/reports` must also show corporate MIS; current HR module is hospital-HR oriented.

UI design:

- Latest weekly MIS card should show period, generated time, delivery status, reports uploaded, SLA, and download.

Acceptance:

- HR/corporate stakeholder can generate and download weekly MIS for a real period.

## 10. Cross-phase validation matrix

| Validation area | Minimum command/check | Applies to |
|---|---|---|
| Syntax | `node --check <edited server file>` | Backend JS routes/services |
| Formatting | `git diff --check HEAD` | All changes |
| Production build | `npm run build` in `client` | Frontend/user-facing changes |
| Static invented-data gate | `node client/scripts/ci/check-invented-data-statics.mjs` | Frontend data changes |
| Tenant isolation | Existing tenant verification scripts plus route-specific smoke | Multi-tenant data |
| Protected route smoke | Unauth returns 401/403, not 500 | All protected APIs |
| Browser smoke | Route loads with no console/page errors | Major UI changes |
| DB migration | Apply/rollback or idempotency check | Schema changes |
| Audit trail | Create/update/action produces audit event | Regulated workflows |
| Owner sign-off | Named owner accepts workflow | Clinical/department workflows |

## 11. Deployment plan

### 11.1 Blocking constraint: there is no staging environment

The intended sequence is "migrate staging first, then production." **That gate cannot currently be
satisfied.** As of 2026-09-25:

- `server/.env` points at production RDS (`mediczy-prod.cloqkwiey4k0.ap-south-1.rds.amazonaws.com`).
- There is no `server/.env.staging`, only `.env.staging.example`.
- Every script in `scripts/deploy/` targets production.
- PM2 runs a single live instance; there is no second environment to deploy into.

Consequence: the Phase 1 finance migration has been verified only on a disposable local PostgreSQL 16
database. Applying it to production would be the first time it runs against real data, with no
intermediate rehearsal. This is the single highest-priority gap, and it is an infrastructure task
(provision a staging database, wire `.env.staging`, add a staging deploy path) rather than a code
task.

Until that exists, any "migrate staging first" instruction should be read as a deliberate hold, not a
step to skip.

### 11.2 Production deployment sequence

Every production deployment should follow this sequence:

1. Confirm branch status and target commit.
2. Run targeted validation and production build when frontend changed.
3. Commit with focused message.
4. Push `main`.
5. Push or fast-forward `prod` only when deploy is intended.
6. Reload/restart required PM2 services.
7. Run `/api/health`, frontend route checks, protected-route unauth smoke, and module-specific smoke.
8. Review recent PM2 logs for new 500s, OOM, unhandled rejection, or module-specific errors.
9. Confirm memory, disk, load, and process status.
10. Record commit, validation, and any known unrelated warnings.

Note: `scripts/deploy/deploy-full-prod-s3.sh` previously reverted to `HEAD` on failure, which is
already the new code by the time anything can fail. It now reverts to `.deploy/current-live-sha`.

## 12. Documentation maintenance rules

1. This document is the working plan.
2. Older docs should be treated as source evidence, not current truth, when they conflict with this file.
3. If code proves a status claim wrong, update this document first.
4. Every newly closed workstream needs:
   - implementation summary
   - backend files
   - frontend files
   - UI behavior
   - validation evidence
   - deployment status
   - remaining risk
5. Do not mark a phase complete until its exit criteria and owner sign-off are recorded.

