# CRM test-report remediation — 24 October 2026

The supplied report contains 85 findings: 20 Fail, 26 Partial, and 39 Pass. This register maps all findings to the current implementation. “Addressed in code” is not a claim that app.mediqzy.com has been deployed or retested.

## Verification

- Production frontend build: passed (`npm run build --prefix client`). Existing third-party browser-externalization and bundle-size warnings remain.
- Frontend: 29 tests passed across CRMReportFixes, CRMContactCenterPage, and CRMChannelSettings.
- Backend: 14 tests passed across intelligence, core schema, and social-content suites.
- Disposable PostgreSQL: 27 checks passed. These execute scope-filtered SQL with two organizations, blocked foreign reads/updates, validation edge cases, repeated migrations, historical contact/lead linking, import backfills, and completed activity/audit persistence.
- The full repository TypeScript check reports existing errors across unrelated modules. The final run reported no diagnostics for the changed CRM frontend files; it is not a clean repository-wide typecheck.
- The existing CRM extensions schema suite fails because crmEmail and underwriting routes still contain runtime DDL. Those pre-existing DDL paths are outside this report's behavioral fixes; the new AI scope helper and core routes contain no runtime DDL.
- No live organization records, credentials, messaging configuration, outbound messages, or calls were changed or exercised. All database fixtures used a disposable PostgreSQL cluster bound to 127.0.0.1:55490.

## Rollout and remaining verification

Apply `server/migrations/20261024000000-crm-report-remediation.migration.js` through the normal deployment environment **before deploying the new API**. It adds CRM contact links, backfills deal contacts and unambiguous email-based lead links, restores missing mirrored ownership/identity, and connects imported list members only where their owner's explicit tenant relationship can be resolved. It is registered in both migration runners and tested for repeat execution.

The migration does not delete duplicate leads, remove developer-labelled records, guess owners for unowned historical imports, or import browser-local lab fixtures. Marketing tables that lack organization ownership columns are restricted to their creator; a future organization-wide sharing policy needs an explicit ownership migration. Unknown specialty measurements remain unavailable until source data exists.

After deployment, rerun the supplied workflow under CRM Admin plus a second organization. Verify that one organization's IDs cannot be read, updated, scored, used in activity/deal references, or accessed through nested marketing URLs by the other. Reconcile finding 29 with the deployed lab booking source: persisted API bookings are integrated; local-storage appointments in LabModulePages are not persisted booking events. Live social, email, WhatsApp, SMS, and calling integrations still require their configured-provider UAT.

## Reproducing the database checks

Run as an unprivileged local development user. The test uses a fresh database on a disposable local server, never the application database environment variables.

```bash
CRM_QA_DIR=$(mktemp -d /tmp/mediqzy-crm-qa.XXXXXX)
/usr/lib/postgresql/16/bin/initdb -D "$CRM_QA_DIR" -A trust --no-locale
/usr/lib/postgresql/16/bin/pg_ctl -D "$CRM_QA_DIR" -l "$CRM_QA_DIR/postgres.log" -o '-p 55490 -h 127.0.0.1' start
node server/scripts/qa/crm-report-isolation.mjs
/usr/lib/postgresql/16/bin/pg_ctl -D "$CRM_QA_DIR" stop
```

## Finding register

