# Mediczy Imaging Stack — Orthanc + OHIF + HyperGrid DICOMweb

## Architecture

```
Modality / Scanner ──C-STORE──► Orthanc (:4242)
                                    │
                    orthanc-bridge (poll or webhook)
                                    ▼
                    POST /api/hypergrid/dicom/studies  (STOW-RS)
                                    │
                              S3 + hg_dicom_* (Postgres)
                                    │
              QIDO/WADO /api/hypergrid/dicom ──► OHIF Viewer (:3001)
                                    │
                         React embed /doctor/imaging → PACS / OHIF tab
```

## What's included

| Component | Location | Purpose |
|-----------|----------|---------|
| DICOMweb API (OHIF-compatible) | `server/routes/hypergrid-dicom.route.js` | QIDO-RS, WADO-RS, STOW-RS |
| OHIF helpers | `server/services/dicomweb-ohif.service.js` | `application/dicom+json` conversion |
| DB migration | `server/migrations/20260623000001-align-hg-dicom-schema.js` | `hg_dicom_*` tables |
| Orthanc compose | `docker/imaging/docker-compose.yml` | C-STORE endpoint + OHIF |
| Orthanc bridge | `server/services/orthanc-hypergrid-bridge.service.js` | Forward instances to STOW-RS |
| OHIF config | `docker/imaging/ohif/app-config.js` | Points at HyperGrid DICOMweb |
| React OHIF embed | `client/src/components/imaging/OHIFViewerEmbed.tsx` | iframe viewer in doctor portal |
| Imaging module | `client/src/components/imaging/ImagingStudyPanel.tsx` | Studies, worklist, report |

## OHIF data source (three endpoints)

OHIF requires these roots (all implemented under `/api/hypergrid/dicom`):

| OHIF config key | Endpoint | Standard |
|-----------------|----------|----------|
| `qidoRoot` | `GET /studies`, `/series`, `/instances` | QIDO-RS |
| `wadoRoot` | `GET /studies/{uid}/series/{uid}/instances/{uid}` | WADO-RS |
| `wadoUriRoot` | Same base URL | WADO-URI fallback |

Pass `Accept: application/dicom+json` for QIDO. Pass JWT via `?access_token=` (OHIF config reads from URL).

## Deploy steps

### 1. Database

```bash
cd server && npm run migrate:all
# or: node migrations/20260623000001-align-hg-dicom-schema.js
```

### 2. API server

Ensure env vars:

```env
S3_UPLOADS_BUCKET=mediczy-uploads
AWS_REGION=ap-south-1
ORTHANC_URL=http://127.0.0.1:8042
ORTHANC_WEBHOOK_SECRET=your-secret
MEDICZY_API_URL=https://mediqzy.com
OHIF_CORS_ORIGIN=https://app.mediqzy.com,http://localhost:3001
```

Redeploy Node server after merge.

### 3. Orthanc + OHIF (optional — for direct C-STORE from scanners)

```bash
cd docker/imaging
export MEDICZY_API_URL=https://mediqzy.com
export ORTHANC_WEBHOOK_SECRET=your-secret
docker compose up -d
```

- Orthanc UI: http://localhost:8042 (orthanc / orthanc)
- OHIF: http://localhost:3001
- DICOM C-STORE: port **4242**, AE Title **MEDICZY**

Edit `docker/imaging/ohif/app-config.js` — set `qidoRoot` / `wadoRoot` to your production API URL.

### 4. Frontend

```env
VITE_OHIF_URL=https://ohif.mediqzy.com
```

Or use local OHIF at `http://localhost:3001`.

## Smoke tests

```bash
MEDICZY_BASE_URL=https://mediqzy.com node server/scripts/qa/imaging-stack-smoke.mjs
bash scripts/testing/dicomweb-smoke.sh
```

## Doctor portal usage

1. Go to **/doctor/imaging**
2. Open **PACS / OHIF** tab
3. Select study → OHIF viewer loads in iframe
4. **Report** tab → save findings to `hg_dicom_reports`

## Effort summary (from gap analysis)

| Gap | Status |
|-----|--------|
| Orthanc deployment | ✅ `docker/imaging/docker-compose.yml` |
| OHIF deployment | ✅ OHIF container + `app-config.js` |
| Orthanc → HyperGrid bridge | ✅ webhook + poll worker |
| OHIF embed in React | ✅ `OHIFViewerEmbed` + doctor imaging tab |
| Frontend imaging module | ✅ `ImagingStudyPanel` (studies, worklist, report) |
| DB migrations | ✅ `20260623000001-align-hg-dicom-schema.js` |
| DICOMweb OHIF compatibility | ✅ QIDO/WADO paths + `application/dicom+json` |

## Platform phases 1–4 (2026-06)

| Phase | Delivered |
|-------|-----------|
| 1 | Batch `POST /api/lab/ris/upload-series`, MWL, report templates, Prometheus metrics |
| 2 | Kafka workflow events, collaboration SSE, OpenSearch search with Postgres fallback |
| 3 | `ai-engine/imaging-triage` FastAPI service, governed triage API (`/api/imaging/platform/triage/*`) |
| 4 | VNA lifecycle metadata, OHIF hanging protocols, `infra/imaging/compose.full.yml` |

Run full stack: `cd infra/imaging && docker compose -f compose.yml -f compose.full.yml up -d`

Platform API base: `/api/imaging/platform`

## Notes

- **Manual lab upload** still works via `/api/lab/ris` → syncs to `hg_dicom_*`
- Orthanc is **optional** if labs upload DICOM manually through RIS
- For production OHIF on a separate domain, configure CORS via `OHIF_CORS_ORIGIN`
