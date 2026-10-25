# Communication workspace API notes

25 October 2026 — first implementation increment, not yet deployed.

Existing Admin, Team and CRM URLs and response shapes remain supported. The new shared channel navigation links to existing portal pages. Unimplemented portal channels have no link to a platform administration page.

## CRM scope

`/api/crm/communication-hub` uses CRM authentication and the existing `communication:read`, `communication:write` and `communication:configure` capability checks.

- `POST /send`: channel (`email`, `sms`, `whatsapp`), message, optional subject and a lead/deal/contact ID. Actor, tenant ID and canonical tenant UID are derived from the authenticated CRM session; body values cannot override them. Recipient lookup must match that tenant before provider dispatch. Foreign recipients return 404. Existing provider acceptance behavior remains unchanged; acceptance is not proof of delivery.
- `GET /calls`: optional leadId, dealId and limit filters. Tenant scope always comes from the authenticated session, overriding query values.
- `GET /log`: optional leadId, dealId, channel and limit filters. Tenant ID and UID always come from the authenticated session, overriding query values. Both v2 event and legacy activity reads are scoped.
- Missing canonical tenant identity fails closed. Legacy rows without verified tenant ownership are not exposed by removing the scope filter; reconcile them separately.

New legacy activity records for direct sends include the authenticated tenant UID. No historical records are reassigned automatically. Existing lead-detail callers already supply tenant scope.

## Browser behavior

Team explicitly selects its own token and layout even if an Admin token is present. Chat and nested WhatsApp requests carry that selected authority. Their request metadata also binds 401 refresh handling to the selected portal, avoiding the unrelated remembered global role. Requests outside this workspace retain the existing fallback.

CRM channel deep links use `/crm/hospital/communication-hub?channel=email|sms|whatsapp|voice`. Email/SMS/WhatsApp select the existing composer; Voice selects existing call activity/history, not a newly implemented telephony provider. Old hub URLs still open the overview.

There are no new mobile endpoints or payload shapes in this increment. Full durable chat, tenant-safe room migration, inbound inbox unification, attachment/mention/emoji controls and provider-independent calling remain tracked in the architecture plan.

## Durable workspace (additive rollout)

Authenticated bases: `/api/admin/communication-workspace`, `/api/team/communication-workspace`, `/api/crm/workspace`. Admin supplies an explicit canonical `tenantUid` query selector; Team/CRM cannot select another tenant. The server revalidates active tenant and canonical actor membership on every request. Team requires Chat Dashboard Access; CRM uses communication capabilities. Platform Admin has explicit selected-tenant scope. No patient/doctor login is accepted by these adapters.

The tenant UID must also be explicitly listed in `COMMUNICATION_WORKSPACE_ENABLED_TENANTS`. Disabled tenants retain old pages; new mutations return 404. `GET /capabilities` returns enabled state, tenant UID, actor ID, write permission and attachment availability. No secrets are returned.

- `GET /rooms`: own memberships only, previews and unread counts. Team Chat is the tenant's shared internal room; joining it is permitted for authenticated organisation members. Custom rooms are private to their explicit participants.
- `POST /rooms`: `{name,members:[userId]}`; 1–120 character name, up to 50 verified tenant members. Caller is included.
- `GET /members`: active canonical organisation user directory, capped at 200.
- `GET /rooms/:uuid/messages?before=sequence&limit=50`: chronological page, `hasMore`, oldest `nextCursor`; maximum 100. Foreign/non-member room IDs return 404.
- `POST /rooms/:uuid/messages`: `{body,clientId,attachmentId?}`. Body 1–4000 characters, client UUID required. Replaying the same actor/room/client ID returns the original message; reusing it with different content returns 409. No provider delivery is triggered by internal chat.
- `POST /rooms/:uuid/read`: `{sequence}`; advances only this actor's marker, clamped to the room's highest sequence. Read-only users may mark their own reading state.
- `POST /rooms/:uuid/attachments`: multipart `file`, maximum 8 MB; PDF, common raster images and UTF-8 text. Requires write permission and room membership. Bytes remain in configured tenant-local storage; returned metadata contains no filesystem path.
- `GET /rooms/:uuid/attachments/:uuid`: authorized file download, attachment disposition, no-store and nosniff. Both tenant and room membership are checked.
- Team/Admin `GET /chatwoot` and `/chatwoot/health`: use the selected tenant's existing bridge account; never a global fallback. CRM retains its existing scoped Chatwoot endpoints. Chatwoot agent login remains separate.

PostgreSQL is authoritative; there is no seven-day TTL on new messages. Polling uses one room-list loop and one selected-thread loop with cancellation; it does not introduce shared socket rooms. Drafts, pending retry identities and upload references are keyed by server origin, tenant UID, portal, actor and room. Mentions insert names and do not grant room access or imply notification delivery.

Email/SMS/WhatsApp navigation continues to existing operational workflows. Voice retains call activity tooling. Unconfigured video/telephony/provider delivery is not activated by enabling internal chat. Dedicated installations retain outbound fences. Mobile clients may adopt this contract using their portal access tokens; this release does not rebuild an APK.
