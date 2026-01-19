# Mediczy Async Tasks & Monitoring

## Overview

Mediczy uses a modern async task processing infrastructure with:
- **Redis** - In-memory data store for queue management
- **BullMQ** - Reliable job queue system (Node.js alternative to Celery)
- **Kafka** - Event streaming platform for real-time data processing
- **Prometheus** - Metrics collection and monitoring
- **Grafana** - Visualization and dashboards (optional)

## Architecture

```
┌─────────────┐
│   Express   │
│   Server    │
└──────┬──────┘
       │
       ├──────> Redis ──────> BullMQ Workers ──────> Process Jobs
       │                      (Email, Reports, etc.)
       │
       ├──────> Kafka ──────> Event Consumers ──────> Analytics
       │                      (User events, system logs)
       │
       └──────> Prometheus ───> Metrics Storage ───> Grafana
                                 (API perf, queue stats)
```

## Prerequisites

### Install Redis (Ubuntu/Debian)
```bash
sudo apt update
sudo apt install redis-server
sudo systemctl start redis-server
sudo systemctl enable redis-server
redis-cli ping  # Should return PONG
```

### Install Kafka (Optional)
```bash
# Download Kafka
wget https://downloads.apache.org/kafka/3.6.0/kafka_2.13-3.6.0.tgz
tar -xzf kafka_2.13-3.6.0.tgz
cd kafka_2.13-3.6.0

# Start Zookeeper (Terminal 1)
bin/zookeeper-server-start.sh config/zookeeper.properties

# Start Kafka (Terminal 2)
bin/kafka-server-start.sh config/server.properties
```

### Install Prometheus (Optional)
```bash
# Download Prometheus
wget https://github.com/prometheus/prometheus/releases/download/v2.45.0/prometheus-2.45.0.linux-amd64.tar.gz
tar -xzf prometheus-2.45.0.linux-amd64.tar.gz
cd prometheus-2.45.0.linux-amd64

# Create config (see prometheus.yml below)
# Start Prometheus
./prometheus --config.file=prometheus.yml
```

### Install Grafana (Optional)
```bash
sudo apt-get install -y software-properties-common
sudo add-apt-repository "deb https://packages.grafana.com/oss/deb stable main"
wget -q -O - https://packages.grafana.com/gpg.key | sudo apt-key add -
sudo apt-get update
sudo apt-get install grafana
sudo systemctl start grafana-server
sudo systemctl enable grafana-server
```

Visit `http://localhost:3000` (default credentials: admin/admin)

## Environment Configuration

Add to `server/.env`:

```bash
# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=  # Leave empty if no password

# Kafka
KAFKA_CLIENT_ID=mediczy-server
KAFKA_BROKERS=localhost:9092
KAFKA_CONSUMER_GROUP=mediczy-consumer-group

# App URLs
CLIENT_URL=http://localhost:8080
```

## Quick Start

### 1. Start Services

**Redis** (required for queues):
```bash
sudo systemctl start redis-server
```

**Kafka** (optional, for event streaming):
```bash
# Terminal 1: Zookeeper
cd kafka_2.13-3.6.0
bin/zookeeper-server-start.sh config/zookeeper.properties

# Terminal 2: Kafka
bin/kafka-server-start.sh config/server.properties
```

**Prometheus** (optional, for metrics):
```bash
cd prometheus-2.45.0.linux-amd64
./prometheus --config.file=prometheus.yml
```

### 2. Start Application

The application will automatically connect to available services:

```bash
cd /root/Mediczy/server
npm start
```

Expected output:
```
✅ Redis client connected
✅ Kafka producer connected
✅ BullMQ queues initialized
✅ All workers initialized
✅ Prometheus metrics initialized
server running on PORT 8000
```

If a service is unavailable, the app will gracefully degrade:
```
⚠️  Kafka not available: Connection timeout
⚠️  Continuing without Kafka...
```

## Available Queues

| Queue | Purpose | Concurrency | Priority Jobs |
|-------|---------|-------------|---------------|
| `email` | Send emails | 5 | Password resets |
| `notifications` | Push/in-app notifications | 5 | Urgent alerts |
| `reports` | PDF/Excel report generation | 3 | - |
| `dataExport` | CSV/JSON data exports | 3 | - |
| `analytics` | Track user actions | 10 | - |
| `cleanup` | Database cleanup tasks | 2 | - |

## Usage Examples

### Email Tasks

```javascript
import tasks from './tasks/index.js';

// Welcome email
await tasks.sendWelcomeEmail('user@example.com', 'John Doe');

// Appointment confirmation
await tasks.sendAppointmentConfirmation('user@example.com', {
  date: '2025-11-15',
  time: '10:00 AM',
  doctor: 'Dr. Smith',
});

// Password reset (high priority)
await tasks.sendPasswordResetEmail('user@example.com', 'reset-token-123');
```

### Notification Tasks

