#!/usr/bin/env bash
# Shared production pg_dump helpers — source from backup scripts.
# Requires: load-prod-env.sh already sourced; ROOT, PG_DUMP_LOG set.

RDS_INSTANCE_ID="${RDS_INSTANCE_ID:-mediczy-prod}"
AWS_REGION="${AWS_REGION:-ap-south-1}"
PG_DUMP_EXCLUDE_ARGS=()

pg_dump_log() {
  echo "[pg-dump $(date +%H:%M:%S)] $*"
}

pg_build_exclude_args() {
  PG_DUMP_EXCLUDE_ARGS=()
  local schemas="$1"
  [ -n "$schemas" ] || return 0
  IFS=',' read -ra _schemas <<< "$schemas"
  for _schema in "${_schemas[@]}"; do
    _schema="${_schema#"${_schema%%[![:space:]]*}"}"
    _schema="${_schema%"${_schema##*[![:space:]]}"}"
    [ -n "$_schema" ] || continue
    PG_DUMP_EXCLUDE_ARGS+=(--exclude-schema="$_schema")
  done
}

# pg_dump_prod_to_file <output.sql> — returns 0 on success
pg_dump_prod_to_file() {
  local outfile="$1"
  local user pass excludes errlog
  errlog="${PG_DUMP_LOG:-/tmp/pg_dump.err}"

  _try_dump() {
    user="$1" pass="$2" excludes="$3"
    pg_build_exclude_args "$excludes"
    pg_dump_log "Trying ${user}@${POSTGRES_HOST} (excludes: ${excludes:-none})"
    : >"$errlog"
    set +o pipefail
    PGPASSWORD="$pass" pg_dump \
      -h "${POSTGRES_HOST}" \
      -p "${POSTGRES_PORT:-5432}" \
      -U "$user" \
      -d "${POSTGRES_DATABASE}" \
      --no-password \
      --format=plain \
      --no-owner \
      --no-acl \
      "${PG_DUMP_EXCLUDE_ARGS[@]}" \
      >"$outfile" 2>"$errlog"
    local rc=$?
    set -o pipefail
    if [ "$rc" -eq 0 ] && [ -s "$outfile" ]; then
      pg_dump_log "OK (${user})"
      rm -f "$errlog"
      return 0
    fi
    pg_dump_log "Failed (${user}):"
    sed 's/^/  /' "$errlog" >&2 || true
    if grep -q 'password authentication failed' "$errlog" 2>/dev/null; then
      pg_dump_log "Hint: wrong password for ${user}"
    elif grep -q 'row-level security policy' "$errlog" 2>/dev/null; then
      pg_dump_log "Hint: ${user} cannot bypass FORCE RLS — run: bash scripts/backup/enable-rds-backup-bypassrls.sh"
    fi
    rm -f "$errlog"
    return 1
  }

  # 1. SSM RDS master password (if stored)
  if command -v aws >/dev/null 2>&1; then
    local ssm_pass ssm_err=0
    ssm_pass=$(aws ssm get-parameter --name /mediczy/prod/RDS_MASTER_PASSWORD \
      --with-decryption --region "$AWS_REGION" \
      --query Parameter.Value --output text 2>/dev/null) || ssm_err=1
    if [ "$ssm_err" -ne 0 ] || [ -z "$ssm_pass" ] || [ "$ssm_pass" = "None" ]; then
      pg_dump_log "SSM /mediczy/prod/RDS_MASTER_PASSWORD not readable (check IAM or run as ubuntu, not sudo)"
    elif [ "$ssm_pass" = "YOUR_RDS_POSTGRES_MASTER_PASSWORD" ] || [ "$ssm_pass" = "<rds-postgres-password>" ]; then
      pg_dump_log "SSM RDS_MASTER_PASSWORD is still a placeholder — set the real RDS postgres password"
    else
      _try_dump "${POSTGRES_BACKUP_USER:-postgres}" "$ssm_pass" "" && return 0
      pg_dump_log "RDS master password in SSM did not authenticate — reset RDS master password and update SSM"
    fi
  fi

  # 2. .env explicit master
  if [ "${RDS_MASTER_BACKUP:-}" = "true" ] && [ -n "${POSTGRES_BACKUP_PASSWORD:-}" ]; then
    _try_dump "${POSTGRES_BACKUP_USER:-postgres}" "$POSTGRES_BACKUP_PASSWORD" "" && return 0
  fi

  # 3. RDS Secrets Manager (if enabled)
  if command -v aws >/dev/null 2>&1; then
    local secret_arn secret_json
    secret_arn=$(aws rds describe-db-instances \
      --db-instance-identifier "$RDS_INSTANCE_ID" \
      --region "$AWS_REGION" \
      --query 'DBInstances[0].MasterUserSecret.SecretArn' \
      --output text 2>/dev/null || true)
    if [ -n "$secret_arn" ] && [ "$secret_arn" != "None" ]; then
      secret_json=$(aws secretsmanager get-secret-value \
        --secret-id "$secret_arn" --region "$AWS_REGION" \
        --query SecretString --output text 2>/dev/null || true)
      if [ -n "$secret_json" ]; then
        local muser mpass
        if command -v jq >/dev/null 2>&1; then
          muser=$(echo "$secret_json" | jq -r '.username // "postgres"')
          mpass=$(echo "$secret_json" | jq -r '.password // empty')
        else
          muser=$(echo "$secret_json" | sed -n 's/.*"username"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
          mpass=$(echo "$secret_json" | sed -n 's/.*"password"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
          muser="${muser:-postgres}"
        fi
        [ -n "$mpass" ] && _try_dump "$muser" "$mpass" "" && return 0
      fi
    fi
  fi

  # 4. App user — exclude n8n; may still fail on FORCE RLS tables without master
  _try_dump "${POSTGRES_USER:-mediczy_helper}" "${POSTGRES_PASSWORD}" "${PG_DUMP_EXCLUDE_SCHEMAS:-n8n}" && return 0

  return 1
}
