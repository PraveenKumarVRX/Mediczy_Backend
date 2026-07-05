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
| **DICOMweb imaging** | ✓ | ✓ HyperGrid `/api/hypergrid/dicom` | ✓ HealthOS `/expand/imaging` |
| Medical Passport | ✓ | ✓ | ✓ `/hmis/healthos/passport/:id` |
| Care Identity + Graph | ✓ | ✓ | ✓ |

### DICOMweb (already available)

Implemented via **HyperGrid Layer 6**:

| Service | Endpoint |
|---------|----------|
| STOW-RS (store) | `POST /api/hypergrid/dicom/studies` |
| QIDO-RS (query) | `GET /api/hypergrid/dicom/studies?patientId=` |
| WADO-RS (retrieve) | `GET /api/hypergrid/dicom/studies/:studyUID` |
| Instance file | `GET /api/hypergrid/dicom/studies/:studyUID/instances/:sopUID/file` |

HealthOS bridge: `GET /api/v3/healthos/expand/imaging/:patientId`  
Lab RIS viewer: `client/src/pages/lab/LabRIS.tsx`  
Cross-border share: Global Clinical Board passes `dicomStudyUid` to document exchange.

## Stage 3 — Network

Cross-organization and cross-border collaboration.

| Capability | API | Integrated | UI |
|------------|-----|------------|-----|
| **Multi-tenant federation gateway** | ✓ | ✓ trust + FHIR proxy + edge gateways | ✓ Network tab |
| Care Cloud federation | ✓ | ✓ org registry + trust | ✓ |
| Federated referrals | ✓ | ✓ | ✓ |
| Global Clinical Board | ✓ | ✓ LiveKit rooms | ✓ `/hmis/healthos/board/:id` |
| Document / imaging exchange | ✓ | ✓ DICOMweb UID linking | ✓ |
| AI translation | ✓ | ✓ LLM cascade | ✓ |
| Network signals | ✓ | ✓ | ✓ |

### Multi-tenant federation gateway (already available)

Combines existing platform components:

| Component | Location |
|-----------|----------|
| Multitenancy middleware | `server/middleware/multitenancy.middleware.js` |
| Care federation (trust, org registry, audit) | `server/services/careos/care-federation.service.js` |
| Federation gateway (FHIR proxy + status) | `server/services/careos/federation-gateway.service.js` |
| HyperGrid edge gateways (per-tenant sync) | `server/routes/hypergrid-edge.route.js` |
| HealthOS API | `GET /api/v3/healthos/ecosystem/federation/gateway/status` |
| FHIR proxy | `POST /api/v3/healthos/ecosystem/federation/gateway/proxy` |

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
| SMART OAuth marketplace | Planned |

---

*Technical reference: `HEALTHOS_ALL_PHASES_IMPLEMENTATION.md`, `HYPERGRID_IOT_INTEROPERABILITY_REFERENCE.md`*
