# Medcore vs Mediqzy Hospital — source-level micro audit

Audit date: 8 November 2026. Scope: hospital workflows and their supporting platform, web and API code. Author: Codex. This report contains findings and acceptance criteria; it does not change or deploy the application.

## Decision

**Mediqzy has broad hospital module coverage, but the code does not support a blanket claim of functional parity with Medcore. The most urgent work is to finish and harden existing workflows, followed by a small set of genuinely missing hospital subsystems.**

The audit records **31 findings: 1 P0, 14 P1 and 16 P2**. These are prioritization judgments, not incident counts. Of these, **22 are source-confirmed defects/partial implementations or policy differences, 8 are capabilities not found after counterpart searches, and 1 needs isolated database/tenant verification**. Six failure paths were reproduced by evaluating Mediqzy source with in-memory dependencies. No production incident or cross-tenant disclosure is claimed.

The immediate findings are:

- **F02:** blood-bank display generates stock/expiry values and its UI ignores the non-live marker.
- **F01:** five mounted hospital pages still save local text updates behind business-action labels.
- **F03/F04:** crossmatch/transfusion tables are unwired, and repeated blood issue allocates a new set of units.
- **F14–F16:** controlled-drug register and goods-receipt validation/atomicity are incomplete.
- **F05–F10:** the adoption reminder and lab-explanation flows have scheduling, UI contract and duplicate-delivery defects.
- **F22–F29:** dedicated maternity, pediatric longitudinal tracking, clinical patient merge, cancellation waitlist, coordinated visits, invoice installments, advance directives and belongings custody were not found as complete source workflows.

“P0” here means remove the misleading clinical-operational behavior before relying on the affected screen. “P1” means high-priority integrity, privacy, availability or workflow completion. “P2” means planned capability/product/engineering work. Missing specialties are prioritized by hospital service line, not automatically imposed on every deployment.

## Frozen evidence and review depth

| Repository | Audited revision | What it represents |
|---|---|---|
| Medcore | `2031184e6418a32eb518ad44eaf13cf91d0e937a` | Public repository default branch fetched for this audit; commit dated 7 August 2026. Same Medcore revision used by the previous local parity audit. |
| Mediqzy | `cc7008b9be90e714c4e2220910ae45e09a6cb0c2` | Detached source snapshot taken at the start of review. |
| Mediqzy later main | `02fce3d10ce9ac4aa497e1a6b7c43a53da85128a` | Advanced during review only by changing `server/scripts/migrate-all.mjs`. The product files cited in this audit are unchanged by that commit. The unrelated migration-runner work was preserved. |

