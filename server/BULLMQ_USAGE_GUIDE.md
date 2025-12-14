# BullMQ Task Queue Usage Guide

BullMQ is already configured and running in your Mediczy application. This guide shows you how to use it for async task processing.

## 📋 Available Queues

1. **Email Queue** - Send emails asynchronously
2. **Notifications Queue** - Push notifications, SMS, in-app alerts
3. **Reports Queue** - Generate heavy reports in background
4. **Data Export Queue** - Export large datasets
5. **Analytics Queue** - Process analytics events
6. **Cleanup Queue** - Scheduled cleanup tasks

## 🚀 Quick Start - Adding Jobs to Queues

### Method 1: Using Helper Function (Recommended)

```javascript
import { addJob } from './config/queues.js';

// Add email job
await addJob('email-queue', 'send-welcome-email', {
  to: 'user@example.com',
  subject: 'Welcome to Mediczy!',
  template: 'welcome',
  data: { name: 'John Doe' }
});

// Add notification job
await addJob('notification-queue', 'appointment-reminder', {
  userId: '12345',
  type: 'push',
  title: 'Appointment Reminder',
  message: 'You have an appointment tomorrow at 10 AM'
});
```

### Method 2: Direct Queue Access

```javascript
import { queues } from './config/queues.js';

// Add job to specific queue
await queues.email.add('send-email', {
  to: 'patient@example.com',
  subject: 'Test Results Available',
  body: 'Your test results are ready for review.'
}, {
  attempts: 3,        // Retry 3 times on failure
  backoff: {
    type: 'exponential',
    delay: 2000       // Start with 2 second delay
  },
  removeOnComplete: true,
  removeOnFail: false
});
```

## 📧 Email Queue Examples

### Send Welcome Email
```javascript
await queues.email.add('welcome-email', {
  to: 'newuser@example.com',
  subject: 'Welcome to Mediczy',
  template: 'welcome',
  data: {
    name: 'John Doe',
    activationLink: 'https://mediczy.com/activate/token123'
  }
});
```

### Send Appointment Confirmation
```javascript
await queues.email.add('appointment-confirmation', {
  to: 'patient@example.com',
  subject: 'Appointment Confirmed',
  template: 'appointment-confirmation',
  data: {
    patientName: 'Jane Smith',
    doctorName: 'Dr. Sharma',
    date: '2025-11-15',
    time: '10:00 AM',
    location: 'Clinic A'
  }
});
```

## 🔔 Notifications Queue Examples

### Push Notification
```javascript
await queues.notifications.add('push-notification', {
  userId: 'user123',
  type: 'push',
  title: 'New Message',
  message: 'You have a new message from Dr. Sharma',
  data: {
    messageId: 'msg456',
    screen: 'messages'
  }
});
```

### SMS Notification
```javascript
await queues.notifications.add('sms-notification', {
  userId: 'user123',
  type: 'sms',
  phone: '+919876543210',
  message: 'Your OTP is 123456. Valid for 10 minutes.'
});
```

## 📊 Reports Queue Examples

### Generate Patient Report
```javascript
await queues.reports.add('patient-report', {
  reportType: 'patient-history',
  userId: 'user123',
  patientId: 'patient456',
  filters: {
    dateFrom: '2025-01-01',
    dateTo: '2025-11-10'
  },
  format: 'pdf'
}, {
  attempts: 2,
  timeout: 60000  // 60 seconds timeout
});
```

### Generate Analytics Dashboard
```javascript
await queues.reports.add('analytics-dashboard', {
  reportType: 'monthly-analytics',
  userId: 'admin123',
  filters: {
    month: '2025-11',
    departments: ['cardiology', 'neurology']
  },
  format: 'excel'
});
```

## 💾 Data Export Queue Examples

### Export Patient Data
```javascript
await queues.dataExport.add('export-patients', {
  entityType: 'patients',
  userId: 'admin123',
  filters: {
    registeredAfter: '2025-01-01',
    status: 'active'
  },
  format: 'csv',
  fields: ['name', 'email', 'phone', 'dateOfBirth']
});
```

### Export Appointment History
```javascript
await queues.dataExport.add('export-appointments', {
  entityType: 'appointments',
  userId: 'doctor123',
  filters: {
    doctorId: 'doctor123',
    dateRange: { start: '2025-01-01', end: '2025-12-31' }
  },
  format: 'excel'
});
```

## 📈 Analytics Queue Examples

### Track User Event
```javascript
await queues.analytics.add('track-event', {
  eventType: 'appointment_booked',
  data: {
    userId: 'user123',
    appointmentId: 'appt456',
    doctorId: 'doctor789',
    specialty: 'cardiology',
    source: 'mobile_app'
  },
  timestamp: new Date().toISOString()
});
```

### Process Page View
```javascript
await queues.analytics.add('page-view', {
  eventType: 'page_view',
  data: {
    userId: 'user123',
    page: '/doctors',
    referrer: '/home',
    device: 'mobile'
  },
  timestamp: new Date().toISOString()
});
```

## 🧹 Cleanup Queue Examples

### Schedule Daily Cleanup
```javascript
await queues.cleanup.add('daily-cleanup', {
  taskType: 'expired_sessions',
  olderThan: 24 * 60 * 60 * 1000  // 24 hours in ms
}, {
  repeat: {
    cron: '0 2 * * *'  // Run at 2 AM daily
  }
});
```

