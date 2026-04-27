#!/usr/bin/env bash
# pgbouncer-sync.sh — Keep PgBouncer userlist.txt in sync with .env password
# Run this whenever POSTGRES_PASSWORD changes, or add to cron.
# Requires sudo for /etc/pgbouncer/userlist.txt
set -euo pipefail

ENV_FILE="$(cd "$(dirname "$0")" && pwd)/.env"
PGBOUNCER_USERLIST="/etc/pgbouncer/userlist.txt"
PGBOUNCER_INI="/etc/pgbouncer/pgbouncer.ini"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found" >&2; exit 1
fi

set -a; source "$ENV_FILE"; set +a

PG_USER="${POSTGRES_USER:-mediczy_helper}"
PG_PASS="${POSTGRES_PASSWORD:-}"
PG_HOST="${POSTGRES_HOST:-127.0.0.1}"
PG_PORT_DIRECT="${POSTGRES_DIRECT_PORT:-5432}"

if [[ -z "$PG_PASS" ]]; then
  echo "ERROR: POSTGRES_PASSWORD is not set in $ENV_FILE" >&2; exit 1
fi

# 1. Ensure pg_hba.conf allows scram-sha-256 for localhost
echo "🔧 Checking pg_hba.conf..."
if sudo grep -qE "^host\s+all\s+all\s+127\.0\.0\.1/32\s+scram-sha-256" /etc/postgresql/16/main/pg_hba.conf; then
  echo "   ✅ pg_hba.conf already uses scram-sha-256"
else
  echo "   ⚠️  pg_hba.conf does not use scram-sha-256 for 127.0.0.1 — fix manually"
fi

# 2. Write plaintext password to userlist.txt (required for SCRAM proxying)
echo "🔧 Updating $PGBOUNCER_USERLIST ..."
sudo bash -c "echo '\"${PG_USER}\" \"${PG_PASS}\"' > ${PGBOUNCER_USERLIST}"
echo "   ✅ userlist.txt updated"

# 3. Ensure auth_type = scram-sha-256 in pgbouncer.ini
echo "🔧 Checking $PGBOUNCER_INI auth_type ..."
CURRENT_AUTH=$(sudo grep "^auth_type" "$PGBOUNCER_INI" | awk '{print $3}')
if [[ "$CURRENT_AUTH" != "scram-sha-256" ]]; then
  sudo sed -i "s/^auth_type = .*/auth_type = scram-sha-256/" "$PGBOUNCER_INI"
  echo "   ✅ auth_type set to scram-sha-256"
else
  echo "   ✅ auth_type already scram-sha-256"
fi

# 4. Reload PgBouncer (graceful — no connections dropped)
echo "🔄 Reloading pgbouncer..."
sudo systemctl reload pgbouncer && echo "   ✅ pgbouncer reloaded"

# 5. Test connection through PgBouncer
echo "🔍 Testing PgBouncer connection (port 6432)..."
if PGPASSWORD="$PG_PASS" psql -h "$PG_HOST" -p 6432 -U "$PG_USER" -d "${POSTGRES_DATABASE:-mediczy_ai}" -c "SELECT 'pgbouncer_ok'" -t -q 2>&1 | grep -q pgbouncer_ok; then
  echo "   ✅ PgBouncer connection OK"
else
  echo "   ❌ PgBouncer connection FAILED — check: journalctl -u pgbouncer -n 20"
  exit 1
fi
