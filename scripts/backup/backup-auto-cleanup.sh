#!/bin/bash

# Cron job for automatic backup retention
# Add to crontab with: 0 2 * * * /home/ubuntu/backup-auto-cleanup.sh
# This runs daily at 2 AM

BACKUP_DIR="/home/ubuntu"
RETENTION=1  # Keep only 1 backup
LOG_FILE="/home/ubuntu/backup-cleanup.log"

# Log function
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

# Start
log "=== Backup Auto-Cleanup Started ==="

# Get current count
TOTAL=$(ls -1d "$BACKUP_DIR"/mediczy-backup-* 2>/dev/null | wc -l)
log "Total backups found: $TOTAL"

if [ "$TOTAL" -le "$RETENTION" ]; then
  log "Retention policy met - no cleanup needed"
  exit 0
fi

# Delete old backups, keep latest
TO_DELETE=$((TOTAL - RETENTION))
log "Deleting $TO_DELETE old backups (keeping $RETENTION)..."

ls -td "$BACKUP_DIR"/mediczy-backup-* 2>/dev/null | tail -n +$((RETENTION + 1)) | while read backup; do
  if chmod -R u+w "$backup" 2>/dev/null && rm -rf "$backup" 2>/dev/null; then
    log "✅ Deleted: $(basename $backup)"
  else
    log "❌ Failed: $(basename $backup)"
  fi
done

# Final status
REMAINING=$(ls -1d "$BACKUP_DIR"/mediczy-backup-* 2>/dev/null | wc -l)
log "Remaining backups: $REMAINING"

# Disk space
DISK_USAGE=$(df -h "$BACKUP_DIR" | tail -1 | awk '{print $5}')
log "Disk usage: $DISK_USAGE"
log "=== Auto-Cleanup Complete ==="
echo "" >> "$LOG_FILE"
