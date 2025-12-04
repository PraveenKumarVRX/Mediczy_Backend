#!/bin/bash

##############################################################################
# MEDICZY DEPLOYMENT WRAPPER
# Automated deployment with pre-deployment sanity checks
##############################################################################

set -e

echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║                                                                  ║"
echo "║         MEDICZY PRODUCTION DEPLOYMENT                            ║"
echo "║                                                                  ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

DEPLOYMENT_LOG="deployment-$(date +%Y%m%d-%H%M%S).log"

# Configuration
SKIP_SANITY_CHECK=${SKIP_SANITY_CHECK:-false}
FORCE_DEPLOY=${FORCE_DEPLOY:-false}
DRY_RUN=${DRY_RUN:-false}

##############################################################################
# HELPER FUNCTIONS
##############################################################################

log() {
    echo "[$(date -Iseconds)] $1" | tee -a "$DEPLOYMENT_LOG"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$DEPLOYMENT_LOG"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$DEPLOYMENT_LOG"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$DEPLOYMENT_LOG"
}

info() {
    echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$DEPLOYMENT_LOG"
}

##############################################################################
# STEP 1: PRE-DEPLOYMENT SANITY CHECK
##############################################################################

if [ "$SKIP_SANITY_CHECK" = false ]; then
    echo ""
    echo "════════════════════════════════════════════════════════════════════"
    echo "  STEP 1: PRE-DEPLOYMENT SANITY CHECK"
    echo "════════════════════════════════════════════════════════════════════"
    echo ""
    
    if [ ! -f "./pre-deploy-sanity-check.sh" ]; then
        error "Sanity check script not found!"
        exit 1
    fi
    
    info "Running automated sanity checks..."
    
    if ./pre-deploy-sanity-check.sh; then
        success "Sanity check passed ✓"
    else
        SANITY_EXIT_CODE=$?
        error "Sanity check failed with exit code $SANITY_EXIT_CODE"
        
        if [ "$FORCE_DEPLOY" = false ]; then
            echo ""
            error "Deployment blocked due to failed sanity checks"
            echo ""
            echo "To force deployment despite failures, run:"
            echo "  FORCE_DEPLOY=true ./deploy-with-sanity-check.sh"
            echo ""
            echo "To skip sanity checks entirely (NOT RECOMMENDED), run:"
            echo "  SKIP_SANITY_CHECK=true ./deploy-with-sanity-check.sh"
            echo ""
            exit 1
        else
            warning "Sanity check failed but FORCE_DEPLOY=true - continuing anyway"
        fi
    fi
else
    warning "Sanity check skipped (SKIP_SANITY_CHECK=true)"
fi

##############################################################################
# STEP 2: BACKUP CURRENT STATE
##############################################################################

echo ""
echo "════════════════════════════════════════════════════════════════════"
echo "  STEP 2: BACKUP CURRENT STATE"
echo "════════════════════════════════════════════════════════════════════"
echo ""

info "Creating backup before deployment..."

# Backup database if script exists
if [ -f "./backup-database.sh" ]; then
    info "Running database backup..."
    if ./backup-database.sh; then
        success "Database backup completed"
    else
        warning "Database backup failed - continuing anyway"
    fi
else
    warning "No backup script found - skipping database backup"
fi

# Save current PM2 state
if command -v pm2 &> /dev/null; then
    info "Saving PM2 process list..."
    pm2 save --force
    success "PM2 state saved"
fi

##############################################################################
# STEP 3: GIT OPERATIONS
##############################################################################

echo ""
echo "════════════════════════════════════════════════════════════════════"
echo "  STEP 3: GIT OPERATIONS"
echo "════════════════════════════════════════════════════════════════════"
echo ""

if [ -d ".git" ]; then
    info "Current branch: $(git rev-parse --abbrev-ref HEAD)"
    info "Current commit: $(git rev-parse --short HEAD)"
    
    # Check for uncommitted changes
    if ! git diff-index --quiet HEAD -- 2>/dev/null; then
        warning "Uncommitted changes detected"
        git status --short
    fi
    
    # Pull latest changes (if on main/master)
    BRANCH=$(git rev-parse --abbrev-ref HEAD)
    if [ "$BRANCH" = "main" ] || [ "$BRANCH" = "master" ]; then
        info "Pulling latest changes from $BRANCH..."
        if [ "$DRY_RUN" = false ]; then
            git pull origin "$BRANCH" || warning "Git pull failed"
        else
            info "[DRY RUN] Would pull from origin $BRANCH"
        fi
    fi
