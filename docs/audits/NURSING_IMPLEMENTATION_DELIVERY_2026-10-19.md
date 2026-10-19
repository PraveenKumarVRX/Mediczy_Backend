# Nursing implementation delivery and rollout record

Date: 19 October 2026 (Asia/Kolkata). Scope: NUR-01–NUR-18 in the [repository comparison and gap plan](NURSING_REPO_COMPARISON_GAPS_IMPLEMENTATION_PLAN_2026-10-19.md).

The repository now contains the nursing implementation across these workstreams. **Repository delivery and clinical production acceptance are separate states.** Following explicit user authorization, the migration, isolated backend and private image infrastructure were deployed live and the selected demo hospital was onboarded. See the [production release and demo verification record](../deployment/NURSING_PRODUCTION_RELEASE_2026-10-19.md) for current deployment status. Human clinical acceptance remains pending. The broader cross-department program in section 10 of the original plan remains a department-by-department roadmap, not a claim that every hospital integration has been rewritten.

## Delivered scope

| Gap | Implementation | Verification / production condition |
|---|---|---|
| NUR-01: nurse identity | Legacy nurse auth delegates to the shared revocation/account/tenant checks; login includes tenant claims. Visible portal and explicit Authorization take precedence over a stored hospital session. Expired sessions lock the chart without abandoning in-session drafts. | Actor/session unit tests, browser mixed-token and lock/recovery checks. Provision individual hospital-linked nurse accounts. |
| NUR-02: scope | Shared transaction context, explicit tenant/admission/patient checks, current ward assignment and individual-nurse write gates. New nursing PHI tables force RLS. Legacy medication/wound/vital bypasses are retired or routed through the same checks. | Real PostgreSQL tenant/ward denial, RLS, revoked-assignment and non-owner-role checks. Confirm production app role cannot bypass RLS or own clinical schemas. |
| NUR-03: navigation and assignments | `/nurse/ward`, dashboard/notes/vitals/patients entry points, portal-native eMAR and admission links; real assignment administration and explicit prescriber→HR identity links. Nurse e-chart links redirect to the assigned workspace. | Route/session tests and desktop/tablet browser checks. Configure shifts and qualified staff identities before enabling writes. |
| NUR-04: contracts | Due-dose DTO has exact slot ID and version, order revision, patient/admission, ward, units and time. Window/admission filters and task filters are consumed. | Service/DB and browser request checks. Legacy snake-case due fields retained for hospital cards. |
| NUR-05: dose integrity | Unique scheduled slots, pending vs terminal distinction, locks, version checks, idempotent responses, immutable terminal rows and complete outcome history. Historical inconsistent patient/order links fail closed. | Concurrent nurses, retry replay, immutable SQL update rejection, migration-conflict rehearsal. Reconcile historical duplicate slots before migration. |
| NUR-06: medication safety | Actual patient/dose/unit/route/time checks; active qualified prescriber; current order revision; barcode identifier matching; authenticated distinct witness bound to slot, action and order revision; hospital consent; generic/class allergy matching using approved content. PRN interval/daily limits and infusion start/rate/stop events are included. | Wrong identifiers/dose/unit/route, Boolean barcode spoof, class allergy, self-witness, PRN and infusion scenarios. Clinical leads must approve local policy/content and validate real wristband/drug-code workflows. |
| NUR-07: pharmacy | Given-dose reconciliation is created in the same transaction as the administration. Refused/held doses do not create consumption requests. Replays are harmless; failed writes cannot be silently discarded. Pharmacy-only review confirmation and `/pharmacy/nursing-consumption` UI added. | Bridge unit tests and real transaction/duplicate/refusal cases. This queue records consumption review; physical stock issue/return and billing use their own existing workflows and require site reconciliation validation. |
| NUR-08: schema | Removed nursing/eMAR startup DDL and consent bootstrap DDL. Additive migration owns new state, signed-entry protection, terminal-dose protection, indexes and RLS. Manifest propagates this migration's errors. RLS audit now fails on missing required tables. | Disposable migration/upgrade/conflict/restore scenarios pass. The production migration completed after an available RDS snapshot; all 18 nursing tables have forced RLS. Production runtime ownership separation remains pending. |
| NUR-09: signed documentation | Admission-bound note drafts, server autosave, actor attribution, revision checks, fresh author password verification, signed immutable entries and append-only amendments. Stale concurrent amendment signatures are refused. | Real author/signing/SQL immutability/amendment tests; browser autosave. Clinical acceptance of signature workflow and record retention remains required. |
| NUR-10: vitals | Bedside observations use the shared vital/scoring service within the chart transaction. Observation time, numeric zero values, units and completeness are retained. Ward-scoped alert acknowledgment is available in the workspace. | NEWS2 vectors/contracts and real flowsheet→vital write checks. Site escalation SOP and devices still require validation. |
| NUR-11: fluids | Idempotent event writes; facility-day aggregation rebuilt from observations and signed amendments. Unsigned corrections do not change totals. | Backdated entry/retry and signed-volume-correction scenarios. Configure facility timezone. |
| NUR-12: assessments and plans | Structured assessments, attribution, stable admission task templates, patient problems/goals/interventions, linked physician care plan and append-only versioned evaluations. | Task/goal/evaluation DB cases. Nursing leadership supplies approved assessment/risk templates and care content. No licensed nursing terminology was imported. |
| NUR-13: handover | Full ward snapshot, patient-level SBAR, persisted draft/send/accept, assigned incoming receiver, census-conflict detection, transactional notification and history. Provider failure uses a deterministic draft; clinical-data failure remains an error. | 31-patient ward, wrong receiver, acknowledgment and delivery tests; governed-AI tests. Hospitals must test shift/transfer SOPs and handover coverage. |
| NUR-14: wounds/procedures | Existing wound tracking extended with admission/episode, measurements, reviewed stage, image ownership, intervention/device-care history and reassessment tasks. AI wound results no longer automatically write a clinical record. Private image upload and short-lived authorized reads included. | Review/episode scope tests pass. Private KMS image storage is provisioned; real upload, signed read and unsigned denial passed using a synthetic demo image. Clinical retention approval remains pending. |
| NUR-15: bedside resilience | Responsive shared controls, portrait/landscape layouts, note autosave, conflict/error messaging, unsaved-work protection, lock/re-authentication and dated read-only downtime export. | Browser checks at 768×1024, 1024×768 and 1440×900; interrupted write and draft recovery. Destructive tab closure cannot preserve an unsaved fluid draft; recovery follows the downtime SOP. |
| NUR-16: verification and operations | Disposable PostgreSQL integration harness, backup/restore rehearsal, synthetic browser harness, repeatable focused unit commands and local operational metrics/outbox replay. | Automated results below. Hospital UAT, penetration test, real scanner/device testing and a supervised ward pilot are still go-live gates. |
| NUR-17: exchange | Authorized nursing collection export: Patient, Encounter, signed DocumentReference/Observation, wound observations, CarePlan, Procedure, MedicationRequest, MedicationAdministration and Provenance. Existing FHIR/HL7 platform is retained. | Export structure/content checks. This is a collection adapter, not a newly certified FHIR server or an ABDM/partner conformance claim. Validate partner profiles, scopes and round trips before integration release. |
| NUR-18: governed intelligence/devices | Facility-opt-in SBAR drafts, full source coverage, structural identity minimization, deterministic fallback, invented-priority-ID filtering and no model signing. Public-key authenticated device observations queue for assigned nurse review; they cannot sign or administer. Workload/omission/acknowledgment metrics and local inbox events are available. | AI failure/coverage tests and real Ed25519 ingest/replay/review cases. Production provider approval/evaluations, device commissioning and broader analytics validation remain site tasks. |

