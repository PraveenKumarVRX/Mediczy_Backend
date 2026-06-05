# Pharmacy Portal Audit And Implementation Plan

Date: 2026-06-02  
Scope: Pharmacy login, dashboard, sidebar navigation, module pages, frontend services, backend APIs, endpoint contracts, security, compliance, QA, and product maturity.

## Executive Summary

The pharmacy portal has the right high-level module coverage: login, POS, prescriptions, inventory, stock alerts, batches, purchase orders, customers, reports, invoices, expiry tracking, analytics, settings, and support. However, the current implementation is not yet production-grade across the full flow.

The main blockers are inconsistent tenant isolation, mock or toast-only user actions, backend routes that trust client-supplied `pharmacyId`, frontend/backend endpoint mismatches, duplicate route implementations, and production API handlers that return static or random data.

The next development cycle should focus on stabilizing the pharmacy portal into a trustworthy operating system for pharmacies before adding advanced AI, analytics, or growth features.

## Audited Files And Surfaces

Frontend:

- `client/src/pages/pharmacy/PharmacyLogin.tsx`
- `client/src/pages/pharmacy/PharmacyDashboard.tsx`
- `client/src/pages/pharmacy/PharmacyModulePages.tsx`
- `client/src/components/pharmacy/PharmacyLayout.tsx`
- `client/src/components/pharmacy/PharmacySidebar.tsx`
- `client/src/services/pharmacy.service.ts`
- `client/src/routes/index.tsx`
- `client/src/auth/AuthProvider.tsx`
- `client/src/hooks/useRingFencing.tsx`

Backend:

- `server/routes/pharmacy.route.js`
- `server/routes/pharmacy/auth.routes.js`
- `server/routes/pharmacy/dashboard.routes.js`
- `server/routes/pharmacy/inventory.routes.js`
- `server/routes/pharmacy/pos.routes.js`
- `server/routes/pharmacy/transactions.route.js`
- `server/routes/pharmacy/prescriptions.routes.js`
- `server/routes/pharmacy/prescriptions.route.js`
- `server/routes/pharmacy/batches.route.js`
- `server/routes/pharmacy/customers.route.js`
- `server/routes/pharmacy/invoices.route.js`
- `server/routes/pharmacy/analytics.route.js`
- `server/routes/pharmacy/purchase-orders.route.js`
- `server/routes/pharmacy/stock-alerts.route.js`
- `server/routes/api-v1-pharmacy.js`

## Current Navigation Map

Sidebar modules currently exposed:

- Dashboard: `/pharmacy/dashboard`
- Point of Sale: `/pharmacy/pos`
- Prescriptions: `/pharmacy/prescriptions`
- Medicine Stock: `/pharmacy/inventory`
- Stock Alerts: `/pharmacy/stock-alerts`
- Batch Management: `/pharmacy/batches`
- Purchase Orders: `/pharmacy/purchase-orders`
- Customers: `/pharmacy/customers`
- Sales Reports: `/pharmacy/reports`
- Bills & Invoices: `/pharmacy/invoices`
- Expiry Tracking: `/pharmacy/expiry`
- Analytics: `/pharmacy/analytics`
- Settings: `/pharmacy/settings`

Support route exists in routing but is not exposed in the main sidebar:

- Support: `/pharmacy/support`

## Critical Findings

### P0-1: Tenant Isolation Is Inconsistent

Frontend sends `pharmacyId` from `localStorage` in many API calls. Some backend routes correctly derive pharmacy identity from JWT, but many routes trust `req.body.pharmacyId` or `req.query.pharmacyId`.

Examples:

- Frontend client passes `pharmacyId`: `client/src/services/pharmacy.service.ts`
- Backend trusts request-supplied `pharmacyId`: `transactions.route.js`, `batches.route.js`, `customers.route.js`, `invoices.route.js`, `analytics.route.js`, `purchase-orders.route.js`, `stock-alerts.route.js`
- Better pattern exists in `inventory.routes.js`, where `req.pharmacyId` is derived from the JWT.

Impact:

- A pharmacy user could potentially access or mutate another pharmacy's records by changing `localStorage` or query/body parameters.
- This is a serious multi-tenant security issue.

