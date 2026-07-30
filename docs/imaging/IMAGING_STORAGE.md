# Imaging storage — where pixels live

## Today (after this change)

| Path | Hot (daily) | Archive | Viewer source |
|---|---|---|---|
| Lab RIS DICOM | **Orthanc** + **S3 daily** `ris/…` | MinIO (nightly copy) | OHIF ← Orthanc |
| HyperGrid STOW | **S3 daily** `dicom/…` | MinIO (nightly copy) | WADO ← S3 daily (fallback legacy uploads) |
| Doctor imaging | **S3 daily** `imaging/…` | MinIO (nightly copy) | Presigned S3 |
| Scanner C-STORE | **Orthanc** volume | Bridge → HyperGrid → S3 daily → MinIO | Orthanc / OHIF |

```
Upload (RIS / HyperGrid / doctor)
        │
        ▼
 s3://S3_IMAGING_DAILY_BUCKET/{dicom|imaging|ris}/…   ← hot “daily” store
        │
        │  cron 02:30  (imaging_daily_minio_transfer)
        ▼
 minio://MINIO_IMAGING_BUCKET/…                       ← durable archive
```

Default bucket name: **`mediczy-imaging-daily`**  
Default MinIO archive: **`mediczy-imaging-archive`**

Until `S3_IMAGING_DAILY_BUCKET` is set, the app falls back to `S3_UPLOADS_BUCKET` (`mediczy-uploads`) so existing deploys keep working.

## One-time setup (EC2)

```bash
# 1) Create AWS S3 daily bucket (public access blocked, AES256)
AWS_REGION=ap-south-1 ./scripts/imaging/create-imaging-daily-s3-bucket.sh

# 2) Ensure MinIO is up (infra/imaging compose.full or standalone)
#    then create archive bucket:
mc alias set mediczy http://127.0.0.1:9000 "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY"
./scripts/imaging/ensure-minio-imaging-bucket.sh

# 3) server/.env
S3_IMAGING_DAILY_BUCKET=mediczy-imaging-daily
AWS_REGION=ap-south-1
MINIO_ENDPOINT=http://127.0.0.1:9000
MINIO_ACCESS_KEY=...
MINIO_SECRET_KEY=...
MINIO_IMAGING_BUCKET=mediczy-imaging-archive
# optional:
# IMAGING_DAILY_TRANSFER_ENABLED=true
# IMAGING_TRANSFER_LOOKBACK_HOURS=36
# IMAGING_DAILY_DELETE_AFTER_TRANSFER=false   # keep S3 hot copy unless you opt in

# 4) Migration + restart
node server/migrations/imaging-daily-transfer-log.migration.js
pm2 restart mediczy-server --update-env
```

## Manual / dry-run transfer

```bash
./scripts/imaging/sync-imaging-daily-to-minio.sh --dry-run
./scripts/imaging/sync-imaging-daily-to-minio.sh
LOOKBACK_HOURS=72 ./scripts/imaging/sync-imaging-daily-to-minio.sh --force
```

API (auth required):

```
GET  /api/imaging/platform/storage/daily-transfer
POST /api/imaging/platform/storage/daily-transfer/run
     body: { "dryRun": false, "force": false, "lookbackHours": 36 }
```

## Safety

- S3 daily bucket: **Block Public Access** + default **SSE-AES256**
- Transfer does **not** delete from S3 unless `IMAGING_DAILY_DELETE_AFTER_TRANSFER=true`
- Reads try daily bucket first, then legacy `mediczy-uploads` for pre-cutover keys
- PHI transfer log: `imaging_daily_transfer_log`
