# Mediqzy hospital-insurance RCM / AR: repository comparison, gap analysis and implementation plan

Date: 2026-11-07
Mediqzy source inspected at commit `7bf4d4ef45c600d442003e5ee3da7dfccf2d87f2` (branch `reconcile`).

## Decision

**Do not fork, clone, or import from any of the GitHub projects named in the request.** None of them is a
closer fit than Mediqzy's own code, and the request's own thread flags most of them as proprietary (publicly
*viewable* ≠ open-source), wrong stack (Rust/.NET), front-end-only demos, or analytics-only notebooks.

Mediqzy already ships a hospital-insurance RCM module that is **more complete than every reference listed** —
a formal claim/pre-auth state machine, 18+ named TPA connectors plus an aggregator, NHCX and NHA/PM-JAY
(Ayushman) clients, a cashless pre-auth pipeline with an AI engine, a denial work-queue with reason codes, an
ERA/remittance import-and-post path with contractual adjustments, payer-wise RCM analytics with AR aging
buckets, and full Insurance-Desk and TPA operator UIs. The repositories in the thread would be a *downgrade*.

The correct move is **targeted depth**, not a rebuild. The real gaps are a handful of AR-maturity features:
Days-in-AR / DSO, deeper aging buckets (90–180 / 180+), a first-class **AR follow-up / collections work-queue**
(distinct from the denial queue), **short-payment/variance detection** off ERA posting, and **claim-wise
profitability**. These are additive and build on what exists.

## Scope and evidence limits

- This is a **source inspection of Mediqzy only.** The external repositories were **not cloned or executed** —
  cloning unvetted third-party repos onto the production box is an unnecessary supply-chain risk, and the
  thread already supplies their stated feature lists. Their columns below are therefore **vendor/author claims
  as quoted in the request, not verified behaviour**, and are used only as a requirements checklist.
- The thread's own caveats are retained and material: *Ashishamore/hospital-project* is described in one place
  as a full HMS and in another as a **front-end-only demo with browser-stored, simulated data**;
  *MedBrains* is **Rust/Axum + AGPL-3.0** (source-sharing obligations, not our Node stack); *MedCore* and
  *Unified Healthcare OS* are **publicly viewable but not confirmed open-source** (claims functionality
  described as a scaffold / partner-gated); *hospital-operations-analytics* is a **Power BI/SQL analytics
  project, not an operational application**. Treat all feature claims as unverified.
- "Gap" below means *not found in the inspected Mediqzy RCM paths at this commit*, not proof of absence
  across every module. Findings are from static reading, not a live production audit.

## What Mediqzy already has (verified in source)

| Area | Evidence |
|---|---|
| Formal claim + pre-auth **state machine** (draft→submitted→pending→query→approved→paid/denied→appeal…) with guarded transitions | `server/services/insurance-claim-state-machine.service.js` |
| **Claims lifecycle engine** (2,541 lines): eligibility, e-card issue/verify, network hospitals, create/decide claim, raise shortfall, document AI, calculate payable, approval & underwriting cases, provider contracts/SOC/blacklist, cashless forms, interop events | `server/services/tpa-claims-lifecycle.service.js` |
| **18+ TPA connectors** (Star, MDIndia, MediAssist, Paramount, Raksha, Care, FHPL, GoDigit, Heritage, ICICI, NivaBupa, MedSave, Volo, Vidal, eWat, FGI, HealthIndia) + **aggregator** | `server/services/*-tpa.service.js`, `tpa-aggregator.service.js` |
| **NHCX** client + idempotent webhooks | `server/services/nhcx-client.service.js`, `idempotent-webhook.service.js` |
| **PM-JAY / Ayushman (NHA)**: eligibility, e-card, hospitals, claims, status, captcha submit | `server/routes/ayushman.route.js` |
| Govt/scheme billing surface: **CGHS, ECHS, ESIC** references across routes/services | 5–10 files each |
| **Pre-auth** incl. **AI pre-auth engine** and HMIS pre-auth; **enhancement** requests | `ai-preauth-engine.service.js`, `hmis-preauth.service.js`, `hmis-preauth.route.js` |
| **Denial management** + **RCM governance** work-queue: denials CRUD, draft/submit appeal, resolve; denial **reason codes**, **work items / work queue**, advance-by-denial | `denial-management.service.js`, `insurance-rcm-governance.service.js` |
| **Payment posting / ERA remittance**: batch import (dedupe by digest), post remittance, **contractual adjustments & write-offs**, patient responsibility | `insurance-rcm-governance.service.js: importEraBatch`, `hospital-era.service.js`, `hospital-billing.service.js: createAdjustment` |
| **Payer-wise RCM analytics** with **AR aging buckets** (0–30 / 31–60 / 61–90 / 90+), clean-claim rate, denial rate, collection rate, outstanding | `insurance-rcm-governance.service.js: payerRcmAnalytics` |
| **Claims rules engine** (room-rent advisory, pre-submission validation) | `claims-rules-engine.service.js` |
| **Pre-discharge audit** + **discharge billing clearance** gate | `insurance-pre-discharge-audit.service.js`, `discharge-billing-clearance.service.js` |
| Rich **operator UIs**: Insurance Desk (claims, pre-auth, appeals, settlements, **reconciliation**, analytics, compliance, admissions, documents, email inbox) and TPA portal (claims, members, e-card, providers, hospitals, operations workbench, dashboard, benefit estimator) | `client/src/pages/insurance-desk/*`, `client/src/pages/tpa/*` |
| Supporting AI: insurance bot, email AI, document AI, RCM/revenue intelligence | `ai-insurance-bot.service.js`, `insuranceEmailAI.service.js`, `insurance-document-ai.service.js`, `ai-revenue-intelligence.service.js` |