Required fix:

- Add one shared `requirePharmacyAuth` middleware.
- Derive `req.pharmacyId` only from verified JWT.
- Ignore client-supplied `pharmacyId` for pharmacy users.
- Allow explicit pharmacy selection only through admin/team endpoints with scoped authorization.
- Add tests proving cross-pharmacy access is rejected.

### P0-2: Mock Data Is Visible In Production Workflows

Several user-facing pages and APIs return static, random, or toast-only data.

Examples:

- `PharmacyModulePages.tsx`: POS, batches, invoices, settings, reports, analytics have static values and toast-only buttons.
- `dashboard.routes.js`: dashboard stats are mocked.
- `pos.routes.js`: sale and invoice APIs return mock responses.
- `prescriptions.routes.js`: prescriptions and upload responses are static/mock.
- `inventory.routes.js`: fallback inventory uses random quantity and expiry.

Impact:

- Users can believe a sale, invoice, prescription, batch, or customer action succeeded when nothing durable happened.
- Operational data can be inaccurate.
- QA cannot reliably distinguish implemented workflows from placeholders.

Required fix:

- Remove production mocks from API handlers.
- Keep seed/demo data only behind an explicit dev/demo flag.
- Hide, disable, or fully wire every visible action.
- Replace toast-only success flows with real API calls and persisted state.

### P0-3: Frontend And Backend API Contracts Do Not Match

Examples:

- Frontend calls `/api/pharmacy/sales`, but backend exposes `/api/pharmacy/transactions` and `/api/pharmacy/pos/*`.
- Frontend calls `/api/pharmacy/inventory/low-stock`, but backend inventory low-stock logic is query/filter based, not that route.
- Frontend uses both dashboard-owned rendering and standalone `PharmacyModulePages` for similar flows.

Impact:

- Buttons and pages fail even when login/auth works.
- Some workflows have no matching endpoint.
- Developers cannot safely extend the portal without reverse engineering route behavior.

Required fix:

- Create a pharmacy OpenAPI contract.
- Pick canonical endpoint names.
- Generate or validate the frontend client against that contract.
- Add integration tests for every sidebar route.

### P0-4: Runtime Schema Mutation In Route File

`server/routes/pharmacy.route.js` runs:

```js
ALTER TABLE pharmacies ALTER COLUMN "licenseNumber" DROP NOT NULL
```

Impact:

- Route import can silently alter production schema.
- Migration state becomes untraceable.
- Startup side effects can mask broken deployments.

Required fix:

- Move this change to a versioned migration.
- Remove schema mutation from route files.
- Add migration verification to deployment checks.

## High-Priority Findings

### P1: Duplicate Route And Auth Implementations

There are overlapping pharmacy route files:

- `pharmacy.route.js`
- `pharmacy/auth.routes.js`
- `prescriptions.routes.js`
- `prescriptions.route.js`
- `api-v1-pharmacy.js`

Required fix:

- Consolidate internal pharmacy portal APIs into one module tree.
- Reuse shared auth, tenant verification, validation, and error formatting.
- Align with the cleaner scoped model already visible in `server/routes/api-v1-pharmacy.js`.

### P1: Token Storage Needs Hardening

The login flow stores `pharmacyToken` and `pharmacyData` in `localStorage`.

Required fix:

- Prefer secure httpOnly, SameSite, Secure cookies.
- If token storage remains client-side temporarily, use short-lived access tokens, refresh rotation, strong CSP, logout-on-status-change, and device/session revocation.
- Add MFA/OTP for pharmacy admins.

### P1: Sidebar Information Architecture Needs Workflow Focus

Current sidebar is module-heavy. It should become task-oriented.

Recommended sidebar:

- Dashboard
- Sell / POS
- Dispense Prescriptions
- Orders
- Inventory
- Batches & Expiry
- Purchase & Suppliers
- Customers
- Invoices & Returns
- Reports
- Settings
- Support

### P1: Settings Page Is Not Connected

Settings currently uses hardcoded values such as pharmacy name, license, contact, and email.

Required fix:

