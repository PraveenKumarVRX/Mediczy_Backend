# n8n Setup for Mediczy (PM2)

## Quick Start

### Step 1: Deploy n8n with PM2

```bash
cd /home/ubuntu/Mediczy/n8n-setup
chmod +x deploy-pm2.sh
./deploy-pm2.sh
```

Or manually:

```bash
# Install n8n globally
sudo npm install -g n8n

# Create directories
mkdir -p ~/.n8n/logs

# Start with PM2
pm2 start n8n.ecosystem.config.js

# Save PM2 config
pm2 save
```

### Step 2: Access n8n UI

Open browser: http://localhost:5678

**Login Credentials:**
- Username: `admin`
- Password: `MediczyN8N2025!`

### Step 3: Check Status

```bash
# Check PM2 status
pm2 status

# View logs
pm2 logs mediczy-n8n

# Check health
curl http://localhost:5678/healthz
```

## Database Configuration

n8n is wired to the core Mediczy PostgreSQL database:

| Setting | Value |
|---------|-------|
| Host | localhost |
| Port | 5432 |
| Database | mediczy_ai |
| Schema | n8n |
| User | mediczy_helper |

The `n8n` schema was created to isolate n8n tables from the main application tables.

## PM2 Commands

```bash
# Start n8n
pm2 start n8n.ecosystem.config.js

# Stop n8n
pm2 stop mediczy-n8n

# Restart n8n
pm2 restart mediczy-n8n

# View logs
pm2 logs mediczy-n8n --lines 100

# Monitor
pm2 monit
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
    "doctorName": "Dr. Smith",
    "dateTime": "2025-12-20T10:00:00Z"
  }'
```

## Integration with Mediczy Server

The n8n service is integrated via:
- `server/services/n8n.service.js` - Triggers workflows
- `server/routes/webhooks/n8n-callback.route.js` - Receives callbacks

## Environment Variables

All configuration is in `n8n.ecosystem.config.js`:

| Variable | Description |
|----------|-------------|
| `DB_TYPE` | postgresdb |
| `DB_POSTGRESDB_HOST` | localhost |
| `DB_POSTGRESDB_DATABASE` | mediczy_ai |
| `DB_POSTGRESDB_SCHEMA` | n8n |
| `MEDICZY_API_URL` | http://localhost:8000/api |

## Backup

```bash
# Backup n8n data
pm2 stop mediczy-n8n
cp -r ~/.n8n ./backups/n8n-$(date +%Y%m%d)
pm2 start mediczy-n8n
```
