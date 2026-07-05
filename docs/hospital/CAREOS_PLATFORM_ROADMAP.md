# Mediqzy HealthOS — Platform Roadmap (Stages 1–4)

| Field | Value |
|-------|-------|
| **Brand** | Mediqzy - HealthOS |
| **Status** | **API complete — production integrations in progress** |

---

## Readiness legend

| Label | Meaning |
|-------|---------|
| **API ✓** | Routes, services, migrations, and UI screens exist |
| **Integrated ✓** | Wired to live data sources (FHIR, Apple Health, external orgs) |
| **Planned** | Documented pillar, not yet built |

---

## Stage 1 — Land

AI-native hospital platform + Care Workspace.

| Capability | API | Integrated | UI |
|------------|-----|------------|-----|
| HIS/EHR core | ✓ Existing | ✓ | ✓ |
| Living Patient Workspace | ✓ | ✓ | ✓ `/hmis/patient/:id/healthos` |
| Clinical Timeline | ✓ | ✓ | ✓ |
| Dynamic Care Teams + MDT | ✓ | ✓ | ✓ |
| AI Clinical Coordinator | ✓ | ✓ | ✓ |
| Family Portal | ✓ | ✓ | ✓ |
| Clinical Playback / Memory | ✓ | ✓ | ✓ |

## Stage 2 — Expand

Connect labs, pharmacy, home care, wearables, passport.

| Capability | API | Integrated | UI |
|------------|-----|------------|-----|
| Lab connector (FHIR sync) | ✓ | ✓ `lab_results` → timeline | ✓ |
| Pharmacy fulfillment | ✓ | Partial | ✓ |
| Home care visits | ✓ | Partial | ✓ |
| Wearables (Apple Health bridge) | ✓ | ✓ `fitness_data` sync | ✓ |
| Medical Passport | ✓ | ✓ | ✓ `/hmis/healthos/passport/:id` |
| Care Identity + Graph | ✓ | ✓ | ✓ |

## Stage 3 — Network

Cross-organization and cross-border collaboration.

| Capability | API | Integrated | UI |
|------------|-----|------------|-----|
| Care Cloud federation | ✓ | Single-DB scaffold | ✓ |
| Federated referrals | ✓ | ✓ | ✓ |
| Global Clinical Board | ✓ | ✓ LiveKit rooms | ✓ `/hmis/healthos/board/:id` |
| Document exchange | ✓ | Partial | ✓ |
| AI translation | ✓ | ✓ LLM cascade | ✓ |
| Network signals | ✓ | ✓ | ✓ |

## Stage 4 — Platform

Open healthcare app ecosystem.

| Capability | API | Integrated | UI |
|------------|-----|------------|-----|
| Care Marketplace | ✓ | ✓ 5 seeded apps | ✓ install UI |
| Developer API keys | ✓ | ✓ | ✓ create/revoke |
| Webhooks | ✓ | ✓ dispatch on events | ✓ register UI |
| Research / trial matching | ✓ | ✓ | ✓ |
| Population analytics | ✓ | ✓ | ✓ |
| Care Government | ✓ | ✓ | ✓ |
| Global Emergency Network | ✓ | ✓ | ✓ |

## Not yet implemented

| Pillar | Status |
|--------|--------|
| Care Education | Planned |
| Care Finance | Planned |
| Multi-tenant federation gateway | Planned (single-DB today) |
| DICOMweb imaging | Planned |
| SMART OAuth marketplace | Planned |

---

*Technical reference: `HEALTHOS_ALL_PHASES_IMPLEMENTATION.md`*
