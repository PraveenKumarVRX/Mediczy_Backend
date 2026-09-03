# Mediqzy Corporate Wellness World-Class Implementation Plan

Date: 2026-09-03

## 1. Objective

Turn Mediqzy Corporate HR Login from a health-checkup and employee-management portal into a full corporate wellness operating system comparable with GetVisit/Visit, MediBuddy, and ekincare.

The target product should give HR teams:

- Secure dashboard and login access.
- Weekly MIS reporting.
- Employee health checkup tracking with 2-working-day report SLA.
- Employee-wise pre-employment and annual health records in one longitudinal sheet.
- Benefits wallet, utilization, budget, and eligibility control.
- Cashless OPD, diagnostics, pharmacy, dental, vision, mental wellness, and health-checkup access.
- Executive analytics, compliance, and ROI visibility without exposing private clinical details inappropriately.

The target product should give employees:

- One mobile-first place to view employer-sponsored benefits.
- Health wallet balance by category.
- Book checkups, labs, OPD, mental wellness, and preventive-care services.
- Access personal reports and post-checkup recommendations.
- Receive nudges, reminders, rewards, and follow-up care.

## 2. Feasibility Assessment

Implementation is strongly feasible because the repo already contains relevant building blocks:

- Corporate HR login, dashboard, employees, reports, compliance, claims, benefits, wellness calendar, gamification, health-analysis, command-center, and user-management routes.
- Corporate checkup booking and health report flows.
- Weekly MIS generation and report-SLA foundation.
- Employee-wise health records for pre-employment and annual checkups.
- Employee network routes for corporate-assigned labs, hospitals, and clinics.
- Wallet and Health Coins services.
- Claims and reimbursement routes.
- Consent, audit, and DPDP-oriented services.

The work is not greenfield. The biggest effort is product integration, enterprise UX, privacy-safe analytics, and operational workflows.

## 3. Competitor Benchmark

### 3.1 GetVisit / Visit

Relevant strengths:

- Mobile-first employee health app.
- OPD cover, doctor consults, preventive care, mental wellness, diagnostics, pharmacy, physiotherapy, vaccinations, and annual checkups.
- Employer analytics and claims/support workflows.
- Strong app-scale positioning.

Mediqzy gap:

- Benefits are visible, but not yet wallet-led or eligibility-led.
- Cashless authorization and provider settlement are not fully productized.
- Employee journey is not yet unified enough.

### 3.2 MediBuddy

Relevant strengths:

- Corporate health services, annual health checks, on-site and at-home checkups.
- Real-time utilization dashboards, aggregated risk profiles, trend reporting, and benchmarks.
- AI fraud/waste/abuse signals.
- 24x7 multilingual support, network scale, doctor/lab/medicine access, and claims workflows.

Mediqzy gap:

- Analytics need to be more executive-grade.
- Claims and cashless authorization need corporate-specific rules.
- Operations console needs SLA queues and escalation workflows.

### 3.3 ekincare

Relevant strengths:

- Health wallet, dynamic health score, personalized nudges, AI recommendations.
- Cashless provider network, claims TAT, configurable benefits, one invoice.
- Data dashboards by department/location/gender, utilization, wellness adoption, ROI.
- Strong trust/compliance positioning.

Mediqzy gap:

- Corporate benefits wallet does not yet behave like a first-class ledger.
- Health score and nudges need to become longitudinal and personalized.
- HR dashboards need privacy thresholds and ROI reporting.

## 4. Current Mediqzy Capability Status

| Capability | Current Status | Implementation Direction |
|---|---|---|
| HR login/dashboard | Mostly present | Harden auth, role scopes, onboarding checklist |
| Weekly MIS | Foundation present | Add scheduler visibility, email/WhatsApp delivery, report archive |
| Health checkups | Present | Add package lifecycle, bulk schedule, provider assignment, SLA escalations |
| 2-working-day reports | Foundation present | Add HR SLA queue, alerts, breach reasons |
| Employee-wise records | Foundation present | Add consent-safe dossier, timeline, exports |
| Corporate benefits | Partially present | Build benefits wallet, program config, eligibility, utilization |
| Employee wallet | Partial Health Coins wallet exists | Add employer-funded category wallets |
| Provider network | Partial | Add cashless authorization and settlement |
| Claims | Present | Add corporate OPD/wellness claim adjudication and fraud checks |
| Analytics/ROI | Partial | Add executive dashboards and population-health snapshots |
| Mental wellness/EAP | Partial | Add confidential booking and anonymous aggregate HR metrics |
| Privacy/compliance | Partial | Add HR clinical-data masking, consent, aggregate thresholds, audit exports |

## 5. Target Architecture

### 5.1 Core Domains

1. Corporate account
2. HR users and permissions
3. Employee roster
4. Benefit programs
5. Employee benefit wallets
6. Provider network
7. Eligibility and authorization
8. Bookings and care events
9. Claims and reimbursements
10. Health reports and employee dossier
11. Analytics snapshots
12. Consent, audit, and compliance

