# CRM & Communication-Hub upgrade plan — adopting from open-source, license-safely

**Status:** Plan / not started.
**Date:** 2026-10-15.
**Goal:** Close the three capability gaps where mediqzy's otherwise-larger CRM trails two open-source
projects, **without infringing their licenses**:

- **AgenticCRM** (`github.com/Sapheron/AgenticCRM`) — **MIT** — AI agent that *operates* the CRM.
- **brightbean-chat** (`github.com/brightbeanxyz/brightbean-chat`) — **AGPL-3.0** — visual flow builder
  + social-growth omnichannel.

> mediqzy already exceeds both in breadth (120+ `crm_*` tables, RFQ/underwriting, attribution marts,
> incentives, reputation, Chatwoot inbox, WhatsApp, consent). This plan adds **three specific
> capabilities**, built on mediqzy's existing tables/services — not a rewrite.

---

## 0. License-safety framework (read first — governs everything below)

Every adopted feature is tagged with a **provenance rule**. The rules differ sharply by source
license. **This section is binding on all workstreams; nothing ships until §6's checklist passes and
counsel signs off.**

### 0.1 Two very different licenses

| Source | License | What we may take | What we must NOT do |
|---|---|---|---|
| **AgenticCRM** | **MIT** (permissive) | Code *and* patterns may be reused in proprietary mediqzy. | Ship copied MIT code without preserving its copyright + MIT text in `NOTICE`/third-party attributions. |
| **brightbean-chat** | **AGPL-3.0** (strong copyleft + network clause) | **Ideas / functionality / UX concepts only.** | **Copy, translate, or create a derivative of its code, schema, comments, or flow-template JSON.** Doing so would force AGPL on the *entire* mediqzy networked service. |

### 0.2 Why AGPL is the dangerous one

AGPL-3.0 §13: if a modified version is offered to users **over a network**, you must offer those users
the **complete corresponding source of the whole combined work** under AGPL. mediqzy is a proprietary,
network-delivered service. **Incorporating any AGPL-derived code is therefore disqualifying.**

Copyright protects **expression**, not **ideas or functionality**. A "visual flow builder" or
"comment-to-DM trigger" is an unprotectable idea; brightbean's specific code, field names, comment
text, and template JSON are protected expression. **We adopt the idea; we write our own expression.**

### 0.3 Clean-room discipline for anything derived from brightbean (AGPL)

1. **Spec from behavior/public docs, not from source.** Features are documented as requirements (what
   it does, from the README / public UI / these notes), then implemented independently.
2. **No verbatim or line-by-line porting.** Do not translate brightbean Python → mediqzy JS. Do not
   copy model definitions, field names, migration SQL, node type names, or `flow-templates/*.json`.
3. **mediqzy-native expression only.** Use mediqzy's own stack (ESM Node/Express, `pool` from
   `server/db/pgPool.js`, React client) and **independently-licensed libraries** (e.g. React Flow is
   MIT — fine). Schema, naming, and structure are designed for mediqzy's existing `crm_*` tables.
4. **Record provenance in each PR:** "Capability modeled on brightbean behavior; implementation and
   schema independently authored; no AGPL code or assets used."
5. **If in doubt, don't.** Any temptation to copy a nontrivial block → stop, redesign, or ask counsel.

### 0.4 Attribution discipline for anything taken from AgenticCRM (MIT)

- Prefer **re-implementing the pattern** (cleanest). If re-implemented, no attribution is legally
  required, but note the inspiration in the PR.
- If **actual MIT code is copied**, isolate it in a clearly-bounded module and add an entry to a repo
  `THIRD_PARTY_NOTICES.md` with AgenticCRM's copyright line + the MIT license text. Keep copied code
  minimal and quarantined.

### 0.5 Hard "do-not-touch" list
- ❌ `brightbean-chat/flow-templates/*.json` (their content/expression) — do not import or adapt.
- ❌ brightbean model classes / field-name sets / migrations — do not mirror as a schema.
- ❌ Any brightbean code, including "just the tricky function."
- ✅ Generic OSS libraries under permissive licenses (MIT/BSD/Apache-2.0), vetted per §6.

---

## 1. What mediqzy has today (so we build on it, not beside it)

- **CRM AI:** `server/routes/crm-ai.route.js`, `server/services/ai-crm.service.js`,
  `crm-marketing-copilot.service.js` — assist/recommend/draft only. **0 registered agent tools.**
- **Automation / journeys:** `crm_journeys`, `crm_journey_steps` — **linear** drips
  (`step_order, delay_minutes, channel, template_id`). No branching, no versioning, no visual builder.
- **Channels:** email / SMS / WhatsApp live; `social-inbox.route.js` has partial Instagram/Messenger
  scaffolding. Chatwoot integration (`crm_chatwoot_*`) for shared inbox.
