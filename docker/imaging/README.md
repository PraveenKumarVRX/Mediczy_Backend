# Mediczy Orthanc + OHIF (docker/imaging)

Quick local/EC2 PACS stack for scanner C-STORE and lab pull (C-FIND/C-MOVE).

```bash
cd docker/imaging
export MEDICZY_API_URL=https://app.mediqzy.com
export ORTHANC_WEBHOOK_SECRET=your-secret
docker compose down
docker compose up -d
docker compose ps
curl -u pacs:change-this-password http://127.0.0.1:8042/system
```

| Service | URL / port |
|---|---|
| Orthanc Explorer | http://localhost:8042 (`pacs` / `change-this-password`) |
| DICOM C-STORE | port **4242**, AE **MEDICZY** |
| OHIF | http://localhost:3001 |

## Unhealthy Orthanc?

Older compose used `curl -f http://localhost:8042/system` which fails when auth is on (401) or curl is missing. Current healthcheck uses Orthanc’s probe:

```yaml
python3 /probes/test-aliveness.py --user=pacs --pwd=change-this-password
```

If still unhealthy:

```bash
docker logs mediczy-orthanc --tail 80
docker inspect mediczy-orthanc --format '{{json .State.Health}}'
```

## Node API env

```env
ORTHANC_URL=http://127.0.0.1:8042
ORTHANC_USER=pacs
ORTHANC_PASSWORD=change-this-password
ORTHANC_AET=MEDICZY
```

Then `pm2 restart mediczy-server`.

Production / nginx front-door stack: see `infra/imaging/`.