```javascript
// Push notification
await tasks.sendPushNotification(
  userId,
  'Appointment Reminder',
  'You have an appointment tomorrow at 10:00 AM'
);

// Schedule reminder (24 hours before)
await tasks.scheduleAppointmentReminder(userId, appointmentId, appointmentTime);
```

### Report Generation

```javascript
// User report
await tasks.generateUserReport(userId, 'health-summary', {
  startDate: '2025-01-01',
  endDate: '2025-12-31',
});

// Admin analytics
await tasks.generateAdminAnalyticsReport(adminId, {
  start: '2025-11-01',
  end: '2025-11-30',
}, ['revenue', 'appointments', 'users']);
```

### Data Export

```javascript
// Export CRM leads
await tasks.exportCRMLeads({
  stage: 'Qualified',
  dateRange: { start: '2025-01-01', end: '2025-12-31' },
});

// Export appointments
await tasks.exportAppointments({ start: '2025-11-01', end: '2025-11-30' }, 'excel');
```

### Analytics Tracking

```javascript
// Track user action
await tasks.trackUserAction(userId, 'profile_updated', {
  fields: ['email', 'phone'],
  source: 'mobile_app',
});

// Track page view
await tasks.trackPageView(userId, '/dashboard', 45); // 45 seconds
```

### Kafka Events

```javascript
import { publishLeadCreated, publishLeadStageChanged } from './tasks/index.js';

// Publish lead created event
await publishLeadCreated(lead);

// Publish stage change event
await publishLeadStageChanged(lead, 'New', 'Qualified');
```

## API Endpoints

All endpoints require admin authentication.

### Queue Management

**Get queue stats:**
```bash
GET /api/async/queues/stats

Response:
{
  "success": true,
  "stats": {
    "email": { "waiting": 5, "active": 2, "completed": 120, "failed": 3 },
    "notifications": { "waiting": 0, "active": 1, "completed": 450, "failed": 0 }
  }
}
```

**Get failed jobs:**
```bash
GET /api/async/queues/email/failed

Response:
{
  "success": true,
  "jobs": [
    {
      "id": "123",
      "name": "send-welcome-email",
      "data": { "to": "user@example.com" },
      "failedReason": "SMTP connection timeout",
      "attemptsMade": 3
    }
  ]
}
```

**Retry failed job:**
```bash
POST /api/async/queues/email/jobs/123/retry
```

**Clean completed jobs:**
```bash
DELETE /api/async/queues/email/completed
```

### Task Triggers

**Send test email:**
```bash
POST /api/async/tasks/email/test
{
  "email": "test@example.com",
  "subject": "Test Email"
}
```

**Send test notification:**
```bash
POST /api/async/tasks/notification/test
{
  "userId": 123,
  "title": "Test Notification",
  "message": "This is a test"
}
```

**Generate report:**
```bash
POST /api/async/tasks/reports/generate
{
  "reportType": "admin-analytics",
  "filters": {
    "dateRange": { "start": "2025-11-01", "end": "2025-11-30" },
    "metrics": ["users", "appointments", "revenue"]
  }
}
```

**Export CRM leads:**
```bash
POST /api/async/tasks/export/crm-leads
{
  "filters": {
    "stage": "Qualified",
    "source": "Website"
  }
}
```

**Run cleanup:**
```bash
POST /api/async/tasks/cleanup/run
{
  "taskType": "sessions"  // or "temp-files"
}
```

### Kafka Events

**Publish test event:**
```bash
POST /api/async/kafka/publish
{
  "topic": "USER_EVENTS",
  "message": {
    "action": "test_event",
    "userId": 123,
    "data": { "test": true }
  }
}
```

**Get available topics:**
```bash
GET /api/async/kafka/topics

Response:
{
  "success": true,
  "topics": {
    "USER_EVENTS": "user-events",
    "DOCTOR_EVENTS": "doctor-events",
    "APPOINTMENT_EVENTS": "appointment-events",
    "SYSTEM_EVENTS": "system-events",
    "ANALYTICS_EVENTS": "analytics-events",
    "NOTIFICATION_EVENTS": "notification-events"
  }
}
```

### Metrics

**Prometheus metrics endpoint:**
```bash
GET /api/async/metrics

# Returns Prometheus-formatted metrics:
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
# http_requests_total{method="GET",route="/api/users",status_code="200"} 1542
```

## Monitoring with Prometheus

### prometheus.yml Configuration

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'mediczy-server'
    static_configs:
      - targets: ['localhost:8000']
    metrics_path: '/api/async/metrics'
```

### Available Metrics

**HTTP Metrics:**
- `http_requests_total` - Total HTTP requests
- `http_request_duration_seconds` - Request latency

**Queue Metrics:**
- `queue_jobs_total` - Total jobs processed
- `queue_job_duration_seconds` - Job processing time
- `queue_size` - Current queue sizes

**Database Metrics:**
- `db_query_duration_seconds` - Query performance
- `db_connections_active` - Active connections

**Business Metrics:**
- `user_registrations_total` - New user signups
- `appointments_created_total` - Appointments booked
- `crm_leads_total` - CRM leads by stage
- `crm_pipeline_value` - Pipeline value by stage

**Kafka Metrics:**
- `kafka_messages_produced_total` - Messages sent
- `kafka_messages_consumed_total` - Messages received

## Grafana Dashboards

### Add Prometheus Data Source

1. Open Grafana: `http://localhost:3000`
2. Configuration → Data Sources → Add data source
3. Select Prometheus
4. URL: `http://localhost:9090`
5. Click "Save & Test"

