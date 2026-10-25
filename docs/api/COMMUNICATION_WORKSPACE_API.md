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
