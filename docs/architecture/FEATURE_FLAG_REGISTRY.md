# Feature Flag Registry

The feature flag registry provides runtime control for tenant-scoped rollouts and emergency kill switches. It is separate from subscription/module entitlements: entitlements answer whether a tenant has purchased a capability; flags answer whether that capability is currently released.

## Evaluation order

For a flag key and request context, the server evaluates:

1. An environment kill switch (`FEATURE_FLAG_<KEY>_KILL_SWITCH=true`) disables the flag immediately.
2. The database `kill_switch` disables it.
3. A tenant override, when present, replaces the global enabled and rollout values.
4. Otherwise the global registry row is used.
5. If no row exists, a route may explicitly provide its legacy environment variable as a migration fallback.
6. Percentage rollout is deterministic for the flag and tenant (or user) subject.

Missing registry rows are disabled by default. This prevents a newly added high-risk capability from becoming active accidentally.

## Admin API

All endpoints require an authenticated platform admin.

```text
GET    /api/admin/feature-flags?tenantUid=<uid>
POST   /api/admin/feature-flags
PATCH  /api/admin/feature-flags/:key
DELETE /api/admin/feature-flags/:key
PUT    /api/admin/feature-flags/:key/tenants/:tenantUid
DELETE /api/admin/feature-flags/:key/tenants/:tenantUid
```

Create/update payloads use `key`, `description`, `defaultEnabled`, `rolloutPercentage`, `killSwitch`, and `metadata`. Tenant overrides use `enabled` (or `null` to inherit), `rolloutPercentage` (or `null` to inherit), and `metadata`.

Authenticated clients can read effective values with:

```text
GET /api/feature-flags?keys=crm.agentic_operator,crm.flow_builder
```

Every mutation writes an audit row in the same transaction as the change. An audit failure rolls back the mutation, so flag changes cannot become untraceable.

## Migration and rollout

`20261016000100-feature-flags.migration.js` is included in the unified migration runner. Existing CRM routes use explicit legacy environment fallbacks until their registry rows are created:

| Registry key | Legacy fallback |
|---|---|
| `crm.agentic_operator` | `CRM_AGENT_ENABLED` |
| `crm.flow_builder` | `CRM_FLOW_BUILDER_ENABLED` |
| `crm.social_growth` | `CRM_SOCIAL_GROWTH_ENABLED` |
| `crm.brightbean_chat` | `CRM_SOCIAL_GROWTH_ENABLED` |

After creating a registry row, the database value is authoritative and can be changed without redeploying the application.
