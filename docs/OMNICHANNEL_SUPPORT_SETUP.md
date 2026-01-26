# Omnichannel Support Chat Setup Guide for Mediczy

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        PATIENT CHANNELS                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   📱 WhatsApp ──────┐                                               │
│   (via n8n/WABA)    │                                               │
│                     │                                               │
│   💬 In-App Chat ───┼───► Mediczy Backend ───► RocketChat ───► 👨‍💼  │
│   (SupportWidget)   │     (Bridge Service)    Omnichannel    Support│
│                     │                                         Team  │
│   🤖 Dr. iSHA ──────┘                                               │
│   (Auto-triage)                                                     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Deployment Options (Choose One)

### Option A: RocketChat Cloud (Recommended for Quick Start)
- **URL**: https://cloud.rocket.chat
- **Free tier**: Up to 25 users
- **No server management needed**
- Get API credentials and configure in `.env`

### Option B: Self-Hosted RocketChat with PM2

#### Prerequisites
```bash
# Install MongoDB 5.0+
sudo apt-get install -y mongodb-org

# Start MongoDB with replica set
sudo mongod --replSet rs0 --bind_ip localhost

# Initialize replica set
mongosh --eval 'rs.initiate()'
```

#### Install RocketChat
```bash
# Create directory
sudo mkdir -p /opt/rocketchat
cd /opt/rocketchat

# Download RocketChat
curl -L https://releases.rocket.chat/latest/download -o rocket.chat.tgz
tar -xzf rocket.chat.tgz

# Install dependencies
cd bundle/programs/server
npm install

# Setup environment
cd /opt/rocketchat/bundle
```

#### Add to PM2 Ecosystem
Add this to your `ecosystem.config.js`:

```javascript
// ==================== RocketChat Support ====================
{
  name: 'rocketchat',
  script: 'main.js',
  cwd: '/opt/rocketchat/bundle',
  instances: 1,
  exec_mode: 'fork',
  env: {
    ROOT_URL: 'https://support.mediczy.com',
    PORT: 3100,
    MONGO_URL: 'mongodb://localhost:27017/rocketchat?replicaSet=rs0',
    MONGO_OPLOG_URL: 'mongodb://localhost:27017/local?replicaSet=rs0'
  },
  error_file: '/home/ubuntu/Mediczy/logs/rocketchat-error.log',
  out_file: '/home/ubuntu/Mediczy/logs/rocketchat-out.log',
  log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
  max_memory_restart: '2G',
  max_restarts: 10
}
```

### Option C: Use Existing Chat Infrastructure
If you prefer not to run RocketChat, the omnichannel service can be adapted for:
- **Chatwoot** (Open source, simpler)
- **Crisp** (Cloud-based)
- **Intercom** (Enterprise)

## Quick Start

### 2. Add Environment Variables

Add to your `.env` file:

```env
# RocketChat Configuration (Cloud or Self-Hosted)
ROCKETCHAT_URL=https://your-workspace.rocket.chat  # or http://localhost:3100
ROCKETCHAT_ADMIN_USER=admin
ROCKETCHAT_ADMIN_PASSWORD=your-secure-password
ROCKETCHAT_WEBHOOK_SECRET=your-secure-webhook-secret
```

### 3. Configure RocketChat Omnichannel

1. Access RocketChat Admin: `http://localhost:3100/admin`
2. Login with admin credentials
3. Navigate to **Administration → Omnichannel**
4. Enable Omnichannel
5. Create Departments:
   - General Support
   - Billing & Payments
   - Pharmacy Orders
   - Appointments
   - Emergency Support
   - Technical Support

### 4. Register Routes in Express

Add to your `server/app.js` or `server/index.js`:

```javascript
import supportChatRouter from './routes/support-chat.route.js';

// Support chat routes
app.use('/api/support', supportChatRouter);
```

### 5. Add Widget to Frontend

Add to your main layout (e.g., `MainLayout.tsx`):

```tsx
import SupportChatWidget from '@/components/SupportChatWidget';

// In your layout component:
<SupportChatWidget />
```

## API Endpoints

