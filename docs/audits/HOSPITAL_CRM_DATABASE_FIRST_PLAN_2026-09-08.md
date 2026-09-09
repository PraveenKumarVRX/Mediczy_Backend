# Hospital CRM Database-First Architecture Plan

Date: 2026-09-08
Repository: Mediczy
Scope: Database plan for upgrading the current CRM into a world-class hospital CRM and growth operating system
Companion document: `docs/audits/HOSPITAL_CRM_REQUIREMENT_GAPS_AND_WORLDCLASS_IMPLEMENTATION_PLAN_2026-09-08.md`

## 1. Purpose

This document defines the database-first plan for the Hospital CRM upgrade.

The current CRM already has useful operational tables for generic CRM, campaigns, RFQs, distribution, email, and AI. The next phase should not begin by adding more UI screens. It should begin by creating a stable hospital growth data model that can support:

- Patient acquisition.
- Lead and contact identity.
- Omnichannel communication.
- Appointment and visit conversion.
- Procedure/admission and billing attribution.
- Marketing spend, CAC, ROAS, and P&L.
- Service-line, doctor, branch, campaign, and channel analytics.
- Employee KRA/KPI and SLA tracking.
- Consent, audit, compliance, and data quality.
- ORM, NPS, feedback, and reputation.

## 2. Database Strategy

Use an additive migration strategy.

Do not replace the current CRM tables immediately. Keep current tables working and add a v2 hospital CRM layer around them. Backfill and gradually move reads/writes to the new structure.

Recommended strategy:

1. Preserve current tables:
   - `crm_leads`
   - `crm_deals`
   - `crm_activities`
   - `crm_contacts`
   - `crm_rfqs`
   - `crm_quotes`
   - `crm_marketing_*`
   - `crm_email_*`
   - `crm_agencies`
   - `crm_agents`
   - `crm_commissions`
   - `crm_corporate_health_plans`
2. Add normalized hospital CRM tables.
3. Add compatibility views for old screens.
4. Backfill from current CRM data.
5. Move new features to v2 tables.
6. Retire or freeze duplicate old columns only after production validation.

## 3. Core Design Principles

### 3.1 Every CRM Record Must Be Tenant-Aware

Every new operational CRM table should include:

- `tenant_id`
- `hospital_id`
- `branch_id`
- `department_id`
- `service_line_id`
- `created_by`
- `updated_by`
- `created_at`
- `updated_at`
- `deleted_at`

If a dimension is not known at creation time, allow null initially, but add data-quality checks to identify missing values.

### 3.2 Do Not Treat Lead, Patient, Appointment, and Revenue as the Same Object

Use separate entities:

- Lead: an inquiry or acquisition opportunity.
- Contact: a reachable person.
- Patient identity: a resolved patient/person graph.
- Appointment: scheduled care event.
- Visit: actual arrival or clinical encounter.
- Revenue event: billing/payment/refund/revenue attribution event.

### 3.3 Store Facts as Events

Do not overwrite important journey states without keeping event history.

Examples:

- Lead created.
- Stage changed.
- Assigned.
- WhatsApp sent.
- Appointment booked.
- Appointment no-show.
- Visit completed.
- Procedure billed.
- Review submitted.
- Consent changed.

### 3.4 Keep Operational Tables and Analytics Tables Separate

Operational tables should support CRM workflows.

Analytics tables/materialized views should support dashboards without slowing transactional screens.

### 3.5 Attribution Must Be Reproducible

Attribution outputs should be stored with:

- Input touchpoints used.
- Attribution model.
- Calculation window.
- Calculation timestamp.
- Revenue event or conversion event linked.

This avoids unexplainable dashboard numbers.

## 4. Current CRM Database Baseline

Current implementation evidence shows these major areas:

| Area | Current Tables / Pattern | Notes |
| --- | --- | --- |
| Core CRM | `crm_leads`, `crm_deals`, `crm_activities`, `crm_contacts` | Useful generic CRM foundation. |
| CRM auth | `crm_refresh_tokens`, `crm_login_attempts` | CRM access exists. |
| Email marketing | `crm_marketing_senders`, `crm_marketing_lists`, `crm_marketing_list_members`, `crm_marketing_templates`, `crm_marketing_campaigns`, `crm_marketing_campaign_recipients`, `crm_marketing_events`, `crm_marketing_suppressions` | Good base for email campaigns. |
| Email inbox | `crm_email_settings`, `crm_email_inbox`, `crm_email_templates` | Useful CRM email capability. |
| RFQ and insurance | `crm_rfqs`, `crm_rfq_members`, `crm_quotes`, `crm_rfq_claims`, `crm_rfq_files`, `crm_rfq_audit_log`, `crm_product_tc_master` | Strong insurance/corporate workflow. |
| Distribution | `crm_agencies`, `crm_agents`, `crm_commissions`, `crm_corporate_health_plans` | Useful corporate/distribution base. |
| AI CRM | `crm_ai_email_communications` | AI communication analysis base. |

Key baseline gap:

The current CRM database is still centered on generic leads/deals and insurance/corporate RFQs. It does not yet have a normalized hospital marketing, appointment, visit, billing, patient identity, attribution, KPI, consent, and reputation data model.

## 5. Target Database Domains

The world-class Hospital CRM database should be split into these domains:

1. Organization and access dimensions.
2. Patient/contact identity.
3. Leads and funnel events.
4. Sources, campaigns, touchpoints, and attribution.
5. Communication, consent, and frequency capping.
6. Appointment, visit, procedure, admission, and revenue linkage.
7. Tasks, SLA, assignment, and call-centre work queue.
8. Marketing finance, budgets, vendors, and P&L.
9. People performance, targets, KRA/KPI, and incentives.
10. Reputation, feedback, NPS, and complaints.
11. Audit, data quality, integrations, and warehouse.