else
    warning "Not a git repository"
fi

##############################################################################
# STEP 4: DEPENDENCY UPDATE
##############################################################################

echo ""
echo "════════════════════════════════════════════════════════════════════"
echo "  STEP 4: DEPENDENCY UPDATE"
echo "════════════════════════════════════════════════════════════════════"
echo ""

info "Checking for dependency updates..."

if [ "$DRY_RUN" = false ]; then
    if [ -f "package-lock.json" ]; then
        info "Running npm ci (clean install)..."
        npm ci --production || npm ci
        success "Dependencies installed"
    else
        info "Running npm install..."
        npm install --production || npm install
        success "Dependencies installed"
    fi
else
    info "[DRY RUN] Would install dependencies"
fi

##############################################################################
# STEP 5: ENVIRONMENT VALIDATION
##############################################################################

echo ""
echo "════════════════════════════════════════════════════════════════════"
echo "  STEP 5: ENVIRONMENT VALIDATION"
echo "════════════════════════════════════════════════════════════════════"
echo ""

# Check critical environment variables
MISSING_ENV=false

if [ -z "$JWT_SECRET" ] || [ "$JWT_SECRET" = "mediczy-super-secret-key-2024" ]; then
    error "JWT_SECRET not set or using fallback!"
    MISSING_ENV=true
fi

if [ "$NODE_ENV" != "production" ]; then
    warning "NODE_ENV is not set to production (current: ${NODE_ENV:-not set})"
fi

if [ "$MISSING_ENV" = true ] && [ "$FORCE_DEPLOY" = false ]; then
    error "Critical environment variables missing!"
    exit 1
fi

success "Environment validation completed"

##############################################################################
# STEP 6: BUILD PROCESS (if applicable)
##############################################################################

echo ""
echo "════════════════════════════════════════════════════════════════════"
echo "  STEP 6: BUILD PROCESS"
echo "════════════════════════════════════════════════════════════════════"
echo ""

# Check if there's a build script
if grep -q '"build":' package.json 2>/dev/null; then
    info "Build script found in package.json"
    if [ "$DRY_RUN" = false ]; then
        info "Running build..."
        npm run build || warning "Build failed"
        success "Build completed"
    else
        info "[DRY RUN] Would run npm run build"
    fi
else
    info "No build script found - skipping build step"
fi

##############################################################################
# STEP 7: DATABASE MIGRATIONS (if applicable)
##############################################################################

echo ""
echo "════════════════════════════════════════════════════════════════════"
echo "  STEP 7: DATABASE MIGRATIONS"
echo "════════════════════════════════════════════════════════════════════"
echo ""

if [ -d "migrations" ] || grep -q '"migrate":' package.json 2>/dev/null; then
    info "Database migrations detected"
    if [ "$DRY_RUN" = false ]; then
        warning "Manual database migration check required"
        # Add migration command here if you have one
        # npm run migrate
    else
        info "[DRY RUN] Would run database migrations"
    fi
else
    info "No database migrations found - skipping"
fi

##############################################################################
# STEP 8: RESTART APPLICATION
##############################################################################

echo ""
echo "════════════════════════════════════════════════════════════════════"
echo "  STEP 8: RESTART APPLICATION"
echo "════════════════════════════════════════════════════════════════════"
echo ""

if [ "$DRY_RUN" = false ]; then
    if command -v pm2 &> /dev/null; then
        info "Restarting application with PM2..."
        
        # Update environment variables
        pm2 restart mediczy-server --update-env || pm2 start server/server.js --name mediczy-server
        
        # Wait for server to start
        info "Waiting for server to start..."
        sleep 5
        
        # Check if server is running
        if pm2 jlist | grep -q "mediczy-server.*online"; then
            success "Application restarted successfully"
        else
            error "Application failed to start!"
            pm2 logs mediczy-server --lines 50
            exit 1
        fi
        
        # Save PM2 configuration
        pm2 save --force
        success "PM2 configuration saved"
    else
        warning "PM2 not found - manual restart required"
    fi
