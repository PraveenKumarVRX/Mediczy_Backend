# Mediqzy CareOS — Ecosystem Architecture

| Field | Value |
|-------|-------|
| **Document ID** | MED-CAREOS-ARCH-001 |
| **Version** | 1.0 |
| **Date** | 2026-07-05 |
| **Companion** | `MEDIQZY_CAREOS_VISION.md`, `CAREOS_PLATFORM_ROADMAP.md` |

---

## 1. What CareOS is (and is not)

| Layer | Role | Examples |
|-------|------|----------|
| **HIS / EHR** | System of **record** | Stores encounters, billing, orders |
| **CareOS** | System of **intelligence & collaboration** | Coordinates people, AI, devices, organizations |

CareOS does **not** try to replace every system on day one. It becomes the **operating layer** that connects them — like Windows for PCs, Android for mobile, AWS for cloud.

---

## 2. Platform map

```
CareOS
├── Care Workspace      ← Living patient environment (Phase 1 ✓)
├── Care AI             ← Role-specialized copilots (Hospital OS + module copilots)
├── Care Graph          ← Relationship network (patient ↔ org ↔ disease ↔ device)
├── Care Identity       ← One verified professional + longitudinal patient identity
├── Care Cloud          ← Federated private hospital environments
├── Care Video          ← One-touch in-context clinical calls (LiveKit)
├── Care Monitoring     ← Devices → timeline (Phase 2)
├── Care Analytics      ← Command center, twins, population health
├── Care Marketplace    ← Third-party apps on CareOS APIs (Stage 4)
├── Care Research       ← Trials, RWE, knowledge network
├── Care Education      ← Patient + clinician education
├── Care Finance        ← Insurance, pre-auth, billing connectors
├── Care Command        ← Hospital + regional mission control
├── Care Government     ← Public health signals, governed reporting
└── Care Home           ← Home care, wearables, longitudinal monitoring
```

---

## 3. Cross-border collaboration model

### 3.1 Federated trust (not data lake)

Each hospital runs a **private Care Cloud tenant**. Data stays in the tenant unless:

1. Patient grants **consent** (Medical Passport share)
2. Participating orgs have a **federation trust agreement**
3. Session is scoped to **minimum necessary** artifacts (imaging, labs, summary — not full EHR dump)

```
┌─────────────┐     trust + consent     ┌─────────────┐
│ Hospital A  │ ◄──────────────────────►│ Hospital B  │
│ (Kenya)     │   FHIR DocumentBundle   │ (India)     │
└──────┬──────┘                         └──────┬──────┘
       │                                       │
       └──────────────┬────────────────────────┘
                      ▼
            CareOS Federation Layer
         (identity, consent, audit, translate)
```

### 3.2 Medical Passport

Portable, patient-owned profile:

- Allergies, diagnoses, medications, surgeries, vaccinations
- Imaging summaries, lab summaries (not raw PACS by default)
- Emergency contacts
- **Share tokens** with expiry, recipient org, and purpose

Backed by FHIR `Patient`, `AllergyIntolerance`, `Condition`, `MedicationStatement`, `Immunization` where available.

### 3.3 Global Clinical Board

Extends Instant MDT with **external org invites**:

- Session scoped to patient case
- Auto-translation for participant language preferences
- AI consensus across time zones
- Full audit trail for cross-border care

---

## 4. Care Graph

Every entity is a **node**; every clinical or operational relationship is an **edge**.

```
Patient ──treated_by──► Doctor ──affiliated_with──► Hospital
   │                        │
   ├──has_condition──► Disease
   ├──on_medication──► Drug
   ├──enrolled_in────► ClinicalTrial
   └──monitored_by───► Device
```

Graph powers:

- Similar case search (Hospital Memory → Global Knowledge Network)
- Referral routing
- Public health pattern detection (aggregated, governed)
- AI context for copilots

Storage: `careos_graph_nodes` + `careos_graph_edges` (see migration).

---

## 5. Care Identity

### Professional identity

One doctor, many affiliations:

| Field | Purpose |
|-------|---------|
| `careos_professional_id` | Global professional identifier |
| `user_id` | Link to Mediqzy user |
| `affiliations[]` | Hospital A, Hospital B, telemedicine, research |
| `credentials` | License, specialty, verification status |

### Patient longitudinal identity

| Field | Purpose |
|-------|---------|
| `careos_patient_id` | Global patient identifier (pseudonymous across tenants) |
| `tenant_links[]` | Local patient IDs per organization |
| `passport_id` | Link to Medical Passport |

Consent and **local law** (GDPR, HIPAA, India DPDP, Kenya DPA) gate all cross-tenant linking.

---

## 6. Interoperability standards

| Standard | Use in CareOS |
|----------|---------------|
| **FHIR R4** | Patient, Observation, DiagnosticReport, ImagingStudy, DocumentReference |
| **HL7 v2** | Legacy lab/ADT bridges (existing HyperGrid) |
| **DICOMweb** | Imaging exchange for cross-border boards |
| **SMART on FHIR** | App marketplace auth (Stage 4) |
| **OAuth 2.0 / OIDC** | Care Identity SSO |

Existing platform assets to extend:

- `/api/fhir/r4` — FHIR router
- `/api/hypergrid/smart` — SMART-on-FHIR
- HyperGrid MQTT — device → timeline pipeline

---

## 7. Security & governance

| Control | Implementation |
|---------|----------------|
| Tenant isolation | `organization_id` on all CareOS tables |
| Cross-border access | Federation trust + consent + audit log |
| AI clinical outputs | SaMD quality gates, approval inbox, human-final |
| Public health signals | Aggregated/anonymized; no patient-identifiable export without governance |
| Audit | `careos_federation_audit_log` — who accessed what, when, why |

---

## 8. API namespaces (evolving)

| Namespace | Scope |
|-----------|-------|
| `/api/v3/careos/*` | Workspace, timeline, teams, MDT (Phase 1) |
| `/api/v3/careos/ecosystem/*` | Identity, passport, federation, graph (Stage 2–3 scaffold) |
| `/api/v3/hospital-os/*` | Platform copilot, twins, command center |
| `/api/fhir/r4/*` | Standards-based interoperability |

---

## 9. Deployment topology

```
                    ┌──────────────────────┐
                    │   CareOS Control     │
                    │   (identity, trust,  │
                    │    marketplace)      │
                    └──────────┬───────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        ▼                      ▼                      ▼
  Tenant: Kenya           Tenant: India          Tenant: UAE
  (private PG)            (private PG)           (private PG)
        │                      │                      │
        └──────────────────────┴──────────────────────┘
                    Federation gateway
              (consent, FHIR bundles, translate)
```

Phase 1 runs **single-tenant** with federation tables ready. **Multi-tenant federation gateway** is available via `federation-gateway.service.js` (trust validation + FHIR proxy + HyperGrid edge gateways). DICOMweb is available via HyperGrid `/api/hypergrid/dicom`.

---

*Next: `CAREOS_PLATFORM_ROADMAP.md` for delivery stages.*