### Import Dashboard

Create a new dashboard with panels:

**API Performance:**
```promql
rate(http_requests_total[5m])
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))
```

**Queue Health:**
```promql
sum by (queue, state) (queue_size)
rate(queue_jobs_total{status="failed"}[5m])
```

**Business Metrics:**
```promql
sum(crm_pipeline_value)
rate(user_registrations_total[1h])
```

## Recurring Jobs (Cron)

Jobs can be scheduled with cron expressions:

```javascript
import { addRecurringJob } from './config/queues.js';

// Monthly report (first day of month at midnight)
await addRecurringJob('reports', 'monthly-summary', {}, '0 0 1 * *');

// Daily cleanup (every day at 3 AM)
await addRecurringJob('cleanup', 'cleanup-temp-files', {}, '0 3 * * *');

// Weekly archive (every Sunday at 2 AM)
await addRecurringJob('cleanup', 'archive-old-data', {}, '0 2 * * 0');
```

## Error Handling & Retries

Jobs automatically retry on failure:

```javascript
await addJob('email', 'send-email', emailData, {
  attempts: 5,                    // Retry up to 5 times
  backoff: {
    type: 'exponential',          // Exponential backoff
    delay: 2000,                  // Start with 2 second delay
  },
  removeOnComplete: true,         // Auto-remove on success
  removeOnFail: false,            // Keep failed jobs for debugging
});
```

## Monitoring Job Status

```javascript
import { queues } from './config/queues.js';

// Get job by ID
const job = await queues.email.getJob('job-id-123');

// Check job state
const state = await job.getState(); // 'waiting', 'active', 'completed', 'failed'

// Get job result
const result = await job.finished();

// Get failed jobs
const failed = await queues.email.getFailed();

// Retry all failed jobs
for (const job of failed) {
  await job.retry();
}
```

## Performance Tips

1. **Adjust Concurrency**: Increase worker concurrency for high-volume queues
2. **Use Priorities**: Set priority levels for urgent jobs
3. **Batch Processing**: Group similar jobs together
4. **Monitor Memory**: Redis memory usage should be monitored
5. **Clean Old Jobs**: Regularly clean completed jobs

## Troubleshooting

### Redis Connection Issues

**Problem**: `Redis connection refused`

**Solution**:
```bash
sudo systemctl status redis-server
sudo systemctl start redis-server
redis-cli ping
```

### Kafka Not Available

**Problem**: `Kafka producer not connected`

**Solution**: The app gracefully degrades. Start Kafka if event streaming is needed:
```bash
# Start Zookeeper first
bin/zookeeper-server-start.sh config/zookeeper.properties

# Then start Kafka
bin/kafka-server-start.sh config/server.properties
```

### Jobs Stuck in Queue

**Problem**: Jobs remain in "waiting" state

**Solution**:
```bash
# Check if workers are running
# Restart server to restart workers
npm restart

# Or check worker logs
tail -f /tmp/server.log
```

### High Memory Usage

**Problem**: Redis using too much memory

**Solution**:
```bash
# Clean old completed jobs
curl -X DELETE http://localhost:8000/api/async/queues/email/completed \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Or configure Redis maxmemory in /etc/redis/redis.conf
maxmemory 256mb
maxmemory-policy allkeys-lru
```

### Failed Jobs Not Retrying

**Problem**: Jobs fail immediately without retries

**Solution**: Check job configuration has proper retry settings:
```javascript
await addJob('email', 'send', data, {
  attempts: 3,  // Must be > 1
  backoff: { type: 'exponential', delay: 2000 }
});
```

## Production Deployment

### Redis

- Use Redis Cluster for high availability
- Enable persistence (RDB + AOF)
- Set maxmemory and eviction policy
- Use Redis Sentinel for failover

### Kafka

- Use multi-broker setup
- Configure replication factor ≥ 3
- Set appropriate retention policies
- Monitor disk usage

### Prometheus

- Set up long-term storage
- Configure alerting rules
- Use recording rules for complex queries

### Security

- Enable Redis authentication
- Use TLS for Kafka connections
- Restrict Prometheus endpoint access
- Use API keys for admin endpoints

## Additional Resources

- [BullMQ Documentation](https://docs.bullmq.io/)
- [Redis Documentation](https://redis.io/docs/)
- [Kafka Quick Start](https://kafka.apache.org/quickstart)
- [Prometheus Getting Started](https://prometheus.io/docs/introduction/first_steps/)
- [Grafana Tutorials](https://grafana.com/tutorials/)

---

**Version**: 1.0  
**Last Updated**: November 9, 2025
