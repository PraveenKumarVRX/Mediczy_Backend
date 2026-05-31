# Doctor Mobile App Audit Fix TODO

Last updated: 2026-05-31

Status summary:
- Code-level audit fixes: Completed.
- Remaining work: Production infrastructure/credentials provisioning and live push smoke validation.

## Security

- [x] D-SEC-1: Return `refreshToken` from doctor login response in `signInDoctor`.
- [x] D-SEC-2: Add doctor-patient relationship guard helper and enforce on key `my-patients` endpoints:
	- `PUT /api/doctors/my-patients/:patientId`
	- `POST /api/doctors/my-patients/:patientId/vitals`
	- `POST /api/doctors/my-patients/:patientId/history`
	- `GET /api/doctors/my-patients/:patientId/profile`
	- `GET /api/doctors/my-patients/:patientId/vitals-history`
- [x] D-SEC-3: Redact Appendix C credentials from integration guide.
- [ ] D-SEC-4: Provision doctor Firebase service account in production and validate doctor push notifications end-to-end.
	- Code readiness: supports separate doctor Firebase credentials via `config/firebase-service-account-doctor.json`.
	- Blocker: production credential material is not stored in repository and must be provisioned by DevOps/SRE.

## Quality and Reliability

- [x] D-QA-1: Return `503` (not `200`) when history/vitals backing tables are unavailable.

## AI and Authorization

- [x] D-AI-2: Restrict prescription document generation in offline scribe to doctor role only.
	- Protected in `/prescription`
	- Protected in `/sessions` when `document_type=prescription`
	- Protected in `/full-pipeline` when `document_type=prescription`
	- Protected in `/batch` when any item is `document_type=prescription`
- [x] Add doctor ownership guard in `POST /api/ai/generate-prescription` for appointment/patient scoping before DB save.

## Architecture and Backend

- [x] D-ARCH-1: Add alias route `GET /api/doctors/patients/:patientId`.
- [x] D-BACK-1: Add pagination support to `GET /api/prescriptions/doctor/issued`.
- [x] D-BACK-2: Add vitals range validation before insert.
- [x] D-ARCH-3: Harden availability ownership checks so only authenticated doctors can mutate their own availability schedules.

## Follow-Up Verification

- [x] Run API regression tests for doctor app auth, my-patients, prescriptions, and offline-scribe role access.
- [ ] Run a production/staging smoke checklist for doctor push notifications after service account provisioning.

## External Ops Handoff (Required to Close Remaining Items)

- [ ] Add/rotate production doctor Firebase service account credentials in secure secret store.
- [ ] Mount or inject `firebase-service-account-doctor.json` (or equivalent env-based credentials) in production runtime.
- [ ] Restart doctor API service and verify Firebase initialization endpoints/health logs.
- [ ] Register a fresh doctor app FCM token from production doctor build.
- [ ] Trigger doctor-targeted push path and verify delivery receipt on real device.
- [ ] Trigger patient-targeted push path to confirm no regression in default Firebase app routing.
- [ ] Capture evidence (timestamped logs + screenshot + request IDs) and attach to release ticket.

Closure criteria:
- D-SEC-4 can be marked done only after production credentials are active and doctor push notifications are confirmed end-to-end on real devices.
