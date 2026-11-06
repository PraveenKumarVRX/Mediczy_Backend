# WhatsApp templates for Corporate AHC notifications

**Audience:** whoever registers WhatsApp templates in the **Gupshup** account and sets the prod env vars.
**Provider:** prod `WHATSAPP_PROVIDER=gupshup` (app `Mediqzy`). On Gupshup, every business-initiated
message **must** use an approved template id — a session/free-text message only delivers inside a 24h
customer-initiated window. Each send below passes positional params (`{{1}}`, `{{2}}`, …) **in the exact
order listed**; the template body must use those variables in that order.

**Category:** UTILITY (transactional). **Language:** English.

Until these are approved and their env vars set, the AHC confirmation / reports / reminder notices
fall back to **SMS + email** (already working). Setting the env vars + `pm2 reload mediczy-server --update-env`
switches them to WhatsApp.

Code: `server/services/health-checkup-notify.service.js` → `server/services/whatsapp-production.service.js`.

---

## 1. Health-checkup confirmation
- **Env var (SSM `/mediczy/prod`):** `GUPSHUP_TEMPLATE_HEALTH_CHECKUP`
- **Fires:** Team approves a booking (`booked → confirmed`); also used by the team-initiated booking flow.
- **Method:** `sendAppointmentConfirmation({ isHealthCheckup: true })`

| Var | Meaning | Example |
|---|---|---|
| `{{1}}` | Employee name | Latha R |
| `{{2}}` | Date | 6 Nov 2026 |
| `{{3}}` | Time | 9:00 AM |
| `{{4}}` | Venue (lab name — address) | Agilus Diagnostics — Indiranagar, Bengaluru |

**Suggested body:**
```
🏥 Health Checkup Confirmed
Dear {{1}}, your health checkup is confirmed.
📅 {{2}}   🕐 {{3}}
📍 {{4}}
Please carry a valid photo ID and arrive 10 minutes early.
— My SmartHealth Wellness Team
```

---

## 2. Reports ready
- **Env var:** `GUPSHUP_TEMPLATE_HEALTH_REPORT`
- **Fires:** Team uploads a report (`→ reports_available`).
- **Method:** `sendHealthReportReady({ to, patientName, reportUrl })`

| Var | Meaning | Example |
|---|---|---|
| `{{1}}` | Employee name | Latha R |
| `{{2}}` | App link | https://app.mediqzy.com |

**Suggested body:**
```
📋 Health Checkup Reports Ready
Hello {{1}}, your health checkup reports are ready.
Download and share them from the app: {{2}}
— My SmartHealth
```

---

## 3. Health-checkup reminder (T-24h, optional)
- **Env var:** `GUPSHUP_TEMPLATE_HEALTH_CHECKUP_REMINDER`
  *(dedicated template — not the doctor-appointment reminder, so there is no doctor variable)*
- **Fires:** the daily reminder cron (24h before the appointment).
- **Method:** `sendHealthCheckupReminder({ to, patientName, date, time, location })`

| Var | Meaning | Example |
|---|---|---|
| `{{1}}` | Employee name | Latha R |
| `{{2}}` | Date | 6 Nov 2026 |
| `{{3}}` | Time | 9:00 AM |
| `{{4}}` | Venue / centre | Agilus Diagnostics — Indiranagar, Bengaluru |

**Suggested body:**
```
🏥 Health Checkup Reminder
Dear {{1}}, your health checkup is on {{2}} at {{3}}.
📍 {{4}}
Please carry a valid photo ID and arrive 10 minutes early.
— My SmartHealth Wellness Team
```

---

## Go-live steps
1. Submit templates 1–3 in Gupshup (UTILITY, English) with the bodies above; wait for approval.
2. Put the approved template ids in SSM `/mediczy/prod`:
   `GUPSHUP_TEMPLATE_HEALTH_CHECKUP`, `GUPSHUP_TEMPLATE_HEALTH_REPORT`, `GUPSHUP_TEMPLATE_HEALTH_CHECKUP_REMINDER`.
3. `pm2 reload mediczy-server --update-env`.
4. Verify: approve a test booking and upload a test report → confirm WhatsApp delivery (not SMS fallback).

**Notes**
- "Booking submitted" (pending-approval) and "completed" notices have no approved template; they go out
  as a session message when a chat window is open, else SMS + email. Add templates later if cold WhatsApp
  delivery is wanted for those too.
- Keep the customer-facing brand as **My SmartHealth** in every template body (not Mediqzy/Mediczy).
