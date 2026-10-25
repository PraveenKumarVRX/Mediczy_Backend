# Communication workspace rollout

## Scope

Shared Admin/Team/CRM room-list, thread and composer, protected attachments, working emoji/name insertion, private room creation, search, unread markers, durable history, retry deduplication and identity-bound drafts. Existing email/SMS/WhatsApp/call/campaign/template/settings paths remain. Chatwoot discovery is tenant-scoped in the new workspace. Team and CRM sidebars group communication links without removing routes.

Internal chat uses additive PostgreSQL tables and does not reuse global Redis rooms. New Team/CRM adapters require canonical active organisation membership. Admin selects an explicit active tenant. No central provider credentials are introduced into Medstar. External provider activation, separate Chatwoot agent login, voice/video configuration and public DNS/TLS remain operational dependencies, not implied by chat readiness.

## Upgrade and enable

Apply `server/migrations/20261025000200-communication-workspace.sql` transactionally as the migration owner. Grant DML on its four tables and usage/select on `communication_workspace_messages_sequence_seq` to the runtime role; grant no DDL. Medstar's explicit `upgrade-workspace.mjs` performs this with local owner credentials; `infra/medstar/install.sh` invokes it after restart-safe bootstrap. Repeat upgrades preserve records/passwords.

Set `COMMUNICATION_WORKSPACE_UPLOAD_DIR` to a private durable directory (Medstar `/app/data/communication-attachments`) and add only reviewed tenant UIDs to `COMMUNICATION_WORKSPACE_ENABLED_TENANTS` (Medstar `H98VG4`). API readiness checks new tables when enabled. Keep other tenants disabled until ownership review and acceptance pass. There is no automatic global rollout.

Disabling the tenant flag reverts entry pages to existing tools and denies new workspace routes; it does not delete or replay messages. For rollback restore the prior API image/frontend and remove the enable flag. Keep additive tables and file data. Back up both the database and attachment directory; existing database-only backups do not include files.

## Legacy reconciliation

`node server/scripts/ops/migrate-communication-workspace.mjs --manifest=/private/reviewed-mapping.json` runs a rollback-only rehearsal. Mapping shape: `{ "legacy-room-id": "CANONICAL_TENANT_UID" }`. Use the normal approved environment loader. The operator must verify ownership; no mapping is inferred from a room name or phone number.

Only internal/channel rooms with verified same-tenant user participants and text messages from recognised Team/Admin user identities are eligible. Cross-tenant, unowned, patient/doctor, missing-identity and media records remain in legacy storage for reconciliation. The report contains room IDs/counts/reasons, not message bodies. Sequence numbers may advance during rehearsal; no rows are committed. Add `--apply` only for reviewed mappings; deterministic IDs make repeat copying safe. Legacy Redis records are never deleted or reassigned by this tool. Capture a backup before migration and avoid enabling a tenant until its workflow review is complete.

## Verification and release evidence

Run `node --test server/tests/communication-workspace.test.mjs server/tests/dedicated-crm-runtime.test.mjs server/tests/dedicated-crm-bootstrap.test.mjs` and the communication/CRM Vitest suites, then a clean frontend build. The PostgreSQL test uses two tenants and proves cross-tenant/private access rejection, concurrent writes, restart durability, idempotency conflicts, pagination/read markers, file ownership, deterministic migration and API query-override resistance. Browser acceptance must cover actual login, room creation, send/reload, draft switching, attachment upload/download and phone viewport. Never use patient recipients for automated tests.

Shared production activation must use its reviewed release process after migration/reconciliation. Medstar preview may be accepted independently under its isolated runtime. Public networking, off-host backup and hospital-owned provider acceptance remain tracked in the Medstar deployment report.
