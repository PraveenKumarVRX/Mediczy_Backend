# Shared communication workspace: microaudit and implementation plan

25 October 2026. Scope: plan only; no runtime changes or deployment in this audit.

## Recommendation

Give Admin, Team and CRM the same conversation-first workspace and six-channel navigation: Chat, Email, SMS, WhatsApp, Video and Voice. Keep each portal's layout, session, permissions and tenant context explicit. Separate everyday conversations from provider configuration and campaign reporting. Preserve CRM's lead/contact/deal context and existing campaign/template/integration features.

The supplied screenshot establishes the desired interaction design: grouped Communication navigation, searchable rooms/conversations, selected thread and persistent composer. It does not establish that every visible control works. This audit inspected current repository source; an unauthenticated attempt to open the production login through the web reader failed. Authenticated production behavior, deployed-source parity, provider delivery and mobile usability have not been verified.

## Source findings

| Priority | Evidence | Finding and consequence |
| --- | --- | --- |
| P0 | `server/routes/chat.route.js`, `server/utils/chatStorage.js` | Default room IDs and Redis keys (`chat:room:`, `chat:messages:`, global room list) lack tenant scope. Room listing auto-adds Team/Doctor users to channel/internal/WhatsApp rooms; reads permit broad role access. Tenant-safe storage and membership authorization must precede broader reuse. This is a source finding, not a claim of demonstrated production data disclosure. |
| P0 | `server/routes/hospital-crm-communication-hub.route.js`, `server/services/hospital-crm-communication-hub.service.js` | Dashboard/thread/configuration actions receive authenticated tenant context, but `/calls` and `/log` pass raw query objects and their services accept optional tenant selectors. `/send` supplies actor ID but recipient resolution does not receive mandatory tenant context in its call signature. Audit the complete resolver/RLS chain and require server-derived scope on every path; do not rely on client tenant filters. |
| P1 | `client/src/pages/team/TeamModulePages.tsx:556` | Team already renders `<AdminChatDashboard />`. Simply importing this page again will not solve the problem. |
| P1 | `client/src/pages/admin/AdminChatDashboard.tsx:104` | Layout and token selection prefer a stored admin token over Team. A browser with both sessions can render/use the wrong workspace. CRM token is not handled. Pass portal/session explicitly. |
| P1 | Same page | Seeded agents, direct messages, bots, support tickets and statistics can survive empty/error responses. Remove demonstration values from operational UI; display real empty/unavailable states. |
| P1 | Same page, composer near line 1440 | Attachment, emoji and mention icons have no click handlers in this composer. Implement each with acceptance checks or mark unavailable; visible icons are not feature completion. |
| P1 | Same page | WhatsApp uses separate global-looking `/whatsapp-production` calls and overlapping 30-second list/10-second thread polling. Resolve account/inbox scope on the server and consolidate subscriptions/polling. |
| P1 | `client/src/components/layout/AdminLayout.tsx:410`, `Sidebar.tsx:143` | Admin groups six channels under Communication. Team scatters chat, WhatsApp, social and legacy “RC Omnichannel” links. Navigation parity is missing despite shared chat rendering. |
| P1 | `client/src/pages/crm/HospitalCRMCommunicationHubPage.tsx` | CRM starts with reporting controls, Chatwoot status and overview/campaign/integration tabs. It lacks the screenshot's primary room/thread workspace and direct six-channel navigation. Preserve these management features as secondary views. |
| P1 | `client/src/pages/team/ChatwootOmnichannel.tsx` | Team launcher uses build-time/global Chatwoot URL and separate login. CRM's `ChatwootWorkspace` obtains workspace state through a tenant-aware endpoint. Unify tenant-aware workspace discovery; do not promise iframe embedding or SSO without implementation. |
| P1 | Admin Email/SMS/Video/Voice pages | These combine operational actions with provider settings and platform logs (`/email/configs`, `/sms/config`, `/video-config`, `/voice-config`). Copying entire pages into Team/CRM would expose inappropriate configuration workflows. Extract operational views and separately authorize settings. |
| P2 | `AdminChatDashboard.tsx` | Large monolithic page mixes chat, bots, analytics, tickets and WhatsApp templates; hardcoded admin/team links prevent clean reuse. Split by responsibility and use portal-aware route construction. |
| P2 | `server/utils/chatStorage.js` | Seven-day Redis TTL and shared list read-modify-write need explicit retention and concurrency decisions. Redis should be a cache/presence layer; durable messages require a persistent authoritative store. |

