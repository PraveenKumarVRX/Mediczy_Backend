# MediQzy v2.0 - Phase 1 Enterprise Readiness Backlog

**Date:** May 15, 2026  
**Target phase:** 6 to 8 weeks after Phase 0 sign-off

## Phase Goal

Deliver the minimum credible enterprise package required for a tertiary hospital implementation discussion without relying on unfinished shells or speculative AI.

## Work Items

| Priority | Initiative | Outcome | Acceptance Criteria |
|---|---|---|---|
| P0 | Blood Bank full workflow | Deal-blocker removed for tertiary hospitals | Inventory by blood group, donor registry, cross-match, issue/return, expiry alerts, shortage alerts, audit log |
| P0 | Generic clinical autosave | Clinical documentation survives crashes and interruptions | Shared autosave hook/service, draft recovery, visible status, conflict handling, applied to notes/prescriptions/vitals/IP sheets |
| P0 | Tariff master MVP | Billing can derive prices from controlled master data | Room-category pricing, procedure pricing, packages, effective dates, payer/corporate override support, billing lookup API |
| P1 | Dietary workflow completion | Existing nutrition module becomes inpatient-ready | Diet order creation from admission, allergen handling, dietitian queue, templates, discharge counselling output |
| P1 | PREMS / patient feedback | Patient experience measurement exists for NABH and management | OPD/IPD discharge trigger, WhatsApp/SMS survey, response capture, negative-feedback ticket creation, dashboard |
| P1 | NABH template pack | Audit-facing documentation coverage improves | Required template inventory, approved formats, versioning, export, ownership assigned |
| P1 | Readmission risk UI | Existing model becomes visible in workflow | Risk badge at discharge, top factors, follow-up care-plan CTA, auditability |
| P1 | Implementation runbook | Enterprise deployment becomes explainable and repeatable | Go-live phases, migration plan, training plan, support model, SLA, rollback plan |


## Implementation Status - May 16, 2026

| Initiative | Status | Notes |
|---|---|---|
| Blood Bank full workflow | Implemented | Added cross-match, issue/return, expiry/shortage alerts, audit feed, and operational UI |
| Generic clinical autosave | Implemented baseline | Shared hook plus visible autosave on discharge summaries, prescriptions, and IP sheets; signed-note protection on clinical notes |
| Tariff master MVP | Implemented | Canonical rate storage, payer/room overrides, effective-date lookup API, insurance portal UI adoption |
| Dietary workflow completion | Implemented baseline | Admission-linked orders, templates API, allergy-aware order fields, dietitian queue data, counselling capture |
| PREMS / patient feedback | Implemented | Discharge invitations, response capture, low-score ticket escalation, dashboard aggregation, operator entry UI |
| NABH template pack | Implemented baseline | Controlled template inventory exposed in quality portal |
| Readmission risk UI | Implemented | Discharge badge, factor display, and follow-up CTA |
| Implementation runbook | Implemented | Expanded deployment, test, and hypercare checklist |

## Definition of Done

A Phase 1 item is not complete until it has:

1. Working backend workflow
2. Frontend workflow
3. Role-aware permissions
4. Audit trail
5. Error and empty states
6. Test coverage proportional to risk
7. Demo script
8. Owner sign-off

## Suggested Sprint Breakdown

### Sprint 1

- Blood Bank schema + backend
- Autosave architecture + shared API
- Tariff master schema
- Runbook outline

### Sprint 2

- Blood Bank frontend workflow
- Autosave integration into clinical notes and prescriptions
- Tariff master admin UI
- Readmission badge UI

### Sprint 3

- Dietary inpatient completion
- PREMS trigger + response flow
- Autosave expansion to vitals and IP sheets
- NABH template inventory

### Sprint 4

- Integration hardening
- Clinical QA
- Demo build
- Deployment dry run

## Phase 1 Exit Gate

All must be true:

- No P0 item remains incomplete
- No enterprise demo depends on a shell module
- Clinical autosave verified under refresh, crash, and reconnect scenarios
- Blood Bank workflow tested end to end
- Tariff master can populate at least one real billing workflow
- PREMS responses visible in dashboard
- Implementation runbook reviewed by product, engineering, and implementation owners