- Load from `/api/pharmacy/profile`.
- Save through a real profile/settings endpoint.
- Include license number, pharmacist-in-charge, GST details, address, operating hours, alert thresholds, receipt settings, notification preferences, and staff permissions.

## Product Requirements For A World-Class Pharmacy Portal

### Golden Workflows

The portal should be considered production-ready only when these flows pass end-to-end:

1. Pharmacy registration and approval.
2. Pharmacy login, MFA, session verification, and logout.
3. POS sale with medicine search, batch selection, stock deduction, invoice, payment method, and receipt.
4. Prescription intake, verification, dispensing, partial fill, rejection, and status update.
5. Inventory medicine creation, stock adjustment, reorder threshold, low-stock alert.
6. Batch receiving with manufacturing date, expiry date, supplier, cost, MRP, and FEFO usage.
7. Purchase order creation, supplier tracking, receiving, and stock update.
8. Invoice view/download/refund/return with audit log.
9. Customer lookup and purchase history.
10. Analytics dashboard driven by real transaction data.

### Pharmacy Operating Features

Must-have:

- Barcode scan/search.
- Generic and brand medicine search.
- Batch-aware dispensing.
- FEFO stock issue.
- Negative stock prevention.
- Expiry and near-expiry workflows.
- Low-stock reorder suggestions.
- Customer mobile number lookup.
- GST-ready invoice fields.
- Returns/refunds.
- Staff roles and permission matrix.
- Pharmacist approval checkpoints.
- Immutable audit trail.

Advanced:

- Drug interaction and allergy warnings.
- Prescription OCR.
- Generic alternatives.
- Reorder forecasting.
- Expiry loss prediction.
- Supplier scorecard.
- Corporate benefit or discount adjudication.
- Delivery handoff and pickup codes.

## Implementation Plan

### Phase 0: Stabilization And Safety

Goal: Make the current portal honest, secure, and testable.

Backend:

- Create `requirePharmacyAuth` middleware.
- Apply it to all pharmacy portal routes.
- Replace request-supplied `pharmacyId` with `req.pharmacyId`.
- Remove runtime schema mutation from `pharmacy.route.js`.
- Remove production mock responses.
- Return explicit `501 Not Implemented` or feature-disabled response for unfinished APIs.
- Normalize API errors to `{ success, message, code, details? }`.

Frontend:

- Stop sending `pharmacyId` from `localStorage` for pharmacy-owned resources.
- Fix endpoint names in `pharmacy.service.ts`.
- Hide or disable dead buttons.
- Add loading, empty, and error states for every sidebar page.
- Add Support to sidebar or remove route until implemented.

QA:

- Add smoke tests for login and every sidebar route.
- Add API contract tests for each pharmacy endpoint.
- Add cross-tenant tests proving pharmacy A cannot access pharmacy B.

Acceptance criteria:

- No pharmacy route trusts client-supplied `pharmacyId`.
- No visible button shows fake success.
- No production API returns random/static operational data.
- Every sidebar page either works or clearly says unavailable.

### Phase 1: Core Pharmacy Workflows

Goal: Deliver real operational value.

Backend:

- Implement canonical endpoints:
  - `GET /api/pharmacy/dashboard/stats`
  - `GET /api/pharmacy/inventory`
  - `POST /api/pharmacy/inventory`
  - `PATCH /api/pharmacy/inventory/:id`
  - `POST /api/pharmacy/batches`
  - `GET /api/pharmacy/batches`
  - `POST /api/pharmacy/transactions`
  - `GET /api/pharmacy/transactions`
  - `POST /api/pharmacy/invoices`
  - `GET /api/pharmacy/invoices`
  - `GET /api/pharmacy/prescriptions`
  - `PATCH /api/pharmacy/prescriptions/:id/status`
- Add transactional stock deduction for POS.
- Add batch FEFO selection.
- Add invoice item persistence.
- Add audit log entries for every write.

Frontend:

- Replace static POS with real cart and checkout.
- Replace static batch/invoice/customer pages with API-backed lists and forms.
- Add form validation with clear inline errors.
- Add optimistic-free UI: success only after backend success.

QA:

