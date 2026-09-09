# Hospital CRM Requirement Availability, Gaps, and World-Class Implementation Plan

Date: 2026-09-08
Repository: Mediczy
Scope: Hospital CRM / Marketing CRM / Patient Acquisition / Revenue Intelligence
Input reviewed: Attached Hospital Marketing CRM DPR, Version 1.0, September 2026

## 1. Executive Summary

The current Mediczy CRM is a strong foundation, but it is not yet the complete hospital growth operating system described in the attached DPR.

The implemented platform already supports:

- CRM login and portal navigation.
- Lead, deal, contact, and activity management.
- CRM dashboard statistics.
- Email inbox, email templates, marketing lists, senders, campaigns, suppressions, campaign scheduling, and campaign analytics.
- Facebook Lead Ads ingestion with deduplication, scoring, routing, and post-capture automation.
- AI-assisted CRM functions such as lead scoring, deal prediction, pipeline health, revenue forecasting, and dashboard insights.
- Insurance/corporate CRM workflows including RFQs, quotes, member uploads, claims analytics, agents, agencies, commissions, and corporate plans.
- WhatsApp infrastructure outside the CRM module, including templates, campaigns, messages, send, and webhooks.

The attached DPR expects a much larger product:

- End-to-end hospital funnel from awareness to inquiry, appointment, visit, consultation, investigation, procedure/admission, billing, revenue, retention, referral, NPS, ORM, and repeat revenue.
- Full marketing attribution and ROI across Google Ads, Meta, YouTube, SEO, website, landing pages, WhatsApp, SMS, email, voice, camps, referrals, corporate, TPA, and offline channels.
- Management dashboards for business head, marketing head, service lines, doctors, branches, teams, channels, geography, campaigns, budgets, and profitability.
- Budgeting, P&L, CAC, CPL, CPQL, CPA, ROAS, LTV:CAC, forecasting, alerts, KRA/KPI, incentive, SLA, compliance, approval, data governance, duplicate management, and ORM.

Overall status:

| Area | Availability |
| --- | --- |
| Core CRM | Available |
| Email marketing CRM | Available / Partial |
| Facebook lead acquisition | Available / Partial |
| WhatsApp | Available outside CRM / Partial inside CRM |
| Insurance/corporate CRM | Available |
| Hospital patient acquisition funnel | Partial |
| Appointment, visit, procedure, billing attribution | Major gap |
| Performance marketing integrations | Major gap |
| Marketing finance, CAC, ROAS, P&L | Major gap |
| Doctor/service-line/branch dashboards | Major gap |
| Call-centre/SLA engine | Major gap |
| ORM/NPS/reputation | Major gap |
| KRA/KPI/incentives | Major gap |
| Data warehouse/governance | Major gap |

## 2. Evidence From Current Implementation

Key implementation evidence found in the repository:

- `server/routes/crm.route.js`: Core CRM tables and routes for leads, deals, activities, contacts, RFQs, quotes, reports, distribution, and corporate plans.
- `server/routes/crmCampaigns.route.js`: Email marketing senders, lists, imports, templates, campaigns, recipients, events, suppressions, send-now, schedule, pause, resume, abort, and provider webhooks.
- `server/routes/crmCampaignAnalytics.route.js`: Campaign recipient, delivery, open, click, bounce, unsubscribe, timeline, link, domain, and recipient activity analytics.
- `server/routes/fb-leads.route.js`: Facebook Lead Ads webhook ingestion and CRM lead creation with campaign/ad/adset metadata.
- `server/services/crm-lead-automation.service.js`: Deduplication, scoring, marketing-list sync, hot-lead assignment, n8n trigger, WhatsApp hot-lead alert, Meta CAPI events, and auto-deal creation on qualification.
- `server/routes/crm-ai.route.js`: AI lead scoring, bulk scoring, deal prediction, next-best action, pipeline health, revenue forecast, dashboard insights, campaign optimization, and marketing copilot routes.
- `server/routes/whatsapp.route.js` and `server/routes/whatsapp-production.route.js`: WhatsApp messaging, templates, campaigns, status callbacks, webhooks, and production messaging.
- `client/src/pages/crm/*`: CRM portal pages for dashboard, leads, deals, contacts, activities, email inbox, campaigns, lists, templates, senders, suppressions, RFQs, distribution, AI insights, reports, and marketing copilot.
- `client/src/routes/index.tsx`: CRM frontend routes are mounted for the above pages.

