# Mediqzy CareOS — Platform Roadmap (Stages 1–4)

| Field | Value |
|-------|-------|
| **Document ID** | MED-CAREOS-ROADMAP-001 |
| **Version** | 1.0 |
| **Date** | 2026-07-05 |

---

## Strategic principle

> Build the operating system that **connects** healthcare — not just better hospital software.

Foundations from day one: **FHIR interoperability**, **identity + consent**, **security by design**, **modular APIs**.

---

## Stage 1 — Land (current)

**Goal:** Best AI-native hospital platform in one tenant.

| Capability | Status | Notes |
|------------|--------|-------|
| HIS/EHR core | ✓ Existing | Orders, EMAR, billing, wards |
| **Care Workspace** | ✓ Phase 1 | Living Patient Workspace, timeline, teams |
| **Care AI** | ◐ Partial | Module copilots, AI Brain, coordinator |
| Device integration | ◐ Partial | HyperGrid MQTT scaffold |
| Mobile apps | ✓ Existing | Patient + clinician apps |

**Exit criteria:** Hospitals adopt CareOS as daily collaboration layer — not "another module."

---

## Stage 2 — Expand

**Goal:** Connect the care ecosystem around the patient.

| Capability | Deliverable |
|------------|-------------|
| Laboratories | FHIR DiagnosticReport → timeline |
| Pharmacies | ePrescription + fulfillment status |
| Home care | Care Home module, visit tasks |
| Telemedicine | Care Video in workspace |
| Wearables | Apple Health / device → monitoring |
| Patient portal | Medical Passport v1 + family portal |
| **Care Graph v1** | Patient subgraph for copilot context |
| **Care Identity v1** | Multi-affiliation professional identity |

**API:** `/api/v3/careos/ecosystem/passport`, `/identity`, `/graph`

---

## Stage 3 — Network

**Goal:** Cross-organization and cross-border collaboration.

| Capability | Deliverable |
|------------|-------------|
| Hospital-to-hospital referrals | Federated referral workspace |
| Cross-border second opinions | Global Clinical Board |
| Shared specialist consultations | One-touch multi-org MDT |
| Secure imaging/docs exchange | FHIR DocumentBundle + DICOMweb |
| **Care Cloud federation** | Trust agreements between tenants |
| **AI translation** | Real-time multilingual clinical board |
| **Global Knowledge Network** | Similar cases across consented archives |
| **AI Hospital Network** | Aggregated outbreak/bottleneck signals (governed) |

**Exit criteria:** Two hospitals in different countries complete a governed second-opinion case in one workspace.

---

## Stage 4 — Platform

**Goal:** Open healthcare app ecosystem.

| Capability | Deliverable |
|------------|-------------|
| Developer APIs | CareOS SDK, OAuth, webhooks |
| **Care Marketplace** | Radiology AI, oncology AI, rehab apps |
| Analytics platform | Population health, digital twins at scale |
| Research platform | Trial matching, RWE exports (governed) |
| **Care Government** | Public health dashboards, simulation |
| **Global Emergency Network** | Disaster bed/resource sharing |

**Analogy:** AWS for healthcare — others build on your identity, security, and integration layer.

---

## Pillar → stage mapping

| Pillar | Stage 1 | Stage 2 | Stage 3 | Stage 4 |
|--------|---------|---------|---------|---------|
| Care Workspace | ✓ | Enhance | Cross-org | Marketplace apps |
| Care AI | Copilot | Role agents | Translation | Third-party AI |
| Care Graph | Local | Patient subgraph | Network graph | Global knowledge |
| Care Identity | Single org | Multi-affiliation | Cross-border | Platform SSO |
| Care Cloud | Single tenant | Connectors | Federation | Multi-region |
| Care Video | One-touch | In-workflow | Global board | — |
| Care Monitoring | — | Devices | Wearables | — |
| Care Analytics | Command center | Dept analytics | Network signals | Gov simulation |
| Care Marketplace | — | — | Partner pilot | Full ecosystem |
| Care Research | Local memory | Trials link | Cross-hospital | RWE platform |
| Care Finance | Billing | Insurance | Cross-border claims | — |
| Care Government | — | — | Public health alerts | Full module |
| Care Home | — | Home care | Remote monitoring | — |

---

## What we're building now (ecosystem scaffold)

On top of Phase 1, this sprint adds **Stage 2–3 foundations**:

1. **Medical Passport** — portable profile + consent-based sharing
2. **Care Identity** — professional multi-affiliation registry
3. **Care Graph** — nodes/edges for relationship queries
4. **Care Federation** — org network + trust agreements
5. **Global Clinical Board** — cross-org MDT session type

These are **schema + API scaffolds** — not full multi-region federation yet.

---

## Migration path for customers

```
Existing HIS ──FHIR/SMART──► CareOS Workspace (overlay)
                                    │
                                    ▼
                            Gradual module adoption
                                    │
                                    ▼
                         Full CareOS tenant (optional)
```

Hospitals keep their EHR; CareOS coordinates on top via standards.

---

*Technical detail: `CAREOS_ECOSYSTEM_ARCHITECTURE.md`*
