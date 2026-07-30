# Imaging storage — where pixels live + tenant segregation

## Architecture

```
Upload (RIS / HyperGrid / doctor)
        │
        ▼
 S3 daily (hot)  ──tenant key──►  …/tenant-{id}/YYYY/MM/DD/file
        │
        │  cron 02:30
        ▼
 MinIO archive (warm/cold)
```

## Tenant isolation modes

Set `IMAGING_TENANT_ISOLATION` in `server/.env`:

| Mode | S3 hot | MinIO archive | When to use |
|---|---|---|---|
| **`prefix`** (default) | Shared `mediczy-imaging-daily` | Shared `mediczy-imaging-archive` | Most installs — keys under `tenant-{id}/` |
| **`minio-bucket`** | Shared daily | **`mediczy-imaging-t{id}`** per tenant | Customer-owned archive / easier purge |
| **`s3-bucket`** | **`mediczy-imaging-daily-t{id}`** | **`mediczy-imaging-t{id}`** | Strict residency / separate IAM |

Keys are **always** tenant-prefixed (all modes):

```
dicom/tenant-56/2026/07/30/1785…-a1b2.dcm
ris/tenant-56/2026/07/30/…
imaging/tenant-12/2026/07/30/…
```

DB queries remain scoped by `tenant_id` / `lab_id`. Orthanc is still shared unless you deploy one stack per hospital.

## EC2 setup

```bash
# 1) Shared daily bucket (always create this; used by prefix + minio-bucket modes)
AWS_REGION=ap-south-1 ./scripts/imaging/create-imaging-daily-s3-bucket.sh

# 2) MinIO alias + shared archive (prefix mode)
mc alias set mediczy http://127.0.0.1:9000 "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY"
./scripts/imaging/ensure-minio-imaging-bucket.sh

# 3) server/.env
S3_IMAGING_DAILY_BUCKET=mediczy-imaging-daily
MINIO_ENDPOINT=http://127.0.0.1:9000
MINIO_ACCESS_KEY=...
MINIO_SECRET_KEY=...
MINIO_IMAGING_BUCKET=mediczy-imaging-archive

# Choose isolation (default prefix):
IMAGING_TENANT_ISOLATION=prefix
# IMAGING_TENANT_ISOLATION=minio-bucket
# IMAGING_TENANT_ISOLATION=s3-bucket
# S3_IMAGING_DAILY_BUCKET_PREFIX=mediczy-imaging-daily
# MINIO_IMAGING_BUCKET_PREFIX=mediczy-imaging

# 4) Per-tenant buckets (minio-bucket / s3-bucket modes)
IMAGING_TENANT_ISOLATION=minio-bucket TENANT_IDS=12,56 \
  ./scripts/imaging/ensure-tenant-imaging-buckets.sh

# 5) Migrate + restart
node server/migrations/imaging-daily-transfer-log.migration.js
pm2 restart mediczy-server --update-env
```

## APIs

```
GET  /api/imaging/platform/storage/tenant-isolation
POST /api/imaging/platform/storage/tenant-isolation/ensure   { "tenantId": 56 }
GET  /api/imaging/platform/storage/daily-transfer
POST /api/imaging/platform/storage/daily-transfer/run
     { "tenantId": 56, "dryRun": true, "force": false, "lookbackHours": 36 }
```

## Transfer one tenant

```bash
IMAGING_TRANSFER_TENANT_ID=56 ./scripts/imaging/sync-imaging-daily-to-minio.sh --dry-run
./scripts/imaging/sync-imaging-daily-to-minio.sh
```

## Safety

- Public access blocked + AES256 on AWS daily buckets
- No S3 delete after MinIO copy unless `IMAGING_DAILY_DELETE_AFTER_TRANSFER=true`
- Reads fall back across tenant bucket / shared daily / legacy uploads
- Transfer log: `imaging_daily_transfer_log` (includes `tenant_id`)