## Repository-by-repository verdict (against Mediqzy)

| Repo (as named in thread) | Stated focus | Licence / stack caveat (from thread) | Verdict vs Mediqzy |
|---|---|---|---|
| Ashishamore / hospital-project ("Mauli HIS") | Indian TPA desk, CGHS/ECHS, PM-JAY/MJPJAY, NHCX, TAT timers | Front-end-only demo; browser-stored, simulated data; ~0 stars | **Reference only.** Mediqzy has real backends for all of this. Possibly mine its **TAT/IRDAI-timer UX** and MJPJAY labels. |
| Unified Healthcare OS | NestJS/Node/PostgreSQL/Prisma; claims filing/approval/settlement, rate cards | No OSS licence confirmed | Closest *stack*, but unverified/unlicensed. Mediqzy's RCM is deeper. **Do not import.** |
| MedBrains | GST/CGHS/ECHS/TPA, revenue integrity, RLS, multi-tenant | **Rust/Axum, AGPL-3.0** | Wrong stack + copyleft. **Architecture reading only**; Mediqzy already has RLS + multi-tenant. |
| MedCore (Globussoft) | Pre-auth, claim timeline, GST invoicing, ABDM/ABHA, FHIR R4 | Proprietary; claims are a scaffold; connectors partner-gated | Mediqzy already exceeds the scaffold (live TPA connectors, NHCX). **No value in importing.** |
| hospital-operations-analytics | AR>90, denial %, revenue leakage, Indian FY, 38 DAX | Power BI/SQL **analytics only** | **Metric checklist**, not code. Useful to copy *KPI definitions* (DSO, revenue leakage, denial Pareto). |
| RCM Command Center (Sreeni1023) | Claims tracking, denial mgmt, AR aging, collections dashboards | Node/PG/Chart.js | **Dashboard-pattern reference** for a unified RCM cockpit. |
| OpenEMR / Danphe / others | General HMS | PHP / .NET | Out of scope; general HMS, not India-RCM depth. |

## Feature comparison and gap register

Status: **E** = implemented/reusable · **P** = partial / separate / shallow · **G** = genuine gap.
Criticality uses the thread's own "critical / important" labels.

| # | RCM / AR capability | Crit. | Mediqzy finding | Status |
|---|---|---|---|---|
| 1 | Cashless **pre-authorisation** | Critical | AI pre-auth engine + HMIS pre-auth + state machine | **E** |
| 2 | **Enhancement** requests | Critical | `enhancement` across 8 files; pre-auth transitions | **E** |
| 3 | **Final bill** submission / discharge gate | Critical | `discharge-billing-clearance`, `ensureFinalBillForDischarge` | **E** |
| 4 | **TPA-wise claim tracking** | Critical | 18+ connectors + aggregator + lifecycle listClaims | **E** |
| 5 | **Denial / rejection management** | Critical | denial CRUD + appeals + reason codes + work queue | **E** |
| 6 | **Query / clarification (shortfall)** management | Critical | `raiseShortfall`, `query` state | **E** |
| 7 | **Claim resubmission** | Critical | `query→submitted`, `rejected→submitted` transitions | **E** |
| 8 | **Payment posting & reconciliation** (ERA) | Critical | `importEraBatch` + `hospital-era` post + adjustments; Insurance-Desk Reconciliation UI | **E** |
| 9 | **Short-payment / deduction identification** | Critical | ERA posts adjustments & patient-responsibility, but **no explicit expected-vs-paid variance flagging or auto work-item** | **G** |
| 10 | **TPA-wise AR aging** | Critical | `payerRcmAnalytics` buckets per payer | **E** |
| 11 | Aging granularity **90–180 / 180+** | Critical | Only `ar_90_plus` (single >90 bucket) | **P** |
| 12 | **AR executive work-queues** (payer-wise outstanding worklists) | Critical | Only the **denial** work-queue exists; no general AR/outstanding worklist. (`collection.service.js` is **specimen/phlebotomy logistics**, not financial AR.) | **G** |
| 13 | **Follow-up history & reminders / SLA escalation** | Critical | Denial work-items advanceable; no scheduled AR follow-up reminders / SLA escalation cron | **P** |
| 14 | **Insurance write-offs** | Important | `createAdjustment` (contractual/write-off) via ERA | **E** |
| 15 | **Claim-wise profitability** (claimed vs cost vs settled margin) | Important | `net_amount`, `tariff_metadata` present; **no margin/cost rollup** | **G** |
| 16 | **NHCX** integration | Important | `nhcx-client.service.js` + webhooks + lifecycle hooks | **E** (verify prod enablement) |
| 17 | **PM-JAY / state-scheme** workflow | Important | Ayushman eligibility/e-card/claims/status (NHA portal) | **P** (portal-scrape depth; no package-master/TMS block) |
| 18 | **Days-in-AR / DSO** metric & trend | Important | Not computed anywhere | **G** |
| 19 | **Denial root-cause analytics** (Pareto by CARC/RARC) | Important | Reason codes stored; no Pareto/root-cause rollup | **G** |
| 20 | **Unified RCM cockpit** (HIS+RCM KPIs in one command center) | Important | Insurance-Desk + TPA dashboards exist but are **role-fragmented** | **P** |
| 21 | **Revenue leakage** detection | Important | Pre-discharge audit catches some leakage pre-bill; no post-settlement leakage report | **P** |

