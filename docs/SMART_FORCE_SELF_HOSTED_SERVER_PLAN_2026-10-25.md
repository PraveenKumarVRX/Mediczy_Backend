# Smart-Force: organisation server connection plan

Date: 25 October 2026. Status: proposed architecture; no application changes or deployment performed.

> Superseded product decision: tenant-owned branded apps are now required. See [Tenant app platform architecture](TENANT_APP_PLATFORM_ARCHITECTURE_2026-10-25.md). The universal app, unrestricted server selection/switching and estimate below are historical proposals. Server isolation and lifecycle requirements remain useful inputs, subject to the new tenant binding model.

## Product decision

Ship one standard Smart-Force app that connects directly to an organisation's compatible deployed backend. First launch asks for the organisation server URL before credentials. No tenant-specific app build or mandatory central discovery service is required. Release one supports one active server/account, with safe switching; simultaneous accounts can follow later.

Rocket.Chat documents the same server-address-before-login interaction: https://docs.rocket.chat/v1/docs/access-your-workspace . This is a UX reference, not a dependency.

## Evidence and limits

- `docs/api/SMART_FORCE_MOBILE_API.md` identifies the production mobile app as a separate `smart-force` repository. That source was not available in this checkout. Its current cache, queue and background-task implementation must be audited before estimates are committed.
- The mobile client present here, `mobile/src/api/client.ts`, hardcodes `https://app.mediqzy.com/api` and uses a single SecureStore token key. It must not be assumed to represent the separate production app.
- The backend API reference documents team login/refresh, separate CRM authentication and password recovery. `server/routes/team.route.js` includes tenant identity in authentication responses. Preserve these contracts and independently verify the deployed release before rollout.
- No evidence in this review establishes how the separate mobile app namespaces saved work. Cross-server ID collisions are a design risk to address, not a confirmed existing defect.

## User experience

1. New installation displays “Connect to your organisation” with a server address input, for example `https://force.example.org`, and Connect.
2. Validate URL, contact discovery without credentials, and display the server hostname, organisation display name and compatibility result. Server-provided branding is informational, not proof of ownership.
3. Show supported sign-in methods; retain hostname visibly during login and password recovery. A successful login determines tenant and permissions on the server.
4. Remember the validated connection. Subsequent launches restore that server and securely resume its session. Offline launches use only previously authenticated, authorised cached data under the existing offline policy.
5. Offer Change server before login and in Settings. Explain pending unsynced work before switching. Preserve it in its original account scope or let the user explicitly discard it; never upload it to a different account/server.
6. Report distinct failures: invalid address, network/VPN unavailable, TLS failure, incompatible server, authentication failure and insufficient Smart-Force permission. An outage must not silently reset the selected server or select the hosted service.

## Connection and backend contract

Add public `GET /api/mobile/discovery` on every supported deployment. It is a proposed new endpoint, not an existing API. Rate-limit it, expose minimal public metadata and use short caching. Example:

```json
{
  "product": "smart-force",
  "deploymentId": "immutable-deployment-uuid",
  "displayName": "Example Organisation",
  "mobileApiVersion": 1,
  "minimumAppVersion": "<approved-release>",
  "apiBasePath": "/api",
  "authMethods": ["team_password", "crm_password"],
  "features": { "offlineSync": false, "push": false }
}
```

Discovery declares protocol support, never user permissions. Validate schema and supported protocol range before showing credentials. Keep paths relative to the validated origin in v1; reject discovery directing login or refresh to another host. Negotiate feature flags conservatively and authorise every operation on the backend.

Generate deployment identity at provisioning and retain it through upgrades and normal recovery. Independent deployments/clones receive new identities. A changed identity at a remembered URL requires explicit reconnection and reauthentication; never automatically rebind cached work. URL aliases and domain migrations require a deliberate migration procedure rather than merging profiles by a shared ID.

V1 accepts HTTPS origins with optional ports, including valid private DNS/VPN hosts. Lowercase hostname and remove default port/trailing slash using a URL parser; preserve meaningful differences. Reject userinfo, query, fragment and non-root paths with a useful explanation. Subpath hosting is deferred and must be documented. Never disable TLS verification; private certificates need device-managed trust. Do not follow cross-origin redirects for discovery or authenticated requests; ask the user to connect to the final address. Server URL input must never trigger a backend proxy fetch.

Existing login, refresh, profile, recovery and field/CRM routes stay under the selected server. Resolve documented CRM response/capability compatibility gaps in the backend release before enabling manager support. API contract tests must reflect actual handlers, since the current reference can become stale.

## Mobile architecture and isolation

Implement ConnectionStore, connection-scoped API client factory, SessionStore and a central switch coordinator. Remove hardcoded production origins from API calls, recovery, uploads, downloads, WebSockets, background location/sync, WebViews and notification navigation. Audit these surfaces in the actual mobile repository.

Use this storage boundary:

`connectionId / deploymentId / principalType / tenantId / userId`

Connection ID is locally assigned and bound to the canonical origin. Principal type separates CRM and team accounts with identical numeric IDs. Tenant/user identifiers come from authenticated server responses. Missing tenant identity must have an explicit contract; never guess a default tenant. Store tokens in platform secure storage; protect sensitive cached records/files according to the app's data policy. Non-secret connection metadata may use ordinary persistent storage. Keep credentials out of logs and crash reports.

