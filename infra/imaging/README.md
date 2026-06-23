# MediQzy RIS/PACS — Orthanc + OHIF (separate services)

OHIF and Orthanc are **not** compiled into the MediQzy React app. They run as independent Docker services behind nginx.

## Architecture

```
CT/MRI/X-ray ──C-STORE :4242──► Orthanc PACS
                                    │
                         /pacs/dicom-web (nginx + session cookie)
                                    │
OHIF Viewer ◄── /ohif/* ────────────┘

MediQzy Node API:
  POST /api/imaging/session     → HttpOnly pacs_session cookie
  POST /api/lab/ris/upload      → STOW-RS to Orthanc + real UIDs in ris_studies
  Reports, worklist, tenancy    → MediQzy Postgres
```

## Quick start (local)

```bash
cd infra/imaging
docker compose -f compose.yml up -d

# OHIF:  http://localhost:8088/ohif/
# Proxy: http://localhost:8088/pacs/  (needs PACS session from MediQzy)
# DICOM: localhost:4242  AE Title MEDIQZY
```

## Production nginx (on mediqzy.com)

Add to your main nginx / ALB:

| Path | Target | Auth |
|------|--------|------|
| `/ohif/*` | OHIF container | Public (study UIDs opaque) |
| `/pacs/*` | Orthanc :8042 | `auth_request` → `/api/imaging/session/validate` |

Port **4242** only on the hospital modality VLAN.

## MediQzy integration

1. Doctor/lab calls `POST /api/imaging/session` → sets `pacs_session` cookie
2. Launch viewer: `window.open('/ohif/viewer?StudyInstanceUIDs=' + uid)`
3. DICOM uploads via Lab RIS → Orthanc STOW-RS → store real UIDs

## Environment

```env
ORTHANC_URL=http://orthanc:8042
ORTHANC_USER=pacs
ORTHANC_PASSWORD=change-this-password
```

## Multi-tenant

Deploy **one Orthanc instance per hospital tenant**. MediQzy handles tenancy in `ris_studies`; Orthanc is not a multi-tenant isolation boundary.

## AI reporting phases A–D

| Phase | Capability | API |
|-------|------------|-----|
| A | AI draft report, Whisper dictation, quality gates, interpretability | `POST /reports/draft`, `/interpretation/:studyId` |
| B | Prior comparison, critical alerts, STAT queue, workflow on finalize | `/priors/*`, `/alerts/critical` |
| C | Structured findings (`/analyze`), measurements, OHIF bridge | `/measurements/from-viewer` |
| D | Longitudinal timeline, lesion tracking, analytics, VNA lifecycle | `/longitudinal/*`, `/vna/lifecycle/run` |

Doctor referred studies can use platform APIs via `assertStudyAccess` (referring physician).

OHIF measurement bridge: `listenOhifMeasurements()` in `client/src/utils/imagingViewer.ts`.

SaMD: all AI outputs are advisory — radiologist sign-off required.

## Platform phases (1–4)

| Phase | Capability | API / service |
|-------|------------|---------------|
| 1 | Batch DICOM upload, MWL, report templates, metrics | `POST /api/lab/ris/upload-series`, `/api/imaging/platform/mwl`, `/templates` |
| 2 | Kafka workflow, collaboration SSE, OpenSearch search | `/api/imaging/platform/workflow/*`, `/collab/*`, `/search` |
| 3 | AI triage microservice (physician review required) | `IMAGING_TRIAGE_URL`, `/api/imaging/platform/triage/*` |
| 4 | VNA lifecycle, OHIF hanging protocols, full compose | `/api/imaging/platform/vna/*`, `compose.full.yml` |

### Full stack (optional)

```bash
cd infra/imaging
docker compose -f compose.yml -f compose.full.yml up -d
```

Includes Kafka, Redis, OpenSearch, MinIO, Keycloak, Temporal, Prometheus, Grafana, imaging-triage.

### Environment (platform)

```env
IMAGING_TRIAGE_URL=http://127.0.0.1:8010
OPENSEARCH_URL=http://127.0.0.1:9200
KAFKA_ENABLED=true
KAFKA_BROKERS=localhost:9092
KEYCLOAK_ENABLED=false
KEYCLOAK_REALM_URL=https://keycloak.example/realms/mediczy
VITE_OHIF_BASE_PATH=/ohif
```

See also: `docs/imaging/IMAGING_STACK_DEPLOYMENT.md`
