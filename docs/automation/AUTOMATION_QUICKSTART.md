# ⚡ AUTOMATION QUICK START GUIDE

## 🚀 30-Second Overview

Mediqzy now has **14 active automation systems** running 24/7:
- ✅ Appointment reminders (every 30 min)
- ✅ Payment reminders (daily 9 AM)
- ✅ Medication reminders (3x daily)
- ✅ Follow-up automation (daily 10 AM)
- ✅ Prescription expiry alerts (daily 9:30 AM)
- ✅ Doctor performance reports (Monday 9 AM)
- ✅ Auto-invoice generation (real-time)
- ✅ Auto-prescription generation (real-time)
- ✅ And 6 more...

**All systems operational. No action required.**

---

## ⚡ Quick Health Check (30 seconds)

```bash
# 1. Check server status
pm2 status mediczy-server
# Should show: status: online

# 2. Check automation initialization
pm2 logs mediczy-server --lines 50 --nostream | grep "All cron jobs"
# Should show: "✅ All cron jobs and automation services initialized successfully"

# 3. Check dashboard
curl -s -o /dev/null -w "%{http_code}" https://mediqzy.com/admin/workflow-automation
# Should return: 200
```

✅ All 3 checks pass? **System is healthy!**

---

## 📊 Access Automation Dashboard

**URL:** https://mediqzy.com/admin/workflow-automation

**What you'll see:**
- Real-time automation status grid
- Success/failure metrics
- Notification delivery charts
- Revenue impact analytics
- Manual trigger controls
- Live logs

**Login:** Use your admin credentials

---

## 🔧 Common Operations

### View Real-Time Logs
```bash
# All automation activity
pm2 logs mediczy-server | grep -E "(automation|reminder|alert)"

# Specific automation
pm2 logs mediczy-server | grep "appointment reminder"
pm2 logs mediczy-server | grep "payment reminder"
pm2 logs mediczy-server | grep "medication"
```

### Restart Automations
```bash
# Restart server (all automations restart automatically)
pm2 restart mediczy-server

# Check initialization
sleep 5 && pm2 logs mediczy-server --lines 30 --nostream | grep "✅"
```

### Manual Trigger (Testing)
```bash
# Trigger appointment reminders immediately
curl -X POST https://mediqzy.com/api/admin/trigger-automation \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{"automation": "appointment_reminder"}'
```

---

## 📅 Daily Schedule (What Runs When)

```
02:00 AM → Data cleanup + Membership sync
08:00 AM → Morning medication reminders
09:00 AM → Payment + membership expiry alerts
09:30 AM → Prescription expiry warnings
10:00 AM → Follow-up appointment reminders
02:00 PM → Afternoon medication reminders
08:00 PM → Evening medication reminders

Every 30 min → Appointment reminders check
Every Monday 9 AM → Doctor performance reports
Real-time → Auto-invoice + Auto-prescription (on events)
```

---

## 🚨 Troubleshooting (5-Minute Fixes)

### ❌ "Automations not sending notifications"

**Check 1: API Keys Set?**
```bash
echo $TWILIO_ACCOUNT_SID
echo $SENDGRID_API_KEY
```
If empty → Set in `/home/ubuntu/Mediczy/server/.env`

**Check 2: Notification Service Running?**
```bash
pm2 logs mediczy-server | grep "notification service"
```
Should see: "✅ Notification Service initialized"

**Check 3: Database Connected?**
```bash
curl http://localhost:8000/api/db/health
```
Should return: `{"status":"healthy"}`

**Fix:** Restart server
```bash
pm2 restart mediczy-server
```

---

### ❌ "Cron jobs not running"

**Check Initialization:**
```bash
pm2 logs mediczy-server --lines 100 --nostream | grep "cron jobs"
```
Should see: "✅ All cron jobs and automation services initialized successfully"

**If not found:**
```bash
# Restart server
pm2 restart mediczy-server

# Wait 5 seconds
sleep 5

# Check again
pm2 logs mediczy-server --lines 30 --nostream | tail -20
```

---

### ❌ "Database migration errors"

**Re-run migrations:**
```bash
cd /home/ubuntu/Mediczy/server
npm run db:migrate
```

**Or run setup scripts:**
```bash
node scripts/setup-reminders.js
node scripts/setup-phase2-phase3.js
```

---

### ❌ "Dashboard shows 404"

**Check frontend build:**
```bash
pm2 status mediczy-frontend
```
Should show: status: online

**If not:**
```bash
cd /home/ubuntu/Mediczy/admin
npm run build
pm2 restart mediczy-frontend
```

---

## 📈 Expected Metrics (Week 1)

