# Medstar CRM installation

Target: EC2 `i-0cffa2fecc806bf27`, account `863162197383`, `ap-south-1`. Installation root: `/mnt/medstar`.

The dedicated entry point is `server/crm-app.mjs`. It does not import the shared application or its clinical/payment/Kafka startup. Database and Redis have private Docker networks and no published ports. The API and web proxy bind only to `127.0.0.1:8888` and `127.0.0.1:8080`. PostgreSQL uses a tenant-local CA and verified TLS. Application and migration-owner roles are separate; the app role cannot create schema or bypass RLS.

## Layout and secrets

- `release/server` and `release/shared`: reviewed source artifact; no `.env`, private keys or Mediqzy runtime files.
- `release/client/dist`: Medstar-branded frontend built with `VITE_API_URL=/api`.
- `install/schema.sql`: reviewed structural CRM/identity dependency baseline; no tenant/customer rows.
- `secrets/app.env`: unique runtime/database/encryption secrets, mode 0600.
- `secrets/owner-password`: local migration credential; never mounted in the normal API service.
- `secrets/bootstrap-admin.json`: temporary CRM administrator credentials; rotate before public launch. No email is sent automatically.
- `secrets/connector-token`: installation-specific machine credential, not a central JWT/AWS credential.
- `secrets/db-tls`: local CA and PostgreSQL server certificate/key; API receives only the CA certificate.
- `data`: tenant-local PostgreSQL, Redis and application/report-outbox persistence.
- `backups`: encrypted database archives; encryption key stays in `secrets/backup-key`.

Do not copy the Mediqzy `.env`, AWS credentials, production database, provider accounts, sessions or pending sends. The initial schema has supporting identity tables required by CRM, but unrelated APIs are not mounted. Only Medstar's tenant and scoped CRM administrator are bootstrapped; `isAdmin=false` at the platform level, `crmRole=admin` inside CRM.

## Installation and repeat deployment

Install Docker/Compose from the target OS package repositories. Stage the reviewed release, compose file, nginx configuration and root `dockerignore` as `release/.dockerignore`. Generate tenant-local secrets and database TLS material on the target. Configure the exact tenant origin/UID/ID; the runtime rejects implicit scope and central AWS credentials. The root `.env` must also contain the reviewed `RELEASE_SHA`, which is recorded in the API image label. Private secret files must exist before installation; the installer does not silently generate or replace them.

Run `sudo bash /mnt/medstar/install.sh` after staging these files. The script asserts the target EC2 identity, refuses to replace an untracked existing database, applies the schema only to an empty database, builds the API, runs the explicit bootstrap and starts the services. The bootstrap records a schema checksum and becomes a no-op on repeat; a changed checksum requires an explicit versioned migration. It does not reset existing passwords.

For this initial deployment the schema was applied before the installer driver was added. That known fresh baseline was verified and its bootstrap ledger recorded. Do not adopt an unrelated populated database through this path.

To create a branded frontend, build with `VITE_BRAND_NAME=Medstar`, `VITE_BRAND_FULL_NAME='Medstar CRM'`, `VITE_BRAND_LOGO=/brand/medstar.svg`, the hospital support details and `VITE_API_URL=/api`; then run `node infra/medstar/brand-build.mjs /path/to/dist`. The monogram is an initial placeholder, not an approved hospital logo. Nginx serves only CRM navigation and static assets; unrelated portal paths return 404.

## Operator access

Using the existing Windows SSH alias:

```powershell
ssh -N -L 127.0.0.1:18080:127.0.0.1:8080 medstar-crm
```

Open `http://127.0.0.1:18080/crm`. The loopback HTTP connection is carried inside SSH; it is not a public plaintext login endpoint. The public Medstar hostname is not switched by these scripts.

## Reporting, integrations and operations

The connector reports actual dependency health to Mediqzy through its scoped installation credential. Its persistent outbox retries with the original event ID and removes a report only after acknowledgement. It sends no patient/contact/message content. Reporting is not AWS lifecycle control or signed billing-entitlement enforcement. Reports older than the control plane's accepted reporting window require operator reconciliation; they are retained rather than silently discarded.

Outbound delivery and optional AI/social/flow modules remain disabled until hospital-owned integrations and provider acceptance are configured. The API has no central provider secrets. Campaign workers are not started by the API, so no queued outbound work is dispatched during installation acceptance. Attachment/object storage integration and off-host backup storage require separate configuration before production use.

Create a local encrypted backup with `sudo bash /mnt/medstar/backup.sh`; verify restoration with `sudo bash /mnt/medstar/restore-check.sh`. The restore check uses and removes a separate disposable database. Local encryption/restore does not protect against losing the EC2 volume: off-host backup, retention, monitoring and an agreed recovery objective remain production gates. Do not schedule pruning without the agreed retention policy.

Tests: `node --test server/tests/dedicated-crm-runtime.test.mjs server/tests/dedicated-crm-bootstrap.test.mjs`. `server/installations/crm/smoke.mjs` exercises a disposable local tenant and verifies foreign-tenant and wrong-signing-key rejection; it needs explicit owner/admin secret mounts and never sends provider messages.

See the [deployment status](../../docs/deployment/MEDSTAR_ISOLATED_CRM_STATUS_2026-10-25.md) and [network preflight](../../docs/architecture/MEDSTAR_NETWORK_PREFLIGHT_2026-10-25.md). Do not apply the saved hub network plan until the identical VPC CIDRs are addressed.
