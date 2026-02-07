# PostgreSQL Database - Setup Complete ✅

**Date:** February 6, 2026  
**Status:** Connected and Ready

## Database Information

**Connection Details:**
```
Host:     localhost
Port:     5432
Database: mediczy_ai
User:     mediczy_helper
Password: mediczy_dev_password_2026 (from .env)
Version:  PostgreSQL 15.15
```

**Docker Container:**
```bash
Container Name: mediczy-postgres
Image:          postgres:15-alpine
Status:         Running
Volume:         mediczy_postgres_data
```

## Database Schema

### Tables Created: 18

#### API v1 Tables (17)
1. `api_appointments` - Appointment bookings with canonical meeting IDs
2. `api_audit_logs` - Audit trail for all operations
3. `api_chat_messages` - Chat messages
4. `api_chat_rooms` - Chat conversation rooms
5. `api_consent_logs` - Patient consent tracking
6. `api_doctors` - Doctor profiles and availability
7. `api_homecare_bookings` - Home healthcare service bookings
8. `api_homecare_services` - Homecare service catalog
9. `api_hra_assessments` - Health Risk Assessments
10. `api_lab_bookings` - Lab test bookings
11. `api_lab_tests` - Lab test catalog
12. `api_pharmacy_orders` - Medicine orders with delivery tracking
13. `api_prescriptions` - Digital prescriptions
14. `api_users` - Patient profiles with health data
15. `api_webhook_deliveries` - Webhook delivery history
16. `api_webhooks` - Webhook registrations
17. `api_wellness_plans` - Wellness program catalog

#### Infrastructure Tables (1)
18. `tenants` - Multi-tenant configuration

### Seed Data

✅ **Demo Tenant Created:** `clinic-demo`

## Quick Commands

### Start/Stop Database
```bash
# Start PostgreSQL container
docker start mediczy-postgres

# Stop PostgreSQL container
docker stop mediczy-postgres

# View logs
docker logs mediczy-postgres

# Access PostgreSQL CLI
docker exec -it mediczy-postgres psql -U mediczy_helper -d mediczy_ai
```

### Test Connection
```bash
# Using test script
./test-db-connection.sh

# Using Node.js directly
export $(cat .env | grep -v '^#' | xargs) && node run-migration.js
```

### Database Operations
```bash
# List all tables
docker exec -it mediczy-postgres psql -U mediczy_helper -d mediczy_ai -c "\dt"

# Count records in a table
docker exec -it mediczy-postgres psql -U mediczy_helper -d mediczy_ai -c "SELECT COUNT(*) FROM tenants;"

# View table schema
docker exec -it mediczy-postgres psql -U mediczy_helper -d mediczy_ai -c "\d api_users"

# Backup database
docker exec mediczy-postgres pg_dump -U mediczy_helper mediczy_ai > backup_$(date +%Y%m%d).sql

# Restore database
docker exec -i mediczy-postgres psql -U mediczy_helper mediczy_ai < backup_20260206.sql
```

## Environment Configuration

**File:** `.env` (created)

Key variables configured:
```env
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DATABASE=mediczy_ai
POSTGRES_USER=mediczy_helper
POSTGRES_PASSWORD=mediczy_dev_password_2026
JWT_SECRET=dev-jwt-secret-key-change-in-production-32chars-minimum
JWT_REFRESH_SECRET=dev-refresh-secret-key-change-in-production-32chars-min
```

### Loading Environment Variables

The application needs environment variables loaded. Use either:

**Option 1: Export before running**
```bash
export $(cat .env | grep -v '^#' | xargs)
npm start
```

**Option 2: Install dotenv**
```bash
npm install dotenv
```

Then add to your app startup:
```javascript
import dotenv from 'dotenv';
dotenv.config();
```

## Next Steps - API Testing

### 1. Start the Server
```bash
# Load .env and start server
export $(cat .env | grep -v '^#' | xargs) && npm start

# Or with PM2
pm2 start ecosystem.config.js
```

### 2. Test API Health Check
```bash
curl http://localhost:5000/v1/health
```

