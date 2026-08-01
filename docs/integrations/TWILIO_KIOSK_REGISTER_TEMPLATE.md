# Twilio WhatsApp Template — Kiosk Registration Invite

Business-initiated WhatsApp messages (kiosk “send registration link”) **require an approved Content template**. Free-form session messages only work inside a 24‑hour customer-care window.

## Template copy (style=`text` — recommended default)

| Variable | Meaning | Example |
|---|---|---|
| `{{1}}` | Hospital / facility name | `QA General Hospital` |
| `{{2}}` | Expiry minutes | `30` |
| `{{3}}` | Full secure URL | `https://app.mediqzy.com/kiosk/register/<token>` |

**Body:**
```
Mediqzy · Complete your registration for {{1}}

Tap this secure link (expires in {{2}} min):
{{3}}

Do not share this link. Reply STOP to opt out.
```

- **Category:** `UTILITY`
- **Language:** `en`
- **Friendly name:** `mediqzy_kiosk_registration`

## Optional style=`cta` (URL button)

Body:
```
Mediqzy · Complete your registration for {{1}}. This secure link expires in {{2}} minutes. Do not share this link.
```

Button:
- Title: `Register now`
- URL: `https://app.mediqzy.com/kiosk/register/{{3}}`  
  (`{{3}}` = token only)

## Create via script (on prod / machine with Twilio env)

```bash
cd /home/ubuntu/Mediczy/server   # or local with .env
node scripts/create-kiosk-register-whatsapp-template.js
# or CTA button version:
node scripts/create-kiosk-register-whatsapp-template.js --style=cta
# list existing:
node scripts/create-kiosk-register-whatsapp-template.js --list
# submit approval for an existing SID:
node scripts/create-kiosk-register-whatsapp-template.js --submit-only HXd6c41df868bbf2bfa128a777b69ad3b8
```

The script prints:

```
WHATSAPP_TEMPLATE_KIOSK_REGISTER=HXxxxxxxxx
WHATSAPP_TEMPLATE_KIOSK_REGISTER_STYLE=text
```

### Production SID (created 2026-08-01)

```
WHATSAPP_TEMPLATE_KIOSK_REGISTER=HXd6c41df868bbf2bfa128a777b69ad3b8
WHATSAPP_TEMPLATE_KIOSK_REGISTER_STYLE=text
```

Add those to the API host env (PM2 ecosystem / `.env`) and restart:

```bash
# example if using server/.env
grep -q WHATSAPP_TEMPLATE_KIOSK_REGISTER .env \
  && sed -i 's|^WHATSAPP_TEMPLATE_KIOSK_REGISTER=.*|WHATSAPP_TEMPLATE_KIOSK_REGISTER=HXd6c41df868bbf2bfa128a777b69ad3b8|' .env \
  || echo 'WHATSAPP_TEMPLATE_KIOSK_REGISTER=HXd6c41df868bbf2bfa128a777b69ad3b8' >> .env
grep -q WHATSAPP_TEMPLATE_KIOSK_REGISTER_STYLE .env \
  && sed -i 's|^WHATSAPP_TEMPLATE_KIOSK_REGISTER_STYLE=.*|WHATSAPP_TEMPLATE_KIOSK_REGISTER_STYLE=text|' .env \
  || echo 'WHATSAPP_TEMPLATE_KIOSK_REGISTER_STYLE=text' >> .env
pm2 restart mediczy-server --update-env
```

## Create manually in Twilio Console

1. Open [Content Template Builder](https://console.twilio.com/us1/develop/sms/content-template-builder)
2. Create → WhatsApp → **Utility**
3. Paste the body above with variables `{{1}}` `{{2}}` `{{3}}`
4. Submit for WhatsApp approval
5. Copy Content SID (`HX…`) into `WHATSAPP_TEMPLATE_KIOSK_REGISTER`

## App wiring

| Piece | Location |
|---|---|
| Send path | `whatsapp-production.service.js` → `sendKioskRegistrationInvite()` |
| Notify wrapper | `queue-notify.service.js` → `sendKioskRegistrationNotify()` |
| Invite create | `kiosk-registration.service.js` → uses template notify (not free-form) |
| Kiosk fallback | On-screen QR still shown if WhatsApp/SMS fail |

## Verify

1. Template status in Twilio = **Approved** (Pending = message accepted then undelivered)
2. Env set + API restarted (`pm2 restart mediczy-server --update-env`)
3. Device-auth health:
   ```bash
   curl -s https://app.mediqzy.com/api/display/kiosk/notify-health \
     -H "x-device-token: $DEVICE_TOKEN" | jq
   # expect kioskRegisterTemplate: true
   ```
4. Kiosk → Mobile number → test handset
5. Invite API now returns `whatsappSid` + `whatsappStatus` + `notifyErrors` after delivery poll
6. Kiosk always shows QR backup if WhatsApp fails

## Common “not received” causes

| Symptom | Cause | Fix |
|---|---|---|
| `notifyErrors` includes template / 630xx | Content template not **Approved** or vars mismatch | Approve in Twilio; match `STYLE=text` vs `cta` |
| `linkSent: true` but phone empty (old builds) | API treated `messages.create()` as success | Deploy delivery-poll fix |
| SMS Twilio **21659** | SMS From is the WhatsApp sender (`TWILIO_WHATSAPP_NUMBER`) | Set `TWILIO_SMS_NUMBER` to a real SMS-capable E.164 (or `TWILIO_MESSAGING_SERVICE_SID`). Never reuse the WhatsApp number. |
| SMS `status code 400` | Alpha `MEDICZY` / missing From | Set `TWILIO_SMS_NUMBER` |
| Template missing on process | Env set but PM2 not restarted | `pm2 restart … --update-env` |

### SMS backup (when WhatsApp undelivers)

```bash
# On EC2 — list SMS-capable numbers on the Twilio account
cd /home/ubuntu/Mediczy/server
node scripts/twilio-list-sms-numbers.mjs

# Pick an SMS-capable number that is NOT the WhatsApp sender, then:
# in .env / PM2 ecosystem:
TWILIO_SMS_NUMBER=+91XXXXXXXXXX
# optional:
# TWILIO_MESSAGING_SERVICE_SID=MGxxxxxxxx
# TWILIO_SMS_AUTO_DISCOVER=true   # default; auto-picks SMS number if env unset

pm2 restart mediczy-server --update-env

# Health should show smsConfigured: true
curl -s https://app.mediqzy.com/api/display/kiosk/notify-health \
  -H "x-device-token: $DEVICE_TOKEN" | jq '{smsConfigured,smsFromSource,smsFromHint}'
```
