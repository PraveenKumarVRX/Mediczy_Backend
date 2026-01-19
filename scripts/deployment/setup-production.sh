#!/bin/bash

echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║         MEDICZY PRODUCTION SETUP WIZARD                          ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Check if .env already exists
if [ -f ".env" ]; then
    echo -e "${YELLOW}⚠ .env file already exists!${NC}"
    read -p "Do you want to overwrite it? (yes/no): " overwrite
    if [ "$overwrite" != "yes" ]; then
        echo "Setup cancelled. Exiting..."
        exit 0
    fi
fi

echo -e "${BLUE}This wizard will help you set up production environment variables.${NC}"
echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "  STEP 1: CRITICAL SECURITY"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Generate JWT Secret
echo -e "${YELLOW}Generating secure JWT secret...${NC}"
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
echo -e "${GREEN}✓ JWT secret generated${NC}"
echo ""

# Node Environment
read -p "Node environment (production/staging) [production]: " NODE_ENV
NODE_ENV=${NODE_ENV:-production}

# Port
read -p "Server port [8000]: " PORT
PORT=${PORT:-8000}

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "  STEP 2: DATABASE CONFIGURATION"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

read -p "Database host [localhost]: " DB_HOST
DB_HOST=${DB_HOST:-localhost}

read -p "Database name [mediczy]: " DB_NAME
DB_NAME=${DB_NAME:-mediczy}

read -p "Database user [root]: " DB_USER
DB_USER=${DB_USER:-root}

read -sp "Database password: " DB_PASSWORD
echo ""

read -p "Database port [3306]: " DB_PORT
DB_PORT=${DB_PORT:-3306}

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "  STEP 3: CORS CONFIGURATION"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