Expected response:
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "timestamp": "2026-02-06T..."
}
```

### 3. Test API Info Endpoint
```bash
curl http://localhost:5000/v1/
```

Expected response shows all 11 modules:
```json
{
  "name": "Mediqzy API",
  "version": "1.0.0",
  "endpoints": {
    "auth": "/v1/auth",
    "users": "/v1/{tenant-id}/users",
    "doctors": "/v1/{tenant-id}/doctors",
    "appointments": "/v1/{tenant-id}/appointments",
    "video": "/v1/{tenant-id}/video",
    "chat": "/v1/{tenant-id}/chat",
    "labs": "/v1/{tenant-id}/labs",
    "pharmacy": "/v1/{tenant-id}/pharmacy",
    "homecare": "/v1/{tenant-id}/homecare",
    "wellness": "/v1/{tenant-id}/wellness",
    "webhooks": "/v1/{tenant-id}/webhooks"
  }
}
```

### 4. Import Postman Collection
1. Open Postman
2. Import: `postman/mediqzy-api-v1.postman_collection.json`
3. Set environment variables:
   - `base_url`: http://localhost:5000/v1
   - `tenant_id`: clinic-demo

### 5. Generate Test Token (For Testing)

For testing without OIDC, you can create a test JWT:

```bash
node -e "
import jwt from 'jsonwebtoken';
const token = jwt.sign(
  { 
    user_id: 'test-user-1',
    external_user_id: 'test@example.com',
    tenant_id: 'clinic-demo',
    role: 'patient',
    scopes: ['users.read', 'users.write', 'appointments.*']
  },
  'dev-jwt-secret-key-change-in-production-32chars-minimum',
  { expiresIn: '1h' }
);
console.log('Test JWT Token:');
console.log(token);
"
```

## Database Migration Details

**Migration File:** `server/migrations/20260206_create_api_v1_schemas.sql`

**What was created:**
- All table schemas with proper data types
- Foreign key constraints (tenant_id, user_id, etc.)
- Indexes on frequently queried fields
- JSONB columns for flexible data (health_profile, medications, etc.)
- Auto-update triggers for updated_at timestamps
- Seed data for demo tenant (`clinic-demo`)

**Features:**
- Multi-tenant isolation via tenant_id
- Audit trail (created_at, updated_at on all tables)
- HIPAA-ready (PHI fields identified, encryption support)
- GDPR-compliant (consent tracking, soft deletes possible)

## Troubleshooting

### Connection Refused
```bash
# Check if PostgreSQL is running
docker ps | grep mediczy-postgres

# If not running, start it
docker start mediczy-postgres

# Check logs
docker logs mediczy-postgres
```

### Permission Denied
```bash
# Ensure environment variables are exported
export $(cat .env | grep -v '^#' | xargs)

# Test connection
./test-db-connection.sh
```

### Migration Failed
```bash
# Check if tables already exist
docker exec -it mediczy-postgres psql -U mediczy_helper -d mediczy_ai -c "\dt"

# Drop all API tables (CAUTION: destroys data)
docker exec -it mediczy-postgres psql -U mediczy_helper -d mediczy_ai -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# Re-run migration
export $(cat .env | grep -v '^#' | xargs) && node run-migration.js
```

### JWT Validation Errors
Make sure JWT secrets in `.env` match what's in `.env.api-v1`:
```bash
# Check current secrets
grep JWT_SECRET .env
```

## Production Considerations

### Before deploying to production:

1. **Change all secrets:**
   ```bash
   # Generate secure secrets
   openssl rand -base64 32  # For JWT_SECRET
   openssl rand -base64 32  # For JWT_REFRESH_SECRET
   openssl rand -base64 32  # For SESSION_SECRET
   ```

2. **Enable SSL:**
   ```env
   POSTGRES_SSL=true
   ```

3. **Use managed PostgreSQL:**
   - Azure Database for PostgreSQL
   - AWS RDS PostgreSQL
   - Google Cloud SQL

4. **Configure connection pooling:**
   ```env
   POSTGRES_POOL_MAX=20
   POSTGRES_POOL_MIN=5
   ```

5. **Enable monitoring:**
   - Database query performance
   - Connection pool metrics
   - Error rates

6. **Set up backups:**
   - Automated daily backups
   - Point-in-time recovery
   - Multi-region replication

## Resources

- **Testing Guide:** [API_V1_TESTING_GUIDE.md](./API_V1_TESTING_GUIDE.md)
- **Modules Complete:** [API_V1_MODULES_COMPLETE.md](./API_V1_MODULES_COMPLETE.md)
- **Environment Template:** `.env.api-v1`
- **Database Schema:** `server/migrations/20260206_create_api_v1_schemas.sql`

---

**Status:** ✅ Database fully configured and ready for application use  
**Last Updated:** February 6, 2026