## 3. Availability Legend

| Status | Meaning |
| --- | --- |
| Available | Working code and UI are present for the requirement. |
| Partial | Some supporting capability exists, but not enough to satisfy the DPR requirement. |
| Not Available | No meaningful implementation found in the CRM module. |
| Outside CRM | Capability exists elsewhere in Mediczy but is not integrated as a CRM-native workflow. |

## 4. Requirement Availability Gap Matrix

### 4.1 Organization, Roles, and Access

| Requirement Group | Current Availability | Gap |
| --- | --- | --- |
| Multi-level organization: group, region, hospital, branch, BU, department, service line, team, employee | Partial | CRM objects do not consistently carry full hierarchy dimensions. |
| Individual employee logins | Available | CRM-specific role model needs refinement. |
| Role-based access by hospital, branch, department, team, designation, data ownership, approval authority | Partial | CRM auth exists, but fine-grained row-level and workflow permissions are incomplete. |
| Super admin, business head, marketing head, performance marketer, CRM manager, call-centre manager, executive, digital marketer, finance, doctor coordinator roles | Partial | Generic admin/team/CRM access exists; persona-specific CRM permissions and dashboards are missing. |
| Employee master with target, KRA, KPI, cost centre, salary cost, incentive, attendance, productivity | Not Available | Requires dedicated people/performance data model and UI. |
| KPI/KRA/incentive engine | Not Available | No KRA -> KPI -> target -> actual -> score -> incentive pipeline. |

### 4.2 Core CRM and Lead Management

| Requirement Group | Current Availability | Gap |
| --- | --- | --- |
| Lead CRUD | Available | Current lead fields are generic and lighter than hospital DPR. |
| Contact management | Available | Patient/contact unification is not complete. |
| Deal/opportunity management | Available | Deal model is more sales-style than hospital care/revenue journey. |
| Activity/follow-up management | Available / Partial | Activities exist, but SLA, task queues, call outcomes, missed follow-up alerts, and journey automation need expansion. |
| Lead lifecycle from reach to referral | Partial | Current stages are new/contacted/qualified/converted/lost; hospital funnel stages are missing. |
| Lost lead management | Partial | Lost status/reason exists in some places, but structured loss taxonomy, win-back, and analytics are missing. |
| Lead scoring | Available / Partial | AI scoring exists; hospital-specific scoring rules need enrichment. |
| Lead distribution engine | Partial | Hot-lead assignment exists; load balancing, round-robin, branch/service-line routing, language, SLA, and escalation are missing. |
| SLA engine | Not Available | Needs timers, breach rules, escalation matrix, and reports. |
| Duplicate management | Partial | Deduplication exists for Facebook/post-capture leads; merge UI and cross-source duplicate governance are missing. |

### 4.3 Sources, Acquisition, and Attribution

| Requirement Group | Current Availability | Gap |
| --- | --- | --- |
| Website/manual/referral/social/event/partner/ad sources | Partial | Source field exists; not all DPR source taxonomy is normalized. |
| Facebook Lead Ads | Available / Partial | Webhook ingestion exists; spend and campaign performance sync are missing. |
| Google Ads, Google Display, Performance Max, YouTube | Not Available | No spend/click/impression/conversion integration found. |
| Meta Ads performance | Partial | Lead ingestion and CAPI exist; Ads insights/spend are missing. |
| SEO, Search Console, Google Business Profile, organic search | Not Available | No SEO ranking, organic traffic, GBP, or search console module. |
| Website and landing page module | Partial | Marketing lead capture exists in parts; no CRM-native landing page builder or page performance analytics. |
| UTM governance | Partial | Email campaigns store UTM fields; global UTM validation, taxonomy, and attribution rules are missing. |
| First-touch, last-touch, multi-touch attribution | Partial | Raw campaign metadata exists in some leads; attribution engine is missing. |
| Offline attribution: camp, hoarding, newspaper, radio, brochures, events | Not Available | Needs campaign objects, cost capture, QR/shortlink/coupon/source-code tracking. |
| Referral attribution: patient, doctor, corporate, insurance, TPA | Partial | Referral-related features exist elsewhere; CRM-native referral attribution and payout/reward workflows are missing. |

### 4.4 Communication and Engagement