- Add E2E tests:
  - Create inventory item.
  - Add batch.
  - Run POS sale.
  - Confirm stock decreased.
  - Confirm invoice exists.
  - Confirm dashboard reflects sale.

Acceptance criteria:

- A real sale can be completed and audited.
- Inventory, batch, invoice, and dashboard data remain consistent.
- Failed operations do not mutate partial state.

### Phase 2: Prescription And Compliance Layer

Goal: Make pharmacy dispensing clinically and legally safer.

Backend:

- Add prescription upload with secure storage.
- Add pharmacist verification status.
- Add dispense, partial dispense, reject, and cancel states.
- Add controlled/scheduled medicine flags.
- Add immutable dispensing audit trail.
- Add license and pharmacist-in-charge metadata.

Frontend:

- Build prescription work queue.
- Add patient, doctor, medicine, dose, quantity, availability, and verification view.
- Add substitution and partial-fill UI.
- Add dispense confirmation.

Compliance:

- Add consent and retention policy hooks.
- Add access logs for PHI views.
- Encrypt uploaded documents and sensitive fields at rest where required.
- Add exportable audit trail for inspection.

Acceptance criteria:

- Prescription lifecycle is traceable from intake to completion.
- Every PHI view and dispensing decision is auditable.
- Controlled/scheduled medicine workflow cannot bypass pharmacist verification.

### Phase 3: Procurement, Analytics, And Operational Excellence

Goal: Move from basic management to pharmacy operating intelligence.

Backend:

- Supplier master.
- Purchase order lifecycle.
- Receiving and stock reconciliation.
- Returns and expired stock disposal.
- Sales analytics, margin, SKU velocity, expiry risk, reorder forecasting.

Frontend:

- Supplier and purchase dashboards.
- Expiry loss dashboard.
- Reorder recommendation screen.
- Reports with CSV/PDF export.
- Role-based dashboard views for owner, pharmacist, cashier, and inventory staff.

Acceptance criteria:

- Purchase order receiving updates stock correctly.
- Expiry and low-stock alerts are generated from real data.
- Reports match source transactions.

### Phase 4: AI And Competitive Differentiation

Goal: Make the portal world-class, not just functional.

AI features:

- Prescription OCR with human verification.
- Medicine alternatives and generic substitution suggestions.
- Drug interaction, allergy, pregnancy, and duplicate therapy checks.
- Reorder prediction.
- Expiry-loss forecast.
- Anomaly detection for unusual sales, refunds, or controlled medicine patterns.

Product features:

- WhatsApp/SMS pickup notifications.
- Delivery handoff.
- Corporate plan benefit discounts.
- Patient medication adherence reminders.
- Supplier marketplace integrations.

Acceptance criteria:

- AI suggestions are advisory, explainable, and auditable.
- Pharmacist remains the final decision maker.
- AI output cannot directly dispense or sell without human confirmation.

## Backend Target Architecture

Recommended module structure:

```text
server/routes/pharmacy/
  index.route.js
  auth.route.js
  dashboard.route.js
  inventory.route.js
  batches.route.js
  pos.route.js
  prescriptions.route.js
  invoices.route.js
  customers.route.js
  suppliers.route.js
  purchase-orders.route.js
  analytics.route.js

server/services/pharmacy/
  auth.service.js
  inventory.service.js
  pos.service.js
  prescriptions.service.js
  invoices.service.js
  audit.service.js

server/middleware/
  requirePharmacyAuth.js
  requirePharmacyScope.js
```

Mandatory backend rules:

- All pharmacy-owned rows must include `pharmacy_id`.
- All pharmacy reads and writes must filter by server-derived `req.pharmacyId`.
- All writes must be audited.
- POS checkout must run in a DB transaction.
- Stock cannot go negative.
- Invoice totals must be recomputed server-side.
- Client-supplied prices, discounts, and taxes must be validated server-side.

## Frontend Target Architecture

Recommended module structure:

```text
client/src/pages/pharmacy/
  PharmacyLogin.tsx
  PharmacyRegister.tsx
  dashboard/
  pos/
  prescriptions/
  inventory/
  batches/
  purchasing/
  customers/
  invoices/
  analytics/
  settings/

client/src/services/pharmacy/
  auth.ts
  inventory.ts
  pos.ts
  prescriptions.ts
  invoices.ts
  customers.ts
  analytics.ts
```

