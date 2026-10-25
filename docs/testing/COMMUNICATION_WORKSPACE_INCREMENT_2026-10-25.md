# Communication workspace implementation increment

Scope: explicit Admin/Team session handling, same six-channel navigation vocabulary with links only to existing portal capabilities, CRM composer deep links, and tenant-scoped CRM history/recipient resolution. Existing pages, campaigns, templates and integrations are retained. No database migration or historical-data reassignment is performed.

Verification includes simultaneous Team/Admin tokens, actual Team page shell and request authority, expired Team session refresh while the global remembered role is Admin, unavailable channel navigation, CRM SMS-to-email navigation, foreign recipient rejection before mocked provider dispatch, own-contact send/log compatibility, scoped history reads, and existing CRM reporting/settings regressions. Provider calls in unit tests are mocked; no external messages are sent.

Production rollout is pending. The global legacy chat storage/membership design is not made tenant-safe by this increment and is not newly exposed to CRM. Remaining work is in `docs/architecture/COMMUNICATION_HUB_PARITY_PLAN_2026-10-25.md`. Complete room isolation and durable storage before expanding chat access. Full conversation-first CRM parity and new channel workflows are not claimed complete.

Results: 50 client/service regression tests passed across 10 files; 4 dedicated CRM runtime/bootstrap tests passed. Server route/service syntax checks and changed-file whitespace checks passed. Production build validation is recorded after completion below.

Compatibility limit: legacy history with a null/unverified tenant UID is now excluded from scoped history. This is intentional isolation; review and reconcile ownership before rollout rather than restoring unscoped reads. Unit provider dispatch is mocked; live delivery and production data reconciliation are not verified here.

Final production frontend build passed (1m46s). Existing bundle-size/browser-compatibility warnings remain. No production deployment or provider send was performed in this increment.