| # | Original | Finding | Implementation / evidence |
|---|---|---|---|
| 1 | Fail | Report finding 1 | Copilot queries enforce organization scope. Pipeline Summary uses deterministic counts and names of current deals; forecast uses the full scoped deal set. |
| 2 | Fail | Report finding 2 | AI Insights uses the same tenant-scoped legacy lead set as Leads; entity-specific reads and score writes are scoped too. |
| 3 | Fail | Report finding 3 | Team users are deduplicated; employee-profile joins select one record; managers with reports are excluded from Unassigned; zero metrics render empty bars. |
| 4 | Fail | Report finding 4 | Team performance includes scoped field leads and visits. Field leads already represented in CRM are excluded from the additional lead total. |
| 5 | Fail | Report finding 5 | Lead creation checks normalized email and phone within the tenant and returns a visible 409 duplicate message. |
| 6 | Fail | Report finding 6 | Save buttons lock immediately with a ref and pending state. Tenant advisory locks serialize duplicate checking and creation in one transaction. |
| 7 | Fail | Report finding 7 | Lead detail offers Convert to deal. Saving links the lead, marks it converted, and synchronizes its v2 record atomically. |
| 8 | Fail | Report finding 8 | Deal forms have lead and contact pickers and prefill contact details. Foreign references are checked against the authenticated tenant. |
| 9 | Fail | Report finding 9 | Frontend and backend reject negative or non-finite deal values. |
| 10 | Fail | Report finding 10 | New open deals reject an expected close date before today; existing historical records remain editable. |
| 11 | Fail | Report finding 11 | Pipeline stage summaries open the corresponding filtered deal list; individual cards open a scoped deal detail form. |
| 12 | Fail | Report finding 12 | Dashboard explicitly labels the probability-weighted amount as weighted pipeline. |
| 13 | Fail | Report finding 13 | Funnel badges show each status as a share of all leads, with no misleading down-arrow. Lead-to-deal conversion uses all leads as denominator. Deal creation links leads and saves contacts. |
| 14 | Fail | Report finding 14 | Deal contact details create or reuse a scoped CRM contact and persist the contact link. Migration backfills historical deal contacts. |
| 15 | Fail | Report finding 15 | Activity form can select a lead, deal, or contact; API validates and persists those links. |
| 16 | Fail | Report finding 16 | Marketing lists and nested routes enforce creator ownership. Imports create/reuse scoped CRM contacts, including on repeat imports. Migration links historical list members when the owner has an explicit tenant relationship. |
| 17 | Fail | Report finding 17 | Suppression email validation rejects commas and separators, including CSV import validation. |
| 18 | Fail | Report finding 18 | Forecast uses saved probability, including zero; stage predictions no longer overwrite it. Bulk lead scores and health counts use consistent rules, rather than invented model scores. |
| 19 | Fail | Report finding 19 | Profile displays the authoritative CRM role. Backend no longer invents Sales Representative / Sales defaults. |
| 20 | Fail | Report finding 20 | Scans and visible lead issues align with CRM Leads. Governance exposes legacy record links and readable field names. Identity checks recognize person_id; repaired issues are resolved on rescan. |
| 21 | Partial | Report finding 21 | Node types use readable labels while preserving stored machine codes. |
| 22 | Partial | Report finding 22 | Social trigger/channel/category options have readable labels; locale input explains the language code. |
| 23 | Partial | Report finding 23 | Calendar highlights today, disables past-day creation, and chooses a future time for today. API rejects new or changed backdated plans while allowing caption-only corrections to historical drafts. |
| 24 | Partial | Report finding 24 | Zero-count funnel and pipeline bars have zero width; empty funnels have no percentage badges. |
| 25 | Partial | Report finding 25 | Telephone dialing requires a configured provider and an available assigned agent. Browser-call configuration is explicitly distinguished from telephone setup. |
| 26 | Partial | Report finding 26 | Competitor wording is removed; rupee revenue uses the Indian Rupee icon. |
| 27 | Partial | Report finding 27 | Nurture enrollment uses the shared lead search picker and its resolved v2 ID. |
| 28 | Partial | Report finding 28 | Specialty KPIs show available measured lead, appointment, and revenue values. Unavailable measurements show an explicit dash instead of fabricated values. |
| 29 | Partial | Report finding 29 | Diagnostic totals include persisted api_lab_bookings using tenant_uid, with source-reference deduplication. Repeated totals are replaced with conversion rates, and rupee icons are corrected. Browser-local lab appointment drafts are not server bookings; deployed source reconciliation is still required. |
| 30 | Partial | Report finding 30 | Content workflow links to the native content calendar to create content. |
| 31 | Partial | Report finding 31 | Consent defaults to Unknown, requiring an explicit opt-in decision. Channel options use readable labels. |
| 32 | Partial | Report finding 32 | Touchpoint capture uses a campaign selector populated from the scoped dashboard. |
| 33 | Partial | Report finding 33 | Feedback and rating fields start empty, are required, and state their 0–10 / 1–5 ranges; review platform labels are readable. |
| 34 | Partial | Report finding 34 | Header explains active / total team counts; duplicate members are removed, fixture suffixes are stripped from display, and missing departments say Not assigned. |
| 35 | Partial | Report finding 35 | Governance has a capability-gated, tenant-scoped audit-log endpoint and viewer. |
| 36 | Partial | Report finding 36 | Lead rows display both email and phone; status and priority labels are capitalized. |
| 37 | Partial | Report finding 37 | Lead details already existed in this checkout. Corrected context resolution to use the session tenant and reject foreign lead IDs, enabling the search drawer and shared picker. |
| 38 | Partial | Report finding 38 | Deal form shows inline errors for email, value, probability, missing title, past close dates, and server failures. |
| 39 | Partial | Report finding 39 | Pipeline includes real deal cards, stage filtering, drag/drop moves, accessible stage selectors, and Won/Lost columns. |
| 40 | Partial | Report finding 40 | Lead, deal, and contact creation/updates write completed system activities and audit records in the same transaction. |
| 41 | Partial | Report finding 41 | Saving a past-scheduled activity requires an explicit warning confirmation in the UI; historical activity logging remains possible. |
| 42 | Partial | Report finding 42 | Email Inbox is wrapped in CRMLayout, restoring navigation and shared chrome. |
| 43 | Partial | Report finding 43 | List creation/detail retained; ownership guards and contact linking also apply to list access and imports. |
| 44 | Partial | Report finding 44 | Template editor includes a visual message field and retains HTML source editing and the sandboxed preview already present in this checkout. |
| 45 | Partial | Report finding 45 | Untouched new leads are capped below Hot. System creation notes are not engagement. Bulk scores are deterministic and do not invent a Demo action. |
| 46 | Partial | Report finding 46 | Reports distinguish lead stages from all seven deal stages, including Discovery, and support CSV export. Revenue/team/deal aggregates are tenant-scoped. |
| 47 | Pass | Report finding 47 | Passed in the supplied report. Retained as a rollout regression case; no live retest is claimed. |
| 48 | Pass | Report finding 48 | Passed in the supplied report. Retained as a rollout regression case; no live retest is claimed. |
| 49 | Pass | Report finding 49 | Passed in the supplied report. Retained as a rollout regression case; no live retest is claimed. |
| 50 | Pass | Report finding 50 | Passed in the supplied report. Retained as a rollout regression case; no live retest is claimed. |
| 51 | Pass | Report finding 51 | Passed in the supplied report. Retained as a rollout regression case; no live retest is claimed. |
| 52 | Pass | Report finding 52 | Passed in the supplied report. Retained as a rollout regression case; no live retest is claimed. |
| 53 | Pass | Report finding 53 | Passed in the supplied report. Retained as a rollout regression case; no live retest is claimed. |
| 54 | Pass | Report finding 54 | Passed in the supplied report. Retained as a rollout regression case; no live retest is claimed. |
| 55 | Pass | Report finding 55 | Passed in the supplied report. Retained as a rollout regression case; no live retest is claimed. |
| 56 | Pass | Report finding 56 | Passed in the supplied report. Retained as a rollout regression case; no live retest is claimed. |
| 57 | Pass | Report finding 57 | Passed in the supplied report. Retained as a rollout regression case; no live retest is claimed. |
| 58 | Pass | Report finding 58 | Passed in the supplied report. Retained as a rollout regression case; no live retest is claimed. |
| 59 | Pass | Report finding 59 | Passed in the supplied report. Retained as a rollout regression case; no live retest is claimed. |
| 60 | Pass | Report finding 60 | Passed in the supplied report. Retained as a rollout regression case; no live retest is claimed. |
| 61 | Pass | Report finding 61 | Passed in the supplied report. Retained as a rollout regression case; no live retest is claimed. |
| 62 | Pass | Report finding 62 | Passed in the supplied report. Retained as a rollout regression case; no live retest is claimed. |
| 63 | Pass | Report finding 63 | Passed in the supplied report. Retained as a rollout regression case; no live retest is claimed. |
| 64 | Pass | Report finding 64 | Passed in the supplied report. Retained as a rollout regression case; no live retest is claimed. |
| 65 | Pass | Report finding 65 | Passed in the supplied report. Retained as a rollout regression case; no live retest is claimed. |
| 66 | Pass | Report finding 66 | Passed in the supplied report. Retained as a rollout regression case; no live retest is claimed. |
| 67 | Pass | Report finding 67 | Passed in the supplied report. Retained as a rollout regression case; no live retest is claimed. |
| 68 | Pass | Report finding 68 | Passed in the supplied report. Retained as a rollout regression case; no live retest is claimed. |
| 69 | Pass | Report finding 69 | Passed in the supplied report. Retained as a rollout regression case; no live retest is claimed. |
| 70 | Pass | Report finding 70 | Passed in the supplied report. Retained as a rollout regression case; no live retest is claimed. |
| 71 | Pass | Report finding 71 | Passed in the supplied report. Retained as a rollout regression case; no live retest is claimed. |
| 72 | Pass | Report finding 72 | Passed in the supplied report. Retained as a rollout regression case; no live retest is claimed. |
| 73 | Pass | Report finding 73 | Passed in the supplied report. Retained as a rollout regression case; no live retest is claimed. |
| 74 | Pass | Report finding 74 | Passed in the supplied report. Retained as a rollout regression case; no live retest is claimed. |
| 75 | Pass | Report finding 75 | Passed in the supplied report. Retained as a rollout regression case; no live retest is claimed. |
| 76 | Pass | Report finding 76 | Passed in the supplied report. Retained as a rollout regression case; no live retest is claimed. |
| 77 | Pass | Report finding 77 | Passed in the supplied report. Retained as a rollout regression case; no live retest is claimed. |
| 78 | Pass | Report finding 78 | Passed in the supplied report. Retained as a rollout regression case; no live retest is claimed. |
| 79 | Pass | Report finding 79 | Passed in the supplied report. Retained as a rollout regression case; no live retest is claimed. |
| 80 | Pass | Report finding 80 | Passed in the supplied report. Retained as a rollout regression case; no live retest is claimed. |
| 81 | Pass | Report finding 81 | Passed in the supplied report. Retained as a rollout regression case; no live retest is claimed. |
| 82 | Pass | Report finding 82 | Passed in the supplied report. Retained as a rollout regression case; no live retest is claimed. |
| 83 | Pass | Report finding 83 | Passed in the supplied report. Retained as a rollout regression case; no live retest is claimed. |
| 84 | Pass | Report finding 84 | Passed in the supplied report. Retained as a rollout regression case; no live retest is claimed. |
| 85 | Pass | Report finding 85 | Passed in the supplied report. Retained as a rollout regression case; no live retest is claimed. |
