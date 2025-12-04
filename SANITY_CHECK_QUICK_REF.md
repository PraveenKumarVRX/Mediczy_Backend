# 🚀 Sanity Check Quick Reference Card

## ⚡ Quick Commands

```bash
# Fast check (30 seconds)
./quick-sanity-check.sh

# Full check (2 minutes)
./pre-deploy-sanity-check.sh

# Deploy with checks
./deploy-with-sanity-check.sh

# Dry run
DRY_RUN=true ./deploy-with-sanity-check.sh

# Force deploy
FORCE_DEPLOY=true ./deploy-with-sanity-check.sh
```

## 📊 What Gets Checked

| Category | Tests | Critical |
|----------|-------|----------|
| Environment | 5 | ✓ JWT_SECRET, NODE_ENV |
| Files & Dependencies | 12 | ✓ Critical files, npm packages |
| Server Health | 4 | ✓ PM2, HTTP response |
| Database | 1 | ✓ Connection test |
| Authentication | 4 | ✓ User/Doctor/Admin/Nurse |
| Security | 6 | Headers, CORS, rate limiting |
| API Endpoints | 2 | Routes accessible |
| Resources | 3 | Disk, memory, PM2 |
| Configuration | 3 | .env, package-lock |
| Code Quality | 3 | Syntax, TODOs |
| Backup | 2 | Scripts, recent backups |
| Deployment | 3 | Git status, branch |
| **TOTAL** | **48+** | **8 critical** |

## 🔴 Critical Failures (Block Deployment)

- ❌ NODE_ENV not "production"
- ❌ JWT_SECRET missing or fallback
- ❌ Server not running
- ❌ Database not connected
- ❌ Authentication broken
- ❌ Critical files missing
- ❌ Dependencies not installed

## 🟡 Warnings (Allow Deployment)

- ⚠️ Environment vars not set
- ⚠️ High restart count
- ⚠️ No backup script
- ⚠️ Git uncommitted changes
- ⚠️ console.log statements
- ⚠️ TODO comments

## 📝 Generated Files

```
sanity-check-YYYYMMDD-HHMMSS.log   ← Check details
deployment-YYYYMMDD-HHMMSS.log     ← Deployment log
DEPLOYMENT_CHECKS.log              ← History
DEPLOYMENT_HISTORY.log             ← All deployments
LAST_DEPLOYMENT.txt                ← Last deploy time
```

## 🔧 Troubleshooting

### Issue: JWT_SECRET not set
```bash
export JWT_SECRET="$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")"
```

### Issue: Server not running
```bash
pm2 restart mediczy-server
```

### Issue: Database connection failed
```bash
mysql -h $DB_HOST -u $DB_USER -p$DB_PASSWORD
```

### Issue: Need to force deploy
```bash
FORCE_DEPLOY=true ./deploy-with-sanity-check.sh
```

## 📈 Exit Codes

- `0` = Approved - safe to deploy
- `1` = Blocked - fix critical issues

## 🎯 Best Practices

✅ **DO:**
- Run before every deployment
- Fix critical failures immediately
- Review warnings regularly
- Keep logs for audit trail
- Test in staging first

❌ **DON'T:**
- Skip checks in production
- Use FORCE_DEPLOY regularly
- Ignore repeated warnings
- Deploy without testing
- Commit sensitive data

## 📚 Documentation

- **SANITY_CHECK_GUIDE.md** - Complete guide
- **SANITY_CHECK_SUMMARY.md** - Overview
- **PRODUCTION_CHECKLIST.md** - Deployment checklist

## 🔗 CI/CD Integration

GitHub Actions: `.github/workflows/deploy-with-checks.yml`

```yaml
- name: Run Sanity Check
  run: ./pre-deploy-sanity-check.sh
  env:
    NODE_ENV: production
    JWT_SECRET: ${{ secrets.JWT_SECRET }}
```

## ⚡ Speed Comparison

| Check Type | Duration | Tests | Use When |
|------------|----------|-------|----------|
| Quick | 30s | 5 | Pre-commit, rapid validation |
| Full | 2min | 48+ | Pre-deployment, complete check |
| Deploy | 5-10min | All + deploy | Production deployment |

## 🎓 Training Checklist

- [ ] Understand critical vs warning checks
- [ ] Know how to read sanity check output
- [ ] Can fix common failures (JWT, NODE_ENV)
- [ ] Know when to use FORCE_DEPLOY
- [ ] Understand exit codes
- [ ] Can review deployment logs
- [ ] Know rollback procedures

---

**Version:** 1.0  
**Last Updated:** December 4, 2025  
**Status:** Production Ready
