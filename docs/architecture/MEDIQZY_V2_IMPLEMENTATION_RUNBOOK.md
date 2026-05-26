# MediQzy v2.0 - Implementation Runbook

**Date:** May 15, 2026  
**Status:** Phase 1 operational baseline

## 1. Purpose

Define how MediQzy v2.0 is deployed into a hospital with predictable scope, migration, training, support, and rollback controls.

## 2. Deployment Stages

1. Discovery and scope confirmation
2. Data mapping and migration preparation
3. Tenant/environment setup
4. Department configuration
5. User provisioning and RBAC validation
6. Training and dry runs
7. Pilot go-live
8. Full go-live
9. Hypercare and handoff

## 3. Pre-Go-Live Checklist

- Contracted modules confirmed
- Data migration source files received
- Master data templates approved
- Roles and users approved
- Integrations listed and owners assigned
- Hardware dependencies identified
- SMS / WhatsApp / email credentials validated
- Backup and rollback plan approved
- Training schedule approved
- Clinical sign-off path defined

## 4. Data Migration Scope

| Data Domain | Required Inputs | Validation Owner |
|---|---|---|
| Patients | Demographics, identifiers, ABHA where available | Implementation + hospital MRD |
| Doctors | Profiles, specialties, fees, schedules | Hospital admin |
| Tariffs | Rooms, procedures, packages, payer overrides | Finance |
| Inventory | Pharmacy, blood bank, stores where applicable | Department heads |
| Historical appointments | Optional phased import | Operations |
| Clinical documents | Optional scanned / structured import | MRD |

## 5. Training Plan

| Audience | Training Focus |
|---|---|
| Doctors | EMR, prescriptions, discharge, clinical review |
| Nurses | Vitals, medication chart, alerts |
| Billing | Tariff, billing, claims |
| Department users | Blood Bank, Dietary, CSSD, Procurement as applicable |
| Admins | Users, roles, audit, reports |

## 6. Go-Live Controls

- Feature flags documented before deployment
- High-risk modules enabled in sequence
- Named command-center contacts for first 72 hours
- Incident severity model agreed
- Daily reconciliation meetings during hypercare

## 7. Rollback Strategy

- Backup snapshot before migration
- Reversible migrations documented
- Feature flags available for unfinished modules
- Manual fallback workflow documented for clinical critical paths
- Rollback owner assigned before go-live

## 8. SLA Skeleton

| Severity | Example | Response Target | Resolution Target |
|---|---|---:|---:|
| Sev 1 | System unavailable, clinical workflow blocked | 15 min | 4 hr |
| Sev 2 | Major module degraded | 30 min | 8 hr |
| Sev 3 | Non-critical defect | 4 hr | 3 business days |
| Sev 4 | Cosmetic / request | 1 business day | Backlog |

## 9. Acceptance Sign-Offs

- Product owner
- Engineering owner
- Implementation owner
- Hospital admin sponsor
- Department representatives
- Clinical SME where applicable

## 10. Phase 1 Module Checklist

| Module | Go-live readiness item |
|---|---|
| Blood Bank | Inventory, donors, cross-match, issue/return, alerts, audit trail |
| Clinical documentation | Autosave, draft recovery, visible save state, signed-note protection |
| Tariff master | Effective-dated rates, payer overrides, room/procedure lookup |
| Dietary | Admission-linked order, allergy flags, templates, discharge counselling |
| PREMS | Discharge invitation, response capture, dashboard aggregation, negative-feedback escalation |
| NABH | Controlled template pack, ownership, version visibility |
| Readmission risk | Discharge badge, factors, follow-up CTA |

## 11. Integration Test Checklist

1. Create and return a Blood Bank requisition; verify audit log and stock counts.
2. Create a prescription draft, refresh the page, and confirm local autosave recovery.
3. Save an IP sheet note and verify autosave state plus manual persistence.
4. Create a payer tariff and resolve it through the lookup API.
5. Submit a discharge summary and verify PREMS invitation generation.
6. Submit a low PREMS score and verify quality feedback aggregation plus ticket creation.
7. Create a diet order from admission data and record discharge counselling output.
8. Open the Quality portal and verify NABH template pack visibility.

## 12. Hypercare Staffing Rota

- Product owner: business triage and scope decisions
- Engineering owner: production defects and rollback decisions
- Implementation owner: hospital coordination and data corrections
- Clinical SME: discharge, PREMS, dietary, and alert workflow validation
- Department champions: Blood Bank, Dietary, Quality, Billing


## Phase 2 / 3 Operational Addendum — May 16, 2026

### Phase 2 checks

- Confirm `/hospital/practice/vitals` returns `intelligence.score` and raises alerts for NEWS2 >= 5, qSOFA >= 2, or any single extreme parameter.
- Review `/hospital/practice/clinical-alerts` daily until escalation ownership is formalized.
- Treat coding output from signed notes as suggestions only; no billable code should bypass clinician review.
- Validate doctor cohort queries against known patient lists before using them for outreach or recall campaigns.
- Use ambient scribe session endpoints only in controlled pilots until transport, retention, and consent rules are signed off.

### Phase 3 checks

- CSSD: create instrument set, raise job, run cycle, release cycle, release job, confirm set returns to `available`.
- Procurement: add vendor, create PO, approve PO, create GRN, confirm PO moves to `received`.
- Do not treat GRN completion as central-store stock posting yet; that linkage remains a separate follow-on item.
