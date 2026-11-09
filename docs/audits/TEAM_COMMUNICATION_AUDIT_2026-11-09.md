# Team portal — Communication menu audit

**Date:** 2026-11-09 · **Scope:** the Communication group in the Team sidebar, and the
email / WhatsApp / call settings behind it · **Environment:** production (mediqzy.com, EC2 + PM2)

Prompted by: *"emails are not syncing from care@mysmarthealth.in"* on
`https://app.mediqzy.com/team/email-inbox` (team login `parinitha@mysmarthealth.in`).

---

## 1. The reported bug, and why it happened

**care@mysmarthealth.in was never being synced, and could not have been.**

Its row in `email_settings` was **soft-deleted on 2026-05-27** (`deleted_at` set). Both code
paths that sync mail filter soft-deleted rows out:

- the periodic worker, `server/workers/email-sync.worker.js` → `EmailSettings.findAll({ paranoid: true })`
- the manual Sync button, `POST /api/team/emails/sync` → `where: { deletedAt: null }`

So the mailbox simply was not in scope. The only live row was **hello@mysmarthealth.in**, and
that one fails every single tick:

```
last_sync_status = "error: IMAP error: You are yet to enable IMAP for "
last_sync_at     = 2026-11-09 06:05   ← the worker IS running, every 15 min
```

A direct IMAP probe settles which mailbox is actually healthy:

| Mailbox | Config state | IMAP probe result |
|---|---|---|
| `care@mysmarthealth.in` | was soft-deleted | **OK — INBOX holds 4,435 messages** |
| `hello@mysmarthealth.in` | live, `is_default` | **FAIL — "You are yet to enable IMAP for your account"** (disabled at Zoho) |
| `parinitha@mysmarthealth.in` | soft-deleted, no password | skipped |

The configuration was inverted: the mailbox that works was switched off, and the one that was
switched on cannot work.

### Fixed (commit `c0e98d8e`)

1. **`autoUpdatePortal()` is now gated behind `EMAIL_AI_AUTO_ACTIONS_ENABLED`, default OFF.**
   This is the most important change here, and it is why care@ has **not** been re-enabled yet.
   On an `appointment_request` intent above 0.7 confidence that function emails the sender,
   writes a patient record, **books a real appointment**, and sends an email + WhatsApp
   confirmation — off a single LLM intent guess, with no human in the loop. Pointing the inbox
   at care@'s 4,435-message backlog would have replayed months of old mail as new appointments
   and messaged thousands of people about something they never asked for. Enabling a mailbox
   must not be the same decision as authorising autonomous patient-facing writes.
   The AI *analysis* (summary, intent, sentiment, priority) still runs — that is what makes
   triage useful. Only acting on it is gated.
2. **The worker ignored `syncEnabled`**, selecting on `isActive` alone — so turning sync off in
   the UI changed nothing and the mailbox was still polled every 15 minutes.
3. **`email_settings.last_sync_status` was `VARCHAR(50)`**, which stored Zoho's diagnostic as
   `"error: IMAP error: You are yet to enable IMAP for "` — exactly 50 characters, with the
   mailbox name and the instruction cut off. The one field an operator checks to find out what
   is wrong held a sentence with the actionable half removed. Widened to 255 (migration
   `20261109000300`), matching what the model already declared.
4. **`POST /team/emails/sync` synced only the first configured mailbox.** It now syncs every
   one and returns per-mailbox results, so a dead mailbox neither hides the others nor fails
   the whole request.
5. **`POST /email-settings/:id/test` never opened a socket.** It set `smtpConnected` and
   `imapConnected` to `true` whenever the host, port and username *fields* were non-empty,
   labelled it `"ready (validation only)"`, and stored `testResult: 'success'`. `hello@` tested
   green while its IMAP was disabled at the provider. It now authenticates over SMTP via
   `nodemailer.verify()` and opens IMAP **and selects INBOX** — Zoho accepts the connection and
   only refuses on mailbox select, so a test that stopped at connect would still have passed a
   mailbox that can never sync. A test that cannot fail is worse than no test, because it is
   believed.

### Database state changed

`care@mysmarthealth.in` has been **un-deleted** (`deleted_at = NULL`) and made `is_default`,
but left **`is_active = false`** so the worker does not pick it up until the gate above is
deployed. `hello@` was demoted from default. Backup:
`scratchpad/email-settings-backup.json`.

> `is_active` is the flag that matters: the worker selected on it alone and ignored
> `sync_enabled`, so that was the only switch that actually kept the mailbox out of the next tick.

---

## 2. Menu-by-menu status

The Communication group is assembled in `client/src/components/layout/Sidebar.tsx:546`.

| Menu item | Path | Backend | Status |
|---|---|---|---|
| Chat | `/team/chat` | `/api/team/communication-workspace` | **Partly working.** The conversation workspace is DB-backed and functions. The Chatwoot panel beside it reports unavailable — no `CHATWOOT_*` config. |
| Email Inbox | `/team/email-inbox` | `/api/team/emails/*` | **Fixed, pending deploy.** See §1. Needs a `pm2 reload`, the migration, and the Zoho decision. |
| WhatsApp Inbox | `/team/whatsapp-inbox` | `/api/support/inbox/*` | **Dead by design.** Every endpoint is a deliberate `503 AGENT_CONSOLE_NOT_MIGRATED`. The console was built on RocketChat's REST API; RocketChat was retired 2026-10-04 and was never replaced. The page loads and every action fails. |
| Social Inbox | `/team/social-inbox` | `/api/social-inbox/*` | **Implemented, not provisioned.** Routes and storage exist; `META_PAGE_ACCESS_TOKEN` and `INSTAGRAM_ACCESS_TOKEN` are unset, so there is nothing to pull. `/status` reports this honestly. |
| Omnichannel workspace | `/team/rc-omnichannel` | none (launcher) | **Inert.** A "Open Chatwoot" button to `chat.mediqzy.com`, which cannot be embedded (`x-frame-options: SAMEORIGIN`). All four `CHATWOOT_*` variables are unset, so the bridge is not connected either. |

