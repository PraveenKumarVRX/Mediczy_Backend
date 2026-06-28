# HRMS Module Audit and Implementation Note

Date: 2026-06-28
Scope: `/hr/*` web module and `/api/hr/*` HRMS endpoints.

## Implemented in this pass

- Added tenant-scoped HRMS backend route for staff directory, biometric devices, attendance, audit events, recruitment, and benefits.
- Mounted `/api/hr/login` and `/api/hr` in the Express app and allowed the HR route through ring-fencing for hospital users.
- Replaced static `/hr/benefits` data with live benefit-program APIs and UI: summary KPIs, register, export, refresh, and add-program workflow.
- Wired `/hr/dashboard` to live HR summary, attendance, staff, and recruitment summary APIs with static fallbacks.
- Added biometric attendance guardrails: event type allow-list, batch-size cap, tenant checks, device status validation, and normalized timestamps.
- Removed browser console logging of department login tokens and localStorage snapshots.
- Replaced shared hardcoded HR-created account passwords with generated temporary passwords and password-reset-required metadata.
- Added tenant-scoped HR CV storage tables/endpoints and `/hr/recruitment` UI for manual CV intake.
- Added HR mail inbox settings, IMAP sync, AI intent classification, and inbox-to-candidate / inbox-to-benefit actions.
- Added tenant-scoped employee performance review storage, attendance-linked scoring, AI summary/risk notes, and live `/hr/performance` review UI.
- Added HR user management endpoints/UI with branch scope so multiple HR users can operate across one or more locations.
- Implemented API-backed LMS programs/enrollments, Goals/OKRs, engagement surveys, and HR Help Desk tickets.
- Implemented API-backed onboarding tasks and employee document management with upload/verification.
- Implemented API-backed shift roster and timesheet submission/approval workflows.
- Implemented API-backed leave requests, approvals, and leave summary workflows.
- Added tenant-scoped HR locations/branches and branch-aware people management for staff and biometric devices.
- Confirmed HRMS is not tier-gated: exposed an all-features catalog for Employee DB, leave, onboarding/offboarding, documents, attendance, shifts/roster, timesheets, performance, OKRs, compensation revisions, surveys, LMS, and HR Help Desk.

## Key gaps still remaining

- Leave, shifts, onboarding, PF/ESI, training, performance, appraisals, analytics, compliance, settings, and support pages still contain static or partially static data.
- HR-created account invitation/password reset delivery is not complete; accounts are flagged for reset but need an email/SMS invitation workflow.
- Payroll uses the existing `/payroll/*` service but needs HR-specific authorization review, approval workflow, payslip generation, and statutory export controls.
- Biometric ingestion is API/manual only; production-grade device integration still needs signed device credentials, idempotency keys, replay protection, and vendor adapters.
- Benefits now has CRUD create/list and inbox intake, but needs edit/archive, eligibility rules, dependants, claims/utilization, renewal owner workflow, and document attachments.
- HR inbox credentials currently follow the existing app pattern and should be moved to encrypted secret storage before production rollout.
- Recruitment AI screening is deterministic rules-based; production use needs bias review, explainability logging, human approval gates, and audit retention.
- A complete automated HRMS regression suite is still needed across tenant isolation, auth roles, attendance calculations, recruitment transitions, and benefits CRUD.

## Recommended next build sequence

1. Move leave, shifts, onboarding, PF/ESI, and payroll approvals from static UI to tenant-scoped APIs.
2. Add HR invitation workflow and force-password-change enforcement on login.
3. Add audit-log tables for staff mutations, benefit changes, payroll actions, and recruitment stage changes.
4. Add encrypted secret storage for HR SMTP/IMAP credentials and signed download URLs for CV documents.
5. Add device-authenticated biometric sync with idempotency and duplicate punch handling.
6. Add Playwright smoke tests for `/hr/dashboard`, `/hr/staff`, `/hr/attendance`, `/hr/benefits`, and `/hr/recruitment`.
