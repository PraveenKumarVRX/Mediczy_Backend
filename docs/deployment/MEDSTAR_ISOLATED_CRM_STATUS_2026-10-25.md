# Medstar isolated CRM deployment status

25 October 2026 (updated later same day). SSH and sudo access are verified. **The isolated CRM
application is now deployed and running** on the target (`medstar-crm-api-1`, up and stable,
`/health/live` and `/health/ready` both return healthy). This is a pre-launch, isolated deployment for
acceptance testing only — see "What is deployed" below for exactly what that does and does not mean.

## Registered identities

- Organisation: Medstar Hospital, central tenant ID `70`, entity UID `H98VG4`.
- Browser address: `https://medstar.mediqzy.com/crm`; mobile/discovery origin: `https://medstar.mediqzy.com`.
- Central installation ID: `32ebb22b-8299-4174-8d42-83fb7b076c0d`.
- Requested product scope: CRM core, campaigns, communications, social, agentic CRM, flow builder and Chatwoot. These are requested modules, not activated integrations or commercial entitlements.
- User-supplied target: EC2 `i-0cffa2fecc806bf27`, `ap-south-1`, SSH user `ubuntu`, public host `ec2-15-207-142-155.ap-south-1.compute.amazonaws.com`.

The target differs from the current Mediqzy instance (`i-0a1e08556143f4b03`). SSH access using the dedicated deployment key is now verified, and EC2 instance metadata confirms target instance `i-0cffa2fecc806bf27`, account `863162197383`, region `ap-south-1`, private IP `172.31.12.95`, and type `m7i-flex.large`. The installation registry now records this verified account and region (configuration version 2).

The target runs Ubuntu 26.04 LTS, has approximately 7.6 GiB RAM and 88 GiB free root disk, and permits sudo. No Node, Docker, PostgreSQL or Nginx binaries were found. Only SSH and local development listeners were observed. Current Mediqzy AWS credentials cannot manage the separate target account; SSH authorization does not grant cross-account AWS API access. No Windows private key was copied or read. A package-index preflight ran; application/runtime packages have not been installed.

## Completed centrally

Applied the existing additive dedicated-installation schema transactionally and registered Medstar's requested CRM profile. The installation has no connector credential and has never reported; no artificial health reports were submitted. Existing tenant status remains pending, mobile app access disabled, and no administrator login, paid subscription, dedicated runtime, cloud resources or external channel credentials were created.

Fixed the global ring fence so only exact `POST /api/admin/dedicated-installations/reports` reaches its own scoped machine-credential authentication. All adjacent admin paths retain JWT authentication. Source commit: `f331ae8f`, pushed to main and activated on Mediqzy. Twelve isolated PostgreSQL/control-plane tests and eighteen fence regression tests passed. Live unauthenticated report submission returns `401 invalid_connector`; adjacent admin paths return 401. Production health subsequently returned healthy with PostgreSQL and Redis connected; the initial readiness window expired during startup.

## What is deployed (this update)

- `infra/medstar/compose.yaml` on the target runs three containers in an internal-only Docker network
  (`medstar-crm-db-1`, `medstar-crm-redis-1`, `medstar-crm-api-1`), all healthy/up.
- Database: fresh `medstar_crm` database, schema applied from `server/installations/crm/schema.sql`
  (156 tables, RLS policies included) — schema-only, zero tenant/patient/customer rows copied from
  Mediqzy. Reference-only lookup data (`entity_kinds`, `entity_uid_rules`) seeded from
  `server/installations/crm/schema-reference.json`. A single `tenants` row mirrors the central
  registration (id 70, unique_id `H98VG4`, "Medstar Hospital", type `hospital`) — `status='active'`
  **only inside this isolated database**, required for the dedicated runtime to start; this is
  unrelated to and does not change the central Mediqzy `tenants` row, which correctly stays `pending`
  until the commercial/acceptance process completes.
- Database access: a new least-privilege `medstar_app` role (SELECT/INSERT/UPDATE/DELETE + sequence
  usage only, no DDL) was created for the running application, separate from the `medstar_owner` role
  used for schema installation — the app's own runtime DDL-guard checks in a few CRM modules
  (campaigns/automations/email/segments) correctly fail with "permission denied for schema public"
  under this role; that's the intended least-privilege posture, not a defect, since the real schema
  already exists.
- Application: `server/crm-app.mjs` (the dedicated M1/M3 runtime — no shared app.js/index.js import, no
  clinical/payment/Kafka jobs) built into a Docker image via `server/Dockerfile.crm` and started.
  Fixed one real packaging bug found during this deployment: the Dockerfile's build context only
  included `server/`, but `crm-channel-integrations.service.js` imports the repo-root `shared/`
  directory — the container crash-looped on `ERR_MODULE_NOT_FOUND` until the context was widened to
  include both (`infra/medstar/compose.yaml` build context changed from `./release/server` to
  `./release`, `Dockerfile.crm` now copies `server/` and `shared/` separately).
- Verified live: `GET /health/live` → `{"status":"ok"}`; `GET /health/ready` → `{"status":"ready",
  "tenantUid":"H98VG4"}`; a request with the wrong/missing Host header → `421 wrong_installation_host`
  (M3 boundary enforced); a request with the correct host but no auth token → `401` (routes are really
  gated, not open). Container stable (no restart loop) for the duration of this check.
- **Not done, deliberately**: no admin login has been bootstrapped or used; `CRM_OUTBOUND_ENABLED` stays
  unset/false (no channel can send anything); no DNS points at this host; the connector's periodic
  health report to Mediqzy's central control plane is not yet succeeding (`"Report delivery
  unavailable"` in logs) and hasn't been investigated — worth a look before relying on central
  monitoring, but it doesn't block anything isolated/local.
- **Process note, not a technical gap**: `server/crm-app.mjs`, `server/installations/crm/*`,
  `server/Dockerfile.crm` and `infra/medstar/` are all currently **uncommitted** in the Mediqzy repo
  (built and used directly on disk). Worth committing deliberately rather than leaving this
  deployment-critical code only on one engineer's local checkout.

## Remaining deployment work

1. Host identity, OS, resources and services have been inspected; retain that evidence and recheck for new workloads before provisioning.
2. ~~Build and prove the dedicated CRM runtime and dependency-ordered empty-database installation.~~ Done this update — see above. Investigate the connector report-delivery failure.
3. ~~Provision tenant-local database, queues, file storage, credentials and JWT keys.~~ Database/queues done this update (file storage for attachments, per M5, is not yet addressed).
4. Enrol an installation-specific connector and verify real health/aggregate reports, retries, revocation and central-outage behaviour. Current registry/report ingestion is not AWS lifecycle control, signed commercial entitlement enforcement or an arbitrary remote-command facility. (Connector token/report path exists but is not yet succeeding end-to-end — see above.)
5. Establish scoped cross-account IAM access if Mediqzy must manage AWS resources; SSH access alone does not grant AWS API control.
6. Provision Medstar's local CRM administrator through a secure activation process, configure approved external integrations, run isolation/CRM acceptance and backup/restore checks, then switch only the Medstar hostname after readiness passes.

No DNS cutover has occurred, and no outbound channel is enabled. Private operational evidence:
`/home/ubuntu/tenant-app-release-evidence/medstar`.
