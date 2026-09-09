# Hospital CRM Production Smoke Test

Date: 2026-09-09  
Environment: `https://app.mediqzy.com`  
Scope: new hospital CRM domains plus existing CRM navigation

## Result

**PASS with one configuration blocker.** The frontend bundle, route registration, database migrations, and legacy CRM regressions are healthy. Tenant-scoped hospital CRM data calls are correctly blocked because the CRM login account has no tenant assignment.

## Frontend

- CRM login succeeded and redirected to `/crm/dashboard`.
- 20 CRM routes navigated successfully and rendered content:
  - 13 hospital CRM routes: foundation, command center, communication hub, growth, specialties, diagnostics, digital, operations, engagement, acquisition, experience, people, governance.
  - 7 existing CRM routes: dashboard, campaigns, lists, templates, emails, reports, settings.
- Browser console errors: **0**.
- Navigation failures: **0**.

## API

- `/api/crm/profile`: `200`.
- `/api/crm/reports/team-performance`: `200`.
- Required new route families are mounted; unauthenticated contract checks return `401` instead of `404`.
- 18 tenant-scoped hospital CRM endpoints reached the tenant guard and returned `400 CRM tenant context is required`.
- Communication Hub methods verified: dashboard, campaigns, templates, integration health, and alert acknowledgement.

## Database

- CRM tables present in production: **111**.
- CRM tables with tenant-scoped columns: **75**.
- CRM migrations completed successfully through the communication hub migration.
- PostgreSQL, Redis, and pgvector health checks: connected.

## Blocker

The login account `crm@mediczy.com` has no `tenant_id` or `organization_id`. The verified active hospital tenant is:

- Tenant ID: `11`
- Name: `Mediczy Test Hospital`
- Slug: `mediczy-test-hospital`

Assigning the CRM account to tenant 11 requires explicit authorization because it changes persistent account access. Until then, the tenant-safe `400` responses are expected and prevent cross-hospital exposure.

## Residual Test Gap

Create/update/send workflows were not executed because they would mutate production data or send external communications. They should be run with a dedicated test tenant, sandbox providers, and approved test records after tenant assignment.