| Requirement Group | Current Availability | Gap |
| --- | --- | --- |
| Email inbox | Available | CRM email inbox, settings, sync, send, templates exist. |
| Email marketing campaigns | Available / Partial | Campaign builder, lists, templates, scheduling, suppressions, analytics exist; journey triggers and revenue attribution are incomplete. |
| WhatsApp WABA / Twilio | Outside CRM / Partial | WhatsApp is implemented outside CRM; CRM-native inbox, lead timeline sync, campaign journey builder, opt-in status, and message attribution are missing. |
| SMS marketing | Partial / Outside CRM | SMS exists in notification/team communication areas; CRM-native SMS campaigns and analytics are missing. |
| Voice/call-centre | Partial | Communication routes exist; CRM call-centre console, call recording/logging, dialer, IVR, call tracking, disposition, and agent queue are missing. |
| Omnichannel communication timeline | Partial | CRM activities and WhatsApp chat exist separately; unified per-lead timeline is missing. |
| Consent management | Partial | Email suppressions exist and WhatsApp compliance exists elsewhere; unified consent by channel/purpose is missing. |
| Frequency capping | Partial | Email campaign daily limits exist; cross-channel patient-level frequency caps are missing. |
| Marketing automation / journey builder | Partial | Email scheduling and post-capture automation exist; visual/conditional multi-channel journeys are missing. |

### 4.5 Appointment, Visit, Clinical, and Revenue Journey

| Requirement Group | Current Availability | Gap |
| --- | --- | --- |
| Appointment management inside CRM | Partial / Outside CRM | Mediczy has appointment modules, but CRM lead-to-appointment conversion is not first-class. |
| Confirmed appointment, no-show, reschedule, recovery | Partial / Outside CRM | Appointment workflows exist elsewhere; CRM no-show recovery and attribution are missing. |
| Visit conversion | Not Available in CRM | Needs HIS/appointment linkage and visit status. |
| Consultation, investigation, procedure/surgery/admission stages | Not Available in CRM | Requires patient journey and HIS/EMR/billing integration. |
| Billing and actual revenue attribution | Partial | Deals have value and won revenue; hospital billing revenue attribution is missing. |
| Contribution/profitability | Not Available | Requires cost/profitability data model and finance integration. |
| Patient reactivation and retention | Partial | Messaging infrastructure exists; recall/reactivation cohorts and campaigns are missing. |
| Patient lifetime value | Not Available | Needs patient identity graph, revenue history, repeat visits, service-line costing. |

### 4.6 Campaigns, Content, and Marketing Operations

| Requirement Group | Current Availability | Gap |
| --- | --- | --- |
| Campaign object | Available / Partial | Email campaign object exists; unified cross-channel campaign object is missing. |
| Campaign approval lifecycle | Not Available | Needs draft/review/legal/doctor/finance approval states. |
| Medical content approval | Not Available | Needs clinical approvers, compliance checklist, audit trail, versioning. |
| Content management | Partial | Email templates exist; no full asset/content calendar/library. |
| Social media module | Not Available | No social calendar, publishing, engagement, or performance ingestion. |
| Health camp module | Not Available | No camp planning, attendance, lead capture, conversion, cost, ROI. |
| Event management | Not Available | No event lifecycle, budget, leads, outcomes. |
| Corporate marketing | Partial | Corporate plans/RFQs exist; corporate lead acquisition and account-based marketing are incomplete. |
| Doctor relationship management | Not Available | No doctor referral network, visits, potential, conversion, or relationship KPIs. |

### 4.7 Analytics, Dashboards, and BI

| Requirement Group | Current Availability | Gap |
| --- | --- | --- |
| CRM dashboard | Available | Needs role-specific dashboards. |
| Funnel dashboard | Partial | Basic sales/RFQ funnels exist; complete hospital funnel missing. |
| Business head dashboard | Partial | Some revenue/pipeline metrics exist; CAC, ROAS, P&L, forecast, service-line, hospital-wise performance missing. |
| Marketing head dashboard | Partial | Campaign/email metrics exist; spend, CPL, CPQL, CPA, CAC, channel performance missing. |
| Service-line dashboard | Not Available | Needs service-line dimension across leads, appointments, visits, revenue. |
| Doctor dashboard | Not Available | Needs doctor-level leads, appointment conversion, visit conversion, revenue, reputation. |
| Branch/hospital dashboard | Partial | Tenant/hospital concepts exist elsewhere; CRM analytics need branch-level slicing. |
| Campaign P&L and marketing P&L | Not Available | Needs budget/spend/vendor/revenue/contribution data. |
| Budget management and alerting | Not Available | Needs budget models, actuals, thresholds, alerts. |
| Forecasting | Partial | AI revenue forecast for deals exists; hospital volume/revenue forecast missing. |
| Cohort analytics | Not Available | Needs patient cohorts and retention/revenue tracking. |
| Channel profitability | Not Available | Requires spend, conversion, revenue, and contribution by channel. |
| Executive alerts and daily business review | Partial | Notification infrastructure exists; CRM executive alert rules are missing. |
| Geographic dashboard | Not Available | City/area exists lightly; no geo analytics UI. |
| Competitor intelligence | Not Available | No competitor data ingestion or dashboard. |

