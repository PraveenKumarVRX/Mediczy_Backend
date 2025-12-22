# 🏥 Mediczy - Automated Health Check System

A comprehensive automation functional testing system for daily production monitoring of the Mediczy healthcare platform.

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [Usage](#usage)
- [Monitoring & Alerts](#monitoring--alerts)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

## 🎯 Overview

This health check system provides automated functional testing for all critical user functions in the Mediczy platform, ensuring production reliability through:

- **Daily Automated Testing**: Runs comprehensive tests on schedule
- **Multi-Environment Support**: Production, staging, and development environments
- **Comprehensive Coverage**: Tests authentication, core features, compliance, security, and integrations
- **Performance Monitoring**: Tracks response times and system performance
- **Detailed Reporting**: JSON and text reports with historical data
- **Alert System**: Configurable notifications for failures and performance issues

## ✨ Features

### 🔍 Test Coverage

- **System Health**: Server connectivity, database, Redis, frontend availability
- **Authentication**: User/doctor registration, login, protected endpoints
- **Core Features**: Appointments, membership plans, doctor listings, AI doctor
- **Compliance & Security**: GDPR features, audit logs, rate limiting, security headers
- **Integrations**: Firebase FCM, Google Fit OAuth, payment gateways
- **Performance**: Response time monitoring and benchmarking

### 📊 Reporting

- **JSON Reports**: Machine-readable detailed test results
- **Text Summaries**: Human-readable status reports
- **Performance Metrics**: Response time tracking and trends
- **Historical Data**: 30-day retention with log rotation
- **Alert Integration**: Email, Slack, PagerDuty notifications

### 🔧 Automation

- **Cron Integration**: Scheduled daily, hourly, or custom intervals
- **CI/CD Ready**: Jenkins, GitHub Actions, GitLab CI compatible
- **Environment Aware**: Automatic configuration per environment
- **Self-Cleaning**: Automatic log rotation and cleanup

## 🚀 Quick Start

### 1. Installation

```bash
# Clone or navigate to your Mediczy project
cd /path/to/Mediczy

# Run the installation script
./scripts/install-health-checks.sh

# This will:
# - Create necessary directories
# - Set up permissions
# - Offer to install cron jobs
# - Test the installation
```

### 2. First Run

```bash
# Test in development environment
./scripts/daily-health-check.sh development

# Test in staging
./scripts/daily-health-check.sh staging

# Production check (be careful!)
./scripts/daily-health-check.sh production
```

### 3. Check Status

```bash
# Quick status check
./scripts/health-status.sh

# View latest logs
tail -f logs/health-checks/*.log

# View latest report
cat reports/daily-checks/daily_summary_*.txt
```

## 🏗 Architecture

### Directory Structure

```
Mediczy/
├── scripts/
│   ├── daily-health-check.sh      # Main health check script
│   ├── run-daily-checks.sh        # Cron-friendly runner
│   ├── setup-test-data.sh         # Test data creation
│   ├── install-health-checks.sh   # Installation script
│   ├── health-status.sh           # Quick status checker
│   └── crontab-example.txt        # Cron configuration examples
├── config/
│   └── health-check-config.json   # Configuration file
├── logs/
│   └── health-checks/              # Execution logs (auto-rotated)
└── reports/
    └── daily-checks/               # Generated reports
```

### Test Flow

```mermaid
graph TD
    A[Start Health Check] --> B[System Health Tests]
    B --> C[Authentication Tests]
    C --> D[Core Feature Tests]
    D --> E[Compliance & Security]
    E --> F[Integration Tests]
    F --> G[Performance Tests]
    G --> H[Generate Reports]
    H --> I[Send Alerts if Failed]
    I --> J[Cleanup & Exit]
```

## ⚙️ Configuration

### Environment Configuration

Edit `config/health-check-config.json`:

```json
{
  "environments": {
    "production": {
      "base_url": "https://your-domain.com/api",
      "web_url": "https://your-domain.com",
      "timeout": 30,
      "expected_response_time_ms": 2000,
      "alerts": {
        "email": "ops-team@yourcompany.com",
        "slack_webhook": "YOUR_SLACK_WEBHOOK_URL"
      }
    }
  }
}
```

### Test Suite Configuration

Enable/disable test suites:

```json
{
  "test_suites": {
    "system_health": { "enabled": true },
    "authentication": { "enabled": true, "cleanup_test_users": true },
    "core_features": { "enabled": true },
    "compliance_security": { "enabled": true },
    "integrations": { "enabled": true, "allow_failures": true },
    "performance": { "enabled": true, "max_response_time_ms": 5000 }
  }
}
```

### Cron Schedule

Install automated checks:

```bash
# Daily production checks at 6 AM
0 6 * * * /path/to/Mediczy/scripts/run-daily-checks.sh production --silent

# Hourly staging checks during business hours
0 9-17 * * 1-5 /path/to/Mediczy/scripts/run-daily-checks.sh staging --silent
```

## 📖 Usage

### Manual Execution

```bash
# Run full health check
./scripts/daily-health-check.sh [environment]

# Quick silent check (for cron)
./scripts/run-daily-checks.sh [environment] --silent

# Set up test data
./scripts/setup-test-data.sh [environment]

# Check current status
./scripts/health-status.sh
```

### Environment Options

- `development` - Local development server (localhost:8000/4000)
- `staging` - Staging environment
- `production` - Production environment

### Report Types

1. **JSON Report** (`daily_report_*.json`)
   - Machine-readable detailed results
   - Performance metrics
   - Test execution metadata

2. **Text Summary** (`daily_summary_*.txt`)
   - Human-readable status overview
   - Failed test details
   - Performance summary

3. **Execution Log** (`health_check_*.log`)
   - Detailed execution trace
   - Error messages and debugging info
   - Timestamped entries

## 🔔 Monitoring & Alerts

### Setting Up Notifications

#### Email Alerts
```bash
# Configure sendmail or use external email service
# Update config/health-check-config.json with email settings
```

#### Slack Integration
```bash
# Get Slack webhook URL from your workspace
# Update config with webhook URL:
"slack_webhook": "https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
```

#### PagerDuty Integration
```bash
# Configure PagerDuty integration key:
"pagerduty_key": "YOUR_PAGERDUTY_INTEGRATION_KEY"
```

### Monitoring Dashboards

View reports and metrics:

```bash
# Latest status
./scripts/health-status.sh

# View specific report
cat reports/daily-checks/daily_summary_production_YYYYMMDD_HHMMSS.txt

# Monitor real-time
tail -f logs/health-checks/health_check_*.log
```

## 🐛 Troubleshooting

### Common Issues

#### 1. Authentication Failures
```bash
# Check if test accounts exist and have correct credentials
./scripts/setup-test-data.sh development

# Verify API endpoints are accessible
curl -X POST http://localhost:8000/api/users/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"automation.user@mediczy.test","password":"AutoUser123!"}'
```

#### 2. Server Not Responding
```bash
# Check if backend is running
curl -s http://localhost:8000/api/health

# Check if frontend is running
curl -s http://localhost:4000

# Restart services if needed
cd server && npm start &
cd client && npm run dev &
```

#### 3. Permission Errors
```bash
# Fix script permissions
chmod +x scripts/*.sh

# Fix directory permissions
chmod 755 logs/ reports/
```

#### 4. Missing Dependencies
```bash
# Install required tools
# Ubuntu/Debian:
apt-get install curl jq bc

# CentOS/RHEL:
yum install curl jq bc
```

### Debug Mode

Run with verbose output:

```bash
# Enable detailed logging
MEDICZY_DEBUG=true ./scripts/daily-health-check.sh development

# Check specific test
curl -v http://localhost:8000/api/health
```

### Log Analysis

```bash
# Find recent errors
grep -i error logs/health-checks/*.log | tail -10

# Check test results
grep -E "(PASS|FAIL)" logs/health-checks/*.log | tail -20

# Performance analysis
grep "response time" logs/health-checks/*.log
```

## 🤝 Contributing

### Adding New Tests

1. Edit `scripts/daily-health-check.sh`
2. Add test function following the pattern:
```bash
run_test "Test Name" \
    "curl command or test logic" \
    "expected_http_status"
```

### Adding New Test Suites

1. Create new test section in main script
2. Add configuration in `config/health-check-config.json`
3. Update this README with documentation

### Best Practices

- **Idempotent Tests**: Tests should not affect each other
- **Cleanup**: Always clean up test data
- **Error Handling**: Graceful handling of failures
- **Performance**: Keep test execution under 5 minutes
- **Documentation**: Update README for new features

## 📄 License

This health check system is part of the Mediczy project and follows the same license terms.

## 📞 Support

For issues and questions:

- **Logs**: Check `logs/health-checks/` for detailed error information
- **Status**: Run `./scripts/health-status.sh` for quick diagnostics
- **Configuration**: Review `config/health-check-config.json` for settings
- **Documentation**: This README and inline script comments

---

**Last Updated**: November 10, 2025
**Version**: 1.0
**Maintainer**: Mediczy DevOps Team