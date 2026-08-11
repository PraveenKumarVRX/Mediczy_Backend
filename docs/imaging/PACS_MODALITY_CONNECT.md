# Connect modalities to Mediczy PACS (Orthanc)

Mediczy uses **Orthanc** as the DICOM PACS. Scanners can either **push** images (C-STORE) or you can **pull** them (C-FIND + C-MOVE) from the lab or clinic UI.

## Supported modality presets

| DICOM type | Label | Typical use |
|---|---|---|
| CT / MR / US / DX / CR | CT, MRI, USG, X-ray | Diagnostic centre / lab |
| **PX** | **OPG (Panoramic)** | Dental clinics |
| **IO** | **Intra-oral X-ray** | Dental clinics |
| **RF** | **C-arm (Fluoroscopy)** | OT / ortho / pain |
| **XA** | **Cath lab / Angiogram (XA)** | Cardiac cath lab / vascular |
| **MG** | Mammography | Breast imaging |

## Lab UI

1. Sign in at `/lab/login` (or diagnostic centre tenant host).
2. Open **PACS Settings** → `/lab/pacs-settings` (also `/lab/pacs-devices`).
   From the RIS worklist, use the **PACS Settings** button in the header.
3. Register each machine (including OPG / C-arm / angiogram) with AE Title, IP, and DICOM port.
4. **C-ECHO** to verify connectivity.
5. **Query (C-FIND)** → select studies → **Pull** (C-MOVE) into Orthanc.
6. Review in **RIS / PACS** → `/lab/ris`.

## Clinic UI (dental / procedure rooms)

1. Sign in at `/clinic/login`.
2. Sidebar → **PACS Settings** (`/clinic/pacs-settings`) — register OPG, intra-oral, C-arm, angiogram.
3. Sidebar → **Imaging / OPG** (`/clinic/ris`) — worklist, upload, viewer, reports.
4. Same Orthanc AE: `MEDICZY` port `4242` for C-STORE push from the machine.

## Network setup (machines → Mediczy)

| Setting on scanner | Value |
|---|---|
| Called AE Title | `MEDICZY` (or `ORTHANC_AET`) |
| Called IP | Orthanc host (hospital LAN IP of Orthanc server) |
| Called port | `4242` (default) |

For **pull**, Orthanc must reach the scanner’s AE/IP/port (firewall allow both ways).

## Env (API server)

```env
ORTHANC_URL=http://127.0.0.1:8042
ORTHANC_USER=pacs
ORTHANC_PASSWORD=...
ORTHANC_AET=MEDICZY
ORTHANC_DICOM_PORT=4242
ORTHANC_WEBHOOK_SECRET=...
# Auto-register Orthanc studies onto Lab RIS / doctor Lab Referred
ORTHANC_DEFAULT_LAB_ID=2368
ORTHANC_DEFAULT_REFERRING_DOCTOR_ID=70
```

`ORTHANC_DEFAULT_LAB_ID` is required for true C-STORE auto-ingest (MRI PC → Orthanc webhook → `ris_studies`). Without it, pull from **PACS Settings** still registers RIS using the signed-in lab id.

## Start Orthanc + OHIF

```bash
cd docker/imaging
cp .env.example .env   # set ORTHANC_PASSWORD + ORTHANC_REGISTERED_USERS
export MEDICZY_API_URL=https://app.mediqzy.com
export ORTHANC_WEBHOOK_SECRET=your-secret
docker compose down
docker compose up -d
# wait until healthy (~45s)
docker compose ps
# use the password from .env (escape $ as $$ only inside Compose .env)
curl -u "pacs:$ORTHANC_PASSWORD" http://127.0.0.1:8042/system
```

- Orthanc UI: `:8042` — `ORTHANC_USER` / `ORTHANC_PASSWORD` from `.env` (no weak defaults in git)
- DICOM C-STORE: `:4242` AE `MEDICZY`
- OHIF: `:3001` (relative `/api/hypergrid/dicom` datasource)

If Orthanc shows **unhealthy**, pull latest compose (auth-aware healthcheck) and recreate:

```bash
git pull origin main
cd docker/imaging
docker compose down
docker compose up -d
docker logs mediczy-orthanc --tail 80
```

## Auto-upload: local MRI PC → Mediczy RIS / LIS

Local MRI consoles typically C-STORE into Orthanc. Mediczy then auto-creates / updates Lab RIS rows:

```
MRI PC ──C-STORE──► Orthanc (:4242 AE MEDICZY)
                      │
                      ├─ webhook NewInstance / StableStudy
                      │    → HyperGrid STOW (best effort)
                      │    → ensureRisStudyFromOrthancIngest → ris_studies
                      │
                      └─ Lab PACS Settings C-FIND → C-MOVE pull
                           → ensureRisStudiesForStudyUids → ris_studies
```

Also available for backfill / missed webhooks:

- UI: **PACS Settings → Sync to RIS**, or **RIS Worklist → Sync Orthanc**
- API: `POST /api/lab/ris/sync-from-orthanc` `{ "limit": 100 }`

Referring doctor for doctor portal **Lab Referred**:

1. DICOM `ReferringPhysicianName` matched to `doctors.name`, or
2. `ORTHANC_DEFAULT_REFERRING_DOCTOR_ID`, or
3. Optional `referring_doctor_id` on retrieve/sync body

## APIs

```
GET  /api/dicom/health
GET  /api/dicom/presets
GET  /api/dicom/modalities
POST /api/dicom/modalities
POST /api/dicom/modalities/:name/echo
POST /api/dicom/modalities/:name/query
POST /api/dicom/modalities/:name/retrieve   # body: { study_instance_uids: [...] }
POST /api/lab/ris/sync-from-orthanc        # backfill Orthanc → ris_studies
```

All require lab JWT (`Authorization: Bearer <labToken>`).

## Modality codes

| Type | Meaning |
|---|---|
| CT | CT Scanner |
| MR | MRI |
| US | Ultrasound / USG |
| DX | Digital X-ray |
| CR | Computed Radiography |
| MG | Mammography |

After push or pull, studies appear on `/lab/ris` automatically. Doctor Lab Referred sees them when `referring_doctor_id` is resolved.
