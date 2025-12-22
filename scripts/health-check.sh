#!/usr/bin/env bash
set -euo pipefail

BACKEND_OK=0
FRONTEND_OK=0
CLOUDFLARE_OK=0
INTELLIGENT_DB_OK=0
LLM_ORCHESTRATOR_OK=0
REDIS_OK=0
KAFKA_OK=0
PROMETHEUS_OK=0
GRAFANA_OK=0

# Backend health: port 8000 responding
if ss -tln | grep -q ":8000"; then
  if curl -s -m 5 http://localhost:8000/health > /dev/null 2>&1; then
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

if [[ $BACKEND_OK -eq 1 && $FRONTEND_OK -eq 1 && $CLOUDFLARE_OK -eq 1 && \
      $INTELLIGENT_DB_OK -eq 1 && $LLM_ORCHESTRATOR_OK -eq 1 && \
      $REDIS_OK -eq 1 && $KAFKA_OK -eq 1 && \
      $PROMETHEUS_OK -eq 1 && $GRAFANA_OK -eq 1 ]]; then
  echo "healthy"
  exit 0
fi

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
