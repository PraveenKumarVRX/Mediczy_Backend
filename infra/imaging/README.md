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

See also: `docs/imaging/IMAGING_STACK_DEPLOYMENT.md`
