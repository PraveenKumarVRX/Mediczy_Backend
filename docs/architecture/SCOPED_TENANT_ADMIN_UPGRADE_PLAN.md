# Scoped tenant administration — Medstar CRM and Radolabs LIS

Date: 2026-10-18. Baseline reviewed: `f1d5ffbc`. This document records the implementation in this working tree and the remaining rollout work. Neither customer's AWS account, organization identity or domain has been verified. No live customer records or AWS resources were created.

## 1. Product decision

Extend the existing Mediqzy admin account with **Dedicated Installations**. A customer organization can have multiple independently identified installations, each with its own product scope, domain, AWS account, connector and release lifecycle. Organization type, subscription tier, deployment topology and purchased modules are separate dimensions.

| Customer request | Organization type | Initial requested product | Optional scoped capabilities |
|---|---|---|---|
| Medstar | Hospital | CRM core | Campaigns, communications, social, Agentic CRM, flows, Chatwoot |
| Radolabs | Lab / diagnostic centre | Lab / LIS core | Billing, collection, quality, packages/slots, corporate network, imaging |
| Future customer | Existing compatible organization | One or more registered installations | Explicit module selection; new product profiles added through a reviewed catalogue |

A hospital buying CRM must not automatically receive the hospital clinical platform. A lab buying LIS must not automatically receive CRM or imaging. Existing organization's portal packs remain unchanged by this upgrade.

## 2. Current architecture and gaps

| Existing component | Observation | Upgrade decision |
|---|---|---|
| `AdminTenantManagement.tsx`, `super-admin-tenant.route.js` | Organizations, plan tiers, domain fields and local provisioning/server operations are combined. | Keep organization management; link to a separate dedicated-installation registry. Never call the legacy local PM2 controls to manage customer-owned AWS. |
| `tenant-module-packs.js` | Packs are attached by organization type and include default portal navigation. | Separate installation product profiles from full organization packs. A requested scope does not by itself grant access. |
| `module-access.route.js` | Existing role/module permissions and organization entitlements are useful foundations. | Effective runtime access must eventually intersect purchased entitlement, applied installation scope, user RBAC and tenant/branch scope. Never treat a UI checkbox alone as enforcement. |
| `tenant-registry.service.js`, `tenant-heartbeat.service.js` | Heartbeats are held in local memory; no outbound central reporting transport in that service. | Add durable per-installation reporting, separate received and observed timestamps, stale/unknown states and credential revocation. |
| `tenant-billing.service.js` and `saas-billing.service.js` | Multiple local billing implementations exist; SaaS dashboard routes use local tenant IDs and aggregates. | Reconcile which ledger and gateway are authoritative before linking remote installations. Do not introduce a third invoice generator or turn unverified telemetry into invoices. |
| Existing admin auth | Some legacy admin checks accept broad flags/email fallbacks. | New installation endpoints re-check active platform-admin authorization from the persisted user record; hospital/lab users and machine tokens cannot administer installations. |
| Lab runtime | `lab.route.enhanced.js`, `lab/registry.js`, lab auth/orders/collection/QC routes, health-checkup and phlebotomy routes span shared application services. | Radolabs needs a lab installation manifest and runtime dependency audit, not the CRM installer with a different logo. |

See the [Medstar deployment architecture](./MEDSTAR_CRM_DEDICATED_AWS_DEPLOYMENT_PLAN.md) for infrastructure, ownership and support-role boundaries.

## 3. Implemented central-admin foundation

The following is implemented in source, pending migration and deployment:

- `/admin/dedicated-installations`, reachable from the admin System menu and existing Tenant Management page.
- Search/select an existing tenant by its six-character `tenants.unique_id`; create any number of separately named CRM or LIS installations. Customer-specific buttons prefill a product/name only and do not guess an organization UID.
- Validated module scopes with mandatory core modules and organization/profile compatibility checks.
- Optional hostname, AWS account ID and region inventory. Saving these fields does not verify ownership or provision infrastructure.
- Versioned configuration updates; immutable installation tenant/profile; unique hostname and tenant/name constraints.
- Reporting-only connector credentials, issued once, stored as SHA-256 hashes, rotatable/revocable. No cloud or payment privileges are granted by these tokens.
- Durable event deduplication, latest daily metric snapshots, out-of-order protection, reported release/health and stale/never-reported presentation.
- Transactional administrative audit records. An audit insert failure rolls back the administrative mutation.
- HTTP API authorization and validation; no-secret read responses and `Cache-Control: no-store`.
- One-shot HTTPS report sender that accepts a private token file and persisted aggregate report; it does not extract patient data or run automatically.

