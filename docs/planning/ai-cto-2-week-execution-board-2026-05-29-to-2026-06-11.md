# AI CTO 2-Week Execution Board

Window: 2026-05-29 to 2026-06-11 (14 days)
Cadence: Daily run at 4:00 AM IST
Scope: Unified Priority Backlog (P0/P1)

## Roles in Scope

1. Product Manager (PM)
2. Business Analyst (BA)
3. Market Researcher
4. Product Researcher / Competitor Analyst
5. Principal Engineer
6. Tech Lead / Software Architect
7. Backend Engineer
8. Frontend Engineer
9. AI Engineer
10. DevOps Engineer
11. Security & Compliance Engineer (HIPAA, GDPR, DPDP, ISO 27001, HL7/FHIR, NABH, JCI)
12. UX Researcher
13. UI Designer
14. QA / Test Engineer
15. Delivery Manager

## Priority Backlog Reference

### P0
- Domain ownership map + bounded-context architecture document
- Critical API contract tests and role-based regression packs
- KPI instrumentation for conversion, claims TAT, and retention funnels

### P1
- UX simplification pass for hospital and admin high-density screens
- Design system hardening for dashboard consistency and accessibility
- Release gate policy tying smoke, contract, and UX checks to merge

## Daily 4:00 AM IST Operating Protocol

Run order at 4:00 AM IST every day:

1. QA: run canonical smoke/sanity + regression pack snapshot
2. Tech Lead: review overnight failures and open blockers
3. Principal Engineer: architecture drift check on changed modules
4. PM + BA: reprioritize day tasks based on failures and risk
5. UX/UI: apply approved simplification/design tickets
6. End-of-run output: one daily issue report and next-day risk list

Standard run command:

```bash
cd /home/ubuntu/Mediczy
npm run test:sanity-smoke:canonical
```

Optional full daily check command:

```bash
cd /home/ubuntu/Mediczy
./scripts/run-daily-checks.sh
```

## Owners

- PM Owner: Product Lead
- BA Owner: Business Systems Analyst
- Market Research Owner: Market Intelligence Lead
- Product Research Owner: Product Insights Lead
- Principal Engineer Owner: Platform Architect
- Tech Lead Owner: Application Tech Lead
- Backend Owner: Backend Lead
- Frontend Owner: Frontend Lead
- AI Owner: AI Platform Lead
- DevOps Owner: Infrastructure Lead
- Security & Compliance Owner: Security Compliance Lead
- UX Owner: UX Lead
- UI Owner: Design Lead
- QA Owner: QA Lead
- Delivery Owner: Delivery Manager

## 14-Day Ticket Board (Daily)

### Per-Day Role Ownership Tags (Expanded Roster)

- Day 1: PM, BA, Principal Engineer, Tech Lead, Backend Engineer, Delivery Manager
- Day 2: Principal Engineer, Tech Lead, BA, QA, Backend Engineer
- Day 3: QA, Tech Lead, Backend Engineer, Frontend Engineer
- Day 4: BA, PM, Principal Engineer, Frontend Engineer, AI Engineer
- Day 5: Principal Engineer, Tech Lead, Backend Engineer, DevOps Engineer
- Day 6: QA, Tech Lead, Principal Engineer, UX Researcher, UI Designer
- Day 7: UX Researcher, UI Designer, Frontend Engineer, QA
- Day 8: UI Designer, UX Researcher, QA, Frontend Engineer
- Day 9: UX Researcher, UI Designer, Tech Lead, Frontend Engineer
- Day 10: Tech Lead, Principal Engineer, QA, PM, Security & Compliance Engineer, DevOps Engineer
- Day 11: QA, Tech Lead, Principal Engineer, Backend Engineer, DevOps Engineer
- Day 12: UI Designer, UX Researcher, QA, BA, PM, Product Researcher / Competitor Analyst
- Day 13: QA, Tech Lead, Principal Engineer, Delivery Manager, DevOps Engineer
- Day 14: PM, BA, QA, Principal Engineer, Tech Lead, Market Researcher, Product Researcher / Competitor Analyst, Delivery Manager