### 4.8 ORM, NPS, Feedback, and Reputation

| Requirement Group | Current Availability | Gap |
| --- | --- | --- |
| Patient feedback | Partial / Outside CRM | Feedback exists in broader healthcare workflows, but not CRM-native growth analytics. |
| NPS module | Not Available | Needs NPS surveys, segmentation, alerts, dashboards. |
| Online reputation management | Not Available | No review ingestion, response workflow, sentiment, severity, or ORM dashboard. |
| Google reviews, Practo, Justdial, Facebook, Instagram, YouTube comments | Not Available | Needs integrations and review inbox. |
| Review-to-CRM matching | Not Available | Needs identity matching and complaint escalation. |
| Reputation-to-revenue analytics | Not Available | Requires review/referral/source/revenue correlation. |

### 4.9 Compliance, Security, and Governance

| Requirement Group | Current Availability | Gap |
| --- | --- | --- |
| CRM authentication | Available | CRM login/refresh/logout exist. |
| Audit trail | Partial | RFQ audit log exists; broad CRM audit trail is missing. |
| Healthcare data segregation | Partial | Tenant/security controls exist elsewhere; CRM-specific policy needs hardening. |
| Sensitive data protection | Partial | Needs field-level controls for health interest, consent, phone/email, revenue, and clinical journey data. |
| Approval workflows | Partial | RFQ quote constraints exist; campaign/content/finance approvals missing. |
| Data import | Available / Partial | List import and RFQ import exist; generic lead/import mapping and validation are missing. |
| Data quality engine | Partial | RFQ data cleaning exists; CRM-wide validation, dedupe, enrichment, and governance missing. |
| Data warehouse | Not Available | Needs analytics store and scheduled transformations. |
| Webhooks/API layer | Partial | Several APIs/webhooks exist; external integration API contract is incomplete. |
| Disaster recovery | Not Assessed | Not enough CRM-specific evidence in this audit. |

## 5. Target Product Vision

Build Mediczy CRM into a Hospital Growth OS.

The product should become the command layer for:

- Patient acquisition.
- Marketing operations.
- Lead/contact engagement.
- Appointment conversion.
- Visit/procedure/admission conversion.
- Revenue attribution.
- Retention, recall, referral, and reputation.
- Management intelligence.

The north-star management questions:

- How many people did we reach?
- How many inquiries did we generate?
- How many inquiries became qualified leads?
- How many booked appointments?
- How many visited?
- How many converted to consultations, investigations, procedures, admissions, or repeat visits?
- How much revenue and contribution did those journeys generate?
- What did it cost to acquire each patient?
- Which channels, campaigns, doctors, service lines, branches, teams, and geographies are working?

## 6. Recommended Target Architecture

### 6.1 Product Modules

| Module | Purpose |
| --- | --- |
| CRM Core | Leads, contacts, patient identity, activities, tasks, duplicate management, SLA, assignment. |
| Acquisition | Source connectors, website/landing pages, Google/Meta/YouTube/SEO, offline campaigns, referrals. |
| Engagement | WhatsApp, SMS, email, voice, omnichannel inbox, consent, templates, journeys. |
| Conversion | Appointment linkage, call-centre console, no-show recovery, visit/procedure/admission pipeline. |
| Revenue Intelligence | Billing integration, revenue attribution, campaign P&L, CAC, ROAS, LTV, contribution. |
| People Performance | Employee master, targets, KRA/KPI, incentives, productivity, SLA performance. |
| Doctor and Service-Line Growth | Doctor dashboards, service-line funnel, capacity feedback, referral network. |
| Corporate and Insurance Growth | RFQ, corporate plans, TPA/insurance lead flows, employer accounts. |
| Reputation | Feedback, NPS, ORM, review inbox, sentiment, complaint escalation. |
| BI and Command Centre | Role-based dashboards, forecasting, alerts, daily/weekly/monthly business reviews. |
| Governance | Permissions, consent, audit trail, data quality, approvals, compliance, integrations. |

