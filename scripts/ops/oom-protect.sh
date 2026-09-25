#!/bin/bash
# oom-protect.sh — make the kernel / earlyoom sacrifice developer tooling before production services.
#
# Why: this box runs production (nginx, PM2 apps, Redis, Postgres) AND the VS Code remote server
# (extension host, TS language server, Claude Code, Codex, ESLint...) which routinely holds 5-7GB.
# earlyoom (see /etc/default/earlyoom) and the kernel pick victims by oom_score, which includes
# oom_score_adj. Postgres was already at -900; nginx, Redis, the PM2 daemon and every PM2 app sat at 0,
# i.e. the same footing as the IDE. This puts prod at -500 and dev tooling at +300.
#
# Idempotent and harmless: only writes /proc/<pid>/oom_score_adj. It does not restart anything.
# PM2 apps started or reloaded AFTER the daemon is protected inherit its value automatically, so this
# only needs re-running if the PM2 daemon itself was restarted.
#
# Usage: sudo bash scripts/ops/oom-protect.sh        (needs root to LOWER a value)
#        sudo bash scripts/ops/oom-protect.sh --show  (print current scores, change nothing)

set -euo pipefail

PROD_ADJ="${PROD_ADJ:--500}"
DEV_ADJ="${DEV_ADJ:-300}"

set_adj() { # pid adj
  [ -w "/proc/$1/oom_score_adj" ] && echo "$2" > "/proc/$1/oom_score_adj" 2>/dev/null || true
}

show() {
  printf "%-8s %-6s %-6s %s\n" PID SCORE ADJ COMMAND
  for p in "$@"; do
    [ -d "/proc/$p" ] || continue
    printf "%-8s %-6s %-6s %s\n" "$p" "$(cat /proc/$p/oom_score)" "$(cat /proc/$p/oom_score_adj)" \
      "$(tr '\0' ' ' < /proc/$p/cmdline | cut -c1-80)"
  done
}

prod_pids() {
  # PM2 God daemon + every app it manages, nginx, redis, pgbouncer, prometheus, Orthanc
  pgrep -f "PM2 v[0-9.]*: God Daemon" || true
  command -v pm2 >/dev/null && pm2 jlist 2>/dev/null | python3 -c \
    "import sys,json; [print(p['pid']) for p in json.load(sys.stdin) if p.get('pid')]" 2>/dev/null || true
  pgrep -x nginx || true
  pgrep -x redis-server || true
  pgrep -x pgbouncer || true
}

dev_pids() {
  # everything the VS Code remote server spawned: extension host, tsc LSP, eslint, Claude Code, Codex...
  pgrep -f "\.vscode-server" || true
}

if [ "${1:-}" = "--show" ]; then
  show $(prod_pids | sort -un) $(dev_pids | sort -un)
  exit 0
fi

for p in $(prod_pids | sort -un); do set_adj "$p" "$PROD_ADJ"; done
for p in $(dev_pids | sort -un); do set_adj "$p" "$DEV_ADJ"; done

echo "prod services -> oom_score_adj $PROD_ADJ; VS Code remote tooling -> $DEV_ADJ"
