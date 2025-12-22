# n8n Setup for Mediczy

## Quick Start (30 minutes)

### Step 1: Deploy n8n

```bash
cd /home/ubuntu/Mediczy/n8n-setup
docker-compose up -d
```

### Step 2: Access n8n UI

Open browser: http://13.234.17.52:5678

**Login Credentials:**
- Username: `admin`
- Password: `MediczyN8N2025!`

### Step 3: Check Status

```bash
# Check if containers are running
docker-compose ps

# View logs
docker-compose logs -f n8n

# Check health
curl http://localhost:5678/healthz
```

## Workflow Directory Structure

```
workflows/
├── appointment-reminders.json
├── payment-recovery.json
├── prescription-notifications.json
├── health-alerts.json
└── doctor-availability-sync.json
```

## Testing Webhooks

```bash
# Test appointment booking workflow
curl -X POST http://localhost:5678/webhook/appointment-booked \
  -H "Content-Type: application/json" \
  -d '{
    "appointmentId": "test-123",
    "patientName": "John Doe",
    "patientEmail": "john@example.com",
    "patientPhone": "+919876543210",
    "doctorName": "Dr. Smith",
    "appointmentDate": "2025-12-15",
    "appointmentTime": "10:00 AM",
    "consultationType": "video"
  }'
```

## Management Commands

```bash
# Start n8n
docker-compose up -d

# Stop n8n
docker-compose down

# Restart n8n
docker-compose restart n8n

# View logs
docker-compose logs -f n8n

# Backup workflows
docker cp mediczy-n8n:/home/node/.n8n/workflows ./workflows-backup

# Restore workflows
docker cp ./workflows-backup/. mediczy-n8n:/home/node/.n8n/workflows
```

## Integration with Mediczy

n8n is now integrated with Mediczy API via:
- **Webhook triggers**: Mediczy → n8n
- **API callbacks**: n8n → Mediczy
- **n8n Service**: `server/services/n8n.service.js`

## Next Steps

1. ✅ n8n deployed and running
2. Create first workflow in UI
3. Test webhook integration
4. Add external integrations (Twilio, SendGrid)
5. Build remaining workflows