### 6.2 Data Architecture

Create a unified growth data model:

- `crm_leads_v2`: hospital-specific lead profile with patient/contact linkage.
- `crm_patient_identity`: phone/email/patient ID identity graph.
- `crm_lead_sources`: normalized channel/source/medium/campaign/ad/keyword/landing-page data.
- `crm_touchpoints`: every ad click, form, call, WhatsApp, email, SMS, referral, camp, and walk-in event.
- `crm_funnel_events`: stage transitions with timestamps and owner.
- `crm_appointments_link`: CRM lead/contact to appointment record.
- `crm_visit_events`: checked-in/no-show/consulted/investigation/procedure/admission/discharge events.
- `crm_revenue_events`: billing, package, procedure, admission, pharmacy/lab revenue, discounts, refunds.
- `crm_campaigns_unified`: cross-channel campaign object.
- `crm_campaign_costs`: spends, invoices, vendor costs, internal costs.
- `crm_attribution`: first-touch, last-touch, linear, time-decay, and custom attribution outputs.
- `crm_consent`: channel and purpose-level consent.
- `crm_sla_events`: SLA due, breach, escalation, resolution.
- `crm_employee_targets`: monthly/quarterly/annual targets by role.
- `crm_kpi_actuals`: computed actuals by employee/team/service-line/channel.
- `crm_incentive_payouts`: incentive calculation and approvals.
- `crm_reviews`: external/internal reviews and NPS.
- `crm_audit_log`: complete audit trail for create/update/delete/status/assignment/export/communication.

### 6.3 Integration Architecture

Priority integrations:

- Existing Mediczy appointments, patient, doctor, hospital, billing, pharmacy, lab, TPA, and corporate modules.
- Twilio WhatsApp as a CRM-native channel.
- SMS provider.
- Email SMTP/IMAP provider.
- Facebook Lead Ads and Meta Ads Insights.
- Google Ads.
- GA4.
- Google Search Console.
- Google Business Profile.
- Website forms and landing pages.
- Call tracking/IVR provider.
- Payment gateway.
- HIS/EMR/billing exports or APIs.
- Review platforms: Google reviews first, then Practo/Justdial/Facebook/Instagram/YouTube as applicable.

## 7. Implementation Plan

### Phase 0: Product and Data Alignment

Timeline: 1-2 weeks

Objectives:

- Freeze MVP scope for the hospital growth CRM.
- Define hospital funnel stages.
- Normalize source/channel taxonomy.
- Define core KPIs, dashboards, and personas.
- Choose integration priority by hospital business value.

Deliverables:

- Final PRD and data dictionary.
- Funnel stage definitions.
- Source/channel taxonomy.
- Role/permission matrix.
- Dashboard wireframes.
- Data migration and compatibility plan.

Acceptance criteria:

- Every DPR requirement is mapped to MVP, Phase 2, Phase 3, or backlog.
- Product, engineering, marketing, operations, and finance agree on KPI definitions.

### Phase 1: CRM Core Upgrade

Timeline: 3-5 weeks

Objectives:

- Upgrade generic CRM into hospital-specific CRM.
- Add patient/contact identity graph.
- Add hospital lead fields and funnel events.
- Add duplicate merge UI and API.
- Add assignment rules and SLA timers.

Key work:

- Extend lead schema with hospital, branch, department, service line, doctor preference, treatment interest, language, city/area, consent status, expected value, actual revenue.
- Introduce `crm_funnel_events` instead of relying only on current status.
- Add lead source taxonomy.
- Add assignment engine: round-robin, service-line routing, branch routing, hot-lead routing, language routing, manual override.
- Add SLA engine: first response due, follow-up due, overdue, breach, escalation.
- Add duplicate management: phone/email fuzzy matching, source lead ID matching, merge API, merge UI.
- Add call-centre lead queue UI.

Acceptance criteria:

- A lead can move through inquiry -> qualified -> appointment requested -> appointment booked -> visited -> converted/lost.
- Lead history shows all stage changes and owner changes.
- Duplicates are detected and can be merged.
- SLA breach report works by user/team/source.