Mandatory frontend rules:

- No static production data in module pages.
- No toast-only success for durable actions.
- No `pharmacyId` from `localStorage` in tenant-scoped calls.
- Shared list state: loading, empty, error, success.
- Shared form state: validation, disabled submitting state, retry behavior.
- Every icon-only action needs accessible label or tooltip.

## Security And Compliance Requirements

Security:

- MFA for pharmacy admin and owner roles.
- Secure session cookies or short-lived access tokens with refresh rotation.
- Rate limit login, OTP, upload, and POS write endpoints.
- Audit all login attempts and all operational writes.
- Validate uploaded prescription files with type, size, malware, and storage controls.
- Use least-privilege staff roles.

Compliance:

- DPDP-ready consent, purpose limitation, retention, and deletion workflow.
- PHI/PII access logging.
- Prescription and dispensing audit trail.
- License and pharmacist-in-charge verification.
- Controlled/scheduled medicine controls.
- Data export for audits and inspections.
- Encryption at rest for sensitive documents and credentials.

Note: This is an engineering compliance plan, not a legal opinion. Final legal and pharmacy regulatory review should be completed before launch.

## QA Test Matrix

Minimum automated tests:

- Pharmacy login succeeds for active account.
- Pending or inactive pharmacy cannot log in.
- Expired token redirects to login.
- Pharmacy A cannot read Pharmacy B inventory, batches, customers, invoices, prescriptions, analytics, or transactions.
- Add inventory item.
- Add batch.
- Complete POS sale.
- Stock decreases exactly once.
- Invoice created exactly once.
- Failed POS sale rolls back stock and invoice.
- Prescription status update is authorized and audited.
- Sidebar pages render without runtime errors.
- Each disabled/unimplemented action is clearly marked.

Manual UAT checks:

- POS with barcode scanner.
- Prescription image upload.
- Low-stock threshold.
- Expiring batch.
- Invoice print/download.
- Refund/return.
- Staff role restrictions.
- Mobile/tablet layout.

## Delivery Ownership

Product Manager:

- Prioritize golden workflows.
- Decide which incomplete modules stay visible.
- Define launch criteria.

Business Analyst:

- Document pharmacy SOPs, invoice rules, prescription lifecycle, and roles.

Principal Engineer / Architect:

- Own route consolidation, tenant isolation, API contract, and transaction boundaries.

Backend Engineer:

- Implement canonical APIs, service layer, audit logs, and tests.

Frontend Engineer:

- Replace mock module pages, wire real services, and improve sidebar/workflow UX.

AI Engineer:

- Design OCR, medicine alternatives, interaction warnings, and forecasting after core workflow stabilization.

DevOps Engineer:

- Add migration checks, deployment gates, logging, monitoring, and alerting.

UX/UI:

- Redesign pharmacy workflows around daily tasks, not module inventory.

QA:

- Own E2E tests, smoke tests, regression tests, and UAT scripts.

Security And Compliance:

- Own tenant isolation, session hardening, audit log requirements, PHI access controls, and regulatory review.

## Recommended Execution Board

- P0: Tenant isolation and auth middleware.
- P0: Remove production mocks and dead actions.
- P0: API contract alignment.
- P0: POS sale with stock transaction.
- P1: Inventory, batches, invoices, customers real CRUD.
- P1: Prescription lifecycle.
- P1: Audit logs for all writes and PHI views.
- P2: Purchase orders and suppliers.
- P2: Analytics from real data.
- P2: Settings/profile persistence.
- P3: AI OCR and safety checks.
- P3: Forecasting and operational intelligence.

## Definition Of Done For Pharmacy Portal V1

- All sidebar modules are either fully functional or explicitly disabled.
- All pharmacy APIs use shared auth and server-derived tenant identity.
- No production route returns mock/random data.
- POS sale, stock update, invoice, and audit log are atomic.
- Prescription workflow is auditable and pharmacist-controlled.
- API contract tests and E2E tests pass.
- Security review confirms cross-tenant isolation.
- Product signs off core pharmacy UAT.

