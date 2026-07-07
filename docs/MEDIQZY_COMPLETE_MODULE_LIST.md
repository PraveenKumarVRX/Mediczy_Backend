# Mediqzy — Complete Module List

**The AI-Native Healthcare Operating System**
Compiled from the live codebase (backend routes, services, and frontend portals). Grouped by domain. IoT & HyperGrid are called out as first-class layers.

> Legend: `API` = backend route namespace under `/api/…`; portals = role-based frontend apps.

---

## A. Role Portals / Ecosystem Verticals (who logs in)

One platform, many tenant apps — each a full portal:

1. **Hospital** (HMIS/Hospital OS)
2. **Clinic**
3. **Doctor**
4. **Nurse**
5. **Assistant** (doctor's assistant)
6. **Patient / User** (web + mobile)
7. **Lab**
8. **Pharmacy**
9. **Ambulance**
10. **Homecare**
11. **Corporate** (employer wellness)
12. **Admin / Super-Admin** (platform ops)
13. **Team** (internal/SaaS team)
14. **CRM**
15. **Insurance Company**
16. **Insurance Broker**
17. **TPA** (Third-Party Administrator)
18. **Insurer**
19. **Hospital-Insurance desk**
20. **PSU** (public sector undertaking)
21. **NGO**
22. **Aggregator / Enterprise**

---

## B. Core Clinical / HIS-EHR

- **Registration & Appointments** (`appointment`, `enhanced-appointment`, `availability`, `doctor-availability`, `queue`, `queue-management`)
- **ADT — Admission / Discharge / Transfer** (`adt`, `discharge-workflow`)
- **Beds & Ward Management** (`beds-management`, `wards-admin`, `ward`)
- **EMR / EHR** (`emr`, `ehr`, `clinical-workspace`, `hospital-clinical-notes`)
- **Clinical Workflow & Orders** (`clinical-workflow`, `order`, `care-plan`)
- **Clinical Reports & Scores** (`clinical-reports`, `clinical-scores`, `bedside-reference`)
- **Vitals** (`vitals`)
- **Prescriptions** (`prescription`)
- **Inpatient Workspace / Clinical Timeline** (`clinical-workspace`, HMIS patient workspace)
- **Documentation** (`documentation`)

## C. Clinical Departments

- **Emergency (ER)** — ESI triage, trauma, Code Blue (`er-workflow`, `er`)
- **ICU / HDU** — monitors, ventilators, severity scoring (`icu`)
- **Operation Theatre (OT)** — scheduling, checklists, implant tracking, anesthesia (`ot-scheduling`, `ot-rooms-admin`, `anesthesia`)
- **Nursing** — eMAR, e-charting, IPD nursing (`nurse`, `nursing-echart`, `nursing-ipd`, `emar`)
- **Blood Bank** (dept portal)
- **CSSD** (Central Sterile Supply — dept portal)
- **Biomedical Engineering** (dept portal + monitoring)
- **Dietary / Nutrition** (`diet`, dept portal)
- **Consent Management** (`consent-management`, dept portal)
- **Infection Control, Mortuary, Procurement, Quality, Queue** (department portals)

## D. Diagnostics

- **Laboratory / LIS** — orders, sample tracking, results, rule engine (`lab-tests`, `lab-integration`, `lab-rule-engine`)
- **Radiology / RIS** (`doctor-ris-referred`, `lab/ris`)
- **PACS / DICOM / Tele-radiology** — Orthanc PACS + OHIF viewer (`dicom-modality`, `orthanc-webhook`, `imaging-platform`, `imaging-session`, `doctor-imaging`, `hypergrid-dicom`, `dicomweb-ohif`, `orthanc-pacs`, `orthanc-hypergrid-bridge`)
- **Report Analysis & Builder** (`report-analysis`, `report-builder`, `public-report`, `clinical-reports`)

## E. Pharmacy & Supply Chain

- **Pharmacy** — inventory, dispensing, expiry (`pharmacy`, `pharmacy-dispense`, `patient-pharmacy-orders`)
- **eMAR ↔ Pharmacy bridge** (`emar-pharmacy-bridge`)
- **Supply Chain Management / Procurement** (`scm`, dept portals)
- **Charge Master & Inventory** (`charge-master`)

## F. Revenue Cycle & Insurance

- **Billing & Invoicing** (`billing`, `billing-estimate`, `charge-master`, `billing-ledger-bridge`)
- **Payments & Wallet** (`payment`, `wallet`, `coupon`, `cart`)
- **Insurance Claims Engine** (`insurance`, `insurance-policy`, `hospital-insurance`)
- **Pre-Authorization (AI)** (`hmis-preauth`, AI pre-auth engine)
- **TPA operations** (`tpa`, `tpa-dashboard`)
- **Insurance Company / Broker / Insurer** portals (`insurance-company`, `insurance-broker`, `insurer`, `broker-integration`)
- **NHCX / X12N EDI claims** (`x12n-edi`, `cda`)
- **Revenue Intelligence** (`revenue-insights`, `ai-revenue`)

## G. Executive & Command

- **Hospital OS Hub** (`hospital-os`, `hospital-os-control`)
- **Command Center** (HMIS command center — live ops)
- **Executive Dashboards** — CEO, CFO, COO, MS (Medical Superintendent)
- **HMIS Analytics / Alerts / Automation** (`hmis-analytics`, `hmis-alerts`, `hmis-automation`, `ai-hmis-ops`)
- **Analytics & Telemetry** (`analytics`, `ai-analytics`, `telemetry`, `saas-dashboard`)

---

## H. AI & Augmented Intelligence ⭐

**The multi-agent AI brain** (`ai-brain`) — 7 governed agents (Admin, Clinical, Analyst, Worker, Research, Insurance, Emergency) + orchestrator, permission engine, tool sandbox, LLM cascade, RAG, self-optimizing evaluation engine.

- **AI Copilot / Module Copilot** (`ai-brain`, `module-copilot`, `doctor-copilot`, `ai-copilot-pending-actions`)
- **Dr. iSHA Voice Assistant** (`voice-assistant`, `voiceConfig`) — voice + on-device STT fallback
- **AI Scribe (ambient, online + offline, multilingual)** (`ai-scribe`, `offline-scribe`, `scribe-stream`, `voice-scriber-admin`, `tts`)
- **Clinical Decision Support (CDSS)** (`cdss-knowledge`, `cds-hooks`, `medical-ai`, `ai-medical-nlp`)
- **AI Vision / Medical imaging analysis** (`ai-vision`)
- **Emergency Triage AI (ESI)** (`ai-emergency-triage`)
- **Drug Interaction Intelligence** (`ai-drug-interaction`)
- **Health Risk Scoring (Bayesian + SHAP)** (`ai-health`, `health-score`, `ai-his-score`, `patient-risk-queue`)
- **Clinical Insights / Proactive Alerts / Smart Notifications** (cron services: `ai-clinical-insights`, `ai-proactive-alerts`, `ai-smart-notifications`)
- **AI Pre-Auth & Insurance Bot** (`ai-preauth-engine`, `ai-insurance-bot`)
- **AI Revenue / CRM / Department intelligence** (`ai-revenue-intelligence`, `ai-crm`, `ai-dept`, `crm-ai`, `crm-underwriting`)
- **AI Deep-Tech / Intelligence / Layer Map** (`ai-deeptech`, `ai-intelligence`, `ai-layer-map`, `roadmap-intelligence`)
- **Self-Learning & Federated Learning** (`ai-self-learning-pipeline`, `ai-federated-learning`)
- **Local AI Node / SIB gateway / chatbots** (`local-ai-node`, `sib-control`, `sib-chatbots`, `sib-control-layer`)
- **LLM Gateway + metrics** (`llm-provider`, `llm-metrics`, `embeddings`)
- **AI Governance & Safety** (`ai-governance`, `ai-model-governance`, `ai-quality-gates`, `ai-interpretability`, `operations-governance`) — SHAP/LIME, quality gates, drift/PSI, model cards, PCCP change control

## I. HyperGrid — IoT · Device Mesh · Interoperability ⭐

**HyperGrid is the event-driven "nervous system"** — canonical events (Redis pub/sub + optional Kafka), device ingestion, digital twins, and standards gateways.

- **Event Bus** (`hypergrid-events`, `hypergrid-event-bus`, `kafka-events`, `kafka-consumers`) — canonical `{type, source, tenantId, patientId, payload}`
- **MQTT ingestion** (`hypergrid-mqtt`, `display-mqtt-bridge`) — medical devices & smart displays
- **Digital Twins** (`hypergrid-twins`) — real-time device/asset/patient twins
- **Edge nodes** (`hypergrid-edge`) — on-prem edge compute
- **Connectors** (`hypergrid-connector`) — RFID/RTLS/BLE asset tags, canonical adapters
- **Smart-on-FHIR** (`hypergrid-smart-fhir`)
- **Marketplace** (`hypergrid-marketplace`) — third-party apps/AI plug-ins
- **Terminology services** (`hypergrid-terminology`, `medical-terminology`)
- **DICOM/PACS bridge** (`hypergrid-dicom`, `orthanc-hypergrid-bridge`)

### IoT / Devices / Wearables
- **Smart tablet devices (with SIM)** (`device`, `device-monitoring`)
- **Point-of-Care diagnostic devices (BLE)** (`poc-device`)
- **Device alarm bridge** (`device-alarm-bridge`) — monitor/ventilator/pump streams → events
- **Wearables & Apple Health / Fitness** (`wearable`, `apple-health`, `fitness`, `activityTracker`, `patient-wearable-context`, UserWearables)
- **Smart Interactive Displays** (`display-kiosk`, `hospital-display`, `display-mqtt-bridge`)
- **Remote Patient Monitoring (RPM)** — device streams + Monitoring AI

## J. Interoperability & Standards

- **HL7 v2 (MLLP gateway)** (`hl7-gateway`, `hl7-mllp-gateway`)
- **FHIR** — REST, subscriptions, bulk export, mapper (`fhir`, `fhir-subscriptions`, `fhir-subscription`, `fhir-bulk-export`, `fhir-mapper`)
- **CDA / CCD documents** (`cda`)
- **CDS Hooks** (`cds-hooks`)
- **X12N EDI / NHCX** (`x12n-edi`)
- **ABDM (India health stack) + ABDM Kiosk** (`abdm`, `abdm-kiosk`)
- **Ayushman Bharat** (`ayushman`)
- **SFTP adapter** (`sftp`)
- **Clinical coding bridge (ICD-10)** (`clinical-coding-bridge`)
- **API Gateway / OpenAPI / Module access** (`hospital-openapi`, `module-access`, `data-export`, `embeddings`)

## K. Collaboration & Communication

- **Unified Communication Hub** (`communication`) — SMS, email, WhatsApp, voice
- **Video / Tele-consultation** (`video`, `video-events`, `videoConfig`, `online-consultation`, `consultation-recording`, `recording`) — WebRTC/LiveKit
- **Chat / Doctor chat / Support chat / Omnichannel** (`chat`, `doctor-chat`, `support-chat`, `omnichannel-journey`, `call-notification`)
- **Messaging channels** — WhatsApp Business (`whatsapp`, `whatsapp.business`, `whatsapp-production`, `whatsapp-numbers`), SMS (`sms`), Email (`email`, `emailSettings`, `teamEmail`, `welcomeEmailTemplates`), FCM push (`fcm`, `firebase-status`)
- **Notifications orchestration** (`notification`, notification-orchestrator/automation)

## L. Patient Engagement & Wellness

- **Patient app / Health dashboard** (`patient`, `user`, `health`, `healthData`, UnifiedHealthDashboard)
- **Patient Navigation & Engagement** (`patient-navigation`, `patient-engagement`)
- **Health Diary / Tracker / Feed / Intelligence** (`health-diary`, `health-intelligence`, HealthTracker, HealthFeed)
- **Health Programs & Camps** (`health-programs`, `health-camp`, `health-assessment`)
- **Membership & Plans** (`membership`, `membership-plans`, `org-membership-plans`)
- **Family members & network** (`family-member`, `employee-network`, Family Portal)
- **Leaderboard / gamified wellness** (`leaderboard`, `fitness`)
- **Digital health card / Ayushman** (`ayushman`, MembershipCard)

## M. CRM & Growth

- **CRM** (`crm`, `crm-ai`, `crm-analysis`, `crm-underwriting`)
- **Campaigns & Email analytics** (`crmCampaigns`, `crmCampaignAnalytics`, `crmEmail`)
- **Leads** (`marketing-leads`, `fb-leads`, `provider-network-bot`)
- **Corporate bookings & HMIS** (`corporate`, `corporate-bookings`, `corporate-hmis`)

## N. HR, Workforce & Operations

- **HRMS / Payroll** (`hrms`, `payroll`)
- **Staff & shift management, roles, delegation** (`role`, `delegation`, `userAssociation`)
- **Follow-up automation** (`follow-up-hmis`, `care-plan`)
- **Async jobs / workers** (`async`, workers, tasks, cron registry)

## O. Governance, Compliance & Security

- **SaMD Regulatory** (`samd-regulatory`) — CDSCO/FDA/EU frameworks
- **NABH / JCI accreditation** (`nabh-jci`, Quality dept)
- **ISO 27001 / Compliance dashboard** (`iso27001`, `compliance-dashboard`)
- **Consent & Privacy** (`consent-management`, `privacy`)
- **Audit & Error tracking** (audit logs, `error-tracking`, `circuit-breaker`)
- **CareOS clinical layer** (`careos`)
- **Security & Surveillance / CCTV** (Security dept portal, asset theft alarms)
- **Compliance for research** (`rwe-platform` — real-world evidence, `ai-federated-learning`)

## P. Research & Data

- **Clinical Research / RWE platform** (`rwe-platform`, `roadmap-intelligence`)
- **Data export / embeddings / knowledge base** (`data-export`, `embeddings`, `pdfKnowledge`, `cdss-knowledge`)
- **Analytics ETL** (DuckDB ETL, `analytics`, `saas-dashboard`)

## Q. Platform / SaaS Infrastructure

- **Identity & Auth** — SSO, OAuth, MFA, universal login (`auth.universal`, `sso`, `oauth`, `doctor-oauth`, `enterprise-auth`, `aggregator-auth`, `otp`, `password-reset`)
- **Multi-tenancy** (`tenant`, `tenant-domain`, `super-admin-tenant`, tenant-provisioner, dedicated-db-provisioner, database-provisioning)
- **Module access / entitlements** (`module-access`, `membership-plans`)
- **SaaS billing & metering** (`saas-dashboard`, saas-billing, usage-metering, tenant-billing)
- **Address / uploads / files** (`address`, `upload`, object storage/MinIO)
- **Tickets & support** (`tickets`, `support-chat`, `feedback-intelligence`)
- **Ambulance dispatch** (`ambulance`) — GPS + AI triage
- **Enterprise / Aggregator** (`enterprise`, `aggregator`, `org-membership-plans`)

---

## R. Future / Product-line Modules (roadmap naming)

| Product module | Realized by (today) |
|---|---|
| **Mediqzy Core** (HIS/EHR) | Sections B–G |
| **Mediqzy Collaborate** (Living Patient Workspace) | clinical-workspace + collaboration (K) |
| **Mediqzy AI** (Copilot / Care Intelligence Mesh) | Section H |
| **Mediqzy Command** (Command Center) | Section G |
| **Mediqzy Connect** (referrals / cross-border) | FHIR + HyperGrid federation (I/J) |
| **Mediqzy Home** (RPM) | IoT/wearables + Monitoring AI (I) |
| **Mediqzy Insights** (predictive analytics) | Section H + DuckDB ETL |
| **Mediqzy Identity** | Section Q auth + MPI (planned) |
| **Mediqzy Research** | Section P |
| **Mediqzy Marketplace** | `hypergrid-marketplace` |

---

### Snapshot counts (from codebase)
- **~22** role portals / verticals
- **~200** backend route modules (`server/routes/*.route.js`)
- **9** HyperGrid subsystems (events, mqtt, twins, edge, connectors, smart-fhir, terminology, dicom, marketplace)
- **7** governed AI agents + ~20 AI/ML services
- **6** mobile apps (Doctor, Nurse, Patient iOS/Android, Admin, Ambulance, Lab Agent)

*This list is generated from the live codebase; treat it as the canonical module inventory. For "how it's all wired," see `docs/architecture/MEDIQZY_AI_NATIVE_OS_ARCHITECTURE.md`.*
