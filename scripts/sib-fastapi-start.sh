#!/bin/bash
# SIB FastAPI Startup Script with Port Cleanup
# This script ensures port 8001 is free before starting the FastAPI server

set -e

PORT=8001
APP_DIR="/home/ubuntu/Mediczy/ai-engine/doctor_bot"
VENV_UVICORN="$APP_DIR/venv/bin/uvicorn"

# Keep provider configuration in SSM across reboots and PM2 restarts. The
# OpenAI key is exported only to this process; it is never printed.
if command -v aws >/dev/null 2>&1; then
    SSM_REGION="${AWS_REGION:-ap-south-1}"
    SSM_PATH="${SSM_PARAM_PATH:-/mediczy/prod}"
    load_ssm_value() {
        aws ssm get-parameter \
            --region "$SSM_REGION" \
            --name "$SSM_PATH/$1" \
            --with-decryption \
            --query 'Parameter.Value' \
            --output text 2>/dev/null || true
    }

    OPENAI_API_KEY_SSM="$(load_ssm_value OPENAI_API_KEY)"
    OPENAI_MODEL_SSM="$(load_ssm_value OPENAI_MODEL)"
    SIB_PRIMARY_PROVIDER_SSM="$(load_ssm_value SIB_PRIMARY_PROVIDER)"

    [ -n "$OPENAI_API_KEY_SSM" ] && export OPENAI_API_KEY="$OPENAI_API_KEY_SSM"
    [ -n "$OPENAI_MODEL_SSM" ] && export OPENAI_MODEL="$OPENAI_MODEL_SSM"
    [ -n "$SIB_PRIMARY_PROVIDER_SSM" ] && export SIB_PRIMARY_PROVIDER="$SIB_PRIMARY_PROVIDER_SSM"

    # Fetch only runtime DB values; an inherited UAT .env must not select production's target.
    for DB_RUNTIME_KEY in POSTGRES_HOST POSTGRES_PORT POSTGRES_DATABASE POSTGRES_USER POSTGRES_PASSWORD POSTGRES_SSL; do
        DB_RUNTIME_VALUE="$(load_ssm_value "$DB_RUNTIME_KEY")"
        if [ -z "$DB_RUNTIME_VALUE" ] || [ "$DB_RUNTIME_VALUE" = "None" ]; then
            echo "Missing production database parameter: $DB_RUNTIME_KEY" >&2
            exit 1
        fi
        export "$DB_RUNTIME_KEY=$DB_RUNTIME_VALUE"
    done
    unset DB_RUNTIME_KEY DB_RUNTIME_VALUE
    export PGSSLMODE=verify-full
    export PGSSLROOTCERT="${POSTGRES_SSL_CA_FILE:-/home/ubuntu/Mediczy/server/db/certs/aws-rds-ap-south-1.pem}"
    unset OPENAI_API_KEY_SSM OPENAI_MODEL_SSM SIB_PRIMARY_PROVIDER_SSM
fi

# Wait for port to be available (with timeout)
MAX_WAIT=30
WAIT_COUNT=0

echo "[$(date)] SIB FastAPI pre-start: Waiting for port $PORT to be free..."

while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
    # Check if port is in use
    if ! lsof -i:$PORT -t >/dev/null 2>&1; then
        echo "[$(date)] Port $PORT is free"
        break
    fi
    
    # Only try to kill on first attempt
    if [ $WAIT_COUNT -eq 0 ]; then
        echo "[$(date)] Port $PORT is in use, attempting cleanup..."
        # Kill any process using the port (except our own)
        CURRENT_PID=$$
        for PID in $(lsof -i:$PORT -t 2>/dev/null || true); do
            if [ "$PID" != "$CURRENT_PID" ]; then
                echo "[$(date)] Killing process $PID using port $PORT"
                kill -9 $PID 2>/dev/null || true
            fi
        done
    fi
    
    WAIT_COUNT=$((WAIT_COUNT + 1))
    sleep 1
done

if [ $WAIT_COUNT -ge $MAX_WAIT ]; then
    echo "[$(date)] ERROR: Port $PORT still in use after ${MAX_WAIT}s timeout"
    exit 1
fi

# Extra pause to ensure port is fully released
sleep 2

echo "[$(date)] Starting SIB FastAPI server..."
cd "$APP_DIR"
exec $VENV_UVICORN app:app --host 0.0.0.0 --port $PORT