## Target experience

Each portal has a Communication group with the same channel order and active/unread indicators. Default view is Chat: conversation list, thread and composer, plus an optional contact/context panel. Preserve selection through refresh and deep links. On mobile show list then thread with a clear back action; composer remains reachable with the keyboard open.

Chat supports tenant-owned rooms and direct messages with membership checks. Email, SMS and WhatsApp provide inbox/thread and compose where their provider actually supports them. SMS delivery without inbound support is labelled accordingly. Voice separates real calling controls from historical call activities; Video separates joining/creating authorized sessions from platform provider administration. Show configured, unavailable and permission-denied states accurately. Campaigns, templates, analytics and integrations remain secondary destinations. Drafts are scoped to server, tenant, portal, user, channel and conversation.

CRM retains recipient selection and links to authorized leads, contacts and deals. Team sees only its permitted queues/rooms and assigned or authorized customer conversations. Platform Admin retains platform configuration; platform-level cross-tenant work requires an explicit tenant selection and audit trail. Tenant CRM admin is not platform admin.

## Architecture

1. Extract `CommunicationWorkspace`, `ChannelNavigation`, `ConversationList`, `ConversationThread`, `MessageComposer`, `ContactContextPanel` and truthful status/empty/error components under `client/src/components/communication/`. Keep portal layouts in small Admin/Team/CRM wrapper pages.
2. Introduce explicit `CommunicationSession` context: portal, actor, authenticated tenant, server/installation identity, capabilities and API adapter. Never select authority by scanning stored tokens. Logout/switch clears subscriptions and invalidates outstanding responses; drafts remain with their originating identity.
3. Add server-owned communication services with mandatory context parameters. Existing portal endpoints become thin authentication/capability adapters rather than sharing admin middleware. Proposed capability endpoint returns allowed channels/actions/provider readiness, never credentials. Proposed contracts: conversations list/detail, messages cursor pagination, idempotent send, read state, members, attachment upload authorization, provider delivery events and call/video sessions. Final route names should follow existing API conventions after contract review.
4. Authenticate tenant before resolving any room, recipient, inbox, attachment, campaign or provider account. Enforce membership/assignment and per-action capabilities on reads, writes, socket joins and background jobs. Client-supplied tenant/account identifiers cannot override authenticated scope. Optional tenant filters become required server context.
5. Bind provider configuration to tenant-owned integration records and an authorized inbox/account mapping. Use the existing CRM integration encryption and Chatwoot bridge where suitable; audit adapters before reuse. Keep service credentials on the server. Verify webhook signatures, map trusted provider account/inbox to tenant, deduplicate provider events and preserve delivery status transitions.
6. Persist conversations, memberships, messages and delivery events in PostgreSQL with tenant-indexed constraints. Use Redis for scoped presence/cache/fanout. Tenant-scoped socket rooms and event envelopes must be reauthorized on reconnect. Start with one bounded polling adapter if needed; introduce events without duplicate polling paths.
7. For dedicated Medstar, mount only tenant communication routes/services in `server/crm-app.mjs`. Retain disabled outbound defaults until hospital-owned channels are configured. Do not mount global `/chat`, `/email`, `/sms`, provider administration or shared startup jobs just to satisfy UI imports. Mediqzy remains the control plane; messages/provider secrets remain in the tenant deployment.

## Permission contract

