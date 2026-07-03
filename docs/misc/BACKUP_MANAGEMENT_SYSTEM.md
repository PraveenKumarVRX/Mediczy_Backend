# Backup Management System - Documentation

**Date:** February 14, 2026
**Project:** Mediczy  
**Environment:** Production (13.234.17.52)

---

## Overview

The Mediczy production environment now has an automated backup retention system that ensures **only 1 latest backup is kept** at any time. Old backups are automatically deleted to save disk space.

---

## Backup Strategy

### Retention Policy
- **Keep:** 1 latest backup
- **Delete:** All older backups automatically
- **Frequency:** Manual deployments + automatic daily cleanup

### Components

#### 1. **backup-auto-cleanup.sh** (Automatic)
- **Location:** `/home/ubuntu/backup-auto-cleanup.sh`
- **Purpose:** Removes old backups, keeps only latest 1
- **Runs:** Daily at 2:00 AM via cron
- **Logs:** `/home/ubuntu/backup-cleanup.log`

#### 2. **backup-cleanup.sh** (Manual)
- **Location:** `/home/ubuntu/backup-cleanup.sh`
- **Usage:** `bash /home/ubuntu/backup-cleanup.sh /home/ubuntu 1`
- **Purpose:** On-demand backup cleanup with reporting
- **Useful for:** Immediate cleanup after deployment

#### 3. **backup-manager.sh** (Full Management)
- **Location:** `/home/ubuntu/backup-manager.sh`
- **Usage:** `bash /home/ubuntu/backup-manager.sh /home/ubuntu 1`
- **Purpose:** Creates new backup AND cleans up old ones
- **Note:** Used in future deployments for one-step backup management

#### 4. **deploy-prod-v3.sh** (Deployment)
- **Location:** `/home/ubuntu/Mediczy/deploy-prod-v3.sh`
- **Recommendation:** Use this for future deployments
- **Features:** 
  - Creates backup before deploying
  - Automatically cleans old backups
  - Pulls latest code
  - Restarts services
  - Verifies OAuth endpoints

---

## Cron Job Setup

### Current Schedule
```bash
✅ Configured: 0 2 * * * /home/ubuntu/backup-auto-cleanup.sh
```

### Meaning
- **0** = Minute 00
- **2** = Hour 02 (2:00 AM)
- **\*** = Every day of month
- **\*** = Every month  
- **\*** = Every day of week

**Time:** Daily at 2:00 AM UTC

### Log Location
```bash
/home/ubuntu/backup-cleanup.log
```

---

## Usage Examples

### Manual Immediate Cleanup
```bash
ssh -i ~/.ssh/mediqzy.pem ubuntu@13.234.17.52 "bash /home/ubuntu/backup-cleanup.sh /home/ubuntu 1"
```

### Check Backup Status
```bash
ssh -i ~/.ssh/mediqzy.pem ubuntu@13.234.17.52 "
  echo 'Backups:'
  ls -lh /home/ubuntu/mediczy-backup-* 2>/dev/null
  echo ''
  echo 'Count:'
  ls -1 /home/ubuntu/mediczy-backup-* 2>/dev/null | wc -l
"
```

### View Auto-Cleanup Logs
```bash
ssh -i ~/.ssh/mediqzy.pem ubuntu@13.234.17.52 "tail -50 /home/ubuntu/backup-cleanup.log"
```

### Deploy with Automatic Backup Management
```bash
cd ~/Mediczy
bash deploy-prod-v3.sh
```

---

## Storage Audit & Offsite Backups (2026-07)

New scripts under `scripts/ops/` and `scripts/backup/`:

```bash
# Audit disk usage on EC2 (safe, read-only)
bash /home/ubuntu/Mediczy/scripts/ops/storage-audit-cleanup.sh

# Clean local clutter: old mediczy-backup-*, stale logs, PM2 flush, apt/npm cache
bash /home/ubuntu/Mediczy/scripts/ops/storage-audit-cleanup.sh --cleanup

# Push nightly pg_dump to S3 (+ MinIO if mc alias configured)
bash /home/ubuntu/Mediczy/scripts/backup/daily-offsite-backup.sh

# All-in-one
bash /home/ubuntu/Mediczy/scripts/ops/storage-audit-cleanup.sh --all
```