### Patient Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/support/chat/start` | Start new support conversation |
| POST | `/api/support/chat/message` | Send message in conversation |
| GET | `/api/support/chat/history` | Get chat history |
| GET | `/api/support/chat/active` | Check for active conversation |
| POST | `/api/support/chat/close` | Close conversation with feedback |
| GET | `/api/support/chat/transcript` | Get full transcript |

### Configuration Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/support/config` | Get widget configuration |
| GET | `/api/support/departments` | Get available departments |

### Webhook Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/support/webhook/whatsapp` | WhatsApp incoming messages |
| POST | `/api/support/webhook/rocketchat` | RocketChat agent responses |

### Admin Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/support/queue` | Get support queue status |
| GET | `/api/support/agents` | Get available agents |

## WhatsApp Integration

### Option A: Using Your Existing n8n Setup

Update your WhatsApp webhook handler to forward messages:

```javascript
// In your n8n webhook or whatsapp handler
const response = await fetch('https://api.mediczy.com/api/support/webhook/whatsapp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    from: message.from,
    body: message.body,
    mediaUrl: message.mediaUrl,
    profileName: message.profileName
  })
});
```

### Option B: Direct WhatsApp Business API

Configure RocketChat's built-in WhatsApp integration:
1. Go to **Administration → Omnichannel → WhatsApp**
2. Add your WhatsApp Business Account credentials

## Support Team Setup

### Creating Agent Accounts

1. Go to **Administration → Users**
2. Create new user with role: `livechat-agent`
3. Assign to departments

### Agent Dashboard

Support agents access: `https://support.mediczy.com/livechat-enterprise`

Features available:
- Unified inbox for all channels (WhatsApp + In-App)
- Department routing
- Canned responses
- Chat transfer
- Customer info panel (Mediczy patient data)

## Dr. iSHA Integration

Medical queries are automatically detected and suggestions from Dr. iSHA are shown to patients:

```javascript
// Automatic detection of medical queries
const medicalKeywords = [
  'symptom', 'pain', 'fever', 'medicine', 'medication',
  'prescription', 'doctor', 'appointment', 'health'
];

// When detected, Dr. iSHA provides instant suggestions
// while chat continues with human support
```

## Security Considerations

### HIPAA Compliance

1. **Enable E2EE** in RocketChat settings
2. **Data retention**: Configure message retention policies
3. **Audit logs**: Enable and monitor access logs
4. **Access control**: Implement role-based access

### Webhook Security

```javascript
// Verify RocketChat webhook signature
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const hash = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  return hash === signature;
}
```

## Monitoring

### Health Check

```bash
curl http://localhost:3100/api/v1/info
```

### Queue Monitoring

```bash
curl -H "X-Auth-Token: $TOKEN" -H "X-User-Id: $USER_ID" \
  http://localhost:3100/api/v1/livechat/queue
```

## Troubleshooting

### RocketChat not starting (Self-Hosted)

```bash
# Check PM2 logs
pm2 logs rocketchat

# Check MongoDB status
sudo systemctl status mongod

# Verify MongoDB replica set
mongosh --eval 'rs.status()'
```

### Messages not bridging

1. Check webhook configuration in RocketChat
2. Verify environment variables
3. Check Mediczy server logs: `pm2 logs mediczy-server`

### WhatsApp messages not appearing

1. Verify WhatsApp webhook is pointing to correct endpoint
2. Check n8n workflow status
3. Verify patient phone number format (with country code)

## Production Deployment

### PM2 Setup

```bash
# Start all services
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup startup script
pm2 startup

# Monitor
pm2 monit
```

### Nginx Reverse Proxy

```nginx
# /etc/nginx/sites-available/support.mediczy.com
server {
    listen 443 ssl http2;
    server_name support.mediczy.com;
    
    ssl_certificate /etc/letsencrypt/live/support.mediczy.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/support.mediczy.com/privkey.pem;
    
    location / {
        proxy_pass http://localhost:3100;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

## Support

For issues with this integration:
1. Check RocketChat docs: https://docs.rocket.chat
2. Mediczy internal docs
3. Contact DevOps team
