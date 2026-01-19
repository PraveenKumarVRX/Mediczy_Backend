# PM2 Dedicated Server Provisioning for Enterprise Tenants

## Overview

This document describes the PM2-based server provisioning system for Enterprise tier tenants in the Mediczy multi-tenant platform. Enterprise tenants can have their own dedicated server instances, providing complete isolation and independent scaling.

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                     Main Mediczy Server                          │
│                    (mediczy-server @ 8000)                       │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Super Admin Dashboard                        │  │
│  │  • Start/Stop/Restart Tenant Servers                     │  │
│  │  • View Server Status & Logs                              │  │
│  │  • Manage All Enterprise Tenants                          │  │
│  └──────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                               │
                               │ PM2 Management
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                    PM2 Process Manager                           │
│                                                                  │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐    │
│  │ tenant-apollo  │  │ tenant-fortis  │  │ tenant-max     │    │
│  │   Port: 8011   │  │   Port: 8012   │  │   Port: 8013   │    │
│  │   Online ✓     │  │   Online ✓     │  │   Stopped ○    │    │
│  └────────────────┘  └────────────────┘  └────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

## Port Allocation

- **Base Port**: 8010
- **Formula**: Port = 8010 + Tenant ID
- **Examples**:
  - Tenant ID 1 (Apollo): Port 8011
  - Tenant ID 2 (Fortis): Port 8012
  - Tenant ID 3 (Max): Port 8013

## Process Naming

Format: `tenant-{slug}`

Examples:
- `tenant-apollo-hospitals-chennai`
- `tenant-fortis-healthcare`
- `tenant-max-hospitals`

## API Endpoints

All endpoints require Super Admin authentication (Bearer token).

### List All Tenant Servers
```bash
GET /api/superadmin/tenants/servers
```

Response:
```json
{
  "success": true,
  "total": 1,
  "servers": [
    {
      "name": "tenant-apollo-hospitals-chennai",
      "pm_id": 9,
      "status": "online",
      "port": 8011,
      "tenant_id": 1,
      "tenant_slug": "apollo-hospitals-chennai",
      "memory": 260788224,
      "cpu": 4.1,
      "uptime": 33948,
      "restarts": 0
    }
  ]
}
```

### Get Server Status for Specific Tenant
```bash
GET /api/superadmin/tenants/tenants/:id/server
```

Response (Enterprise):
```json
{
  "success": true,
  "tenant_id": 1,
  "tenant_name": "Apollo Hospitals Chennai",
  "plan": "enterprise",
  "dedicated_server": true,
  "server": {
    "running": true,
    "status": "online",
    "process_name": "tenant-apollo-hospitals-chennai",
    "pm_id": 9,
    "port": 8011,
    "uptime": 643,
    "memory": 90779648,
    "cpu": 132.1,
    "restarts": 0
  }
}
```

Response (Non-Enterprise):
```json
{
  "success": true,
  "tenant_id": 1,
  "tenant_name": "Apollo Hospitals Chennai",
  "plan": "professional",
  "dedicated_server": false,
  "message": "Dedicated servers are only available for Enterprise plan"
}
```

### Start Dedicated Server
```bash
POST /api/superadmin/tenants/tenants/:id/server/start
```

Response:
```json
{
  "success": true,
  "tenant_id": 1,
  "tenant_name": "Apollo Hospitals Chennai",
  "database_mode": "shared",
  "message": "Server started successfully on port 8011",
  "running": true,
  "status": "online",
  "process_name": "tenant-apollo-hospitals-chennai",
  "pm_id": 9,
  "port": 8011,
  "access_url": "https://apollo-hospitals-chennai.mediqzy.com"
}
```

### Stop Dedicated Server
```bash
POST /api/superadmin/tenants/tenants/:id/server/stop
```

Response:
```json
{
  "success": true,
  "tenant_id": 1,
  "tenant_name": "Apollo Hospitals Chennai",
  "message": "Server stopped successfully",
  "running": false,
  "status": "stopped",
  "process_name": "tenant-apollo-hospitals-chennai"
}
```

### Restart Server (Zero-Downtime)
```bash
POST /api/superadmin/tenants/tenants/:id/server/restart
```

Uses `pm2 reload` for zero-downtime restart.

Response:
```json
{
  "success": true,
  "tenant_id": 1,
  "tenant_name": "Apollo Hospitals Chennai",
  "message": "Server restarted successfully",
  "running": true,
  "status": "online",
  "restarts": 1
}
```

### Delete/Deprovision Server
```bash
DELETE /api/superadmin/tenants/tenants/:id/server
```

Completely removes the PM2 process and cleans up log files.

### Get Server Logs
```bash
GET /api/superadmin/tenants/tenants/:id/server/logs?lines=100
```

Query params:
- `lines`: Number of log lines to retrieve (default: 100)

## Database Modes

### Dedicated Database (Preferred for Enterprise)
When the system has permission to create databases:
- Creates `mediczy_tenant_{id}` database
- Complete data isolation
- Independent backups
- Better performance for large tenants

### Shared Database with Tenant Isolation (Fallback)
When dedicated DB creation isn't possible:
- Uses main `mediczy_ai` database
- Tenant isolation via `TENANT_ID` environment variable
- Row-level filtering on all queries
- Suitable for smaller Enterprise tenants

## Environment Variables for Tenant Servers

Each tenant server receives these environment variables:

```env
PORT=8011
TENANT_MODE=dedicated
TENANT_ID=1
TENANT_SLUG=apollo-hospitals-chennai
TENANT_NAME=Apollo Hospitals Chennai
DATABASE_URL=postgresql://user:pass@host:5432/mediczy_tenant_1
POSTGRES_DATABASE=mediczy_tenant_1
NODE_ENV=production
JWT_SECRET=***
REDIS_HOST=localhost
REDIS_PORT=6379
```

## Log Files

Each tenant server has dedicated log files:
- Error log: `/home/ubuntu/Mediczy/logs/tenant-{slug}-error.log`
- Output log: `/home/ubuntu/Mediczy/logs/tenant-{slug}-out.log`

## PM2 Commands

### Manual Management
```bash
# List all processes
pm2 list

# View tenant server logs
pm2 logs tenant-apollo-hospitals-chennai

# Monitor resources
pm2 monit

# Save current process list
pm2 save
```

## Frontend UI

The Super Admin dashboard includes server control buttons for Enterprise tenants:
- **Power (Green)**: Start server
- **Power Off (Red)**: Stop server  
- **Rotate (Orange)**: Restart server
- **Terminal (Gray)**: View logs

Location: `/client/src/pages/admin/AdminTenantManagement.tsx`

## Files Modified

1. `/server/services/database-provisioning.service.js`
   - Added PM2 server management functions
   - Port allocation logic
   - Environment variable building

2. `/server/routes/super-admin-tenant.route.js`
   - Server control API endpoints
   - Enterprise plan validation

3. `/client/src/pages/admin/AdminTenantManagement.tsx`
   - Server control UI buttons
   - Status indicators

## Security Considerations

1. **Super Admin Only**: All server control endpoints require Super Admin authentication
2. **Enterprise Plan Validation**: Only Enterprise tenants can have dedicated servers
3. **Log Access Control**: Logs are only accessible to Super Admin
4. **Isolated Environment**: Each tenant server runs in its own PM2 process with isolated environment variables

## Scaling

- Each dedicated server uses ~250-300MB RAM
- PM2 handles process monitoring and auto-restart
- Consider using PM2 cluster mode for high-traffic tenants
- Memory limit set to 500MB for auto-restart

---

Last Updated: January 2026