### 5.2 High-Level Flow

```text
Corporate HR configures benefit program
        ↓
Employees are enrolled into program wallets
        ↓
Employee views wallet and available services
        ↓
Employee books/requests service
        ↓
System checks eligibility, balance, network, and policy rules
        ↓
Authorization is approved or sent for manual review
        ↓
Provider fulfills service
        ↓
Utilization, MIS, claim, and analytics update
        ↓
Reports and follow-up care are delivered to employee
        ↓
HR sees privacy-safe aggregate analytics and SLA status
```

## 6. Data Model Plan

### 6.1 New Tables

#### corporate_benefit_programs

Stores HR/admin-configured benefit programs.

Key fields:

- `corporate_id`
- `name`
- `category`
- `funding_type`
- `annual_budget`
- `per_employee_limit`
- `family_coverage`
- `max_dependents`
- `eligibility`
- `coverage_rules`
- `network_rules`
- `start_date`
- `end_date`
- `status`

Supported categories:

- `opd`
- `diagnostics`
- `pharmacy`
- `dental`
- `vision`
- `health_checkup`
- `mental_wellness`
- `fitness`
- `vaccination`
- `other`

#### employee_benefit_wallets

Stores per-employee balances for each program.

Key fields:

- `corporate_id`
- `program_id`
- `user_id`
- `employee_id`
- `coverage_period_start`
- `coverage_period_end`
- `allocated_limit`
- `utilized_amount`
- `reserved_amount`
- `status`

#### corporate_benefit_wallet_transactions

Ledger for allocations, reservations, reversals, settlements, and adjustments.

Key fields:

- `wallet_id`
- `transaction_type`
- `amount`
- `previous_balance`
- `new_balance`
- `reference_type`
- `reference_id`
- `notes`
- `metadata`

#### corporate_benefit_authorizations

Pre-authorization/cashless request layer.

Key fields:

- `corporate_id`
- `wallet_id`
- `user_id`
- `employee_id`
- `category`
- `requested_amount`
- `approved_amount`
- `provider_type`
- `provider_id`
- `provider_name`
- `service_type`
- `status`
- `authorization_code`
- `valid_from`
- `valid_to`

## 7. API Implementation Plan

### 7.1 HR APIs

#### GET `/api/corporate/benefit-wallet/summary`

Purpose:

- HR executive summary of wallet programs, budgets, allocation, utilization, remaining amount, and recent authorizations.

Response includes:

- Program count
- Active programs
- Total budget
- Allocated amount
- Utilized amount
- Reserved amount
- Remaining amount
- Category breakdown
- Recent authorizations

#### GET `/api/corporate/benefit-wallet/programs`

Purpose:

- List configured benefit programs.

Response includes:

- Program details
- Active wallet count
- Allocated/utilized/reserved/remaining totals

#### POST `/api/corporate/benefit-wallet/programs`

Purpose:

- Create corporate benefit program.

Minimum payload:

```json
{
  "name": "Annual OPD Wallet",
  "category": "opd",
  "annualBudget": 2500000,
  "perEmployeeLimit": 5000,
  "startDate": "2026-04-01",
  "endDate": "2027-03-31"
}
```

#### POST `/api/corporate/benefit-wallet/programs/:programId/enroll`

Purpose:

- Allocate wallets to all active employees or a selected employee list.

Payload:

```json
{
  "employeeIds": ["EMP001", "EMP002"],
  "allocatedLimit": 5000
}
```

If `employeeIds` is omitted, enroll all active employees.

#### GET `/api/corporate/benefit-wallet/employees/:employeeId`

Purpose:

- HR-safe benefit wallet view for one employee.

Response excludes clinical report contents.

### 7.2 Employee APIs

#### GET `/api/corporate/my-benefit-wallet`

Purpose:

- Employee view of their employer-sponsored wallets.

Response includes:

- Corporate name
- Wallets by category
- Allocation, used, reserved, remaining
- Program rules

#### POST `/api/corporate/benefit-wallet/authorizations`

Purpose:

- Employee requests cashless/pre-auth approval.

Payload:

```json
{
  "category": "diagnostics",
  "amount": 1200,
  "serviceType": "CBC + Lipid Profile",
  "providerType": "lab",
  "providerId": 12,
  "providerName": "Network Lab"
}
```

System checks:

- Employee belongs to corporate.
- Active wallet exists for category.
- Requested amount is within remaining balance.
- Program is active and within dates.

## 8. Frontend Implementation Plan

### 8.1 Corporate HR Benefits Wallet Page

Enhance `/corporate/benefits` or add a dedicated tab:

- Budget summary cards
- Program list
- Create program drawer
- Enroll employees action
- Utilization by category
- Recent authorizations table
- CSV export