### Archive Old Records
```javascript
await queues.cleanup.add('archive-old-data', {
  taskType: 'audit_logs',
  olderThan: 6 * 30 * 24 * 60 * 60 * 1000  // 6 months
});
```

## ⏰ Delayed and Scheduled Jobs

### Delayed Job (Run after delay)
```javascript
await queues.email.add('reminder-email', {
  to: 'patient@example.com',
  subject: 'Appointment Reminder',
  body: 'Your appointment is tomorrow'
}, {
  delay: 24 * 60 * 60 * 1000  // Send after 24 hours
});
```

### Recurring Job (Cron schedule)
```javascript
await queues.reports.add('daily-report', {
  reportType: 'daily-summary',
  recipients: ['admin@mediczy.com']
}, {
  repeat: {
    cron: '0 9 * * *',  // Every day at 9 AM
    tz: 'Asia/Kolkata'
  }
});
```

## 🔄 Job Priorities

```javascript
// High priority (processes first)
await queues.notifications.add('urgent-alert', data, {
  priority: 1  // Lower number = higher priority
});

// Normal priority
await queues.notifications.add('regular-notification', data, {
  priority: 5
});

// Low priority (processes last)
await queues.analytics.add('background-analytics', data, {
  priority: 10
});
```

## 🔍 Monitoring Jobs

### Check Queue Status
```javascript
import { queues } from './config/queues.js';

// Get job counts
const counts = await queues.email.getJobCounts();
console.log(counts);
// { waiting: 5, active: 2, completed: 100, failed: 3 }

// Get waiting jobs
const waiting = await queues.email.getWaiting();
console.log(`${waiting.length} jobs waiting`);

// Get failed jobs
const failed = await queues.email.getFailed();
for (const job of failed) {
  console.log(`Failed job ${job.id}:`, job.failedReason);
}
```

### Retry Failed Job
```javascript
const failedJobs = await queues.email.getFailed();
for (const job of failedJobs) {
  await job.retry();
}
```

### Remove Completed Jobs
```javascript
await queues.email.clean(3600000, 1000, 'completed'); // Remove completed jobs older than 1 hour
```

## 🎯 Advanced Options

### Job with Timeout
```javascript
await queues.reports.add('heavy-report', data, {
  timeout: 300000  // 5 minutes timeout
});
```

### Job with Rate Limiting
```javascript
await queues.email.add('bulk-email', data, {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 5000
  },
  limiter: {
    max: 10,      // Max 10 jobs
    duration: 1000 // per second
  }
});
```

## 📦 Using in API Routes

### Example: Send Email from API
```javascript
// In your route handler
import { queues } from '../config/queues.js';

app.post('/api/send-email', async (req, res) => {
  const { to, subject, body } = req.body;
  
  try {
    const job = await queues.email.add('send-email', {
      to,
      subject,
      body
    });
    
    res.json({
      success: true,
      jobId: job.id,
      message: 'Email queued for sending'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
```

### Example: Generate Report API
```javascript
app.post('/api/reports/generate', async (req, res) => {
  const { reportType, filters } = req.body;
  
  const job = await queues.reports.add('generate-report', {
    reportType,
    userId: req.user.id,
    filters,
    format: 'pdf'
  });
  
  res.json({
    success: true,
    jobId: job.id,
    message: 'Report generation started',
    statusUrl: `/api/reports/status/${job.id}`
  });
});

// Check report status
app.get('/api/reports/status/:jobId', async (req, res) => {
  const job = await queues.reports.getJob(req.params.jobId);
  
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  
  const state = await job.getState();
  
  res.json({
    jobId: job.id,
    state,  // 'waiting', 'active', 'completed', 'failed'
    progress: job.progress,
    result: state === 'completed' ? job.returnvalue : null
  });
});
```

## 🎨 Custom Worker Processors

To add custom processing logic, edit `server/workers/index.js`:

```javascript
// Add your custom processor
const processCustomJob = async (job) => {
  const { customData } = job.data;
  
  // Your processing logic here
  console.log('Processing custom job:', customData);
  
  // Return result
  return { success: true, data: customData };
};

// Add to workers
const customWorker = createWorker('custom-queue', processCustomJob);
```

## 📚 Additional Resources

- **BullMQ Documentation**: https://docs.bullmq.io/
- **Queue Configuration**: `/root/Mediczy/server/config/queues.js`
- **Worker Implementation**: `/root/Mediczy/server/workers/index.js`
- **Prometheus Metrics**: Available at `http://localhost:8000/metrics`

## ✅ Best Practices

1. **Always use try-catch** in job processors
2. **Set appropriate timeouts** for long-running jobs
3. **Use retries with exponential backoff** for transient failures
4. **Remove completed jobs** to prevent memory issues
5. **Monitor queue metrics** via Prometheus
6. **Use job priorities** for critical tasks
7. **Set up alerts** for failed jobs
8. **Log important events** for debugging

## 🚨 Troubleshooting

### Jobs Not Processing
```bash
# Check if workers are running
pm2 logs mediczy-server | grep "workers initialized"

# Check Redis connection
redis-cli ping
```

### Too Many Failed Jobs
```bash
# View failed jobs
node -e "import('./config/queues.js').then(async ({queues}) => {
  const failed = await queues.email.getFailed();
  console.log('Failed jobs:', failed.length);
})"
```

### Clean Up Queues
```bash
# Clear all jobs (use carefully!)
redis-cli FLUSHALL
```

---

Your BullMQ task queues are **production-ready** and already running! 🚀