read -p "Allowed origins (comma-separated) [https://yourdomain.com]: " CORS_ORIGIN
CORS_ORIGIN=${CORS_ORIGIN:-https://yourdomain.com}

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "  STEP 4: OPTIONAL SERVICES (press Enter to skip)"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Redis
echo -e "${BLUE}Redis Configuration (for caching/sessions)${NC}"
read -p "Redis host [skip]: " REDIS_HOST
if [ -n "$REDIS_HOST" ]; then
    read -p "Redis port [6379]: " REDIS_PORT
    REDIS_PORT=${REDIS_PORT:-6379}
    read -sp "Redis password (if any): " REDIS_PASSWORD
    echo ""
fi

# Email/SMTP
echo ""
echo -e "${BLUE}Email/SMTP Configuration${NC}"
read -p "SMTP host [skip]: " SMTP_HOST
if [ -n "$SMTP_HOST" ]; then
    read -p "SMTP port [587]: " SMTP_PORT
    SMTP_PORT=${SMTP_PORT:-587}
    read -p "SMTP user: " SMTP_USER
    read -sp "SMTP password: " SMTP_PASSWORD
    echo ""
    read -p "From email: " FROM_EMAIL
    read -p "From name [Mediczy]: " FROM_NAME
    FROM_NAME=${FROM_NAME:-Mediczy}
fi

# SMS
echo ""
echo -e "${BLUE}SMS Configuration (Twilio)${NC}"
read -p "Twilio Account SID [skip]: " TWILIO_ACCOUNT_SID
if [ -n "$TWILIO_ACCOUNT_SID" ]; then
    read -p "Twilio Auth Token: " TWILIO_AUTH_TOKEN
    read -p "Twilio Phone Number: " TWILIO_PHONE_NUMBER
fi

# Agora
echo ""
echo -e "${BLUE}Agora Video Calling${NC}"
read -p "Agora App ID [skip]: " AGORA_APP_ID
if [ -n "$AGORA_APP_ID" ]; then
    read -p "Agora App Certificate: " AGORA_APP_CERTIFICATE
fi

# Payment Gateway
echo ""
echo -e "${BLUE}Payment Gateway (Razorpay)${NC}"
read -p "Razorpay Key ID [skip]: " RAZORPAY_KEY_ID
if [ -n "$RAZORPAY_KEY_ID" ]; then
    read -p "Razorpay Key Secret: " RAZORPAY_KEY_SECRET
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "  GENERATING .env FILE"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Create .env file
cat > .env << EOF
# ============================================
# MEDICZY PRODUCTION ENVIRONMENT
# Generated: $(date)
# ============================================

# Application
NODE_ENV=$NODE_ENV
PORT=$PORT

# Security - CRITICAL
JWT_SECRET=$JWT_SECRET

# Database
DB_HOST=$DB_HOST
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
DB_NAME=$DB_NAME
DB_PORT=$DB_PORT
DB_DIALECT=mysql

# CORS
CORS_ORIGIN=$CORS_ORIGIN

EOF

# Add optional services if configured
if [ -n "$REDIS_HOST" ]; then
    cat >> .env << EOF
# Redis
REDIS_HOST=$REDIS_HOST
REDIS_PORT=$REDIS_PORT
REDIS_PASSWORD=$REDIS_PASSWORD

EOF
fi

if [ -n "$SMTP_HOST" ]; then
    cat >> .env << EOF
# Email/SMTP
SMTP_HOST=$SMTP_HOST
SMTP_PORT=$SMTP_PORT
SMTP_USER=$SMTP_USER
SMTP_PASSWORD=$SMTP_PASSWORD
FROM_EMAIL=$FROM_EMAIL
FROM_NAME=$FROM_NAME

EOF
fi

if [ -n "$TWILIO_ACCOUNT_SID" ]; then
    cat >> .env << EOF
# SMS (Twilio)
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=$TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN=$TWILIO_AUTH_TOKEN
TWILIO_PHONE_NUMBER=$TWILIO_PHONE_NUMBER

EOF
fi

if [ -n "$AGORA_APP_ID" ]; then
    cat >> .env << EOF
# Agora Video
AGORA_APP_ID=$AGORA_APP_ID
AGORA_APP_CERTIFICATE=$AGORA_APP_CERTIFICATE

EOF
fi

if [ -n "$RAZORPAY_KEY_ID" ]; then
    cat >> .env << EOF
# Payment Gateway
RAZORPAY_KEY_ID=$RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET=$RAZORPAY_KEY_SECRET

EOF
fi

# Add defaults
cat >> .env << EOF
# Rate Limiting
RATE_LIMIT_WINDOW=900000
RATE_LIMIT_MAX=500
AUTH_RATE_LIMIT_MAX=20

# Session
SESSION_TIMEOUT=3600000

# Compliance
DATA_RETENTION_DAYS=2555
ENABLE_ENCRYPTION=true
ENABLE_AUDIT_LOGGING=true

# Monitoring
LOG_LEVEL=info
PROMETHEUS_ENABLED=true

# Feature Flags
DISABLE_KAFKA=true
MAINTENANCE_MODE=false
EOF

chmod 600 .env

echo -e "${GREEN}✓ .env file created successfully${NC}"
echo ""

# Show summary
echo "═══════════════════════════════════════════════════════════════════"
echo "  CONFIGURATION SUMMARY"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "Node Environment: $NODE_ENV"
echo "Port: $PORT"
echo "Database: $DB_USER@$DB_HOST:$DB_PORT/$DB_NAME"
echo "CORS Origins: $CORS_ORIGIN"
echo "JWT Secret: Generated (64 bytes)"
echo ""

# Optional services summary
[ -n "$REDIS_HOST" ] && echo "✓ Redis configured"
[ -n "$SMTP_HOST" ] && echo "✓ Email/SMTP configured"
[ -n "$TWILIO_ACCOUNT_SID" ] && echo "✓ SMS (Twilio) configured"
[ -n "$AGORA_APP_ID" ] && echo "✓ Agora Video configured"
[ -n "$RAZORPAY_KEY_ID" ] && echo "✓ Razorpay Payment configured"

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "  NEXT STEPS"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "1. Review .env file: cat .env"
echo "2. Test configuration: npm run start"
echo "3. Test logins: ./test-production-logins.sh"
echo "4. Set up SSL certificates (see PRODUCTION_CHECKLIST.md)"
echo "5. Configure backups"
echo "6. Set up monitoring"
echo ""
echo -e "${YELLOW}⚠ IMPORTANT SECURITY NOTES:${NC}"
echo "  - Never commit .env to git"
echo "  - Keep .env file permissions restrictive (600)"
echo "  - Use separate credentials for production"
echo "  - Enable SSL/HTTPS before going live"
echo "  - Review PRODUCTION_CHECKLIST.md for complete setup"
echo ""
echo -e "${GREEN}✓ Setup complete!${NC}"
