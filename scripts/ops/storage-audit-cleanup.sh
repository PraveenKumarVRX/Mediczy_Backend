#!/usr/bin/env bash
# Audit EC2 disk usage and optionally clean safe clutter + push DB backup offsite.
#
# Usage:
#   ./scripts/ops/storage-audit-cleanup.sh              # audit only
#   ./scripts/ops/storage-audit-cleanup.sh --cleanup    # audit + safe local cleanup
#   ./scripts/ops/storage-audit-cleanup.sh --aggressive # cleanup + dev artifacts (~10GB+)
#   ./scripts/ops/storage-audit-cleanup.sh --backup     # audit + pg_dump → S3/MinIO
#   ./scripts/ops/storage-audit-cleanup.sh --all        # cleanup + backup
#   ./scripts/ops/storage-audit-cleanup.sh --dry-run --aggressive
#
# Cron example:
#   0 2 * * *   .../scripts/backup/daily-offsite-backup.sh >> .../logs/backup.log 2>&1
#   30 3 1 * *  .../scripts/ops/storage-audit-cleanup.sh --cleanup >> .../logs/storage-cleanup.log 2>&1

set -euo pipefail

ROOT="${ROOT:-/home/ubuntu/Mediczy}"
HOME_DIR="${HOME_DIR:-/home/ubuntu}"
DRY_RUN=0
DO_CLEANUP=0
DO_BACKUP=0
DO_AGGRESSIVE=0
KEEP_BACKUPS="${KEEP_BACKUPS:-1}"
LOG_RETENTION_DAYS="${LOG_RETENTION_DAYS:-14}"
LOCAL_DB_BACKUP_KEEP="${LOCAL_DB_BACKUP_KEEP:-2}"

for arg in "$@"; do
  case "$arg" in
    --dry-run)    DRY_RUN=1 ;;
    --cleanup)    DO_CLEANUP=1 ;;
    --aggressive) DO_CLEANUP=1; DO_AGGRESSIVE=1 ;;
    --backup)     DO_BACKUP=1 ;;
    --all)        DO_CLEANUP=1; DO_BACKUP=1 ;;
    -h|--help)
      sed -n '2,15p' "$0"
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