### Role-to-Ticket Matrix (Leadership View)

| Role | Primary Ticket IDs | Coverage |
|---|---|---|
| Product Manager (PM) | P0-ARCH-001, P0-DATA-001, P0-DATA-005, P0-OPS-002, P0-CLOSE-001, P1-PLAN-001 | Direct ticket role mapping |
| Business Analyst (BA) | P0-ARCH-001, P0-ARCH-002, P0-QA-001, P0-DATA-001, P0-DATA-004, P0-DATA-005, P0-CLOSE-001, P1-PLAN-001 | Direct ticket role mapping |
| Market Researcher | P0-CLOSE-001 (Day 14 ownership track) | Day-tag ownership + closure participation |
| Product Researcher / Competitor Analyst | P0-DATA-004, P0-DATA-005, P1-PLAN-001 | Direct ticket role mapping |
| Principal Engineer | P0-ARCH-001, P0-ARCH-002, P0-DATA-001, P0-DATA-003, P0-QA-003, P0-ARCH-003, P1-REL-001, P1-REL-003, P0-CLOSE-001 | Direct ticket role mapping |
| Tech Lead / Software Architect | P0-ARCH-001, P0-ARCH-002, P0-QA-001, P0-QA-002, P0-ENG-001, P0-DATA-002, P0-DATA-003, P0-QA-003, P1-DESIGN-001, P1-DESIGN-002, P1-UX-003, P1-DESIGN-003, P1-REL-001, P1-REL-002, P0-QA-005, P0-ARCH-003, P1-REL-003, P0-CLOSE-001 | Direct ticket role mapping |
| Backend Engineer | P0-DATA-003 (delivery support), P0-ENG-001 (regression support) | Day-tag ownership + implementation support |
| Frontend Engineer | P0-DATA-002, P1-UX-002, P1-DESIGN-001, P1-DESIGN-002, P1-UX-003, P1-DESIGN-003, P1-DESIGN-004 | Day-tag ownership + UI implementation support |
| AI Engineer | P0-DATA-004, P0-DATA-005 (analytics/AI KPI support) | Day-tag ownership + KPI/AI support |
| DevOps Engineer | P1-REL-001, P1-REL-002, P1-REL-003, P0-OPS-002 | Day-tag ownership + release/runbook reliability support |
| Security & Compliance Engineer | P1-REL-001 (release fail criteria), P1-REL-002 (merge conditions) | Day-tag ownership + compliance gate support |
| UX Researcher | P1-UX-001, P1-UX-002, P1-DESIGN-002, P1-UX-003, P1-DESIGN-004, P1-PLAN-001 | Direct ticket role mapping |
| UI Designer | P1-UX-001, P1-UX-002, P1-DESIGN-001, P1-DESIGN-002, P1-QA-004, P1-UX-003, P1-DESIGN-003, P1-DESIGN-004, P1-PLAN-001 | Direct ticket role mapping |
| QA / Test Engineer | P0-OPS-001, P0-QA-001, P0-QA-002, P0-ENG-001, P0-DATA-002, P0-DATA-003, P0-QA-003, P1-DESIGN-002, P1-QA-004, P1-DESIGN-003, P1-REL-001, P1-REL-002, P0-QA-005, P1-REL-003, P0-OPS-002, P0-CLOSE-001 | Direct ticket role mapping |
| Delivery Manager | P0-OPS-001, P0-OPS-002, P0-CLOSE-001, P1-PLAN-001 | Day-tag ownership + delivery governance |

## Day 1 (2026-05-29)
- Ticket: P0-ARCH-001
  - Title: Define domain ownership map (patient, doctor, hospital, clinic, admin/team, insurance, comms, AI)
  - Roles: PM, BA, Principal Engineer, Tech Lead
  - Owner: Platform Architect
  - Deliverable: ownership matrix + escalation path
  - Acceptance: all core modules mapped with DRI and backup owner
- Ticket: P0-OPS-001
  - Title: Create 4 AM IST daily run checklist
  - Roles: PM, QA, Tech Lead
  - Owner: QA Lead
  - Deliverable: executable checklist for daily run
  - Acceptance: checklist published and tested once