- **Compliance/infra already present and reusable:** `crm_audit_log`, `crm_consent_records`,
  `crm_marketing_suppressions`, `crm_sla_*`, `crm_frequency_counters`, LLM gateway
  `server/services/ai-brain/llm-provider.js`.

All new work follows `CLAUDE.md`: ESM, `pool` from `pgPool.js`, `authUser`/`requireRole`, **LLM calls
only via `llm-provider.js`**, and **the Entity-UID rule for every new entity table**
(`attach_entity_uid_rule` / `attach_uid_reference`).

---

## 2. Workstream A — Agentic CRM operator  ·  source: AgenticCRM (MIT)  ·  provenance: MIT-code-OK

**Gap:** mediqzy's copilot *suggests*; it cannot *act*. AgenticCRM runs the whole pipeline through a
granular, auditable **tool catalog** (`assign_lead`, `add_deal_line_item`, `accept_quote`,
`bulk_assign_tickets`…) with tool chains, a circuit breaker + auto-escalation, provider fallback, and
agent memory.

**Design (mediqzy-native, builds on existing services):**
- Add a **tool-registry layer** over the *existing* CRM services (leads/deals/quotes/tickets/
  contacts). Each tool = a thin, validated wrapper around a service function mediqzy already has — no
  new business logic, just a callable, schema'd surface.
- Route tool-calls through `llm-provider.js` (mandated) with mediqzy's provider cascade; port
  AgenticCRM's **guardrail patterns** (max tool-chain depth, circuit breaker, fallback) — MIT, may be
  reused with attribution if copied, else re-implemented.
