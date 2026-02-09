#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/home/ubuntu/Mediczy"
ENV_FILE="$ROOT_DIR/.env.selenium"

if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

export USER_EMAIL="${USER_EMAIL:-}"
export USER_PASSWORD="${USER_PASSWORD:-}"
export DOCTOR_EMAIL="${DOCTOR_EMAIL:-}"
export DOCTOR_PASSWORD="${DOCTOR_PASSWORD:-}"
export ADMIN_EMAIL="${ADMIN_EMAIL:-}"
export ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
export BASE_URL="${BASE_URL:-https://mediqzy.com}"
export LOGIN_PATH="${LOGIN_PATH:-/login}"
export APPOINTMENTS_PATH="${APPOINTMENTS_PATH:-/appointments}"
export WALLET_PATH="${WALLET_PATH:-/wallet}"
export LABS_PATH="${LABS_PATH:-/labs}"
export PRESCRIPTIONS_PATH="${PRESCRIPTIONS_PATH:-/prescriptions}"
export NOTIFICATIONS_PATH="${NOTIFICATIONS_PATH:-/notifications}"
export DOCTOR_PATH="${DOCTOR_PATH:-/doctor}"
export ADMIN_PATH="${ADMIN_PATH:-/admin}"
export ADMIN_BASE_URL="${ADMIN_BASE_URL:-$BASE_URL}"
export ADMIN_LOGIN_PATH="${ADMIN_LOGIN_PATH:-$LOGIN_PATH}"
export SELENIUM_TIMEOUT="${SELENIUM_TIMEOUT:-20}"
export PYTHONUNBUFFERED=1

PYTHON_BIN="$ROOT_DIR/.venv-selenium/bin/python"
if [ -x "$PYTHON_BIN" ]; then
  "$PYTHON_BIN" "$ROOT_DIR/scripts/selenium/daily_ui_smoke.py"
else
  python3 "$ROOT_DIR/scripts/selenium/daily_ui_smoke.py"
fi