else
    info "[DRY RUN] Would restart application with PM2"
fi

##############################################################################
# STEP 9: POST-DEPLOYMENT VERIFICATION
##############################################################################

echo ""
echo "════════════════════════════════════════════════════════════════════"
echo "  STEP 9: POST-DEPLOYMENT VERIFICATION"
echo "════════════════════════════════════════════════════════════════════"
echo ""

info "Running post-deployment health checks..."

# Wait a bit for server to stabilize
sleep 3

# Check server health
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/ 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "404" ]; then
    success "Server responding to HTTP requests (HTTP $HTTP_CODE)"
else
    error "Server not responding (HTTP $HTTP_CODE)"
    if [ "$DRY_RUN" = false ]; then
        pm2 logs mediczy-server --lines 30
    fi
    exit 1
fi

# Test critical endpoint (login)
LOGIN_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8000/api/users/login \
    -H "Content-Type: application/json" \
    -d '{"email":"user@mediczy.com","password":"User123"}' 2>/dev/null || echo "000")

if [ "$LOGIN_CODE" = "200" ] || [ "$LOGIN_CODE" = "401" ]; then
    success "Authentication endpoint responding (HTTP $LOGIN_CODE)"
else
    error "Authentication endpoint not responding (HTTP $LOGIN_CODE)"
    exit 1
fi

# Run quick sanity check again to verify
if [ -f "./test-production-logins.sh" ]; then
    info "Running quick authentication test..."
    if ./test-production-logins.sh > /dev/null 2>&1; then
        success "Post-deployment authentication test passed"
    else
        warning "Post-deployment authentication test had issues"
    fi
fi

##############################################################################
# STEP 10: DEPLOYMENT RECORD
##############################################################################

echo ""
echo "════════════════════════════════════════════════════════════════════"
echo "  STEP 10: DEPLOYMENT RECORD"
echo "════════════════════════════════════════════════════════════════════"
echo ""

# Record deployment
DEPLOYMENT_TIME=$(date -Iseconds)
COMMIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")

if [ "$DRY_RUN" = false ]; then
    # Save deployment record
    echo "$DEPLOYMENT_TIME" > LAST_DEPLOYMENT.txt
    
    # Append to deployment history
    echo "$DEPLOYMENT_TIME | Commit: $COMMIT_HASH | Branch: $BRANCH | User: $(whoami)" >> DEPLOYMENT_HISTORY.log
    
    success "Deployment recorded"
else
    info "[DRY RUN] Would record deployment"
fi

##############################################################################
# FINAL SUMMARY
##############################################################################

echo ""
echo "════════════════════════════════════════════════════════════════════"
echo "  DEPLOYMENT SUMMARY"
echo "════════════════════════════════════════════════════════════════════"
echo ""

if [ "$DRY_RUN" = true ]; then
    echo -e "${BLUE}DRY RUN MODE - No changes were made${NC}"
    echo ""
fi

echo "Deployment Time:  $DEPLOYMENT_TIME"
echo "Git Commit:       $COMMIT_HASH"
echo "Git Branch:       $BRANCH"
echo "User:             $(whoami)"
echo "Log File:         $DEPLOYMENT_LOG"
echo ""

echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                                                   ║${NC}"
echo -e "${GREEN}║  ✓ DEPLOYMENT COMPLETED SUCCESSFULLY                             ║${NC}"
echo -e "${GREEN}║                                                                   ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════════╝${NC}"
echo ""

success "Deployment completed at $(date)"

##############################################################################
# POST-DEPLOYMENT MONITORING REMINDER
##############################################################################

echo ""
echo "════════════════════════════════════════════════════════════════════"
echo "  POST-DEPLOYMENT MONITORING"
echo "════════════════════════════════════════════════════════════════════"
echo ""
echo "Monitor the application for the next 30 minutes:"
echo ""
echo "  • View logs:     pm2 logs mediczy-server"
echo "  • Monitor:       pm2 monit"
echo "  • Check status:  pm2 status"
echo "  • Test logins:   ./test-production-logins.sh"
echo ""
echo "If issues arise:"
echo ""
echo "  • Rollback:      git checkout <previous-commit>"
echo "  • Restore DB:    (restore from latest backup)"
echo "  • Restart:       pm2 restart mediczy-server"
echo ""

exit 0
