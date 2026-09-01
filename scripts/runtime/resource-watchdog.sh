#!/usr/bin/env bash
set -euo pipefail

# Resource watchdog for SSH/VS Code stability.
# - Logs regular snapshots
# - Emits ALERT lines when thresholds are crossed
# - Optionally sends webhook notifications

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOG_DIR="$ROOT_DIR/logs/health-checks"
LOG_FILE="$LOG_DIR/resource-watchdog.log"

mkdir -p "$LOG_DIR"

HOSTNAME_VAL="$(hostname)"
NOW="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

# Thresholds can be overridden via env
DISK_WARN_PCT="${DISK_WARN_PCT:-85}"
DISK_PRUNE_PCT="${DISK_PRUNE_PCT:-90}"
MEM_AVAIL_WARN_MB="${MEM_AVAIL_WARN_MB:-2048}"
SWAP_USED_WARN_PCT="${SWAP_USED_WARN_PCT:-70}"
LOAD_WARN="${LOAD_WARN:-8.0}"
ALERT_WEBHOOK_URL="${ALERT_WEBHOOK_URL:-}"

# Dev-tool caches that are always safe to clear — never model weights, DB volumes,
# or anything the running app reads. Same list used for the 2026-08-19/21 disk-full
# incidents; re-populates harmlessly from normal package-manager/build activity.
prune_dev_caches() {
  local before after freed_pct
  before="$(df -P / | awk 'NR==2 {gsub(/%/,"",$5); print $5}')"

  npm cache clean --force >/dev/null 2>&1 || true
  pip cache purge >/dev/null 2>&1 || true
  rm -rf /home/ubuntu/.cache/ms-playwright/* /home/ubuntu/.cache/puppeteer/* \
         /home/ubuntu/.cache/typescript/* /home/ubuntu/.cache/copilot/* \
         /home/ubuntu/.cache/cloud-code/* /home/ubuntu/.cache/n8n/* \
         /home/ubuntu/.cache/prisma/* /home/ubuntu/.cache/pip/* 2>/dev/null || true
  rm -rf /home/ubuntu/.gradle/caches/* /home/ubuntu/.gradle/wrapper/* \
         /home/ubuntu/.gradle/daemon/* 2>/dev/null || true
  rm -rf /home/ubuntu/.codeium/* /home/ubuntu/.gemini/* /home/ubuntu/.codex/* \
         /home/ubuntu/.antigravity-server/* 2>/dev/null || true
  find "$ROOT_DIR/logs" -name '*__2026-*' -mtime +0 -delete 2>/dev/null || true

  after="$(df -P / | awk 'NR==2 {gsub(/%/,"",$5); print $5}')"
  freed_pct=$(( before - after ))
  echo "${NOW} PRUNE host=${HOSTNAME_VAL} disk_before=${before}% disk_after=${after}% freed=${freed_pct}pp" >> "$LOG_FILE"
  logger -t mediczy-resource-watchdog "Auto-pruned dev caches: ${before}% -> ${after}% disk usage"
}

disk_pct="$(df -P / | awk 'NR==2 {gsub(/%/,"",$5); print $5}')"
mem_avail_mb="$(free -m | awk '/Mem:/ {print $7}')"
swap_used_mb="$(free -m | awk '/Swap:/ {print $3}')"
swap_total_mb="$(free -m | awk '/Swap:/ {print $2}')"
load_1m="$(uptime | awk -F'load average: ' '{print $2}' | awk -F', ' '{print $1}')"

if [[ "$swap_total_mb" -gt 0 ]]; then
  swap_used_pct=$(( swap_used_mb * 100 / swap_total_mb ))
else
  swap_used_pct=0
fi

status="OK"
alerts=()

if [[ "$disk_pct" -ge "$DISK_WARN_PCT" ]]; then
  status="ALERT"
  alerts+=("disk ${disk_pct}% >= ${DISK_WARN_PCT}%")
fi

if [[ "$disk_pct" -ge "$DISK_PRUNE_PCT" ]]; then
  prune_dev_caches
  disk_pct="$(df -P / | awk 'NR==2 {gsub(/%/,"",$5); print $5}')"
fi

if [[ "$mem_avail_mb" -le "$MEM_AVAIL_WARN_MB" ]]; then
  status="ALERT"
  alerts+=("mem_available ${mem_avail_mb}MB <= ${MEM_AVAIL_WARN_MB}MB")
fi

if [[ "$swap_used_pct" -ge "$SWAP_USED_WARN_PCT" ]]; then
  status="ALERT"
  alerts+=("swap_used ${swap_used_pct}% >= ${SWAP_USED_WARN_PCT}%")
fi

load_warn_exceeded="$(awk -v l="$load_1m" -v w="$LOAD_WARN" 'BEGIN {print (l > w) ? 1 : 0}')"
if [[ "$load_warn_exceeded" -eq 1 ]]; then
  status="ALERT"
  alerts+=("load_1m ${load_1m} > ${LOAD_WARN}")
fi

base_msg="${NOW} host=${HOSTNAME_VAL} status=${status} disk=${disk_pct}% mem_avail=${mem_avail_mb}MB swap=${swap_used_pct}% load1=${load_1m}"
echo "$base_msg" >> "$LOG_FILE"

if [[ "$status" == "ALERT" ]]; then
  alert_msg="${NOW} ALERT host=${HOSTNAME_VAL} issues=[$(IFS='; '; echo "${alerts[*]}")]"
  echo "$alert_msg" >> "$LOG_FILE"
  logger -t mediczy-resource-watchdog "$alert_msg"

  if [[ -n "$ALERT_WEBHOOK_URL" ]]; then
    escaped_alert_msg="$(printf '%s' "$alert_msg" | sed 's/"/\\"/g')"
    payload="{\"text\":\"${escaped_alert_msg}\"}"
    curl -sS -m 5 -H 'Content-Type: application/json' -d "$payload" "$ALERT_WEBHOOK_URL" >/dev/null || true
  fi
fi
