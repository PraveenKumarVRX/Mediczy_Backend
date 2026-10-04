# RocketChat Retirement (2026-10-04)

RocketChat has been removed from Mediczy. Chatwoot at <https://chat.mediqzy.com> is the support
agent workspace.

## Why now

RocketChat had already stopped working. At the time of removal:

- `ROCKETCHAT_URL` pointed at `http://localhost:3100`; nothing listens on that port.
- No PM2 process and no container ran RocketChat on the host.
- `ROCKETCHAT_PUBLIC_URL` pointed at `https://smart-chat.live`, which serves no RocketChat API.

Every call through the old integration was therefore failing. The support widget, the hospital
"team chat" page and the WhatsApp agent relay were broken in production before this change, and the
failures were being swallowed by per-call-site `catch` blocks. Removing the integration did not take
away a working feature.

## What was removed

| Removed | Note |
|---|---|
| `server/services/rocketchat.service.js` | Core REST client |
| `server/services/omnichannel-chat.service.js` | ~1,200-line livechat/omnichannel engine |
| `server/routes/rocketchat.routes.js` | `/api/rocketchat/*`, unmounted from `app.js` |
| `server/config/rocketchat.config.js` | Config module |
| RocketChat OAuth client | `server/db/oauth-clients.js` |
| Agent linking endpoints | `POST /api/team/link-to-rocketchat`, `GET /api/team/:id/rocketchat-agent`, `GET /api/team/agents/list` — no row in `users.metadata` carried the linkage keys and no client called them |
| `client/src/pages/team/RocketChatOmnichannel.tsx` | Replaced by `ChatwootOmnichannel.tsx` |
| `client/src/pages/hospital/HospitalTeamChat.tsx` (378 lines) | Was a mock: hardcoded channels, invented staff messages, local-only state, and a failing POST that claimed messages were "queued for retry" |
| 6 root dev scripts | `configure-rocketchat-oauth.js`, `test-rocketchat-webhook.js`, `setup-team-agent.mjs`, `setup-mediczy-team-user.mjs`, `bot-agent-integration.test.js`, `test-ticketing-integration.mjs` |

Historical documents under `docs/` that describe the RocketChat era were left in place as a record.
`server/migrations/202602150715-add-conversation-user-analytics.sql` still carries a column comment
listing `rocketchat` as a channel value; applied migrations are not edited after the fact.

## What replaced it

`server/services/support-chat-provider.service.js` keeps the method names the old omnichannel
service exposed, so `routes/support-chat.route.js` did not have to be rewritten. It behaves in one
of two ways:

- **Chatwoot configured** — real Chatwoot Application API calls (contacts, conversations, messages).
- **Not configured** — throws `SupportChatUnavailableError`, which the route layer turns into
  `503` with code `SUPPORT_CHAT_NOT_CONFIGURED`. Callers can tell "not set up yet" from "broken".

Ticket and WhatsApp mirroring go through `postTicketNote()`, which never throws and warns once per
process, so ticket handling never depends on the chat workspace being reachable.

The tenant-aware WhatsApp/SMS path is the separate Chatwoot bridge
(`services/chatwoot-bridge.service.js`, see [CHATWOOT_BRIDGE.md](./CHATWOOT_BRIDGE.md)).

## To activate Chatwoot for support chat

Set these in the server environment (SSM `/mediczy/prod`). None are set yet:

```
CHATWOOT_URL=https://chat.mediqzy.com
CHATWOOT_ACCOUNT_ID=<numeric account id>
CHATWOOT_API_TOKEN=<agent/admin API access token>
CHATWOOT_SUPPORT_INBOX_ID=<numeric inbox id>
CHATWOOT_WEBSITE_TOKEN=<website inbox token, for the browser widget>
```

Then `GET /api/support/config` reports the provider state, and
`supportChat.checkConnection()` validates the token and account by listing inboxes.

## Known gaps, deliberately not reimplemented

- **The in-app agent console** (`/api/support/inbox/*`): 14 endpoints built directly on RocketChat's
  REST API — livechat rooms and visitors, channel history, canned responses, templates, broadcast,
  tags, delivery receipts. Chatwoot models these differently and has its own agent UI, so there is
  no faithful one-to-one port. The paths now answer `503 AGENT_CONSOLE_NOT_MIGRATED` and point
  agents at Chatwoot.
- **Internal staff-to-staff messaging.** Chatwoot is an agent-to-customer inbox. The old team chat
  page was a mock, so nothing real was lost, but Mediczy does not currently provide this.
- **WhatsApp ticket-rating notifications.** `closed-loop-notifier.service.js` called
  `rocketChatService.sendDirectMessage()`, a method that was never defined on that service, so this
  notification never actually sent. Email remains the live path. Re-implementing WhatsApp needs a
  real outbound sender via Twilio/the Chatwoot bridge.

## Chatwoot cannot be embedded

`chat.mediqzy.com` returns `x-frame-options: SAMEORIGIN`, so Chatwoot cannot be shown in an iframe
from `mediqzy.com`. The replacement pages open it in a new tab. Chatwoot has its own agent login;
Mediczy deliberately does not pass service tokens to the browser or provide SSO into it.

## Environment variables to delete once this is deployed

`ROCKETCHAT_ADMIN_PASSWORD`, `ROCKETCHAT_ADMIN_USER`, `ROCKETCHAT_AUTH_TOKEN`, `ROCKETCHAT_ENABLED`,
`ROCKETCHAT_ENABLE_EMBED`, `ROCKETCHAT_ENABLE_SSO`, `ROCKETCHAT_INCOMING_WEBHOOK_URL`,
`ROCKETCHAT_INTERNAL_URL`, `ROCKETCHAT_OUTGOING_WEBHOOK_HANDLER`, `ROCKETCHAT_PUBLIC_URL`,
`ROCKETCHAT_URL`, `ROCKETCHAT_USER_ID`, `OAUTH_ROCKETCHAT_CLIENT_ID`,
`OAUTH_ROCKETCHAT_CLIENT_SECRET`, `ROCKETCHAT_OAUTH_REDIRECT_URI`.

`ROCKETCHAT_INCOMING_WEBHOOK_URL` embeds a webhook token, so treat it as a credential: it should be
revoked at the provider as well as deleted here.
