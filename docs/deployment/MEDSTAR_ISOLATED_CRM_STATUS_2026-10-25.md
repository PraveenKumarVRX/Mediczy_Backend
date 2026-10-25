# Medstar isolated CRM deployment status

Updated 25 October 2026. The isolated CRM is deployed under `/mnt/medstar` on EC2 `i-0cffa2fecc806bf27`, account `863162197383`, ap-south-1. Public HTTPS cutover remains pending.

## Installation

Medstar Hospital is tenant 70, UID `H98VG4`, installation `32ebb22b-8299-4174-8d42-83fb7b076c0d`. Central configuration version 3 records the verified AWS account. Central tenant status remains pending; the dedicated database activates only its local Medstar tenant.

Four containers provide a dedicated CRM API, Medstar-branded web frontend, PostgreSQL and Redis. Database and Redis have no host ports. Web/API bind to loopback only. The application uses verified PostgreSQL TLS and a separate non-superuser role without schema creation or RLS bypass. No Mediqzy customer data, sessions or provider credentials were copied. One local CRM administrator exists for `info@medstarhospitals.com`; it has no platform administrator privileges. Temporary credentials remain in the target's private bootstrap secret and must be rotated before launch.

The installation-scoped connector successfully reports to Mediqzy. Its persistent outbox retains reports during outages and retries the original event identity. Health reporting does not grant AWS lifecycle management or commercial entitlement enforcement.

## Verification

- Dedicated runtime and fresh-database bootstrap: 4 automated tests passed, including repeat-bootstrap safety and durable report retry.
- Real API smoke: 20 checks passed, including login, CRM reads and lead/contact creation and cleanup.
- Tenant isolation: 8 checks passed with disposable foreign-tenant fixtures; foreign access and wrong signing keys rejected. Fixtures removed.
- Browser: 8 checks passed with no page or API errors; no unexpected Mediqzy API requests. External Google fonts were blocked during the test.
- Related CRM UI regression tests: 32 passed.
- Encrypted local backup restored successfully into a disposable database; restored Medstar identity verified and disposable database removed.

After synthetic data cleanup the local database contained one tenant, one administrator, zero leads and zero contacts. No provider messages were sent. Private evidence is retained under `/home/ubuntu/tenant-app-release-evidence/medstar`.

## Access and remaining work

Use the SSH preview instructions in [the operator guide](../../infra/medstar/README.md). The public `medstar.mediqzy.com/crm` address has not been switched to this installation.

The recent Claude session and updated Terraform proposal were reviewed. AWS currently has no Transit Gateway in ap-south-1, and both hub and Medstar VPCs use `172.31.0.0/16`. Direct routing in the saved plan requires an addressing or NAT correction before applying it. See [network preflight](../architecture/MEDSTAR_NETWORK_PREFLIGHT_2026-10-25.md). No saved Terraform plan or security-group change was applied.

Production gates remain: corrected networking and scoped cross-account AWS management, DNS/TLS cutover, administrator password rotation, hospital-owned provider integration acceptance, attachment storage, and off-host backups with retention/monitoring. Outbound delivery and optional AI/social/flow integrations remain disabled; campaign workers are not started.