### Phase 2: CRM-Native Omnichannel Engagement

Timeline: 4-6 weeks

Objectives:

- Make WhatsApp first-class inside CRM.
- Add SMS and unified communication timeline.
- Add consent and frequency capping.
- Upgrade automation beyond email campaigns.

Key work:

- CRM WhatsApp inbox linked to lead/contact/patient.
- WhatsApp templates inside CRM with approval status and category.
- One-click WhatsApp from lead detail and call-centre queue.
- Communication timeline combining calls, WhatsApp, SMS, email, forms, appointments, and system events.
- Unified consent model by channel and purpose.
- Frequency capping by patient/contact across all channels.
- Journey builder MVP: trigger, condition, wait, send WhatsApp/email/SMS, create task, assign owner.
- No-show recovery journey.
- Missed follow-up recovery journey.
- Patient reactivation journey.

Acceptance criteria:

- CRM user can see every interaction for a lead in one timeline.
- CRM user can send and receive WhatsApp without leaving CRM.
- Campaigns cannot send if consent/frequency rules fail.
- A no-show can automatically trigger WhatsApp + call task + escalation.

### Phase 3: Acquisition and Attribution Engine

Timeline: 5-8 weeks

Objectives:

- Connect paid, organic, website, and offline acquisition channels.
- Build attribution pipeline.
- Calculate CPL, CPQL, CPA, CAC, and ROAS.

Key work:

- Google Ads connector: campaign/ad group/keyword/spend/clicks/impressions/conversions.
- Meta Ads Insights connector: spend, impressions, clicks, leads, campaign/ad/adset performance.
- GA4 connector: sessions, events, landing pages, source/medium/campaign.
- Search Console connector: queries, pages, impressions, clicks, CTR, rank.
- Landing-page/form tracking with UTM governance.
- Offline campaign source codes, QR links, and short URLs.
- Attribution models: first-touch, last-touch, linear, time-decay.
- Campaign cost model.
- Lead-to-appointment and lead-to-revenue attribution.

Acceptance criteria:

- Marketing head can view spend, leads, CPL, qualified leads, CPQL, appointments, CPA, revenue, ROAS by channel and campaign.
- Every lead has first touch, last touch, and source quality indicators where data is available.
- Campaign P&L is available for at least Google, Meta, email, WhatsApp, website, and offline manual campaigns.

### Phase 4: Appointment, Visit, and Revenue Intelligence

Timeline: 5-8 weeks

Objectives:

- Close the loop from marketing lead to hospital revenue.
- Integrate appointment, visit, procedure/admission, and billing events.

Key work:

- Link CRM leads to appointment records.
- Sync appointment booked, confirmed, cancelled, rescheduled, no-show, checked-in, consulted.
- Sync billing and revenue events by patient/contact/appointment.
- Add service-line and doctor attribution.
- Add investigation/procedure/admission conversion stages.
- Add actual revenue, expected revenue, and contribution fields.
- Add capacity feedback: doctor availability, slot bottlenecks, procedure capacity.

Acceptance criteria:

- Business head can trace campaign -> lead -> appointment -> visit -> billing -> revenue.
- Doctor-wise and service-line-wise conversion dashboards are available.
- No-show and drop-off recovery dashboards are available.
- Revenue attribution is reconciled against billing totals.

### Phase 5: Dashboards, P&L, Budgets, and Forecasting

Timeline: 4-6 weeks

Objectives:

- Build management-grade analytics.
- Add marketing finance and forecasting.

Key work:

- Business head dashboard.
- Marketing head dashboard.
- Channel dashboard.
- Campaign dashboard.
- Service-line dashboard.
- Doctor dashboard.
- Branch/hospital dashboard.
- Employee/team performance dashboard.
- Budget planning and utilization.
- Budget alerts and underperformance alerts.
- Marketing P&L and campaign P&L.
- CAC, ROAS, LTV:CAC, contribution, cohort, channel profitability.
- Forecasting for leads, appointments, visits, revenue, spend, and capacity.

Acceptance criteria:

- Business head dashboard answers reach, inquiry, patient, revenue, cost, and ROI questions daily.
- Marketing head dashboard shows channel/campaign performance with spend and conversion rates.
- Alerts fire for budget overspend, low conversion, SLA breach, campaign underperformance, and revenue shortfall.

### Phase 6: People Performance and Operating Rhythm