## 6. Entity Relationship Overview

High-level relationship flow:

```text
crm_person_identities
  -> crm_contacts_v2
  -> crm_leads_v2
  -> crm_funnel_events
  -> crm_appointment_links
  -> crm_visit_events
  -> crm_revenue_events
  -> crm_attribution_results

crm_campaigns_unified
  -> crm_campaign_costs
  -> crm_touchpoints
  -> crm_leads_v2
  -> crm_attribution_results

crm_contacts_v2
  -> crm_consent_records
  -> crm_communication_events
  -> crm_frequency_counters

crm_employee_profiles
  -> crm_lead_assignments
  -> crm_sla_events
  -> crm_kpi_actuals
  -> crm_incentive_payouts
```

## 7. Required New Tables

### 7.1 Organization and Dimensions

#### `crm_org_units`

Purpose: Store CRM-specific hierarchy when source systems do not provide a clean hierarchy.

Key columns:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigserial | Primary key. |
| `tenant_id` | bigint | Required. |
| `parent_id` | bigint | Self-reference. |
| `unit_type` | varchar | group, region, hospital, branch, department, service_line, team. |
| `name` | varchar | Display name. |
| `code` | varchar | Stable short code. |
| `external_ref` | varchar | HIS/ERP/source-system ref. |
| `metadata` | jsonb | Flexible attributes. |
| `is_active` | boolean | Default true. |
| `created_at` | timestamptz | Required. |
| `updated_at` | timestamptz | Required. |
| `deleted_at` | timestamptz | Soft delete. |

Indexes:

- `(tenant_id, unit_type)`
- `(tenant_id, parent_id)`
- Unique partial index on `(tenant_id, unit_type, code)` where `deleted_at is null`

### 7.2 Patient and Contact Identity

#### `crm_person_identities`

Purpose: Resolve leads, contacts, patients, appointments, and billing records to a single person identity.

Key columns:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigserial | Primary key. |
| `tenant_id` | bigint | Required. |
| `primary_patient_id` | bigint | Link to patient table if available. |
| `primary_contact_id` | bigint | Link to CRM contact if available. |
| `primary_phone_e164` | varchar | Normalized phone. |
| `primary_email` | citext | Normalized email. |
| `full_name` | varchar | Best current name. |
| `gender` | varchar | Optional. |
| `dob` | date | Optional. |
| `identity_confidence` | numeric | 0 to 1 confidence. |
| `merge_status` | varchar | active, merged, disputed. |
| `merged_into_id` | bigint | Self-reference. |
| `metadata` | jsonb | Source-specific identifiers. |
| `created_at` | timestamptz | Required. |
| `updated_at` | timestamptz | Required. |

Indexes:

- `(tenant_id, primary_phone_e164)`
- `(tenant_id, primary_email)`
- `(tenant_id, primary_patient_id)`
- GIN on `metadata`

#### `crm_identity_keys`

Purpose: Store all identifiers that can resolve to a person identity.

Examples:

- Phone numbers.
- Emails.
- Patient IDs.
- Appointment IDs.
- WhatsApp IDs.
- External HIS IDs.
- Facebook lead IDs.

Key columns:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigserial | Primary key. |
| `tenant_id` | bigint | Required. |
| `identity_id` | bigint | FK to `crm_person_identities`. |
| `key_type` | varchar | phone, email, patient_id, appointment_id, whatsapp, external_his_id, fb_leadgen_id. |
| `key_value` | varchar | Normalized value. |
| `source_system` | varchar | Origin. |
| `confidence` | numeric | 0 to 1 confidence. |
| `is_primary` | boolean | Default false. |
| `created_at` | timestamptz | Required. |

Indexes:

- Unique partial `(tenant_id, key_type, key_value)` where active.
- `(identity_id)`

#### `crm_contacts_v2`

Purpose: Hospital-aware CRM contact profile.

Key columns:

- `id`
- `tenant_id`
- `identity_id`
- `legacy_contact_id`
- `full_name`
- `phone_e164`
- `email`
- `age`
- `gender`
- `city`
- `area`
- `preferred_language`
- `preferred_channel`
- `patient_status`
- `tags`
- `notes`
- `metadata`
- `created_by`
- `updated_by`
- `created_at`
- `updated_at`
- `deleted_at`

Indexes:

- `(tenant_id, phone_e164)`
- `(tenant_id, email)`
- `(tenant_id, city, area)`
- GIN on `tags`

### 7.3 Hospital Leads and Funnel Events

#### `crm_leads_v2`

Purpose: Hospital-specific lead record. This becomes the primary CRM lead table for new workflows.

