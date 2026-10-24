# CRM failure retest, sanity and smoke — 24 October 2026

**All 20 original Fail findings passed retesting after two newly discovered write-path regressions were fixed and deployed (`d6793919`).** The broader backend suite is not fully green: two schema-governance checks remain failing.

## Results

| Check | Result |
|---|---|
| Original 20 Fail findings | 20 pass / 0 fail; evidence layers listed below |
| All 46 Fail/Partial findings | 42 reported-defect checks pass; 4 provider/data workflows remain partial |
| Canonical sanity/smoke runner | GO on the final stable run |
| Portal routing sanity | All passed |
| CRM frontend | 79 tests / 8 suites passed |
| CRM + contact-center backend | 160 tests passed; 2 failed / 162 total |
| HTTP write/concurrency/import workflows | 17 tests passed within the backend total |
| Separate isolated PostgreSQL checks | 27 passed |
| Visible CRM page smoke | 35 / 35 passed; no page, API or asset errors |
| Report-specific live UI checks | 27 passed; preview/export and empty team bars checked additionally |
| Public API smoke / access denial / data consistency | 21 / 7 / 13 passed |
| Entity UID verifier | 0 violations; existing missing-twin warning remains |

## Fixes discovered by this retest

1. A valid deal with contact details returned 500 because PostgreSQL could not infer a reused parameter type in the contact INSERT SELECT. Explicit casts fixed it. Real HTTP tests now verify atomic deal creation, contact persistence, lead conversion, zero probability, activity/audit history, and weighted totals.
2. CSV imports were routed through XLSX ZIP parsing. The upload path now explicitly parses CSV, handles quoted values, preserves XLSX compatibility, rejects invalid email rows, repairs repeat-import links, and returns a clear 400 for malformed uploads.

Both fixes are pushed to `main`, deployed to the API, and followed by healthy public API, denial and data-consistency probes. Frontend production assets did not change.

## Remaining failures and limits

- `crm-extensions-schema.test.js`: runtime DDL remains in email/underwriting routes.
- `crm-campaigns-schema.test.js`: runtime DDL remains in the campaign route.
- Findings 22, 25 and 27: UI/configuration checks pass; real social/messaging/calling/nurture execution was intentionally not performed.
- Finding 29: persisted booking aggregates match their source tables; positive lab ingestion and browser-local appointment reconciliation are still unverified.
- The earlier full-repository TypeScript failures were not closed by this runtime test work.

The canonical runner was executed in an isolated checkout, preserving the pre-existing working-tree sanity report. One run during API reload saw transient 502 responses; the stable rerun returned GO. Write workflows ran in disposable local PostgreSQL, with synthetic auth and external send/storage adapters disabled. Live checks did not create production business fixtures or send messages/calls. Pass means the reported defect was verified in the stated layer, not that every provider workflow was exercised.

## Finding-by-finding evidence

