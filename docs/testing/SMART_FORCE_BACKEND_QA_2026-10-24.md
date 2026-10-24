# Smart Force backend QA remediation — 24 October 2026

Scope: backend changes only. No mobile source or existing user changes were edited. No deployment or production data repair was performed.

## Implemented

- B1: expense, exception and tour-plan approval/rejection writes create a field notification in the same SQL statement. Retried decisions cannot insert another notification because the source status predicate no longer matches. This covers the in-app feed; it does not certify FCM delivery.
- B14: draft saves cannot overwrite submitted/approved plans. Reopening rejected drafts clears previous review/submission metadata.
- B26: quota transfers require two distinct field executives in the manager's tenant, positive finite quantities, integer non-revenue quotas and sufficient source balance. Invalid transfers roll back before crediting the destination.
- B28: speaker creation accepts the documented `name` alias.
- B30: expense approvals require a finite nonnegative amount and cannot exceed the claim, with an atomic amount predicate.
- B39/B65/B96/B97: daily-report visit totals come from tenant-scoped persisted visits rather than typed counts. The existing daily natural-key upsert remains; response adds `report_id`, and summary/issues aliases are preserved. Targets count completed visits by completion date. Approved expense aggregates use approved amounts.
- B42: lead responses and filters use pipeline stage rather than stale lead intake status; manager stage-change confirmations expose the new stage as status.
- B44: planning a visit on an earlier date or with an invalid timestamp returns HTTP 400.
- B45: owner/tenant-scoped `PATCH /api/field/visits/:id/cancel` cancels only planned visits.
- B73: expense dates normalize to `YYYY-MM`, matching the actual VARCHAR(7) schema; missing date defaults to this month and invalid amounts are rejected.
- B90: `GET /api/crm/field-force/daily-reports?date=YYYY-MM-DD&exec_id=...` exposes tenant-scoped manager review, limited to the latest 100 matching reports.
- B102: attendance month boundaries handle February and 30-day months instead of constructing impossible month-31 dates. The existing `{records,total,page,limit}` contract remains.
- Manager exception/tour approval mutations now check tenant ownership.
- Contract conversion rejects nonpositive, missing and nonnumeric values before writing.

## Verification and limits

Run from `server`: `npm test -- --runTestsByPath __tests__/field-force-qa-regression.test.js`.
Tests exercise Express routes with mocked database responses; they validate request handling, bindings and SQL guards. They do not execute SQL on PostgreSQL or verify production schema/provider configuration. Both route modules pass `node --check`; the changed files pass `git diff --check`.

## Still requires follow-up

- Device push delivery/token registration and background retry: the atomic in-app notification insertion is not a push dispatcher.
- Idle-session policy: align mobile access/refresh session activity with the organization's actual policy; HR's timeout alone does not establish a CRM/team policy.
- Territory coordinates, visit/doctor master-data consistency and past incorrectly accepted records require authoritative data checks; no coordinates, identity values or historical amounts were invented or rewritten.
- Disabled organization features (campaign publishing, services, community meetings, conversational assistance) need capability/provider decisions, not unconditional enablement.
- Mobile presentation, receipt parsing, selection controls, manager report navigation, cancellation controls, list envelopes, crash handling and refresh behavior remain with the mobile work. New backend endpoints do not add mobile controls.
- Actual-device QA retest, database integration validation and deployment remain outstanding. This document does not certify every report item resolved.