run_rm() {
  local target="$1"
  if [ ! -e "$target" ]; then return 0; fi
  if [ "$DRY_RUN" -eq 1 ]; then
    log "[dry-run] rm -rf $target ($(du -sh "$target" 2>/dev/null | cut -f1 || echo '?'))"
  else
    log "→ rm -rf $target ($(du -sh "$target" 2>/dev/null | cut -f1 || echo '?'))"
    rm -rf "$target"
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

# Audit helpers must not abort on missing paths (pipefail + set -e)
safe_du_top() {
  local base="$1"
  local depth="${2:-1}"
  [ -d "$base" ] || return 0
  du -xh "$base" --max-depth="$depth" 2>/dev/null | sort -hr | head -12 || true
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
    safe_du_top "$base" 1
  fi
done

section "KNOWN CLUTTER CANDIDATES"
shopt -s nullglob

echo ""
log "Full-repo backups (mediczy-backup-*):"
BACKUP_COUNT=0
for _b in "$HOME_DIR"/mediczy-backup-*; do BACKUP_COUNT=$((BACKUP_COUNT + 1)); done
log "  count: ${BACKUP_COUNT}"
if [ "$BACKUP_COUNT" -gt 0 ]; then
  du -ch "$HOME_DIR"/mediczy-backup-* 2>/dev/null | tail -1 || true
else
  log "  (none)"
fi

echo ""
log "In-repo backups (${ROOT}/backups):"
human_du "$ROOT/backups" || log "  (none)"

echo ""
log "ai-engine breakdown (needed for SIB — do not delete venv/models):"
safe_du_top "$ROOT/ai-engine" 2

echo ""
log "Dev artifacts (safe to remove on prod with --aggressive):"
for path in \
  "$HOME_DIR/android-sdk" \
  "$HOME_DIR/MSH_D_App" \
  "$HOME_DIR/MSH_M_App" \
  "$ROOT/uat.sql" \
  "$ROOT/iOS_Ble_SDK-master" \
  "$ROOT/Android_Ble_SDK-master" \
  "$ROOT/whisper.cpp"; do
  human_du "$path" || true
done

echo ""
log "IDE / build caches:"
for path in \
  "$HOME_DIR/.vscode-server" \
  "$HOME_DIR/.gradle/caches" \
  "$HOME_DIR/.android/avd" \
  "$HOME_DIR/.npm" \
  "$HOME_DIR/.cache" \
  "$HOME_DIR/models"; do
  human_du "$path" || true
done

echo ""
log "Local SQL dumps:"
find "$HOME_DIR" "$ROOT" /tmp -maxdepth 2 \( -name '*.sql' -o -name '*.sql.gz' -o -name '*.dump' \) -type f -printf '%10s %p\n' 2>/dev/null | sort -hr | head -10 || true

echo ""
log "App logs (${ROOT}/logs):"
human_du "$ROOT/logs" || true

echo ""
log "Local DB backups (/var/backups/mediczy):"
human_du /var/backups/mediczy || true
ls -lht /var/backups/mediczy 2>/dev/null | head -6 || true

echo ""
log "Large files (>200MB):"
find "$HOME_DIR" "$ROOT" -xdev -type f -size +200M -printf '%10s %p\n' 2>/dev/null | sort -hr | head -15 || true

echo ""
log "Offsite backup targets:"
set +e
if command -v aws >/dev/null 2>&1; then
  if aws s3 ls "s3://mediczy-backups/db/" --region ap-south-1 2>/dev/null | tail -3; then
    log "  S3 mediczy-backups/db/ reachable"
  else
    log "  S3 mediczy-backups/db/ not reachable — run: aws s3 mb s3://mediczy-backups --region ap-south-1"
  fi
else
  log "  aws CLI not installed"
fi
if command -v mc >/dev/null 2>&1; then
  if mc ls "minio/mediczy-backups/db/" 2>/dev/null | tail -3; then
    log "  MinIO mediczy-backups/db/ reachable"
  else
    log "  MinIO not configured"
  fi
else
  log "  mc not installed"
fi
set -e

if [ "$DO_CLEANUP" -eq 1 ]; then
  section "CLEANUP (safe)"

  mapfile -t OLD_BACKUPS < <(ls -1d "$HOME_DIR"/mediczy-backup-* 2>/dev/null | sort -r || true)
  TO_DELETE=$(( ${#OLD_BACKUPS[@]} - KEEP_BACKUPS ))
  if [ "$TO_DELETE" -gt 0 ]; then
    for ((i=KEEP_BACKUPS; i<${#OLD_BACKUPS[@]}; i++)); do
      run_rm "${OLD_BACKUPS[$i]}"
    done
  else
    log "Repo backups within retention ($KEEP_BACKUPS)"
  fi

  run_cmd "find '$ROOT/logs' -type f -name '*.log' -mtime +$LOG_RETENTION_DAYS -delete"
  run_cmd "find '$ROOT/backups' -type f -mtime +14 -delete 2>/dev/null || true"

  mapfile -t LOCAL_DUMPS < <(ls -1t /var/backups/mediczy/*.sql.gz 2>/dev/null || true)
  for ((i=LOCAL_DB_BACKUP_KEEP; i<${#LOCAL_DUMPS[@]}; i++)); do
    run_cmd "rm -f '${LOCAL_DUMPS[$i]}'"
  done

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
  if command -v journalctl >/dev/null 2>&1; then
    run_cmd "sudo journalctl --vacuum-time=7d"
  fi
  if command -v docker >/dev/null 2>&1; then
    run_cmd "docker system prune -af --filter 'until=168h'"
  fi

  if [ "$DO_AGGRESSIVE" -eq 1 ]; then
    section "CLEANUP (aggressive — dev artifacts)"
    for path in \
      "$HOME_DIR/android-sdk" \
      "$HOME_DIR/MSH_D_App" \
      "$HOME_DIR/MSH_M_App" \
      "$ROOT/iOS_Ble_SDK-master" \
      "$ROOT/Android_Ble_SDK-master" \
      "$ROOT/whisper.cpp"; do
      run_rm "$path"
    done
    if [ -f "$ROOT/uat.sql" ]; then
      log "uat.sql found — upload offsite before deleting:"
      log "  aws s3 cp $ROOT/uat.sql s3://mediczy-backups/manual/uat-$(date +%Y%m%d).sql"
      run_rm "$ROOT/uat.sql"
    fi
    run_rm "$HOME_DIR/.gradle/caches"
    run_rm "$HOME_DIR/.vscode-server/data/CachedExtensionVSIXs"
    run_rm "$HOME_DIR/.android/avd"
    run_cmd "find '$HOME_DIR/.cache' -type f -atime +30 -delete 2>/dev/null || true"
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
log "Mode: cleanup=$DO_CLEANUP aggressive=$DO_AGGRESSIVE backup=$DO_BACKUP dry_run=$DRY_RUN"

shopt -u nullglob
