# SIB FastAPI Repetitive Response Issue - Diagnosis & Solution

## Problem Identified ✅
**The SIB FastAPI service is returning 80% repetitive responses because it's operating in "fallback" mode instead of using the actual AI model.**

### Test Results
```
Total messages tested: 10
Unique responses: 2
Repetition ratio: 80.0%
Average response length: 406 characters
```

All responses (except 1) return the exact same 451-character template:
```
🔍 **Understanding Your Concern**
Thank you for sharing your health concern with me.

🏥 **Recommended Actions**
- If symptoms are severe or persistent, please consult a healthcare provider
- Keep track of your symptoms
- Stay hydrated and get adequate rest

📞 **For Emergencies**
- Call emergency services (911 or 108) immediately

⚕️ *This is general guidance. Please consult qualified healthcare professionals for proper diagnosis and treatment.*
```

### Root Causes

From the SIB health check response:
```json
{
  "status": "healthy",
  "sib": {
    "status": "healthy",
    "botlets_loaded": {
      "chat": true,
      "ehr": "error: No module named 'aiohttp'",
      "risk": "error: No module named 'aiohttp'",
      "summarizer": true,
      "task": "error: No module named 'aiohttp'",
      "notification": "error: No module named 'aiohttp'",
      "insurance": true,
      "web_search": true
    }
  },
  "database": {
    "connected": false,
    "postgres": false,
    "pgvector": false,
    "citus": false,
    "duckdb": false,
    "jsonb": false
  }
}
```

**Critical Issues:**
1. ⚠️ **Database disconnected** - No PostgreSQL connection (prevents context-aware responses)
2. ⚠️ **Missing aiohttp module** - EHR, Risk, and Task botlets can't load
3. ⚠️ **Chat botlet in fallback** - When database is down, model defaults to template responses

---

## Solution 1: Fix Database Connection

### Quick Fix - Check PostgreSQL
```bash
# Verify PostgreSQL is running
sudo systemctl status postgresql

# Check if connection pool works
psql -U mediczy_user -d mediczy -h localhost -c "SELECT COUNT(*) FROM pg_tables;"

# Check if pgvector extension is enabled
psql -U mediczy_user -d mediczy -h localhost -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### Environment Variables to Check
```bash
# These should be set in .env or ecosystem.config.js for SIB
echo "Database Configuration:"
grep -E "DB_HOST|DB_PORT|DB_USER|DB_PASS|DB_NAME|DATABASE_URL" /home/ubuntu/Mediczy/.env
grep -E "postgres|DATABASE" /home/ubuntu/Mediczy/ecosystem.config.js
```

### Verify Connection String
```bash
# For SIB FastAPI, check connection string format
# Should be something like:
# postgresql://mediczy_user:password@localhost:5432/mediczy
# or
# postgresql://user:pass@localhost/mediczy?application_name=sib_app
```

---

## Solution 2: Install Missing Dependencies

```bash
# SSH into the SIB service environment
cd /home/ubuntu/Mediczy

# Check current Python environment
python3 --version
pip list | grep -E "aiohttp|fastapi|uvicorn"

# Install missing aiohttp module
pip install aiohttp

# Verify installation
python3 -c "import aiohttp; print(f'aiohttp {aiohttp.__version__} installed')"
```

---

## Solution 3: Restart SIB Service with Proper Configuration

```bash
# Stop the current SIB service
pkill -f "uvicorn.*8001" || kill -9 1182527

# Restart with proper environment
cd /home/ubuntu/Mediczy
export DB_HOST=localhost
export DB_PORT=5432
export DB_USER=mediczy_user
export DB_NAME=mediczy
export SIB_ENV=production

# Start with verbose logging
python3 -m uvicorn main:app --host 0.0.0.0 --port 8001 --log-level info
```

---

## Solution 4: Verify Health Check Again

After fixes, run this diagnostic:

```bash
# Quick health test
curl -s http://localhost:8001/health | jq '{database: .database, botlets: .sib.botlets_loaded}'

# Expected output:
# {
#   "database": {
#     "connected": true,
#     "postgres": true,
#     "pgvector": true
#   },
#   "botlets": {
#     "chat": true,
#     "ehr": true,
#     "risk": true,
#     "summarizer": true,
#     "task": true
#   }
# }
```

---

## Solution 5: Re-test with Actual AI Responses

```bash
# Run the direct SIB test again
node /home/ubuntu/Mediczy/test-sib-direct.js