Routed but **not** in the sidebar — reachable only by typing the URL:
`/team/whatsapp` (WhatsAppCommunication), `/team/whatsapp-templates`, `/team/chat-analytics`.

---

## 3. Email / WhatsApp / call settings — what is actually configured

Presence only; no values were read.

| Channel | Configured | Verdict |
|---|---|---|
| **Email out** | `BREVO_API_KEY`, `SMTP_HOST/USER/PASSWORD`, `SES_FROM_EMAIL` | **Working.** |
| **Email in** | per-mailbox IMAP in `email_settings` | **Fixed in code**; one mailbox healthy, one disabled at Zoho. |
| **WhatsApp** | `WHATSAPP_PROVIDER=gupshup`; `GUPSHUP_API_KEY`, `GUPSHUP_APP_NAME`, `GUPSHUP_SOURCE_NUMBER` all set | **Credentials fine, but NOTHING can send.** See below. |
| **WhatsApp (alt)** | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER` | Fully configured but **unused** — the provider switch points at Gupshup. |
| **SMS** | `SMS_PROVIDER=twilio`; **no `TWILIO_SMS_NUMBER`**, no messaging-service SID | **Cannot send** — no sender. This also means the SMS *fallback* behind WhatsApp is not a fallback. |
| **Voice / contact centre** | `LIVEKIT_URL/API_KEY/API_SECRET` set; **no `EXOTEL_*`, no `VOICE_*`** | LiveKit (in-app video/voice) works. **PSTN calling is not provisioned.** |
| **Chatwoot** | none of `CHATWOOT_BASE_URL`, `_API_TOKEN`, `_ACCOUNT_ID`, `_WEBSITE_TOKEN` | **Not connected.** |
| **Social** | `FACEBOOK_APP_SECRET` only | **Not connected** — no page/IG access tokens. |

### The single highest-impact gap: no WhatsApp templates exist

`WHATSAPP_PROVIDER` is `gupshup` and Gupshup's credentials are present, but **every template
ID is unset**: `GUPSHUP_TEMPLATE_HEALTH_CHECKUP`, `_HEALTH_REPORT`,
`_APPOINTMENT_CONFIRMATION`, `_APPOINTMENT_REMINDER`, and the rest.

`gupshup-whatsapp.service.js:58` refuses a send without one:

```js
if (!templateId || /^HX/i.test(templateId))
  throw new Error('An approved Gupshup template ID is required; ...');
```

So **every business-initiated WhatsApp message currently throws**, falls back to SMS, and SMS
has no sender number — so it fails too. In practice: **no WhatsApp notification is reaching
anyone today**, including health-checkup booking confirmations.

This is **configuration, not a code defect.** The code is deliberately right: WhatsApp policy
requires an approved template for any business-initiated message, and a freeform fallback
would be rejected by WhatsApp anyway. It cannot be fixed from this side — the templates must be
registered and approved in the Gupshup console, then their IDs set in SSM.

---

## 4. Also found

- **SMTP and IMAP passwords are stored in cleartext** in `email_settings`. The model comments
  claim "encrypted in production" (`emailSettings.model.js:51,75`) but nothing encrypts or
  decrypts them — `inboundEmailService` passes the column straight to the IMAP client. Any
  read of that table, or any backup of it, exposes live mailbox credentials. Worth fixing
  properly (KMS or the existing column-encryption helper), not papered over.
- The WhatsApp Inbox menu item advertises a feature that has returned 503 for over a month.
  Either rebuild the console on Chatwoot's API, or point the menu item at Chatwoot and remove
  the dead console — the current state misleads whoever clicks it.

---

## 5. What needs an owner, and in what order

Nothing below can be done from the server side.

1. **Zoho: decide `hello@` vs `care@`.** `care@` works; `hello@` has IMAP disabled at the
   provider. Either enable IMAP for `hello@` in Zoho Mail admin, or retire that row.
2. **Apply migration `20261109000300-email-sync-status-width.migration.js`** (widens
   `last_sync_status`). Migrations are manual here.
3. **`pm2 reload mediczy-server --update-env`** — every code fix in §1 is inert until then,
   including the auto-action gate.
4. **Then, and only then, set `care@` `is_active = true`.** Re-enabling it before step 3 arms
   the autonomous appointment-booking path against a 4,435-message backlog.
5. **Decide on `EMAIL_AI_AUTO_ACTIONS_ENABLED`.** It defaults to off. Turning it on means an
   LLM books appointments and messages patients unreviewed; that deserves an explicit decision,
   and probably a narrower design (queue for human approval) rather than a flag.
6. **Register WhatsApp templates in Gupshup** and set `GUPSHUP_TEMPLATE_*` in SSM. Until this
   happens, no WhatsApp notification of any kind is delivered.
7. **Set `TWILIO_SMS_NUMBER`** (or a messaging-service SID) so the SMS fallback is real.
8. **Provision Chatwoot** (`CHATWOOT_*`) if the omnichannel workspace is wanted; otherwise
   remove the menu item.
9. **Provision Meta tokens** if Social Inbox is wanted; otherwise remove the menu item.
10. **Move the mailbox passwords out of cleartext.**
