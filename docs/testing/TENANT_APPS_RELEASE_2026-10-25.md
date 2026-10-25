# Tenant app connection release — 25 October 2026

Merged and pushed the backend/admin connection foundation to `main`: product commit `b01b5b78`, plus read-only smoke support `6cbd7c7e`. Built the admin frontend from a clean detached checkout of `b01b5b78`, deployed it locally and to S3, completed CloudFront invalidation, and reloaded the existing production backend through its SSM environment loader. The built, locally served and public index SHA-256 is `ede3650b68bc5f092872c8c283538a13585e56e3a8ec733b578e1e9d24aa1e5f`. Previous hashed assets remain available.

Admin → Tenant Management → View organisation now contains White-labelled apps: server URL, enabled products, app names/package IDs, Patient registration policy and Phlebo collection owner UID. The backend exposes versioned discovery, admin configuration/export and origin-bound app middleware. It does not automatically enable or provision any customer app/server.

## Verification

- 28 backend tests, 9 connection tests and 3 admin UI tests passed. Mobile and targeted admin TypeScript checks passed.
- Production preflight confirmed the required JSONB and entity identity columns. No schema migration was required.
- 17 live checks passed across `app.mediqzy.com` and `mediqzy.com`: health, discovery/override handling, unauthenticated admin rejection, authenticated configuration/export reads and existing Smart-Force login validation.
- Four browser scenarios passed on the deployed admin page, with zero page errors: tenant list, live configuration panel, product form interaction and an intercepted save-conflict response. The save request was synthetic; no production configuration was updated.
- Portal route sanity passed. Canonical sanity/smoke returned **GO**, zero step failures and zero critical failures, with `SMOKE_READ_ONLY=true`. Ten state-changing scenarios were explicitly skipped, including user/appointment creation, assistant writes and emergency-call flows. This GO does not represent execution of those skipped scenarios.
- CloudFront invalidation `I5CZY8FHZZZMXD1B9IMUBEVJ8X` completed. Public and artifact hashes match. PostgreSQL and Redis health passed after activation.

Initial probes ran before the single backend process finished starting and received temporary 502 responses. Health recovered; the complete live check rerun passed 17/17. This release is not evidence of zero-downtime reload behaviour.

There are **zero configured production tenant app settings**. Discovery correctly returns JSON 503 for unconfigured hosts; configured-success and isolation scenarios were exercised with test fixtures. No tenant settings or clinical/business records were seeded or changed. Live admin checks used a short-lived server-signed token for an existing administrator and did not retest password login.

## Mobile contract and remaining scope

Updated the [mobile server connection contract](../api/TENANT_MOBILE_SERVER_CONNECTION.md) and linked it from the [Smart-Force API reference](../api/SMART_FORCE_MOBILE_API.md). The contract distinguishes public deployment capabilities from account permissions and documents Patient registration, unchanged product auth responses and dedicated-server configuration snapshots.

The Expo starter connection shell and sample branded profiles are committed source, not published native apps. No APK/iOS binary was built or distributed. Production product screens, recovery/invitation UI, complete offline storage/migration, push and physical-device acceptance remain release gates for the mobile teams. Existing customer app/server configuration has not been changed.

## Rollback

Private evidence and rollback files: `/home/ubuntu/tenant-app-release-evidence/20261025`. For backend rollback, restore the existing files from `previous-source/server` to their matching paths and reload `mediczy-server`; newly added unreferenced modules may remain. Restore `previous-index.html` locally and `previous-s3-index.html` to the S3 entry point, then invalidate CloudFront. Retained hashed assets support the previous index. No data migration or tenant-setting rollback is required.

[Sanitized release manifest](TENANT_APPS_RELEASE_2026-10-25.json).
