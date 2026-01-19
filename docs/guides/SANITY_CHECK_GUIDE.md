# Automated Sanity Check & Deployment System

This directory contains automated pre-deployment validation scripts to ensure production readiness before every deployment.

---

## 🚀 Quick Start

### Run Pre-Deployment Sanity Check
```bash
./pre-deploy-sanity-check.sh
```

### Full Automated Deployment
```bash
./deploy-with-sanity-check.sh
```

---

## 📋 Available Scripts

### 1. `pre-deploy-sanity-check.sh`
**Purpose:** Comprehensive automated validation before deployment

**What it checks (12 categories, 50+ checks):**
- ✅ Environment variables (JWT_SECRET, NODE_ENV, DB credentials)
- ✅ File system & dependencies (critical files, node_modules)
- ✅ Server health (PM2 status, uptime, restarts)
- ✅ Database connectivity (login test)
- ✅ Authentication system (all 4 critical user types)
- ✅ Security configuration (headers, rate limiting, CORS)
- ✅ API endpoints (critical routes)
- ✅ Process & resources (disk space, memory)
- ✅ Configuration files (.env, package-lock.json)
- ✅ Code quality (syntax validation, TODOs)
- ✅ Backup readiness (scripts, recent backups)
- ✅ Deployment readiness (git status, branch)

**Exit Codes:**
- `0` = All checks passed - deployment approved
- `1` = Critical failures - deployment blocked

**Usage:**
```bash
# Basic run
./pre-deploy-sanity-check.sh

# View detailed log
cat sanity-check-YYYYMMDD-HHMMSS.log
```

### 2. `deploy-with-sanity-check.sh`
**Purpose:** Automated deployment with built-in sanity checks

**What it does:**
1. Runs pre-deployment sanity check
2. Creates backup (database + PM2 state)
3. Git operations (pull latest, check branch)
4. Dependency update (npm ci)
5. Environment validation
6. Build process (if applicable)
7. Database migrations (if applicable)
8. Application restart (PM2)
9. Post-deployment verification
10. Records deployment history

**Usage:**
```bash
# Normal deployment with sanity check
./deploy-with-sanity-check.sh

# Dry run (no changes made)
DRY_RUN=true ./deploy-with-sanity-check.sh

# Force deployment despite warnings
FORCE_DEPLOY=true ./deploy-with-sanity-check.sh

# Skip sanity check (NOT RECOMMENDED)
SKIP_SANITY_CHECK=true ./deploy-with-sanity-check.sh
```

---

## 🔍 Sanity Check Details

### Critical Checks (Block Deployment)

These checks **must pass** or deployment will be blocked:

1. **NODE_ENV=production** - Ensures production configuration
2. **JWT_SECRET set (not fallback)** - Security requirement
3. **Server running** - Application must be online
4. **Database connectivity** - DB must be accessible
5. **Authentication working** - Critical login endpoints functional
6. **Critical files present** - app.js, models, middleware exist
7. **Dependencies installed** - node_modules present
8. **No syntax errors** - JavaScript files valid

### Warning Checks (Allow Deployment)

These generate warnings but allow deployment:

- CORS_ORIGIN not configured
- Database credentials not in environment
- SSL certificates missing
- HSTS header not present
- No backup script found
- Uncommitted git changes
- High memory/disk usage
- TODO comments in code
- console.log statements found

---

## 📊 Example Output