The page explicitly shows **requested scope** and **payments not linked**. It must not advertise “active licence”, verified payment, successful AWS deployment, or applied scope without the corresponding external confirmation. Reporting health is machine-reported health, not a billing or availability certification.

### New schema

| Table | Purpose and invariant |
|---|---|
| `dedicated_installations` | UUID deployment identity; tenant UID FK; fixed product profile; requested modules; domain/AWS inventory; version; credential hash; latest report metadata. |
| `dedicated_installation_reports` | `(installation_id,event_id)` unique receipt and payload hash; changed payload under an existing ID is rejected. |
| `dedicated_installation_daily_metrics` | One latest complete snapshot per installation/UTC day; older arrivals never overwrite newer snapshots. |
| `dedicated_installation_audit` | Actor, action and configuration changes with composite tenant/installation FK. Credentials never enter changes. |

Existing tenant identity is reused. No new entity prefix is invented; deployment UUIDs are not organization UIDs. An installation cannot be reassigned to a different customer by editing a field.

## 4. API contract for the implemented foundation

Base: `/api/admin/dedicated-installations`.

| Method/path | Authority | Behavior |
|---|---|---|
| `GET /catalog` | Active platform administrator | CRM/LIS profiles, module keys, compatible tenant types and metric allowlists |
| `GET /tenant-options?search=` | Active platform administrator | At most 50 tenant UID/name/type options; no credentials/contact exports |
| `GET /?tenantUid=&limit=&offset=` | Active platform administrator | Paginated registry, maximum page size 100 |
| `POST /` | Active platform administrator | Register a requested installation configuration |
| `GET /:id` | Active platform administrator | Configuration, latest 31 available day snapshots and latest 50 administrative actions |
| `PUT /:id` | Active platform administrator | Replace editable configuration with current `version`; conflict returns 409 |
| `POST /:id/connector/rotate` | Active platform administrator | `{ "version": 1 }`; invalidate previous token, return new reporting token once |
| `POST /:id/connector/revoke` | Active platform administrator | `{ "version": 2 }`; invalidate reporting token, preserve hospital operations/data |
| `POST /reports` | Installation reporting token | Token determines installation/tenant/profile; callers cannot supply a tenant or installation override |

Registration example (illustrative UID; select the real tenant through the UI):

```json
{
  "tenantUid": "VTEST2",
  "name": "Radolabs LIS",
  "profile": "lab",
  "modules": ["lab.core", "lab.collection", "lab.quality"],
  "domain": "",
  "awsAccountId": "",
  "region": ""
}
```

Report schema (dates below are illustrative; use the actual observation time):

```json
{
  "eventId": "e20ad952-0b78-4987-b459-3bfc5f012b4b",
  "observedAt": "2026-10-18T09:00:00.000Z",
  "release": "release-sha",
  "health": "healthy",
  "day": "2026-10-18",
  "metrics": {"active_users": 12, "orders_created": 24, "reports_released": 18}
}
```

Metrics are nonnegative integer **complete UTC-day snapshots** for the supplied counters. An empty metrics object is a health-only heartbeat and does not erase analytics. Missing counters mean unknown, not zero. Daily distinct active users must not be summed into monthly distinct users. Current snapshots support observation, not validated billing.

Use UUID v4 event IDs; persist the report before sending and reuse its ID/body on retries. Same ID/body returns `replayed: true`; changed body returns `409 event_reuse`. Observations older than 31 days or more than five minutes in the future are rejected. Older accepted observations can update their historical day but do not replace a newer release/health observation. Missing reports over five minutes are stale. Preserve receipts at least beyond the accepted replay window; define an operational retention job before scaling up ingestion.

Reporting command, run only after configuring the destination and secret file in the customer installation:

