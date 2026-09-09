# Hospital CRM Master Feature Feasibility and Inclusion

**Date:** 2026-09-09
**Decision:** Proceed with a configuration-driven hospital growth CRM built on top of the existing CRM foundation. The attached LeadSquared, Salesforce Health Cloud, specialty-growth, diagnostic-chain, and digital-hub requirements are feasible, but external channel execution requires provider credentials and production integrations.

## Executive decision

The product should be implemented as three connected workspaces:

1. **MedGrowth 360:** specialty, campaign, lead, journey, appointment, referral, doctor, revenue, ROI, and AI-assisted growth operations.
2. **DxGrowth 360:** diagnostic-chain, centre, test/package, home collection, corporate, referral, booking, sample-collection, completion, revenue, and profitability operations.
3. **Digital Growth Hub:** Google, Meta, Instagram, YouTube, LinkedIn, WhatsApp, SEO/local search, content, conversion tracking, attribution, integration health, and executive reporting.

Specialties are configuration-driven rather than hard-coded into separate products. The seeded catalog includes all 21 requested specialties and gives each specialty its own funnel stages, segments, KPI definitions, dashboard context, campaign economics, doctor/referral views, and automation compatibility.

## Included in the implementation

### CRM and LeadSquared-style growth layer

- Unified patient/contact identity and duplicate-aware lead records.
- Source, campaign, landing-page, UTM, assignment, SLA, funnel-event, and activity tracking.
- Lead scoring rules, score events, journeys, journey steps, enrollment, recovery cases, and queued execution.
- Command centre views for lead intake, SLA risk, communications, appointments, revenue, attribution, data quality, integrations, and team performance.
- Patient journey, consent, frequency controls, feedback, reviews, referrals, budgets, vendor costs, targets, incentives, content approvals, and audit history.
- Specialty dashboard and comparison workspace for the 21 requested specialties.

### Diagnostic-chain layer

- Chain, region, city, centre, department, test, package, campaign, lead, booking, sample collection, completion, and revenue dimensions.
- Centre performance, home-collection, test/package catalog, referral, corporate, booking-event, average-order-value, and channel views.
- The data model supports a future map/geospatial view without forcing map-provider dependency into the core CRM.

### Digital growth layer

- Integration registry with provider, channel, scope, health, sync state, and configuration metadata.
- Channel economics and conversion metrics for paid, organic, social, WhatsApp, referral, and offline sources.
- Content calendar with workflow status, approval, publication, specialty, channel, and campaign context.
- Attribution-ready touchpoints and revenue links from acquisition through appointment/booking and completion.
- AI recommendation storage and review workflow so recommendations can be governed before activation.

## Feasibility classification

| Requirement group | Status | Delivery condition |
|---|---|---|
| Specialty dashboards, funnels, segments, campaigns, lead scoring, ROI, doctor/referral views | Included now | Tenant configuration and data backfill |
| Diagnostic centres, tests, packages, bookings, home collection, referrals, corporate dimensions | Included now | HIS/LIS/billing mappings where source data already exists |
| Journeys, automation, SLA recovery, WhatsApp/email/SMS task queues | Included now as provider-neutral workflows | Production scheduler, templates, consent, and channel credentials |
| Google Ads, Meta, Instagram, YouTube, LinkedIn, Search Console, Google Business Profile | Modeled and integration-ready | OAuth/API credentials, account mappings, rate limits, and reconciliation jobs |
| WhatsApp Business, call centre, IVR, dialer, recordings, agent QA | Modeled and integration-ready | Approved provider, telephony webhooks, recording policy, and compliance review |
| SEO, local SEO, AI-search/JEO/LEO, content intelligence, competitor monitoring | Modeled and reportable | Search/provider APIs, crawler policy, content approval, and measurement definitions |
| Landing-page builder, forms, conversion tracking, maps, geospatial heatmaps | Partially implemented as CRM contracts | Publishing service, map provider, domain/DNS, and consent-aware analytics |
| Reviews/reputation, patient feedback, NPS, social listening | Data model and workflow ready | Review-channel connectors and verified source ownership |
| AI lead prioritisation, next-best action, forecasting, recommendations | Governance-ready storage and UI contract | Approved model/provider, evaluation set, human approval, and monitoring |
| Clinical records, orders, care plans, PACS/LIS/HIS billing source of truth | Boundary, not CRM ownership | Integrate by stable IDs/events; retain clinical truth in the clinical system |

## Implemented entry points

- `/crm/hospital/growth` — LeadSquared-style growth automation.
- `/crm/hospital/specialties` — MedGrowth specialty workspace.
- `/crm/hospital/diagnostics` — DxGrowth diagnostic-chain workspace.
- `/crm/hospital/digital` — unified digital growth hub.
- `/api/crm/growth/*` — growth, specialty, diagnostic, digital, integration, content, and referral APIs.
- `/api/crm/worldclass/*` — communication, consent, journey, appointment, revenue, attribution, performance, governance, and data-quality APIs.

## Database and deployment gates

The implementation is additive and migration-first. The CRM migration runner now includes foundation, world-class domains, growth automation, and specialty/diagnostic/digital domains.

```bash
npm run migrate:crm --prefix server
CRM_DEFAULT_TENANT_ID=<real-tenant-id> npm run process:crm:growth --prefix server
```

`<real-tenant-id>` is a placeholder and must be replaced with an actual tenant UUID. The shell error produced by using angle-bracket placeholders literally is expected and does not indicate a migration failure.

Before production enablement, complete tenant-specific identity/source backfill, consent and retention policy review, provider OAuth setup, webhook verification, scheduler deployment, reconciliation monitoring, and role/permission review.

## Acceptance standard for “world-class” readiness

The module is ready for phased production use when each enabled channel has an owner, consent policy, credential, webhook/sync health check, reconciliation report, failure retry policy, and measurable conversion event. The CRM can then expand from a strong growth and operations platform into a fully connected hospital revenue system without making the CRM the system of record for clinical care.