| # | Finding | Result | Evidence |
|---|---|---|---|
| 1 | Copilot pipeline summary | PASS | Live API/data comparison: Copilot count/source totals and Pipeline Summary use visible records |
| 2 | AI hidden leads | PASS | Live API/data comparison: AI lead IDs are a subset of visible CRM leads |
| 3 | Team hierarchy and empty bars | PASS | Live API/data comparison: Team members are unique and managers do not recur under Unassigned; Live team progress bars: Zero-metric team groups use empty progress bars |
| 4 | Smart-Force counts | PASS | Live API/data comparison: Field lead/visit counts match scoped source records in the same period |
| 5 | Duplicate lead detection | PASS | Isolated HTTP: concurrent email/phone duplicate requests return one 201 plus 409; normalized phone duplicate is rejected. |
| 6 | Create double-click protection | PASS | Frontend pending-state double-click test plus real PostgreSQL concurrent HTTP submissions. |
| 7 | Lead-to-deal conversion | PASS | Live browser: Lead detail opens from search URL and exposes Convert to deal; Isolated HTTP: linked deal converts its lead; live detail exposes the conversion action. |
| 8 | Deal lead/contact selection | PASS | Live browser: New Deal provides existing lead and contact selectors; Isolated HTTP: stored lead/contact associations; live form pickers. |
| 9 | Negative deal values | PASS | Live browser: Negative deal value shows inline validation and makes no write request; Isolated HTTP 400 and live inline validation; no production write attempted. |
| 10 | Past close dates | PASS | Live browser: Past expected close shows inline validation and makes no write request; Isolated HTTP 400 and live inline past-date validation. |
| 11 | Pipeline stage click | PASS | Live browser: Pipeline renders deal cards and Won/Lost stages and stage click filters deals |
| 12 | Weighted pipeline labels | PASS | Live API/data comparison: Saved weighted deal value agrees across dashboard, pipeline, AI and Copilot; Live browser: Dashboard clearly labels weighted pipeline and funnel badges have no drop arrows |
| 13 | Funnel/contact consistency | PASS | Live API/data comparison: Linked deals resolve to visible leads and persisted visible contacts; Live browser: Dashboard clearly labels weighted pipeline and funnel badges have no drop arrows |
| 14 | Deal contacts persisted | PASS | Live API/data comparison: Linked deals resolve to visible leads and persisted visible contacts; Isolated HTTP: deal contact is persisted and contact_id resolves; existing live links checked. |
| 15 | Activity record links | PASS | Live browser: Activity form selects lead, deal and contact; Isolated HTTP activity links to lead, deal and contact; live pickers checked. |
| 16 | List member ownership/linkage | PASS | Live API/data comparison: Visible marketing lists obey creator ownership and members resolve to CRM records; Isolated HTTP: CSV imports create scoped contacts; repeat imports repair links without duplication; foreign list access denied. |
| 17 | Suppression email validation | PASS | Isolated HTTP: trailing-comma email returns 400 and suppression table stays empty. |
| 18 | AI forecast and hot counts | PASS | Live API/data comparison: Saved weighted deal value agrees across dashboard, pipeline, AI and Copilot |
| 19 | Profile role consistency | PASS | Live API/data comparison: Profile and team use the same authoritative CRM role |
| 20 | Governance issue scope and repair links | PASS | Live API/data comparison: Governance issue links stay within visible leads and audit log is accessible |
| 21 | Flow node labels | PASS | Live browser: Flow palette uses readable node labels |
| 22 | Social dropdown labels | PARTIAL | Live browser: Social dropdowns show readable labels while preserving machine values LIMIT: Provider connections, Instagram/WhatsApp actions and real message delivery were not exercised; readable UI options passed. |
| 23 | Calendar past dates and today | PASS | Live browser: Calendar highlights today and disables create buttons on past dates |
| 24 | Empty funnel display | PASS | Live browser: Dashboard clearly labels weighted pipeline and funnel badges have no drop arrows; Frontend empty-data fixture: all five funnel bars have width 0%, with no percentage/drop badges. |
| 25 | Contact-center calling readiness | PARTIAL | Live browser: Calling stays disabled without an available assigned agent LIMIT: Unconfigured calling correctly stays disabled. No real telephone call or provider media session was placed. |
| 26 | Growth branding and currency | PASS | Live browser: Growth branding is clean and nurture enrollment searches leads rather than typing IDs |
| 27 | Nurture enrollment lead picker | PARTIAL | Live browser: Growth branding is clean and nurture enrollment searches leads rather than typing IDs LIMIT: Lead picker and resolved context were checked. Enrollment that could trigger WhatsApp/SMS/email was not performed. |
| 28 | Specialty KPI values | PASS | Live browser: Specialty KPI cards include measured values or an explicit unavailable marker |
| 29 | Diagnostic booking sources | PARTIAL | Live API/data comparison: Diagnostic bookings equal persisted CRM/API sources with source-reference deduplication; Live browser: Diagnostic page uses conversion ratios and a rupee icon LIMIT: Persisted CRM/API booking totals agree and conversion UI passed. Positive lab ingestion and browser-local appointment-source reconciliation remain unverified. |
| 30 | Content creation link | PASS | Live browser: Digital Content workflow links to content creation |
| 31 | Consent default and channel labels | PASS | Live browser: Consent starts Unknown and channels use readable labels |
| 32 | Campaign selector | PASS | Live browser: Attribution form offers campaign selection rather than a raw ID field |
| 33 | Feedback/rating defaults and labels | PASS | Live browser: Feedback and review scores start empty with required range labels |
| 34 | Team counts/developer labels | PASS | Live API/data comparison: Team members are unique and managers do not recur under Unassigned; Live browser: Team header explains active/total and hides fixture suffixes; Live team progress bars: Zero-metric team groups use empty progress bars |
| 35 | Audit-log viewer | PASS | Live API/data comparison: Governance issue links stay within visible leads and audit log is accessible; Live browser: Governance offers the audit-log viewer |
| 36 | Lead phone/status display | PASS | Live browser: Lead rows display both phone and email with readable status styling |
| 37 | Global search detail | PASS | Live API/data comparison: Global-search lead IDs open tenant-scoped detail and context; Live browser: Lead detail opens from search URL and exposes Convert to deal |
| 38 | Inline deal validation | PASS | Live browser: Invalid probability shows inline validation and makes no write request; Live browser: Invalid contact email shows inline validation and makes no write request; Live inline invalid-email/probability messages plus isolated HTTP validation. |
| 39 | Deal cards and stage movement | PASS | Live browser: Pipeline renders deal cards and Won/Lost stages and stage click filters deals; Isolated HTTP moves deal and verifies weighted pipeline/dashboard; live card/selector/stage navigation checks. |
| 40 | Automatic system activities | PASS | Isolated HTTP creates one completed system activity and one audit record atomically with the lead. |
| 41 | Past-activity warning | PASS | Live browser: Past activity schedule requires an explicit warning; cancel performs no write |
| 42 | Email CRM navigation | PASS | Live browser: Email Inbox retains CRM sidebar navigation |
| 43 | List detail and CSV import | PASS | Live API/data comparison: Visible marketing lists obey creator ownership and members resolve to CRM records; Isolated HTTP: CSV quoted fields, invalid email rejection, repeat imports, XLSX compatibility, malformed upload 400. |
| 44 | Visual template editor/preview | PASS | Live browser: Templates offer visual editing and sandboxed preview when content is present; Live preview/export interaction: Templates offer visual editing and sandboxed preview when content is present |
| 45 | Grounded lead scoring | PASS | Live API/data comparison: Untouched new leads are not scored Hot with a fabricated Demo action; Deterministic scoring regression tests plus live active-lead score sanity. |
| 46 | Funnel stages and CSV export | PASS | Live API/data comparison: Reports distinguish all lead/deal stages including Discovery; Live browser: Reports have a CSV export control; Live preview/export interaction: Reports have a CSV export control |

## Repeating the checks

With the disposable local PostgreSQL server on `127.0.0.1:55490` running as the current OS user:

```bash
CRM_LOCAL_PG_TESTS=true npm test --prefix server -- --testPathPatterns="crm-|contact-center"
npm test --prefix client -- src/pages/crm
node server/scripts/qa/crm-report-isolation.mjs
npm run test:portal-routes-sanity --prefix client
```

The first command intentionally still reports the two outstanding schema-governance failures. Live probe scripts/evidence and synthetic test-access handling remain private under `/home/ubuntu/crm-test-evidence/20261024`. The machine-readable public result is [CRM_SANITY_SMOKE_RETEST_2026-10-24.json](CRM_SANITY_SMOKE_RETEST_2026-10-24.json).
