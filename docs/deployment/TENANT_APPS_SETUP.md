# Tenant app onboarding and admin controls

Implementation and backend/admin deployment date: 25 October 2026. See [verified release results](../testing/TENANT_APPS_RELEASE_2026-10-25.md). Tenant settings and customer app binaries remain unchanged.

## Admin workflow

Open Admin → Organization/Tenant Management → view an organisation → White-labelled apps.

1. Enter the HTTPS origin users will type into their branded app. Root origins and optional ports are supported; subpath hosting is not.
2. Enable Patient, Phlebo, CRM and/or Smart-Force. Supply the approved display name and unique package/bundle ID for each product.
3. For Phlebo, supply the six-character collection owner UID from the lab/hospital entity registry. Tenant numeric IDs and collection owner UIDs are different identities and must not be substituted for one another.
4. Patient self-registration is optional. Staff accounts remain provisioned through existing administration.
5. Save. Concurrent edits return a conflict; reload before editing again. The configuration retains its deployment identity and increments its revision.

Settings live in the tenant's existing JSONB settings under `mobileApps`; no schema migration is required. No actual tenant names, domains or app identifiers have been registered by this implementation. The sample mobile build profiles use `com.example.*` identifiers and shared placeholder icons, which must be replaced before distribution.

## Public connection contract

`GET https://<tenant-host>/api/mobile/discovery` is unauthenticated, rate limited and returns only deployment identity, organisation name, supported products, registration policy, protocol and revision. It executes before global ring fencing and after existing CORS/security/global rate limits. It accepts no tenant override header and never proxies a URL supplied by a user.

A hostname resolves only its exact configured origin. Unknown/unconfigured servers return 503. Suspended/disabled tenants cannot advertise an active app connection. Configure trusted proxy routing to preserve the actual public Host header; forwarded-host headers do not select a tenant.

Client flow: enter URL → discover → validate product → sign up/log in on that origin. The available Expo shell implements this flow and sample branded builds. It is not a replacement for existing native product screens. It stores the connection, requires sign-in after restart, isolates requests across connection changes, and uses Expo's native fetch implementation with redirect refusal. It deliberately does not adopt the old global token key.

## Dedicated deployments

Central admin settings immediately affect requests handled by that same backend database. An independent tenant server needs its configuration installed locally; saving central metadata does not change a remote server.

Use Export deployment configuration in the admin section, or authenticated:

`GET /api/superadmin/tenants/tenants/:id/mobile-apps/deployment`

Install the returned `MOBILE_TENANT_CONFIGURATION` environment value in that tenant server's deployment environment and redeploy/restart through its normal release process. This non-secret snapshot contains the tenant binding and app settings. New dedicated server starts through the existing provisioning service include it automatically. Already-running servers and ordinary reloads do not automatically receive central edits; apply the new snapshot deliberately, including suspensions, URL changes and registration-policy changes. Tenant-local authentication/database credentials and signing material remain managed by the deployment's existing secret management; this change does not provision separate cryptographic keys or databases.

The snapshot is resolved locally, so runtime discovery does not depend on the control plane. A snapshot with a mismatched host or invalid schema fails closed. Do not copy one deployment snapshot to another tenant. Maintain deployment identity through upgrades; independent clones need their own saved configuration identity.

Existing explicit environment provisioning remains available with `MOBILE_DEPLOYMENT_ID`, `MOBILE_DISPLAY_NAME`, `MOBILE_PRODUCTS`, `MOBILE_PUBLIC_ORIGIN`, and for patient access `MOBILE_PATIENT_CLINIC_ID` / optional `MOBILE_PATIENT_REGISTRATION=open`. Prefer the admin-generated snapshot for new deployments.

## Authentication middleware

On configured origins, disabled products are rejected. Patient sign-up/login binds clinic identity server-side, ignoring client clinic overrides. Patient profiles must match the bound tenant. CRM/Smart-Force login, refresh and authenticated guards check authoritative user organisation UIDs (including corporate owning-tenant relationships), rather than assuming IDs from different tables are interchangeable. Existing users missing authoritative identity mapping need that mapping repaired before using a configured mobile origin. Phlebo login/refresh checks owner membership; authenticated requests retain only memberships for the configured collection owner.

Existing unconfigured shared hosts retain their original auth contracts. This is not a certification of every historical API's data isolation; the existing product authorisation still applies. Do not direct a configured app to alternate legacy auth routes to bypass its connection binding.

## Build and verification

From `mobile/` (the existing lockfile uses legacy peer resolution; restore dependencies with `npm ci --legacy-peer-deps`):

- `TENANT_APP_PROFILE=rado-phlebo npx expo config --type public`
- Profiles: `rado-phlebo`, `rado-patient`, `medstar-crm`.
- `npm run typecheck`
- `npm run test:connection`

Backend focused checks from `server/`:

`npm test -- __tests__/mobile-discovery.test.js __tests__/tenant-mobile-admin.test.js __tests__/tenant-mobile-store.test.js __tests__/mobile-phlebo-isolation.test.js __tests__/team-auth-mobile-contract.test.js __tests__/team-refresh-ringfencing.test.js`

Admin UI check from `client/`:

`npm test -- src/pages/admin/TenantMobileAppsPanel.test.tsx`

Before production rollout, integrate the connection contract into the real product app repositories and run Android/iOS acceptance against two isolated deployments. Full product navigation, invitation/recovery UI, background location, offline queues, account migration, push registration, signing/store distribution and independent database/secret provisioning are not implemented by the starter shell. These remain release gates, not completed work.

## Local verification result

Passed before release: 27 backend tests across the six focused suites, 9 connection tests, 3 admin UI tests, mobile TypeScript checking, targeted admin TypeScript checking, and Expo public configuration generation for all three sample profiles. The changed tracked source files passed whitespace checks. No Android/iOS binary, device acceptance, tenant-server deployment or real-database tenant provisioning was performed.

## Production release

The backend/admin release is deployed, with 28 focused backend tests and 17 live checks passing. The canonical suite returned GO in read-only mode, with ten state-changing scenarios skipped. Four deployed-browser scenarios passed without production settings writes. See the release report for hashes, rollback and mobile limitations.
