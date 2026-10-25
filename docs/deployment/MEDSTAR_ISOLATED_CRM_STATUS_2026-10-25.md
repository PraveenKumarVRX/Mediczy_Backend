# Medstar isolated CRM deployment status

25 October 2026. SSH and sudo access are verified. The isolated CRM application installation is still pending; this is not a completed deployment.

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

## Remaining deployment work

1. Host identity, OS, resources and services have been inspected; retain that evidence and recheck for new workloads before provisioning.
2. Build and prove the dedicated CRM runtime and dependency-ordered empty-database installation. The full shared application starts unrelated clinical jobs and is not a certified isolated CRM installer.
3. Provision tenant-local database, queues, file storage, credentials and JWT keys. Never copy the central production database or secret bundle.
4. Enrol an installation-specific connector and verify real health/aggregate reports, retries, revocation and central-outage behaviour. Current registry/report ingestion is not AWS lifecycle control, signed commercial entitlement enforcement or an arbitrary remote-command facility.
5. Establish scoped cross-account IAM access if Mediqzy must manage AWS resources; SSH access alone does not grant AWS API control.
6. Provision Medstar's local CRM administrator through a secure activation process, configure approved external integrations, run isolation/CRM acceptance and backup/restore checks, then switch only the Medstar hostname after readiness passes.

No DNS cutover or deployment on the supplied remote server has occurred. Private operational evidence: `/home/ubuntu/tenant-app-release-evidence/medstar`.