## Entry points and configuration

- Individual nurse: `/nurse/login` → `/nurse/ward` or `/nurse/dashboard`; select an assigned active admission.
- Supervisor: `/hospital/nursing/administration` → configure nurse shift/ward assignments, facility timezone/barcode policy, prescriber identity links and optional AI/device registration.
- Medication chart: `/nurse/emar?admissionId=...` → due doses, PRN preparation and infusion tracking.
- Pharmacy review: `/pharmacy/nursing-consumption` with a hospital-linked pharmacy account; confirmation does not issue stock or post a bill.
- API contract: [NURSING_BEDSIDE_API.md](../api/NURSING_BEDSIDE_API.md).
- Migration: [20261019000100-nursing-workflow-integrity.migration.js](../../server/migrations/20261019000100-nursing-workflow-integrity.migration.js), appended after its prerequisites in `server/scripts/migrate-all.mjs`.

Required deployment data: individual nurses attached to hospitals, current ward assignments, consistent patient/admission/order identifiers, verified HR prescribing qualifications and explicit doctor→HR user links. The application never assumes equal numeric IDs in those identity tables.

Optional integrations require configuration:

- Wound images: `NURSING_IMAGE_BUCKET`, AWS region/credentials, private bucket access and KMS encryption; optional `NURSING_IMAGE_KMS_KEY`. Enforce bucket public-access blocking and the hospital's retention/access policy in infrastructure.
- AI: off by default; facility supervisor opt-in plus an approved configured provider. Drafts still require review and cannot finalize documentation.
- Devices: supervisor registers an Ed25519 public key bound to an admission; the private key stays on the device. Commissioning requires real-device verification and clock synchronization.
- Event dispatch: local handover inbox creation is transactional. The supervisor replay endpoint handles outstanding local events. External transport integrations are not implicitly enabled.

