# Mediczy — World-Class Implementation Plan
**Date:** March 15, 2026  
**Status:** Living Document — Updated as phases complete

---

## Architecture Vision

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        SUPER ADMIN CONTROL PLANE                        │
│  Tenant Provisioning │ Infra Management │ Kill Switch │ Billing │ Logs  │
└────────────┬────────────────────┬────────────────────┬──────────────────┘
             │                    │                    │
     ┌───────▼──────┐   ┌────────▼───────┐   ┌───────▼──────┐
     │   Tenant A   │   │   Tenant B     │   │   Tenant C   │
     │ apollo.med.. │   │ fortis.med..   │   │ clinic.med.. │
     │ Own DB/Schema │   │ Own DB/Schema  │   │ Shared DB    │
     │ Own AI Config │   │ Own AI Config  │   │ Row-Level    │
     └───────┬──────┘   └────────┬───────┘   └───────┬──────┘
             │                    │                    │
             └────────────────────┼────────────────────┘
                                  │
                    ┌─────────────▼──────────────┐
                    │     SIB CONTROL LAYER       │
                    │  (Universal AI Middleware)   │
                    │  Kill Switch │ Rate Limits   │
                    │  Confidence │ Circuit Break  │
                    │  Audit Log │ Human Approval  │
                    └─────────────┬──────────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                   │
    ┌─────────▼────────┐ ┌───────▼────────┐ ┌───────▼────────┐
    │   BOTLET ROUTER   │ │  ORCHESTRATOR  │ │  SIB FASTAPI   │
    │  Intent → Score   │ │  Think→Act→Obs │ │  Python Brain  │
    │  → Route → Track  │ │  15 Tools      │ │  10 Botlets    │
    └─────────┬────────┘ └───────┬────────┘ └───────┬────────┘
              │                   │                   │
              └───────────────────┼───────────────────┘
                                  │
                    ┌─────────────▼──────────────┐
                    │     UNIFIED LLM CASCADE     │
                    │  iSHA GPU → Groq → OpenAI   │
                    │  Vision: Claude → Groq      │
                    │  STT: Groq → OpenAI Whisper │
                    │  Single config, single keys  │
                    └─────────────┬──────────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                   │
    ┌─────────▼────────┐ ┌───────▼────────┐ ┌───────▼────────┐
    │  CLOSED-LOOP      │ │  KAFKA EVENT   │ │  BULLMQ MOTOR  │
    │  LEARNING          │ │  STREAM        │ │  SYSTEM         │
    │  Feedback→Retrain │ │  Sensor→Brain  │ │  Brain→Execute  │
    └──────────────────┘ └────────────────┘ └────────────────┘
