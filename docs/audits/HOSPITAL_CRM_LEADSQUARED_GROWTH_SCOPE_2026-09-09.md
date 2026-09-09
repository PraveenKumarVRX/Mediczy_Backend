# Hospital CRM LeadSquared-Style Growth Scope

Date: 2026-09-09
Repository: Mediczy
Input: attached Salesforce Health Cloud vs LeadSquared comparison and hospital digital-marketing ROI notes

## Decision

The useful benchmark is LeadSquared's hospital growth operating model, not a generic sales CRM:

`source / ad / landing page -> lead -> score -> speed-to-lead -> nurture -> appointment -> visit -> treatment -> revenue -> recovery / reactivation`

The existing Hospital CRM already contains the identity, lead, appointment, visit, revenue, attribution, cost, consent, SLA, reputation, and analytics foundations. This scope adds the missing growth-automation layer on top of those foundations.

## Availability Matrix

| LeadSquared-style capability | Local availability after this change | Notes |
| --- | --- | --- |
| Centralized hospital lead intake | Available | CRM growth intake preserves source, UTM, landing-page, campaign, and identity context. |
| Rule-based lead scoring | Available | Tenant-scoped rules, score history, hot/warm/cold tiers, and recalculation API. |
| Speed-to-lead queue | Available | New and uncontacted leads create recovery cases with priority and due time. |
| Multi-step nurture journeys | Available / queued | Journey definitions, steps, enrollment, frequency metadata, and queued execution events are available. Provider execution still needs channel credentials and worker scheduling. |
| WhatsApp/SMS/email/call orchestration | Partial | Existing channel integrations remain the delivery layer; growth journeys create consent-aware work to execute. |
| Appointment/no-show recovery | Available | No-show recovery cases are generated from CRM appointment links. |
| Abandoned-form recovery | Available | Landing-page events support form start, abandonment, submission, and recovery queue creation. |
| Dormant-patient reactivation | Available | Dormant/nurture leads older than the configured window enter recovery. |
| Landing-page attribution | Available / partial | CRM-native page and event model is present; public page rendering and ad-platform sync remain deployment work. |
| Campaign-to-revenue ROI | Available | Campaign spend, leads, appointments, revenue, CPL, ROAS, and closed-loop dashboard are exposed. |
| Google/Meta/YouTube/SEO spend sync | Partial | The data model accepts imported spend and touchpoints; production connectors require provider credentials and mappings. |
| Agency/vendor profitability | Available / partial | Vendor and campaign-cost foundations exist; vendor scorecard UI is a follow-up surface. |
| Patient reactivation and cross-sell | Available / partial | Recovery and journey primitives exist; specialty-specific segments and clinical-safe content require hospital configuration. |

## New local surfaces

- `GET/POST /api/crm/growth/scoring/*`: scoring rules, score events, history, and recalculation.
- `GET/POST /api/crm/growth/journeys/*`: journey definitions, steps, and lead enrollment.
- `GET/PATCH /api/crm/growth/recovery/*`: speed-to-lead, no-show, abandoned-form, and dormant recovery queues.
- `GET/POST /api/crm/growth/landing-pages/*`: landing-page configuration and conversion events.
- `GET /api/crm/growth/dashboard`: campaign ROI and funnel metrics.
- `/crm/hospital/growth`: Growth Automation workspace for marketing and CRM managers.

## Production completion gates

1. Apply the CRM migrations in the target tenant database.
2. Configure Google Ads, Meta, website/landing-page, WhatsApp, SMS, call tracking, appointment, HIS/EMR, billing, and finance connectors.
3. Schedule journey queue processing and recovery scans through the existing worker/cron infrastructure.
4. Approve hospital-specific scoring rules, consent templates, nurture content, service-line segments, and attribution windows.
5. Validate revenue and contribution mappings before using ROI for budget decisions.