Every request, refresh operation, queued mutation, file upload and background job captures its immutable connection/session generation. Switching must stop schedulers and location delivery, abort requests, close sockets, invalidate old callbacks, clear in-memory queries and detach notification listeners before activating a new context. Late responses and refresh failures from the old generation cannot overwrite or log out the new session. Queued mutations retain their original scope and idempotency key; confirm backend idempotency support before promising automatic retry of writes.

Do not mutate a shared Axios baseURL while requests are active. Enforce origin checks before attaching bearer tokens. Allow external signed media uploads only through an explicit upload contract without forwarding the API bearer token.

## Safe server switch

1. Freeze writes and background producers; inspect unsynced work.
2. Resolve pending work with the user: sync to the original server if reachable, preserve it there for later, or explicitly discard it.
3. Unregister the old push binding when possible; locally deactivate it regardless. Revoke the old session using a suitable device-scoped endpoint when available. Do not invoke a documented all-devices logout without making that consequence clear.
4. Dispose the old session context and clear active memory. Retain preserved drafts only in their original namespace.
5. Validate the new connection, authenticate afresh and start its workers. A failed connection leaves old data isolated and recoverable through its original profile.

Push registration must bind installation, deployment and account; stale notifications cannot open data or make requests in another context. Define a server-side lifecycle/expiry for unreachable unregister operations. Keep notification payloads minimal.

## Existing-user migration

Audit actual historical endpoints and storage keys in the production app. Create a hosted-server profile for users whose data has a provable hosted origin, preserving their familiar login flow. Bind legacy tokens only to that origin and verify the session there. Quarantine ambiguous legacy data for recovery; never attach it to a newly typed server. Make migrations versioned, restart-safe and test upgrade interruption. An upgrade must not auto-replay old writes before provenance is established.

Older tenant servers without discovery should receive a clear upgrade instruction. If a legacy compatibility mode is necessary for the existing hosted deployment, restrict it to explicitly enumerated historical hosted origins and a defined sunset; do not use failed discovery as permission to send credentials to arbitrary servers.

## Deployment requirements

Each organisation needs a compatible backend/database, DNS and trusted TLS, reverse proxy routes for discovery/auth/API, correct public URL/media URLs, recovery-email/OTP setup, backups and a supported upgrade process. Validate tenant authorisation independently of hostname: selecting a server never grants a tenant or permission. Use separate deployment secrets and appropriate token issuer/audience validation to prevent tokens being accepted by unrelated deployments.

Push needs an explicit operating model: a disclosed central relay with tenant registration, or tenant-managed delivery compatible with the distributed app's credentials. Do not advertise fully self-contained push until a device proof of concept passes. Apply the same review to maps, AI, media, telemetry and other external dependencies. Private servers must work over their supported VPN path; central runtime availability must not be required for ordinary login/API use.

## Delivery sequence and ownership

| Phase | Owner | Deliverable / exit gate |
|---|---|---|
| 0. Audit, 1–2 engineering days | Mobile + backend | Actual mobile source mapped; endpoint/storage/job inventory; approved connection and auth contract |
| 1. Backend, 2–3 days | Backend + DevOps | Discovery, deployment identity, compatibility tests, two isolated staging deployments, deployment checklist |
| 2. Mobile, 4–6 days | Mobile | Connection onboarding, scoped clients/session/storage, recovery, upgrade migration and safe switching |
| 3. Integration, 3–5 days | Mobile + backend + QA | Offline/background/uploads/push lifecycle validated on Android and iOS; isolation and race tests pass |
| 4. Pilot, 2–3 days | QA + release owner | Hosted upgrade pilot plus one independent tenant; release and rollback rehearsal |

Planning estimate: roughly 2–3 calendar weeks with mobile/backend work overlapping, subject to Phase 0. SSO, subpath hosting, simultaneous accounts and a new push relay are separate scope and may extend this estimate. Backend ships first; retain backward-compatible authentication for older app versions.

## Required acceptance evidence

- Fresh install connects and signs in to independently deployed A and B without rebuilding the app; restart retains the right server.
- A and B deliberately reuse tenant/user/record IDs. No token, draft, query, queued write, file or notification crosses the boundary.
- Switch during login, refresh, upload and background sync; late A callbacks cannot alter B. Switch while offline preserves A work without sending it to B.
- Test malformed addresses, malicious discovery, redirects, incompatible versions, TLS errors and private-server VPN connectivity.
- Upgrade a populated hosted installation, interrupt migration, expire/revoke tokens and restore connectivity; verify no lost or misrouted work.
- Exercise actual field and manager permissions, password recovery and logout semantics on both servers.
- Collect sanitised network evidence and automated isolation/contract results; complete Android and iOS device acceptance before release.

Roll out to internal users, hosted pilot and one independent tenant before broad distribution. Keep discovery additive so backend rollback preserves existing clients; a mobile kill switch must not destroy connection profiles or drafts. Store rollback must not be the only recovery mechanism. Release owner signs off only after the two-server isolation gate passes.