**Net:** of 21 capabilities — ~11 **E**, ~5 **P**, ~5 **G**. Every item rated **G/P** is additive on top of
`insurance_claims`, `era_*` tables, and `payerRcmAnalytics`; none requires a new platform.

## Implementation plan (additive, phased)

All work is **administrative/financial RCM** (no clinical AI decision) → **NOT SaMD**; the SaMD governance gates
do not apply. Entity-UID rule applies to any **new table** (`SELECT attach_entity_uid_rule(...)`) and any new
cross-entity reference (`attach_uid_reference(...)`) per `CLAUDE.md`.

### Phase 1 — AR depth on existing data (no new entities) — ~1 sprint
Builds entirely on `insurance_claims`, `era_*`, and `payerRcmAnalytics`.
1. **Extend aging buckets** to `0–30 / 31–60 / 61–90 / 91–180 / 180+` in `payerRcmAnalytics` (item 11).
2. **Days-in-AR / DSO** (item 18): `SUM(outstanding) / (net_credit_revenue / period_days)`, per payer and
   overall; expose on `GET /api/ai-governance`-style RCM analytics and `InsuranceDeskAnalytics.tsx`.
3. **Short-payment / variance detection** (item 9): on ERA post, compare `expected` (claim payable from
   `calculateClaimPayable` / tariff) vs `payment_amount`; when `paid < expected − tolerance` flag
   `short_paid` and **auto-create an AR work-item**. Extend `hospital-era.service.js` + `importEraBatch`.
4. **Denial Pareto** (item 19): group denial work-items by reason code; add a Pareto panel to
   `InsuranceDeskAnalytics.tsx`.

### Phase 2 — AR follow-up / collections work-queue (one new table) — ~1–2 sprints
1. New table `ar_follow_up_items` (`claim_id`, `payer`, `bucket`, `outstanding`, `owner_user_id`, `status`,
   `next_action_at`, `sla_due_at`, `last_contact_at`, history JSONB) — register under the **entity-UID rule**
   and add a **uid reference** to the claim (item 12).
2. Generalise the existing denial-work-queue service rather than forking it: reuse
   `insurance-rcm-governance.service.js` patterns for `createArFollowUpItem / listArWorkQueue /
   updateArFollowUpItem`.
3. **Follow-up reminders + SLA escalation cron** (item 13): register in `server/utils/cronRegistry.js`
   (`tick/tickStart/tickError`); escalate overdue items by bucket; notify via the existing notify services.
4. UI: an **"AR Work-queue"** tab in `insurance-desk/` (worklist, filters by payer/bucket/age, follow-up log).

### Phase 3 — Profitability, scheme depth, cockpit — ~2 sprints
1. **Claim-wise profitability** (item 15): join settled amount to case cost (package/tariff from
   `tariff_metadata` + consumables/OT where available); margin per claim/payer/specialty.
2. **PM-JAY/state-scheme depth** (item 17): package masters, pre-auth/TMS blocking states; keep NHA portal
   client as fallback.
3. **Unified RCM cockpit** (item 20) + **post-settlement revenue-leakage** report (item 21): one KPI command
   center (Days-in-AR, collection %, denial %, clean-claim %, aging rollforward, leakage) — pattern after the
   "RCM Command Center" reference, fed by `payerRcmAnalytics` + the new metrics. No new backend platform.

## Verification (per phase)
1. Unit tests for bucket math, DSO, and short-pay variance against seeded `insurance_claims` + ERA rows.
2. `node scripts/ssm-env-loader.mjs scripts/ci/verify-entity-uid-rule.mjs` exits 0 after any new table/reference.
3. Cross-tenant isolation test: hospital-A cannot see hospital-B AR items (RLS + `withRlsTransaction`).
4. Manual E2E: import an ERA batch with a short-paid row → variance flagged → AR work-item created → followed
   up → aging + DSO reflect it on the analytics page.

---
*No third-party code, dependencies, or data were imported. External repository feature claims are quoted from
the request thread and were not independently verified.*