### Successful Sanity Check
```
╔══════════════════════════════════════════════════════════════════╗
║         MEDICZY PRE-DEPLOYMENT SANITY CHECK                      ║
╚══════════════════════════════════════════════════════════════════╝

═══════════════════════════════════════════════════════════════════
  CHECK 1: ENVIRONMENT VALIDATION
═══════════════════════════════════════════════════════════════════
✓ NODE_ENV set to production
✓ JWT_SECRET is set (not using fallback)
✓ DB_HOST is configured
✓ DB_PASSWORD is set
⚠ CORS_ORIGIN not set (using defaults)

═══════════════════════════════════════════════════════════════════
  CHECK 2: FILE SYSTEM & DEPENDENCIES
═══════════════════════════════════════════════════════════════════
✓ Critical file exists: server/app.js
✓ Critical file exists: server/server.js
✓ Critical file exists: package.json
✓ node_modules directory exists
✓ Dependency present: express
✓ Dependency present: jsonwebtoken

[... more checks ...]

═══════════════════════════════════════════════════════════════════
  SANITY CHECK SUMMARY
═══════════════════════════════════════════════════════════════════

Total Checks:    52
Passed:          45
Warnings:        7
Failed:          0
Critical Fails:  0

Success Rate:    86.5%

╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║  ✓ DEPLOYMENT APPROVED - ALL CHECKS PASSED                       ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
```

### Failed Sanity Check
```
═══════════════════════════════════════════════════════════════════
  SANITY CHECK SUMMARY
═══════════════════════════════════════════════════════════════════

Total Checks:    52
Passed:          38
Warnings:        10
Failed:          4
Critical Fails:  2

Success Rate:    73.1%

FAILED CHECKS:
  ✗ JWT_SECRET not set or using fallback secret
  ✗ Server is not running
  ✗ Database connection issue (HTTP 500)
  ✗ User/Patient authentication failed (no token)

╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║  ✗ DEPLOYMENT BLOCKED - CRITICAL FAILURES DETECTED                ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝

Fix critical issues before deploying to production!
```

---

## 🔧 Configuration

### Environment Variables

The sanity check validates these critical environment variables:

```bash
# Critical (deployment blocked if missing)
NODE_ENV=production
JWT_SECRET=your-secure-secret-here

# Important (warnings if missing)
DB_HOST=your-db-host
DB_USER=your-db-user
DB_PASSWORD=your-db-password
CORS_ORIGIN=https://yourdomain.com
```

### Deployment Options

```bash
# Environment variables for deployment script
DRY_RUN=false              # Set to true for dry run (no changes)
FORCE_DEPLOY=false         # Set to true to force despite failures
SKIP_SANITY_CHECK=false    # Set to true to skip (NOT RECOMMENDED)
```

---

## 📁 Generated Files

### Log Files
- `sanity-check-YYYYMMDD-HHMMSS.log` - Detailed sanity check log
- `deployment-YYYYMMDD-HHMMSS.log` - Deployment process log
- `DEPLOYMENT_CHECKS.log` - Historical record of all checks
- `DEPLOYMENT_HISTORY.log` - Historical record of deployments

### Status Files
- `LAST_DEPLOYMENT.txt` - Timestamp of last deployment
- `DEPLOYMENT_HISTORY.log` - Full deployment history with commits

---

## 🔄 Integration with CI/CD

### GitHub Actions Example

```yaml
name: Production Deployment

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Run Sanity Check
        run: |
          chmod +x pre-deploy-sanity-check.sh
          ./pre-deploy-sanity-check.sh
        env:
          NODE_ENV: production
          JWT_SECRET: ${{ secrets.JWT_SECRET }}
      
      - name: Deploy to Production
        if: success()
        run: |
          chmod +x deploy-with-sanity-check.sh
          ./deploy-with-sanity-check.sh
        env:
          NODE_ENV: production
          JWT_SECRET: ${{ secrets.JWT_SECRET }}
          DB_PASSWORD: ${{ secrets.DB_PASSWORD }}
```

### GitLab CI Example

```yaml
deploy_production:
  stage: deploy
  only:
    - main
  script:
    - chmod +x pre-deploy-sanity-check.sh
    - ./pre-deploy-sanity-check.sh
    - chmod +x deploy-with-sanity-check.sh
    - ./deploy-with-sanity-check.sh
  environment:
    name: production
  when: manual
```

---

## 🛡️ Best Practices

### Before Deployment

1. **Always run sanity check first**
   ```bash
   ./pre-deploy-sanity-check.sh
   ```

2. **Review warnings** - Even if deployment is approved, review warnings

3. **Test in staging** - Run sanity check in staging environment first

