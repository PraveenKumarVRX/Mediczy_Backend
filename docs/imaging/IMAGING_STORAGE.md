# Imaging storage — where pixels live

## Today (after this change)

| Path | Hot (daily) | Archive | Viewer source |
|---|---|---|---|
| Lab RIS DICOM | **Orthanc** + **S3 daily** `ris/tenant-{labId}/…` | MinIO (nightly copy) | OHIF ← Orthanc |
| HyperGrid STOW | **S3 daily** `dicom/tenant-{id}/…` | MinIO (nightly copy) | WADO ← S3 daily (fallback legacy uploads) |
| Doctor imaging | **S3 daily** `imaging/tenant-{hospitalId}/…` | MinIO (nightly copy) | Presigned S3 |
| Scanner C-STORE | **Orthanc** volume | Bridge → HyperGrid → S3 daily → MinIO | Orthanc / OHIF |

## Tenant segregation (how images stay apart)

Isolation is layered — you need all three for real multi-tenant safety:

| Layer | What | Strength |
|---|---|---|
| **1. DB** | `tenant_id` / `lab_id` on `hg_dicom_*`, `ris_studies`, VNA rows | Query isolation (already enforced on API reads) |
| **2. Object key prefix** | `{dicom\|imaging\|ris}/tenant-{id}/YYYY/MM/DD/…` | List/delete/transfer one hospital without touching others |
| **3. Orthanc** | Shared PACS today | **Weak** — study UIDs are opaque but not tenant-scoped. For hard isolation deploy **one Orthanc per hospital** (see infra README) |

### Recommended key layout (implemented)

```
s3://mediczy-imaging-daily/
  dicom/tenant-12/2026/07/30/1785…-a1b2.dcm     ← hospital / lab 12
  dicom/tenant-56/2026/07/30/1785…-c3d4.dcm     ← AJ Dental (example)
  ris/tenant-56/2026/07/30/…
  imaging/tenant-12/2026/07/30/…
```

Same keys are mirrored to MinIO under `mediczy-imaging-archive`.

Transfer one tenant only:

```bash
# API
POST /api/imaging/platform/storage/daily-transfer/run
{ "tenantId": 56, "dryRun": true }

# or env for the CLI/cron
IMAGING_TRANSFER_TENANT_ID=56 ./scripts/imaging/sync-imaging-daily-to-minio.sh
```

### Stronger options (if you need them later)

| Mode | When | How |
|---|---|---|
| **Prefix** (default, now) | Most hospitals on one platform | `tenant-{id}/` in key |
| **Per-tenant MinIO bucket** | Customer-owned archive / BAA | `MINIO_IMAGING_BUCKET=mediczy-imaging-t{id}` + IAM |
| **Per-tenant S3 bucket** | Strict data residency | `mediczy-imaging-daily-t{id}` + bucket policy |
| **Per-tenant Orthanc** | Hard PACS isolation | One compose stack / VLAN per hospital |

```
Upload (RIS / HyperGrid / doctor)
        │
        ▼
 s3://S3_IMAGING_DAILY_BUCKET/{dicom|imaging|ris}/tenant-{id}/YYYY/MM/DD/…
        │
        │  cron 02:30  (imaging_daily_minio_transfer)
        ▼
 minio://MINIO_IMAGING_BUCKET/{same key}              ← durable archive
```

Default bucket name: **`mediczy-imaging-daily`**  
Default MinIO archive: **`mediczy-imaging-archive`**

Until `S3_IMAGING_DAILY_BUCKET` is set, the app falls back to `S3_UPLOADS_BUCKET` (`mediczy-uploads`) so existing deploys keep working. Legacy flat keys (`dicom/ts-uid.dcm` without `tenant-`) still read via fallback.

## One-time setup (EC2)

```bash
# 1) Create AWS S3 daily bucket (public access blocked, AES256)
AWS_REGION=ap-south-1 ./scripts/imaging/create-imaging-daily-s3-bucket.sh

# 2) Ensure MinIO is up
mc alias set mediczy http://127.0.0.1:9000 "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY"
./scripts/imaging/ensure-minio-imaging-bucket.sh

# 3) server/.env
S3_IMAGING_DAILY_BUCKET=mediczy-imaging-daily
AWS_REGION=ap-south-1
MINIO_ENDPOINT=http://127.0.0.1:9000
MINIO_ACCESS_KEY=...
MINIO_SECRET_KEY=...
MINIO_IMAGING_BUCKET=mediczy-imaging-archive

# 4) Migration + restart
node server/migrations/imaging-daily-transfer-log.migration.js
pm2 restart mediczy-server --update-env
```

## Manual / dry-run transfer

```bash
./scripts/imaging/sync-imaging-daily-to-minio.sh --dry-run
./scripts/imaging/sync-imaging-daily-to-minio.sh
IMAGING_TRANSFER_TENANT_ID=56 LOOKBACK_HOURS=72 ./scripts/imaging/sync-imaging-daily-to-minio.sh
```

API (auth required):

```
GET  /api/imaging/platform/storage/daily-transfer
POST /api/imaging/platform/storage/daily-transfer/run
     body: { "dryRun": false, "force": false, "lookbackHours": 36, "tenantId": 56 }
```

## Safety

- S3 daily bucket: **Block Public Access** + default **SSE-AES256**
- Transfer does **not** delete from S3 unless `IMAGING_DAILY_DELETE_AFTER_TRANSFER=true`
- Reads try daily bucket first, then legacy `mediczy-uploads` for pre-cutover keys
- PHI transfer log: `imaging_daily_transfer_log`
- API reads remain filtered by `tenant_id` / `lab_id` even if someone guesses an S3 key
