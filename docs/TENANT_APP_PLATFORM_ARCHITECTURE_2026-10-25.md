# Tenant-owned app platform architecture

Date: 25 October 2026. Status: backend/admin and starter mobile connection foundation implemented locally; production rollout and product-app integration pending. See [setup and implementation boundaries](deployment/TENANT_APPS_SETUP.md).

## Decision and scope

Every tenant distributes its own branded apps for the products it uses. The delivery unit is a tenant × product × platform build, backed by shared product code and reusable platform services. This replaces the universal Smart-Force app assumption in the earlier server-selection plan.

| Tenant | App product | Example display name | Backend binding |
|---|---|---|---|
| Rado Labs | Phlebo | Rado Phlebo | Rado deployment, phlebo API audience |
| Rado Labs | Patient | Rado Patient | Rado deployment, patient API audience |
| Medstar Hospital | CRM | Medstar CRM | Medstar deployment, CRM API audience |

Names are illustrative and require tenant approval. Do not assume ownership of example domains or app identifiers. CRM distribution format (native app, PWA or both) is selected during product audit; this decision does not assert a complete native CRM app already exists.

Each tenant's production backend and data services run in its own isolated deployment. Multiple apps for the same tenant may share that deployment, with separate API audiences, permissions and session scopes. Apps do not need separate databases merely because they serve different roles. Cross-tenant data sharing requires an explicit integration contract.

## App experience and server setup

Install tenant-branded app → enter organisation HTTPS URL → validate server → sign up or log in → authorised product workflows.

First-time onboarding requires tenant URL entry before credentials. For example, Rado Phlebo and Rado Patient users enter the Rado deployment URL; Medstar CRM users enter the Medstar deployment URL. White labelling defines branding, app identity and product modules. The backend address is selected at runtime, without a compiled hostname allowlist or a new app build.

Display the selected hostname and server name before credentials. Persist the validated connection for subsequent launches. Provide Change server using the isolated switching process: stop workers, cancel requests, clear active session state and authenticate afresh. Preserve pending work only under its original connection. Never redirect active credentials or replay old work to a new server. Network failure must not trigger a server fallback.

Sign-up, invitation acceptance, verification, login and recovery all use the selected server. Registration policy is server-controlled: patient self-registration may be enabled; staff Phlebo/CRM accounts normally require invitation or admin provisioning. URL entry does not provision a tenant or grant permissions.

## Shared code and build profiles

Maintain shared authentication, API transport, secure storage, offline queue, uploads, notifications, localisation and observability packages. Keep product modules separate: Phlebo, Patient and CRM/Smart-Force. Generate tenant variants from versioned profiles; avoid a source fork per customer.

A profile declares tenant ID, app product ID, display name, package/bundle ID, branding, environment, supported API contract, enabled product modules, deep-link domains and notification configuration references. Build secrets and signing keys live in a secret manager, never in the profile or source. Any values embedded in an app are public configuration, not authentication secrets.

Use distinct Android application IDs and iOS bundle IDs for every tenant/product, with separate production and test identities. Branding includes icon, splash screen, colours, support links and privacy information. Compile only licensed product modules where feasible; backend permissions remain authoritative regardless of UI flags.

CI validates the profile schema and tenant/product consistency, builds from a pinned shared-code version, runs contract/isolation checks, signs with the correct identity and produces a traceable release manifest. Record app version, product version, tenant profile revision, source commit and backend compatibility range. Updates and over-the-air channels, where used, must be scoped to the matching tenant/product/runtime.

## Trusted binding and authentication

Discovery extends the earlier proposed `/api/mobile/discovery` contract with deployment identity, supported products, registration policy and API compatibility. Validate the user-entered URL and discovery response before showing credentials. Bind the connection to the canonical origin and deployment identity; authenticated responses establish tenant membership. Do not require a tenant ID embedded in the build to match a deployment-local numeric ID. Discovery branding alone is not proof of tenant ownership.

Use platform HTTPS certificate verification, including device-managed trust for private DNS/VPN servers. Reject embedded URL credentials, query strings and fragments; v1 accepts root origins with optional ports. Discovery is credential-free. Never silently replace the entered origin, forward credentials across redirects or bypass TLS verification. A changed deployment identity at a remembered origin requires reconnection and reauthentication. No central discovery service or app update is required to enter a compatible tenant server URL.

Authenticate against that tenant deployment. Validate issuer, audience, expiry, user role and tenant membership on the server. The client-supplied app ID or tenant header is public and cannot authorise access. Use distinct client registrations/audiences for patient, phlebo and CRM sessions where supported. SSO between a tenant's apps, if required, is a separate browser-based identity flow with explicit client registrations; do not share raw tokens between apps.

