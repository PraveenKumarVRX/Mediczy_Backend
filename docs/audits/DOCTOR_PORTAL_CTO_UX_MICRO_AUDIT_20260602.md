# Doctor Portal CTO + UX Micro Audit

Date: 2026-06-02
Scope: Doctor login, signup, dashboard, sidebar IA, endpoint/page flow
Owner: AI CTO Review

## Executive Summary

This audit identified four high-priority security and reliability issues and several medium-priority UX and information architecture issues in the doctor portal flow.

Implemented in this cycle:

- Enforced OTP-verified contact proof at doctor registration (email + phone).
- Removed LiveKit token leakage via URL query params across doctor call entry points.
- Aligned login contract so doctor login accepts email or phone identifier on backend.
- Fixed broken login route in doctor registration footer.
- Replaced dashboard demo fallback with stricter degraded-state handling for schedule-critical widgets.
- Cleaned sidebar IA overlap by removing duplicate alerts destination.
- Completed backend route modularization by extracting dashboard/alerts, triage/call, templates, messages, and billing/services route groups.
- Added backend regression tests for registration ticket enforcement and phone-login path.
- Added backend integration tests for modularized subrouters (including triage) and full OTP-verify plus register HTTP flow.

## Findings and Status

1. Critical: OTP verification not enforced at registration submit
- Risk: forged frontend payload could bypass ownership proof.
- Status: Fixed.
- Changes:
  - Issued signed verification tickets after successful OTP verify endpoints.
  - Enforced ticket checks during doctor registration for both email and phone.

2. Critical: LiveKit token passed in URL query params
- Risk: token exposure via logs, history, referrer, screenshots.
- Status: Fixed.
- Changes:
  - Replaced URL token transport with short-lived sessionStorage handoff.
  - Doctor video page now consumes handoff token and no longer reads token/server query params.

3. High: Login UX says email or phone; backend required email only
- Risk: avoidable login failures and support burden.
- Status: Fixed.
- Changes:
  - Updated doctor login validator to accept email or phone.
  - Updated login controller lookup to resolve doctor by email or common phone formats.

4. Medium: Broken route from signup footer to login
- Risk: onboarding dead end.
- Status: Fixed.
- Changes:
  - Updated route from /doctor-login to /doctor/login.

## Code Changes

Backend:
- server/routes/shared/registrationHelpers.js
  - Added signed verification ticket issuance on OTP success.
  - Added ticket validation helper for registration enforcement.
- server/controller/doctor.controller.js
  - Added registration ticket validation for email and phone.
  - Added phone identifier support in signInDoctor.
- server/routes/doctor.route.js
  - Updated login request validation to support email or phone identifier.
  - Mounted extracted doctor dashboard/alerts subrouter.
  - Mounted extracted doctor triage/call subrouter.
  - Mounted extracted doctor templates subrouter.
  - Mounted extracted doctor messages subrouter.
  - Mounted extracted doctor billing/services subrouter.
- server/routes/doctor/dashboard-alerts.routes.js
  - New modular route group for:
    - /alerts (list/read/mark-all-read/delete)
    - /dashboard/stats
- server/routes/doctor/triage.routes.js
  - New modular route group for:
    - /triage/:caseId/analyze-image
    - /triage/cases, /triage/stats
    - /triage/cases/:caseId/accept, /triage/cases/:caseId/respond
    - /appointments/:appointmentId/initiate-call
    - /triage/accept-call, /triage/reject-call
- server/routes/doctor/templates.routes.js
  - New modular route group for:
    - /templates (list/create/update/delete)
    - /template-settings (get/update)
- server/routes/doctor/messages.routes.js
  - New modular route group for:
    - /messages
    - /messages/:messageId/read
    - /messages/reply
- server/routes/doctor/billing.routes.js
  - New modular route group for:
    - /appointments/:appointmentId/invoice
    - /invoices, /invoices/:invoiceNumber, /invoices/:invoiceNumber/status
    - /services, /services/add, /services/:id
    - /appointments/:appointmentId, /appointments/:appointmentId/next-review

Backend tests:
- server/__tests__/doctor-auth-registration-guards.test.js
  - Added regression coverage for:
    - rejecting doctor registration when verification ticket is invalid
    - successful doctor login using phone identifier
- server/__tests__/doctor-subrouters-modularization.test.js
  - Added route-level integration coverage for:
    - templates, messages, billing/services
    - triage stats and triage case accept edge handling
- server/__tests__/doctor-registration-http-flow.test.js
  - Added full doctor registration HTTP flow coverage with mocked OTP boundaries:
    - send email OTP, verify email OTP
    - send phone OTP, verify phone OTP
    - register with verification tickets

Frontend:
- client/src/auth/DocRegister.tsx
  - Stored verification tickets per channel.
  - Included verification tickets in registration payload.
  - Added guard checks before step transition.
  - Fixed login footer route.
- client/src/pages/doctor/DoctorDashboard.tsx
  - Replaced token-in-URL navigation with sessionStorage handoff.
  - Removed demo appointment fallback payload and locked schedule cards in degraded mode.
  - Removed hard-coded metric fallback numbers for degraded mode.
- client/src/pages/doctor/DoctorMobileHome.tsx
  - Replaced token-in-URL navigation with sessionStorage handoff.
- client/src/components/notifications/VideoCallNotification.tsx
  - Replaced token-in-URL navigation with sessionStorage handoff.
- client/src/pages/doctor/DoctorVideoConsultation.tsx
  - Removed URL token query consumption.
  - Added secure handoff token consumption from sessionStorage.
- client/src/components/layout/MainLayoutdoctor.tsx
  - Removed duplicate Vital Alerts item that pointed to the same destination as Notifications.
- client/src/pages/doctor/DoctorDashboard.degraded-state.test.tsx
  - Added interaction coverage for degraded dashboard schedule lock state and retry-to-recovery UX.

## Remaining Recommendations

- None at this time for the scoped doctor portal micro-audit items.

## Validation Checklist

- [x] Doctor signup now requires OTP verification tickets from both channels.
- [x] Doctor login accepts phone number and email.
- [x] No lkToken/lkServer URL query usage remains in client source.
- [x] Signup footer login path resolves to /doctor/login.
- [x] Schedule-critical dashboard widgets no longer render demo appointment data on API failure.
- [x] Sidebar no longer contains duplicate Alerts destination with conflicting labels.
- [x] Dashboard/alerts routes extracted into a dedicated doctor subrouter module.
- [x] Triage/call routes extracted into a dedicated doctor subrouter module.
- [x] Templates routes extracted into a dedicated doctor subrouter module.
- [x] Messages routes extracted into a dedicated doctor subrouter module.
- [x] Billing/services routes extracted into a dedicated doctor subrouter module.
- [x] Targeted backend jest regression test run passes with `NODE_OPTIONS=--experimental-vm-modules`.
- [x] Route-level integration tests added for modularized doctor subrouters (templates/messages/billing/triage).
- [x] Route-level integration test added for full doctor registration HTTP flow (OTP verify + register) with mocked OTP boundaries.
- [x] Frontend interaction tests added for degraded dashboard states and retry UX.
