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
```

The script prints:

```
WHATSAPP_TEMPLATE_KIOSK_REGISTER=HXxxxxxxxx
WHATSAPP_TEMPLATE_KIOSK_REGISTER_STYLE=text
```

Add those to the API host env (PM2 ecosystem / `.env`) and restart:

```bash
pm2 restart mediczy-server
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

1. Template status in Twilio = **Approved**
2. Env set + API restarted
3. Kiosk → Mobile number → `9884089921` (or test handset)
4. WhatsApp arrives with tappable link; kiosk still shows QR as backup
