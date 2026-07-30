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
 MinIO archive (primary)
        │  on failure / if MinIO down
        ▼
 Wasabi (S3-compatible fallback)
```

Optional: `IMAGING_WASABI_MIRROR=true` writes to **both** MinIO and Wasabi.

## Archive backends

| Backend | Role | Env |
|---|---|---|
| **MinIO** | Primary on-prem / VPC archive | `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_IMAGING_BUCKET` |
| **Wasabi** | Cloud fallback (or sole archive) | `WASABI_ENDPOINT`, `WASABI_REGION`, `WASABI_ACCESS_KEY`, `WASABI_SECRET_KEY`, `WASABI_IMAGING_BUCKET` |

Strategy (auto):
- Both set → **minio-then-wasabi-fallback** (or **mirror-both** if `IMAGING_WASABI_MIRROR=true`)
- Only Wasabi → **wasabi-only**
- Only MinIO → **minio-only**

Wasabi endpoint examples:
- `https://s3.wasabisys.com` (us-east-1)
- `https://s3.ap-southeast-1.wasabisys.com`
- `https://s3.eu-central-1.wasabisys.com`

> **SDK note:** `@aws-sdk/client-s3` ≥ 3.729 enables CRC32 checksums by default.
> Mediczy sets `requestChecksumCalculation` / `responseChecksumValidation` to
> `WHEN_REQUIRED` for MinIO and Wasabi clients (otherwise you get opaque `UnknownError`).

## Tenant isolation modes

Set `IMAGING_TENANT_ISOLATION` in `server/.env`:

| Mode | S3 hot | Archive (MinIO / Wasabi) | When to use |
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

## EC2 setup

```bash
# 1) Shared daily bucket
AWS_REGION=ap-south-1 ./scripts/imaging/create-imaging-daily-s3-bucket.sh

# 2a) MinIO (optional if Wasabi-only)
mc alias set mediczy http://127.0.0.1:9000 "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY"
./scripts/imaging/ensure-minio-imaging-bucket.sh

# 2b) Wasabi fallback
./scripts/imaging/check-wasabi.sh

# 3) server/.env
S3_IMAGING_DAILY_BUCKET=mediczy-imaging-daily
IMAGING_TENANT_ISOLATION=prefix

MINIO_ENDPOINT=http://127.0.0.1:9000
MINIO_ACCESS_KEY=...
MINIO_SECRET_KEY=...
MINIO_IMAGING_BUCKET=mediczy-imaging-archive

# Match the region where you created the bucket (console). us-east-1 → s3.wasabisys.com
WASABI_ENDPOINT=https://s3.wasabisys.com
WASABI_REGION=us-east-1
WASABI_ACCESS_KEY=...
WASABI_SECRET_KEY=...
WASABI_IMAGING_BUCKET=mediczy-imaging-archive
# WASABI_IMAGING_BUCKET_PREFIX=mediczy-imaging   # for minio-bucket / s3-bucket modes
# IMAGING_WASABI_MIRROR=true                     # dual-write both archives

# 4) Migrate + restart
node server/migrations/imaging-daily-transfer-log.migration.js
pm2 restart mediczy-server --update-env
```

Create the Wasabi bucket in the Wasabi console (or allow the transfer job to create it on first put).

## APIs

Requires a **lab / doctor / hospital / admin** JWT (ring-fenced). Lab example:

```bash
LAB_TOKEN=$(curl -s -X POST https://app.mediqzy.com/api/lab/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"lab@example.com","password":"..."}' | jq -r .token)

curl -s 'https://app.mediqzy.com/api/imaging/platform/storage/tenant-isolation?live=1' \
  -H "Authorization: Bearer $LAB_TOKEN" | jq '.archive'
# .archive.wasabi.configured = env present
# .archive.wasabiLive.ok = true  → live HeadBucket/ListObjects succeeded
```

```
GET  /api/imaging/platform/storage/tenant-isolation          # archive backend status
GET  /api/imaging/platform/storage/tenant-isolation?live=1   # + wasabiLive reachability
POST /api/imaging/platform/storage/tenant-isolation/ensure   { "tenantId": 56 }
GET  /api/imaging/platform/storage/daily-transfer
POST /api/imaging/platform/storage/daily-transfer/run
     { "tenantId": 56, "dryRun": true }
```

## Safety

- Public access blocked + AES256 on AWS daily buckets
- No S3 delete after archive copy unless `IMAGING_DAILY_DELETE_AFTER_TRANSFER=true`
- Transfer log tracks `archive_provider` (`minio` | `wasabi`)
- Reads fall back across tenant / shared / legacy upload buckets