Key columns:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigserial | Primary key. |
| `tenant_id` | bigint | Required. |
| `hospital_id` | bigint | Nullable initially. |
| `branch_id` | bigint | Nullable initially. |
| `department_id` | bigint | Nullable initially. |
| `service_line_id` | bigint | Nullable initially. |
| `doctor_id` | bigint | Preferred/requested doctor. |
| `identity_id` | bigint | FK to person identity. |
| `contact_id` | bigint | FK to `crm_contacts_v2`. |
| `legacy_lead_id` | bigint | Link to old `crm_leads`. |
| `lead_number` | varchar | Human-readable stable ID. |
| `lead_type` | varchar | opd, procedure, admission, international, insurance, tpa, corporate, camp, referral. |
| `lead_stage` | varchar | Current stage snapshot. |
| `lead_status` | varchar | open, won, lost, dormant, duplicate. |
| `qualification_status` | varchar | unqualified, qualified, disqualified. |
| `priority` | varchar | low, medium, high, urgent. |
| `score` | integer | Lead score. |
| `treatment_interest` | varchar | Procedure/service interest. |
| `symptom_or_need` | text | Optional inquiry details. |
| `expected_value` | numeric | Estimated revenue. |
| `actual_revenue` | numeric | Denormalized from revenue events for fast screens. |
| `source_id` | bigint | FK to normalized source record. |
| `campaign_id` | bigint | FK to unified campaign. |
| `first_touch_id` | bigint | FK to touchpoint. |
| `last_touch_id` | bigint | FK to touchpoint. |
| `owner_user_id` | bigint | Current assigned owner. |
| `assigned_team_id` | bigint | Current team. |
| `next_action` | varchar | Call, WhatsApp, appointment, etc. |
| `next_followup_at` | timestamptz | Next follow-up. |
| `first_response_at` | timestamptz | SLA metric. |
| `qualified_at` | timestamptz | Stage timestamp. |
| `appointment_booked_at` | timestamptz | Stage timestamp. |
| `visited_at` | timestamptz | Stage timestamp. |
| `converted_at` | timestamptz | Stage timestamp. |
| `lost_at` | timestamptz | Stage timestamp. |
| `lost_reason_code` | varchar | Structured reason. |
| `lost_reason_notes` | text | Free text. |
| `consent_summary` | jsonb | Fast-read snapshot. |
| `metadata` | jsonb | Source-specific fields. |
| `created_by` | bigint | Required. |
| `updated_by` | bigint | Required. |
| `created_at` | timestamptz | Required. |
| `updated_at` | timestamptz | Required. |
| `deleted_at` | timestamptz | Soft delete. |

Recommended current stages:

- `new`
- `attempting_contact`
- `contacted`
- `qualified`
- `appointment_requested`
- `appointment_booked`
- `appointment_confirmed`
- `visited`
- `consulted`
- `investigation_advised`
- `procedure_advised`
- `admission_advised`
- `billing_completed`
- `won`
- `lost`
- `dormant`
- `duplicate`

Indexes:

- `(tenant_id, lead_stage)`
- `(tenant_id, lead_status)`
- `(tenant_id, owner_user_id, lead_status)`
- `(tenant_id, next_followup_at)` where `lead_status = 'open'`
- `(tenant_id, hospital_id, branch_id, service_line_id)`
- `(tenant_id, campaign_id)`
- `(tenant_id, source_id)`
- `(tenant_id, created_at)`
- GIN on `metadata`

#### `crm_funnel_events`

Purpose: Immutable stage and journey event history.

Key columns:

- `id`
- `tenant_id`
- `lead_id`
- `identity_id`
- `event_type`
- `from_stage`
- `to_stage`
- `event_at`
- `actor_user_id`
- `owner_user_id`
- `hospital_id`
- `branch_id`
- `service_line_id`
- `doctor_id`
- `source_system`
- `source_ref`
- `metadata`
- `created_at`

Indexes:

- `(tenant_id, lead_id, event_at desc)`
- `(tenant_id, event_type, event_at desc)`
- `(tenant_id, to_stage, event_at desc)`
- `(tenant_id, hospital_id, branch_id, service_line_id, event_at desc)`

### 7.4 Sources, Campaigns, Touchpoints, and Attribution

#### `crm_source_taxonomy`

Purpose: Normalize source/channel/medium naming.

Key columns:

- `id`
- `tenant_id`
- `channel`
- `source`
- `medium`
- `source_group`
- `display_name`
- `is_paid`
- `is_offline`
- `is_referral`
- `default_attribution_weight`
- `is_active`
- `created_at`
- `updated_at`

Examples:

- channel: `paid_search`, source: `google`, medium: `cpc`
- channel: `paid_social`, source: `facebook`, medium: `lead_ads`
- channel: `direct`, source: `phone`, medium: `inbound_call`
- channel: `offline`, source: `camp`, medium: `event`
- channel: `referral`, source: `doctor`, medium: `relationship`

#### `crm_campaigns_unified`

Purpose: Cross-channel campaign object, not only email.

Key columns:

- `id`
- `tenant_id`
- `hospital_id`
- `branch_id`
- `service_line_id`
- `campaign_code`
- `name`
- `description`
- `campaign_type`
- `channel`
- `source`
- `medium`
- `status`
- `objective`
- `start_date`
- `end_date`
- `budget_amount`
- `actual_spend_amount`
- `owner_user_id`
- `approval_status`
- `legacy_email_campaign_id`
- `external_campaign_id`
- `utm_source`
- `utm_medium`
- `utm_campaign`
- `utm_term`
- `utm_content`
- `metadata`
- `created_by`
- `updated_by`
- `created_at`
- `updated_at`
- `deleted_at`

Indexes:

- `(tenant_id, status)`
- `(tenant_id, channel, source, medium)`
- `(tenant_id, start_date, end_date)`
- `(tenant_id, external_campaign_id)`
- Unique `(tenant_id, campaign_code)`

#### `crm_touchpoints`

Purpose: Store every acquisition and engagement touchpoint.

Key columns:

- `id`
- `tenant_id`
- `identity_id`
- `lead_id`
- `contact_id`
- `campaign_id`
- `source_id`
- `touchpoint_type`
- `channel`
- `source`
- `medium`
- `event_name`
- `event_at`
- `session_id`
- `gclid`
- `fbclid`
- `utm_source`
- `utm_medium`
- `utm_campaign`
- `utm_term`
- `utm_content`
- `landing_page_url`
- `referrer_url`
- `external_event_id`
- `cost_amount`
- `revenue_amount`
- `metadata`
- `created_at`

Touchpoint types:

- ad_impression
- ad_click
- website_session
- form_submit
- inbound_call
- outbound_call
- whatsapp_inbound
- whatsapp_outbound
- email_sent
- email_open
- email_click
- sms_sent
- appointment_booked
- visit_completed
- billing_completed
- referral_created
- camp_registration
- walk_in

Indexes:

- `(tenant_id, identity_id, event_at desc)`
- `(tenant_id, lead_id, event_at desc)`
- `(tenant_id, campaign_id, event_at desc)`
- `(tenant_id, channel, source, medium, event_at desc)`
- `(tenant_id, external_event_id)`
- GIN on `metadata`

#### `crm_attribution_results`

Purpose: Store calculated attribution against conversion and revenue events.

Key columns:

- `id`
- `tenant_id`
- `lead_id`
- `identity_id`
- `conversion_event_id`
- `revenue_event_id`
- `campaign_id`
- `source_id`
- `model`
- `attribution_window_days`
- `attributed_weight`
- `attributed_revenue`
- `attributed_conversion_count`
- `calculation_run_id`
- `input_touchpoint_ids`
- `metadata`
- `calculated_at`
- `created_at`

Indexes:

- `(tenant_id, model, calculated_at desc)`
- `(tenant_id, campaign_id, model)`
- `(tenant_id, source_id, model)`
- `(tenant_id, revenue_event_id)`

### 7.5 Communication, Consent, and Frequency Capping

#### `crm_communication_events`

Purpose: Unified timeline for WhatsApp, SMS, email, call, push, and in-app communication.

Key columns:

- `id`
- `tenant_id`
- `identity_id`
- `lead_id`
- `contact_id`
- `campaign_id`
- `channel`
- `direction`
- `message_type`
- `template_id`
- `subject`
- `body_preview`
- `provider`
- `provider_message_id`
- `status`
- `sent_at`
- `delivered_at`
- `read_at`
- `clicked_at`
- `replied_at`
- `failed_at`
- `failure_reason`
- `owner_user_id`
- `metadata`
- `created_at`

Indexes:

- `(tenant_id, lead_id, created_at desc)`
- `(tenant_id, identity_id, created_at desc)`
- `(tenant_id, channel, status, created_at desc)`
- `(tenant_id, provider_message_id)`

#### `crm_consent_records`

Purpose: Consent by channel, purpose, identity, and source.

Key columns:

- `id`
- `tenant_id`
- `identity_id`
- `contact_id`
- `channel`
- `purpose`
- `status`
- `source`
- `captured_at`
- `expires_at`
- `withdrawn_at`
- `proof_ref`
- `captured_by`
- `metadata`
- `created_at`
- `updated_at`

Statuses:

- opted_in
- opted_out
- unknown
- revoked
- expired

Indexes:

- Unique current consent index on `(tenant_id, identity_id, channel, purpose)` where current.
- `(tenant_id, channel, status)`

#### `crm_frequency_counters`

Purpose: Enforce per-contact frequency caps.

Key columns:

- `id`
- `tenant_id`
- `identity_id`
- `channel`
- `purpose`
- `window_start`
- `window_end`
- `send_count`
- `last_sent_at`
- `updated_at`

Indexes:

- Unique `(tenant_id, identity_id, channel, purpose, window_start, window_end)`

### 7.6 Appointment, Visit, Procedure, Admission, and Revenue

#### `crm_appointment_links`

Purpose: Connect CRM leads to appointment system records.

Key columns:

- `id`
- `tenant_id`
- `lead_id`
- `identity_id`
- `appointment_id`
- `patient_id`
- `doctor_id`
- `hospital_id`
- `branch_id`
- `department_id`
- `service_line_id`
- `appointment_status`
- `scheduled_at`
- `confirmed_at`
- `cancelled_at`
- `no_show_at`
- `checked_in_at`
- `consulted_at`
- `source_system`
- `source_ref`
- `metadata`
- `created_at`
- `updated_at`

Indexes:

- `(tenant_id, lead_id)`
- `(tenant_id, appointment_id)`
- `(tenant_id, doctor_id, scheduled_at)`
- `(tenant_id, appointment_status, scheduled_at)`

#### `crm_visit_events`

Purpose: Actual patient journey events after appointment or walk-in.

Key columns:

- `id`
- `tenant_id`
- `lead_id`
- `identity_id`
- `appointment_link_id`
- `patient_id`
- `visit_id`
- `event_type`
- `event_at`
- `doctor_id`
- `hospital_id`
- `branch_id`
- `department_id`
- `service_line_id`
- `clinical_unit`
- `source_system`
- `source_ref`
- `metadata`
- `created_at`

Event types:

- checked_in
- consulted
- investigation_ordered
- lab_completed
- imaging_completed
- procedure_advised
- procedure_completed
- admission_advised
- admitted
- discharged
- followup_booked

Indexes:

- `(tenant_id, lead_id, event_at desc)`
- `(tenant_id, identity_id, event_at desc)`
- `(tenant_id, event_type, event_at desc)`
- `(tenant_id, doctor_id, event_at desc)`
- `(tenant_id, service_line_id, event_at desc)`

#### `crm_revenue_events`

Purpose: Billing and revenue facts used for attribution and dashboards.

Key columns:

- `id`
- `tenant_id`
- `lead_id`
- `identity_id`
- `appointment_link_id`
- `visit_event_id`
- `patient_id`
- `billing_id`
- `invoice_number`
- `revenue_event_type`
- `revenue_date`
- `gross_amount`
- `discount_amount`
- `net_amount`
- `paid_amount`
- `refund_amount`
- `outstanding_amount`
- `contribution_amount`
- `currency`
- `payer_type`
- `insurance_tpa_id`
- `doctor_id`
- `hospital_id`
- `branch_id`
- `department_id`
- `service_line_id`
- `procedure_code`
- `package_code`
- `source_system`
- `source_ref`
- `metadata`
- `created_at`
- `updated_at`

Indexes:

- `(tenant_id, revenue_date)`
- `(tenant_id, lead_id)`
- `(tenant_id, identity_id)`
- `(tenant_id, billing_id)`
- `(tenant_id, campaign_id)` should be available through attribution table, not direct only.
- `(tenant_id, doctor_id, revenue_date)`
- `(tenant_id, service_line_id, revenue_date)`
- `(tenant_id, hospital_id, branch_id, revenue_date)`

