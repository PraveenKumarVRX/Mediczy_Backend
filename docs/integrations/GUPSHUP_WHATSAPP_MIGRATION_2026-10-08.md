**Gupshup migration for +91 8098998998 — implementation and activation**

As of this inspection, the application still selected Twilio. The generic Gupshup send method fabricated a message ID without calling a provider. The primary webhook read Twilio fields and returned TwiML, which Gupshup does not use for replies.

The standard production SSM path `/mediczy/prod` initially contained none of `GUPSHUP_API_KEY`, `GUPSHUP_APP_NAME`, `GUPSHUP_SOURCE_NUMBER`, `GUPSHUP_WEBHOOK_SECRET`, or `WHATSAPP_PROVIDER` when checked on 8 October 2026. The supplied Gupshup API key is now stored as `/mediczy/prod/GUPSHUP_API_KEY` (`SecureString`), with `GUPSHUP_APP_NAME=Mediqzy` and `GUPSHUP_SOURCE_NUMBER=918098998998`. `WHATSAPP_PROVIDER` remains unset, so Twilio remains active. No live message was sent and no application restart was performed.

**Implemented behavior**

- `WHATSAPP_PROVIDER=gupshup` selects the real Gupshup Self-Serve Access API for the primary production sender. The default remains Twilio until an operator explicitly activates Gupshup.
- Session text, supported outbound media, and approved templates are submitted to Gupshup. Returned `sid` is the provider message ID; `submitted` is acceptance, not proof of delivery.
- Production notification methods, direct WhatsApp OTP, signup OTP and password-reset OTP have Gupshup branches. Signup/password reset retain their email fallback. They do not retry the migrated sender through Twilio.
- Primary incoming text, quick replies, button replies and list replies reuse the existing conversation logic. Static greetings and AI replies are sent through Gupshup, not returned as TwiML. AI replies still require the existing `WHATSAPP_AI_AUTO_REPLY=true` setting.
- `POST /api/whatsapp-production/webhook/gupshup` is the explicit callback. The old `/api/whatsapp-production/webhook` also dispatches Gupshup events to the same authenticated path. When Gupshup is selected, Twilio-shaped payloads cannot bypass that authentication on the old URL.
- Delivery events update Redis status records and never invoke the conversation bot. `delivered`/`read` do not regress when older `sent`/`enqueued` callbacks arrive.
- Callback acknowledgement follows durable BullMQ queue insertion or status persistence. The callback does not wait for AI. Redis failure returns 503 so Gupshup can retry.
- Duplicate inbound message IDs are app-scoped. Interrupted or failed processing is retained for review rather than blindly repeating a possible booking or outbound send. Processing markers live seven days; completed/failed job retention is one day. This is an at-most-once processing safeguard with manual recovery, not a promise of exactly-once delivery.
- Incoming media is acknowledged with a request for text; arbitrary provider-supplied media URLs are not fetched. Media transcription/clinical interpretation is outside this patch.
- Dedicated tenant Chatwoot Gupshup inbox adapters are outside this patch. The existing primary-number support/bot workflow is reused; the Twilio tenant bridge remains intact.

**Activation prerequisites**

Configure through the established production secret workflow, then restart the actual SSM-loaded application definition. Do not launch production from the legacy root ecosystem file; its own comments say it is not the live server definition. The workspace contains unrelated in-progress changes: use the normal reviewed release process rather than deploying the entire working tree blindly.

| Setting | Required value |
|---|---|
| `WHATSAPP_PROVIDER` | `gupshup` |
| `GUPSHUP_API_KEY` | API key for the Self-Serve account owning the application; keep in SSM SecureString |
| `GUPSHUP_APP_NAME` | `Mediqzy` (exact dashboard app name shown for this number) |
| `GUPSHUP_SOURCE_NUMBER` | `918098998998` |
| Webhook authentication | One or both options below; unconfigured ingress fails closed |
| `WHATSAPP_AI_AUTO_REPLY` | `true` if this number should provide automated conversation replies |
| `GUPSHUP_TEMPLATE_*` | Approved Gupshup IDs for each enabled business-initiated notification |

Current production preflight: API key, app name, source number, and AI setting are present; provider selection is still `twilio`; webhook authentication and OTP template configuration are still missing. Do not set `WHATSAPP_PROVIDER=gupshup` until the webhook control and required templates have been configured.

Callback: `https://app.mediqzy.com/api/whatsapp-production/webhook/gupshup`.

**Gupshup dashboard setup**

In `apps.gupshup.io/whatsapp/dashboard` → `Mediqzy` → `Webhooks`, configure:

1. Select **Gupshup format (v2)**. The adapter consumes the documented v2 envelope (`app`, `version: 2`, `type`, and nested `payload`); do not select Meta format (v3).
2. Set the callback URL to `https://app.mediqzy.com/api/whatsapp-production/webhook/gupshup`. The app answers the dashboard's GET/HEAD URL-validation probe with an empty 200 response; deploy that route change before saving the webhook. Event POSTs remain protected and are accepted only in Gupshup format v2.
3. Enable inbound `message` and outbound `message-event` callbacks.
4. The optional **Include BSUID in webhook payloads** setting is compatible with the adapter; it may remain enabled or disabled because BSUID is ignored.
5. Obtain Gupshup's source IPs from support and put the exact addresses in `GUPSHUP_WEBHOOK_ALLOWED_IPS`, or place a trusted ingress in front of the endpoint that validates those IPs and injects `x-gupshup-webhook-secret`. The application intentionally fails closed when neither control is configured.