| Metric | Expected Value |
|--------|---------------|
| Notifications sent | ~12,000-15,000/week |
| Delivery rate | >95% |
| Appointment show-up | +15-20% |
| Payment collection time | -25-30% |
| Patient satisfaction | +2-3 points |

**Where to check:** https://mediqzy.com/admin/workflow-automation

---

## 📚 Full Documentation

- **Overview:** [AUTOMATION_EXECUTIVE_SUMMARY.md](AUTOMATION_EXECUTIVE_SUMMARY.md)
- **Phase 1:** [AUTOMATION_IMPLEMENTATION_COMPLETE.md](AUTOMATION_IMPLEMENTATION_COMPLETE.md)
- **Phase 2 & 3:** [AUTOMATION_PHASE_2_3_COMPLETE.md](AUTOMATION_PHASE_2_3_COMPLETE.md)
- **Visual Guide:** [AUTOMATION_VISUAL_DASHBOARD.md](AUTOMATION_VISUAL_DASHBOARD.md)
- **Full Checklist:** [AUTOMATION_CHECKLIST_COMPREHENSIVE.md](AUTOMATION_CHECKLIST_COMPREHENSIVE.md)

---

## 🎯 Key Files to Know

| File | Purpose |
|------|---------|
| `/server/controllers/initialization.controller.js` | Loads all automations at startup |
| `/server/services/appointment-reminder-cron.service.js` | Appointment reminders |
| `/server/services/payment-reminder-cron.service.js` | Payment reminders |
| `/server/services/followup-automation.service.js` | Follow-up scheduling |
| `/server/services/medication-reminder-cron.service.js` | Medication adherence |
| `/server/services/prescription-expiry-cron.service.js` | Prescription expiry alerts |
| `/server/services/doctor-performance-cron.service.js` | Weekly doctor reports |
| `/server/services/auto-invoice.service.js` | Auto-invoice generation |
| `/server/services/notification.service.js` | Multi-channel delivery |

---

## ⚙️ Configuration

**Environment Variables (`.env`):**
```bash
# SMS (Twilio)
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE_NUMBER=your_number

# Email (SendGrid)
SENDGRID_API_KEY=your_key
SENDGRID_FROM_EMAIL=noreply@mediqzy.com

# WhatsApp (Twilio)
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886

# Push Notifications (Firebase)
FIREBASE_SERVICE_ACCOUNT_KEY=path/to/key.json

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/mediczy
```

**Testing Configuration:**
- To test without sending real notifications, set `NOTIFICATION_TEST_MODE=true`
- Logs will show "📧 [TEST MODE]" instead of actually sending

---

## 🔐 Security Notes

- ✅ All patient data encrypted (HTTPS + DB encryption)
- ✅ PII masked in logs (phone/email hidden)
- ✅ GDPR compliant (users can opt-out)
- ✅ Admin-only manual triggers
- ✅ Rate limiting on notifications (prevents spam)
- ✅ Audit logs for all automation activity

---

## 📞 Need Help?

1. **Check logs first:**
   ```bash
   pm2 logs mediczy-server
   ```

2. **Run health checks:**
   ```bash
   curl http://localhost:8000/health
   curl http://localhost:8000/api/db/health
   ```

3. **Restart if needed:**
   ```bash
   pm2 restart mediczy-server
   ```

4. **Still stuck?**
   - Check full documentation (see links above)
   - Review AUTOMATION_VISUAL_DASHBOARD.md for system overview
   - Contact DevOps team

---

## ✅ Success Checklist

Before going live, verify:
- [ ] Server status: `pm2 status mediczy-server` → online
- [ ] Cron jobs initialized: Check logs for "All cron jobs"
- [ ] Dashboard accessible: https://mediqzy.com/admin/workflow-automation → 200 OK
- [ ] Database healthy: `curl localhost:8000/api/db/health` → healthy
- [ ] API keys set: Check `.env` file
- [ ] Notifications sending: Check dashboard metrics
- [ ] Logs clean: No error messages in `pm2 logs`

✅ **All checks pass? You're good to go!**

---

## 🎉 Quick Win: Test an Automation (2 minutes)

**Test Appointment Reminder:**

1. Create test appointment 30 minutes from now:
   ```sql
   INSERT INTO appointments (patientId, doctorId, appointmentDate, status)
   VALUES (1, 1, NOW() + INTERVAL '30 minutes', 'confirmed');
   ```

2. Wait for next 30-minute mark (:00 or :30)

3. Check logs:
   ```bash
   pm2 logs mediczy-server | grep "appointment reminder"
   ```

4. Should see: "📧 Sending 15-minute reminder to [patient]"

✅ **Works? All automations are operational!**

---

**Status:** ✅ All 14 automation systems are live and operational  
**Last Updated:** January 15, 2026  
**Version:** 1.0.0

🚀 **You're all set! Automations are running 24/7.**