**Offsite layout:** `s3://mediczy-backups/db/YYYY-MM-DD/mediczy_prod.sql.gz`

**S3 setup (one-time):**
```bash
aws s3 mb s3://mediczy-backups --region ap-south-1
# EC2 instance role needs s3:PutObject on mediczy-backups/*
```

**MinIO setup (optional, same-server):**
```bash
mc alias set minio http://127.0.0.1:9000 "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY"
mc mb minio/mediczy-backups
mc ilm rule add --expire-days 30 minio/mediczy-backups
```

**Recommended cron:**
```bash
0 2 * * * /home/ubuntu/Mediczy/scripts/backup/daily-offsite-backup.sh >> /home/ubuntu/Mediczy/logs/backup.log 2>&1
30 3 1 * * /home/ubuntu/Mediczy/scripts/ops/storage-audit-cleanup.sh --cleanup >> /home/ubuntu/Mediczy/logs/storage-cleanup.log 2>&1
```

---

## Cleanup History

### Initial Cleanup (Feb 14, 2026, 18:55 UTC)
- **Before:** 227 backups stored
- **After:** 1 backup retained
- **Space Freed:** 33GB+
- **Result:** ✅ Complete success

### Current Status
- **Backups:** 1 (mediczy-backup-20260212_205550)
- **Size:** ~11GB
- **Disk Usage:** 55G / 96G (58% full)
- **Available:** 41GB

---

## Benefits

1. **Disk Space:** Only ~11GB used (vs. 230GB+ before)
2. **Automatic:** No manual intervention needed
3. **Redundancy:** Latest backup always available for rollback
4. **Fast Deployments:** `npm install` now works without disk space issues
5. **Monitoring:** Log files track all cleanup operations

---

## Recovery Procedure

If a deployment fails and rollback is needed:

```bash
ssh -i ~/.ssh/mediqzy.pem ubuntu@13.234.17.52 << 'EOF'
cd /home/ubuntu

# Stop services
pm2 stop mediczy-server

# Backup current (broken) version
mv Mediczy Mediczy-broken-$(date +%Y%m%d_%H%M%S)

# Restore from backup
LATEST=$(ls -td mediczy-backup-* 2>/dev/null | head -1)
cp -r "$LATEST" Mediczy

# Restart services
cd Mediczy
pm2 start mediczy-server --watch

echo "✅ Rollback complete"
EOF
```

---

## Disk Space Targets

- **Safe Zone:** < 70% (current: 58%) ✅
- **Warning Zone:** 70-85%
- **Critical Zone:** > 85%

**Current Status:** SAFE ✅

---

## Future Improvements

1. Archive old backups to S3 for long-term retention
2. Implement incremental backups instead of full copies
3. Add backup integrity checks
4. Send daily summary emails
5. Implement backup compression

---

## Files Deployed to Production

| File | Location | Purpose |
|------|----------|---------|
| backup-auto-cleanup.sh | /home/ubuntu/ | Daily auto-cleanup (cron) |
| backup-cleanup.sh | /home/ubuntu/ | Manual cleanup tool |
| backup-manager.sh | /home/ubuntu/ | Full backup management |
| deploy-prod-v3.sh | /home/ubuntu/Mediczy/ | Production deployment |
| backup-cleanup.log | /home/ubuntu/ | Auto-cleanup logs |

---

## Support

For troubleshooting or issues:

1. Check logs: `tail /home/ubuntu/backup-cleanup.log`
2. Manual cleanup: `bash /home/ubuntu/backup-cleanup.sh /home/ubuntu 1`
3. Verify cron: `crontab -l`
4. Monitor disk: `df -h`

---

**Last Updated:** Feb 14, 2026 18:55 UTC  
**Status:** ✅ Production Ready
