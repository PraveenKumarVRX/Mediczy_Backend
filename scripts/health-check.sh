#!/usr/bin/env bash
set -euo pipefail

# Alerting (added 2026-09-18 per audit finding: Prometheus alert rules and
# this script's own auto-recovery ran with no human-reachable notification
# at all — an outage could fire and reach no one). Reads real webhook/key
# values from environment variables, never from committed config —
# config/health-check-config.json's slack_webhook/pagerduty_key fields are
# placeholders and intentionally NOT read here. Set SLACK_WEBHOOK_URL and/or
# PAGERDUTY_ROUTING_KEY in the environment (e.g. the PM2 ecosystem file or
# systemd unit's Environment=) to activate; both are no-ops if unset, so
# this script's existing exit-code/output behavior is unchanged either way.
send_alert() {
  local message="$1"
  if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
    curl -s -m 5 -X POST -H 'Content-Type: application/json' \
      -d "{\"text\": \"[Mediczy health-check] ${message}\"}" \
      "$SLACK_WEBHOOK_URL" > /dev/null 2>&1 || true
  fi
  if [[ -n "${PAGERDUTY_ROUTING_KEY:-}" ]]; then
    curl -s -m 5 -X POST -H 'Content-Type: application/json' \
      -d "{\"routing_key\": \"${PAGERDUTY_ROUTING_KEY}\", \"event_action\": \"trigger\", \"payload\": {\"summary\": \"${message}\", \"source\": \"mediczy-health-check\", \"severity\": \"warning\"}}" \
      "https://events.pagerduty.com/v2/enqueue" > /dev/null 2>&1 || true
  fi
}

BACKEND_OK=0
FRONTEND_OK=0
CLOUDFLARE_OK=0
INTELLIGENT_DB_OK=0
LLM_ORCHESTRATOR_OK=0
REDIS_OK=0
KAFKA_OK=0
PROMETHEUS_OK=0
GRAFANA_OK=0

# Backend health: the API listens on 8888 (this check used to probe 8000, so it always reported the API down
# and "recovered" it by restarting it). /healthz does a real database round trip and returns only ok/unavailable.
if ss -tln | grep -q ":8888"; then
  if curl -sf -m 5 http://localhost:8888/healthz | grep -q '"ok"'; then
    BACKEND_OK=1
  fi
fi

# Intelligent DB health: port 5005 responding
if ss -tln | grep -q ":5005"; then
  if curl -s -m 5 http://localhost:5005/health | grep -q 'healthy'; then
    INTELLIGENT_DB_OK=1
  fi
fi

# LLM Orchestrator health: port 5000 responding
if ss -tln | grep -q ":5000"; then
  if curl -s -m 5 http://localhost:5000/health | grep -q 'healthy'; then
    LLM_ORCHESTRATOR_OK=1
  fi
fi

# Frontend health: nginx serving index
if curl -s -m 5 http://localhost | grep -q '<div id="root">'; then
  FRONTEND_OK=1
fi

# Cloudflared health: service active
if systemctl is-active --quiet cloudflared; then
  CLOUDFLARE_OK=1
fi

# Redis health: port 6379 responding
if systemctl is-active --quiet redis-server; then
  if redis-cli ping 2>/dev/null | grep -q PONG; then
    REDIS_OK=1
  fi
fi

# Kafka health: service active and port listening
if systemctl is-active --quiet kafka; then
  if ss -tln | grep -q ":9092"; then
    KAFKA_OK=1
  fi
fi

# Prometheus health: port 9090 responding
if systemctl is-active --quiet prometheus; then
  if curl -s -m 3 http://localhost:9090/-/healthy > /dev/null 2>&1; then
    PROMETHEUS_OK=1
  fi
fi

# Grafana health: port 3000 responding
if systemctl is-active --quiet grafana-server; then
  if curl -s -m 3 http://localhost:3000/api/health | grep -q 'ok'; then
    GRAFANA_OK=1
  fi
fi

