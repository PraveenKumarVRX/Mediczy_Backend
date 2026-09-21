#!/usr/bin/env bash
# Backup integrity helpers (WP-0.7) — source from backup scripts.
#
# Why: production uses FORCE ROW LEVEL SECURITY. A dump taken by a role that cannot bypass it "succeeds" but
# silently omits the protected rows (patient tables). These helpers make that fail loudly and record the result.
#
#   assert_dump_role_reads_everything   the dumping role must be superuser or BYPASSRLS
#   verify_dump_row_counts <dump.sql>   per-table live vs dumped row counts for every RLS-protected table
#   record_backup_status <ok|fail> <detail>   writes logs/backup-status.json (read by scripts/health-check.sh)
#
# psql connection comes from the standard PG* variables (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE).
# Tolerance: a table fails when dumped rows < live rows - max(BACKUP_COUNT_TOL_ABS, live * BACKUP_COUNT_TOL_PCT / 100).
# The dump is a consistent snapshot taken BEFORE the live count, so live >= dump normally; a shortfall means rows are missing.

BACKUP_COUNT_TOL_ABS="${BACKUP_COUNT_TOL_ABS:-5}"
BACKUP_COUNT_TOL_PCT="${BACKUP_COUNT_TOL_PCT:-2}"

_bi_log() { echo "[backup-integrity $(date +%H:%M:%S)] $*"; }

record_backup_status() {
  local status="$1" detail="${2:-}" root="${ROOT:-${ROOT_DIR:-/home/ubuntu/Mediczy}}"
  mkdir -p "$root/logs" 2>/dev/null || return 0
  detail="${detail//\\/\\\\}"; detail="${detail//\"/\\\"}"; detail="${detail//$'\n'/ }"
  printf '{"status":"%s","detail":"%s","at":"%s","epoch":%s,"host":"%s"}\n' \
    "$status" "$detail" "$(date -u +%FT%TZ)" "$(date +%s)" "$(hostname)" > "$root/logs/backup-status.json"
}

# Returns 0 only when the connected role can read every row (superuser or BYPASSRLS).
assert_dump_role_reads_everything() {
  command -v psql >/dev/null 2>&1 || { _bi_log "psql not installed; cannot verify the dump role"; return 2; }
  local ok role
  role=$(psql -X -At -v ON_ERROR_STOP=1 -c "SELECT current_user" 2>/dev/null) || { _bi_log "cannot connect to check the dump role"; return 2; }
  ok=$(psql -X -At -v ON_ERROR_STOP=1 -c "SELECT (rolsuper OR rolbypassrls) FROM pg_roles WHERE rolname = current_user" 2>/dev/null) || return 2
  if [ "$ok" != "t" ]; then
    _bi_log "ROLE ${role} can NOT bypass row-level security: a dump by this role omits protected rows (patient data)."
    _bi_log "Use the RDS master user, or run: bash scripts/backup/enable-rds-backup-bypassrls.sh"
    return 1
  fi
  _bi_log "dump role ${role} can read every row (superuser/BYPASSRLS)"
  return 0
}

# Prints "schema.table<TAB>rows" for every COPY block of a plain-format dump.
_dump_copy_counts() {
  awk '/^COPY /{name=$2; gsub(/"/,"",name); inb=1; n=0; next}
       inb && /^\\\.$/{cnt[name]=n; inb=0; next}
       inb{n++}
       END{for (k in cnt) print k "\t" cnt[k]}' "$1"
}

# Returns 0 if every RLS-protected table is present in the dump with (about) its live row count.
# Writes <dump>.counts.tsv (table, live, dumped, ok|MISSING|SHORT).
verify_dump_row_counts() {
  local dump="$1" sidecar="$1.counts.tsv" bad=0 checked=0
  command -v psql >/dev/null 2>&1 || { _bi_log "psql not installed; cannot verify row counts"; return 2; }
  local tables
  tables=$(psql -X -At -v ON_ERROR_STOP=1 -c "SELECT n.nspname || '.' || c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r' AND c.relrowsecurity AND n.nspname NOT IN ('pg_catalog','information_schema') ORDER BY 1 LIMIT 500" 2>/dev/null) \
    || { _bi_log "cannot list row-level-security tables"; return 2; }
  local counts; counts="$(mktemp)"; _dump_copy_counts "$dump" > "$counts"
  : > "$sidecar"
  local t live dumped tol status
  while IFS= read -r t; do
    [ -n "$t" ] || continue
    live=$(psql -X -At -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM $(printf '%s' "$t" | sed -E 's/^([^.]+)\.(.+)$/"\1"."\2"/')" 2>/dev/null) || { _bi_log "cannot count $t"; bad=$((bad+1)); continue; }
    dumped=$(awk -F'\t' -v t="$t" '$1==t{print $2}' "$counts" | head -1)
    checked=$((checked+1))
    if [ -z "$dumped" ]; then
      if [ "$live" -gt 0 ]; then status="MISSING"; bad=$((bad+1)); else status="ok"; dumped=0; fi
    else
      tol=$(( live * BACKUP_COUNT_TOL_PCT / 100 )); [ "$tol" -lt "$BACKUP_COUNT_TOL_ABS" ] && tol="$BACKUP_COUNT_TOL_ABS"
      if [ "$dumped" -lt $(( live - tol )) ]; then status="SHORT"; bad=$((bad+1)); else status="ok"; fi
    fi
    printf '%s\t%s\t%s\t%s\n' "$t" "$live" "${dumped:-0}" "$status" >> "$sidecar"
  done <<< "$tables"
  rm -f "$counts"
  if [ "$bad" -gt 0 ]; then
    _bi_log "ROW COUNT MISMATCH in ${bad} of ${checked} protected table(s) — see ${sidecar}:"
    grep -v $'\tok$' "$sidecar" | sed 's/^/  /' | head -20
    return 1
  fi
  _bi_log "row counts match for ${checked} protected table(s) (${sidecar})"
  return 0
}
