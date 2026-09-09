# Hospital CRM Live Micro Audit

**Audit date:** 2026-09-09  
**URL audited:** `https://app.mediqzy.com/crm/hospital/`  
**Role lens:** AI CTO, UX researcher, UI designer, and hospital CRM market reviewer  
**Verdict:** **Release blocked for hospital CRM use until the production API is deployed in lockstep with the frontend.**

## Executive summary

The live frontend is reachable, the CRM login works, and all tested URLs resolve without a page-level 404. However, the production frontend is ahead of the production backend. Authenticated requests from the new hospital CRM pages return `Cannot GET` 404 responses for the CRM foundation, world-class, growth, specialty, diagnostic, digital, and communication-hub APIs.

This creates a visually navigable but operationally incomplete experience: users can move through the pages, but the core dashboards cannot load their data or execute their CRM workflows in production.

## Test method

- Authenticated through the live CRM login flow using the supplied CRM account.
- Tested 20 CRM routes with headless Chromium at desktop resolution.
- Tested the Communication Hub again at a mobile viewport.
- Captured console errors, failed requests, HTTP responses, final URLs, and visible page content.
- Performed read-only navigation only; no lead, consent, campaign, feedback, review, task, or template mutations were submitted.
- Confirmed the committed source contains the expected backend routes and migration runner entries.

## Route results

| Route | Page navigation | Data/function result | Assessment |
|---|---:|---|---|
| `/crm/dashboard` | 200 | Legacy dashboard loaded | Working baseline |
| `/crm/hospital` | 200 | `/api/crm/v2/funnel` and `/duplicates` return 404 | Blocked |
| `/crm/hospital/command-center` | 200 | World-class dashboard, marketing dashboard, and SLA APIs return 404 | Blocked |
| `/crm/hospital/communication-hub` | 200 | `/api/crm/communication-hub/dashboard` returns 404 | Blocked |
| `/crm/hospital/growth` | 200 | Growth dashboard, journeys, scoring, landing pages, and recovery APIs return 404 | Blocked |
| `/crm/hospital/specialties` | 200 | Specialty catalog and dashboard APIs return 404 | Blocked |
| `/crm/hospital/diagnostics` | 200 | Diagnostic dashboard API returns 404 | Blocked |
| `/crm/hospital/digital` | 200 | Digital overview API returns 404 | Blocked |
| `/crm/hospital/operations` | 200 | SLA and funnel APIs return 404 | Blocked |
| `/crm/hospital/engagement` | 200 | No load-time network errors; write/timeline actions not executed | Partial, needs authenticated API smoke |
| `/crm/hospital/acquisition` | 200 | Marketing-head dashboard returns 404 | Blocked |
| `/crm/hospital/experience` | 200 | Business-head dashboard returns 404 | Blocked |
| `/crm/hospital/people` | 200 | People performance returns 404 | Blocked |
| `/crm/hospital/governance` | 200 | Data-quality and integration-error APIs return 404 | Blocked |
| `/crm/campaigns` | 200 | Legacy campaign page loaded without request errors | Working baseline |
| `/crm/lists` | 200 | Legacy list page loaded without request errors | Working baseline |
| `/crm/templates` | 200 | Legacy template page loaded without request errors | Working baseline |
| `/crm/emails` | 200 | Inbox loaded; currently empty | Working baseline |
| `/crm/reports` | 200 | Team-performance API returns 500 | Defect |
| `/crm/settings` | 200 | CRM profile API returns 500 | Defect |

## Release-blocking findings

### P0: Frontend/backend release mismatch

Authenticated live responses returned:

- `GET /api/crm/communication-hub/dashboard` → 404 `Cannot GET`.
- `GET /api/crm/worldclass/dashboards/business-head` → 404.
- `GET /api/crm/growth/dashboard` → 404.
- `GET /api/crm/v2/funnel` → 404.

The committed backend does contain these routes in `server/app.js`, so the running production API is not serving the same revision as the frontend bundle, or the backend restart/sync step did not complete against the active API origin.

