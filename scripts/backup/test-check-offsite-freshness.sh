#!/usr/bin/env bash
# Tests scripts/backup/check-offsite-freshness.sh with a stubbed `aws` (no network, no AWS access).
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STUB="$(mktemp -d)"; export ROOT_TEST_LOGS="$(mktemp -d)"; PASS=0; FAILN=0
trap 'rm -rf "$STUB" "$ROOT_TEST_LOGS"' EXIT
t() { if [ "$2" = "0" ]; then PASS=$((PASS+1)); echo "PASS  $1"; else FAILN=$((FAILN+1)); echo "FAIL  $1"; fi; }
# The stub prints whatever $STUB_AWS_OUT holds, or fails when STUB_AWS_FAIL=1.
cat > "$STUB/aws" <<'SH'
#!/usr/bin/env bash
[ "${STUB_AWS_FAIL:-0}" = "1" ] && { echo "AccessDenied" >&2; exit 254; }
printf '%s\n' "${STUB_AWS_OUT:-}"
SH
chmod +x "$STUB/aws"
run() { ROOT="$ROOT_TEST_LOGS/r" PATH="$STUB:$PATH" bash -c "mkdir -p \"$ROOT_TEST_LOGS/r/scripts/backup\" \"$ROOT_TEST_LOGS/r/logs\"; cp \"$ROOT/scripts/backup/backup-integrity.lib.sh\" \"$ROOT_TEST_LOGS/r/scripts/backup/\"; bash \"$ROOT/scripts/backup/check-offsite-freshness.sh\"" >"$ROOT_TEST_LOGS/out.txt" 2>&1; }
iso() { date -u -d "$1 ago" +%FT%TZ; }

STUB_AWS_OUT="$(iso '3 hours')	52428800	db/2026-09-21/mediczy_ai.sql.gz" run; rc=$?; [ $rc -eq 0 ]; t "a recent, large object passes" $?
grep -q '"status":"ok"' "$ROOT_TEST_LOGS/r/logs/backup-status.json"; t "an OK result is recorded for the health check" $?
STUB_AWS_OUT="$(iso '40 hours')	52428800	db/2026-09-19/mediczy_ai.sql.gz" run; rc=$?; [ $rc -eq 1 ] && grep -q "h old" "$ROOT_TEST_LOGS/out.txt"; t "a 40-hour-old object fails as stale" $?
grep -q '"status":"fail"' "$ROOT_TEST_LOGS/r/logs/backup-status.json"; t "a failure is recorded" $?
STUB_AWS_OUT="$(iso '1 hours')	120	db/2026-09-21/mediczy_ai.sql.gz" run; rc=$?; [ $rc -eq 1 ] && grep -q "bytes" "$ROOT_TEST_LOGS/out.txt"; t "a 120-byte object fails as truncated" $?
STUB_AWS_OUT="None	None	None" run; rc=$?; [ $rc -eq 1 ] && grep -q "no off-host backup" "$ROOT_TEST_LOGS/out.txt"; t "an empty prefix fails as missing" $?
STUB_AWS_OUT="" run; rc=$?; [ $rc -eq 1 ]; t "no output at all fails" $?
STUB_AWS_FAIL=1 run; rc=$?; [ $rc -eq 1 ] && grep -q "could not list" "$ROOT_TEST_LOGS/out.txt"; t "an AWS error fails (never reported as fresh)" $?
STUB_AWS_OUT="not-a-date	52428800	db/x" run; rc=$?; [ $rc -eq 1 ]; t "an unreadable timestamp fails" $?
echo; echo "$PASS passed, $FAILN failed"; [ "$FAILN" -eq 0 ]
