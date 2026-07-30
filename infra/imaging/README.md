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
cp .env.example .env   # set ORTHANC_PASSWORD, ORTHANC_REGISTERED_USERS, ORTHANC_BASIC_AUTH
docker compose -f compose.yml up -d

# OHIF:  http://localhost:8088/ohif/
# Proxy: http://localhost:8088/pacs/  (needs PACS session from MediQzy)
# DICOM: localhost:4242  AE Title MEDIQZY
```

`ORTHANC_BASIC_AUTH` is base64 of `user:password` (no `Basic ` prefix). The nginx
template fails closed if it is unset — never commit a real Orthanc password.

## Production nginx (on app host)

Prefer real Orthanc/OHIF ports — **not** a phantom `:8088` unless this compose stack is running:

| Path | Target | Auth |
|------|--------|------|
| `/ohif/*` | OHIF `:3001` (or compose nginx) | Public (study UIDs opaque) |
| `/pacs/*` | Orthanc `:8042` | `auth_request` → `/api/imaging/session/validate` |

See `nginx/imaging-proxy.conf.example` for host nginx snippets.

Port **4242** only on the hospital modality VLAN.

## MediQzy integration

1. Doctor/lab calls `POST /api/imaging/session` → sets `pacs_session` cookie
2. Launch viewer: `window.open('/ohif/viewer?StudyInstanceUIDs=' + uid)`
3. DICOM uploads via Lab RIS → Orthanc STOW-RS → store real UIDs

## Environment

```env
ORTHANC_URL=http://orthanc:8042
ORTHANC_USER=pacs
ORTHANC_PASSWORD=<strong secret — required, no default>
ORTHANC_REGISTERED_USERS={"pacs":"<same password>"}
ORTHANC_BASIC_AUTH=<base64 of user:password>
```

Passwords containing `$` must use `$$` in Compose `.env` files (Compose interpolation).

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
| 3 | AI triage microservice — TorchXRayVision + MONAI/nnU-Net when weights mounted | `IMAGING_TRIAGE_URL`, `/api/imaging/platform/triage/*` |
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
MODEL_WEIGHTS_DIR=/app/models
NNUNET_MODEL_FOLDER=          # optional — path to nnU-Net v2 checkpoint folder
OPENSEARCH_URL=http://127.0.0.1:9200
KAFKA_ENABLED=true
KAFKA_BROKERS=localhost:9092
KEYCLOAK_ENABLED=false
KEYCLOAK_REALM_URL=https://keycloak.example/realms/mediczy
VITE_OHIF_BASE_PATH=/ohif
```

### CV model weights

Place clinically validated checkpoints under `infra/imaging/imaging-triage/models/` (mounted read-only in Docker):

| File | Modality | Backend |
|------|----------|---------|
| `ct_lung_nodule_unet.pt` | CT | MONAI UNet |
| `mri_brain_unet.pt` | MRI | MONAI UNet |

TorchXRayVision (chest X-ray) auto-downloads NIH+RSNA weights on first inference. Check status: `GET http://localhost:8010/models/status`.

```bash
cd infra/imaging/imaging-triage
python scripts/download_weights.py --check
docker compose -f ../compose.yml -f ../compose.full.yml up -d --build imaging-triage
```

See also: `docs/imaging/IMAGING_STACK_DEPLOYMENT.md`