### 7.7 Assignment, SLA, Tasks, and Call Centre

#### `crm_assignment_rules`

Purpose: Configurable routing rules.

Key columns:

- `id`
- `tenant_id`
- `rule_name`
- `priority`
- `is_active`
- `conditions`
- `assignment_strategy`
- `target_user_ids`
- `target_team_ids`
- `fallback_user_id`
- `sla_rule_id`
- `created_by`
- `updated_by`
- `created_at`
- `updated_at`

Assignment strategies:

- round_robin
- least_loaded
- service_line_owner
- branch_owner
- doctor_coordinator
- fixed_user

#### `crm_lead_assignments`

Purpose: Assignment history.

Key columns:

- `id`
- `tenant_id`
- `lead_id`
- `assigned_from_user_id`
- `assigned_to_user_id`
- `assigned_team_id`
- `assignment_reason`
- `assignment_rule_id`
- `assigned_at`
- `accepted_at`
- `released_at`
- `created_at`

Indexes:

- `(tenant_id, lead_id, assigned_at desc)`
- `(tenant_id, assigned_to_user_id, assigned_at desc)`

#### `crm_sla_rules`

Purpose: SLA configuration.

Key columns:

- `id`
- `tenant_id`
- `name`
- `applies_to`
- `conditions`
- `first_response_minutes`
- `followup_minutes`
- `resolution_minutes`
- `escalation_policy`
- `business_hours_id`
- `is_active`
- `created_at`
- `updated_at`

#### `crm_sla_events`

Purpose: SLA tracking and breach history.

Key columns:

- `id`
- `tenant_id`
- `lead_id`
- `activity_id`
- `sla_rule_id`
- `sla_type`
- `due_at`
- `completed_at`
- `breached_at`
- `breach_minutes`
- `escalation_level`
- `escalated_to_user_id`
- `status`
- `metadata`
- `created_at`
- `updated_at`

Indexes:

- `(tenant_id, status, due_at)`
- `(tenant_id, lead_id)`
- `(tenant_id, breached_at)`

### 7.8 Marketing Finance, Budget, Vendor, and P&L

#### `crm_marketing_budgets`

Purpose: Planned budget by period, channel, campaign, branch, and service line.

Key columns:

- `id`
- `tenant_id`
- `period_type`
- `period_start`
- `period_end`
- `hospital_id`
- `branch_id`
- `service_line_id`
- `channel`
- `campaign_id`
- `budget_amount`
- `approved_amount`
- `owner_user_id`
- `approval_status`
- `created_by`
- `updated_by`
- `created_at`
- `updated_at`

#### `crm_campaign_costs`

Purpose: Actual spend and cost entries.

Key columns:

- `id`
- `tenant_id`
- `campaign_id`
- `source_id`
- `cost_type`
- `vendor_id`
- `cost_date`
- `amount`
- `currency`
- `invoice_ref`
- `external_spend_id`
- `is_imported`
- `metadata`
- `created_by`
- `created_at`

Cost types:

- ad_spend
- agency_fee
- creative_cost
- content_cost
- event_cost
- camp_cost
- vendor_bill
- internal_staff_cost

#### `crm_vendors`

Purpose: Vendor and agency master.

Key columns:

- `id`
- `tenant_id`
- `vendor_name`
- `vendor_type`
- `contact_name`
- `email`
- `phone`
- `gstin`
- `status`
- `metadata`
- `created_at`
- `updated_at`

### 7.9 Employee Performance, KRA/KPI, and Incentives

#### `crm_employee_profiles`

Purpose: CRM-specific employee master.

Key columns:

- `id`
- `tenant_id`
- `user_id`
- `employee_code`
- `designation`
- `department_id`
- `team_id`
- `manager_user_id`
- `hospital_id`
- `branch_id`
- `joining_date`
- `employment_status`
- `cost_centre`
- `salary_cost`
- `incentive_plan_id`
- `metadata`
- `created_at`
- `updated_at`

#### `crm_kpi_definitions`

Purpose: KPI master by role.

Key columns:

- `id`
- `tenant_id`
- `role_code`
- `kpi_code`
- `kpi_name`
- `kpi_type`
- `calculation_sql_key`
- `unit`
- `direction`
- `weight`
- `is_active`
- `created_at`
- `updated_at`

#### `crm_employee_targets`

Purpose: Targets by employee and period.

Key columns:

- `id`
- `tenant_id`
- `employee_profile_id`
- `kpi_definition_id`
- `period_start`
- `period_end`
- `target_value`
- `minimum_value`
- `stretch_value`
- `weight`
- `created_by`
- `approved_by`
- `created_at`
- `updated_at`

#### `crm_kpi_actuals`

Purpose: Computed actual performance.

Key columns:

- `id`
- `tenant_id`
- `employee_profile_id`
- `kpi_definition_id`
- `period_start`
- `period_end`
- `actual_value`
- `target_value`
- `achievement_pct`
- `score`
- `calculation_run_id`
- `calculated_at`
- `metadata`

#### `crm_incentive_payouts`

Purpose: Incentive calculation and approvals.

Key columns:

- `id`
- `tenant_id`
- `employee_profile_id`
- `period_start`
- `period_end`
- `gross_incentive`
- `adjustments`
- `net_incentive`
- `status`
- `approved_by`
- `approved_at`
- `paid_at`
- `metadata`
- `created_at`
- `updated_at`

### 7.10 Feedback, NPS, ORM, and Reputation

#### `crm_feedback_surveys`

Purpose: Survey definitions.

Key columns:

- `id`
- `tenant_id`
- `name`
- `survey_type`
- `trigger_event`
- `questions`
- `is_active`
- `created_at`
- `updated_at`

