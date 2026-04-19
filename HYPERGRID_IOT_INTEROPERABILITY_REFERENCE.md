# HyperGrid — IoT & Interoperability Reference Guide

> **Codebase:** `/home/ubuntu/Mediczy`  
> **Base API prefix:** `/api/hypergrid/`  
> **Last updated:** April 19, 2026

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Environment Variables](#2-environment-variables)
3. [Database Tables](#3-database-tables)
4. [Layer 1 — IoT Device Fabric (MQTT)](#4-layer-1--iot-device-fabric-mqtt)
5. [Layer 2 — Edge Gateway Management](#5-layer-2--edge-gateway-management)
6. [Layer 3 — Canonical Event Bus](#6-layer-3--canonical-event-bus)
7. [Layer 4 — Semantic Terminology Engine](#7-layer-4--semantic-terminology-engine)
8. [Layer 5 — Digital Twins](#8-layer-5--digital-twins)
9. [Layer 6 — DICOMweb Imaging](#9-layer-6--dicomweb-imaging)
10. [Layer 7 — SMART on FHIR App Platform](#10-layer-7--smart-on-fhir-app-platform)
11. [Layer 8 — Connector Factory](#11-layer-8--connector-factory)
12. [Layer 9 — App Marketplace & Network](#12-layer-9--app-marketplace--network)
13. [Startup Sequence](#13-startup-sequence)
14. [Migration Reference](#14-migration-reference)
15. [Adding a New Integration](#15-adding-a-new-integration)

---

## 1. Architecture Overview

```
┌────────────────────────────────────────────────────────────────┐
│                    HYPERGRID PLATFORM                          │
│                                                                │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────────┐   │
│  │ IoT/MQTT │  │ Edge Gateway │  │   Canonical Event Bus  │   │
│  │  :1883   │──│  Fleet Mgmt  │──│   Redis + Kafka        │   │
│  └──────────┘  └──────────────┘  └───────────┬───────────┘   │
│                                               │                │
│  ┌──────────┐  ┌──────────────┐  ┌───────────▼───────────┐   │
│  │ Terminology│  │ Digital Twins│  │   DICOMweb (PACS)     │   │
│  │ SNOMED/  │  │ Patient/Device│  │  STOW/WADO/QIDO       │   │
│  │ LOINC/ICD│  │ /Asset/Hosp. │  └───────────────────────┘   │
│  └──────────┘  └──────────────┘                               │
│                                                                │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────────┐   │
│  │SMART/FHIR│  │  Connector   │  │  App Marketplace &    │   │
│  │ OAuth2   │  │  Factory     │  │  Network Layer         │   │
│  └──────────┘  └──────────────┘  └───────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
```

### File map

| Component | Service file | Route file | Mount path |
|---|---|---|---|
| MQTT broker | `services/hypergrid-mqtt.service.js` | `routes/hypergrid-mqtt.route.js` | `/api/hypergrid/mqtt` |
| Event bus | `services/hypergrid-event-bus.service.js` | `routes/hypergrid-events.route.js` | `/api/hypergrid/events` |
| Terminology | `services/hypergrid-terminology.service.js` | `routes/hypergrid-terminology.route.js` | `/api/hypergrid/terminology` |
| Digital twins | `services/hypergrid-twins.service.js` | `routes/hypergrid-twins.route.js` | `/api/hypergrid/twins` |
| DICOM | _(route-level)_ | `routes/hypergrid-dicom.route.js` | `/api/hypergrid/dicom` |
| SMART on FHIR | _(route-level)_ | `routes/hypergrid-smart-fhir.route.js` | `/api/hypergrid/smart` |
| Connector factory | _(route-level)_ | `routes/hypergrid-connector.route.js` | `/api/hypergrid/connectors` |
| Edge gateways | _(route-level)_ | `routes/hypergrid-edge.route.js` | `/api/hypergrid/edge` |
| Marketplace | _(route-level)_ | `routes/hypergrid-marketplace.route.js` | `/api/hypergrid/marketplace` |

---

## 2. Environment Variables

Add these to `server/.env` to configure each subsystem:

```dotenv
# ── MQTT Broker ──────────────────────────────────────────────
MQTT_TCP_PORT=1883           # Standard MQTT (default 1883)
MQTT_BROKER_URL=mqtt://localhost:1883  # Used by edge gateways
DISABLE_MQTT=false           # Set true to skip broker startup

# ── Event Bus ────────────────────────────────────────────────
REDIS_URL=redis://localhost:6379
KAFKA_BROKERS=localhost:9092  # Comma-separated; falls back to Redis-only

# ── Terminology cache ─────────────────────────────────────────
TERMINOLOGY_CACHE_TTL=3600   # Redis TTL in seconds (default 1 hour)

# ── DICOM image storage ───────────────────────────────────────
DICOM_STORE_PATH=/var/mediczy/dicom-store   # File system path for DICOM files

# ── SMART on FHIR ─────────────────────────────────────────────
SMART_JWT_SECRET=<strong-secret>  # Falls back to JWT_SECRET if unset
SMART_TOKEN_TTL=3600         # Access token lifetime in seconds
APP_BASE_URL=https://app.mediqzy.com  # Used in discovery metadata

# ── Edge Gateway ─────────────────────────────────────────────
EDGE_HEARTBEAT_GRACE=300     # Seconds before a gateway is marked offline
```

---

## 3. Database Tables

Migration file: `server/db/migrations/011-hypergrid-platform.sql`

Run command:
```bash
PGPASSWORD=Mediczy2024Helper psql -h 127.0.0.1 -U mediczy_helper -d mediczy_ai \
  -f server/db/migrations/011-hypergrid-platform.sql
```

| Table | Purpose |
|---|---|
| `hg_devices` | MQTT device registry (credentials, type, gateway link) |
| `hg_device_readings` | Raw device telemetry time-series |
| `hg_edge_gateways` | Edge gateway fleet (config, heartbeat, sync state) |
| `hg_event_store` | Durable canonical event log |
| `hg_code_map` | Tenant custom code → canonical mappings |
| `hg_terminology` | Built-in SNOMED/LOINC/ICD10/RxNorm catalogue |
| `hg_digital_twins` | Twin entities (JSONB attributes) |
| `hg_twin_observations` | Twin observation timeline |
| `hg_dicom_studies` | DICOM study records |
| `hg_dicom_instances` | DICOM SOP instance file references |
| `hg_dicom_reports` | Structured radiology reports |
| `hg_dicom_worklist` | Modality worklist |
| `hg_smart_apps` | SMART app registrations |
| `hg_smart_auth_codes` | OAuth2 authorization codes (short-lived) |
| `hg_smart_tokens` | Issued access/refresh tokens |
| `hg_connectors` | Integration connector instances |
| `hg_field_mappings` | Source field → canonical field mappings |
| `hg_marketplace_apps` | Marketplace app catalogue |
| `hg_app_installs` | Tenant app installations |
| `hg_app_ratings` | App ratings and reviews |
| `hg_network_participants` | Network participant registry |
| `hg_benchmarks` | Anonymised performance benchmarks |

---

## 4. Layer 1 — IoT Device Fabric (MQTT)

### Service: `hypergrid-mqtt.service.js`

**Functions:**

| Function | Description |
|---|---|
| `startMqttBroker()` | Starts Aedes MQTT broker on TCP port 1883. Called at app startup. |
| `stopMqttBroker()` | Gracefully shuts down broker and Redis publisher. |
| `getMqttBroker()` | Returns the live Aedes instance. |
| `getMqttStats()` | Returns `{ connectedClients, closed }`. |

**Authentication:** Devices connect with `username = device_key`, `password = api_secret` (validated against `hg_devices`).

**Topic convention:**

```
hg/device/{gatewayId}/{deviceId}/vitals       → VitalsObserved event
hg/device/{gatewayId}/{deviceId}/alert        → DeviceAlertRaised event
hg/device/{gatewayId}/{deviceId}/telemetry    → TelemetryReceived event
hg/gateway/{gatewayId}/status                 → GatewayStatusUpdate event
hg/asset/{gatewayId}/{assetId}/location       → AssetLocationUpdate event
```

Every published MQTT message is:
1. Normalised into a canonical event
2. Forwarded to Redis channel `hg:events`
3. Persisted to `hg_device_readings`

### API: `GET/POST /api/hypergrid/mqtt/...`

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/devices` | admin/hospital | Register device, returns one-time credentials |
| `GET` | `/devices` | any | List devices (filter: `type`, `gatewayId`) |
| `GET` | `/devices/:id` | any | Device detail |
| `PUT` | `/devices/:id` | admin/hospital | Update device metadata |
| `DELETE` | `/devices/:id` | admin/hospital | Deactivate device |
| `POST` | `/devices/:id/rotate-key` | admin/hospital | Rotate API secret |
| `GET` | `/broker/stats` | admin | Live Aedes stats |
| `GET` | `/readings` | any | Recent readings (filter: `deviceId`, `type`, `limit`) |

**Register device example:**
```json
POST /api/hypergrid/mqtt/devices
{
  "name": "Bedside SpO2 Monitor #3",
  "deviceType": "spo2",
  "gatewayId": "gw-ward-4b",
  "location": "Ward 4B Bed 3",
  "metadata": { "manufacturer": "Masimo", "model": "SET" }
}
```
Response includes `deviceKey` and `apiSecret` (shown once).

---

## 5. Layer 2 — Edge Gateway Management

### API: `/api/hypergrid/edge/...`

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/gateways` | admin/hospital | Register gateway, returns credentials |
| `GET` | `/gateways` | any | List gateways (filter: `status`, `facilityId`) |
| `GET` | `/gateways/:id` | any | Gateway detail + config |
| `PATCH` | `/gateways/:id` | admin/hospital | Update metadata |
| `DELETE` | `/gateways/:id` | admin | Decommission |
| `POST` | `/gateways/:id/heartbeat` | gateway-key header | Heartbeat (device→cloud, no user auth) |
| `GET` | `/gateways/:id/config` | gateway-key header | Pull config (polled by edge agent) |
| `PUT` | `/gateways/:id/config` | admin/hospital | Push new config |
| `POST` | `/gateways/:id/sync` | gateway-key header | Bulk offline sync upload |
| `GET` | `/fleet/status` | admin | Fleet-wide health summary |

**Gateway authentication:** Use `x-gateway-key` header (not JWT) for heartbeat, config-pull, and sync endpoints. This allows edge agents to authenticate without a user session.

**Config push example:**
```json
PUT /api/hypergrid/edge/gateways/42/config
{
  "config": {
    "heartbeatIntervalS": 30,
    "syncIntervalS": 15,
    "logLevel": "debug",
    "adapters": ["hl7v2", "iot-mqtt"]
  }
}
```

**Offline sync payload:**
```json
POST /api/hypergrid/edge/gateways/42/sync
Headers: x-gateway-key: <key>
{
  "readings": [
    { "deviceId": "dev-001", "readingType": "heart_rate", "value": 72, "unit": "bpm", "timestamp": "2026-04-19T10:00:00Z" }
  ],
  "events": [
    { "eventType": "VitalsObserved", "payload": { ... } }
  ]
}
```

---

## 6. Layer 3 — Canonical Event Bus

### Service: `hypergrid-event-bus.service.js`

**Functions:**

| Function | Signature | Description |
|---|---|---|
| `initEventBus()` | `async () => void` | Connect Redis + Kafka. Call at startup. |
| `publishEvent(event)` | `async (event: object) => void` | Publish to Redis + Kafka + local listeners |
| `onEvent(type, handler)` | `(type: string, fn) => void` | Subscribe to event type. Use `'*'` for all. |
| `closeEventBus()` | `async () => void` | Graceful shutdown |
| `getEventBusStatus()` | `() => object` | Returns Redis/Kafka connection state |

**Canonical event schema:**
```js
{
  eventType:    'VitalsObserved',      // required
  source:       'mqtt',                // required
  tenantId:     123,                   // optional
  patientId:    456,                   // optional
  resourceId:   'device-001',          // optional
  resourceType: 'Device',              // optional
  payload:      { heartRate: 72 },     // required
  correlationId: 'uuid',               // optional
}
```

**Redis channel:** `hg:events`  
**Kafka topic:** `hg.health.events`

### API: `/api/hypergrid/events/...`

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/` | any | Publish canonical event |
| `GET` | `/` | any | Query events (filter: `type`, `patientId`, `from`, `to`) |
| `GET` | `/types` | any | Event type counts |
| `GET` | `/bus/status` | admin | Redis/Kafka health |
| `POST` | `/replay` | admin | Replay events from time range |

**Subscribe from another service:**
```js
import { onEvent } from './services/hypergrid-event-bus.service.js';

onEvent('VitalsObserved', async (event) => {
  // event.payload has the vitals data
  await updatePatientVitals(event.patientId, event.payload);
});
```

---

## 7. Layer 4 — Semantic Terminology Engine

### Service: `hypergrid-terminology.service.js`

**Functions:**

| Function | Signature | Description |
|---|---|---|
| `initTerminologyService()` | `async () => void` | Warm Redis cache from DB. Call at startup. |
| `resolveConcept(code, system?)` | `async (string, string?) => object\|null` | Resolve a code to canonical concept |
| `batchResolve(codes, system?)` | `async (array, string?) => array` | Resolve up to 500 codes in one call |
| `registerLocalCode(opts)` | `async (object) => object` | Register tenant-specific code mapping |
| `seedTerminology(rows)` | `async (array) => void` | Bulk-insert terminology rows (ETL use) |

**Resolution pipeline:**
```
Input code
    │
    ▼
Redis cache (TTL 1h)
    │ miss
    ▼
Exact lookup → hg_code_map (tenant codes first, then global)
    │ miss
    ▼
Fuzzy pg_trgm search → hg_terminology
    │ miss
    ▼
Returns null
```

**Supported systems:**

| ID | Standard | Covers |
|---|---|---|
| `snomed` | SNOMED CT | Clinical concepts, findings, procedures |
| `loinc` | LOINC | Lab observations, vitals |
| `icd10` | ICD-10 | Diagnoses |
| `icd11` | ICD-11 | Diagnoses (newer) |
| `rxnorm` | RxNorm | Medications |
| `cpt` | CPT | Procedures/billing |
| `ndc` | NDC | Drug products |
| `local` | Tenant-defined | Custom facility codes |

### API: `/api/hypergrid/terminology/...`

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/resolve` | any | Resolve single code |
| `POST` | `/resolve/batch` | any | Resolve up to 500 codes |
| `POST` | `/codes` | admin/hospital | Register local code mapping |
| `GET` | `/codes` | any | List tenant custom mappings |
| `DELETE` | `/codes/:id` | admin/hospital | Remove custom mapping |
| `GET` | `/systems` | public | List supported code systems |
| `GET` | `/search?q=` | any | Fuzzy search catalogue |

**Resolve example:**
```json
POST /api/hypergrid/terminology/resolve
{ "code": "8867-4", "system": "loinc" }

// Response:
{
  "code": "8867-4",
  "system": "loinc",
  "display": "Heart rate",
  "snomedCode": "364075005"
}
```

---

## 8. Layer 5 — Digital Twins

### Service: `hypergrid-twins.service.js`

**Functions:**

| Function | Signature | Description |
|---|---|---|
| `upsertTwin(opts)` | `async ({ twinType, externalId, tenantId, attributes, location }) => twin` | Create or update twin |
| `getTwin(type, externalId, tenantId)` | `async () => twin\|null` | Fetch single twin |
| `listTwins(opts)` | `async ({ twinType, tenantId, limit, offset }) => twin[]` | List twins with filter |
| `pushObservation(opts)` | `async ({ twinType, externalId, tenantId, observationType, value, unit, metadata }) => void` | Add observation to timeline |
| `computeRisk(type, externalId, tenantId)` | `async () => { score, level, factors }` | Run risk scoring rules |
| `getTwinTimeline(opts)` | `async ({ twinType, externalId, tenantId, from, to, limit }) => observation[]` | Fetch observation history |

**Twin types:** `device` | `patient` | `asset` | `hospital` | `claim` | `ambulance`

**Risk levels:** `low` | `moderate` | `high` | `critical`

### API: `/api/hypergrid/twins/...`

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/` | any | Create/upsert twin |
| `GET` | `/` | any | List twins (filter: `type`, `limit`, `page`) |
| `GET` | `/summary` | admin | Network-wide risk summary |
| `GET` | `/:type/:externalId` | any | Get twin |
| `PATCH` | `/:type/:externalId` | any | Update attributes |
| `DELETE` | `/:type/:externalId` | admin/hospital | Delete twin |
| `POST` | `/:type/:externalId/observations` | any | Push observation |
| `GET` | `/:type/:externalId/timeline` | any | Observation history |
| `GET` | `/:type/:externalId/risk` | any | Compute risk score |

**Create patient twin example:**
```json
POST /api/hypergrid/twins
{
  "twinType": "patient",
  "externalId": "patient-12345",
  "attributes": {
    "age": 68,
    "diagnoses": ["I10", "E11"],
    "medications": ["metformin", "amlodipine"],
    "lastVitals": { "heartRate": 84, "spo2": 96 }
  }
}
```

---

## 9. Layer 6 — DICOMweb Imaging

### API: `/api/hypergrid/dicom/...`

Implements the three DICOMweb services: STOW-RS (store), WADO-RS (retrieve), QIDO-RS (query).

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/studies` | any | **STOW-RS** — upload DICOM files (`multipart/form-data`, field: `files`) |
| `GET` | `/studies` | any | **QIDO-RS** — query studies (filter: `patientId`, `patientName`, `modality`, `studyDate`, `accessionNumber`) |
| `GET` | `/studies/:studyUID` | any | **WADO-RS** — retrieve study metadata + instance list |
| `GET` | `/studies/:studyUID/instances/:sopUID/file` | any | Serve raw DICOM file |
| `GET` | `/worklist` | any | Query modality worklist |
| `POST` | `/worklist` | admin/hospital/doctor | Add worklist item |
| `POST` | `/studies/:studyUID/report` | admin/hospital/doctor | Attach structured report |

**STOW-RS upload example (curl):**
```bash
curl -X POST /api/hypergrid/dicom/studies \
  -H "Authorization: Bearer <token>" \
  -F "files=@chest_ct.dcm" \
  -F "files=@chest_ct_series2.dcm"
```

**File storage:** Files are saved to `$DICOM_STORE_PATH/{studyUID}/{sopUID}.dcm`.  
On store, a `ImagingStudyStored` event is published to the event bus.

---

## 10. Layer 7 — SMART on FHIR App Platform

### API: `/api/hypergrid/smart/...`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/.well-known/smart-configuration` | public | SMART discovery document |
| `POST` | `/apps` | any | Dynamic client registration |
| `GET` | `/apps` | admin | List registered apps |
| `GET` | `/apps/:clientId` | admin | App detail |
| `DELETE` | `/apps/:clientId` | admin | Revoke app |
| `POST` | `/authorize` | user | Issue auth code (PKCE supported) |
| `POST` | `/token` | — | Exchange code for access token |
| `POST` | `/token/introspect` | — | Validate token |
| `GET` | `/launch` | user | EHR launch context |

**Supported scopes:**
```
openid  fhirUser  profile  launch  launch/patient
patient/*.read  patient/Patient.read  patient/Observation.read
patient/Condition.read  patient/MedicationRequest.read
patient/Encounter.read  patient/AllergyIntolerance.read
patient/DiagnosticReport.read
user/*.read  offline_access
```

**PKCE flow (recommended):**
```
1. App generates code_verifier (random 43-128 chars)
2. App computes code_challenge = BASE64URL(SHA256(code_verifier))
3. POST /authorize  { ..., code_challenge, code_challenge_method: "S256" }
4. POST /token      { ..., code_verifier }   ← server verifies
```

---

## 11. Layer 8 — Connector Factory

### API: `/api/hypergrid/connectors/...`

#### Built-in adapter templates

| Template ID | Category | Protocols |
|---|---|---|
| `his-hl7v2` | HIS | HL7 v2 ADT/ORU/ORM |
| `lis-fhir` | LIS | FHIR R4 |
| `pacs-dicomweb` | RIS/PACS | DICOMweb |
| `tpa-rest` | TPA | REST/HTTPS |
| `iot-mqtt` | IoT | MQTT |
| `rfid-rtls` | Asset | MQTT + REST |
| `pharmacy-rest` | Pharmacy | REST/HTTPS |
| `ambulance-gps` | Ambulance | MQTT + REST |

#### Built-in hospital packs

| Pack ID | Includes |
|---|---|
| `nabh-general` | HIS + LIS + PACS + TPA |
| `apollo-chain` | HIS + LIS + PACS + TPA + IoT |
| `oncology` | HIS + LIS + PACS |
| `maternity` | HIS + LIS + IoT |
| `insurer-tpa` | TPA |
| `ambulance` | GPS + IoT |
| `rural-clinic` | HIS only |

#### Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/templates` | any | List adapter templates (filter: `category`) |
| `GET` | `/templates/:id` | any | Template detail |
| `GET` | `/packs` | any | List hospital packs |
| `POST` | `/packs` | admin/hospital | Apply a pack (creates connector stubs) |
| `POST` | `/mappings` | admin/hospital | Create field mapping |
| `GET` | `/mappings` | any | List tenant mappings |
| `PUT` | `/mappings/:id` | admin/hospital | Update mapping |
| `DELETE` | `/mappings/:id` | admin/hospital | Remove mapping |
| `POST` | `/mappings/test` | any | Test mapping against sample value |
| `POST` | `/connectors` | admin/hospital | Register connector |
| `GET` | `/connectors` | any | List connectors |
| `PATCH` | `/connectors/:id/status` | admin/hospital | Set status (draft→configured→certified→active) |
| `POST` | `/certify` | admin/hospital | Run 5-point certification harness |

**Transform types for field mappings:**

| Type | Behaviour |
|---|---|
| `passthrough` | Copy value as-is |
| `rename` | Copy with a different field name |
| `unit_convert` | Convert measurement units |
| `terminology` | Resolve code via terminology engine |
| `expression` | Custom transform expression |

**Connector lifecycle:**
```
draft → configured → certified → active
                              ↘ disabled
```

---

## 12. Layer 9 — App Marketplace & Network

### API: `/api/hypergrid/marketplace/...`

#### Apps

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/apps` | any | Submit app for review |
| `GET` | `/apps` | public | Browse approved apps (filter: `category`, `search`) |
| `GET` | `/apps/:id` | public | App detail + recent ratings |
| `POST` | `/apps/:id/review` | admin | Approve or reject app |
| `POST` | `/apps/:id/install` | any | Install app for tenant |
| `DELETE` | `/apps/:id/install` | any | Uninstall app |
| `POST` | `/apps/:id/rate` | any | Submit rating (1–5) |

**App categories:**
`Clinical Decision Support` | `Revenue Cycle` | `Patient Engagement` | `Analytics` | `IoT / Device` | `AI Diagnostics` | `Pharmacy` | `Insurance` | `Scheduling` | `Telemedicine` | `Supply Chain` | `Education` | `Other`

#### Network

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/network/participants` | admin | Register participant |
| `GET` | `/network/participants` | any | List (filter: `type`, `city`) |
| `GET` | `/network/stats` | admin | Network health counters |

**Participant types:** `hospital` | `lab` | `insurer` | `tpa` | `pharmacy` | `ambulance` | `clinic`

#### Benchmarks

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/benchmarks` | any | Submit anonymised metric |
| `GET` | `/benchmarks?metricType=` | any | P25/P50/P75/P90 percentiles |

**Developer portal:**

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/developer/stats` | any | Apps submitted, approved, installs, avg rating |

---

## 13. Startup Sequence

These calls happen automatically in `app.js` at server boot:

```js
// Non-blocking — server starts even if these fail
initEventBus()           // Redis + Kafka connections
initTerminologyService() // Warm terminology cache
startMqttBroker()        // TCP MQTT on :1883 (skipped if DISABLE_MQTT=true)
```

All three degrade gracefully: if Redis/Kafka/MQTT are unavailable the rest of the application continues working — HyperGrid features return errors but do not crash the main server.

---

## 14. Migration Reference

```bash
# Apply HyperGrid tables (idempotent — safe to re-run)
PGPASSWORD=Mediczy2024Helper psql \
  -h 127.0.0.1 -U mediczy_helper -d mediczy_ai \
  -f server/db/migrations/011-hypergrid-platform.sql

# Verify tables were created
PGPASSWORD=Mediczy2024Helper psql \
  -h 127.0.0.1 -U mediczy_helper -d mediczy_ai \
  -c "\dt hg_*"
```

---

## 15. Adding a New Integration

### Adding a new IoT device type

1. Register the device via `POST /api/hypergrid/mqtt/devices` with `deviceType: "your-device"`.
2. Program the device to publish to `hg/device/{gatewayId}/{deviceId}/vitals` with JSON payload.
3. Optionally add a custom topic pattern in `hypergrid-mqtt.service.js` `TOPIC_PATTERNS` array.
4. Optionally map the device's proprietary codes via `POST /api/hypergrid/terminology/codes`.

### Adding a new hospital system connector

1. Choose the closest template: `GET /api/hypergrid/connectors/templates`
2. Register a connector: `POST /api/hypergrid/connectors/connectors`
3. Create field mappings: `POST /api/hypergrid/connectors/mappings`
4. Test mappings: `POST /api/hypergrid/connectors/mappings/test`
5. Certify: `POST /api/hypergrid/connectors/certify`
6. Activate: `PATCH /api/hypergrid/connectors/connectors/:id/status` → `{ "status": "active" }`

Or apply a hospital pack to create all connectors at once:
```json
POST /api/hypergrid/connectors/packs
{ "packId": "nabh-general" }
```

### Publishing a custom canonical event

```js
import { publishEvent } from './services/hypergrid-event-bus.service.js';

await publishEvent({
  eventType:   'ClaimPreAuthSubmitted',
  source:      'tpa-connector',
  tenantId:    req.user.tenantId,
  patientId:   claim.patientId,
  resourceId:  claim.id,
  resourceType:'Claim',
  payload:     { claimId: claim.id, amount: claim.amount, tpaCode: 'HDFC' },
});
```

### Subscribing to events in any service

```js
import { onEvent } from './services/hypergrid-event-bus.service.js';

// Subscribe to a specific type
onEvent('VitalsObserved', async (event) => {
  await updatePatientTwin(event.patientId, event.payload);
});

// Subscribe to all events
onEvent('*', async (event) => {
  console.log('[audit]', event.eventType, event.resourceId);
});
```

### Adding a twin risk rule

Open `services/hypergrid-twins.service.js`, locate the `computeRisk()` function, and add a case to the `switch (twinType)` block:

```js
case 'your_type': {
  const attrs = twin.attributes;
  if (attrs.someMetric > threshold) {
    factors.push('Metric exceeds safe threshold');
    score += 30;
  }
  break;
}
```