## Day 2 (2026-05-30)
- Ticket: P0-ARCH-002
  - Title: Publish bounded-context architecture document v1
  - Roles: Principal Engineer, Tech Lead, BA
  - Owner: Platform Architect
  - Deliverable: context boundaries + contracts + dependencies
  - Acceptance: reviewed by PM and QA
- Ticket: P0-QA-001
  - Title: Define contract-test scope for critical APIs
  - Roles: QA, Tech Lead, BA
  - Owner: QA Lead
  - Deliverable: critical API list with expected schemas
  - Acceptance: top 25 API endpoints listed

## Day 3 (2026-05-31)
- Ticket: P0-QA-002
  - Title: Implement auth/forgot-password contract tests (primary + alias routes)
  - Roles: QA, Tech Lead
  - Owner: QA Lead
  - Deliverable: automated tests for request/verify/reset and aliases
  - Acceptance: tests pass in CI on main path
- Ticket: P0-ENG-001
  - Title: Add regression pack for role-based login flows (user/doctor/hospital/team)
  - Roles: QA, BA, Tech Lead
  - Owner: Tech Lead
  - Acceptance: daily run includes role-login regression job

## Day 4 (2026-06-01)
- Ticket: P0-DATA-001
  - Title: KPI event model for conversion funnel and claims TAT
  - Roles: BA, PM, Principal Engineer
  - Owner: Business Systems Analyst
  - Deliverable: event schema and KPI formulas
  - Acceptance: sign-off by PM + Principal Engineer
- Ticket: P0-DATA-002
  - Title: Instrument frontend events for conversion checkpoints
  - Roles: Tech Lead, UX, UI, QA
  - Owner: Application Tech Lead
  - Acceptance: event logs visible in telemetry/dev logs

## Day 5 (2026-06-02)
- Ticket: P0-DATA-003
  - Title: Instrument backend claims lifecycle timestamps for TAT
  - Roles: Principal Engineer, Tech Lead, QA
  - Owner: Platform Architect
  - Acceptance: claims_created, submitted, query, approved timestamps tracked
- Ticket: P0-DATA-004
  - Title: Retention funnel metric pipeline definition
  - Roles: PM, BA, Product Research
  - Owner: Product Insights Lead
  - Acceptance: retention funnel dashboard requirements finalized

## Day 6 (2026-06-03)
- Ticket: P0-QA-003
  - Title: Expand contract tests to hospital + insurance critical APIs
  - Roles: QA, Tech Lead, Principal Engineer
  - Owner: QA Lead
  - Acceptance: additional 20 endpoints covered
- Ticket: P1-UX-001
  - Title: UX audit pass on hospital high-density pages
  - Roles: UX, UI, PM
  - Owner: UX Lead
  - Acceptance: prioritized UX simplification backlog

## Day 7 (2026-06-04)
- Ticket: P1-UX-002
  - Title: UX simplification implementation batch 1 (hospital dashboard)
  - Roles: UX, UI, Tech Lead, QA
  - Owner: Design Lead
  - Acceptance: reduced cognitive load and improved navigation clarity
- Ticket: P1-DESIGN-001
  - Title: Design system audit for dashboard components
  - Roles: UI, Tech Lead
  - Owner: Design Lead
  - Acceptance: token and component inconsistency list published

## Day 8 (2026-06-05)
- Ticket: P1-DESIGN-002
  - Title: Accessibility baseline standard for dashboard cards/nav/states
  - Roles: UI, UX, QA, Tech Lead
  - Owner: QA Lead
  - Acceptance: keyboard + aria + contrast checklist integrated
- Ticket: P1-QA-004
  - Title: Add accessibility checks into regression pack
  - Roles: QA, UI
  - Owner: QA Lead
  - Acceptance: accessibility checks run in daily suite

## Day 9 (2026-06-06)
- Ticket: P1-UX-003
  - Title: UX simplification implementation batch 2 (admin high-density screens)
  - Roles: UX, UI, Tech Lead
  - Owner: UX Lead
  - Acceptance: admin IA simplification and improved scanability
