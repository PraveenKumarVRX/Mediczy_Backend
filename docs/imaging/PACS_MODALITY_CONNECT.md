# Connect CT / MRI / USG / Digital X-ray to Mediczy PACS

Mediczy uses **Orthanc** as the DICOM PACS. Scanners can either **push** images (C-STORE) or you can **pull** them (C-FIND + C-MOVE) from the lab UI.

## Lab UI

1. Sign in at `/lab/login` (or diagnostic centre tenant host).
2. Open **PACS Devices** → `/lab/pacs-devices`.
3. Register each machine (CT / MR / US / DX …) with AE Title, IP, and DICOM port.
4. **C-ECHO** to verify connectivity.
5. **Query (C-FIND)** → select studies → **Pull** (C-MOVE) into Orthanc.
6. Review in **RIS / PACS** → `/lab/ris`.

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
```

## Start Orthanc + OHIF

```bash
cd docker/imaging
export MEDICZY_API_URL=https://app.mediqzy.com
export ORTHANC_WEBHOOK_SECRET=your-secret
docker compose down
docker compose up -d
# wait until healthy (~45s)
docker compose ps
curl -u pacs:change-this-password http://127.0.0.1:8042/system
```

- Orthanc UI: `:8042` — user `pacs` / `change-this-password`
- DICOM C-STORE: `:4242` AE `MEDICZY`
- OHIF: `:3001`

If Orthanc shows **unhealthy**, pull latest compose (auth-aware healthcheck) and recreate:

```bash
git pull origin main
cd docker/imaging
docker compose down
docker compose up -d
docker logs mediczy-orthanc --tail 80
```

## APIs

```
GET  /api/dicom/health
GET  /api/dicom/presets
GET  /api/dicom/modalities
POST /api/dicom/modalities
POST /api/dicom/modalities/:name/echo
POST /api/dicom/modalities/:name/query
POST /api/dicom/modalities/:name/retrieve   # body: { study_instance_uids: [...] }
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

After pull, the Orthanc → HyperGrid bridge syncs studies into `hg_dicom_*` / RIS worklist for viewing.
