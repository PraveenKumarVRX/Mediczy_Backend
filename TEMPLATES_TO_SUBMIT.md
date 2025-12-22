# Pay4SMS Headers Configuration

Your approved headers for SMS sender IDs:

| # | Header | Header ID | Entity Name | Entity ID | Status |
|---|--------|-----------|-------------|-----------|--------|
| 1 | **MSMART** | 1705159195721255196 | MAYDEN SMARTHEALTH PRIVATE LIMITED | 17011580985XXXXXXXX | Approved ✓ (Default) |
| 2 | **MAYDEN** | 1705159195543446649 | MAYDEN SMARTHEALTH PRIVATE LIMITED | 17011580985XXXXXXXX | Approved ✓ |

**Recommendation:** Use **MSMART** as your sender ID (already set as default).

## Your Approved DLT Templates

| # | Name | Template ID | Message | Date |
|---|------|-------------|---------|------|
| 1 | **LOGIN OTP** (Recommended) | 1707162254671707XXXXXXXX | `{#var#} is your One Time Password to login with your My Smart Health Account. Don't Share this with anyone.` | 2024-09-13 |
| 2 | CHANGE PASSWORD MY SMART HEALTH | 17071622546XXXXXXXX | `{#var#} is your One Time Password to Change your My SmartHealth Account Password. Do not Share this with anyone.` | 2021-08-13 |
| 3 | LOGIN OTP (Old) | 17071622546XXXXXXXX | `{#var#} is your One Time Password to login with your My Smart Health Account. Don't Share this with anyone.` | 2023-01-24 |
| 4 | One Time Password | 17071622546XXXXXXXX | `{#var#} is your One Time Password to Change your My Smart Health Password. Don't Share this with anyone.` | 2021-06-03 |

**Recommendation:** Use template **LOGIN OTP** (ID: `1707162254671707XXXXXXXX`) - it's the most recent and suitable for login OTP.

**Variable Format:** Use `{#var#}` as placeholder in your message, which will be replaced with the actual OTP code.

---

# Healthcare WhatsApp Templates to Submit

Go to: https://console.twilio.com/us1/develop/sms/try-it-out/templates

## Template 1: Appointment Confirmation
**Template Name:** `appointment_confirmation`
**Category:** UTILITY
**Language:** English (en)

```
Hello {{1}},

Your appointment has been confirmed with Dr. {{2}}.

📅 Date: {{3}}
🕐 Time: {{4}}
📍 Location: {{5}}

Please arrive 10 minutes early.

- Mediczy Healthcare
```

**Variables:**
- {{1}} = Patient name
- {{2}} = Doctor name
- {{3}} = Date
- {{4}} = Time
- {{5}} = Location

---

## Template 2: Appointment Reminder
**Template Name:** `appointment_reminder`
**Category:** UTILITY
**Language:** English (en)

```
Hi {{1}},

Reminder: You have an appointment with Dr. {{2}} tomorrow at {{3}}.

📍 {{4}}

Please confirm or call to reschedule.

- Mediczy Healthcare
```

**Variables:**
- {{1}} = Patient name
- {{2}} = Doctor name
- {{3}} = Time
- {{4}} = Location

---

## Template 3: Health Report Ready
**Template Name:** `health_report_ready`
**Category:** UTILITY
**Language:** English (en)

```
Hello {{1}},

Your health report is now available.

Login to view your results: {{2}}

For questions, contact your doctor.

- Mediczy Healthcare
```

**Variables:**
- {{1}} = Patient name
- {{2}} = Report URL

---

## Template 4: Prescription Ready
**Template Name:** `prescription_ready`
**Category:** UTILITY
**Language:** English (en)

```
Hi {{1}},

Your prescription from Dr. {{2}} is ready.

View: {{3}}

💊 Medications: {{4}}
🗓️ Follow-up: {{5}}

- Mediczy Healthcare
```

**Variables:**
- {{1}} = Patient name
- {{2}} = Doctor name
- {{3}} = Prescription URL
- {{4}} = Medication list
- {{5}} = Follow-up date

---

## Template 5: Health Checkup Reminder
**Template Name:** `checkup_reminder`
**Category:** UTILITY
**Language:** English (en)

```
Hi {{1}},

Time for your annual health checkup!

Your benefits cover:
✓ Full body checkup
✓ Doctor consultation

Book: {{2}}

- Mediczy Healthcare
```

**Variables:**
- {{1}} = Patient name
- {{2}} = Booking URL

---

## Current Configuration (Use Existing Templates)

For now, update your .env with templates you already have:

```env
# WhatsApp Production Templates
WHATSAPP_TEMPLATE_OTP=HX33ae0014bd63fad4404789d2373b6174
WHATSAPP_TEMPLATE_APPOINTMENT_CONFIRMATION=
WHATSAPP_TEMPLATE_APPOINTMENT_REMINDER=
WHATSAPP_TEMPLATE_HEALTH_REPORT=
WHATSAPP_TEMPLATE_PRESCRIPTION=
WHATSAPP_TEMPLATE_CHECKUP_REMINDER=
```

## Alternative: Use Generic Templates

You can temporarily use these existing templates:
- **notification_order_tracking** (HXf336bf6fd2130dc8743d750549e34dfe) - for appointments
- **customer_care_greeting_template** (HX92bcdc10a5fc3d6d6a60cd911a54045a) - for greetings
- **otp_verification** (HX33ae0014bd63fad4404789d2373b6174) - for OTP ✅

## Next Steps

1. **Option A - Use what you have:**
   - Use `otp_verification` for OTP messages
   - Use `notification_order_tracking` for appointment notifications
   - Test with these first

2. **Option B - Create healthcare templates:**
   - Submit the 5 healthcare templates above
   - Wait 24-48 hours for approval
   - Update .env with new template SIDs

Which would you like to do?