- Ticket: P1-DESIGN-003
  - Title: Standardize status badges, alerts, and table density
  - Roles: UI, Tech Lead, QA
  - Owner: Design Lead
  - Acceptance: shared patterns documented and applied

## Day 10 (2026-06-07)
- Ticket: P1-REL-001
  - Title: Define release gate policy (smoke + contract + UX checks)
  - Roles: Tech Lead, Principal Engineer, QA, PM
  - Owner: Application Tech Lead
  - Acceptance: written policy with fail criteria and owners
- Ticket: P1-REL-002
  - Title: Map release gate to CI and branch merge conditions
  - Roles: Tech Lead, QA
  - Owner: QA Lead
  - Acceptance: merge checklist aligned with policy

## Day 11 (2026-06-08)
- Ticket: P0-QA-005
  - Title: Stabilize flaky tests and quarantine process
  - Roles: QA, Tech Lead
  - Owner: QA Lead
  - Acceptance: flaky list reduced and documented SLA for fixes
- Ticket: P0-ARCH-003
  - Title: Architecture drift review against bounded-context doc
  - Roles: Principal Engineer, Tech Lead
  - Owner: Platform Architect
  - Acceptance: drift report + remediation tickets

## Day 12 (2026-06-09)
- Ticket: P1-DESIGN-004
  - Title: Design system hardening batch 2 for hospital/admin modules
  - Roles: UI, UX, QA
  - Owner: Design Lead
  - Acceptance: dashboard visual consistency baseline reached
- Ticket: P0-DATA-005
  - Title: KPI dashboard v1 (conversion + claims TAT + retention)
  - Roles: BA, PM, Product Research
  - Owner: Business Systems Analyst
  - Acceptance: dashboard draft visible with daily updates

## Day 13 (2026-06-10)
- Ticket: P1-REL-003
  - Title: Dry run release gate using current branch changes
  - Roles: QA, Tech Lead, Principal Engineer
  - Owner: Application Tech Lead
  - Acceptance: go/no-go report generated with blockers
- Ticket: P0-OPS-002
  - Title: Daily 4 AM IST runbook reliability check
  - Roles: QA, PM
  - Owner: QA Lead
  - Acceptance: 7-day reliability target validated

## Day 14 (2026-06-11)
- Ticket: P0-CLOSE-001
  - Title: Sprint closure report for P0/P1 board
  - Roles: PM, BA, QA, Principal Engineer, Tech Lead
  - Owner: Product Lead
  - Acceptance: completion report + carry-forward list + next sprint proposal
- Ticket: P1-PLAN-001
  - Title: Next 2-week board draft based on KPI and risk outcomes
  - Roles: PM, BA, Product Research, UX, UI
  - Owner: Product Insights Lead
  - Acceptance: approved board for next cycle

## Daily Issue Report Template (4 AM IST)

Every day, publish one report containing:

1. P0/P1 ticket status (Open/In Progress/Blocked/Done)
2. Test outcomes (sanity/smoke/contract/regression)
3. New blockers and owner
4. KPI trend snapshot (conversion, claims TAT, retention)
5. Risk level (Green/Amber/Red)
6. Next 24h plan

## Scheduling at 4:00 AM IST

If server timezone is IST:

```cron
0 4 * * * cd /home/ubuntu/Mediczy && npm run test:sanity-smoke:canonical >> /home/ubuntu/Mediczy/logs/ai-cto-daily.log 2>&1
```

If server timezone is UTC (equivalent of 4:00 AM IST):

```cron
30 22 * * * cd /home/ubuntu/Mediczy && npm run test:sanity-smoke:canonical >> /home/ubuntu/Mediczy/logs/ai-cto-daily.log 2>&1
```

## Dependencies and Blocker Rules

- No P1 execution before P0 critical blockers are resolved.
- Release gate policy cannot be marked done unless contract/regression packs are green.
- Any Red-risk daily report must trigger same-day reassessment by PM + Principal Engineer + QA.