## Runtime and data isolation

Bind storage, sessions and queued work to environment / tenant / product / deployment / principal / user. Separate app IDs provide OS isolation, but explicit namespaces are still required for migration and background work. Sensitive records/files require appropriate local protection and retention; tokens belong in platform secure storage.

Every request/job captures its session generation. Logout, account change or server migration stops workers, cancels requests, closes sockets and rejects late responses before creating the next context. Never rewrite an existing offline mutation's tenant or destination. Preserve uncertain legacy data for recovery rather than assigning it to a new binding.

Tenant deployments isolate database credentials, database access, object storage access, encryption/signing material and runtime service accounts. Verify external dependencies including OTP/email, maps, payment, AI and media processing per tenant. Central operational tooling uses explicitly scoped access and sanitised telemetry.

Push credentials, device registration, app identifiers and deep links belong to the exact tenant/product/environment. A notification can navigate only inside its owning app/session. Define whether tenant-managed delivery or a central relay is used, including ownership, key rotation and data disclosure. Validate the chosen mechanism on real devices before promising self-contained delivery.

## Provisioning and release operations

Maintain a tenant app registry: tenant → deployment → enabled products → app identities → distribution owner → release channel → configuration revision. It may start as version-controlled manifests and CI automation; a management UI is optional later. Never store user credentials in this registry.

Tenant onboarding provisions backend/data isolation, DNS/TLS, product access, recovery channels, branding and app identities; validates login and permissions; then produces installable builds and distribution materials. Confirm store-account ownership, signing ownership, support responsibilities and distribution route with each tenant. Public-store availability is an external release dependency; use an approved pilot distribution route during validation.

Keep development, staging and production data, app identities and push channels separate. Release shared improvements through internal validation, one tenant pilot, then tenant cohorts. Maintain a supported backend compatibility window so tenants can upgrade independently. Rollback preserves queued data and never points an app at another tenant. A signed configuration must have rollback/version controls and a recovery path that does not require a reachable central service.

## Implementation workstreams

| Stage | Deliverable | Exit gate |
|---|---|---|
| 1. Audit | Inventory actual Phlebo, Patient and CRM sources, platforms, auth, jobs and storage; map deployments | Confirmed product capabilities and reusable code boundaries |
| 2. Platform foundation | Tenant app profile schema, trusted binding, scoped runtime/session/storage and backend discovery contract | Two tenant deployments reject cross-tenant and wrong-product access |
| 3. App factory | Reproducible branded builds, app IDs, signing, push/deep-link isolation and release manifests | Rado Phlebo, Rado Patient and Medstar CRM pilot artifacts |
| 4. Migration and QA | Existing app/data transition, API compatibility and device acceptance | No lost/misrouted offline work; supported upgrade paths demonstrated |
| 5. Pilot and operations | Tenant onboarding runbook, support diagnostics, tenant release cohorts and rollback | Pilot approval with installation and recovery evidence |

The earlier 2–3 week estimate is superseded: multiple product audits, app identities, distribution and tenant provisioning expand the scope. Estimate implementation after Stage 1; separate engineering effort from store/distribution lead time. Do not create a new native CRM product implicitly within app-branding scope.

## Required acceptance evidence

- Three pilot app variants can be installed and used against their respective tenant deployments; variants coexist where supported.
- First launch requires URL entry before credentials. A compatible tenant hostname works without rebuilding. Sign-up, invitations, login and recovery stay on the selected server.
- Switching servers never forwards old credentials, tokens, offline work or notifications to the new connection, including through crafted links, redirects and discovery responses.
- Servers reject valid tokens from the wrong tenant, product audience or environment, even when numeric IDs collide.
- Offline writes, receipts, location updates, notification registrations and refresh responses remain in their original context through logout, upgrade and interrupted migration.
- Profile changes cannot expose unlicensed modules or bypass server permissions; profile/signing secrets cannot cross tenant CI jobs.
- An outage in one tenant or the provisioning service does not break another tenant's configured login/API access.
- Legacy upgrades, deployment-address changes, signing/configuration rotation and rollback have rehearsed recovery procedures.

Backend/admin configuration, tenant middleware and an Expo connection shell are now implemented locally. See the deployment guide for verified checks, setup and the product-app/device release gates that remain.

## Requirement clarification

Tenant-branded app identity and runtime tenant URL selection are both required. This supersedes the previous preconfigured-origin restriction. Release one supports one active server/account with safe switching. The earlier server isolation requirements remain applicable.
