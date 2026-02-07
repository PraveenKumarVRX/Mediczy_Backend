#!/bin/bash
# Interactive helper to create server/.env from .env.example
set -euo pipefail
TEMPLATE="$(dirname "$0")/../server/.env.example"
TARGET="$(dirname "$0")/../server/.env"

if [[ ! -f "$TEMPLATE" ]]; then
  echo "Template $TEMPLATE not found. Aborting."
  exit 1
fi

echo "This script will create server/.env from server/.env.example."
read -p "Proceed? (y/N): " PROCEED
if [[ "$PROCEED" != "y" && "$PROCEED" != "Y" ]]; then
  echo "Aborted by user."
  exit 0
fi

# Read values with defaults from example
read -p "DB_HOST (default: localhost): " DB_HOST
DB_HOST=${DB_HOST:-localhost}
read -p "DB_PORT (default: 5433): " DB_PORT
DB_PORT=${DB_PORT:-5433}
read -p "DB_NAME (default: mediczy_ai): " DB_NAME
DB_NAME=${DB_NAME:-mediczy_ai}
read -p "DB_USER (default: mediczy_helper): " DB_USER
DB_USER=${DB_USER:-mediczy_helper}
read -s -p "DB_PASSWORD (input will be hidden): " DB_PASSWORD
echo

read -p "REDIS_HOST (default: localhost): " REDIS_HOST
REDIS_HOST=${REDIS_HOST:-localhost}
read -p "REDIS_PORT (default: 6379): " REDIS_PORT
REDIS_PORT=${REDIS_PORT:-6379}

read -p "SECRET_TOKEN (leave blank to auto-generate): " SECRET_TOKEN
if [[ -z "$SECRET_TOKEN" ]]; then
  SECRET_TOKEN=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
  echo "Generated SECRET_TOKEN"
fi

read -p "ENCRYPTION_KEY (leave blank to auto-generate): " ENCRYPTION_KEY
if [[ -z "$ENCRYPTION_KEY" ]]; then
  ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  echo "Generated ENCRYPTION_KEY"
fi

cat > "$TARGET" << EOF
NODE_ENV=development
PORT=8000

SECRET_TOKEN=$SECRET_TOKEN
ENCRYPTION_KEY=$ENCRYPTION_KEY

DB_HOST=$DB_HOST
DB_PORT=$DB_PORT
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD

REDIS_HOST=$REDIS_HOST
REDIS_PORT=$REDIS_PORT

# Optional - leave blank if not used
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=

GROQ_API_KEY=
OPENAI_API_KEY=

LOG_LEVEL=info
EOF

chmod 600 "$TARGET"

echo "Created $TARGET with provided values. Please verify and restart the server."