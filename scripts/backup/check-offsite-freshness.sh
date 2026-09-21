#!/usr/bin/env bash
# Nightly check that the newest OFF-HOST database backup exists, is big enough and is recent (WP-0.7).
# Alerts through SLACK_WEBHOOK_URL / PAGERDUTY_ROUTING_KEY (same variables as scripts/health-check.sh) and exits 1.
#
#   bash scripts/backup/check-offsite-freshness.sh          # checks s3://$S3_BACKUP_BUCKET/db/
# Suggested cron (after the 02:00 backup and 03:00 offsite upload):
#   30 4 * * * /home/ubuntu/Mediczy/scripts/backup/check-offsite-freshness.sh >> /home/ubuntu/Mediczy/logs/backup.log 2>&1
#
# Env: S3_BACKUP_BUCKET (mediczy-backups), S3_BACKUP_PREFIX (db/), AWS_REGION, BACKUP_MAX_AGE_HOURS (26),
#      BACKUP_MIN_BYTES (1048576).
set -uo pipefail

ROOT="${ROOT:-/home/ubuntu/Mediczy}"
BUCKET="${S3_BACKUP_BUCKET:-mediczy-backups}"
PREFIX="${S3_BACKUP_PREFIX:-db/}"
REGION="${AWS_REGION:-ap-south-1}"
MAX_AGE_H="${BACKUP_MAX_AGE_HOURS:-26}"
MIN_BYTES="${BACKUP_MIN_BYTES:-1048576}"
# shellcheck disable=SC1091
source "$ROOT/scripts/backup/backup-integrity.lib.sh"

send_alert() {
  local message="$1"
  if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
    curl -s -m 5 -X POST -H 'Content-Type: application/json' -d "{\"text\": \"[Mediczy backup] ${message}\"}" "$SLACK_WEBHOOK_URL" > /dev/null 2>&1 || true
  fi
  if [[ -n "${PAGERDUTY_ROUTING_KEY:-}" ]]; then
    curl -s -m 5 -X POST -H 'Content-Type: application/json' \
      -d "{\"routing_key\": \"${PAGERDUTY_ROUTING_KEY}\", \"event_action\": \"trigger\", \"payload\": {\"summary\": \"${message}\", \"source\": \"mediczy-backup-check\", \"severity\": \"error\"}}" \
      "https://events.pagerduty.com/v2/enqueue" > /dev/null 2>&1 || true
  fi
}
fail() { echo "[backup-check $(date +%FT%T)] FAIL: $*" >&2; send_alert "$*"; record_backup_status fail "offsite: $*"; exit 1; }

command -v aws >/dev/null 2>&1 || fail "aws CLI not installed on $(hostname); cannot verify the off-host backup"

# Newest object under the prefix: "<epoch-seconds> <size> <key>" (empty when there is none).
newest=$(aws s3api list-objects-v2 --bucket "$BUCKET" --prefix "$PREFIX" --region "$REGION" \
  --query 'sort_by(Contents,&LastModified)[-1].[LastModified,Size,Key]' --output text 2>/dev/null) \
  || fail "could not list s3://${BUCKET}/${PREFIX} (credentials, network or bucket problem)"
[ -n "$newest" ] && [ "$newest" != "None" ] && [[ "$newest" != *"None"* ]] || fail "no off-host backup found under s3://${BUCKET}/${PREFIX}"

read -r modified size key <<< "$newest"
mod_epoch=$(date -d "$modified" +%s 2>/dev/null) || fail "unreadable timestamp '${modified}' for ${key}"
age_h=$(( ( $(date +%s) - mod_epoch ) / 3600 ))

[ "$size" -ge "$MIN_BYTES" ] 2>/dev/null || fail "newest off-host backup ${key} is only ${size} bytes (minimum ${MIN_BYTES}) — probably empty or truncated"
[ "$age_h" -le "$MAX_AGE_H" ] || fail "newest off-host backup ${key} is ${age_h}h old (maximum ${MAX_AGE_H}h) — the nightly upload has stopped"

echo "[backup-check $(date +%FT%T)] OK: ${key} (${size} bytes, ${age_h}h old)"
record_backup_status ok "offsite ${key} ${size} bytes ${age_h}h old"
