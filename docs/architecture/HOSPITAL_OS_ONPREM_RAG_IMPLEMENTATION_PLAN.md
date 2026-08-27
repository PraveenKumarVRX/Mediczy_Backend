# Hospital OS On-Premises Implementation — Requirements, Availability & Gap (RAG) Analysis

> **Scope:** Implementation of MediQzy Hospital OS at **Mahalakshmi Multispeciality Hospital (MMS)**, Chennai — deployed on **infrastructure owned/controlled by the hospital (on-prem server)** while **remaining remotely controlled, monitored, and maintained by MediQzy (Mayden SmartHealth)**.
> **Source:** `MediQzy_HospitalOS_Proposal_Mahalakshmi_Hospital.pdf` (2026-08-27)
> **Audited codebase:** `/home/ubuntu/Mediczy` — `main` @ `530166c`
> **Author:** Delivery & Cloud Engineering Review
> **Date:** 2026-08-27

---

## 1. Purpose & Deployment Context

This document answers a specific question: **can we deploy Hospital OS on a client hospital's own on-prem server, and still control it from MediQzy?**

It is structured as a classic **RAG**:

- **R — Requirements:** everything the proposal commits to deliver (modules, deployment model, remote-management duties, compliance).
- **A — Availability:** what is already functional in the product today (module by module, plus the deployment/control-plane machinery).
- **G — Gap:** what is missing or partial, with a build-vs-config-for-each-gap decision.

