# Bot ↔ Agent Integration - Quick Reference

**Keep this handy for common tasks**

---

## 🚀 Quick Start

### Check Everything is Running
```bash
# Check backend
curl http://localhost:8888/health

# Check RocketChat  
curl -k https://smart-chat.live/api/v1/info | jq '.version'

# Check Redis
redis-cli ping

# Check Docker containers
docker ps | grep -E "rocketchat|mongodb"
```

### Start Services (If Needed)
```bash
# Start backend
cd /home/ubuntu/Mediczy
npm run dev:watch

# Start RocketChat + MongoDB  
cd /home/ubuntu/rocketchat
docker-compose up -d

# Check logs
tail -f /home/ubuntu/Mediczy/logs/backend.log

# Stop (when done)
docker-compose down
```

---

## 📨 Test Messages

### Test 1: Normal Query (Bot Responds)
```bash
curl -X POST http://localhost:8888/api/support/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "from": "+441234567890",
    "body": "I have a fever. What should I do?",
    "patient": {
      "id": "patient-001",
      "firstName": "John",
      "lastName": "Doe",
      "phoneNumber": "+441234567890"
    }
  }' | jq '.'

# Expected: {"success": true, "handled": "bot", "roomId": "xxx"}
```

### Test 2: Emergency (Escalates to Agent)
```bash
curl -X POST http://localhost:8888/api/support/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "from": "+441234567891",
    "body": "I have severe chest pain and cannot breathe! This is an emergency!",
    "patient": {
      "id": "patient-002",
      "firstName": "Alice",
      "lastName": "Smith",
      "phoneNumber": "+441234567891"
    }
  }' | jq '.'

# Expected: {"success": true, "handled": "handoff", "department": "emergency"}
```

### Test 3: Explicit Handoff Request
```bash
curl -X POST http://localhost:8888/api/support/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "from": "+441234567892",
    "body": "I want to speak to a doctor immediately, not a chatbot",
    "patient": {
      "id": "patient-003",
      "firstName": "Bob",
      "lastName": "Johnson",
      "phoneNumber": "+441234567892"
    }
  }' | jq '.'

# Expected: {"success": true, "handled": "handoff", "department": "general"}
```

### Test 4: Hindi Language Support
```bash
curl -X POST http://localhost:8888/api/support/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "from": "+919876543210",
    "body": "मुझे बुखार है। क्या मुझे डॉक्टर के पास जाना चाहिए?",
    "patient": {
      "id": "patient-004",
      "firstName": "राज",
      "lastName": "पटेल",
      "phoneNumber": "+919876543210"
    }
  }' | jq '.'

# Expected: {"success": true, "handled": "bot", "roomId": "yyy"}
```

---

## 🧪 Run Test Suite

```bash
# Run all automated tests
cd /home/ubuntu/Mediczy
node bot-agent-integration.test.js

# Run and output to file
node bot-agent-integration.test.js | tee test-results.txt
```

---

## 🔐 RocketChat Access

### Login Credentials
```
URL: https://smart-chat.live
Username: support_admin
Password: Password@1234567
Auth Token: uQM8DVr6wFeHwJiZdCMWN6PySPL1MLrcrscpzj2TVgj
```

### Check Messages Arrived
```bash
# 1. Open browser: https://smart-chat.live
# 2. Login with credentials above
# 3. Click on #whatsapp channel
# 4. Should see customer messages + bot responses or escalation notes
```

---

## 🔍 Monitor Logs

### Watch Real-Time Logs
```bash
tail -f /home/ubuntu/Mediczy/logs/backend.log | grep -i "bot\|handoff\|whatsapp"
```

### Check PM2 Status
```bash
pm2 status
pm2 logs
```

---

## 💾 Check Cache State

### Redis State Inspection
```bash
redis-cli
> KEYS "whatsapp:handoff:*"
> GET "whatsapp:handoff:+441234567890"
```

---

## 🔧 Quick Troubleshooting

### Backend Not Running?
```bash
pm2 restart all
```

### RocketChat Not Accessible?
```bash
docker ps | grep rocketchat
docker restart rocketchat
```

### Messages Not Showing in RocketChat?
```bash
# Check webhook auth
grep "ROCKETCHAT_ADMIN" /home/ubuntu/Mediczy/server/.env
```

---

## 📚 Documentation Links

- [Full Integration Guide](./BOT_AGENT_INTEGRATION_GUIDE.md)
- [Implementation Status](./IMPLEMENTATION_STATUS.md)
- [Session Summary](./SESSION_SUMMARY.md)

---

**Status**: ✅ Ready to Test  
**Version**: 2.0