- **Every tool call is RBAC-checked server-side** (the operator inherits the caller's `requireRole`
  scope — the agent can never exceed the human's permissions) and **written to `crm_audit_log`**
  (who/what/before/after). This is stricter than the OSS original and non-negotiable.
- Outbound actions (send quote/message) **re-use existing consent + suppression + frequency gates**.

**SaMD note:** CRM/marketing/booking actions are **administrative — NOT SaMD** (per `CLAUDE.md` risk
table). The agent must be **fenced out of clinical decisions** (no diagnosis/triage tools); if any
tool ever touches a clinical pathway, it falls under the SaMD governance flow and is out of scope here.

**Phasing:** A1 read-only tools (search/list/summarize) → A2 single-entity writes (assign, note,
status) behind a confirm step → A3 multi-step chains + bulk ops with dry-run preview.

**Acceptance:** agent performs a real assign→note→status chain on a test lead; every call appears in
`crm_audit_log`; a permission-denied role is refused server-side; circuit breaker trips on a forced
failure loop.

---

## 3. Workstream B — Visual flow builder  ·  source: brightbean concept (AGPL)  ·  provenance: CLEAN-ROOM ONLY

**Gap:** journeys are linear + backend-only. brightbean's concept is a **versioned, branching visual
graph** (conditions, delays, randomizers, nested flows, external-request/data-collection/action nodes).

**Design (independently authored — no brightbean code/schema):**
- **Client:** a drag-and-drop builder using **React Flow (MIT)** — a generic library, not brightbean's
  code. Node palette and canvas are mediqzy's own components.
- **Backend:** extend mediqzy's **existing** `crm_journeys` into a branching graph. Introduce
  mediqzy-designed tables (names/shape our own, under the Entity-UID rule): a versioned flow
  definition + a node/edge graph + an execution-state table. **Do not mirror brightbean's model.**
- **Executor:** a mediqzy-authored interpreter that walks the graph, honoring existing consent /
  suppression / frequency / SLA infra. Reuse mediqzy's `crm-automation-cron.service.js` scheduler.
- Node types derived from **generic automation concepts** (trigger, condition, delay, split/branch,
  randomizer, send-message, HTTP-request, set-field, wait-for-reply, hand-to-human) — standard across
  the category, not copied expression.

**Clean-room checkpoint:** the schema, node-type names, and executor are reviewed to confirm they are
*not* substantially similar to brightbean's. No `flow-templates/*.json` imported — mediqzy authors its
own starter templates.

**Phasing:** B1 graph schema + executor (parity with today's linear journeys, re-expressed as a 2-node
graph) → B2 branching (condition/split/delay) + versioning → B3 visual builder UI → B4 mediqzy-authored
starter templates.

**Acceptance:** a branching flow (condition → two paths → delayed send) runs end-to-end on a test
segment; versioning preserves an in-flight enrollment on edit; consent/suppression gates fire;
provenance note present in PRs.

---

## 4. Workstream C — Social-growth omnichannel  ·  source: brightbean concept (AGPL)  ·  provenance: CLEAN-ROOM ONLY

**Gap:** live channels are email/SMS/WhatsApp; no social-acquisition triggers. brightbean's concept
adds **cross-channel identity** + **social-growth entry points**: comment-to-DM, story mentions,
follow triggers, ref-URL/QR entry, plus WhatsApp template lifecycle and a shared inbox where **human
takeover pauses automation**.

**Design (independently authored; official platform APIs, not brightbean adapters):**
- **Cross-channel identity:** extend mediqzy's existing `crm_person_identities` / `crm_identity_keys`
  to resolve one contact across IG / Messenger / WhatsApp / SMS / email. (mediqzy already has an
  identity layer — enhance it; do not import brightbean's.)
- **Channel connectors:** call **Meta's official Graph/Instagram/Messenger APIs directly** with
  mediqzy's own credentials — independently written, not brightbean's `channels/providers`.
- **Triggers:** comment-to-DM, story-mention reply, follow, ref-URL/QR → feed mediqzy's flow executor
  (WS-B) and existing `social-inbox`.
- **Shared-inbox upgrades** (concepts, re-implemented into mediqzy's Chatwoot-backed inbox): human
  takeover that **pauses** the automation for that conversation, scheduled replies, inbox rules,
  reminders.
- **Compliance:** opt-in source tracking + opt-out enforcement via existing `crm_consent_records` /
  `crm_marketing_suppressions`; WhatsApp template category/status tracking for policy compliance.

**Phasing:** C1 cross-channel identity resolution → C2 Instagram/Messenger connectors (official APIs) →
C3 comment-to-DM + story-mention triggers → C4 shared-inbox takeover/scheduled-reply/rules.

**Acceptance:** one IG comment triggers a DM flow end-to-end on a test account; the same person is
resolved as one contact across two channels; a human reply pauses automation; opt-out suppresses
further sends.

---

## 5. Sequencing (recommended)

1. **WS-A (Agentic operator)** first — highest ROI, cleanest license (MIT), builds only on existing
   services, no new acquisition surface.
2. **WS-B (Flow builder)** next — unlocks richer automation that WS-C's triggers feed into.
3. **WS-C (Social omnichannel)** last — depends on WS-B's executor and the identity layer; largest
   external-API + compliance surface.

Each workstream ships in its own phases behind a feature flag (per `CLAUDE.md` standard 7) so it can be
disabled without redeploy.

---

## 6. License-compliance checklist (gate — must pass before each merge)

- [ ] **No AGPL code/assets** from brightbean copied, translated, or adapted (code, schema,
      field-name sets, comments, `flow-templates/*.json`). Grep the diff for brightbean identifiers.
- [ ] WS-B/WS-C PRs carry the **provenance note** (§0.3.4) and a reviewer-confirmed clean-room check.
- [ ] Any **MIT code** reused from AgenticCRM is quarantined and listed in `THIRD_PARTY_NOTICES.md`
      with its copyright + MIT text; prefer re-implementation.
- [ ] All new third-party libraries are **permissive** (MIT/BSD/Apache-2.0) and recorded.
- [ ] New entity tables are under the **Entity-UID rule**; `verify-entity-uid-rule.mjs` exits 0.
- [ ] Agent tools are **RBAC-scoped server-side** and **audited**; no clinical tools (SaMD fence).
- [ ] Outbound messaging honors **consent + suppression + frequency** gates.
- [ ] **Counsel sign-off** on the WS-B/WS-C clean-room approach before first production ship.

---

## 7. Risks

- **AGPL contamination (highest).** Mitigated by §0.3 clean-room + §6 gate + counsel review. The
  cheapest safe path is to treat brightbean as a *product-requirements reference only*.
- **Agent blast radius.** A tool-calling operator acting on real CRM data → mitigated by RBAC
  inheritance, per-call audit, confirm-step/dry-run for writes and bulk ops, circuit breaker.
- **Scope creep into clinical (SaMD).** The agent and flows are administrative; a hard fence keeps
  them out of diagnosis/triage, which would otherwise pull them under SaMD governance.
- **Social-channel compliance.** Meta API policy + opt-in/opt-out + WhatsApp template rules; handled
  in WS-C via existing consent/suppression infra.

---

## Appendix — observed capabilities (requirements reference, not their code)

Documented from READMEs / public module surface, to be implemented independently per §0.

**AgenticCRM (MIT) — adopt the pattern:** granular AI tool catalog over CRM entities; bounded tool
chains; circuit breaker + auto-escalation; provider fallback; agent memory; inline tool-call
rendering in a chat UI.

**brightbean-chat (AGPL — concept only, clean-room):** versioned branching visual flow builder;
standard automation node types (condition/delay/randomizer/nested/external-request/data-collection/
action/hand-to-human); cross-channel contact identity; social-growth triggers (comment-to-DM, story
mentions, follows, ref-URL/QR); shared inbox with human-takeover-pauses-automation, scheduled replies,
inbox rules, reminders; WhatsApp template lifecycle; opt-out enforcement + contact erasure.

**Not adopted:** Hospital-CRM/VitaCare — fully subsumed by mediqzy; nothing to take.
