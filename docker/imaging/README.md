# Mediczy Orthanc + OHIF (docker/imaging)

Quick local/EC2 PACS stack for scanner C-STORE and lab pull (C-FIND/C-MOVE).

```bash
cd docker/imaging
cp .env.example .env
# Edit .env — set ORTHANC_PASSWORD + ORTHANC_REGISTERED_USERS (same password).
# If password contains `$`, write `$$` in this .env so Compose does not truncate it.
export MEDICZY_API_URL=https://app.mediqzy.com
export ORTHANC_WEBHOOK_SECRET=your-secret
docker compose down
docker compose up -d
docker compose ps
curl -u "pacs:${ORTHANC_PASSWORD}" http://127.0.0.1:8042/system
```

| Service | URL / port |
|---|---|
| Orthanc Explorer | http://localhost:8042 (`ORTHANC_USER` / `ORTHANC_PASSWORD`) |
| DICOM C-STORE | port **4242**, AE **MEDICZY** |
| OHIF | http://localhost:3001 |

## Unhealthy Orthanc?

Healthcheck uses Orthanc’s probe with `ORTHANC_USER` / `ORTHANC_PASSWORD` from the container env. Plain `curl -f http://localhost:8042/system` returns 401 when auth is on.

If still unhealthy:

```bash
docker logs mediczy-orthanc --tail 80
docker inspect mediczy-orthanc --format '{{json .State.Health}}'
```

### Password truncated to something like `Um@`?

Compose treats `$name` in `.env` as variable substitution. Escape dollars as `$$` in `docker/imaging/.env` only. Keep the real password (single `$`) in `server/.env`.

## Node API env

```env
ORTHANC_URL=http://127.0.0.1:8042
ORTHANC_USER=pacs
ORTHANC_PASSWORD=<same password as Orthanc — unescaped>
ORTHANC_AET=MEDICZY
ORTHANC_WEBHOOK_SECRET=<required for /api/orthanc/webhook>
```

Then `pm2 restart mediczy-server`.

OHIF uses relative `/api/hypergrid/dicom` roots (same-origin). Do not point at the marketing apex `https://mediqzy.com`.

Production / nginx front-door stack: see `infra/imaging/` and `nginx/imaging-proxy.conf.example`.