## Repeatable verification

Run from the repository root:

```bash
npm run test:nursing --prefix server -- --silent
npm run test:nursing:integration --prefix server
npm run test:nursing --prefix client
npm run typecheck:nursing --prefix client
npm run test:nursing:browser --prefix client
npm run build --prefix client -- --outDir /tmp/mediqzy-nursing-build --emptyOutDir
```

The integration command starts its own temporary loopback-only PostgreSQL cluster on an unused port, creates an isolated fixture and non-owner application role, and removes the cluster on exit. It does not use deployment database settings. It requires local PostgreSQL binaries (`NURSING_POSTGRES_BIN`, default `/usr/lib/postgresql/16/bin`). The browser command uses synthetic intercepted APIs and Chromium (`NURSING_CHROMIUM_PATH`, default `/snap/bin/chromium`); it does not authenticate to real services.

Initial local results are recorded in [the implementation verification artifact](../testing/NURSING_IMPLEMENTATION_VERIFICATION_2026-10-19.json). The later [production verification artifact](../testing/NURSING_PRODUCTION_VERIFICATION_2026-10-19.json) records 130 backend tests, 34 disposable database scenarios and the real authenticated demo/API/tablet/image walkthroughs. Browser fixtures prove UI contracts, session selection and interruption behavior; the PostgreSQL harness exercises real services and schema separately. Neither those fixtures nor the live synthetic demo replace an end-to-end clinical pilot.

A full repository TypeScript invocation has existing diagnostics across unrelated modules. The checked-in `client/tsconfig.nursing.json` verifies the nursing screens/components and their imported dependencies; this focused check passes, and the client production bundle is also validated separately. Existing large-bundle warnings are retained for the wider performance roadmap. Unit test imports may briefly retain asynchronous handles; the completed focused run exits successfully.

The `nursing-integrity` job in `.github/workflows/ci.yml` runs the focused backend, disposable database, client session, targeted type and synthetic browser checks. Its constituent commands pass locally; this new job has not yet run on GitHub, so runner-specific installation or configuration may still need adjustment.

The read-load probe uses a 31-admission synthetic ward and 40 service reads at concurrency 10. Its p95 is a local sample, not proof of production availability, twice a hospital's actual peak, or a published service-level guarantee. The dump/restore rehearsal proves local logical recovery, not the proposed production RPO/RTO.

## Migration and release gates

1. Review the additive migration and a current backup in staging. Its prerequisites include existing ADT, nursing, wound, eMAR, pharmacy and HR schemas. The migration deliberately fails on duplicate historical dose slots or reconciliation links; reconcile their clinical meaning without deleting signed evidence before retrying. The migration runner must return a failure, not an “already exists” success.
2. The user authorized the nursing production migration because staging does not exist; its snapshot, migration and nursing RLS checks are recorded in the release report. Runtime database ownership separation and the wider RLS audit remain pending. Future migrations still require a reviewed environment and explicit target.
3. Provision shifts, hospital-linked users, approved prescribing qualifications, identity links, barcode identifiers and facility policy. Existing free-text medication records remain historical documentation; they are not silently converted to authorized orders or given doses.
4. Test real browser authentication/revocation, real image storage, two-person verification, actual scanner input, order/stock/return reconciliation, acknowledgments, ward transfers, downtime reconciliation and the partner export contract with nursing, pharmacy and hospital IT.
5. Complete clinical UAT, security review, staff training and a supervised single-ward pilot. Expand only after its documented acceptance. Neither source completion nor local tests establish regulatory approval, accreditation or improved clinical outcomes.

Rollback disables new nursing writes through the release deployment and keeps chart read/export access. The clinical migration has no destructive down migration; use a reviewed forward correction and preserve signed/history records. Do not replace the database with a stale backup to undo application code.
