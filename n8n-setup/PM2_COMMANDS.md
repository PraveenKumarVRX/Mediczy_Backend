# n8n PM2 Management Commands

## Quick Commands

### Start/Stop/Restart
```bash
# Start n8n
pm2 start mediczy-n8n

# Stop n8n
pm2 stop mediczy-n8n

# Restart n8n
pm2 restart mediczy-n8n

# Delete n8n from PM2
pm2 delete mediczy-n8n
```

### Logs and Monitoring
```bash
# View real-time logs
pm2 logs mediczy-n8n

# View last 100 lines
pm2 logs mediczy-n8n --lines 100

# View only errors
pm2 logs mediczy-n8n --err

# Monitor all processes
pm2 monit

# Show process info
pm2 show mediczy-n8n
```

### Status and Health
```bash
# List all PM2 processes
pm2 list

# Check n8n health
curl http://localhost:5678/healthz

# Check if n8n is running
pm2 id mediczy-n8n
```

### Configuration
```bash
# View PM2 ecosystem config
cat ~/Mediczy/n8n-setup/n8n.ecosystem.config.js

# View n8n config
cat ~/.n8n/.env

# Edit configuration
nano ~/Mediczy/n8n-setup/n8n.ecosystem.config.js

# Reload after config change
pm2 reload mediczy-n8n
```

### Workflow Management
```bash
# List workflows
ls -la ~/.n8n/workflows/

# Backup workflows
cp -r ~/.n8n/workflows ~/Mediczy/n8n-setup/workflows-backup-$(date +%Y%m%d)

# Restore workflows
cp -r ~/Mediczy/n8n-setup/workflows-backup-20251210/* ~/.n8n/workflows/
pm2 restart mediczy-n8n
```

### Troubleshooting
```bash
# Check if port 5678 is in use
netstat -tuln | grep 5678
lsof -i :5678

# Kill process on port 5678 (if needed)
kill -9 $(lsof -t -i:5678)

# Reinstall n8n
npm install -g n8n@latest

# Clear n8n cache
rm -rf ~/.n8n/.cache

# Check n8n version
n8n --version

# Start n8n manually (for debugging)
n8n start --tunnel
```

### PM2 Startup (Auto-start on boot)
```bash
# Generate startup script
pm2 startup

# Save current process list
pm2 save

# Disable auto-start
pm2 unstartup
```

## Integration Testing

### Test n8n Health
```bash
curl http://localhost:5678/healthz
```

### Test Webhook (after creating workflow)
```bash
curl -X POST http://localhost:5678/webhook/appointment-booked \
  -H "Content-Type: application/json" \
  -d '{
    "appointmentId": "test-001",
    "patientName": "Test Patient",
    "patientEmail": "test@example.com",
    "patientPhone": "+919876543210",
    "doctorName": "Dr. Smith",
    "appointmentDate": "2025-12-20",
    "appointmentTime": "10:00 AM"
  }'
```

### Test Mediczy Integration
```bash
# Check Mediczy server
curl http://localhost:8000/health

# Check n8n callback endpoint
curl http://localhost:8000/api/webhooks/n8n-callback/health
```

## Performance Monitoring

### Memory Usage
```bash
# Check n8n memory usage
pm2 show mediczy-n8n | grep memory

# List by memory usage
pm2 list --sort memory
```

### CPU Usage
```bash
# Monitor CPU usage
pm2 monit
```

### Restart on High Memory
```bash
# n8n is configured to auto-restart at 500MB
# View config: cat ~/Mediczy/n8n-setup/n8n.ecosystem.config.js
# max_memory_restart: '500M'
```

## Common Issues

### Issue: n8n won't start
```bash
# Check logs
pm2 logs mediczy-n8n --err

# Check port availability
netstat -tuln | grep 5678

# Reinstall
pm2 delete mediczy-n8n
npm install -g n8n
cd ~/Mediczy/n8n-setup
pm2 start n8n.ecosystem.config.js
```

### Issue: Webhooks not working
```bash
# Check n8n is running
pm2 list | grep mediczy-n8n

# Check webhook URL in workflow
# Should be: http://localhost:5678/webhook/[workflow-name]

# Test with curl (see Integration Testing above)
```

### Issue: Lost workflows
```bash
# Restore from backup
cp -r ~/Mediczy/n8n-setup/workflows-backup-[date]/* ~/.n8n/workflows/
pm2 restart mediczy-n8n
```

## Deployment Checklist

- [ ] n8n installed globally: `npm install -g n8n`
- [ ] PM2 installed globally: `npm install -g pm2`
- [ ] n8n started with PM2: `pm2 start mediczy-n8n`
- [ ] PM2 configuration saved: `pm2 save`
- [ ] Health check passing: `curl http://localhost:5678/healthz`
- [ ] Mediczy integration active: Check logs for n8n triggers
- [ ] Workflows created in UI
- [ ] External integrations configured (Twilio, SendGrid, etc.)

## Access Information

- **n8n UI**: http://localhost:5678 or http://13.234.17.52:5678
- **Username**: admin
- **Password**: MediczyN8N2025!
- **Webhook Base URL**: http://localhost:5678/webhook/
- **Logs**: `~/.n8n/logs/`
- **Workflows**: `~/.n8n/workflows/`
