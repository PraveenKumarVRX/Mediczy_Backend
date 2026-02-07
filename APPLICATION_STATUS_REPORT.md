# Mediczy Application Status Report
Generated: 2026-02-06T18:51:20.103Z

---

## 📊 PM2 Process Status

❌ **Error checking PM2 status:** Command failed: pm2 jlist
/bin/sh: 1: pm2: not found


---

## 🌐 Port Status

- ✅ Port 3000: **LISTENING**
- ✅ Port 8000: **LISTENING**
- ✅ Port 8001: **LISTENING**
- ✅ Port 8888: **LISTENING**
- ✅ Port 7860: **LISTENING**
- ✅ Port 5432: **LISTENING**
- ✅ Port 5433: **LISTENING**

---

## 🏥 Health Endpoints

- ❌ **Main Server:** Not responding
- ⚠️ **FastAPI Server (8000):** Not responding

---

## 🗄️ Database Connection

- ✅ **PostgreSQL:** Connected successfully

---

## ⚠️ Recent Errors

✅ **No recent errors found in logs**

---

## 📋 Overall Status

❌ PM2: Not available
❌ Main Server: Not responding

### ⚠️ **2 ISSUE(S) DETECTED**

**Recommended Actions:**
- Check process details: `pm2 list`
- View logs: `pm2 logs <process-name>`
- Restart if needed: `pm2 restart all`

---

*Report generated at 2/6/2026, 6:51:20 PM*
