# Mediczy Daily Smoke Test

## Overview
Automated daily production health checks at 6 AM UTC.

## What It Tests

### Critical Tests (13 total)
1. ✅ **Server Health** - HTTP response check
2. ✅ **Database Connection** - DB connectivity via auth test
3. ✅ **User Authentication** - Patient login flow
4. ✅ **Doctor Authentication** - Doctor login flow
5. ✅ **Admin Authentication** - Admin login flow
6. ✅ **Security Headers** - CORS, CSP, HSTS, etc.
7. ✅ **Rate Limiting** - DDoS protection active
8. ✅ **PM2 Status** - Process manager health
9. ✅ **Disk Space** - Storage capacity check
10. ✅ **Memory Usage** - RAM utilization
11. ✅ **Error Logs** - Recent error count
12. ✅ **SSL Certificate** - Certificate expiry (HTTPS only)
13. ✅ **Backup Freshness** - Recent database backups

## Schedule
```bash
# Daily at 6:00 AM UTC
0 6 * * * /home/ubuntu/Mediczy/smoke-test.sh
```

## Manual Testing
```bash
# Run smoke test manually
cd /home/ubuntu/Mediczy
./smoke-test.sh

# View latest log
tail -f /var/log/mediczy/smoke-test-*.log | tail -1

# Check cron log
tail -f /var/log/mediczy/smoke-test-cron.log
```

## Alert Configuration

### Email Alerts
Set `ALERT_EMAIL` in smoke-test.sh:
```bash
ALERT_EMAIL="your-email@example.com"
```

### Slack Notifications
Set `SLACK_WEBHOOK` environment variable:
```bash
export SLACK_WEBHOOK="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
```

## Success Criteria

| Result | Condition | Action |
|--------|-----------|--------|
| ✅ PASSED | 0 failures, ≤3 warnings | No alert |
| ⚠️ PASSED WITH WARNINGS | 0 failures, >3 warnings | Slack warning |
| ❌ FAILED | ≥1 critical failure | Email + Slack alert |

## Log Files
- **Test logs**: `/var/log/mediczy/smoke-test-YYYYMMDD_HHMMSS.log`
- **Cron logs**: `/var/log/mediczy/smoke-test-cron.log`
- **Retention**: 30 days (automatic cleanup)

## Troubleshooting

### Test Failed: Database Connection
```bash
# Check database status
systemctl status mariadb
# Test connection manually
mysql -u mediczy -p mediczy
```

### Test Failed: Server Not Responding
```bash
# Check PM2 status
pm2 status
pm2 logs mediczy-server --lines 50
# Restart if needed
pm2 restart mediczy-server
```

### Test Failed: High Error Count
```bash
# View recent errors
tail -100 ~/.pm2/logs/mediczy-server-error.log
# Filter critical errors
grep -i "critical\|fatal" ~/.pm2/logs/mediczy-server-error.log
```

### Test Failed: Disk Space
```bash
# Check disk usage
df -h
# Clean up logs
pm2 flush
find /tmp -type f -atime +7 -delete
```

## Test Accounts Setup

For authentication tests, create test accounts:

```sql
-- Run in MySQL
INSERT INTO users (email, password, name, role) VALUES 
('test.patient@mediczy.com', '$2b$10$...', 'Test Patient', 'user'),
('test.doctor@mediczy.com', '$2b$10$...', 'Test Doctor', 'doctor'),
('test.admin@mediczy.com', '$2b$10$...', 'Test Admin', 'admin');
```

## Customization

Edit `/home/ubuntu/Mediczy/smoke-test.sh`:
- Add custom tests
- Modify alert thresholds
- Change test frequency
- Add monitoring integrations

## Integration with CI/CD

Smoke test runs automatically:
- ✅ After deployments (via deploy-with-sanity-check.sh)
- ✅ Daily at 6 AM (via cron)
- ✅ Manual runs (./smoke-test.sh)

## Quick Commands

```bash
# Run now
./smoke-test.sh

# View cron schedule
crontab -l | grep smoke

# Disable daily test
crontab -e  # Comment out smoke-test line

# Enable daily test  
crontab -e  # Uncomment: 0 6 * * * /home/ubuntu/Mediczy/smoke-test.sh

# Force pass (testing)
SLACK_WEBHOOK=https://... ./smoke-test.sh

# Check last result
tail -20 /var/log/mediczy/smoke-test-*.log | tail -20
```

## Monitoring Dashboard

View smoke test results in:
- PM2: `pm2 monit`
- Logs: `/var/log/mediczy/`
- Alerts: Email + Slack

---

**Status**: ✅ Active (Daily at 6:00 AM UTC)  
**Last Updated**: December 4, 2025