```bash
DEDICATED_CONTROL_PLANE_URL=https://app.mediqzy.com \
DEDICATED_CONNECTOR_TOKEN_FILE=/run/secrets/mediqzy-reporting-token \
DEDICATED_PROFILE=lab \
node server/scripts/report-dedicated-installation.mjs /var/lib/mediqzy-reports/pending-report.json
```

The token file must be private (0600/0400). The sender refuses non-HTTPS origins and redirects. A retry scheduler, durable local outbox lifecycle and module-specific metric extraction are subsequent work; the command does not invent analytics. Coordinate cadence with the existing platform-wide IP rate limiter; do not disable global protection to accommodate shared-NAT installations.

## 5. Remaining admin upgrade, in delivery order

| Workstream | Deliverables | Acceptance gate |
|---|---|---|
| A — Registry and enrollment | Implemented foundation above; production migration, release and authenticated smoke checks remain. | Medstar/LIS isolation, stale edits, credential revocation and audit atomicity pass. |
| B — Installation agents | Durable customer outbox; heartbeat scheduler; separate CRM/LIS metrics adapters; monitoring and retry limits; credential expiry/rotation workflow. | Disconnect/reconnect, process restart and duplicate deliveries do not lose or inflate observations; no PHI leaves by default. |
| C — Commercial account linkage | Choose authoritative subscription ledger; immutable tenant/installation-to-customer mapping; verified payment webhook inbox; refunds/chargebacks/reconciliation; seat/module contracts and actual usage rules. | Browser redirects and customer reports cannot mark an invoice paid; retried gateway events cannot double-apply payments. |
| D — Entitlements | Signed, versioned entitlement documents bound to installation/product/customer; verify with public keys; grace/offline behavior; applied-version acknowledgement. | A lab token cannot grant CRM; stale/replayed documents rejected; central outage does not abruptly stop essential clinical work. |
| E — Delegated administration | Granular platform permissions for commercial admin, fleet operator, analyst and time-limited support; tenant-specific assignments; step-up authentication for privileged actions. | Every operation checks permission + customer assignment; support cannot change invoices or read unrestricted patient data. |
| F — AWS and domains | Verified account ownership; stored role ARN references (no AWS keys in forms), external-ID delegation, domain challenge/TLS status, infrastructure inventory. | No arbitrary host fetches/SSRF; connector token cannot invoke cloud operations; user-supplied account ID alone never authorizes access. |
| G — Release operations | Signed artifact manifests, approved migration sets, rollout request/approval/execution/ack states; compatible rollback; audit and notifications. | A “deploy” button is shown only when an executor exists; code rollback never blindly reverses clinical DB writes. |
| H — Analytics workspace | Fleet overview, per-product dashboards, billing reconciliation, freshness/coverage, export permissions and retention; distinguish snapshots, deltas, financial ledgers and unique users. | No false zeros, cross-tenant merge or invoiced-as-collected revenue; offline/incomplete reporting visible. |

Do not wire commercial suspension into `stopTenantServer`, terminate AWS instances, or delete records. Restrictions must be defined per product with a grace period, audit and reversal. Retain necessary existing records and export access. A connectivity failure is not evidence of nonpayment.

## 6. Radolabs implementation and rollout specification

### Scope and dependencies

The LIS deployment needs its own dependency inventory: lab login/staff permissions, lab/tenant UID mapping, branch scope, patient/order references, catalogue, specimens, reports/storage, billing interfaces and audit. Home/ward collection additionally needs collector identities, assignments, idempotency, custody events, label replacement, exceptions, handoff and receipt. Ward tasks need valid hospital admission/order integration or that mode must remain disabled.

Read and reconcile `server/routes/lab/registry.js`, `lab/auth.routes.js`, `lab/orders.route.js`, `lab/collection.router.js`, `lab/qc.route.js`, `lab.route.enhanced.js`, `phlebotomy.router.js` and `health-checkup.route.js` before extracting the runtime. Historical availability documents are not substitutes for exercising the current routes. The CRM installation migration manifest is not a lab installer.

### Lab activation checklist

