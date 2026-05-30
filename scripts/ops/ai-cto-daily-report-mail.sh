#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/home/ubuntu/Mediczy"
LOG_DIR="$ROOT_DIR/logs"
REPORT_DIR="$ROOT_DIR/docs/reports"
RUN_SCRIPT="$ROOT_DIR/scripts/ops/ai-cto-daily-4am.sh"
SMTP_REF_SCRIPT="$ROOT_DIR/scripts/video-smoke-test.sh"

mkdir -p "$LOG_DIR" "$REPORT_DIR"

DATE_UTC="$(date -u +"%Y-%m-%d")"
TS_UTC="$(date -u +"%Y-%m-%d %H:%M:%S UTC")"
HOSTNAME="$(hostname)"
REPORT_FILE="$REPORT_DIR/ai-cto-daily-report-${DATE_UTC}.md"
MAIL_BODY_FILE="/tmp/ai-cto-daily-mail-${DATE_UTC}.txt"
MAIL_OUT="/tmp/ai-cto-daily-mail-send.out"
MAIL_ERR="/tmp/ai-cto-daily-mail-send.err"

# Reuse the existing SMTP configuration used by live monitoring scripts.
ALERT_EMAIL="$(grep '^ALERT_EMAIL=' "$SMTP_REF_SCRIPT" | head -n1 | cut -d'"' -f2)"
SMTP_HOST="$(grep '^SMTP_HOST=' "$SMTP_REF_SCRIPT" | head -n1 | cut -d'"' -f2)"
SMTP_PORT="$(grep '^SMTP_PORT=' "$SMTP_REF_SCRIPT" | head -n1 | cut -d'"' -f2)"
SMTP_USER="$(grep '^SMTP_USER=' "$SMTP_REF_SCRIPT" | head -n1 | cut -d'"' -f2)"
SMTP_PASS="$(grep '^SMTP_PASS=' "$SMTP_REF_SCRIPT" | head -n1 | cut -d'"' -f2)"
SMTP_FROM="$(grep '^SMTP_FROM=' "$SMTP_REF_SCRIPT" | head -n1 | cut -d'"' -f2)"

if [[ -z "$ALERT_EMAIL" || -z "$SMTP_HOST" || -z "$SMTP_USER" || -z "$SMTP_PASS" ]]; then
  echo "[AI-CTO] Missing SMTP or recipient configuration in $SMTP_REF_SCRIPT" >&2
  exit 1
fi

RUN_STATUS="PASS"
RUN_EXIT_CODE=0
if ! "$RUN_SCRIPT"; then
  RUN_EXIT_CODE=$?
  RUN_STATUS="FAIL"
fi

LATEST_LOG_TAIL="$(tail -n 80 "$LOG_DIR/ai-cto-daily.log" 2>/dev/null || true)"

cat > "$REPORT_FILE" <<EOF
# AI CTO Daily Report

Date: ${DATE_UTC}
Generated At: ${TS_UTC}
Host: ${HOSTNAME}
Run Script: scripts/ops/ai-cto-daily-4am.sh

## Execution Status

- Status: ${RUN_STATUS}
- Exit Code: ${RUN_EXIT_CODE}

## Log Snapshot (last 80 lines)

\`\`\`
${LATEST_LOG_TAIL}
\`\`\`

## Notes

- This report is auto-generated and emailed daily.
- SMTP and recipient are sourced from scripts/video-smoke-test.sh.
EOF

SUBJECT="Mediqzy AI CTO Daily Report - ${DATE_UTC} [${RUN_STATUS}]"

{
  echo "From: ${SMTP_FROM}"
  echo "To: ${ALERT_EMAIL}"
  echo "Subject: ${SUBJECT}"
  echo "Content-Type: text/plain; charset=UTF-8"
  echo "Date: $(date -R)"
  echo "Message-ID: <ai-cto-daily-$(date +%s)@${HOSTNAME}>"
  echo
  echo "AI CTO Daily Report"
  echo "Date: ${DATE_UTC}"
  echo "Generated At: ${TS_UTC}"
  echo "Status: ${RUN_STATUS}"
  echo "Exit Code: ${RUN_EXIT_CODE}"
  echo
  echo "Report File: ${REPORT_FILE}"
  echo
  echo "Recent Log Summary:"
  tail -n 20 "$LOG_DIR/ai-cto-daily.log" 2>/dev/null || true
} > "$MAIL_BODY_FILE"

curl -sS --ssl-reqd \
  --url "smtps://${SMTP_HOST}:${SMTP_PORT}" \
  --user "${SMTP_USER}:${SMTP_PASS}" \
  --mail-from "${SMTP_USER}" \
  --mail-rcpt "${ALERT_EMAIL}" \
  --upload-file "$MAIL_BODY_FILE" >"$MAIL_OUT" 2>"$MAIL_ERR"

MAIL_EXIT_CODE=$?
if [[ $MAIL_EXIT_CODE -ne 0 ]]; then
  echo "[AI-CTO] Email send failed with exit code ${MAIL_EXIT_CODE}" >&2
  if [[ -s "$MAIL_ERR" ]]; then
    cat "$MAIL_ERR" >&2
  fi
  exit $MAIL_EXIT_CODE
fi

echo "[AI-CTO] Report generated: ${REPORT_FILE}"
echo "[AI-CTO] Email sent to: ${ALERT_EMAIL}"