**Required action:** verify the production API host, run `git rev-parse HEAD` on the active server, confirm the revision is `226baca8` or later, restart the actual PM2/API process, apply `npm run migrate:crm --prefix server`, and repeat authenticated endpoint checks until these routes return JSON rather than Express 404 pages.

### P1: Existing CRM profile and reporting defects

- `/api/crm/profile` returns HTTP 500 and causes the Settings page to fail.
- `/api/crm/reports/team-performance` returns HTTP 500 and causes the Reports page to fail.

These should be fixed independently of the new hospital CRM deployment because they affect the baseline CRM shell.

## UX and UI assessment

### Strengths

- Consistent CRM shell with clear sectioning for overview, sales, marketing, distribution, and insights.
- Hospital CRM navigation is discoverable and follows a logical operating model: foundation, command centre, communication, growth, specialty, diagnostics, digital, operations, experience, people, and governance.
- Pages use readable metric panels, tables, empty states, refresh controls, and action-oriented forms.
- Communication Hub has a credible Brevo-style information architecture: overview, campaigns, integrations, inbox, and templates.
- Legacy campaigns, lists, templates, and email inbox provide a useful baseline for immediate CRM work.

### UX risks

- The dark, violet-heavy visual language reads as a generic sales SaaS product rather than a calm hospital operations product. Consider a more restrained palette, stronger severity/status semantics, and clearer hospital context.
- The left navigation is long and flat. Group hospital CRM into collapsible sub-navigation or use a hospital CRM workspace switcher so repeat users can scan faster.
- Empty/error states currently explain technical availability rather than giving an operator a recovery path. Each blocked state should show the affected integration, last successful sync, owner, and next action.
- Operational pages accept raw IDs such as `Lead ID` and `Identity ID`. Production users need search, patient identity confirmation, consent context, and duplicate warnings before mutation.
- The Communication Hub needs a visible provider readiness state, last sync time, delivery queue, retry queue, consent coverage, and campaign approval state before it should support send actions.

## Functional coverage against a world-class hospital CRM

| Capability | Source/UI presence | Production readiness |
|---|---|---|
| Lead identity, duplicate review, funnel, source attribution | Implemented in source | Blocked by API deployment |
| SLA queue, tasks, journey operations | Implemented in source | Blocked by API deployment |
| Omnichannel communications and consent | Implemented in source | Blocked by API deployment and provider credentials |
| Campaign monitoring, templates, integrations, inbox | Implemented in source | Communication Hub API currently not served |
| Specialty growth and diagnostic-chain workspaces | Implemented in source | Blocked by API deployment and source mappings |
| Revenue, ROAS, attribution, performance | Implemented in source | Requires populated campaign, booking, and revenue events |
| Governance, data quality, integration errors | Implemented in source | Blocked by API deployment; requires operational ownership |
| Clinical records and care management | Correctly outside CRM ownership | Must integrate with HIS/EMR/LIS rather than duplicate clinical truth |

## CTO recommendation

Do not invite hospital users to rely on the new hospital CRM workspace until the API mismatch is resolved. The fastest safe recovery sequence is:

1. Confirm the active API origin behind `app.mediqzy.com` and its PM2 process path.
2. Deploy the same `main` revision to that API host, not only the S3 frontend.
3. Run the CRM migrations and verify the migration status on the production database.
4. Run authenticated smoke checks for the 12 new API families and confirm JSON `200` or controlled empty-state responses.
5. Fix the existing `/crm/profile` and `/crm/reports/team-performance` 500 responses.
6. Add a release gate that fails deployment when a frontend hospital CRM route is live but its API health contract is not.

## Acceptance criteria

The module should be considered live only when every hospital CRM route loads without console errors, every read API returns a tenant-scoped JSON response, all write controls show success/error feedback, no raw technical 404/500 responses are visible, and the production smoke test confirms desktop and mobile layouts.