Timeline: 3-5 weeks

Objectives:

- Add employee master, targets, KRA/KPI, incentives, and operating reviews.

Key work:

- Employee CRM profile with department, designation, manager, team, target, cost centre, salary cost.
- KPI templates by role: telecaller, CRM executive, performance marketer, SEO, referral executive, camp coordinator.
- Target actuals and achievement score.
- Incentive rules and payout approval.
- Daily business review dashboard.
- Monthly business review package.
- Quarterly/annual performance review exports.
- Gamification carefully limited to operational productivity metrics.

Acceptance criteria:

- Employee dashboard shows assigned work, SLA, conversions, revenue, and target achievement.
- Manager dashboard shows team performance and bottlenecks.
- Incentive calculations are explainable and auditable.

### Phase 7: Reputation, Feedback, NPS, and ORM

Timeline: 4-7 weeks

Objectives:

- Add patient experience and public reputation loop.

Key work:

- NPS surveys after visit/procedure/discharge.
- Internal feedback dashboard.
- Google review ingestion.
- Review inbox with severity and sentiment.
- Response workflow and approvals.
- Complaint escalation.
- Review-to-CRM matching.
- Doctor reputation dashboard.
- Hospital reputation score.
- ORM alerts and crisis workflow.
- Reputation-to-referral/revenue analytics.

Acceptance criteria:

- Negative reviews create cases/tasks with SLA.
- Positive patient feedback can trigger review/referral request journeys.
- Doctor and hospital reputation trends are visible.

### Phase 8: Governance, Scale, and Enterprise Hardening

Timeline: 4-6 weeks

Objectives:

- Make the CRM reliable for enterprise hospital operations.

Key work:

- Full CRM audit log.
- Fine-grained permissions and row-level access policies.
- Data export controls.
- Consent and privacy audit views.
- Data quality scorecards.
- Data warehouse or analytics mart.
- Scheduled ETL jobs.
- API contracts and webhooks for external HIS/EMR/billing.
- Monitoring, retries, dead-letter queues, and admin replay tools.
- DR runbook and backup/restore validation.

Acceptance criteria:

- Every sensitive CRM change is auditable.
- Failed integrations are visible and recoverable.
- BI queries do not degrade transactional CRM performance.

## 8. MVP Recommendation

Recommended MVP for fastest hospital value:

1. Hospital-specific lead fields and funnel stages.
2. CRM-native WhatsApp inbox and timeline.
3. Lead-to-appointment linkage.
4. SLA and call-centre queue.
5. Source taxonomy and UTM capture.
6. Facebook/Meta and Google Ads spend import.
7. Campaign-to-appointment-to-revenue attribution.
8. Business head and marketing head dashboards.
9. Duplicate merge.
10. Consent and frequency capping.

This MVP would convert the current CRM from a generic sales/insurance CRM into a real hospital patient acquisition CRM.

## 9. Prioritized Backlog

### P0: Must Have

- Hospital lead schema upgrade.
- Funnel event model.
- Lead-to-appointment linkage.
- WhatsApp CRM inbox.
- Unified communication timeline.
- SLA engine.
- Duplicate merge.
- Source taxonomy and UTM governance.
- Marketing spend import.
- Revenue attribution MVP.
- Business head and marketing head dashboards.
- Consent model.

### P1: Should Have

- Journey builder.
- No-show recovery.
- Reactivation campaigns.
- Call-centre console.
- Service-line dashboard.
- Doctor dashboard.
- Campaign P&L.
- Budget management.
- Employee KPI dashboard.
- Data quality scorecard.

### P2: Could Have

- SEO module.
- Search Console integration.
- Google Business Profile module.
- Social media calendar.
- Health camp module.
- Doctor relationship management.
- Corporate account marketing.
- ORM and NPS.
- Incentive payouts.
- Cohort and LTV analytics.

### P3: Later

- Competitor intelligence.
- Advanced capacity optimization.
- Advanced AI forecasting.
- Automated monthly/quarterly/annual review packs.
- Reputation-to-revenue modeling.

## 10. Data Model Additions

Minimum schema additions for MVP:

- `crm_funnel_events`
- `crm_lead_sources`
- `crm_touchpoints`
- `crm_lead_assignments`
- `crm_sla_rules`
- `crm_sla_events`
- `crm_consent`
- `crm_duplicate_candidates`
- `crm_appointment_links`
- `crm_revenue_events`
- `crm_campaign_costs`
- `crm_attribution`
- `crm_audit_log`

