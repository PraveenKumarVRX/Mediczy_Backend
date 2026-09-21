#!/usr/bin/env bash
# Tests for scripts/backup/backup-integrity.lib.sh against the LOCAL database only.
# Run as the postgres OS user (unix socket, database mediczy_ai):   sudo -u postgres bash scripts/backup/test-backup-integrity.sh
# Creates and removes a throwaway schema (bk_integrity_test) and role (bk_integrity_limited).
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
[ "$(id -un)" = "postgres" ] || { echo "ABORT: run as OS user postgres" >&2; exit 2; }
export PGHOST=/var/run/postgresql PGDATABASE=mediczy_ai PGUSER=postgres
[ "$(psql -X -At -c 'SELECT inet_server_addr() IS NULL')" = "t" ] || { echo "ABORT: not a unix-socket connection" >&2; exit 2; }
[ "$(psql -X -At -c 'SELECT current_database()')" = "mediczy_ai" ] || { echo "ABORT: unexpected database" >&2; exit 2; }
# shellcheck disable=SC1091
source "$ROOT/scripts/backup/backup-integrity.lib.sh"
export ROOT="$(mktemp -d)"   # keep status files out of the repo
TMP="$(mktemp -d)"; PASS=0; FAILN=0
t() { if [ "$2" = "0" ]; then PASS=$((PASS+1)); echo "PASS  $1"; else FAILN=$((FAILN+1)); echo "FAIL  $1"; fi; }
cleanup() { psql -X -q -c "DROP SCHEMA IF EXISTS bk_integrity_test CASCADE" -c "DROP ROLE IF EXISTS bk_integrity_limited" >/dev/null 2>&1; rm -rf "$TMP" "$ROOT"; }
trap cleanup EXIT
cleanup >/dev/null 2>&1; TMP="$(mktemp -d)"; ROOT="$(mktemp -d)"; export ROOT

psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA bk_integrity_test;
CREATE TABLE bk_integrity_test.patients (id serial PRIMARY KEY, org int NOT NULL, name text);
INSERT INTO bk_integrity_test.patients (org, name) SELECT (g % 3), 'p' || g FROM generate_series(1, 200) g;
ALTER TABLE bk_integrity_test.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE bk_integrity_test.patients FORCE ROW LEVEL SECURITY;
CREATE POLICY p_org ON bk_integrity_test.patients USING (org = 1);
CREATE ROLE bk_integrity_limited NOLOGIN NOBYPASSRLS;
SQL

# 1. role check
assert_dump_role_reads_everything >/dev/null; t "superuser role is accepted" $?
PGOPTIONS='-c role=bk_integrity_limited' assert_dump_role_reads_everything >/dev/null; rc=$?; [ $rc -eq 1 ]; t "a role that cannot bypass RLS is REJECTED" $?

# 2. a complete dump passes the row-count check
pg_dump --no-owner --no-acl --format=plain -d mediczy_ai > "$TMP/full.sql" 2>/dev/null
verify_dump_row_counts "$TMP/full.sql" >/dev/null; t "a complete dump passes the row-count check" $?
grep -q "bk_integrity_test.patients.*200.*ok" "$TMP/full.sql.counts.tsv" 2>/dev/null || awk -F'\t' '$1=="bk_integrity_test.patients" && $2==200 && $3==200 && $4=="ok"{f=1} END{exit !f}' "$TMP/full.sql.counts.tsv"; t "the sidecar records live and dumped counts (200/200)" $?

# 3. a dump missing rows of a protected table fails (what a non-bypass role would produce)
awk '/^COPY bk_integrity_test.patients /{print; inb=1; n=0; next} inb && /^\\\.$/{inb=0; print; next} inb{n++; if (n>150) next} {print}' "$TMP/full.sql" > "$TMP/short.sql"
verify_dump_row_counts "$TMP/short.sql" >/dev/null 2>&1; rc=$?; [ $rc -eq 1 ]; t "a dump with only 150 of 200 rows is rejected (SHORT)" $?
grep -q $'bk_integrity_test.patients\t200\t150\tSHORT' "$TMP/short.sql.counts.tsv"; t "the sidecar names the short table" $?

# 4. a dump with a protected table missing entirely fails
awk '/^COPY bk_integrity_test.patients /{skip=1; next} skip && /^\\\.$/{skip=0; next} !skip{print}' "$TMP/full.sql" > "$TMP/missing.sql"
verify_dump_row_counts "$TMP/missing.sql" >/dev/null 2>&1; rc=$?; [ $rc -eq 1 ]; t "a dump missing a protected table is rejected (MISSING)" $?
grep -q $'bk_integrity_test.patients\t200\t0\tMISSING' "$TMP/missing.sql.counts.tsv"; t "the sidecar reports MISSING" $?

# 5. small live growth during the dump is tolerated
awk '/^COPY bk_integrity_test.patients /{print; inb=1; n=0; next} inb && /^\\\.$/{inb=0; print; next} inb{n++; if (n>197) next} {print}' "$TMP/full.sql" > "$TMP/tol.sql"
verify_dump_row_counts "$TMP/tol.sql" >/dev/null 2>&1; t "3 rows fewer than live (within tolerance) is accepted" $?

# 6. status file
record_backup_status fail 'quote " and \ backslash'; grep -q '"status":"fail"' "$ROOT/logs/backup-status.json" && python3 -c "import json,sys; json.load(open('$ROOT/logs/backup-status.json'))"; t "status file is valid JSON even with quotes in the detail" $?
record_backup_status ok fine; grep -q '"status":"ok"' "$ROOT/logs/backup-status.json"; t "status file records ok" $?

echo; echo "$PASS passed, $FAILN failed"; [ "$FAILN" -eq 0 ]
