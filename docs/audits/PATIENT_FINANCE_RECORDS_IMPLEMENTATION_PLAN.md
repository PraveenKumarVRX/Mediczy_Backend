# Patient Finance + Records Implementation Plan

Last updated: 2026-05-31
Owner: Product + Engineering (Patient Experience)

## Scope

Target pages:

- `/patient/network-hospitals`
- `/patient/network-clinics`
- `/my-insurance`
- `/claims-express`
- `/benefits`
- `/reposts`
- `/patient/my-reports`
- `/patient/lab-tests`

## Goals

1. Eliminate demo-data ambiguity in insurance/claims journeys.
2. Ensure every critical user action has a reliable backend source of truth.
3. Improve UX clarity for upload, claims status, and network discovery.
4. Standardize observability and fallback behavior.

## Delivery Phases

### Phase 1 (Week 1-2): Data Truth and UX Clarity

- [x] `ClaimsExpress`: start API-backed claims feed integration.
- [x] `SmartBenefitsHub`: stop synthetic claims seeding in API-failure paths.
- [x] `Reposts`: clarify positioning as "Scan & Explain Reports".
- [x] `NetworkHospitals`: replace static list with backend provider search endpoint.
- [x] Add explicit unavailable/empty states instead of hidden mock fallback.

Acceptance criteria:

- Claims shown in benefits/claims modules come from API payloads or explicit "no data" states.
- No financial claim timeline is fabricated when API is unavailable.
- Route labels and headings align with user task intent.

### Phase 2 (Week 3-4): Workflow Reliability

- [x] Claims filing pipeline endpoint integration (submit + upload + timeline).
- [x] Lab test checkout hardening (idempotent payment verify and retry-safe state).
- [ ] Insurance OCR prefill for policy upload.
- [x] Report preview/download action unification.

Acceptance criteria:

- Claim submission success rate measurable end-to-end.
- Duplicate payment/booking prevention implemented.
- Policy upload time reduced with OCR prefill.

### Phase 3 (Week 5-8): Architecture and Quality

- [ ] Break large pages into hooks + feature modules:
  - `LabTests` (catalog/cart/checkout/bookings)
  - `SmartBenefitsHub` (plans/claims/family/network)
  - `ClaimsExpress` (feed/filters/timeline/filing)
- [ ] Add typed API adapters for all page-level payloads.
- [ ] Add telemetry: route load, API failures, conversion drop-off.

Acceptance criteria:

- Page modules reduced to manageable sizes with single responsibility.
- Frontend errors categorized by endpoint and surfaced in monitoring.
- Funnel metrics available for claims, reports, and lab booking flows.

## Squad Roles

- Product Researcher / Competitor Analyst:
  - Benchmark claims UX and network search completion vs top healthcare apps.
  - Define baseline + target conversion metrics.
- Principal Engineer:
  - Contract standardization, fallback strategy, reliability architecture.
- Tech Lead / Software Architect:
  - Module boundaries, API adapter pattern, rollout sequence.
- UX Researcher:
  - Usability tests for claims and reports upload flows.
- UI Designer:
  - Unified finance/records component standards and status semantics.

## KPI Dashboard

- Claims submission completion rate
- Claims rework rate (info-needed loop)
- Network provider find-to-action conversion
- Report upload success rate
- Lab payment success rate and duplicate prevention rate
- Median API latency per page journey

## Immediate Sprint Tasks (In Progress)

1. `ClaimsExpress` API claims feed + status mapping.
2. `SmartBenefitsHub` claims fallback hardening.
3. `Reposts` heading and intent clarity improvements.
4. `NetworkHospitals` live directory integration + explicit unavailable state.
5. `MyReports` live/unavailable data-status UX.
6. `ClaimsExpress` end-to-end claim submission to `/api/employee/claims`.
7. `LabTests` retry-safe checkout and payment verification guards.
8. Shared `reportActions` utility consumed by reports pages.