The headline answer: **YES** — the platform is a multi-tenant PaaS with a control plane, tenant-server lifecycle automation (PM2), and an outbound node-heartbeat mesh built specifically for "runtime at client site, oversight at MediQzy." **~90% of the proposed module suite already exists; the remaining gaps are mostly configuration + one architectural extension** (explained in §4) to let the control plane operate a *different machine* (the hospital's) rather than only the local one.
---

## 2. Requirements (R)

### 2.1 Functional/module requirements (from proposal §4)

The proposal sells the **full Hospital OS suite — 40+ modules across 8 categories — as one platform with no per-module/per-user upcharge** (AI features optional add-on).

| Cat | Modules required |
|---|---|
| **A. Patient Access & Front Office** | Front Desk & Registration · Queue Management (QMS) · Self-Registration Kiosk · Patient Engagement Portal/App · Referral Management |
| **B. Clinical & Nursing** | OPD Management · IPD & Ward Management · Bed Management Dashboard · Nursing (vitals, MAR, notes, handover) · EMR/e-Charting · Consent & Clinical Docs · Discharge Summary |
| **C. Diagnostics & OT** | LIS · Radiology Integration (PACS-ready) · OT Management · Blood Bank |
| **D. Pharmacy & Materials** | Pharmacy · Inventory & Stores · CSSD Management · Biomedical Equipment Maintenance · Procurement/SCM |
| **E. Billing, Insurance & Finance** | Billing & Revenue Cycle · Insurance & TPA Desk · Corporate & TPA Empanelment · Accounting (GL/AP/AR) · MRD |
| **F. HR & Administration** | HRMS & Payroll · Duty Roster & Shift Scheduling · Security · EDP/IT Admin |
| **G. Support Services** | Dietary & Kitchen · Housekeeping & Facility · Ambulance & Transport · Document Management (DMS) |
| **H. Quality, Comm & Analytics** | Quality & NABH · Patient Feedback/Grievance · Communication Hub · RPM · Teleconsultation · RFID/IoT Asset Tracking · MIS & Analytics |

### 2.2 Compliance & interoperability (proposal §6)

- **ABDM / ABHA-ready** (ABHA, HFR, HPR) · **HL7 FHIR** · **DPDP 2023** consent-based · **GDPR-aligned**.

### 2.3 Deployment model (proposal §5)

1. Hospital owns/controls the infra — **on-prem server** or hospital's **own cloud account**; data stays in hospital-controlled environment.
2. Proposal is a **single-facility** deployment (Iyyappanthangal only).
3. **e-Charting is manual, point-of-care entry** (no automated device integration in base scope).
4. **AI Scribe is an optional add-on** (≤5 doctors), not part of base licence.
5. Commercials: **Y1 ₹7,00,000 + GST** (licence + install/training); **AMC = 25% of licence/yr from Y2**; optional AI Scribe ₹10,000/mo.

### 2.4 "Controlled by MediQzy" — remote-management duties (post-sales)

| Duty | What this means operationally |
|---|---|
| Provisioning & install | Stand up server, DB, module config on the hospital box |
| Monitoring & SLA | See node status, health, version remotely |
| Operations | Start / stop / restart service; tail logs; push version updates |
| Backup & DR | Ensure backups and recovery |
| Support / helpdesk | Bug fixes, config changes, AMC upgrades |
| Governance & security | Access control, audit, PHI consent |
---

## 3. Availability (A)

### 3.1 Module availability matrix (verified against code)

Legend: ✅ fully present · 🟡 partial · 🔴 absent.

| Cat / Module | Status | Codebase evidence |
|---|---|---|
| **A. Front Desk & Registration** | ✅ | `HospitalRegister.tsx`, `FrontDeskLogin.tsx`, `public-kiosk-register.route.js` |
| **A. Queue Management (QMS)** | ✅ | `hospital-queue.route.js`, `queue-management.route.js`, `queue.route.js`, `HospitalQmsPage.tsx` (+ `/kiosk/checkin` provisioning) |
| **A. Self-Registration Kiosk** | ✅ | `KioskSecureRegister.tsx`, `display-kiosk.route.js`, `abdm-kiosk.route.js`, `public-kiosk-register.route.js` |
| **A. Patient Engagement Portal** | ✅ | `Appointments.tsx`, `MyBookings.tsx`, `HealthDashboard.tsx`, report access |
| **A. Referral Management** | ✅ | `follow-up-hmis.route.js`, HMIS patient journey |
| **B. OPD Management** | ✅ | Consultation flow, `HospitalPrescriptionCreator.tsx`, `doctor-availability.route.js` |
| **B. IPD & Ward Management** | ✅ | `adt.route.js`, `wards-admin.route.js`, `HospitalADTTransfer.tsx` |
| **B. Bed Management Dashboard** | ✅ | `BedMap.tsx`, `beds-management.route.js`, `HospitalICUBoard.tsx` |
| **B. Nursing (vitals/MAR/notes/handover)** | ✅ | `NurseTaskBoard.tsx`, `EMARPage.tsx`, `nursing-ipd.route.js`, `nurse.route.js`, `NurseHandoverPage.tsx` |
| **B. EMR / e-Charting** | ✅ | `EChartingPage.tsx`, `emr.route.js`, `HospitalEHR.tsx`, `PatientEMR.tsx` |
| **B. Consent & Clinical Docs** | ✅ | `consent-management.route.js`, clinical sign-off |
| **B. Discharge Summary** | ✅ | `HospitalDischargeSummary.tsx`, `DischargeWorkflow.tsx`, `discharge-workflow.route.js` (TPA-ready) |
| **C. LIS** | ✅ | `api-v1-labs.js`, `lab.route.enhanced.js`, `lab-tests.route.js`, `lab-rule-engine.route.js` |
| **C. Radiology (PACS-ready)** | ✅ | `imaging-platform.route.js`, `orthanc-webhook.route.js`, `dicom-modality.route.js`, `HospitalRadiology.tsx` |
| **C. OT Management** | ✅ | `ot-scheduling.route.js`, `ot-rooms-admin.route.js`, `OTCommandCenter.tsx`, `anesthesia.route.js` |
| **C. Blood Bank** | ✅ | `dept/bloodBank.route.js`, `BloodBankDonorsPage.tsx`, `BloodBankDashboardPage.tsx` |
| **D. Pharmacy** | ✅ | `pharmacy.route.js`, `api-v1-pharmacy.js`, `pharmacy-dispense.route.js`, `HospitalPharmacyDispense.tsx` |
| **D. Inventory & Stores** | ✅ | `scm.route.js` |
| **D. CSSD Management** | 🟡 | Only shell/login (`CSSDLogin.tsx`); **sterilisation tracking + instrument traceability NOT built** |
| **D. Biomedical Equipment Maint.** | ✅ | `device.route.js` (AMC renew, expiring-AMC, health reports) |
| **D. Procurement / SCM** | ✅ | `scm.route.js`, `dept/procurement.route.js` |
| **E. Billing & Revenue Cycle** | ✅ | `HospitalBillingPage.tsx`, `billing.route.js`, `charge-master.route.js`, `billing-estimate.route.js` |
| **E. Insurance & TPA Desk** | ✅ | `hospital-insurance.route.js`, `hmis-preauth.route.js`, `ai-preauth-engine.service.js`, `tpa.route.js` |
| **E. Corporate & TPA Empanelment** | ✅ | `corporate.route.js`, `corporate-hmis.route.js` |
| **E. Accounting (GL/AP/AR)** | ✅ | `AccountsModulePages.tsx` (17 pages), `AccountingManagement.tsx`, `billing-ledger-bridge.service.js`, `auto-invoice.service.js` |
| **E. MRD** | ✅ | `HospitalMRD.tsx`, `PatientEMR.tsx` (archive + audit) |
| **F. HRMS & Payroll** | ✅ | `hrms.route.js`, `payroll.route.js`, `HRModulePages.tsx`, `HRDashboard.tsx` |
| **F. Duty Roster & Shifts** | ✅ | HR module + `employee-network.route.js`, nurse rosters |
| **F. Security Module** | ✅ | `SecurityModulePages.tsx`, `HospitalSecurity.tsx` (visitor, access logs, CCTV dashboard) |
| **F. EDP/IT Admin** | ✅ | `autoTicketService.js`, admin access/master data |
| **G. Dietary & Kitchen** | ✅ | `DietaryModulePages.tsx`, `DietaryDashboardPage.tsx`, `diet.route.js` |
| **G. Housekeeping & Facility** | 🟡 | Referenced in COO/bed-map; **no dedicated housekeeping task module** |
| **G. Ambulance & Transport** | ✅ | `ambulance/auth.routes.js`, `HospitalAmbulance.tsx`, `dispatch/trip logging` |
| **G. Document Management (DMS)** | 🟡 | Document templates + HelpCenter; **no central policy/SOP DMS** |
| **H. Quality & NABH** | ✅ | `nabh-jci.route.js`, `compliance-dashboard.route.js` |
| **H. Patient Feedback/Grievance** | ✅ | `feedback-intelligence.route.js` |
| **H. Communication Hub** | ✅ | `HospitalCommunicationHub.tsx`, SMS/WhatsApp/email gateways |
| **H. Remote Patient Monitoring** | ✅ | `device.route.js` + `telemetry.route.js` + `apple-health.route.js` + `RemoteHealthMonitoring.tsx` |
| **H. Teleconsultation** | ✅ | `VideoConsultation.tsx`, `HospitalTeleconsult.tsx` (Agora) |
| **H. RFID/IoT Asset Tracking** | ✅ | `HospitalAssetTracking.tsx`, `IoTMonitoringHubPage.tsx`, `device.route.js` |
| **H. MIS & Analytics** | ✅ | `MISDashboard.tsx`, `analytics.route.js`, `hmis-analytics.route.js`, `executive-dashboard.route.js` |
| **Compliance: ABDM/ABHA** | ✅ | `abdm.route.js`, `abdm-aadhaar-enrol.service.js` |
| **Compliance: FHIR** | ✅ | `HL7FHIRMonitor.tsx`, CDA routes |
| **Compliance: DPDP/GDPR** | ✅ | `consent-management.route.js`, `audit-chain.service.js` |

**Module availability: 36 / 40 fully present · 3 partial (CSSD, Housekeeping, DMS) · 0 absent.** (~90%)

---
### 3.2 Deployment & remote-control availability (verified against code)

| Capability (on-prem + remote control) | Status | Codebase evidence |
|---|---|---|
| **Single self-contained server image** | ✅ | `Dockerfile.mediczy-app` (React build + Node server + postgres-client) |
| **Multi-process process manager** | ✅ | `server/ecosystem.config.cjs` (PM2: `mediczy-server`, `mediczy-worker`) |
| **Multi-tenant model** | ✅ | `tenants` model; `subdomain`/`custom_domain`; `plan` tiers; per-tenant feature packs |
| **DB-per-tenant provisioning** | ✅ | `createTenantDatabase`, `dropTenantDatabase`, `provisionTenantInfrastructure` |
| **Tenant port + env injection** | ✅ | base port `8010+tenantId`; `PORT`, `TENANT_ID`, `TENANT_SLUG`, `DATABASE_URL` |
| **Tenant lifecycle (start/stop/restart/status/logs)** | ✅ | `startTenantServer`, `stopTenantServer`, `restartTenantServer`, `getTenantServerStatus` (pm2 jlist), `getTenantServerLogs` (pm2 logs) |
| **Control plane API** | ✅ | `server/control-plane-app.mjs` + `super-admin-tenant.route.js` |
| **Outbound node-heartbeat mesh (edge/on-prem)** | ✅ | `local-ai-node.route.js`: `/register`, `/heartbeat`, `/route`, `/health`, `/maintenance`, `/api-keys`; `local_ai_nodes` states |
| **Scoped node API keys** | ✅ | `/api-keys` + scoped keys (e.g. `heartbeat`) |
| **Custom domain / CORS** | ✅ | `tenant.domain.route`, ALLOWED_ORIGINS |

### 3.3 Architecture (as-built)

```
            ┌──────────────────────────────────────────────┐
            │         MEDI / Central (control plane)       │
            │  super-admin · DB provisioning · lifecycle   │
            │  node registry · health · support            │
            └───────────────────────┬──────────────────────┘
                         secure HTTPS + scoped API keys
            ┌───────────────────────┴──────────────────────┐
            │       HOSPITAL ON-PREM SERVER (MMS)          │
            │  Dockerfile.mediczy-app · Node · Postgres    │
            │  tenant app (PORT 8010)  data stays on-site │
            └──────────────────────────────────────────────┘
```

> The **local-node heartbeat mesh is the proven outbound pattern** (register → heartbeat → command) that enables remote control of a box that is not the central hub. This is the pattern to reuse/extend for full on-prem server ops (§4.2).

---

## 4. Gap Analysis (G)

### 4.1 Module-level gaps (feature completeness)

| Gap | Severity | Effort | Decision |
|---|---|---|---|
| **CSSD sterilization tracking + instrument traceability** | High | Med | Build new module (listed in proposal Cat D) — **highest-priority module gap** (also NABH-relevant) |
| **Housekeeping & Facility task module** | Low | Low–Med | Build thin department module (task scheduling, upkeep) |
| **Document Management (DMS) policy/SOP repo** | Low | Low | Build central repository + uploads/versioning |

### 4.2 Deployment / remote-control gaps (the architectural one)

| # | Gap | Impact | Decision |
|---|---|---|---|
| **G-1** | **PM2 lifecycle assumes control-plane and server on the SAME machine.** `tenantProvisionService` runs `pm2 start/jlist/logs` **locally** (verified). | The proposed cross-machine "control it from here" cannot yet use these functions as-is against a hospital box. | **Build an outbound Tenant Server Agent** on the hospital: register with hub → receive commands → run PM2/ops locally → report results + heartbeat. Reuse the `local_ai_nodes` pattern (already outbound + scoped keys). |
| **G-2** | No remote **version update / patch** pipeline for on-prem boxes (AMC Y2 upgrades). | Live updates to client server must be manual. | Extend agent with `pull-release + pm2 reload`; hub publishes release manifest. |
| **G-3** | **Server metrics** (CPU/disk/load/DB) not collected (heartbeat is AI-node-specific). | Can't monitor app+infra health. | Extend heartbeat payload: uptime, mem, disk, DB reachable, process version. |
| **G-4** | No **off-site backup funnel** for on-prem DB. | DR / data-safety on a hospital box. | Agent runs `pg_dump` → encrypted upload to hub/object-store; recovery runbook. |
| **G-5** | Need a **secure channel** to hospital box (no public envelope). | Security. | Outbound-only agent + scoped keys (no inbound firewall exposure); optional VPN for click-live. |
| **G-6** | **Network drop / offline** — agent must buffer ops. | Continuity on flaky hospital link. | Agent local queue + heartbeat/retry; prod already has offline AI/scribes. |

---

## 5. Implementation Plan

### 5.0 Delivery approach (stages)

This mirrors the proposal's §7 (Discovery → Config → Migration → Training → Go-Live/Hypercare) plus a **remote-control enablement** workstream.

| Stage | Weeks | Key activities | Owner |
|---|---|---|---|
| 0. Discovery & contract | 0–2 | LOI, infra sizing (server/OS/DB/network/UPS), data dictionary, confirm modules & master data (tariffs, doctors, wards, items), ABDM onboarding steps, security review, remote-control channel design (agent vs VPN), training plan, Go-Live + AMC terms | BD + Delivery |
| 1. Install & Configure | 2–4 | Deploy single image on hospital box (Docker or bare-metal: Linux, Node20, PG14), configure tenant env, subdomain/custom_domain, CORS, SSL, SMS/WhatsApp gateways; **install Tenant Server Agent** + register with hub | Cloud Eng |
| 2. Data Migration | 2–3 | Migrate masters (doctors, wards, charges), active patients, inventory; reconcile; validate | Delivery + Hospital |
| 3. Training | 1–2 | Role-based: front desk, clinical, pharmacy, billing, admin; NABH doc training | Delivery |
| 4. Go-Live & Hypercare | 1–1.5 | Phased rollout, 1–6 weeks HYPERCARE remote+on-site; monitor via control-plane, benchmark NABH indicators | Delivery + Support |
| 5. AMC & Ongoing | continuous | V2 AMC (25%), version updates via agent, monitoring, backups, SLA support | Support |

### 5.2 Remote-control build track (the G-1..G-6 engineering)

| Item | Scope |
|---|---|
| **Tenant Server Agent** | OUTBOUND daemon (reuse local-node heartbeat/api-key patterns) — register, heartbeat, command/to-exec PM2, report, buffering. |
| **Hub command APIs** | Extend `control-plane-app.mjs`/`tenant route` with `POST /tenants/:id/command {action}`, assign to agent, return result. |
| **Release / update manifest** | Versioned image + blob hash; agent pulls + `pm2 reload` on notify. |
| **Backup funnel** | `pg_dump` schedule → encrypted upload → restore runbook. |
| **Ops dashboard** | Portal for MediQ to view status/logs/metrics/version of each hospital agent, invoke ops. |
| **Security** | Scoped keys, outbound-only from hospital, TLS pinning, minimal inbound, VPN optional. |

---

## 6. Risks & Mitigation

| Risk | Mitigation |
|---|---|
| Hospital infra/OS/DB too small or unsupported | Discovery sizing checklist (Linux, Node20, PG14+, 8GB+ RAM, SSD); optional containerized fallback |
| Remote-control broken if hospital net down | Outbound agent with queue + heartbeat; offline-ops already supported for AI |
| Damaged/leaked credentials to on-prem box | Scoped API keys, TLS pinning, outbound-only agent, regular rotation, VPN option |
| Backup/local DR gap | off-site encrypted pg_dump via agent; restore drill pre-Go-Live |
| Version drift between hospital and hub | release manifest + agent auto/semi-auto update; record version in dashboard |
| Client unwilling to allow remote ops | Offer VPN/agent only with explicit consent; internal it security docs; DPDP consent |
| Customisation scope creep | All bespoke changes via §7 change-control, quoted separately (matches proposal §11) |
| NABH readiness on 3 partial modules (esp. CSSD) | Build CSSD/Housekeeping/DMS early so NABH documentation is complete at Go-Live |

## 7. Recommended Next Steps

1. **Approve discovery** (infra + data dictionary + module/master list + ABDM plan).
2. **Greenlight module builds**: CSSD (priority), DMS, Housekeeping — Phase 1 scope.
3. **Approve Tenant Server Agent build** (reuse local-node pattern) — this is the single enabler for "on-prem box, controlled from MediQ".
4. **Security review** of the remote-control channel before any client box.
5. **Finalize AMC + support SLAs** and release-update policy.

## 8. References & Evidence Index

- `MediQzy_HospitalOS_Proposal_Mahalakshmi_Hospital.pdf` — source requirements.
- `Dockerfile.mediczy-app` — single on-prem image.
- `server/ecosystem.config.cjs` — PM2 deployment.
- `server/services/database-provisioning.service.js` — tenant DB + PM2 lifecycle (start/stop/restart/status/logs).
- `server/control-plane-app.mjs`, `server/routes/super-admin-tenant.route.js` — control plane API.
- `server/routes/local-ai-node.route.js`, `server/migrations/cloud-mother-local-ai-nodes-v2.sql` — node heartbeat/registration pattern (reuse for agent).
- `server/models/postgres/tenant.model.postgres.js` — subdomain/custom_domain/plan tiers.
- `docs/architecture/MEDIQZY_PAAS_ARCHITECTURE.md` — control plane vs tenant plane.
- Module evidence files: `adt.route.js`, `hospital-queue.route.js`, `emar.route.js`, `nursing-ipd.route.js`, `discharge-workflow.route.js`, `imaging-platform.route.js`, `ot-scheduling.route.js`, `dept/bloodBank.route.js`, `scm.route.js`, `device.route.js`, `hospital-insurance.route.js`, `hmis-preauth.route.js`, `hrms.route.js`, `payroll.route.js`, `nabh-jci.route.js`, `feedback-intelligence.route.js`, `abdm.route.js` — module availability.
- `client/src/pages/hospital/*` — Hospital OS front end.

---

*End of on-prem RAG analysis and implementation plan.*

---