4. **Check git status** - Ensure all changes are committed

5. **Backup database** - Ensure recent backup exists

### During Deployment

1. **Use deployment script** - Always use `deploy-with-sanity-check.sh`

2. **Monitor logs** - Watch logs during deployment
   ```bash
   pm2 logs mediczy-server --lines 100
   ```

3. **Keep terminal open** - Don't close terminal during deployment

### After Deployment

1. **Monitor for 30 minutes** - Watch for errors
   ```bash
   pm2 monit
   ```

2. **Test critical paths** - Verify login, booking, payments work

3. **Check error rates** - Monitor application errors

4. **Have rollback ready** - Keep previous commit ready

---

## 🚨 Troubleshooting

### Sanity Check Fails

**Problem:** JWT_SECRET not set
```bash
# Solution: Set JWT_SECRET
export JWT_SECRET="your-secure-secret"
# Or add to .env file
echo "JWT_SECRET=your-secret" >> .env
```

**Problem:** Server not running
```bash
# Solution: Start server
pm2 start server/server.js --name mediczy-server
# Or restart
pm2 restart mediczy-server
```

**Problem:** Database connection failed
```bash
# Solution: Check DB credentials and connectivity
mysql -h $DB_HOST -u $DB_USER -p$DB_PASSWORD $DB_NAME
```

**Problem:** Authentication test failed
```bash
# Solution: Test manually and check logs
curl -X POST http://localhost:8000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@mediczy.com","password":"User123"}'

pm2 logs mediczy-server --err --lines 50
```

### Deployment Issues

**Problem:** Deployment blocked despite valid setup
```bash
# Force deployment (use cautiously)
FORCE_DEPLOY=true ./deploy-with-sanity-check.sh
```

**Problem:** Need to test without making changes
```bash
# Dry run mode
DRY_RUN=true ./deploy-with-sanity-check.sh
```

**Problem:** Deployment stuck or taking too long
```bash
# Check PM2 status
pm2 status

# View logs
pm2 logs mediczy-server

# Manual restart if needed
pm2 restart mediczy-server
```

---

## 📈 Monitoring Deployment Health

### View Recent Deployments
```bash
cat DEPLOYMENT_HISTORY.log
```

### View Sanity Check History
```bash
cat DEPLOYMENT_CHECKS.log
```

### Check Last Deployment
```bash
cat LAST_DEPLOYMENT.txt
```

### View Latest Logs
```bash
ls -lt sanity-check-*.log | head -1 | awk '{print $9}' | xargs cat
ls -lt deployment-*.log | head -1 | awk '{print $9}' | xargs cat
```

---

## 🔐 Security Considerations

### Never Skip Sanity Checks in Production
The sanity check validates critical security configurations. Always run it before production deployment.

### Environment Variables
Never commit `.env` files with production secrets. Use environment variables or secret management systems.

### JWT Secret
Always use a strong, unique JWT secret in production. Never use the fallback secret.

### Database Credentials
Store database credentials in environment variables, not in code.

---

## 📞 Support

### Quick Commands
```bash
# Run sanity check only
./pre-deploy-sanity-check.sh

# Full deployment
./deploy-with-sanity-check.sh

# Dry run (test without changes)
DRY_RUN=true ./deploy-with-sanity-check.sh

# Force deployment
FORCE_DEPLOY=true ./deploy-with-sanity-check.sh

# View logs
pm2 logs mediczy-server

# Test authentication
./test-production-logins.sh
```

### Additional Documentation
- **PRODUCTION_CHECKLIST.md** - Complete deployment checklist
- **PRODUCTION_READINESS_REPORT.md** - System assessment
- **README_PRODUCTION.md** - Production deployment guide

---

## 📝 Changelog

### Version 1.0 (December 4, 2025)
- Initial release
- 12 check categories with 50+ individual checks
- Automated deployment with rollback support
- CI/CD integration examples
- Comprehensive logging and reporting

---

**Generated:** December 4, 2025  
**Status:** Production Ready  
**Maintenance:** Review and update checks quarterly