| Action | Platform admin | Team | CRM |
| --- | --- | --- | --- |
| Read/reply | Explicit selected tenant and authorized support scope | Permitted rooms/queues and assignments | Tenant membership plus CRM communication capability and recipient scope |
| Create/manage internal rooms | Authorized tenant scope | Separate manage-room grant | Separate manage-room grant |
| Send externally | Tenant/provider send grant | Channel send grant | Existing communication:write plus channel grant |
| Configure provider | Platform configuration authority | Denied unless separately delegated within tenant | Existing communication:configure, tenant only |
| Platform credentials/global logs | Platform authority only | Denied | Denied |

Use existing Team grants and CRM capability maps during migration; define explicit mappings rather than silently granting access to everyone with a login. Keep unavailable channels visible with a useful reason only when appropriate; hide actions the user is not permitted to discover.

## Delivery sequence and reviewable outputs

1. **Security and contract foundation, estimated 2–3 engineering days:** trace global middleware/RLS/provider chains; close tenant-context gaps; capability matrix; API contracts; two-tenant negative tests. No expanded access before these pass.
2. **Shared workspace and navigation, 3–4 days:** extract the admin conversation design; explicit session adapters; Team/CRM wrappers; six-channel sidebar; responsive thread/composer; truthful empty/error states. Keep existing URLs functional through aliases/redirects and preserve query/deep-link state. Admin shell behavior should remain familiar.
3. **Channel adapters, 4–6 days:** tenant-aware chat/email/SMS/WhatsApp and Chatwoot entry; CRM record context; permissions; attachments/unread/delivery states. Validate actual voice/video capabilities separately and implement authorized call/session workflows; label unsupported operations accurately. Provider onboarding delays are outside this estimate.
4. **Migration and acceptance, 2–3 days:** reconcile durable chat storage, staged provider sandbox checks, Admin/Team/CRM regression and Medstar dedicated-runtime tests, docs and reversible rollout. Total initial parity estimate: 11–16 engineering days, conditional on provider readiness and voice/video scope; not a delivery commitment.

Enable by tenant and portal using existing feature flags. Start with internal test tenants, then Medstar preview, then a small Team cohort. Preserve old routes during rollback; do not dual-send. A flag can revert UI routing while retaining newly written messages. Migrations must be additive. Legacy rooms with no verifiable tenant ownership are quarantined for reconciliation, never automatically copied into every tenant. Do not delete or reassign historical data by guessing.

## Acceptance and release gates

- Same six-channel navigation and conversation-first behavior in all three portals; authorized functionality reachable with comparable click counts. Team with a stored admin token still uses Team authority and layout; same for CRM.
- Foreign tenant/room/contact/inbox/attachment IDs rejected across HTTP, sockets, exports and background jobs; absent scope fails closed. Team and CRM cannot call platform provider configuration APIs.
- Empty inboxes contain no sample people/messages/statistics. Attachment, mention, emoji and call controls work when enabled; otherwise accurately unavailable. Refresh/reconnect preserves selection and avoids duplicate messages/sends.
- Send retries use idempotency; provider acceptance is distinct from delivery/read status. Test webhook duplicates, bad signatures, provider outages, expired sessions, revoked membership and rapid tenant/room switches.
- Desktop and mobile keyboard/accessibility checks; large-thread pagination; unread counts and cross-tab session tests. No real patient messaging during automated QA; use owned sandbox recipients for explicitly authorized provider acceptance.
- Dedicated Medstar uses local API/storage only, scoped connector health still works, and outbound remains disabled until tenant integrations pass acceptance. No central-secret fallback.
- Update communication API documentation with portal auth, mandatory scope, capability/error contracts, pagination, idempotency and events. Update mobile API docs only if consumed endpoints/contracts change. Record deployment SHA, regression results, rollback and known unsupported provider features.

## Immediate implementation recommendation

Begin with mandatory tenant context and explicit session adapters, then deliver the screenshot's list/thread/composer and navigation to Team and CRM behind flags. Preserve the existing CRM reporting/campaign/integration tools as secondary pages. Production authenticated comparison remains an acceptance step; this audit does not claim all admin features are operational.