### 8.2 Employee Benefits Page

Enhance employee-facing corporate benefits page:

- Wallet cards by category
- Balance meter
- “Use benefit” CTA
- Authorization request form
- Recent usage/authorization timeline
- Provider network shortcut

### 8.3 Dashboard Integration

Add cards to corporate dashboard:

- Benefits budget utilized
- Active wallets
- Cashless approvals pending
- Top utilized categories
- Employees with unused annual checkup benefit

## 9. Privacy and Compliance Rules

1. HR can see employee eligibility, wallet utilization, and SLA status.
2. HR should not see individual clinical report content without explicit employee consent.
3. Aggregate health analytics should apply minimum group thresholds.
4. Every medical-record access should be audit logged.
5. Employee authorization and wallet transactions should be auditable.
6. Mental wellness/EAP should expose only anonymized corporate metrics unless employee gives explicit consent.

## 10. Implementation Phases

### Phase 0: Stabilize health-checkup, MIS, and records

Status: In progress/foundation already added.

Acceptance:

- HR login works.
- Weekly MIS can be generated.
- Report SLA is tracked.
- Pre-employment and annual health records are separated and exportable in one employee dossier.

### Phase 1: Corporate Benefits Wallet Foundation

Scope:

- Database migration.
- Wallet service.
- HR APIs.
- Employee APIs.
- Basic validation.

Acceptance:

- HR can create a benefit program.
- HR can enroll employees.
- Employee can view wallet balance.
- Employee can request authorization.
- Utilization and reserved amounts update correctly.

### Phase 2: Cashless Provider Network

Scope:

- Network provider pricing.
- Provider service mapping.
- Authorization-to-booking flow.
- Provider settlement status.

Acceptance:

- Employee can select provider and request cashless service.
- System issues authorization code.
- Provider fulfillment can settle wallet utilization.

### Phase 3: Executive Analytics and ROI

Scope:

- Analytics snapshots.
- Utilization by location, department, category, period.
- Health checkup completion.
- Spend vs budget.
- SLA breaches.
- Preventive-care ROI proxy.

Acceptance:

- HR has a board-ready dashboard.
- Reports can be exported.
- Sensitive clinical details remain protected.

### Phase 4: Post-Checkup Care Engine

Scope:

- Abnormal report flagging.
- High-risk queue.
- Follow-up recommendation.
- Chronic-care enrollment.
- Employee nudges.

Acceptance:

- Employees with risky findings are guided to next action.
- HR sees aggregate high-risk trends, not raw reports.

### Phase 5: Mental Wellness and Coaching

Scope:

- Confidential counselor bookings.
- EAP service category.
- Anonymous corporate metrics.
- Campaign calendar.

Acceptance:

- Employee can book confidential support.
- HR receives only privacy-safe utilization data.

### Phase 6: Enterprise Trust Layer

Scope:

- Consent controls.
- Audit exports.
- Privacy thresholds.
- Retention controls.
- OSH-style annual checkup compliance dashboards.

Acceptance:

- Corporate client can audit access, reports, and consent.
- HR can monitor statutory health-checkup obligations.

## 11. Testing Plan

### Backend

- Syntax checks for changed JS files.
- Migration parse/application check.
- API smoke tests for program create, enroll, summary, employee wallet, and authorization.
- Edge cases:
  - No corporate context.
  - No active employees.
  - Insufficient wallet balance.
  - Expired program.
  - Duplicate enrollment.

### Frontend

- Corporate HR benefits page loads without wallet data.
- Corporate HR benefits page loads with programs.
- Employee benefits page loads wallet summary.
- Authorization errors are user-friendly.

### Data Integrity

- Wallet `remaining = allocated - utilized - reserved`.
- Authorizations create matching ledger transaction.
- Enrollment does not duplicate wallets for same employee/program/period.
- HR cannot access another corporate’s wallet data.

## 12. Rollout Plan

1. Apply migration in staging.
2. Seed one corporate with OPD, diagnostics, health checkup, and mental wellness programs.
3. Enroll pilot employees.
4. Run HR dashboard + employee wallet smoke tests.
5. Enable read-only wallet view.
6. Enable authorization request flow.
7. Enable provider settlement in a separate release.

## 13. Success Metrics

- 95%+ active employee wallet enrollment accuracy.
- Weekly MIS delivery on schedule.
- 2-working-day report SLA compliance above 95%.
- Benefit utilization visible by category and department.
- Zero cross-corporate data leakage.
- Employee can understand available benefits in under 30 seconds.
- HR can answer “budget, utilization, risk, SLA, and adoption” from one dashboard.

## 14. First Implementation Slice

The first implementation slice will add:

- `044-corporate-benefit-wallet.sql`
- Corporate benefits wallet service
- HR summary/program/enrollment APIs
- Employee wallet and authorization APIs

Frontend polish and provider settlement will follow after the foundation is verified.
