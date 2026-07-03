#!/usr/bin/env bash
# Audit EC2 disk usage and optionally clean safe clutter + push DB backup offsite.
#
# Usage:
#   ./scripts/ops/storage-audit-cleanup.sh              # audit only
#   ./scripts/ops/storage-audit-cleanup.sh --cleanup    # audit + local cleanup
#   ./scripts/ops/storage-audit-cleanup.sh --backup     # audit + pg_dump → S3/MinIO
#   ./scripts/ops/storage-audit-cleanup.sh --all      # cleanup + backup
#   ./scripts/ops/storage-audit-cleanup.sh --dry-run --cleanup
#
# Cron example (audit weekly, cleanup monthly, backup daily):
#   15 3 * * 0  /home/ubuntu/Mediczy/scripts/ops/storage-audit-cleanup.sh >> /home/ubuntu/Mediczy/logs/storage-audit.log 2>&1
#   30 3 1 * *  /home/ubuntu/Mediczy/scripts/ops/storage-audit-cleanup.sh --cleanup >> /home/ubuntu/Mediczy/logs/storage-cleanup.log 2>&1
#   0 2 * * *   /home/ubuntu/Mediczy/scripts/backup/daily-offsite-backup.sh >> /home/ubuntu/Mediczy/logs/backup.log 2>&1

set -euo pipefail

ROOT="${ROOT:-/home/ubuntu/Mediczy}"
HOME_DIR="${HOME_DIR:-/home/ubuntu}"
DRY_RUN=0
DO_CLEANUP=0
DO_BACKUP=0
KEEP_BACKUPS="${KEEP_BACKUPS:-1}"
LOG_RETENTION_DAYS="${LOG_RETENTION_DAYS:-14}"
LOCAL_DB_BACKUP_DAYS="${LOCAL_DB_BACKUP_DAYS:-7}"

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --cleanup) DO_CLEANUP=1 ;;
    --backup)  DO_BACKUP=1 ;;
    --all)     DO_CLEANUP=1; DO_BACKUP=1 ;;
    -h|--help)
      sed -n '2,14p' "$0"
      exit 0
      ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

run_cmd() {
  if [ "$DRY_RUN" -eq 1 ]; then
    log "[dry-run] $*"
  else
    log "→ $*"
    eval "$@"
  fi
}

section() {
  echo ""
  log "══════════════════════════════════════════════════════════════"
  log "$1"
  log "══════════════════════════════════════════════════════════════"
}

human_du() {
  local path="$1"
  if [ -e "$path" ]; then
    du -sh "$path" 2>/dev/null | awk '{print $1 "\t" $2}'
  fi
}

section "DISK SUMMARY"
df -h / /home /var 2>/dev/null || df -h /
echo ""
log "Inode usage:"
df -i / 2>/dev/null | tail -1 || true

section "TOP SPACE USERS"
for base in "$HOME_DIR" "$ROOT" /var/backups /var/log /tmp; do
  if [ -d "$base" ]; then
    echo ""
    log "Largest under ${base}:"
    du -xh "$base" --max-depth=1 2>/dev/null | sort -hr | head -12 || true
  fi
done

section "KNOWN CLUTTER CANDIDATES"
echo ""
log "Full-repo backups (mediczy-backup-*):"
BACKUP_COUNT=$(ls -1d "$HOME_DIR"/mediczy-backup-* 2>/dev/null | wc -l | tr -d ' ')
log "  count: ${BACKUP_COUNT}"
ls -lhd "$HOME_DIR"/mediczy-backup-* 2>/dev/null | head -5 || log "  (none)"
du -ch "$HOME_DIR"/mediczy-backup-* 2>/dev/null | tail -1 || true

echo ""
log "Local SQL dumps:"
find "$HOME_DIR" "$ROOT" /tmp -maxdepth 2 \( -name '*.sql' -o -name '*.sql.gz' -o -name '*.dump' \) -type f -printf '%10s %p\n' 2>/dev/null | sort -hr | head -10 || true

echo ""
log "App logs (${ROOT}/logs):"
human_du "$ROOT/logs" || true
find "$ROOT/logs" -type f -name '*.log' -printf '%10s %TY-%Tm-%Td %p\n' 2>/dev/null | sort -hr | head -10 || true

echo ""
log "PM2 logs:"
human_du "$HOME_DIR/.pm2/logs" || true