#### `crm_feedback_responses`

Purpose: Internal patient feedback and NPS responses.

Key columns:

- `id`
- `tenant_id`
- `identity_id`
- `lead_id`
- `appointment_link_id`
- `visit_event_id`
- `survey_id`
- `score`
- `nps_category`
- `comments`
- `response_channel`
- `received_at`
- `doctor_id`
- `hospital_id`
- `branch_id`
- `service_line_id`
- `metadata`
- `created_at`

#### `crm_reviews`

Purpose: External public review records.

Key columns:

- `id`
- `tenant_id`
- `identity_id`
- `platform`
- `external_review_id`
- `reviewer_name`
- `rating`
- `review_text`
- `sentiment`
- `severity`
- `topics`
- `doctor_id`
- `hospital_id`
- `branch_id`
- `service_line_id`
- `review_url`
- `reviewed_at`
- `response_status`
- `responded_at`
- `metadata`
- `created_at`
- `updated_at`

#### `crm_reputation_tasks`

Purpose: Workflow for complaints, negative reviews, and response approvals.

Key columns:

- `id`
- `tenant_id`
- `review_id`
- `feedback_response_id`
- `task_type`
- `priority`
- `status`
- `assigned_to_user_id`
- `due_at`
- `completed_at`
- `resolution_notes`
- `created_at`
- `updated_at`

### 7.11 Audit, Data Quality, and Integration State

#### `crm_audit_log`

Purpose: Complete audit trail.

Key columns:

- `id`
- `tenant_id`
- `entity_type`
- `entity_id`
- `event_type`
- `actor_user_id`
- `actor_role`
- `ip_address`
- `user_agent`
- `old_value`
- `new_value`
- `reason`
- `metadata`
- `created_at`

Indexes:

- `(tenant_id, entity_type, entity_id, created_at desc)`
- `(tenant_id, actor_user_id, created_at desc)`
- `(tenant_id, event_type, created_at desc)`

#### `crm_data_quality_issues`

Purpose: Track missing, invalid, duplicate, stale, or suspicious data.

Key columns:

- `id`
- `tenant_id`
- `entity_type`
- `entity_id`
- `issue_type`
- `severity`
- `field_name`
- `current_value`
- `recommended_value`
- `status`
- `detected_at`
- `resolved_at`
- `resolved_by`
- `metadata`

#### `crm_integration_runs`

Purpose: Track sync jobs from Google, Meta, WhatsApp, HIS, billing, etc.

Key columns:

- `id`
- `tenant_id`
- `integration_name`
- `run_type`
- `status`
- `started_at`
- `completed_at`
- `records_seen`
- `records_created`
- `records_updated`
- `records_failed`
- `last_cursor`
- `error_summary`
- `metadata`

#### `crm_integration_errors`

Purpose: Retryable dead-letter table.

Key columns:

- `id`
- `tenant_id`
- `integration_run_id`
- `integration_name`
- `entity_type`
- `external_ref`
- `payload`
- `error_code`
- `error_message`
- `retry_count`
- `next_retry_at`
- `status`
- `created_at`
- `updated_at`

## 8. Analytics Marts and Materialized Views

Dashboards should use analytics tables or materialized views.

Recommended marts:

### 8.1 `crm_daily_funnel_mart`

Grain:

- Date.
- Tenant.
- Hospital.
- Branch.
- Department.
- Service line.
- Doctor.
- Source.
- Campaign.
- Owner/team.

Metrics:

- Leads created.
- Contacted.
- Qualified.
- Appointment requested.
- Appointment booked.
- Appointment confirmed.
- No-show.
- Visited.
- Consulted.
- Procedure advised.
- Admission advised.
- Billing completed.
- Won.
- Lost.
- Conversion rates.
- Average time to first response.
- Average time to appointment.

### 8.2 `crm_campaign_performance_mart`

Metrics:

- Spend.
- Impressions.
- Clicks.
- Sessions.
- Leads.
- Qualified leads.
- Appointments.
- Visits.
- Revenue.
- Contribution.
- CPL.
- CPQL.
- CPA.
- CAC.
- ROAS.

### 8.3 `crm_employee_performance_mart`

Metrics:

- Leads assigned.
- Leads contacted.
- Contact rate.
- SLA breaches.
- Follow-ups completed.
- Appointments booked.
- Visit conversion.
- Revenue attributed.
- Productivity score.

### 8.4 `crm_doctor_service_line_mart`

Metrics:

- Leads by doctor/service line.
- Appointments.
- Visits.
- Conversion.
- Revenue.
- No-show.
- Patient feedback.
- Rating/NPS.

### 8.5 `crm_reputation_mart`

Metrics:

- Reviews.
- Average rating.
- NPS.
- Sentiment.
- Topic trends.
- Response SLA.
- Critical complaints.
- Doctor/hospital reputation score.

## 9. Migration Phases

### DB Phase 0: Inventory and Safety

Timeline: 3-5 days

Tasks:

- Export current CRM table schemas.
- Confirm exact user, patient, appointment, hospital, doctor, billing, lab, pharmacy, TPA table names.
- Identify tenant and organization keys used across the repository.
- Create ERD for current CRM and target CRM.
- Add migration naming convention.
- Add rollback strategy for each migration.

Deliverables:

- Current schema inventory.
- Target ERD.
- Migration dependency map.
- Rollback plan.

Acceptance criteria:

- No CRM migration begins until current source tables and keys are confirmed.

### DB Phase 1: Core Identity and Hospital Lead Model

Timeline: 1-2 weeks

Tables:

- `crm_org_units`
- `crm_person_identities`
- `crm_identity_keys`
- `crm_contacts_v2`
- `crm_source_taxonomy`
- `crm_leads_v2`
- `crm_funnel_events`