1. Resolve the correct existing Radolabs tenant and lab entity UID. Confirm branches and staff ownership; do not use numeric ID coincidence or name matching as authorization.
2. Agree scope: LIS core, billing, QC, phlebotomy, packages/corporate, optional imaging. Register the requested installation; domain/AWS may remain blank until supplied.
3. Build an allowlisted lab API/worker/frontend runtime and dependency-ordered fresh-install migration set. Preserve authoritative result approval/release and financial controls. Disable unrelated clinical and CRM jobs.
4. Configure hospital-owned branding, private report/object storage, signing authority, catalogue/prices/reference ranges, specimen/barcode policies, staff roles and approved senders. Clinical policies are supplied/approved by Radolabs.
5. Provision collectors through the lab portal if collection is enabled; test home and ward separately. Do not generate production patient or collector fixtures automatically.
6. For packages, configure actual lab slots, package tests, network/contract eligibility and provider-owned payment settings. Do not inherit Medstar's hospital network or Mediqzy settlement credentials.
7. Reconcile approved data import, IDs, attachments and audit history. Never migrate another lab's records or shared session/queue secrets.
8. Execute order → accession → specimen receipt → processing → review → authorized release → report retrieval; exercise rejection/redraw, duplicate barcode, unauthorized release, cross-branch access and billing failures. Analyzer/LIS/HIS adapters require their own partner endpoint tests.
9. Start aggregate reporting only after validating its meaning. Initial lab counters: daily active staff, orders created, specimens received, reports released, samples rejected and collections completed. TAT distributions, QC failure rates and financial collection totals require separately versioned definitions before adding them to the allowlist.

## 7. UI design progression

Implemented page: product setup cards, paginated installation list, details, requested module selection, configuration form, one-time connector credential dialog, daily metric table and administrative history. It uses the existing AdminLayout and adds a System navigation entry.

Future detail tabs: Overview; Modules & Entitlements; Subscription & Payments; Analytics; Infrastructure & Domain; Integrations; Releases; Support & Audit. Show requested and applied versions side by side. Use explicit states such as “not enrolled”, “never reported”, “stale”, “payment not linked”, “domain unverified” and “deployment awaiting acknowledgement”. Do not use a single green “active” badge for independent states.

Commercial actions need reason, version and audit evidence. Cloud deployment and support access need an action preview, named target and approval according to the operator's role. Credential values are never displayed on overview/detail screens or saved to browser storage.

## 8. Verification, release and ownership

Implemented checks:

- Isolated PostgreSQL integration tests create and destroy their own loopback cluster. They exercise real migrations twice, database constraints, transactions, credential rotation/revocation, cross-profile denial, deduplication, out-of-order snapshots and fail-closed audit writes.
- HTTP tests exercise the actual new admin guard against persisted roles/status, validation and reporting authorization. Authentication identity is injected for tests; this is not an authenticated production acceptance run.
- UI tests cover honest empty states, lab-only organization selection, saving scoped registration, migration failures and one-time credential confirmation.
- Frontend production build targets `/tmp/mediqzy-installations-build`, not the currently served output. No restart or production publish is part of this work.

Apply **only the new migration** through the environment's normal secured migration procedure before enabling this page:

```bash
cd /home/ubuntu/Mediczy/server
NODE_ENV=production node scripts/ssm-env-loader.mjs migrations/20261018000100-dedicated-installations.migration.js
```

That command targets the central Mediqzy environment using its existing loader; it is documentation, not a command executed during this task. Customer installations must use their own explicit SSM path and runtime manifest. The migration is also registered in the unified runner. If absent, the new API reports schema-not-ready instead of inventing installation data.

Release central API and frontend together after review. Verify using a real platform administrator, a restricted hospital/lab user and a reporting credential. Register Medstar/Radolabs only after selecting their authoritative tenant UIDs. Do not issue keys until a responsible customer installation owner can receive them securely. Revoke keys used in acceptance tests.

Engineering owns runtime extraction and metrics correctness; DevOps owns account boundaries, delivery and restore procedures; finance owns payment/contract semantics; hospital/lab owners approve identities, clinical policies and data scope; QA owns isolation and workflow evidence. Sequence A → B → C/D → F/G, with E/H developed against the same API contracts. Estimate the remaining work after those inputs and dependency audits; the earlier Medstar-only estimate does not cover a full multi-product fleet platform.