echo ""
log "Local DB backups (/var/backups/mediczy):"
human_du /var/backups/mediczy || true
ls -lh /var/backups/mediczy 2>/dev/null | tail -10 || true

echo ""
log "Docker (if installed):"
if command -v docker >/dev/null 2>&1; then
  docker system df 2>/dev/null || true
else
  log "  docker not installed"
fi

echo ""
log "Large files (>200MB) under ${HOME_DIR} and ${ROOT}:"
find "$HOME_DIR" "$ROOT" -xdev -type f -size +200M -printf '%10s %p\n' 2>/dev/null | sort -hr | head -15 || true

echo ""
log "Offsite backup targets:"
if command -v aws >/dev/null 2>&1; then
  aws s3 ls "s3://${S3_BACKUP_BUCKET:-mediczy-backups}/db/" --region "${AWS_REGION:-ap-south-1}" 2>/dev/null | tail -5 \
    && log "  S3 mediczy-backups/db/ reachable" \
    || log "  S3 mediczy-backups/db/ not reachable (bucket missing or no IAM)"
else
  log "  aws CLI not installed"
fi
if command -v mc >/dev/null 2>&1; then
  mc ls "${MINIO_ALIAS:-minio}/${BACKUP_BUCKET:-mediczy-backups}/db/" 2>/dev/null | tail -5 \
    && log "  MinIO mediczy-backups/db/ reachable" \
    || log "  MinIO alias not configured (mc alias set minio ...)"
else
  log "  mc (MinIO client) not installed"
fi

if [ "$DO_CLEANUP" -eq 1 ]; then
  section "CLEANUP"
  BACKUP_SCRIPT="$ROOT/scripts/backup/backup-cleanup.sh"
  if [ -x "$BACKUP_SCRIPT" ] || [ -f "$BACKUP_SCRIPT" ]; then
    run_cmd "bash '$BACKUP_SCRIPT' '$HOME_DIR' '$KEEP_BACKUPS'"
  else
  mapfile -t OLD_BACKUPS < <(ls -1d "$HOME_DIR"/mediczy-backup-* 2>/dev/null | sort -r || true)
  TO_DELETE=$(( ${#OLD_BACKUPS[@]} - KEEP_BACKUPS ))
  if [ "$TO_DELETE" -gt 0 ]; then
    for ((i=KEEP_BACKUPS; i<${#OLD_BACKUPS[@]}; i++)); do
      run_cmd "chmod -R u+w '${OLD_BACKUPS[$i]}' && rm -rf '${OLD_BACKUPS[$i]}'"
    done
  else
    log "Repo backups within retention ($KEEP_BACKUPS)"
  fi
  fi

  run_cmd "find '$ROOT/logs' -type f -name '*.log' -mtime +$LOG_RETENTION_DAYS -delete"
  run_cmd "find /var/backups/mediczy -type f -name 'mediczy_db_*.sql.gz' -mtime +$LOCAL_DB_BACKUP_DAYS -delete 2>/dev/null || true"
  run_cmd "find '$HOME_DIR' '$ROOT' /tmp -maxdepth 2 -type f \\( -name '*.sql' -o -name '*.sql.gz' \\) -mtime +7 -delete 2>/dev/null || true"

  if command -v pm2 >/dev/null 2>&1; then
    run_cmd "pm2 flush"
  fi
  if command -v npm >/dev/null 2>&1; then
    run_cmd "npm cache clean --force"
  fi
  if command -v apt-get >/dev/null 2>&1; then
    run_cmd "sudo apt-get clean"
  fi
  if command -v docker >/dev/null 2>&1; then
    run_cmd "docker system prune -af --filter 'until=168h'"
  fi

  section "DISK AFTER CLEANUP"
  df -h / | tail -1
fi

if [ "$DO_BACKUP" -eq 1 ]; then
  section "OFFSITE BACKUP"
  BACKUP_OFFSITE="$ROOT/scripts/backup/daily-offsite-backup.sh"
  if [ -f "$BACKUP_OFFSITE" ]; then
    if [ "$DRY_RUN" -eq 1 ]; then
      log "[dry-run] would run $BACKUP_OFFSITE"
    else
      bash "$BACKUP_OFFSITE"
    fi
  else
    log "ERROR: $BACKUP_OFFSITE not found"
    exit 1
  fi
fi

section "DONE"
log "Mode: cleanup=$DO_CLEANUP backup=$DO_BACKUP dry_run=$DRY_RUN"
