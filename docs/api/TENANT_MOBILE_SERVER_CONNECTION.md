# Tenant server connection — mobile API contract v1

Updated: 25 October 2026. Backend/admin implementation is released separately from native app binaries. See the release evidence linked below for deployment verification. This contract applies to universal Smart-Force and tenant-branded Patient, Phlebo and CRM clients.

## Connection sequence

Enter organisation HTTPS URL → discover compatible backend → show organisation name and hostname → sign up or sign in → remember connection. All authentication, refresh, recovery, uploads and product calls must stay on that selected server. App branding does not set or authenticate a tenant.

Accept HTTPS root origins with optional ports; subpath hosting is not supported in v1. Reject embedded credentials, queries, fragments and redirects. Use normal platform TLS verification, including managed trust for private servers. The backend does not fetch arbitrary URLs for discovery.

The hosted service URLs in the existing Smart-Force reference are examples of deployments, not mandatory destinations. A customer deployment needs compatible product APIs and enabled app configuration. A URL alone does not provision APIs, tenant accounts or permissions.

## GET /api/mobile/discovery

Unauthenticated; send no bearer token, password, cookie or tenant override header. The actual public Host selects the configured tenant origin; X-Tenant-ID and X-Forwarded-Host do not select a different organisation. Reverse proxies must preserve the public Host. Discovery has a 30-request/minute instance-local limiter as well as existing API infrastructure limits; it returns `Cache-Control: no-store`.

Example of an admin-configured deployment:

```json
{
  "product": "mediczy-mobile",
  "mobileApiVersion": 1,
  "apiBasePath": "/api",
  "deploymentId": "f6f33cca-5dd3-4b82-bd43-a47d38cf231b",
  "displayName": "Example Organisation",
  "products": [
    { "id": "patient", "registration": "open" },
    { "id": "phlebo", "registration": "disabled" },
    { "id": "smart-force", "registration": "disabled" }
  ],
  "configurationRevision": 1
}
```

The example identity is illustrative. Validate the envelope product, supported protocol version, relative API base path, deployment identity and requested product before collecting credentials. Product IDs are `patient`, `phlebo`, `crm`, `smart-force`. Admin-managed deployments include `configurationRevision`; legacy explicit environment provisioning may omit it. Do not require `minimumAppVersion`, OAuth/SSO discovery, login URLs, upload origins or user capability fields: these are not in v1.

Public discovery exposes supported app products and registration policy only. It does not grant any account permission. Existing product authentication and API authorisation remain authoritative. A remembered origin returning a different deployment identity requires reconnection and reauthentication; do not automatically reassign queued work.

| Status | Meaning / client response |
|---|---|
| 200 | Validate contract and requested product, then show organisation and hostname |
| 503 | Unconfigured, disabled, suspended or temporarily unavailable deployment; do not send credentials or fall back to another server |
| 429 | Rate limited; wait and retry |
| TLS/network failure or redirect | Keep connection data; show an actionable connection error |

An unconfigured response contains `code: "mobile_not_configured"` and a `message`. Resolver failures may return a message without that code. Do not interpret HTML/404 as a compatible legacy backend or try credentials against guessed endpoints.

## Authentication and registration

Use the existing API contracts on the selected origin:

| Product | Login | Session verification |
|---|---|---|
| Smart-Force field executive | `POST /api/team/login` | `GET /api/team/auth/verify` |
| CRM / manager | `POST /api/crm/login` | `GET /api/crm/auth/verify` |
| Phlebo | `POST /api/phlebotomy/auth/login` | `GET /api/phlebotomy/me` |
| Patient | `POST /api/patient/login` | `GET /api/patient/profile` |

Existing response shapes stay unchanged. Team login returns `token` / `teamUser` with compatibility aliases; CRM returns `token` / `crmUser`; Phlebo returns `accessToken` / `refreshToken` / `worker`; unified Patient returns `data.token` / `data.patient`. Continue respecting each product's refresh and logout semantics; discovery does not introduce a shared authentication endpoint.

Only Patient can advertise `registration: "open"`. Use `POST /api/patient/signup` with the documented patient fields, including `first_name`, `last_name`, `email` and a password of at least eight characters. On a configured tenant origin the server binds the clinic ID, ignoring client `clinic_id`, `clinic_slug` and `clinic_domain` overrides. Closed registration returns 403. Staff accounts continue through existing administrator provisioning; disabled registration is not an invitation-registration API.

Password recovery stays on the selected server using the existing product contract. Smart-Force team recovery remains the three-step `/api/password-reset/*` flow with `userType: "team"`; `/api/team/forgot-password` is still unsupported. Native recovery/invitation UI is not added by this backend release.

Configured product routes reject disabled apps. Smart-Force/CRM checks use authoritative organisation UIDs and corporate owning-tenant relationships. Phlebo configuration requires the lab/hospital collection owner UID, and authenticated worker memberships are limited to that owner. Existing role/capability checks still apply. Legacy users without authoritative organisation mappings may need identity repair before signing in through a configured origin.

## Isolation and lifecycle requirements for client teams

Namespace credentials, cached records, drafts, files and offline mutations by canonical server origin, deployment identity, tenant, account/principal type, user and workspace where applicable. Numeric IDs may collide between deployments. Stop old workers, cancel requests and reject stale callbacks before changing organisation or account. Queued writes retain their original destination and idempotency key. Never replay or migrate uncertain work to a newly selected server.

The Expo starter in this backend checkout demonstrates URL entry, discovery, login/patient registration and request-generation isolation. It remembers the connection and requires sign-in after restart. It is not a production Smart-Force native-app upgrade and does not implement complete product screens, refresh/resume, offline queue migration, push or account/workspace storage isolation. Do not treat its sample package IDs as published tenant apps.

Push remains a separate integration dependency: an app-compatible relay or tenant-specific provider credentials/builds must be selected and verified. No push relay or store binary is delivered by this backend release.

## Admin and dedicated-server setup

Admin → Tenant Management → organisation details → White-labelled apps configures products, names, app IDs, origin and Patient registration policy. Platform-role authentication is required.

- `GET /api/superadmin/tenants/tenants/:id/mobile-apps`
- `PUT /api/superadmin/tenants/tenants/:id/mobile-apps`
- `GET /api/superadmin/tenants/tenants/:id/mobile-apps/deployment`

PUT requires `enabled`, HTTPS `origin`, `revision` (0 for first save), and `apps`. Each app supplies `product`, `name`, `appId`, `registration`; Phlebo also requires a six-character `ownerUid`. Only Patient may set `registration: "open"`. A stale revision or a URL assigned to another tenant returns 409. Unknown tenant returns 404; invalid input returns 400. Deployment identity is server-generated and preserved across edits.

An independent tenant server needs the exported `MOBILE_TENANT_CONFIGURATION` environment snapshot applied locally through its deployment process. Saving central admin settings does not remotely reconfigure or restart an existing server. New starts through the provisioning service include the snapshot; ordinary reloads do not automatically refresh it. Apply updates and suspensions deliberately. The snapshot works locally without a runtime control-plane dependency; database isolation and signing secrets remain deployment responsibilities.

See [setup and operational boundaries](../deployment/TENANT_APPS_SETUP.md) and [release verification](../testing/TENANT_APPS_RELEASE_2026-10-25.md).