```

---

## Phase 1 — Unify AI Under SIB (Foundation)

**Goal:** Every AI action flows through SIB Control Layer. One brain, one cascade, one audit trail.

### 1.1 SIB AI Middleware (`server/middleware/sib-ai-guard.middleware.js`)

**What:** Express middleware that wraps ALL AI route handlers. Before any LLM call executes, it passes through SIB Control Layer for safety checks.

**How:**
- Create `sibAIGuard` middleware that intercepts AI routes
- Maps route + method to a `DECISION_TYPE` (e.g., POST /cdss/query → `AI_QUERY`)
- Calls `sibControlLayer.processDecision()` with auto-generated confidence from request context
- On approval → proceed to route handler
- On rejection → return 429/503 with reason

**Decision types to add:**
```
AI_QUERY            — Any LLM-powered query (CDSS, chat, consult)
AI_PRESCRIPTION     — Prescription generation/review
AI_DIAGNOSIS        — Differential diagnosis, symptom analysis
AI_TRANSCRIPTION    — Audio transcription (STT)
AI_VISION           — Medical image analysis
AI_REPORT           — Report analysis/generation
AI_EMERGENCY        — Emergency triage (maps to existing ESCALATE_EMERGENCY)
AI_NOTIFICATION     — AI-triggered notifications (maps to existing SEND_NOTIFICATION)
```

**Routes to guard:**
```
/api/cdss/knowledge/*        — CDSS queries
/api/ai-brain/*              — Orchestrator (think, conversations)
/api/ai/chat, /api/ai/query  — Direct AI chat
/api/ai-vision/*             — Vision analysis
/api/doctor/clinical-workflow/soap, /encounter, /summary — Clinical AI
/api/doctor/ai-scribe/*      — AI Scribe
/api/medical-ai/*            — Medical AI consult
/api/consultation-recording/* — Transcription
/api/ai-intelligence/*       — Drug interactions, insurance, triage
/api/reports/analyze          — Report analysis
```

**What it does NOT guard:** Static search endpoints (ICD-10/SNOMED/CPT lookup), health checks, analytics queries.

**Files to modify:**
- `server/services/sib-control-layer.service.js` — Add AI_* decision types
- `server/middleware/sib-ai-guard.middleware.js` — NEW: middleware
- `server/app.js` — Mount middleware on AI routes

### 1.2 Unify LLM Keys

**What:** Python SIB brain uses its own hardcoded Groq API key. Unify under environment variables.

**How:**
- `ai-engine/doctor_bot/sib/brain.py` — Replace hardcoded `GROQ_API_KEY` with `os.environ.get('GROQ_API_KEY')`
- `scripts/sib-fastapi-start.sh` — Pass env vars from `.env` to Python process
- Verify both Node.js and Python use same keys

**Files to modify:**
- `ai-engine/doctor_bot/sib/brain.py` — Remove hardcoded key
- `scripts/sib-fastapi-start.sh` — Add env passthrough

### 1.3 SIB Decision Dashboard Data

**What:** Expose SIB decision metrics via existing health/audit endpoints so the frontend can show a "Mission Control" view.

**How:**
- `server/routes/sib-control.route.js` — Add `GET /api/sib/dashboard` endpoint
- Returns: decisions/hour by type, approval queue, circuit breaker status, kill switch state, top rejection reasons
- Uses existing `sibControlLayer.getHealthStatus()` + `getAuditLog()`

**Files to modify:**
- `server/routes/sib-control.route.js` — Add dashboard endpoint

### 1.4 Complete KB Ingestion + DB Constraints

**What:** Medical QA ingestion stopped at 6,192/10,000. Finish it. Add unique constraints.

**How:**
- Resume `server/scripts/ingest-medical-qa.js`
- Add unique index on `icd10_codes(code)`
- Add unique index on `snomed_codes(concept_id)`
- Add unique constraint on `medical_embeddings(namespace, source_id)` to prevent duplicate ingestion

**Files to modify:**
- `server/scripts/ingest-medical-qa.js` — Add resume capability (skip existing)
- SQL migration for unique indexes

---

## Phase 2 — Implement Botlet Router + Task Proxy (Intelligence Layer)

**Goal:** Turn the pseudocode botlet router into working code. Wire sib-task-proxy into routes.

### 2.1 Implement BotletRouter (`server/utils/botletRouter.js`)

**What:** The file has complete pseudocode for intent classification → botlet scoring → routing → escalation. Implement it.

**How:**
- Import `intentClassifier` from ai-brain tools
- Implement the 4-factor weighted scoring: priority (40%) + confidence (30%) + performance (20%) + load (10%)
- Wire sticky sessions via `activeSessionMap`
- Implement escalation path walking (botlet → human_agent → emergency)
- Register the 4 example botlets from `botlet.schema.js` (emergency-triage, appointment-scheduler, pregnancy-specialist, medical-consultant)
- Add fallback routing when no botlet matches

**Files to modify:**
- `server/utils/botletRouter.js` — Full implementation
- `server/routes/sib-chatbots.route.js` — Use botletRouter instead of direct HTTP

### 2.2 Wire SIB Task Proxy into Routes

**What:** `sib-task-proxy.js` has 20 task types but isn't imported anywhere.

**How:**
- Create `server/middleware/sib-task-router.middleware.js` — NEW (the file exists but may need implementation)
- Wire specific routes through the task proxy:
  - Appointment CRUD → `scheduleAppointment()`, `rescheduleAppointment()`, `cancelAppointment()`
  - AI Scribe → `generatePrescription()`, `reviewPrescription()`
  - Health diary → `addHealthDiaryEntry()`, `updateHealthDiary()`
  - Emergency → `detectEmergency()`
  - Risk → `assessRisk()`

**Files to modify:**
- `server/middleware/sib-task-router.middleware.js` — Implement
- `server/routes/ai-scribe.route.js` — Wire prescription through task proxy
- `server/routes/ai-intelligence.route.js` — Wire emergency/risk through task proxy

### 2.3 Closed-Loop Learning Pipeline

**What:** When a doctor accepts/modifies/rejects an AI suggestion, feed that back to improve future responses.

**How:**
- Add feedback tracking to CDSS responses:
  - `POST /api/cdss/knowledge/feedback` — { queryId, action: accepted|modified|rejected, modification?, reason? }
  - Store in `ai_cdss_feedback` table
- Track ICD-10/SNOMED suggestion accuracy:
  - Log which codes doctor kept vs removed
  - Weekly aggregation job → adjusts enrichment ranking
- Self-learning pipeline integration:
  - `ai-self-learning-pipeline.service.js` already exists — wire CDSS feedback into it

**New files:**
- SQL: `ai_cdss_feedback` table migration
- `server/routes/cdss-knowledge.route.js` — Add feedback endpoint

**Files to modify:**
- `server/services/cdss.service.js` — Add queryId to responses for tracking
- `server/services/ai-self-learning-pipeline.service.js` — Consume CDSS feedback

---

## Phase 3 — Clinical Experience (The "Wow")

**Goal:** Real-time inline CDSS, end-to-end AI scribe flow, proactive alerts.

### 3.1 Inline CDSS in Prescription Workflow

**What:** As doctor types a drug name in the prescription form, show real-time:
- Drug-drug interactions with existing medications
- Contraindications for patient's conditions (ICD-10 cross-reference)
- Evidence-based alternatives
- Dosage suggestions based on patient weight/age/renal function

**How:**
- `GET /api/doctor/clinical-workflow/drug/check` — Real-time drug safety check
  - Input: drugName, patientId (to pull current medications + conditions)
  - Output: { interactions[], contraindications[], alternatives[], dosageSuggestion }
- Uses `ai-drug-interaction.service.js` + ICD-10/SNOMED DB for condition cross-reference
- Response < 2 seconds for inline UX

**Files to modify:**
- `server/routes/clinical-workflow.route.js` — Add drug check endpoint
- `server/services/ai-drug-interaction.service.js` — Add patient context lookup

### 3.2 End-to-End AI Scribe Flow

**What:** Doctor starts consultation recording → AI transcribes → generates structured SOAP note → auto-codes ICD-10/SNOMED/CPT → ready-to-sign encounter.

**How:**
- Current: Transcription exists (consultation-recording.route.js), SOAP generation exists (clinical-workflow.route.js), coding exists (ICD-10/SNOMED/CPT endpoints)
- Missing: The pipeline connecting them automatically
- Add `POST /api/doctor/clinical-workflow/scribe/complete` — Single endpoint that:
  1. Takes transcription text (or audioId)
  2. Generates SOAP note via LLM
  3. Enriches with validated ICD-10 + SNOMED codes via `enrichWithMedicalCodes()`
  4. Suggests CPT codes based on SOAP content
  5. Returns complete encounter draft

**Files to modify:**
- `server/routes/clinical-workflow.route.js` — Add `/scribe/complete` endpoint
- `server/services/cdss.service.js` — Add CPT suggestion method

### 3.3 Proactive Patient Alerts

**What:** SIB monitors incoming data and triggers alerts proactively.

**How:**
- Cron job: `ai-proactive-alerts-cron.service.js` — NEW
  - Runs every 4 hours
  - Queries: patients with lab results trending bad (HbA1c rising, eGFR declining)
  - Queries: patients overdue for follow-ups based on diagnosis (diabetics needing HbA1c every 3 months)
  - Queries: medication adherence gaps
  - For each alert → `sibControlLayer.processDecision({ type: TRIGGER_ALERT, ... })`
  - Doctor sees alerts in dashboard

**New files:**
- `server/services/ai-proactive-alerts-cron.service.js`
- `server/routes/ai-intelligence.route.js` — Add alerts endpoint

### 3.4 Differential Diagnosis Visualization

**What:** CDSS returns differential diagnoses — add Bayesian probability support.

**How:**
- `server/services/cdss.service.js` — Modify enrichment to include probability scores
- LLM prompt: "For each differential, estimate probability (%) based on presented symptoms and labs"
- Response includes `differentialDiagnosis[].probability` (0-100)
- Frontend renders probability bars (frontend change)

**Files to modify:**
- `server/services/cdss.service.js` — Add probability scoring in enrichment

---

## Phase 4 — Interoperability + Patient Intelligence

**Goal:** FHIR R4, ABDM integration, WhatsApp pre-visit, patient-friendly summaries.

### 4.1 FHIR R4 API Layer

**What:** Expose patient data as FHIR R4 resources for hospital EHR/HIS integration.

**How:**
- New route: `server/routes/fhir.route.js`
- Resources to implement:
  - `Patient` — from patients table
  - `Encounter` — from appointments/consultations
  - `Condition` — from diagnoses (ICD-10 coded)
  - `MedicationRequest` — from prescriptions
  - `DiagnosticReport` — from lab results
  - `Observation` — from vitals/lab values
  - `AllergyIntolerance` — from patient allergies
- FHIR Bundle support for batch operations
- Content-Type: `application/fhir+json`
- Versioning: `/api/fhir/r4/Patient/{id}`

**New files:**
- `server/routes/fhir.route.js` — FHIR endpoints
- `server/services/fhir-mapper.service.js` — Maps DB models → FHIR resources
- `server/schemas/fhir/` — FHIR resource validation schemas

### 4.2 ABDM Health Information Exchange

**What:** Complete ABDM HIE flow: consent → data request → encrypted transfer.

**How:**
- ABHA ID implementation already started (ABHA_ID_IMPLEMENTATION_SUMMARY.md exists)
- Complete: Health Information Manager (HIM) endpoints
  - Consent request/grant/revoke via ABDM gateway
  - Health record push to ABDM
  - Health record pull from ABDM (with consent)
- Uses ABDM Sandbox first, then production gateway

**Files to modify:**
- Existing ABDM files + new consent flow routes

### 4.3 WhatsApp Pre-Visit Symptom Collection

**What:** Patient receives WhatsApp message before appointment → answers symptom questions → structured intake auto-fills before doctor sees them.

**How:**
- `server/services/whatsapp-previste.service.js` — NEW
  - Triggered by appointment reminder cron (24 hours before)
  - Sends structured WhatsApp template: "Your appointment with Dr. X is tomorrow. Please share your symptoms."
  - SIB chat botlet handles conversation → extracts structured symptoms
  - Stores in `pre_visit_intake` table
  - Doctor sees pre-filled intake when opening the consultation

**New files:**
- `server/services/whatsapp-previsit.service.js`
- SQL: `pre_visit_intake` table

### 4.4 Patient-Friendly Post-Visit Summary

**What:** After consultation, AI generates a simple summary in patient's language.

**How:**
- `POST /api/doctor/clinical-workflow/patient-summary` — Takes encounter/consultation data
- LLM generates: diagnosis explanation, medication instructions, lifestyle advice, follow-up date — in simple language
- Supports Hindi, Kannada, Telugu, Tamil (via LLM multilingual capability)
- Auto-sent via WhatsApp/SMS after doctor signs off

**Files to modify:**
- `server/routes/clinical-workflow.route.js` — Add patient summary endpoint

---

## Phase 5 — AWS-Model Multi-Tenancy (Tenant Infrastructure Control)

**Goal:** Each tenant can have their own server, DB, and domain — but super admin controls everything from a central plane. Like AWS managing customer EC2/RDS instances.

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    SUPER ADMIN CONTROL PLANE                            │
│                    (Runs at admin.mediqzy.com)                          │
│                                                                         │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────────┐ ┌───────────────┐  │
│  │  Tenant     │ │  Infra       │ │  Monitoring  │ │  Billing &    │  │
│  │  Registry   │ │  Provisioner │ │  & Alerts    │ │  Metering     │  │
│  └──────┬──────┘ └──────┬───────┘ └──────┬───────┘ └──────┬────────┘  │
│         │               │                │                │            │
│  ┌──────▼──────┐ ┌──────▼───────┐ ┌──────▼───────┐ ┌─────▼─────────┐ │
│  │ Tenant DB   │ │ Deploy       │ │ Health Check │ │ Usage Tracker │ │
│  │ (central)   │ │ Manager      │ │ Aggregator   │ │ API Calls/    │ │
│  │ All tenant  │ │ docker/pm2/  │ │ Heartbeats   │ │ Storage/AI    │ │
│  │ metadata    │ │ k8s/compose  │ │ from tenants │ │ per tenant    │ │
│  └─────────────┘ └──────────────┘ └──────────────┘ └───────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
        │                    │                    │
        ▼                    ▼                    ▼
┌──────────────┐   ┌──────────────┐    ┌──────────────┐
│  TENANT A    │   │  TENANT B    │    │  TENANT C    │
│  DEDICATED   │   │  DEDICATED   │    │  SHARED      │
│              │   │              │    │              │
│ Domain:      │   │ Domain:      │    │ Domain:      │
│ apollo.med.. │   │ fortis.med.. │    │ xyz.mediqzy  │
│              │   │              │    │  .com        │
│ Server:      │   │ Server:      │    │              │
│ Own PM2/     │   │ Own PM2/     │    │ Server:      │
│ Docker inst  │   │ Docker inst  │    │ Shared       │
│              │   │              │    │ (row-level)  │
│ Database:    │   │ Database:    │    │              │
│ Own PG DB    │   │ Own PG DB    │    │ Database:    │
│              │   │              │    │ Shared DB    │
│ AI Config:   │   │ AI Config:   │    │ tenant_id    │
│ Custom LLM   │   │ Custom model │    │              │
│ thresholds   │   │ preferences  │    │ AI Config:   │
│              │   │              │    │ Default      │
│ SIB Policy:  │   │ SIB Policy:  │    │              │
│ Custom rate  │   │ Custom rate  │    │ SIB Policy:  │
│ limits       │   │ limits       │    │ Default      │
└──────┬───────┘   └──────┬───────┘    └──────┬───────┘
       │                  │                    │
       └──────────────────┼────────────────────┘
                          │
              Heartbeat / Metrics / Logs
                          │
                          ▼
              ┌───────────────────────┐
              │  SUPER ADMIN PLANE    │
              │  (aggregates all)     │
              └───────────────────────┘
```

### 5.1 Tenant Registry & Configuration

**What:** Central database of all tenants with their infrastructure config.

**Existing:** `tenant.model.postgres.js` has basic fields (name, slug, subdomain, custom_domain, type).

**Extend with:**
```
tenants table additions:
  - isolation_level    ENUM('shared_row', 'shared_schema', 'dedicated_db', 'dedicated_server')
  - server_config      JSONB  { host, port, pm2Name, dockerContainer, region }
  - db_config          JSONB  { host, port, dbName, schema, username, poolSize }
  - domain_config      JSONB  { subdomain, customDomain, sslCert, sslKey }
  - ai_config          JSONB  { llmCascade, confidenceThresholds, rateLimits, allowedModels }
  - billing_config     JSONB  { plan, pricePerSeat, aiCallsIncluded, storageGB }
  - status             ENUM('provisioning', 'active', 'suspended', 'decommissioning', 'archived')
  - provisioned_at     TIMESTAMP
  - last_heartbeat     TIMESTAMP
  - monthly_usage      JSONB  { apiCalls, aiCalls, storageBytes, activeUsers }
```

**Files:**
- `server/models/postgres/tenant.model.postgres.js` — Extend schema
- `server/services/tenant-registry.service.js` — NEW: CRUD + config management

### 5.2 Infrastructure Provisioner

**What:** Super admin can provision a new tenant's infrastructure from the admin panel.

**Provisioning flow by isolation level:**

#### Shared Row-Level (Default, cheapest)
1. Create tenant record
2. Create `tenant_id` entries in existing tables
3. Set up RLS policies for the tenant
4. No infra provisioning needed
5. Assign subdomain (auto-SSL via Caddy/Nginx)

#### Shared Schema
1. Create tenant record
2. Create new PostgreSQL schema: `CREATE SCHEMA tenant_{slug}`
3. Run migrations in that schema
4. Configure app to route queries to correct schema
5. Assign subdomain

#### Dedicated Database
1. Create tenant record
2. Create new PostgreSQL database: `CREATE DATABASE mediczy_{slug}`
3. Run full migrations
4. Create dedicated connection pool
5. Configure app to route queries to correct DB
6. Assign subdomain

#### Dedicated Server (Enterprise)
1. Create tenant record
2. Clone app to new directory: `/opt/mediczy/tenants/{slug}/`
3. Create dedicated PM2 ecosystem config
4. Create dedicated PostgreSQL database
5. Start PM2 processes with tenant-specific env
6. Configure Nginx/Caddy reverse proxy for custom domain
7. Provision SSL certificate (Let's Encrypt)
8. Register heartbeat monitoring

**Files:**
- `server/services/tenant-provisioner.service.js` — NEW: Handles all 4 levels
- `server/services/tenant-db-provisioner.service.js` — NEW: DB creation + migrations
- `server/services/tenant-server-provisioner.service.js` — NEW: PM2/Docker management
- `server/services/tenant-domain-provisioner.service.js` — NEW: Nginx config + SSL

### 5.3 Super Admin Control API

**What:** REST API for super admin to manage all tenant infrastructure.

**Endpoints:**
```
POST   /api/superadmin/tenants                    — Provision new tenant
GET    /api/superadmin/tenants                    — List all tenants + status
GET    /api/superadmin/tenants/:id                — Tenant details + infra status
PUT    /api/superadmin/tenants/:id                — Update tenant config
DELETE /api/superadmin/tenants/:id                — Decommission tenant
POST   /api/superadmin/tenants/:id/suspend        — Suspend tenant
POST   /api/superadmin/tenants/:id/activate       — Activate tenant
POST   /api/superadmin/tenants/:id/upgrade         — Upgrade isolation level
GET    /api/superadmin/tenants/:id/health          — Tenant health (server + DB)
GET    /api/superadmin/tenants/:id/usage           — Usage metrics
GET    /api/superadmin/tenants/:id/logs            — Recent logs
POST   /api/superadmin/tenants/:id/restart         — Restart tenant's server
POST   /api/superadmin/tenants/:id/deploy          — Deploy latest code to tenant
POST   /api/superadmin/tenants/:id/backup          — Trigger DB backup
POST   /api/superadmin/tenants/:id/restore         — Restore from backup
GET    /api/superadmin/tenants/:id/ai-config       — Tenant's AI configuration
PUT    /api/superadmin/tenants/:id/ai-config       — Update AI config (models, thresholds)
POST   /api/superadmin/tenants/:id/kill-switch     — Activate SIB kill switch for tenant
GET    /api/superadmin/dashboard                   — Aggregate: total tenants, health, revenue
GET    /api/superadmin/billing                     — Billing overview across tenants
```

**Files:**
- `server/routes/superadmin.route.js` — NEW: All super admin endpoints
- `server/middleware/superadmin.middleware.js` — NEW: Super admin auth (separate from admin)

### 5.4 Tenant Heartbeat & Monitoring

**What:** Every tenant instance sends heartbeats. Super admin sees real-time health.

**How:**
- Each tenant server runs a cron (every 60s) that POSTs to control plane:
  ```
  POST /api/superadmin/heartbeat
  Body: { tenantId, serverMetrics: { cpu, memory, disk, uptime },
          dbMetrics: { connections, queryLatency, dbSize },
          aiMetrics: { llmCalls, avgLatency, errorRate },
          appMetrics: { activeUsers, apiCalls, errors } }
  ```
- Control plane stores heartbeats, detects missed heartbeats (>3min = warning, >5min = alert)
- Dashboard shows green/yellow/red per tenant

**Files:**
- `server/services/tenant-heartbeat.service.js` — NEW: Send heartbeats
- `server/services/tenant-monitor.service.js` — NEW: Receive + alert on missing

### 5.5 Tenant Domain & SSL Management

**What:** Each tenant can have `hospital.mediqzy.com` or their own domain `emr.apollohospitals.com`.

**How:**
- Subdomain: Auto-configured via wildcard DNS (*.mediqzy.com) + dynamic Nginx config
- Custom domain: Tenant adds CNAME record → super admin verifies → provisions Let's Encrypt cert
- Nginx config generated dynamically per tenant:
  ```nginx
  server {
      server_name hospital.mediqzy.com emr.apollohospitals.com;
      
      # For shared tenants: proxy to main app with X-Tenant-ID header
      location / {
          proxy_pass http://localhost:8888;
          proxy_set_header X-Tenant-ID tenant_slug;
      }
      
      # For dedicated tenants: proxy to tenant's own server
      location / {
          proxy_pass http://localhost:PORT;
      }
  }
  ```

**Files:**
- `server/services/tenant-domain.service.js` — NEW: Nginx config generation, SSL provisioning
- `scripts/provision-tenant-nginx.sh` — NEW: Script to apply Nginx config

### 5.6 Per-Tenant AI Configuration

**What:** Each tenant can have custom AI settings (different models, confidence thresholds, rate limits, SIB policies).

**How:**
- `ai_config` JSONB in tenant record:
  ```json
  {
    "llmCascade": {
      "text": ["isha", "groq"],
      "vision": ["anthropic"],
      "stt": ["groq"]
    },
    "sibPolicy": {
      "rateLimits": { "AI_QUERY": 500, "AI_PRESCRIPTION": 100 },
      "confidenceThresholds": { "AI_DIAGNOSIS": 0.85, "AI_EMERGENCY": 0.95 },
      "requireApproval": ["AI_PRESCRIPTION"],
      "quietHours": { "start": "22:00", "end": "07:00" }
    },
    "allowedModels": ["llama-3.3-70b", "bimedix2-8b"],
    "maxAICallsPerMonth": 10000,
    "customPrompts": {}
  }
  ```
- SIB Control Layer reads tenant config from request context
- `multitenancy.middleware.js` attaches `req.tenant.ai_config` — SIB uses it

**Files to modify:**
- `server/middleware/multitenancy.middleware.js` — Load full tenant config from DB
- `server/services/sib-control-layer.service.js` — Accept tenant-specific policies

### 5.7 Per-Tenant Billing & Metering

**What:** Track usage per tenant for billing.

**Metrics tracked:**
- API calls (total, by endpoint category)
- AI calls (LLM queries, vision, transcription)
- Storage (DB size, files, embeddings)
- Active users (DAU, MAU)
- Seats (licensed doctors, staff)

**How:**
- Middleware increments counters in Redis: `tenant:{id}:api_calls:YYYY-MM-DD`
- Hourly aggregation cron → writes to `tenant_usage` table
- Monthly invoice generation
- Usage-based billing tiers: Free (100 AI calls) → Pro (5000) → Enterprise (unlimited)

**New files:**
- `server/middleware/tenant-metering.middleware.js` — NEW: Count API/AI calls
- `server/services/tenant-billing.service.js` — NEW: Aggregation + invoicing
- SQL: `tenant_usage` table, `tenant_invoices` table

---

## Implementation Order

```
Week 1-2:  Phase 1 (SIB unification + KB completion)
Week 3-4:  Phase 2 (Botlet router + task proxy + learning loop)
Week 5-6:  Phase 3 (Inline CDSS + AI scribe + proactive alerts)
Week 7-8:  Phase 4 (FHIR R4 + ABDM + WhatsApp pre-visit)
Week 9-12: Phase 5 (AWS-model multi-tenancy)
```

Each phase is independently deployable. Later phases build on earlier ones but don't break existing functionality.

---

## Current State Checkpoint

| Component | Status | Details |
|---|---|---|
| `llm-provider.js` | ✅ Working | iSHA → Groq → OpenAI cascade, vision, STT |
| `sib-control-layer.service.js` | ✅ Built, ❌ Not wired | Safety layer exists but only via `/api/sib/decide` |
| `botletRouter.js` | ❌ Pseudocode only | Complete algorithm but no implementation |
| `sib-task-proxy.js` | ✅ Built, ❌ Not imported | 20 task types ready but unused |
| `orchestrator.js` | ✅ Working | 8-iteration agentic loop, 15+ tools |
| SIB FastAPI (`brain.py`) | ✅ Running | Port 8001, own LLM cascade |
| `multitenancy.middleware.js` | ⚠️ Scaffolded | Returns default config, not from DB |
| `tenant.model.postgres.js` | ⚠️ Basic | Has slug/subdomain but no infra config |
| Kafka | ❌ Stubbed | All publishers go to no-op |
| ICD-10/SNOMED/CPT | ✅ Working | 72K + 321K + 40 codes, validated search |
| CDSS enrichment | ✅ Working | Validated ICD-10 + auto-mapped SNOMED |
| KB embeddings | ⚠️ Partial | 6,192/10,000 medical QA ingested |
| PM2 systemd | ✅ Done | Auto-restart on boot |