# Backup status (written by scripts/database/backup-database.sh and scripts/backup/check-offsite-freshness.sh).
# Alert-only: a bad backup is not something restarting a service can fix, so it never triggers auto-recovery.
BACKUP_STATUS_FILE="${BACKUP_STATUS_FILE:-/home/ubuntu/Mediczy/logs/backup-status.json}"
BACKUP_MAX_AGE_HOURS="${BACKUP_MAX_AGE_HOURS:-26}"
if [[ -f "$BACKUP_STATUS_FILE" ]]; then
  b_status=$(sed -n 's/.*"status":"\([a-z]*\)".*/\1/p' "$BACKUP_STATUS_FILE")
  b_epoch=$(sed -n 's/.*"epoch":\([0-9]*\).*/\1/p' "$BACKUP_STATUS_FILE")
  b_age_h=$(( ( $(date +%s) - ${b_epoch:-0} ) / 3600 ))
  if [[ "$b_status" != "ok" ]]; then
    send_alert "Backup problem on $(hostname): $(sed -n 's/.*"detail":"\([^"]*\)".*/\1/p' "$BACKUP_STATUS_FILE")"
  elif [[ $b_age_h -gt $BACKUP_MAX_AGE_HOURS ]]; then
    send_alert "Backup status on $(hostname) is ${b_age_h}h old (max ${BACKUP_MAX_AGE_HOURS}h): the nightly backup did not report"
  fi
else
  send_alert "No backup status file on $(hostname) ($BACKUP_STATUS_FILE): the backup has never reported"
fi

if [[ $BACKEND_OK -eq 1 && $FRONTEND_OK -eq 1 && $CLOUDFLARE_OK -eq 1 && \
      $INTELLIGENT_DB_OK -eq 1 && $LLM_ORCHESTRATOR_OK -eq 1 && \
      $REDIS_OK -eq 1 && $KAFKA_OK -eq 1 && \
      $PROMETHEUS_OK -eq 1 && $GRAFANA_OK -eq 1 ]]; then
  echo "healthy"
  exit 0
fi

# A service was unhealthy — a human should know even if auto-recovery
# below succeeds, since a recurring restart is itself a signal something
# is wrong upstream.
FAILED=""
[[ $BACKEND_OK -eq 0 ]] && FAILED="${FAILED}backend "
[[ $INTELLIGENT_DB_OK -eq 0 ]] && FAILED="${FAILED}intelligent-db "
[[ $LLM_ORCHESTRATOR_OK -eq 0 ]] && FAILED="${FAILED}llm-orchestrator "
[[ $FRONTEND_OK -eq 0 ]] && FAILED="${FAILED}frontend/nginx "
[[ $CLOUDFLARE_OK -eq 0 ]] && FAILED="${FAILED}cloudflared "
[[ $REDIS_OK -eq 0 ]] && FAILED="${FAILED}redis "
[[ $KAFKA_OK -eq 0 ]] && FAILED="${FAILED}kafka "
[[ $PROMETHEUS_OK -eq 0 ]] && FAILED="${FAILED}prometheus "
[[ $GRAFANA_OK -eq 0 ]] && FAILED="${FAILED}grafana "
send_alert "Unhealthy on $(hostname): ${FAILED}— attempting auto-recovery"

# Attempt recovery
[[ $BACKEND_OK -eq 0 ]] && pm2 restart mediczy-server || true
[[ $INTELLIGENT_DB_OK -eq 0 ]] && pm2 restart intelligent-db || true
[[ $LLM_ORCHESTRATOR_OK -eq 0 ]] && pm2 restart llm-orchestrator || true
[[ $FRONTEND_OK -eq 0 ]] && systemctl restart nginx || true
[[ $CLOUDFLARE_OK -eq 0 ]] && systemctl restart cloudflared || true
[[ $REDIS_OK -eq 0 ]] && systemctl restart redis-server || true
[[ $KAFKA_OK -eq 0 ]] && systemctl restart kafka || true
[[ $PROMETHEUS_OK -eq 0 ]] && systemctl restart prometheus || true
[[ $GRAFANA_OK -eq 0 ]] && systemctl restart grafana-server || true

echo "recovered"
exit 0