All evidence links below pin the commit, so subsequent fixes do not silently invalidate line references. Private Mediqzy links require repository access. Public reference: [Medcore repository](https://github.com/Globussoft-Technologies/medcore).

| Inventory measure | Medcore | Mediqzy | Interpretation |
|---|---:|---:|---|
| Tracked files inventoried | 2,242 | 10,999 | File paths/sizes, including non-code assets; not lines manually reviewed. |
| Non-test Medcore API route modules mapped | 133 | 133 counterpart assessments | Every Medcore route module has an entry in the comparison map, grouped into 47 domains. |
| Literal HTTP method declarations extracted | 1,103 | 5,278 | Regex source inventory, **not** unique deployed endpoint counts. Includes local router paths and may include non-router receivers/comments. |
| Literal mount declarations extracted | 142 | 633 | Local mounts; not a fully resolved router graph. |
| Prisma model declarations | 226 | 73 | Mediqzy primarily also uses SQL migrations and Sequelize; these numbers cannot compare database completeness. |
| Files classified as tests/fixtures by path | 1,063 | 433 | Includes test-directory fixtures/snapshots; not executed test cases or quality scores. |
| Next `page.tsx` files | 206 | N/A | Mediqzy uses a different routing architecture. No UI completeness ratio is inferred. |

The complete path inventories and route declarations cover both repositories. **Detailed inspection was risk-directed**: route handlers, service functions, table definitions, mounted UI wiring, state transitions, worker lifecycle, validation and test/config evidence for the findings below. The 47-domain map distinguishes a verified gap from a merely relevant counterpart. It is not honest to call thousands of unexecuted routes “passed” or every line “fully audited”.

### Evidence package

- [47-domain comparison matrix](medcore-comparison-2026-11-08/coverage-matrix.md) — sources, counterpart status and residual questions.
- [All 133 Medcore route-module mappings](medcore-comparison-2026-11-08/module-coverage.csv).
- [Actionable gap register](medcore-comparison-2026-11-08/gap-register.csv) — priority, owner, impact, acceptance criteria and evidence.
- [Inventory summary](medcore-comparison-2026-11-08/inventory-summary.json), [Medcore files](medcore-comparison-2026-11-08/medcore-files.csv), [Mediqzy files](medcore-comparison-2026-11-08/mediqzy-files.csv), [Medcore declarations](medcore-comparison-2026-11-08/medcore-routes.csv), [Mediqzy declarations](medcore-comparison-2026-11-08/mediqzy-routes.csv).
- [Counterpart search evidence](medcore-comparison-2026-11-08/counterpart-search.csv) and [offline reproduction results](medcore-comparison-2026-11-08/reproduction-results.json).
- [Reproduction harness](medcore-comparison-2026-11-08/reproduce.mjs) and [methodology/re-run instructions](medcore-comparison-2026-11-08/README.md).

## What Mediqzy already has — do not rebuild these indiscriminately

The source contains real appointment/QMS, ADT/nursing/MAR, prescriptions, lab QC, OT/anesthesia, pharmacy dispensing, SCM, biomedical calibration, billing/insurance, HR/payroll, communications, FHIR and HL7 code. The comparison matrix links each counterpart. In particular:

1. **Prescription safety is integrated beyond the adoption workbench.** Create, update, status-issued and issue routes use `prescriptionSafetyGate`; the service handles allergy knowledge, interactions, acknowledgement and audit. Any remaining safety-mode configuration or hospital-specific path coverage must be tested, but “drug safety is absent” would be false. [MQ server/routes/prescription.route.js:31](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/routes/prescription.route.js#L31)
2. **Laboratory QC is implemented.** There are scoped material/run APIs, chart bands and deterministic Westgard rules. An independent instrument/result-release integration audit is still needed. [MQ server/routes/lab/qc.route.js:1](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/routes/lab/qc.route.js#L1) [MQ server/services/lab-quality-control.service.js:1](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/services/lab-quality-control.service.js#L1)
3. **Three-way purchase matching exists.** SCM compares invoice, PO and GRN values. F15/F16 concern receipt integrity underneath that feature, not absence of matching. [MQ server/routes/scm.route.js:397](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/routes/scm.route.js#L397)
4. **HL7 v2/MLLP is present in Mediqzy.** The gateway service and `/api/v1/hl7` mount contradict the older “HL7 gap/external” blanket label. Transport presence is not proof of successful device interoperability. Medcore has HL7 export/inbound processing routes; do not assume a native MLLP listener merely from HL7 support. [MQ server/app.js:1938](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/app.js#L1938) [MQ server/services/hl7-mllp-gateway.service.js:1](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/services/hl7-mllp-gateway.service.js#L1) [MC apps/api/src/routes/hl7v2.ts:1](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/apps/api/src/routes/hl7v2.ts#L1)
5. **Real bed/command-center, billing, doctors and notifications pages are routed.** Some old placeholder exports are unused or redirected. F01 counts only five inspected mounted placeholders, not every old component in `HospitalModulePages.tsx`. [MQ client/src/routes/index.tsx:1229](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/client/src/routes/index.tsx#L1229)
6. **Tests and accessibility gates already exist.** Nursing has isolated integration/browser checks; CI contains an accessibility command. F31 concerns the remaining advisory/baseline policy, not the absence of QA. [MQ .github/workflows/ci.yml:20](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/.github/workflows/ci.yml#L20)

Mediqzy also has hospital-specific capabilities beyond the Medcore route catalogue: CSSD, mortuary, dietary/infection control, tele-ICU, DICOM/device gateway, care-unit/operational control and specialized insurance/CRM integrations. These are source surfaces, not automatically certified operational advantages. Their presence is another reason to improve the existing platform rather than replace it wholesale.

## Findings register

Each finding separates source observation, likely user impact, and a testable closure condition. “Not found” means no dedicated equivalent was found in the inspected executable source/searches; it does not establish that no external service, uncommitted branch or manual process exists.

### F01 · P1 · Five mounted hospital pages save local updates instead of performing the advertised business action

**Evidence status:** Confirmed partial workflow. **Suggested owner:** Hospital frontend + owning backend teams.

The mounted /hospital/appointments, /hospital/patients, /hospital/pharmacy, /hospital/claims and /hospital/staff components use ManagedSection. Its save handler writes label/meta/status to hospitalStorage, then shows “Update Added”. Statistics are literal strings. “Create schedule” and “Create PO” open that generic update dialog. Real appointment, patient, dispensing, insurance and staff APIs exist elsewhere. /hospital/beds and /hospital/opd-ipd redirect to other screens, so the dead Bed/OPD placeholder exports are deliberately NOT counted as mounted defects.

**Impact:** Hospital users can mistake a locally saved note for a scheduled visit, purchase order or other persisted operation. Different devices do not share the same business state.

**Close when:** Route each of the five pages to the canonical workflow or implement typed API forms. One action must create a real scoped business row and appear on a second session; reload/error/403 states must be truthful. Remove fixed KPI values. Verify each sidebar destination.

**Mediqzy:** [MQ client/src/routes/index.tsx:1229](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/client/src/routes/index.tsx#L1229) · [MQ client/src/pages/hospital/HospitalModulePages.tsx:108](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/client/src/pages/hospital/HospitalModulePages.tsx#L108) · [MQ client/src/pages/hospital/HospitalModulePages.tsx:194](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/client/src/pages/hospital/HospitalModulePages.tsx#L194) · [MQ client/src/pages/hospital/HospitalModulePages.tsx:234](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/client/src/pages/hospital/HospitalModulePages.tsx#L234) · [MQ client/src/pages/hospital/HospitalModulePages.tsx:294](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/client/src/pages/hospital/HospitalModulePages.tsx#L294)

**Medcore comparison:** [MC apps/api/src/routes/appointments.ts:1](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/apps/api/src/routes/appointments.ts#L1) · [MC apps/api/src/routes/patients.ts:1](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/apps/api/src/routes/patients.ts#L1) · [MC apps/api/src/routes/pharmacy.ts:1](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/apps/api/src/routes/pharmacy.ts#L1)

### F02 · P0 · Blood-bank display invents stock and expiry alerts when live data is empty or unavailable

**Evidence status:** Confirmed source defect. **Suggested owner:** Blood bank + displays.

GET /api/display/blood-bank queries blood_inventory; if it returns no rows, it constructs random quantities and expiry flags plus sample requisitions, returning success:true/live:false. BloodBankDisplay accepts success:true and renders the inventory without checking live. Its catch also suppresses fetch errors. The transactional blood module uses blood_bank_units, not this display query.

**Impact:** A clinical operational screen can show non-existent blood availability. This is a verified fallback path, not proof it was being triggered in production during this audit.

**Close when:** Use the canonical tenant-scoped blood units and component aggregation. On a valid empty database show zero; on a failed source show unavailable/stale with timestamp, never generated availability. Exercise empty data, SQL failure, stale fetch and component labels.

**Mediqzy:** [MQ server/routes/hospital-display.route.js:365](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/routes/hospital-display.route.js#L365) · [MQ client/src/pages/display/BloodBankDisplay.tsx:42](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/client/src/pages/display/BloodBankDisplay.tsx#L42) · [MQ server/app.js:1459](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/app.js#L1459)

**Medcore comparison:** [MC apps/api/src/routes/bloodbank.ts:429](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/apps/api/src/routes/bloodbank.ts#L429)

### F03 · P1 · Persisted crossmatch and transfusion schema is not connected to the blood-bank workflow

**Evidence status:** Confirmed integration gap. **Suggested owner:** Blood bank clinical owner + backend.

Mediqzy creates blood_crossmatches, blood_crossmatch_units and blood_transfusions, but source searches found references to those tables only in the migration. /cross-match computes a blood-group stock lookup, without recording a patient/sample/test/reviewer result. /requisitions/:id/issue does not consult crossmatch_id. Medcore has a persisted cross-match route, but its existence also does not certify safe issue gating.

**Impact:** Compatibility lookup and a successful migration can be misread as a completed laboratory crossmatch/transfusion traceability workflow.

**Close when:** Connect sample/patient/unit identity, result, method, reviewer, validity and consent to issue/return/transfusion events. Enforce approved clinical rules server-side. Prove invalid/missing/expired results block release, with a separately audited emergency exception policy.

**Mediqzy:** [MQ server/migrations/20261015000700-blood-crossmatch-transfusion.migration.js:10](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/migrations/20261015000700-blood-crossmatch-transfusion.migration.js#L10) · [MQ server/routes/dept/bloodBank.route.js:743](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/routes/dept/bloodBank.route.js#L743) · [MQ server/routes/dept/bloodBank.route.js:778](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/routes/dept/bloodBank.route.js#L778)

**Medcore comparison:** [MC apps/api/src/routes/bloodbank.ts:1184](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/apps/api/src/routes/bloodbank.ts#L1184)

### F04 · P1 · The same blood requisition can allocate a second set of units

**Evidence status:** Offline reproduced. **Suggested owner:** Blood bank backend.

The issue handler locks the requisition row and available units, but never checks the requisition status. Repeating the call selects new available units, marks them issued and overwrites issued_unit_ids. R06 evaluated the actual handler with an in-memory SQL adapter: two calls both succeeded and the final reference contained only the second allocation. Medcore is not claimed immune to repeated-request issues; this is a Mediqzy defect identified during the comparison.

**Impact:** Duplicate submission can consume stock twice and lose the first allocation from the requisition’s current unit list.

**Close when:** Require an explicit pending/approved → issued transition under the lock, use an idempotency key, and retain immutable allocation events. Sequential retry and concurrent double-submit must allocate exactly once; return/reissue must be explicit.

**Mediqzy:** [MQ server/routes/dept/bloodBank.route.js:743](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/routes/dept/bloodBank.route.js#L743)

**Medcore comparison:** [MC apps/api/src/routes/bloodbank.ts:747](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/apps/api/src/routes/bloodbank.ts#L747)

### F05 · P1 · Adoption adherence scheduler has no application startup caller

**Evidence status:** Confirmed wiring gap. **Suggested owner:** Job platform + patient engagement.

startMedcoreAdoptionCron is defined and exported, but searching executable server sources found no import or invocation beyond its own file. The explicit /adherence/run-due route exists. Therefore enabling the adoption flag alone does not establish background processing in the checked-in application bootstrap. This finding is specific to this scheduler, not all Mediqzy medication reminders.

**Impact:** Plans can remain due indefinitely unless something external calls the API; an undocumented external operator job was not assumed.

**Close when:** Register the scheduler in the supported job lifecycle, with per-job health, restart behavior and a documented single-worker/lease strategy. A due synthetic event must run after app restart without a manual HTTP call.

**Mediqzy:** [MQ server/services/medcore-adoption-cron.service.js:7](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/services/medcore-adoption-cron.service.js#L7) · [MQ server/routes/medcore-adoption.route.js:199](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/routes/medcore-adoption.route.js#L199)

**Medcore comparison:** [MC apps/api/src/services/adherence-scheduler.ts:104](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/apps/api/src/services/adherence-scheduler.ts#L104)

### F06 · P1 · Adherence form creates unscheduled plans and the service does not generate recurring occurrences

**Evidence status:** Offline reproduced. **Suggested owner:** Patient engagement + hospital frontend.

The form sends patientId and medication (whose default JSON contains times), but no schedule. The service reads only schedule.nextDueAt/dueAt/time, returning null otherwise. The route still returns 201 with firstEvent:null. R01 reproduces this. For a valid date it inserts one event; after sending, no next occurrence is materialized in this service. Other Mediqzy reminder systems are separate and were not conflated with this path.

**Impact:** A successful plan response does not guarantee even the first reminder, let alone the daily course.

**Close when:** Specify timezone, start/end dates, times, dose, recurrence and cancellation in one validated contract. Reject unschedulable plans; materialize unique occurrences and verify a multi-day course, edits and missed doses.

**Mediqzy:** [MQ client/src/pages/MedCoreWorkbench.tsx:115](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/client/src/pages/MedCoreWorkbench.tsx#L115) · [MQ server/routes/medcore-adoption.route.js:178](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/routes/medcore-adoption.route.js#L178) · [MQ server/services/medcore-adoption.service.js:29](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/services/medcore-adoption.service.js#L29) · [MQ server/services/medcore-adoption.service.js:38](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/services/medcore-adoption.service.js#L38)

**Medcore comparison:** [MC apps/api/src/routes/ai-adherence.ts:132](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/apps/api/src/routes/ai-adherence.ts#L132) · [MC apps/api/src/services/adherence-scheduler.ts:28](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/apps/api/src/services/adherence-scheduler.ts#L28)

### F07 · P1 · Quiet hours permanently discard due adoption reminders

**Evidence status:** Offline reproduced. **Suggested owner:** Patient engagement.

runDueAdherenceEvents reads only scheduled events, evaluates quiet hours with getUTCHours(), changes a quiet-hour event to skipped and returns deliveryDeferred:true. No new due date or later event is created. R03 verifies skipped persistence and absence of rescheduling. The patient timezone is not part of this calculation.

**Impact:** The API promises deferral but the reminder is removed from future processing; local quiet hours can also be interpreted in the wrong zone.

**Close when:** Persist a deferred state/new next_attempt_at using the configured patient timezone. Verify overnight windows, local dates and eventual exactly-once eligibility after the window; distinguish deliberately suppressed clinical reminders from deferred ones.

**Mediqzy:** [MQ server/services/medcore-adoption.service.js:50](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/services/medcore-adoption.service.js#L50)

**Medcore comparison:** [MC apps/api/src/services/notification.ts:1](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/apps/api/src/services/notification.ts#L1)

### F08 · P1 · Concurrent adoption reminder workers can send the same event twice

**Evidence status:** Offline reproduced. **Suggested owner:** Patient engagement + notification platform.

Due rows are read without an atomic claim, then notificationService.send executes before status updates. Cron/manual calls or overlapping workers can select the same row. R04 evaluates two service invocations and observes two sends. Medcore’s simple interval scheduler also should not be copied as an exactly-once reference; this requirement follows from the workflow.

**Impact:** Duplicate medication messages undermine trust and can confuse patients about dosing.

**Close when:** Claim unique occurrences transactionally, use an outbox/provider idempotency key, and recover expired leases. Two workers and a crash after provider acceptance must not create a second notification.

**Mediqzy:** [MQ server/services/medcore-adoption.service.js:50](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/services/medcore-adoption.service.js#L50) · [MQ server/routes/medcore-adoption.route.js:199](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/routes/medcore-adoption.route.js#L199)

**Medcore comparison:** [MC apps/api/src/services/adherence-scheduler.ts:28](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/apps/api/src/services/adherence-scheduler.ts#L28)

### F09 · P1 · Lab-explainer workbench does not support an end-to-end patient explanation

**Evidence status:** Offline reproduced / UI traced. **Suggested owner:** Lab + hospital frontend.

The workbench’s default/editable report shape is test/value/unit/referenceRange/flag; the service reads report.values[] with status or abnormal. R02 shows a high value in the form shape becomes “No out-of-range values were supplied”. Draft creation also omits patientId/reportId. Delivery rejects a draft without a patient recipient. The workbench has no review/approve/reject/deliver action, although backend routes exist.

**Impact:** An operator can create a draft that omits the supplied result and cannot complete delivery from that screen.

**Close when:** Select a persisted lab order and patient, transform validated structured observations, show source values/units, support authorized review and delivery status. Test high/low/normal, missing reference ranges, wrong-patient prevention and full create→review→deliver UI.

**Mediqzy:** [MQ client/src/pages/MedCoreWorkbench.tsx:15](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/client/src/pages/MedCoreWorkbench.tsx#L15) · [MQ client/src/pages/MedCoreWorkbench.tsx:110](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/client/src/pages/MedCoreWorkbench.tsx#L110) · [MQ server/services/medcore-adoption.service.js:4](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/services/medcore-adoption.service.js#L4) · [MQ server/routes/medcore-adoption.route.js:132](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/routes/medcore-adoption.route.js#L132) · [MQ server/services/medcore-adoption.service.js:101](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/services/medcore-adoption.service.js#L101)

**Medcore comparison:** [MC apps/api/src/routes/ai-report-explainer.ts:63](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/apps/api/src/routes/ai-report-explainer.ts#L63) · [MC apps/web/src/app/dashboard/lab-explainer/page.tsx:1](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/apps/web/src/app/dashboard/lab-explainer/page.tsx#L1)

### F10 · P1 · Approved lab explanations can be delivered twice concurrently

**Evidence status:** Offline reproduced. **Suggested owner:** Lab + notification platform.

Delivery selects an approved undelivered draft, sends the message, then conditionally updates delivered_at. The condition occurs after the irreversible send. R05 runs two callers and observes two notifications even when the later update has no row. The caller does not reject an empty updated.rows result.

**Impact:** Duplicate patient communications and unreliable delivery acknowledgement under retries/concurrency.

**Close when:** Use an atomic claim/outbox before contacting the provider, plus a unique draft/channel delivery key and retry reconciliation. A lost response and two simultaneous requests must produce one logical delivery.

**Mediqzy:** [MQ server/services/medcore-adoption.service.js:101](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/services/medcore-adoption.service.js#L101)

**Medcore comparison:** [MC apps/api/src/routes/ai-report-explainer.ts:205](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/apps/api/src/routes/ai-report-explainer.ts#L205)

### F11 · P2 · Lab approval contract says doctor approval while the reviewer role list includes nurses

**Evidence status:** Confirmed policy mismatch. **Suggested owner:** Clinical governance + IAM.

clinicalReviewer includes doctor/admin/medical_director/nurse, and is reused for approve/reject. The API labels drafts requiresDoctorApproval:true. Medcore restricts its approval endpoint to doctor/admin. This is a mismatch between the stated workflow and authorization, not a claim that nursing review is universally impermissible.

**Impact:** The UI/API promise and actual delegated clinical authority disagree.

**Close when:** Have the clinical owner define who may approve which report type. Enforce that permission, use accurate copy, bind reviewer identity and reject inappropriate roles in contract tests.

**Mediqzy:** [MQ server/routes/medcore-adoption.route.js:23](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/routes/medcore-adoption.route.js#L23) · [MQ server/routes/medcore-adoption.route.js:132](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/routes/medcore-adoption.route.js#L132) · [MQ server/routes/medcore-adoption.route.js:147](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/routes/medcore-adoption.route.js#L147)

**Medcore comparison:** [MC apps/api/src/routes/ai-report-explainer.ts:205](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/apps/api/src/routes/ai-report-explainer.ts#L205)

### F12 · P2 · Clinical handoff claims can be overwritten and completed cases reopened

**Evidence status:** Confirmed transition gap. **Suggested owner:** Clinical operations.

PATCH validates only that the requested status is claimed/completed/cancelled; UPDATE filters id+tenant, not current state or owner, and replaces claimed_by with the current actor. No compare-and-set claim is present. The UI sends handoffReason whereas createAgentHandoff reads reason, so the operator reason is replaced with a default.

**Impact:** Two reviewers can believe they own the same handoff, and task history loses meaningful state/ownership semantics.

**Close when:** Define pending→claimed→completed/cancelled transitions, atomic claim/owner checks, supervisor reassignment and append-only audit. Contract-test simultaneous claim, completed→claimed rejection and reason persistence.

**Mediqzy:** [MQ server/routes/medcore-adoption.route.js:116](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/routes/medcore-adoption.route.js#L116) · [MQ client/src/pages/MedCoreWorkbench.tsx:125](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/client/src/pages/MedCoreWorkbench.tsx#L125)

**Medcore comparison:** [MC apps/api/src/routes/agent-console.ts:1](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/apps/api/src/routes/agent-console.ts#L1)

### F13 · P2 · Adoption KPI endpoint has a table and reader but no identified computation producer or tenant dimension

**Evidence status:** Confirmed incomplete metric pipeline. **Suggested owner:** Data/AI evaluation.

Executable-source search for metric_integrity_results found the migration and reader, no writer. The latest-by-metric_key query has no tenant/date/model/evaluation filter; the tenant hardening migration excludes this table. Returning unavailable on missing data is good behavior. External data loading was not verified.

**Impact:** Workbench metric labels cannot be treated as measured hospital quality, accuracy or tenant-specific performance.

**Close when:** Define numerator/denominator, eligible cohort, source labels, time window and model/version. Compute reproducibly per authorized scope; distinguish global benchmarks from tenant metrics and unavailable from zero.

**Mediqzy:** [MQ server/routes/medcore-adoption.route.js:84](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/routes/medcore-adoption.route.js#L84) · [MQ server/migrations/20261015006100-medcore-adoption.migration.js:30](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/migrations/20261015006100-medcore-adoption.migration.js#L30) · [MQ server/migrations/20261015006600-medcore-tenant-delivery.migration.js:9](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/migrations/20261015006600-medcore-tenant-delivery.migration.js#L9)

**Medcore comparison:** [MC apps/api/src/services/ai/kpi-metrics.ts:1](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/apps/api/src/services/ai/kpi-metrics.ts#L1)

### F14 · P1 · Controlled-substance register accepts missing witnesses and separates register from inventory posting

**Evidence status:** Confirmed validation/atomicity gap. **Suggested owner:** Pharmacy + SCM.

Mediqzy requires only itemId, txnType and quantity presence, calculates balance + Number(quantity), stores witnessName||null, and inserts the ledger in a second query without a transaction in this handler. It does not fetch the item’s controlled classification, validate allowed transaction direction or prevent negative balance here. The SCM database handle is tenant-scoped; the absence of explicit tenant predicates is not itself a tenant finding.

**Impact:** Register and stock can diverge on failure, and controlled entries can lack the witness/actor evidence required by the intended hospital policy.

**Close when:** Validate item classification, finite positive quantity/direction, stock sufficiency and authorized witness identity; atomically write register+ledger+audit. Fault-inject between writes, test duplicate/concurrent dispense, and use approved local clinical policy rather than copying legal comments from Medcore.

**Mediqzy:** [MQ server/routes/scm.route.js:775](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/routes/scm.route.js#L775)

**Medcore comparison:** [MC apps/api/src/routes/controlled-substances.ts:120](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/apps/api/src/routes/controlled-substances.ts#L120)

### F15 · P1 · GRN receipt clamps PO totals but records the full supplied quantity and does not bind a line to its PO

**Evidence status:** Confirmed receipt validation gap. **Suggested owner:** SCM.

The receipt handler checks PO status, then updates scm_po_lines by line.id only with LEAST(quantity, received_quantity + receivedQuantity). It separately writes the raw receivedQuantity and caller itemId into scm_grn_lines. It does not reject over-receipt or establish line.order_id = URL order.id in this handler. Medcore explicitly compares cumulative receipts to ordered quantity and returns an error for over-receipt.

**Impact:** For example, 15 received against an order of 10 can record 10 on the PO and 15 in GRN/inventory; a same-tenant line from another order can be referenced.

**Close when:** Lock the PO and its lines; validate ownership, derived item ID, positive finite quantity and remaining quantity before any write. Reject or explicitly approve overage. Test wrong PO line, item mismatch, negative quantity, partial receipts, rollback and concurrent receipt.

**Mediqzy:** [MQ server/routes/scm.route.js:306](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/routes/scm.route.js#L306)

**Medcore comparison:** [MC apps/api/src/routes/purchase-orders.ts:664](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/apps/api/src/routes/purchase-orders.ts#L664)

### F16 · P1 · GRN posting can leave partial stock and reject its own retry

**Evidence status:** Confirmed transaction gap. **Suggested owner:** SCM + finance.

Posting checks whether any ledger row exists, auto-decides a pending approval, then inserts lines separately without an enclosing transaction/atomic claim. If line two fails, line one remains. A retry sees that one row and returns “already posted”, leaving the receipt incomplete. Concurrent callers can both pass the initial check. Approval permissions delegated to decideOperationsApproval also need a role-level test.

**Impact:** Inventory and accounting can show a partially applied receipt that ordinary retry cannot repair.

**Close when:** Atomically transition approved→posted and post all lines with a unique per-GRN-line ledger constraint. Roll back on any line failure; concurrent calls and retry after timeout must converge to one complete receipt.

**Mediqzy:** [MQ server/routes/scm.route.js:346](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/routes/scm.route.js#L346)

**Medcore comparison:** [MC apps/api/src/routes/purchase-orders.ts:700](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/apps/api/src/routes/purchase-orders.ts#L700)

### F17 · P1 · Visitor management displays sample people and its Issue Pass button has no action

**Evidence status:** Confirmed partial workflow. **Suggested owner:** Security portal.

SecurityVisitorsPage renders Issue Pass and Pass Register buttons without handlers. It reads portal-data and uses fallbackVisitors when data is absent. The backend also returns FALLBACK_VISITORS for an absent/empty/failed audit source. Create/update visitor APIs do exist; therefore this is not an absent-API finding. Creation stores a log event with free-text patient/destination, without the admission-bound occupancy/blacklist checks visible in Medcore.

**Impact:** Security staff see plausible but non-live visitors and cannot issue a real pass from the advertised action; visitor admission policy is not represented.

**Close when:** Wire real pass issuance/check-out/print, bind to an admission where relevant, enforce configurable occupancy/blacklist/visiting rules, and show empty/error states. Exercise the mounted page, not just the API.

**Mediqzy:** [MQ client/src/pages/security/SecurityModulePages.tsx:458](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/client/src/pages/security/SecurityModulePages.tsx#L458) · [MQ server/controller/security-portal.controller.js:244](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/controller/security-portal.controller.js#L244) · [MQ server/controller/security-portal.controller.js:474](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/controller/security-portal.controller.js#L474) · [MQ server/routes/unified-hospital-staff.routes.js:630](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/routes/unified-hospital-staff.routes.js#L630)

**Medcore comparison:** [MC apps/api/src/routes/visitors.ts:54](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/apps/api/src/routes/visitors.ts#L54)

### F18 · P2 · Updating visitor status can erase displayed visitor identity and destination

**Evidence status:** Confirmed event projection defect. **Suggested owner:** Security portal.

updateSecurityVisitor records only supplied fields in a new audit event. getSecurityVisitors selects the newest event per resource_id and ignores older events; it does not merge the new patch with the creation record. A status-only checkout therefore projects defaults such as Visitor/Hospital instead of the original name/destination. The query also caps the source at 40 events before deduplication.

**Impact:** The visitor register can lose useful identifying details from the current view and omit older visitors who are still inside.

**Close when:** Persist a canonical visitor row transactionally with an audit event, or correctly fold the event stream from creation. Verify status-only patches preserve fields and pagination never drops active passes.

**Mediqzy:** [MQ server/controller/security-portal.controller.js:244](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/controller/security-portal.controller.js#L244) · [MQ server/controller/security-portal.controller.js:499](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/controller/security-portal.controller.js#L499)

**Medcore comparison:** [MC apps/api/src/routes/visitors.ts:320](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/apps/api/src/routes/visitors.ts#L320)

### F19 · P1 · Visitor read path does not explicitly establish the tenant/RLS context used by audit-log writes

**Evidence status:** Needs isolated integration verification. **Suggested owner:** Security portal + platform data isolation.

getSecurityVisitors has no organization argument and reads audit_logs through postgresSequelize.query with only resource_type filtering. The write model documents FORCE RLS and explicitly installs a platform-admin context for its audit sink; this raw reader does not visibly use that helper. Database policies/connection behavior were not executed here. Depending on deployed RLS and DB role, the effect could be empty results (then fabricated fallbacks) or overly broad results. A cross-tenant leak is NOT claimed as observed.

**Impact:** Tenant isolation and availability of the actual visitor register cannot be established from the role check alone.

**Close when:** Use the canonical tenant-aware audit reader or scoped visitor repository. Test two hospitals, unaffiliated actor, pool reuse and forced RLS with the real application role; assert both no leakage and correct own-tenant records.

**Mediqzy:** [MQ server/controller/security-portal.controller.js:119](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/controller/security-portal.controller.js#L119) · [MQ server/controller/security-portal.controller.js:244](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/controller/security-portal.controller.js#L244) · [MQ server/controller/security-portal.controller.js:364](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/controller/security-portal.controller.js#L364) · [MQ server/models/auditLog.model.intelligent.js:253](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/models/auditLog.model.intelligent.js#L253)

**Medcore comparison:** [MC apps/api/src/routes/visitors.ts:165](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/apps/api/src/routes/visitors.ts#L165)

### F20 · P2 · Report-builder PDF and Excel exports do not produce the advertised formats

**Evidence status:** Confirmed output-contract defect. **Suggested owner:** Reporting.

The mounted admin report route accepts excel/pdf. exportToExcel delegates to CSV. exportToPDF writes JSON but returns format:pdf and a .pdf filename, with a .json download URL. This finding concerns the custom report builder, not Mediqzy’s separate working prescription/claim PDF generators.

**Impact:** Hospital reports cannot reliably be opened or sent in the requested format; response metadata disagrees with the artifact.

**Close when:** Generate real XLSX/PDF or remove unsupported choices. Assert content type, filename, file signature and successful parsing, including Unicode, long tables and tenant-bound downloads.

**Mediqzy:** [MQ server/routes/report-builder.route.js:205](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/routes/report-builder.route.js#L205) · [MQ server/services/report-builder.service.js:577](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/services/report-builder.service.js#L577)

**Medcore comparison:** [MC apps/api/src/services/pdf-generator.ts:1](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/apps/api/src/services/pdf-generator.ts#L1)

### F21 · P2 · Scheduled report definitions live in memory and recipients are only logged

**Evidence status:** Confirmed incomplete delivery/persistence. **Suggested owner:** Reporting + job platform.

scheduleReport stores cron tasks/config in a Map. The scheduled callback builds/archives the report but has only a comment and log where recipient email should be sent. getNextRunTime returns a string telling the operator to read the cron expression. No schedule restoration was found in this service. Archive persistence is distinct from durable schedule persistence. Medcore persists ScheduledReport/ReportRun and calls email, although provider success still needs verification there too.

**Impact:** A restart loses schedules, and a successful schedule/run does not mean the intended recipients received a report.

**Close when:** Persist tenant/timezone/recipient definitions and run state, restore after restart, compute a real next run, and deliver through an outbox with attempts and receipts. Test downtime catch-up, duplicate workers and failed provider delivery.

**Mediqzy:** [MQ server/services/report-builder.service.js:86](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/services/report-builder.service.js#L86) · [MQ server/services/report-builder.service.js:605](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/services/report-builder.service.js#L605) · [MQ server/routes/report-builder.route.js:283](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/routes/report-builder.route.js#L283)

**Medcore comparison:** [MC apps/api/src/routes/scheduled-reports.ts:169](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/apps/api/src/routes/scheduled-reports.ts#L169) · [MC apps/api/src/routes/scheduled-reports.ts:361](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/apps/api/src/routes/scheduled-reports.ts#L361)

### F22 · P2 · Dedicated maternity/ANC, partograph and postnatal lifecycle

**Evidence status:** Not found after counterpart search. **Suggested owner:** OB-GYN product + clinical owner.

Medcore has antenatal cases/visits, partograph start/observations/end and postnatal visits with persisted models and UI. Mediqzy search matches are specialty prescription templates, timeline text, orchestration and maternity marketing segments; no equivalent dedicated case/observation routes or model lifecycle were found in server/client executable sources.

**Impact:** A maternity hospital cannot rely on specialty templates alone for longitudinal antenatal/intrapartum/postnatal documentation.

**Close when:** First agree clinical scope; implement patient+pregnancy identity, visits, longitudinal observations, delivery/postnatal linkage, signed corrections and role permissions. Validate clinical rules/data against approved references rather than importing Medcore’s algorithms.

**Mediqzy:** [MQ server/migrations/specialty-prescriptions-expansion.migration.js:1](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/migrations/specialty-prescriptions-expansion.migration.js#L1) · [MQ server/services/hospital-crm-specialty.service.js:4](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/services/hospital-crm-specialty.service.js#L4)

**Medcore comparison:** [MC apps/api/src/routes/antenatal.ts:710](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/apps/api/src/routes/antenatal.ts#L710) · [MC apps/api/src/routes/antenatal.ts:999](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/apps/api/src/routes/antenatal.ts#L999) · [MC apps/web/src/app/dashboard/antenatal/[id]/page.tsx:1](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/apps/web/src/app/dashboard/antenatal/[id]/page.tsx#L1)

### F23 · P2 · Dedicated pediatric growth, development and feeding tracking

**Evidence status:** Not found after counterpart search. **Suggested owner:** Pediatrics product + clinical owner.

Medcore stores growth observations, developmental milestones and feeding logs. Mediqzy has pediatric templates and an immunizations display, but no equivalent longitudinal growth/milestone/feeding API/model subsystem was found. This does not claim Mediqzy lacks every vaccination-related field or service.

**Impact:** Pediatric care needs structured longitudinal data and age-aware visualization beyond free-text templates.

**Close when:** Define approved growth references and corrected-age handling, persist measurements/units/age/source and revisions, and add developmental/feeding workflows. Test boundary ages, unit conversion, missing birth date and chart provenance.

**Mediqzy:** [MQ client/src/pages/doctor/DoctorSpecialtyTemplates.tsx:1](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/client/src/pages/doctor/DoctorSpecialtyTemplates.tsx#L1) · [MQ client/src/pages/hospital/HospitalEHR.tsx:375](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/client/src/pages/hospital/HospitalEHR.tsx#L375)

**Medcore comparison:** [MC apps/api/src/routes/growth.ts:103](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/apps/api/src/routes/growth.ts#L103) · [MC apps/api/src/routes/growth.ts:749](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/apps/api/src/routes/growth.ts#L749) · [MC apps/api/src/routes/growth.ts:864](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/apps/api/src/routes/growth.ts#L864)

### F24 · P2 · Clinical patient-record merge with linked clinical history

**Evidence status:** Not found after counterpart search. **Suggested owner:** Patient identity + clinical data.

Medcore validates a retained patient plus source IDs and performs record reassignment under a merge workflow. Mediqzy has duplicate lead identity detection and mergeLeads; that is CRM identity management, not clinical patient merging. Executable search for patient-merge variants found an event name but no clinical merge implementation.

**Impact:** Duplicate patient identities can leave medication, encounter, invoice and lab histories fragmented.

**Close when:** Create a privileged preview/resolve/merge workflow with tenant and patient identity checks, a complete FK inventory, conflict handling, durable provenance and alias redirects. Require review and reconciliation fixtures; do not treat a generic ID update as a safe merge.

**Mediqzy:** [MQ server/services/hospital-crm-foundation.service.js:318](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/services/hospital-crm-foundation.service.js#L318) · [MQ server/routes/unified-patient.routes.js:1](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/routes/unified-patient.routes.js#L1)

**Medcore comparison:** [MC apps/api/src/routes/patients-merge.ts:87](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/apps/api/src/routes/patients-merge.ts#L87)

### F25 · P2 · Appointment cancellation waitlist and offer lifecycle

**Evidence status:** Not found after counterpart search. **Suggested owner:** Front desk + scheduling.

Mediqzy has queue waiting concepts and a WhatsApp “join waitlist” suggestion, but no dedicated persisted doctor/date cancellation waitlist flow was found. Medcore stores entries and invokes notifyNextInWaitlist on cancellation. Its implementation is an offer notification, not a guaranteed atomic slot reservation, so the target should improve that distinction.

**Impact:** A newly available slot is not systematically offered to patients who requested it, increasing manual scheduling work.

**Close when:** Persist preferences/consent, FIFO or approved priority, expiry, cancellation and offer state. Link cancellation to a scoped notification; acceptance must compete safely for the actual slot and prevent duplicate active entries.

**Mediqzy:** [MQ server/models/queue-management.model.js:1](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/models/queue-management.model.js#L1) · [MQ server/services/whatsapp-agentic-booking.service.js:565](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/services/whatsapp-agentic-booking.service.js#L565)

**Medcore comparison:** [MC apps/api/src/routes/waitlist.ts:18](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/apps/api/src/routes/waitlist.ts#L18) · [MC apps/api/src/services/waitlist.ts:10](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/apps/api/src/services/waitlist.ts#L10) · [MC apps/api/src/routes/appointments.ts:1133](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/apps/api/src/routes/appointments.ts#L1133)

### F26 · P2 · Linked multi-doctor visit planning

**Evidence status:** Not found after counterpart search. **Suggested owner:** Scheduling + care pathways.

Medcore plans sequential available slots across doctorIds and creates a CoordinatedVisit with linked appointments in a transaction. Mediqzy multi-doctor QMS provides board/token organization, not a linked sequential booking planner. No equivalent coordinated visit entity/booking lifecycle was found.

**Impact:** Multi-specialty checkups require manual sequencing and become difficult to reschedule coherently.

**Close when:** Add a visit group with ordered appointments, realistic transition time, resource availability and atomic reservation. Test unavailable middle slot, concurrent booking, partial attendance and group reschedule/cancel.

**Mediqzy:** [MQ server/services/qms-opd.service.js:1](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/services/qms-opd.service.js#L1) · [MQ server/routes/qms.route.js:229](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/routes/qms.route.js#L229)

**Medcore comparison:** [MC apps/api/src/routes/coordinated-visits.ts:79](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/apps/api/src/routes/coordinated-visits.ts#L79)

### F27 · P2 · Invoice-linked installment payment plans

**Evidence status:** Not found after counterpart search. **Suggested owner:** Hospital finance.

No payment-plan/installment/instalment source matches were found in the scoped executable search. Medcore persists invoice plans, down payment, installment records and payment state. Its due-reminders endpoint only marks records reminded without sending email, so that portion is explicitly not a complete benchmark.

**Impact:** Hospital collections lack a structured due-date/remaining-balance plan distinct from partial receipts or a wallet.

**Close when:** Support installment schedules, rounding on final installment, approved changes, actual receipt allocation, overdue status and reconciliation. Enforce total conservation and idempotent callbacks; implement genuine reminder delivery.

**Mediqzy:** [MQ server/routes/billing.route.js:1](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/routes/billing.route.js#L1) · [MQ server/routes/payment.route.js:1](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/routes/payment.route.js#L1)

**Medcore comparison:** [MC apps/api/src/routes/payment-plans.ts:38](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/apps/api/src/routes/payment-plans.ts#L38) · [MC apps/api/src/routes/payment-plans.ts:392](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/apps/api/src/routes/payment-plans.ts#L392)

### F28 · P2 · Structured advance directives and resuscitation preference lifecycle

**Evidence status:** Not found after counterpart search. **Suggested owner:** Clinical governance + EHR.

Medcore provides an AdvanceDirective model and scoped CRUD. Mediqzy search found compliance/checklist mentions, not a persisted patient-specific directive with author/review/version and bedside consumption. Generic consent records are an adjacent capability, not evidence of this lifecycle.

**Impact:** Critical preferences may remain free text without an authoritative current, reviewed record.

**Close when:** Define institution-approved directive types, validity, signatories, review/revocation and display rules; preserve history and explicit unknown state. Clinical/legal owners must approve the workflow before release.

**Mediqzy:** [MQ server/services/nabh-jci-compliance.service.js:1](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/services/nabh-jci-compliance.service.js#L1) · [MQ server/routes/ehr.route.js:1](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/routes/ehr.route.js#L1)

**Medcore comparison:** [MC apps/api/src/routes/ehr.ts:861](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/apps/api/src/routes/ehr.ts#L861)

### F29 · P2 · Patient belongings custody at admission and discharge

**Evidence status:** Not found after counterpart search. **Suggested owner:** Nursing + front desk.

Medcore stores admission belongings, supports updates and checkout. No patient-belongings/custody source matches were found in Mediqzy server/client executable sources. General asset tracking is not personal belongings custody.

**Impact:** Staff lack a structured record of valuables received, stored, handed over or returned.

**Close when:** Bind custody items to admission, witness/recipient, storage location and immutable movement history; close outstanding custody at discharge and test partial return and disputed item handling.

**Mediqzy:** [MQ server/routes/adt.route.js:1](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/routes/adt.route.js#L1) · [MQ server/services/nursing-ipd.service.js:1](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/services/nursing-ipd.service.js#L1)

**Medcore comparison:** [MC apps/api/src/routes/admissions.ts:1448](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/apps/api/src/routes/admissions.ts#L1448)

### F30 · P2 · Adoption pharmacy forecasts rely on manual history and do not enforce daily cadence

**Evidence status:** Confirmed integration/data-contract gap. **Suggested owner:** Pharmacy analytics.

The workbench sends manually entered dated quantities, initially three monthly rows. Default seasonLength requires 14 observations so that example correctly returns unavailable. The algorithm sorts valid dates but treats every observation as one seasonal step, then forecasts consecutive days. It does not validate spacing/duplicates or fetch canonical item history. Separate SCM reordering exists and is not claimed absent.

**Impact:** Feeding weekly/monthly/irregular data can produce a daily-looking forecast with the wrong meaning; an algorithm alone does not close stock planning integration.

**Close when:** Load scoped dispense/consumption history, normalize to an explicit daily series, handle missing vs zero, validate stockout censoring and return provenance. Compare historical holdout performance to a baseline before using outputs for procurement.

**Mediqzy:** [MQ client/src/pages/MedCoreWorkbench.tsx:18](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/client/src/pages/MedCoreWorkbench.tsx#L18) · [MQ client/src/pages/MedCoreWorkbench.tsx:119](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/client/src/pages/MedCoreWorkbench.tsx#L119) · [MQ server/services/pharmacy-forecast.service.js:7](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/services/pharmacy-forecast.service.js#L7) · [MQ server/services/pharmacy-forecast.service.js:43](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/services/pharmacy-forecast.service.js#L43)

**Medcore comparison:** [MC apps/api/src/services/ai/pharmacy-forecast.ts:1](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/apps/api/src/services/ai/pharmacy-forecast.ts#L1)

### F31 · P2 · Some repository quality gates remain advisory or accept known failing tests

**Evidence status:** Confirmed CI policy difference. **Suggested owner:** Engineering productivity + QA.

Mediqzy CI uses a Jest known-failure gate and continue-on-error for full TypeScript and lint. It also has valuable nursing integrity fixtures and an accessibility regression command, so neither testing nor accessibility is absent. Medcore has separate coverage/AI-evaluation/load/security workflows. File counts cannot establish quality, and actual GitHub run history/branch protection were not inspected.

**Impact:** A green workflow can coexist with legacy failures and type/lint regressions outside narrower gates; scenario coverage for the confirmed defects is not demonstrated by build success.

**Close when:** Track baseline failures with owners/expiry, enforce changed-code checks and critical hospital contracts, then retire the backlog. Require successful tenant, state transition, retry, export and browser tests for affected modules; verify branch protection rather than relying on YAML presence.

**Mediqzy:** [MQ .github/workflows/ci.yml:84](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/.github/workflows/ci.yml#L84) · [MQ .github/workflows/ci.yml:111](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/.github/workflows/ci.yml#L111)

**Medcore comparison:** [MC .github/workflows/test.yml:1](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/.github/workflows/test.yml#L1) · [MC .github/workflows/coverage.yml:1](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/.github/workflows/coverage.yml#L1) · [MC .github/workflows/ai-eval-nightly.yml:1](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/.github/workflows/ai-eval-nightly.yml#L1)

## Medcore is a comparison reference, not a certified implementation

The audit intentionally avoids treating README claims or file presence as proof of production completeness:

- Its payment-plan due-reminders handler marks `reminderSentAt` but does not send the reminder. F27 adopts the business capability, not that stub. [MC apps/api/src/routes/payment-plans.ts:289](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/apps/api/src/routes/payment-plans.ts#L289)
- Its custom scheduled-report branch returns a configuration note. Standard report definitions/runs are persisted, but custom reports and delivery success need separate verification. [MC apps/api/src/routes/scheduled-reports.ts:147](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/apps/api/src/routes/scheduled-reports.ts#L147)
- Waitlist selection marks an entry notified before sending and does not reserve a real slot. Coordinated-visit planning checks availability before entering its write transaction. Both deserve concurrency/failed-delivery testing before being used as implementation patterns. [MC apps/api/src/services/waitlist.ts:10](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/apps/api/src/services/waitlist.ts#L10) [MC apps/api/src/routes/coordinated-visits.ts:98](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/apps/api/src/routes/coordinated-visits.ts#L98)
- Blood issuing validates unit status/expiry before its update transaction; this audit does not certify its concurrency or clinical compatibility semantics. Mediqzy should use approved clinical rules and atomic transitions rather than copy that handler. [MC apps/api/src/routes/bloodbank.ts:747](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/apps/api/src/routes/bloodbank.ts#L747)
- The README and actual source are out of sync in places: it describes older framework versions and says legacy HL7 export is not built, while route code exists. Build/package files and executable source were preferred over marketing descriptions. [MC README.md:444](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/README.md#L444) [MC apps/api/package.json:1](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/apps/api/package.json#L1) [MC apps/web/package.json:1](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/apps/web/package.json#L1)
- The root `LICENSE` contains AGPL-3.0 text while the README describes proprietary software. That is a repository licensing inconsistency, not a legal conclusion about permitted use. No Medcore implementation was imported into Mediqzy by this audit. Resolve provenance/terms before any proposed reuse. [MC LICENSE:1](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/LICENSE#L1) [MC README.md:1](https://github.com/Globussoft-Technologies/medcore/blob/2031184e6418a32eb518ad44eaf13cf91d0e937a/README.md#L1)

## Verification performed and limits

The [offline harness](medcore-comparison-2026-11-08/reproduce.mjs) evaluates the exact Mediqzy adoption service and the extracted blood issue handler from the pinned snapshot. Imports are removed and persistence/notifications are replaced with in-memory adapters. It does not import the application, read `.env`, call a provider, connect a database or send a real message.

| Reproduction | Observed result | Finding |
|---|---|---|
| R01 | A medication with times but no schedule produces no event | F06 |
| R02 | A high-valued report in the workbench shape loses the value and produces the no-out-of-range text | F09 |
| R03 | Quiet-hour event is persisted as skipped without a replacement due time | F07 |
| R04 | Two concurrent reminder calls perform two provider sends | F08 |
| R05 | Two concurrent lab deliveries perform two provider sends | F10 |
| R06 | Repeated issue allocates two different unit sets and both calls return success | F04 |

These are **six reproduced defects, not six passing product acceptance tests**. They establish the source-level behavior under stated dependencies. They do not prove the deployed DB schema lacks additional protections, nor substitute for full HTTP/auth/RLS/provider/browser tests. P0/P1 clinical and financial cases must be repeated on an isolated database with the real application role and synthetic records.

No production patient API audit, migrations, full builds, third-party installs, cloud inference, deployment or external messaging were performed for this comparison. Provider/device connectivity, branch protection, deployed environment flags, actual job registration outside the repository, clinical efficacy and regulatory compliance remain unverified. The opt-in `MEDCORE_ADOPTION_ENABLED` gate returns 404 unless enabled; defects in that surface are conditional on its use. The flag’s live value was not inspected. [MQ server/routes/medcore-adoption.route.js:26](https://github.com/MySmartHealth/Mediczy/blob/cc7008b9be90e714c4e2220910ae45e09a6cb0c2/server/routes/medcore-adoption.route.js#L26)

### Next execution suite for closure

Use two synthetic hospitals, two patients per hospital, and separate doctor/nurse/pharmacist/front-desk/security/admin accounts. Use disposable databases and test provider adapters; do not run destructive fixtures against production.

| Scenario | Required assertion |
|---|---|
| Each of the five mounted hospital action pages | Canonical business row created; another session can see it; validation/403/outage never shows false success. |
| Blood display empty versus SQL failure | Zero and unavailable are distinct; no generated stock, stale warning visible, organization scoped. |
| Blood issue retry/concurrency/return | Exactly one allocation; complete unit history; status and approved compatibility rules enforced. |
| Crossmatch/transfusion | Persisted patient/sample/unit/result linkage, review, expiry and bedside verification available. |
| Controlled substance posting | Witness/actor policy and stock constraints enforced; no half-written register/ledger. |
| GRN wrong PO/overage/second-line failure | Entire operation rejected/rolled back; retry cannot double-post; mismatch cannot be hidden by clamping. |
| Reminder restart and three-day course | Startup executes job; correct timezone; all unique occurrences created; cancellation stops future sends. |
| Quiet-hours and provider timeout | Deferred events resume; accepted-but-timeout response reconciled without duplicate send. |
| Lab draft through signed delivery | Persisted report values/patient correct; authorized review; provider failure/retry represented accurately. |
| Handoff two-clinician race | One claimant; immutable completed state; reassignment/reason audited. |
| Visitor creation and status-only checkout | UI actions execute; identity survives patch; real empty state; no phantom people. |
| Visitor two-tenant RLS and reused pooled connection | Own records visible; foreign records not visible; missing context fails safely. |
| Export PDF/XLSX and report restart | Real parseable bytes; correct MIME; schedules survive and provider receipts are recorded. |
| Maternity/pediatrics when commissioned | Reviewed clinical fixtures, structured lifecycle and signed corrections, not only a template. |
| Merge/installments/linked bookings | Referential integrity, balance conservation and concurrency invariants survive retries. |
| Feature flag disabled/provider unavailable | Clear unavailability, no synthetic KPI/output and no unintended external action. |

## Delivery order

**First, repair misleading and integrity-sensitive existing flows.** Take F02, F01, F03/F04, F14–F19 through synthetic HTTP/database/browser tests. These changes protect actual hospital use and should not wait for new specialty modules. F19 requires verification before claiming either a leak or a safe boundary.

**Then finish the adoption features as end-to-end workflows.** Close F05–F13 with scheduler registration, validated contracts, patient/report selection, review/ownership transitions and idempotent notification delivery. Keep opt-in gates tied to explicit clinical/product acceptance. The current workbench is a technical input/output screen; it should not stand in for a clinician-facing integrated workflow.

**Then complete durable reporting and data-backed planning.** Close F20/F21/F30; make report delivery and forecasts consume real scoped source data. Address F31 continuously with required contract checks and ownership of existing failures.

**Commission missing capabilities by hospital priority.** For maternity/pediatric sites, F22/F23 lead. For high-volume OPD, F24–F26 lead. For finance and ward operations, F27–F29 can be scoped independently. Use the existing patient/encounter/tenant model and canonical services; avoid adding a second competing patient or inventory store.

No effort estimate is asserted without agreeing workflow breadth, current deployment state, clinical owners and available test environments. The acceptance criteria in the CSV can become implementation tickets directly.

## Correction to the previous parity assessment

The previous [15 October parity audit](MEDCORE_MEDIQZY_PARITY_AUDIT_2026-10-15.md) remains historical. Its broad “implemented/parity” labels should not be read as end-to-end verification. This audit qualifies them with mounted-route evidence, unconnected persistence, missing job startup, observable failure paths and actual missing subsystems. In particular, a workbench route or migration is insufficient evidence that reminder delivery, lab review or transfusion traceability is complete; conversely HL7, laboratory QC and prescription safety should not be listed as wholly absent.