# Expected results:
# - Unique responses: 8-10 (not 2)
# - Repetition ratio: 0-20% (not 80%)
# - Provider: should be "sib-brain" or specific model, not "fallback"
```

---

## Quick Action Plan (Priority Order)

### 🔴 CRITICAL (Do First)
1. **Check database connection**
   ```bash
   psql -U mediczy_user -d mediczy -h localhost -c "\dt"
   ```

2. **Install aiohttp**
   ```bash
   pip install aiohttp
   ```

3. **Restart SIB service**
   ```bash
   pkill -f "uvicorn.*8001"
   sleep 2
   ps aux | grep uvicorn  # Verify stopped
   ```

### 🟡 IMPORTANT (Do Next)
4. Test database connectivity from Python:
   ```bash
   python3 -c "
   import psycopg2
   try:
       conn = psycopg2.connect('dbname=mediczy user=mediczy_user host=localhost')
       print('✅ PostgreSQL connected')
   except Exception as e:
       print(f'❌ Connection failed: {e}')
   "
   ```

5. Test pgvector extension:
   ```bash
   psql -U mediczy_user -d mediczy -c "CREATE EXTENSION IF NOT EXISTS vector;"
   ```

### 🟢 VERIFY (Do Last)
6. Re-run test to confirm fix:
   ```bash
   node /home/ubuntu/Mediczy/test-sib-direct.js
   ```

---

## Advanced Configuration

### Enable SIB Debug Logging
Create `/home/ubuntu/Mediczy/sib-debug.conf`:
```ini
[logging]
level = DEBUG
format = %(asctime)s - %(name)s - %(levelname)s - %(message)s
handlers = console,file
file = logs/sib-debug.log
```

### Monitor Response Quality
```bash
# Real-time monitoring
while true; do
  response=$(curl -s -X POST http://localhost:8001/chat \
    -H "Content-Type: application/json" \
    -d '{"message":"I have a fever","phone_number":"+919876543210","session_id":"monitor"}')
  
  provider=$(echo "$response" | jq -r '.provider')
  length=$(echo "$response" | jq '.chat_answer | if type=="array" then .[0]|length else length end')
  
  echo "[$(date +'%H:%M:%S')] Provider: $provider | Length: $length"
  sleep 5
done
```

---

## Testing Individual Botlets

```bash
# Test chat botlet
curl -X POST http://localhost:8001/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "I have a fever",
    "phone_number": "+919876543210",
    "session_id": "test_chat"
  }' | jq '.provider'

# Test EHR botlet (if available)
curl -X POST http://localhost:8001/ehr-lookup \
  -H "Content-Type: application/json" \
  -d '{"patient_id":"test"}' | jq '.'

# Test web search botlet
curl -X POST http://localhost:8001/web-search \
  -H "Content-Type: application/json" \
  -d '{"query":"latest diabetes treatment"}' | jq '.'
```

---

## Monitoring Dashboard Script

```bash
#!/bin/bash

# Create a monitoring dashboard
watch -n 2 'echo "=== SIB SERVICE HEALTH ===" && \
  echo "Port 8001 Status:" && lsof -i :8001 | tail -1 && \
  echo "" && \
  echo "Health Check:" && \
  curl -s http://localhost:8001/health | jq -c "{status, db: .database.connected, botlets: .sib.botlets_loaded}" && \
  echo "" && \
  echo "Last 10 Requests:" && \
  curl -s  http://localhost:8001/stats 2>/dev/null | jq -c ".recent_requests[-10:] | .[] | {timestamp, message:.message[0:30], provider}" || echo "Stats endpoint not available"'
```

---

## After Fix Validation

Once fixed, you should see:
- ✅ Database connected: true
- ✅ All botlets loaded correctly
- ✅ Responses vary by input (80% → 0-20% repetition)
- ✅ Provider shows specific model, not "fallback"
- ✅ Response time < 2 seconds
- ✅ Natural, context-aware answers

---

## Contact & Support

If issues persist after applying these solutions:
1. Check `/var/log/sib-fastapi.log` for detailed errors
2. Verify environment variables are sourced correctly
3. Check PostgreSQL logs: `sudo tail -100 /var/log/postgresql/postgresql-*.log`
4. Test PostgreSQL directly: `psql -U mediczy_user -d mediczy`
