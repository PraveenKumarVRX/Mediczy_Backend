# MediQzy v2.0 - Capability Matrix

**Date:** May 15, 2026  
**Purpose:** Current-state classification for the v2.0 roadmap before delivery commitments.

## Status Legend

| Status | Meaning |
|---|---|
| `built` | End-to-end capability exists and is usable |
| `partial` | Meaningful implementation exists but needs workflow, integration, or hardening |
| `shell` | Login, page, route, or model exists without a complete business workflow |
| `missing` | No meaningful implementation found |

## Enterprise Readiness

| Capability | Status | Evidence / Notes | Next Action |
|---|---|---|---|
| Blood Bank | `shell` | Dept route/controller/model exist; route currently login-only | Build full inventory, donor, cross-match, issue, expiry workflow |
| Clinical Autosave | `partial` | Draft behavior exists in isolated screens; no generic shared framework | Build shared autosave + draft service |
| Tariff Master | `partial` | Insurance tariff surfaces exist; no generalized billing tariff engine | Build canonical tariff master with room/procedure/package pricing |
| Dietary / Nutrition | `partial` | Dedicated dietary routes and frontend pages exist | Complete inpatient diet workflow and discharge counselling |
| PREMS / Patient Feedback | `missing` | Omnichannel infrastructure exists; no PREMS flow identified | Build survey trigger, response capture, dashboard |
| NABH Templates | `partial` | Consent and other templates exist piecemeal | Assemble required template set and audit coverage |
| Implementation Runbook | `missing` | Deployment docs exist; no hospital go-live runbook specific to v2.0 | Create go-live, migration, training, SLA runbook |
| Discharge Planning | `partial` | Discharge summary exists; multidisciplinary sign-off not complete | Build discharge checklist + approvals |

## Tier 1 / Clinical Intelligence

| Capability | Status | Evidence / Notes | Next Action |
|---|---|---|---|
| Ambient Scribe | `partial` | Offline scribe pipeline exists; ambient streaming flow not found | Build streaming MVP after architecture review |
| Auto Clinical Coding | `partial` | ICD/CPT data and clinical workflow exist; no post-sign bridge | Build reviewable coding recommendation flow |
| Sepsis / Deterioration Alerts | `partial` | Smart notifications and vital trend logic exist; no dedicated NEWS2/qSOFA engine found | Build scorer + alert escalation |
| NL Patient Cohort Search | `partial` | AI brain and patient tooling exist; no bounded cohort-search product found | Build safe SELECT-only cohort tool |
| Readmission Risk Badge | `partial` | Backend readmission model and insights exist; UI absent | Add discharge-facing UI and care-plan CTA |

## Department Operations

| Capability | Status | Evidence / Notes | Next Action |
|---|---|---|---|
| CSSD | `shell` | Login route exists; no complete workflow identified | Build instrument-set lifecycle and autoclave logs |
| Procurement / GRN | `shell` | Login route exists; no complete workflow identified | Build indent -> PO -> GRN -> approval workflow |
| Payroll | `partial` | HR and Accounts payroll pages exist | Reconcile data model and finish operational workflow |
| Central Stores | `missing` | No complete enterprise stores workflow identified | Design with Procurement phase |

## Later Differentiators

| Capability | Status | Recommendation |
|---|---|---|
| Wound Tracking AI | `missing` | Phase 4 after image protocol and SME validation |
| SDoH Screening | `missing` | Phase 4 once downstream referral ownership is defined |
| Clinical Trial Matching | `missing` | Phase 4 after CTRI data strategy is confirmed |
| Predictive Staffing | `missing` | Phase 4 only after sufficient clean historical data exists |
| Antibiogram / HAI Surveillance | `missing` | Phase 4 after LIS normalization work |
| Voice Biometrics | `missing` | Strategic bet; keep outside first commitments |
| RWE Platform | `partial` | Strategic bet; federated infrastructure exists, commercial layer missing |
| Digital Pathology AI | `missing` | Strategic bet; needs validation dataset |
| Pharmacogenomics | `missing` | Strategic bet; requires knowledge-source integration |
| Ambient Smart Room | `missing` | Strategic bet; hardware-dependent |
| AR Surgical Planning | `missing` | Strategic bet; R&D-heavy |

## Immediate Decisions

1. Commit only `Phase 0 + Phase 1` externally.
2. Reclassify roadmap items using this matrix before every quarterly planning cycle.
3. Do not demo `shell` items as completed modules.