Gupshup documents v2 inbound messages as an envelope with `version: 2` and nested sender/payload fields, and requires the callback to acknowledge quickly with an empty 2xx response while processing asynchronously ([inbound message schema](https://docs.gupshup.io/docs/what-is-an-inbound-message), [webhook guidance](https://docs.gupshup.io/docs/what-is-a-webhook)).

This adapter targets the documented Self-Serve Access API, not an assumed Partner/Enterprise API contract. Confirm the account/API product before activation.

Webhook authentication options:

1. `GUPSHUP_WEBHOOK_ALLOWED_IPS`: exact public source IPs obtained from Gupshup support. The route checks Express `req.ip`; the deployment currently trusts one proxy. Ensure that the trusted ingress overwrites forwarded headers and the application origin is not directly public. CIDRs are deliberately not accepted by this implementation.
2. `GUPSHUP_WEBHOOK_SECRET`: at least 32 characters, supplied as `x-gupshup-webhook-secret`. Configure only if the actual provider subscription supports that header, or have a trusted ingress proxy inject it **after independently validating the provider**, such as by the verified provider IP allowlist. Do not blindly add this header for all public requests. No secret is accepted in a query string. If both secret and IP settings exist, both checks are required.

The public documentation reviewed recommends obtaining webhook source IPs from Gupshup support; it does not establish that every dashboard supports custom secret headers. Do not invent a provider signature or claim a plain `app` field authenticates callbacks.

Enable inbound message and message-delivery events in the app webhook subscription. Keep the old Twilio integration inactive for the migrated primary number after cutover; retain separate Twilio SMS configuration if still used.

**Approved template parameter contracts**

Gupshup template IDs cannot be replaced by Twilio `HX...` SIDs. Missing template IDs cause business-initiated sends to fail explicitly. Session text remains subject to WhatsApp's customer-service window. Match the actual approved content and button variables to these ordered parameters before enabling a notification.

| Environment suffix (`GUPSHUP_TEMPLATE_…`) | Parameters in order |
|---|---|
| `OTP` | OTP |
| `APPOINTMENT_CONFIRMATION` | patient, doctor, date, time, location |
| `APPOINTMENT_REMINDER` | patient, doctor, time, location |
| `HEALTH_CHECKUP` | patient, date, time, location |
| `HEALTH_REPORT` | patient, report URL |
| `PRESCRIPTION` | patient, doctor, prescription URL, medications, follow-up date |
| `CHECKUP_REMINDER` | patient |
| `MEMBERSHIP_RENEWAL_REMINDER` | name, plan, expiry date, days remaining, renewal URL |
| `MEMBERSHIP_RENEWAL_PAYMENT` | name, plan, amount, renewal URL |
| `MEMBERSHIP_PLAN_ACTIVATED` | name, plan, start date, end date |
| `KIOSK_REGISTER` | hospital, expiry minutes, full URL or button token according to `WHATSAPP_TEMPLATE_KIOSK_REGISTER_STYLE` |

**Verification and recovery**

Read-only preflight using the production loader (prints presence flags, never secret values):

```bash
NODE_ENV=production node server/scripts/ssm-env-loader.mjs server/scripts/check-gupshup-config.mjs
```

Automated checks:

```bash
npm --prefix server test -- --runTestsByPath \
  __tests__/gupshup-whatsapp.test.js __tests__/gupshup-conversation.test.js \
  __tests__/kiosk-whatsapp-template.test.js __tests__/twilio-sms-from.test.js \
  __tests__/chatwoot-twilio.test.js
node --test server/tests/gupshup-queue.test.mjs
```

The first command uses mocked external sends and services. The second starts a password-protected disposable Redis instance on an allocated loopback port, verifies queued-work survival, callback deduplication, failure retention and delivery-status ordering, and removes that instance. Neither sends WhatsApp messages or writes a production database.

After deployment and callback configuration, validate with an explicitly authorized test recipient: inbound greeting; button reply; agent reply; approved OTP/template; delivery/read callback; duplicate callback; revoked/missing auth; Redis outage recovery. Verify provider delivery IDs, not just HTTP 200. This user-facing delivery validation has not been performed.

Queue: `gupshup-whatsapp-inbound`. Failed jobs emit a job-ID-only warning. A job that started before an interruption may already have caused a clinical/booking action or provider send. Reconcile those effects and provider delivery before manually replaying it; merely retrying a failed BullMQ job is intentionally blocked by its processing marker. Do not delete markers or replay production events automatically. Redis persistence, access restrictions, retention and monitoring must be enabled as part of the existing queue infrastructure.

Returning `WHATSAPP_PROVIDER` to `twilio` is useful only if that phone is actually provisioned there; changing an environment variable cannot reverse provider migration.

References: [Gupshup send API](https://docs.gupshup.io/reference/msg), [template API](https://docs.gupshup.io/reference/sending-text-template), [inbound event schema](https://docs.gupshup.io/docs/what-is-an-inbound-message), [webhook authentication/acknowledgement guidance](https://docs.gupshup.io/docs/what-is-a-webhook).