Recommended later schema additions:

- `crm_employee_profiles`
- `crm_employee_targets`
- `crm_kpi_definitions`
- `crm_kpi_actuals`
- `crm_incentive_rules`
- `crm_incentive_payouts`
- `crm_reviews`
- `crm_nps_surveys`
- `crm_review_tasks`
- `crm_content_assets`
- `crm_approval_workflows`
- `crm_offline_campaigns`
- `crm_service_line_targets`

## 11. API Additions

Minimum API additions for MVP:

- `POST /api/crm/leads/:id/stage`
- `GET /api/crm/leads/:id/timeline`
- `POST /api/crm/leads/:id/merge`
- `GET /api/crm/duplicates`
- `POST /api/crm/assignment-rules`
- `GET /api/crm/sla/queue`
- `POST /api/crm/communications/whatsapp/send`
- `GET /api/crm/communications/inbox`
- `GET /api/crm/communications/timeline/:entityType/:entityId`
- `POST /api/crm/appointments/link`
- `GET /api/crm/appointments/conversion`
- `POST /api/crm/revenue-events/import`
- `GET /api/crm/attribution/campaigns`
- `GET /api/crm/dashboards/business-head`
- `GET /api/crm/dashboards/marketing-head`
- `GET /api/crm/dashboards/service-lines`
- `GET /api/crm/dashboards/doctors`

## 12. UI Additions

Minimum UI additions for MVP:

- Lead detail v2 with hospital journey timeline.
- Call-centre work queue.
- SLA queue and breach dashboard.
- Duplicate management page.
- CRM WhatsApp inbox.
- Omnichannel timeline.
- Appointment conversion dashboard.
- Revenue attribution dashboard.
- Business head dashboard.
- Marketing head dashboard.
- Source/campaign performance dashboard.
- Consent management panel.

Later UI additions:

- Journey builder.
- Budget planner.
- Campaign P&L.
- Service-line command centre.
- Doctor growth dashboard.
- Employee KRA/KPI dashboard.
- ORM review inbox.
- NPS dashboard.
- Camp/event module.
- Doctor relationship module.

## 13. Acceptance Criteria for World-Class CRM

The CRM should be considered world-class only when:

- Every inquiry has a normalized source, owner, status, consent state, next action, and timeline.
- Every lead can be traced to appointment, visit, revenue, repeat visit, referral, and feedback where those events occur.
- Marketing can see spend, lead quality, conversion, revenue, and ROI by campaign/channel/service line/doctor/branch.
- Call-centre managers can see live queue, SLA risk, overdue follow-ups, agent productivity, and outcomes.
- Business heads can see daily revenue contribution from marketing activity.
- Patients are protected by consent, frequency capping, audit logs, and data segregation.
- Duplicate lead creation is actively prevented and mergeable.
- WhatsApp is not an add-on; it is a native CRM communication channel.
- Reports are explainable and reconcile to source systems.
- Integration failures are visible, retryable, and auditable.

## 14. Key Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Unclear KPI definitions | Wrong dashboards and management distrust | Freeze KPI dictionary before implementation. |
| Weak patient identity matching | Broken attribution | Build identity graph using phone, email, patient ID, appointment ID, and billing ID. |
| HIS/billing integration delays | Revenue attribution blocked | Start with CSV/import adapter, then upgrade to API integration. |
| WhatsApp compliance issues | Message delivery and policy risk | Enforce opt-in, templates, categories, frequency caps, and audit logs. |
| Overbuilding dashboards before data quality | Poor adoption | Build data quality scorecard early. |
| Generic sales CRM patterns | Poor hospital fit | Model hospital stages and service lines explicitly. |
| Performance degradation from analytics | Slow CRM | Use analytics tables/materialized views/warehouse for BI. |

## 15. Recommended Next Action

Start with Phase 0 and Phase 1 as a single execution package:

- Finalize the hospital funnel.
- Add hospital-specific lead fields.
- Add funnel events.
- Add lead-to-appointment linkage.
- Add SLA queue.
- Add CRM-native WhatsApp inbox design.
- Add duplicate merge.
- Build first management dashboard slice: source -> lead -> appointment -> visit -> revenue.

This creates the minimum credible version of a hospital patient acquisition CRM and unlocks the later marketing ROI, P&L, and executive intelligence work.