Tasks:

- Create additive migrations.
- Backfill `crm_contacts_v2` from `crm_contacts`.
- Backfill `crm_leads_v2` from `crm_leads`.
- Create identity keys from phone, email, legacy lead ID, and Facebook lead ID.
- Add compatibility views for old screens if needed.

Acceptance criteria:

- Every existing CRM lead has a v2 lead row.
- Every v2 lead has a source taxonomy row or a data-quality issue.
- Phone/email identity matching works for existing leads.

### DB Phase 2: Assignment, SLA, Communication, and Consent

Timeline: 1-2 weeks

Tables:

- `crm_assignment_rules`
- `crm_lead_assignments`
- `crm_sla_rules`
- `crm_sla_events`
- `crm_communication_events`
- `crm_consent_records`
- `crm_frequency_counters`
- `crm_data_quality_issues`
- `crm_audit_log`

Tasks:

- Backfill communication events from `crm_activities`, `crm_marketing_events`, `crm_email_inbox`, and WhatsApp logs where available.
- Add initial consent records from email suppressions and known WhatsApp opt-in/out data.
- Add SLA rules for first response and follow-up.
- Add audit triggers or application-level audit writes.

Acceptance criteria:

- Lead detail timeline can be generated from communication and funnel events.
- SLA queue can be computed from database state.
- Consent checks can be performed before message send.

### DB Phase 3: Appointment, Visit, and Revenue Linkage

Timeline: 2-3 weeks

Tables:

- `crm_appointment_links`
- `crm_visit_events`
- `crm_revenue_events`

Tasks:

- Map existing appointment table IDs into CRM links.
- Identify patient ID matching logic.
- Create import adapter for billing if direct billing API is not available.
- Backfill appointment links for CRM leads where phone/email/patient matches.
- Add revenue events for test/imported billing records.

Acceptance criteria:

- At least one full path can be represented: lead -> appointment -> visit -> billing -> revenue.
- Revenue can be grouped by campaign/source/service line/doctor/branch.

### DB Phase 4: Campaigns, Costs, and Attribution

Timeline: 2-3 weeks

Tables:

- `crm_campaigns_unified`
- `crm_touchpoints`
- `crm_campaign_costs`
- `crm_vendors`
- `crm_attribution_results`
- `crm_integration_runs`
- `crm_integration_errors`

Tasks:

- Backfill unified campaigns from email campaigns and Facebook lead data.
- Import or manually enter campaign costs.
- Store Google/Meta/GA4/Search Console data in touchpoints or integration staging tables.
- Implement attribution calculation runs.

Acceptance criteria:

- Campaign-level CPL, CPQL, CPA, CAC, and ROAS can be calculated.
- Attribution results can be traced back to touchpoints and revenue events.

### DB Phase 5: People Performance

Timeline: 1-2 weeks

Tables:

- `crm_employee_profiles`
- `crm_kpi_definitions`
- `crm_employee_targets`
- `crm_kpi_actuals`
- `crm_incentive_payouts`

Tasks:

- Backfill CRM employee profiles from users/team/admin records.
- Define KPI calculations by role.
- Add target rows for current month.
- Create KPI calculation job.

Acceptance criteria:

- Employee performance dashboard can show target, actual, achievement, and score.

### DB Phase 6: Reputation and Patient Experience

Timeline: 2-3 weeks

Tables:

- `crm_feedback_surveys`
- `crm_feedback_responses`
- `crm_reviews`
- `crm_reputation_tasks`

Tasks:

- Add internal NPS/feedback storage.
- Add external review import path.
- Link reviews/feedback to identity, doctor, branch, and service line.
- Add task creation for negative/critical feedback.

Acceptance criteria:

- Review and NPS dashboards can be generated.
- Negative feedback creates an auditable task.

### DB Phase 7: Analytics Marts and Governance

Timeline: 2-4 weeks

Objects:

- `crm_daily_funnel_mart`
- `crm_campaign_performance_mart`
- `crm_employee_performance_mart`
- `crm_doctor_service_line_mart`
- `crm_reputation_mart`
- Refresh jobs.
- Dashboard read APIs.

Tasks:

- Build scheduled mart refresh.
- Add reconciliation checks.
- Add dashboard query indexes.
- Add export control logging.
- Add data retention policies.

Acceptance criteria:

- Dashboards use marts, not heavy joins over operational tables.
- Numbers reconcile with source event counts.
- Refresh failures are visible in integration run logs.

## 10. Migration Order

Recommended order:

1. `crm_org_units`
2. `crm_person_identities`
3. `crm_identity_keys`
4. `crm_contacts_v2`
5. `crm_source_taxonomy`
6. `crm_campaigns_unified`
7. `crm_leads_v2`
8. `crm_funnel_events`
9. `crm_assignment_rules`
10. `crm_lead_assignments`
11. `crm_sla_rules`
12. `crm_sla_events`
13. `crm_consent_records`
14. `crm_frequency_counters`
15. `crm_communication_events`
16. `crm_appointment_links`
17. `crm_visit_events`
18. `crm_revenue_events`
19. `crm_campaign_costs`
20. `crm_vendors`
21. `crm_touchpoints`
22. `crm_attribution_results`
23. `crm_employee_profiles`
24. `crm_kpi_definitions`
25. `crm_employee_targets`
26. `crm_kpi_actuals`
27. `crm_incentive_payouts`
28. `crm_feedback_surveys`
29. `crm_feedback_responses`
30. `crm_reviews`
31. `crm_reputation_tasks`
32. `crm_audit_log`
33. `crm_data_quality_issues`
34. `crm_integration_runs`
35. `crm_integration_errors`
36. Analytics marts and materialized views.

## 11. Backfill Plan

### 11.1 Backfill Leads

Source:

- `crm_leads`

Target:

- `crm_person_identities`
- `crm_identity_keys`
- `crm_contacts_v2`
- `crm_leads_v2`
- `crm_funnel_events`

Rules:

- Normalize phone to E.164 where possible.
- Normalize email to lowercase/citext.
- Use `custom_fields->>'leadgen_id'` as an identity key when present.
- Map old lead status:
  - `new` -> `new`
  - `contacted` -> `contacted`
  - `qualified` -> `qualified`
  - `converted` -> `won`
  - `lost` -> `lost`
- Create one `lead_created` funnel event for every legacy lead.
- Create one `stage_changed` event if current status is not `new`.

### 11.2 Backfill Campaigns

Sources:

- `crm_marketing_campaigns`
- Facebook lead metadata in `crm_leads.custom_fields`

Targets:

- `crm_campaigns_unified`
- `crm_touchpoints`

Rules:

- Email campaigns become unified campaigns with channel `email`.
- Facebook lead campaign IDs become unified campaign records with channel `paid_social`.
- Preserve old IDs in `legacy_email_campaign_id` or `external_campaign_id`.

### 11.3 Backfill Communication

Sources:

- `crm_activities`
- `crm_email_inbox`
- `crm_marketing_events`
- WhatsApp message/session logs where available.

Target:

- `crm_communication_events`
- `crm_touchpoints`

Rules:

- Calls, emails, meetings, and system activities should appear in the unified lead timeline.
- Marketing email events should also create touchpoints for attribution.
- WhatsApp inbound/outbound messages should link by normalized phone.

### 11.4 Backfill Appointments and Revenue

Sources:

- Existing appointments table.
- Existing billing/payment/invoice tables or imported billing CSV.

Targets:

- `crm_appointment_links`
- `crm_visit_events`
- `crm_revenue_events`

Rules:

- Match by patient ID first.
- If patient ID is unavailable, match by normalized phone/email and date window.
- Mark uncertain matches with confidence in `metadata`.
- Do not use low-confidence matches for financial reporting until reviewed.

## 12. Data Quality Rules

Minimum rules:

- Lead must have at least one reachable contact method: phone, email, WhatsApp ID, or walk-in marker.
- Lead must have a normalized source.
- Open lead must have owner or queue assignment.
- Open lead must have next action or SLA event.
- Appointment-linked lead must have appointment ID.
- Revenue-linked lead must have identity ID and source attribution status.
- Marketing send must have valid consent or documented permitted purpose.
- Duplicate candidate must be generated when phone/email matches an active lead within the configured window.

## 13. Security and Compliance

### 13.1 Sensitive Fields

Treat these as sensitive:

- Phone.
- Email.
- Patient ID.
- Treatment interest.
- Symptoms or medical need.
- Appointment history.
- Visit/procedure/admission data.
- Revenue and payer data.
- Feedback/reviews if tied to identity.

### 13.2 Access Controls

Database design should support:

- Tenant isolation.
- Hospital/branch-level access.
- Team-level queue access.
- Doctor/service-line coordinator access.
- Finance-only revenue fields.
- Marketing-only campaign spend and performance fields.
- Audit log for export and sensitive field views.

### 13.3 Audit Requirements

Audit these actions:

- Lead create/update/delete/merge.
- Stage change.
- Assignment change.
- Consent change.
- Message send.
- Bulk campaign send.
- Data export.
- Revenue event import/change.
- KPI target change.
- Incentive approval.
- Review response approval.

## 14. Indexing and Performance

Add indexes around common query paths:

- Lead queue by owner, status, stage, next follow-up.
- Funnel analytics by date, service line, branch, campaign, source.
- Communication timeline by lead and identity.
- Attribution by campaign, source, revenue event.
- Revenue by date, doctor, service line, branch.
- SLA queue by due date and status.
- Campaign analytics by campaign and event date.

For analytics:

- Use materialized views or mart tables.
- Refresh incrementally where possible.
- Keep dashboard APIs off raw event joins when data volume grows.

## 15. Open Questions Before Migration

These must be confirmed before writing production migrations:

1. What is the canonical users table: `users`, `"Users"`, or both?
2. What is the canonical tenant identifier and type?
3. What is the canonical hospital/branch table and ID strategy?
4. What appointment table is production authoritative?
5. What patient table is production authoritative?
6. What billing/payment/invoice table is production authoritative?
7. Are CRM tables expected to use Prisma migrations, SQL migrations, or route-level DDL?
8. Should old CRM route-level `CREATE TABLE IF NOT EXISTS` DDL be removed after formal migrations exist?
9. What WhatsApp tables/logs are canonical for inbound/outbound status?
10. Which integrations are available by API versus CSV import?

## 16. DB-First Acceptance Criteria

Before major UI implementation begins:

- The v2 schema exists through formal migrations.
- Existing leads are backfilled into `crm_leads_v2`.
- Identity graph works for phone/email.
- Funnel events are generated for existing leads.
- Communication timeline can be queried from the database.
- Appointment linkage can be represented.
- Revenue events can be imported or linked.
- Source taxonomy is populated.
- Unified campaign records exist for existing email campaigns and Facebook campaign IDs.
- Consent checks are possible.
- SLA queue can be computed.
- Audit log records sensitive actions.
- Dashboard marts have at least one refresh path.

## 17. Recommended Immediate Next Step

Run a read-only schema inventory and create the first formal migration set for:

- `crm_org_units`
- `crm_person_identities`
- `crm_identity_keys`
- `crm_contacts_v2`
- `crm_source_taxonomy`
- `crm_campaigns_unified`
- `crm_leads_v2`
- `crm_funnel_events`

These tables create the foundation for the rest of the world-class CRM work. Once they are in place, the product can safely build CRM-native WhatsApp, SLA queue, appointment linkage, attribution, and dashboards without repeatedly reshaping the core data model.
