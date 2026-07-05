# Mediqzy HealthOS — All Phases Implementation

| Field | Value |
|-------|-------|
| **Brand** | Mediqzy - HealthOS |
| **API** | `/api/v3/healthos` (alias: `/api/v3/careos`) |
| **Status** | Stages 1–4 implemented |

## Migrations (run in order)

```bash
node server/migrations/careos-phase1.migration.js
node server/migrations/careos-ecosystem.migration.js
node server/migrations/healthos-phases-2-4.migration.js
```

## Stage 1 — Land

| Module | API |
|--------|-----|
| Living Patient Workspace | `GET /workspace/:patientId` |
| Clinical Timeline | `GET/POST /timeline/:patientId` |
| Dynamic Care Teams | `GET/POST /teams/:patientId` |
| AI Coordinator | `GET/POST /coordinator/:patientId` |
| Treatment Pathway | `GET/PUT /pathway/:patientId` |
| Instant MDT | `POST /mdt/start` |
| Clinical Playback | `GET /playback/:patientId` |
| Hospital Memory | `GET /memory/similar/:patientId` |
| Family Portal | `GET/POST /family/:patientId/updates` |
| Tasks | `GET/POST /tasks/:patientId` |
| One-touch Video | `POST /call/:patientId/token` |

## Stage 2 — Expand

| Module | API |
|--------|-----|
| Lab Connector | `GET/POST /expand/labs/:patientId` |
| Pharmacy | `GET/POST /expand/pharmacy/:patientId` |
| Home Care | `GET/POST /expand/homecare/:patientId` |
| Wearables | `GET/POST /expand/monitoring/:patientId` |
| Medical Passport | `GET/PUT /ecosystem/passport/:patientId` |
| Care Identity | `GET /ecosystem/identity/me` |
| Care Graph | `GET /ecosystem/graph/:patientId` |

## Stage 3 — Network

| Module | API |
|--------|-----|
| Federation | `GET /ecosystem/federation/status` |
| Referrals | `GET/POST /network/referrals` |
| Document Exchange | `GET/POST /network/documents` |
| Global Clinical Board | `POST /ecosystem/global-board/start` |
| AI Translation | `POST /ecosystem/translate` |
| Global Knowledge | `GET /network/knowledge/search` |
| Network Signals | `GET/POST /network/signals` |

## Stage 4 — Platform

| Module | API |
|--------|-----|
| Marketplace | `GET /platform/marketplace` |
| Developer API Keys | `GET/POST /platform/developer/keys` |
| Webhooks | `GET/POST /platform/developer/webhooks` |
| Research / Trials | `GET /platform/research/trials` |
| Trial Matching | `GET /platform/research/match/:patientId` |
| Population Analytics | `GET /platform/analytics/population` |
| Care Government | `GET /platform/government/dashboard` |
| Emergency Network | `GET /platform/emergency/summary` |
| Platform Status | `GET /platform/status` |

## UI Routes

| Screen | Path |
|--------|------|
| HealthOS Platform | `/hmis/healthos` |
| Living Patient Workspace | `/hmis/patient/:id/healthos` |

## Services map

```
server/services/careos/
├── Stage 1: clinical-timeline, care-team, clinical-coordinator, treatment-pathway,
│            mdt-board, clinical-playback, hospital-memory, family-portal,
│            task-management, one-touch-call, living-patient-workspace
├── Stage 2: lab-connector, pharmacy-connector, home-care, wearables-monitoring,
│            medical-passport, care-identity, care-graph
├── Stage 3: care-federation, global-collaboration, referral-federation,
│            document-exchange, global-knowledge, hospital-network-signals
└── Stage 4: marketplace, developer-platform, research-platform,
             government-health, emergency-network, population-analytics,
             platform-status
```
