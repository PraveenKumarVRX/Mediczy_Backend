# Doctor Mobile App Audit Fix TODO

Last updated: 2026-05-31

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
