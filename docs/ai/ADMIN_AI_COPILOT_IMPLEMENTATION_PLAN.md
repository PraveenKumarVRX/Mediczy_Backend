# Admin AI Copilot — Implementation Plan

**Version:** 1.0  
**Date:** 2026-06-14  
**Classification:** Internal — Product & Engineering  
**Status:** Implemented (Phases 0–5) — 2026-06-16  
**Owner:** Platform / AI Engineering  
**Related docs:**
- [CLAUDE.md](../../CLAUDE.md) — SaMD governance rules
- [SAMD_READINESS_SCORECARD.md](./SAMD_READINESS_SCORECARD.md)
- [AI_GOVERNANCE_AND_AUTH_HARDENING.md](./AI_GOVERNANCE_AND_AUTH_HARDENING.md)
- [AI_INTERPRETABILITY_AND_QUALITY_GATES.md](./AI_INTERPRETABILITY_AND_QUALITY_GATES.md)
- [HMIS_PATIENT_JOURNEY_IMPLEMENTATION_PLAN.md](../../HMIS_PATIENT_JOURNEY_IMPLEMENTATION_PLAN.md) §29.3 (copilot personas)
- [MEDIQZY_V2_IMPLEMENTATION_ROADMAP.md](../architecture/MEDIQZY_V2_IMPLEMENTATION_ROADMAP.md)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Goals and Non-Goals](#2-goals-and-non-goals)
3. [Current State Audit](#3-current-state-audit)
4. [Target Architecture](#4-target-architecture)
5. [Copilot Personas](#5-copilot-personas)
6. [Implementation Phases](#6-implementation-phases)
7. [Phase 0 — Prerequisites and Gap Closure](#7-phase-0--prerequisites-and-gap-closure)
8. [Phase 1 — MVP Admin Copilot UI](#8-phase-1--mvp-admin-copilot-ui)
9. [Phase 2 — System Tools for Admin Agent](#9-phase-2--system-tools-for-admin-agent)
10. [Phase 3 — Safety, Audit, and SIB Hardening](#10-phase-3--safety-audit-and-sib-hardening)
11. [Phase 4 — Specialized Personas and RAG](#11-phase-4--specialized-personas-and-rag)
12. [Phase 5 — Streaming, Approvals, and Production Hardening](#12-phase-5--streaming-approvals-and-production-hardening)
13. [API Contracts](#13-api-contracts)
14. [Frontend Specification](#14-frontend-specification)
15. [System Tools Specification](#15-system-tools-specification)
16. [Security, RBAC, and SaMD Boundaries](#16-security-rbac-and-samd-boundaries)
17. [Database and Audit Schema](#17-database-and-audit-schema)
18. [Testing and Acceptance Criteria](#18-testing-and-acceptance-criteria)
19. [Rollout and Feature Flags](#19-rollout-and-feature-flags)
20. [Risks and Mitigations](#20-risks-and-mitigations)
21. [Open Questions](#21-open-questions)
22. [File Checklist](#22-file-checklist)

---

## 1. Executive Summary

Mediqzy already has the **backend foundation** for admin AI copilots:

- A privileged **Admin Agent** in the multi-agent AI brain
- `POST /api/v3/ai-brain/agents/process` with permission-checked `forceAgent`
- Unified LLM routing via `llm-provider.js`
- Admin AI dashboards (analytics, governance, SIB guard, feedback intelligence)
- Proven floating-assistant UI patterns (`DietaryAIAssistant.tsx`, `DrISHAChat.tsx`)

What is **missing**:

| Gap | Impact |
|-----|--------|
| No `/admin/copilot` UI | Admins cannot use the Admin Agent |
| System tools not implemented | Admin Agent cannot answer ops/audit questions |
| `/agents/process` not in SIB guard | Bypasses kill switch / rate limits |
| No human-approval UI for high-risk writes | Governance standard not enforced in UX |
| Feedback Intelligence hidden from sidebar | Ops team cannot discover prompt management |
| `medical_director` not mapped in agent engine | Governance reviewers lack agent identity |

**Recommended first slice:** Phase 0 + Phase 1 — a read-only admin copilot chat page wired to `forceAgent: "admin"`, with no new LLM routes.

**Estimated scope (technical, not calendar):**

| Phase | New files | Modified files | Risk |
|-------|-----------|----------------|------|
| 0 | 0–1 | 2–3 | Low |
| 1 | 3–4 | 3 | Low |
| 2 | 1–2 | 2–3 | Medium |
| 3 | 1–2 | 4–5 | Medium |
| 4 | 2–3 | 3–4 | Medium |
| 5 | 3–5 | 5–8 | High |

---

## 2. Goals and Non-Goals

### Goals

1. Give hospital/platform admins a **conversational interface** for ops tasks (tenant stats, user lookup, governance queue, system health).
2. Reuse existing **AI Brain multi-agent stack** — no parallel copilot backend.
3. Enforce **RBAC/ABAC** via `agent-permission-engine.js` before any agent runs.
4. Meet **AI governance audit standards** per `AI_GOVERNANCE_AND_AUTH_HARDENING.md`.
5. Keep default copilot mode **non-clinical** (NOT SaMD) unless explicitly surfacing clinical AI outputs with interpretability.
6. Provide a path to **specialized personas** (Revenue, Quality, Ops) without duplicating infrastructure.

### Non-Goals (v1)

- Replacing `AdminChatDashboard` (human omnichannel support at `/admin/chat`)
- Building a separate LLM provider or bypassing `llm-provider.js`
- Autonomous execution of high-risk writes (refunds, tenant changes, prescriptions) without human approval
- Patient-facing copilot (see HMIS plan §29.3 for Patient Concierge — separate workstream)
- NestJS `nestjs-app/src/ai-brain/` — production remains Express `/api/v3/ai-brain`
- GitHub Copilot dev workflow docs (`.github/copilot-*.md`) — unrelated

---

## 3. Current State Audit

### 3.1 Backend — Ready to Reuse

| Component | Path | Status |
|-----------|------|--------|
| Admin Agent definition | `server/services/ai-brain/agent-registry.js` | ✅ Defined |
| Multi-agent orchestrator | `server/services/ai-brain/multi-agent-orchestrator.js` | ✅ Production |
| Permission engine | `server/services/ai-brain/agent-permission-engine.js` | ✅ Production |
| LLM provider cascade | `server/services/ai-brain/llm-provider.js` | ✅ Production |
| Agent process route | `server/routes/ai-brain.route.js` → `POST /agents/process` | ✅ Production |
| Agent run persistence | `ai_agent_runs` table (via orchestrator) | ✅ Production |
| RAG pipeline | `server/services/ai-brain/rag-pipeline.js` | ✅ Production |
| Governance APIs | `server/routes/ai-governance.route.js` | ✅ Production |
| AI analytics APIs | `/api/v3/ai-analytics/*` | ✅ Production |
| SIB guard | `server/middleware/sib-ai-guard.middleware.js` | ⚠️ Missing `/agents/process` |
| System tools | `server/services/ai-brain/tools/` | ❌ Not implemented |

### 3.2 Backend — Role Mapping

JWT role → agent role (`agent-permission-engine.js`):

| JWT role | Agent role | Can invoke Admin Agent? |
|----------|------------|-------------------------|
| `super_admin`, `superadmin` | `platform_admin` | ✅ All capabilities |
| `admin`, `hospital_admin`, `manager` | `hospital_admin` | ✅ `INVOKE_ADMIN_AGENT` |
| `doctor`, `nurse`, `analyst`, etc. | Respective roles | ❌ No admin agent |

**Note:** `medical_director` has governance API access but **no explicit agent-role mapping** — add in Phase 3.

### 3.3 Frontend — Ready to Reuse

| Component | Path | Reuse for |
|-----------|------|-----------|
| Floating assistant panel | `client/src/components/dietary/DietaryAIAssistant.tsx` | Layout, tool tabs, chat UX |
| Chat message rendering | `client/src/components/DrISHAChat.tsx` | Markdown, copy, voice |
| Admin layout + nav | `client/src/components/layout/AdminLayout.tsx` | Sidebar section |
| Admin route guard | `client/src/routes/index.tsx` → `AdminRoute` | Auth wrapper |
| AI governance dashboard | `client/src/pages/admin/AIGovernanceDashboard.tsx` | Deep links from copilot |
| AI analytics dashboard | `client/src/pages/admin/AIAnalyticsDashboard.tsx` | Deep links from copilot |
| Feedback intelligence | `client/src/pages/admin/FeedbackIntelligenceDashboard.tsx` | Route exists; not in sidebar |

### 3.4 Frontend — Missing

| Item | Path (proposed) |
|------|-----------------|
| Admin copilot page | `client/src/pages/admin/AdminCopilot.tsx` |
| API client | `client/src/services/adminCopilot.ts` |
| Route | `/admin/copilot` in `client/src/routes/index.tsx` |
| Nav item | `AdminLayout.tsx` under AI Intelligence |

### 3.5 Confusingly Named (Do Not Merge)

| Name | Actual purpose |
|------|----------------|
| `AdminChatDashboard` | Human support chat (RocketChat-style) |
| B2B email copilot | `server/services/ai-email-arg.service.js` — sales team portal |
| `DrISHAChat` | Patient medical AI |

---

## 4. Target Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Admin Frontend                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ AdminCopilot │  │ AIGovernance │  │ AIAnalytics / SIB    │  │
│  │ /admin/      │  │ Dashboard    │  │ Guard dashboards     │  │
│  │ copilot      │  │              │  │ (linked, not replaced)│  │
│  └──────┬───────┘  └──────────────┘  └──────────────────────┘  │
└─────────┼────────────────────────────────────────────────────────┘
          │ Authorization: Bearer adminToken
          ▼
┌─────────────────────────────────────────────────────────────────┐
│  Express Middleware Chain                                        │
│  authUser → sibAIGuard → attachAIReporter                       │
└─────────┬───────────────────────────────────────────────────────┘
          ▼
┌─────────────────────────────────────────────────────────────────┐
│  POST /api/v3/ai-brain/agents/process                           │
│  Body: { message, conversationId?, contextMessages?, forceAgent? }│
└─────────┬───────────────────────────────────────────────────────┘
          ▼
┌─────────────────────────────────────────────────────────────────┐
│  agent-permission-engine.resolveIdentity(req)                   │
│  → validateAgentAccess(forceAgent, identity)                    │
│  → filterPermittedTools(agent, identity)                        │
└─────────┬───────────────────────────────────────────────────────┘
          ▼
┌─────────────────────────────────────────────────────────────────┐
│  multi-agent-orchestrator.processRequest()                      │
│  → Admin Agent (or planner-selected agent)                      │
│  → Tool loop (max 10 iterations for admin)                      │
│  → llm-provider.chat() — NEVER direct vendor calls              │
│  → Persist ai_agent_runs                                        │
└─────────────────────────────────────────────────────────────────┘
```

### Design principles

1. **One brain, many personas** — use `forceAgent` or task planner; do not fork orchestrators.
2. **Fail closed** — permission denied → 403 before any LLM call.
3. **Read before write** — system tools and copilot v1 default to read-only; writes need approval UI.
4. **Observable by default** — show `agentsUsed`, `taskPlan`, tool calls in admin UI.
5. **Link, don't duplicate** — governance approvals, kill switch, prompt promotion stay in existing dashboards.

---

## 5. Copilot Personas

Aligned with `HMIS_PATIENT_JOURNEY_IMPLEMENTATION_PLAN.md` §29.3 and existing agent registry.

| Persona ID | UI label | `forceAgent` | Primary users | SaMD class | Phase |
|------------|----------|--------------|---------------|------------|-------|
| `ops` | Admin Copilot | `admin` | `super_admin`, `admin` | NOT SaMD | 1 |
| `analytics` | Analytics Copilot | `analyst` | admins, data team | NOT SaMD / IIb if population health | 4 |
| `revenue` | Revenue Copilot | `insurance` | billing, TPA desk | NOT SaMD | 4 |
| `quality` | Quality Copilot | `analyst` + governance tools | quality head | IIb if risk outputs | 4 |
| `clinical-oversight` | Clinical Oversight | `clinical` | medical director | Class III if decisions | 5+ (gated) |

**v1 ships only `ops` (Admin Copilot).** Persona selector is a Phase 4 UI addition.

---

## 6. Implementation Phases

```
Phase 0 ──► Phase 1 ──► Phase 2 ──► Phase 3 ──► Phase 4 ──► Phase 5
Prereqs     MVP UI      Sys tools   Safety      Personas    Streaming
```

Each phase has **exit criteria** — do not start the next phase until the previous phase's criteria pass.

---

## 7. Phase 0 — Prerequisites and Gap Closure

**Objective:** Fix discoverability and document baselines before building copilot UI.

### Tasks

| ID | Task | File(s) | Acceptance criteria |
|----|------|---------|---------------------|
| 0.1 | Add Feedback Intelligence to admin sidebar | `client/src/components/layout/AdminLayout.tsx` | Nav item visible under AI Intelligence; links to `/admin/feedback-intelligence` |
| 0.2 | Verify `adminToken` works on `/api/v3/ai-brain/agents/process` | Manual + integration test | `super_admin` gets 200; unauthenticated gets 401; `patient` gets 403 |
| 0.3 | Document baseline agent availability endpoint | — | `GET /api/v3/ai-brain/agents/available` returns `admin` for admin JWT |
| 0.4 | Add model card stub for Admin Copilot | `server/services/ai-model-governance.service.js` → `MODEL_CARDS` | Entry: `admin-copilot`, classification NOT SaMD, owner Platform Eng |

### Exit criteria

- [ ] Admin can reach Feedback Intelligence from sidebar
- [ ] `POST /agents/process` with `forceAgent: "admin"` succeeds for `admin` / `super_admin` JWT
- [ ] Model card entry exists (sync via `POST /api/ai-governance/model-cards/sync`)

---

## 8. Phase 1 — MVP Admin Copilot UI

**Objective:** Read-only conversational admin copilot at `/admin/copilot`.

### 8.1 New files

#### `client/src/services/adminCopilot.ts`

```typescript
// Responsibilities:
// - processMessage(message, conversationId?, contextMessages?, forceAgent?)
// - getAvailableAgents()
// - getAgentHistory(limit?)
// - Attach Authorization: Bearer adminToken from localStorage
// - Base URL: /api/v3/ai-brain
```

**Types to define:**

```typescript
interface AgentProcessRequest {
  message: string;
  conversationId?: number;
  contextMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
  forceAgent?: 'admin' | 'analyst' | 'insurance' | 'clinical';
}

interface AgentProcessResponse {
  success: boolean;
  response: string;
  agentsUsed: string[];
  taskPlan?: object;
  identity?: object;
  meta?: { totalTokens?: number; latencyMs?: number; isMultiAgent?: boolean };
}
```

#### `client/src/pages/admin/AdminCopilot.tsx`

**Layout (copy from `DietaryAIAssistant.tsx`):**

| Region | Content |
|--------|---------|
| Header | "Admin Copilot" + agent badge + link to AI Governance |
| Main | Chat thread (user / assistant bubbles) |
| Sidebar (collapsible) | `agentsUsed`, `taskPlan`, tool call log, latency |
| Footer | Text input + send + quick prompts |
| Quick prompts | See §14.2 |

**Behavior:**

- Default `forceAgent: 'admin'`
- Persist `conversationId` in `sessionStorage` key `adminCopilotConversationId`
- On error 403: show "Insufficient permissions — contact platform admin"
- On error 503 (SIB kill switch): show link to `/admin/ai-guard`
- No write-action confirmation in v1 (copilot is advisory/read-only prompts only)

### 8.2 Modified files

| File | Change |
|------|--------|
| `client/src/routes/index.tsx` | Add route `/admin/copilot` → `<AdminRoute><AdminCopilot /></AdminRoute>` |
| `client/src/components/layout/AdminLayout.tsx` | Add nav: `{ label: 'Admin Copilot', path: '/admin/copilot', icon: Bot, badge: 'New' }` |
| `client/src/pages/admin/index.ts` (if exists) | Export `AdminCopilot` |

### 8.3 Quick prompts (v1)

```
- What agents can I invoke?
- Summarize pending AI governance changes
- Show recent AI agent run history
- What is the current SIB AI guard status?
- How do I onboard a new corporate tenant?
```

(Last prompt will work fully only after Phase 2 system tools + Phase 4 RAG.)

### 8.4 Exit criteria

- [ ] `/admin/copilot` loads inside `AdminLayout` for authenticated admin
- [ ] Chat sends message and displays `response` from API
- [ ] Sidebar shows `agentsUsed` and `meta.latencyMs`
- [ ] Non-admin roles cannot access page (AdminRoute) or API (403)
- [ ] No console errors; mobile layout acceptable (panel stacks)

---

## 9. Phase 2 — System Tools for Admin Agent

**Objective:** Implement tools listed in `agent-registry.js` `T.SYSTEM` so Admin Agent can answer ops questions.

### 9.1 New file: `server/services/ai-brain/tools/system-tools.js`

Register in `server/services/ai-brain/tools/loader.js`.

| Tool name | `isWrite` | `isSystem` | Description | Data source |
|-----------|-----------|------------|-------------|-------------|
| `list_agents` | false | true | Return agent registry metadata (id, name, description, requiredCapability) | `agent-registry.js` |
| `get_system_status` | false | true | DB pool stats, uptime, SIB guard status summary | `pgPool`, env, SIB service |
| `get_audit_logs` | false | true | Recent admin/AI activity | `activity_log`, `ai_agent_runs` |
| `get_agent_metrics` | false | true | Routing stats, telemetry | `GET` logic from `/agents/routing-stats`, `/agents/telemetry` |
| `reload_prompts` | true | true | Invalidate prompt cache | `prompt-optimization-executor` — **requires approval in Phase 5** |
| `configure_agent` | true | true | **v2 only** — read agent config in Phase 2; writes in Phase 5 | `agent-registry.js` read-only |

### 9.2 Tool implementation notes

**`get_audit_logs` parameters:**

```json
{
  "limit": { "type": "integer", "default": 20, "maximum": 100 },
  "category": { "type": "string", "enum": ["ai_agent", "admin_action", "governance", "all"] },
  "since_hours": { "type": "integer", "default": 24 }
}
```

**Tenant scoping:** Non-`platform_admin` identities must filter logs to their `tenant_id`.

**`get_system_status`:** Must NOT expose secrets, API keys, or raw connection strings.

### 9.3 Extend `tools/index.js`

Add `isSystem` flag to tool registration (if not present):

```javascript
register({
  name: 'get_audit_logs',
  category: 'system',
  isWrite: false,
  isSystem: true,
  // ...
});
```

Ensure `filterPermittedTools()` in permission engine strips `isSystem` tools unless identity has `EXEC_SYSTEM_TOOLS`.

### 9.4 Exit criteria

- [ ] All read-only system tools registered and callable by Admin Agent
- [ ] `admin` JWT can ask "show last 10 AI agent runs" and get real data
- [ ] `doctor` JWT cannot execute system tools even if clinical agent invoked
- [ ] Tools appear in `GET /api/v3/ai-brain/tools` list with `isSystem: true`

---

## 10. Phase 3 — Safety, Audit, and SIB Hardening

**Objective:** Align copilot with governance standards and production safety controls.

### 10.1 SIB guard coverage

**File:** `server/middleware/sib-ai-guard.middleware.js`

Add route pattern:

```javascript
{ method: 'POST', pattern: /^\/api\/v3\/ai-brain\/agents\/process/, type: AI_DECISION_TYPES.AI_QUERY },
```

Consider stricter rate limit for `forceAgent === 'admin'` (config in SIB dashboard).

### 10.2 Audit metadata extension

**File:** `server/services/ai-brain/multi-agent-orchestrator.js`

When persisting `ai_agent_runs`, extend `metadata` JSON:

```json
{
  "copilot_type": "ops",
  "tenant_id": "<uuid>",
  "action_category": "read",
  "force_agent": true,
  "safety_classification": "admin-action",
  "prompt_version": "<name@version>"
}
```

### 10.3 Medical director role mapping

**File:** `server/services/ai-brain/agent-permission-engine.js`

Map `medical_director` → capabilities:

- `INVOKE_ANALYST_AGENT`, `INVOKE_CLINICAL_AGENT`
- `READ_ANALYTICS`, `VIEW_AUDIT_LOGS`
- NOT `INVOKE_ADMIN_AGENT` unless explicitly granted via `ai_user_agent_grants`

### 10.4 Safety classification

Pass `safety_classification: 'admin-action'` to evaluation engine / audit log for all `/agents/process` calls with `forceAgent: 'admin'`.

### 10.5 Exit criteria

- [ ] SIB kill switch blocks `/agents/process`
- [ ] `ai_agent_runs.metadata` contains `copilot_type` and `safety_classification`
- [ ] `medical_director` resolves to correct capabilities
- [ ] Audit log queryable from governance dashboard filters

---

## 11. Phase 4 — Specialized Personas and RAG

**Objective:** Persona selector + internal knowledge base for ops runbooks.

### 11.1 Persona selector UI

Add dropdown in `AdminCopilot.tsx`:

| Selection | `forceAgent` | Visible to |
|-----------|--------------|------------|
| Ops (default) | `admin` | `admin`, `super_admin` |
| Analytics | `analyst` | `admin`, `super_admin` |
| Revenue | `insurance` | `admin`, billing roles |
| Quality | `analyst` | `admin`, quality roles |

Omit `clinical` from default admin copilot — use separate gated route `/admin/copilot/clinical` in Phase 5.

### 11.2 Admin RAG corpus

Upload via existing endpoint:

```
POST /api/v3/ai-brain/documents
```

**Document types for admin copilot:**

- Tenant onboarding SOPs
- Module access control guide (`docs/admin/ADMIN_TENANT_MANAGEMENT_GUIDE.md` content)
- API credentials setup guide
- Governance workflow (PCCP approval steps)
- WhatsApp / communication setup runbooks

**Tag documents** with `category: 'admin-ops'` for filtered RAG retrieval.

### 11.3 Deep links from copilot responses

When copilot mentions governance, render action chips:

- "View pending changes" → `/admin/ai-governance`
- "Open AI Guard" → `/admin/ai-guard`
- "Manage prompts" → `/admin/feedback-intelligence/prompts`

### 11.4 Exit criteria

- [ ] Persona selector switches `forceAgent` and updates UI label
- [ ] Admin docs retrievable via `search_knowledge_base` tool
- [ ] Copilot answers tenant onboarding questions from RAG without hallucinating steps

---

## 12. Phase 5 — Streaming, Approvals, and Production Hardening

**Objective:** Production-grade UX and human-in-the-loop for writes.

### 12.1 SSE streaming

Reuse pattern from `POST /api/v3/ai-brain/think/stream` for `/agents/process/stream` (new route).

**File:** `server/routes/ai-brain.route.js`

Emit events: `token`, `tool_start`, `tool_end`, `agent_switch`, `done`, `error`.

**Client:** `adminCopilot.ts` → `processMessageStream()` with `EventSource` or `fetch` + `ReadableStream`.

### 12.2 Human approval modal

For tools with `isWrite: true` or `isSystem: true` + write:

1. Orchestrator pauses before `execute()`
2. Returns `{ pendingApproval: true, actionId, summary }`
3. UI shows modal: Approve / Reject
4. `POST /api/v3/ai-brain/agents/approve-action` resumes or cancels

**High-risk actions (from governance doc):**

- Tenant/admin changes
- Refunds/payments
- Prompt promotion (link to existing governance flow instead of direct write)
- `reload_prompts`, `configure_agent` writes

### 12.3 Clinical oversight copilot (optional, gated)

Route: `/admin/copilot/clinical`  
Requires: `medical_director` or `super_admin`  
When surfacing Class III outputs:

- Call `qualityGates.checkXxx()`
- Display `interpretabilityService` SHAP/LIME via `/api/ai-governance/patient/:id/explanation`
- Log to `ai_quality_gate_log`

### 12.4 Feature flag

```env
ADMIN_COPILOT_ENABLED=true
ADMIN_COPILOT_STREAMING=true
ADMIN_COPILOT_WRITE_ACTIONS=false  # default false until approval UI tested
```

### 12.5 Exit criteria

- [ ] Streaming works end-to-end for admin copilot
- [ ] Write tools blocked without approval when flag enabled
- [ ] Load test: 10 concurrent admin sessions without rate-limit false positives
- [ ] SaMD readiness scorecard updated if clinical oversight shipped

---

## 13. API Contracts

### 13.1 Primary — Process message

```
POST /api/v3/ai-brain/agents/process
Authorization: Bearer <adminToken>
Content-Type: application/json

{
  "message": "Show pending governance changes",
  "conversationId": 12345,
  "contextMessages": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ],
  "forceAgent": "admin"
}
```

**Success 200:**

```json
{
  "success": true,
  "response": "...",
  "agentsUsed": ["admin"],
  "taskPlan": { "intent": "admin", "tasks": [...] },
  "identity": { "role": "hospital_admin", "userId": "..." },
  "meta": { "totalTokens": 1200, "latencyMs": 3400, "isMultiAgent": false }
}
```

**Errors:**

| Status | Code | When |
|--------|------|------|
| 400 | — | Missing/empty message |
| 401 | — | No valid JWT |
| 403 | `AGENT_ACCESS_DENIED` | Role cannot invoke agent |
| 429 | — | SIB rate limit |
| 503 | — | SIB kill switch active |

### 13.2 Supporting endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v3/ai-brain/agents/available` | Agents caller can invoke |
| GET | `/api/v3/ai-brain/agents/history` | Past runs for caller |
| GET | `/api/v3/ai-brain/agents/all` | Full registry (admin only) |
| GET | `/api/ai-governance/changes/pending` | Pending PCCP changes |
| GET | `/api/ai-governance/dashboard` | Governance overview |
| GET | `/api/sib/ai-dashboard` | SIB status |
| GET | `/api/v3/ai-analytics/overview` | LLM ops summary |

---

## 14. Frontend Specification

### 14.1 Component tree

```
AdminCopilot.tsx
├── AdminPageHeader (title, description)
├── CopilotChatPanel
│   ├── MessageList (reuse DrISHAChat markdown renderer)
│   ├── QuickPromptBar
│   └── ChatInput
├── CopilotInspector (sidebar)
│   ├── AgentsUsedBadge
│   ├── TaskPlanViewer (JSON collapsible)
│   ├── ToolCallLog
│   └── MetaStats (latency, tokens)
├── PersonaSelector (Phase 4)
└── ApprovalModal (Phase 5)
```

### 14.2 Visual design

- Match existing admin AI section: violet accent (`text-violet-500`, `bg-violet-500/10`)
- Icon: `Bot` from lucide-react (consistent with `DietaryAIAssistant`)
- Badge: "Ops" / "Admin Agent" in header
- Disclaimer footer: "AI-assisted ops tool. Verify critical actions in governance dashboard."

### 14.3 Auth

Use `adminToken` from `localStorage` (same as other admin pages).  
Verify both `@/utils/api` and `@/lib/api` interceptors attach token — prefer one client in `adminCopilot.ts`.

### 14.4 Accessibility

- Keyboard: Enter to send, Shift+Enter for newline
- `aria-live="polite"` on assistant message region
- Focus trap in approval modal (Phase 5)

---

## 15. System Tools Specification

### 15.1 `list_agents`

**Returns:** Array of `{ id, name, description, requiredCapability, llmTier }` — no `systemPromptSuffix` (internal).

### 15.2 `get_audit_logs`

**SQL sources:**

- `ai_agent_runs` — `created_at`, `agent_id`, `metadata`, `user_id`
- `activity_log` — if admin actions logged there

**PHI rule:** Do not return patient-identifiable fields in admin copilot audit responses unless caller has `READ_PATIENT_DATA` and query is scoped.

### 15.3 `get_system_status`

**Returns:**

```json
{
  "database": { "poolTotal": 20, "poolIdle": 15, "healthy": true },
  "uptime_seconds": 86400,
  "sib": { "killSwitchActive": false, "circuitBreakerOpen": false },
  "ai_brain": { "registeredTools": 45, "registeredAgents": 7 }
}
```

### 15.4 `get_agent_metrics`

Delegate to internal functions used by `/agents/routing-stats` and `/agents/telemetry` — do not duplicate SQL.

---

## 16. Security, RBAC, and SaMD Boundaries

### 16.1 SaMD classification matrix

| Copilot behavior | Classification | Required controls |
|------------------|----------------|-------------------|
| Tenant config Q&A, user lookup, audit logs | NOT SaMD | Standard audit logging |
| Population health analytics summaries | Class IIb | Confidence scores if risk-related |
| Surfacing triage/risk/drug outputs | Inherits source component | Quality gates + SHAP/LIME |
| AI-driven clinical decisions | Class III | Full SaMD pipeline — **out of v1 scope** |

### 16.2 Mandatory governance (clinical-adjacent only)

Per `CLAUDE.md`:

1. `qualityGates.checkXxx()` from `server/services/ai-quality-gates.service.js`
2. `interpretabilityService.computeConfidenceScore()`
3. SHAP/LIME explanations
4. Log to `ai_quality_gate_log`
5. Model changes via `governanceService.proposeChange()` only

### 16.3 Tenant isolation

All tools and RAG queries must respect `req.user.tenant_id` unless `platform_admin`.

### 16.4 PHI handling

- Redact PHI before external LLM calls (existing brain pipeline)
- Admin copilot system prompt: "Do not expose patient names in summaries unless explicitly requested for a specific patient lookup."

---

## 17. Database and Audit Schema

### 17.1 Existing tables (no migration required for Phase 1)

- `ai_agent_runs` — run history
- `ai_quality_gate_log` — clinical gates
- `ai_model_change_log` — PCCP
- `ai_user_agent_grants` — per-user capability overrides

### 17.2 Optional migration (Phase 3)

If `ai_agent_runs.metadata` is insufficient, add columns:

```sql
ALTER TABLE ai_agent_runs
  ADD COLUMN IF NOT EXISTS copilot_type VARCHAR(32),
  ADD COLUMN IF NOT EXISTS safety_classification VARCHAR(64);
```

Prefer JSON `metadata` first to avoid migration.

### 17.3 Pending approvals table (Phase 5)

```sql
CREATE TABLE ai_copilot_pending_actions (
  id SERIAL PRIMARY KEY,
  action_id UUID NOT NULL UNIQUE,
  user_id INTEGER NOT NULL,
  tenant_id UUID,
  agent_id VARCHAR(32) NOT NULL,
  tool_name VARCHAR(64) NOT NULL,
  tool_params JSONB NOT NULL,
  summary TEXT NOT NULL,
  status VARCHAR(16) DEFAULT 'pending', -- pending | approved | rejected | expired
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by INTEGER
);
```

---

## 18. Testing and Acceptance Criteria

### 18.1 Unit tests

| Area | File | Cases |
|------|------|-------|
| Permission engine | `agent-permission-engine.test.js` | admin/super_admin can invoke admin agent; doctor cannot |
| System tools | `system-tools.test.js` | tenant scoping on audit logs |
| API client | `adminCopilot.test.ts` | token attachment, error mapping |

### 18.2 Integration tests

| Scenario | Expected |
|----------|----------|
| Admin asks "list agents" | Response mentions 7 agents |
| Doctor JWT + `forceAgent: admin` | 403 |
| SIB kill switch on | 503 with message |
| Empty message | 400 |

### 18.3 Manual QA checklist

- [ ] Login as `super_admin` → copilot works
- [ ] Login as `admin` → copilot works
- [ ] Login as `doctor` → page blocked or API 403
- [ ] Kill switch → graceful error + link to AI Guard
- [ ] Long conversation (20+ turns) → context handled via `contextMessages`
- [ ] Mobile viewport → usable

### 18.4 SaMD regression (if Phase 5 clinical oversight)

Run existing AI safety regression suite per `AI_GOVERNANCE_AND_AUTH_HARDENING.md` release gate.

---

## 19. Rollout and Feature Flags

### 19.1 Rollout stages

| Stage | Audience | Flags |
|-------|----------|-------|
| Internal | Engineering + `super_admin` | `ADMIN_COPILOT_ENABLED=true` |
| Pilot | 1–2 hospital admins | + audit review |
| GA | All `admin` / `super_admin` | Default on |

### 19.2 Monitoring

Dashboards to watch:

- `/admin/ai-analytics` — token usage spike
- `/admin/ai-guard` — rate limit hits
- `ai_agent_runs` — error rate by `copilot_type`

### 19.3 Rollback

1. Set `ADMIN_COPILOT_ENABLED=false`
2. Activate SIB kill switch for `/agents/process` if needed
3. Hide nav item via env or feature flag

---

## 20. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Admin Agent executes patient write tools without approval | Medium | High | Phase 5 approval UI; v1 quick prompts are read-only |
| PHI leakage in audit log tool | Medium | High | Tenant scoping + field allowlist |
| Confusion with human chat at `/admin/chat` | High | Low | Clear naming "Admin Copilot" + disclaimer |
| `admin` mapped to `hospital_admin` limits platform ops | Medium | Medium | Use `super_admin` for platform-wide ops; document |
| System tools expose infrastructure details | Low | Medium | Allowlist fields in `get_system_status` |
| LLM hallucinates governance steps | Medium | Medium | Phase 4 RAG on official docs |
| `/agents/process` bypasses SIB | High | Medium | Phase 3 guard coverage |

---

## 21. Open Questions

| # | Question | Owner | Decision needed by |
|---|----------|-------|-------------------|
| 1 | Should `hospital_admin` invoke write patient tools via copilot? | Product + Medical | Before Phase 5 |
| 2 | Separate copilot page per persona vs. single page with selector? | Design | Phase 4 |
| 3 | Use `POST /think` SSE instead of new `/agents/process/stream`? | Engineering | Phase 5 |
| 4 | Add `medical_director` to `INVOKE_ADMIN_AGENT`? | Compliance | Phase 3 |
| 5 | Floating widget vs. full-page copilot for admin? | Design | Phase 1 — **recommend full page** |
| 6 | Integrate with HyperGrid Integration Copilot (`docs/hospital/HYPERGRID_ARCHITECTURE.md`)? | Platform | Post Phase 5 |

---

## 22. File Checklist

### Create

- [ ] `docs/ai/ADMIN_AI_COPILOT_IMPLEMENTATION_PLAN.md` (this document)
- [ ] `client/src/pages/admin/AdminCopilot.tsx`
- [ ] `client/src/services/adminCopilot.ts`
- [ ] `server/services/ai-brain/tools/system-tools.js`
- [ ] `server/migrations/admin-copilot-pending-actions.migration.js` (Phase 5, optional)

### Modify

- [ ] `client/src/routes/index.tsx` — route
- [ ] `client/src/components/layout/AdminLayout.tsx` — nav items (copilot + feedback intelligence)
- [ ] `server/services/ai-brain/tools/loader.js` — import system tools
- [ ] `server/middleware/sib-ai-guard.middleware.js` — `/agents/process`
- [ ] `server/services/ai-brain/multi-agent-orchestrator.js` — audit metadata
- [ ] `server/services/ai-brain/agent-permission-engine.js` — medical_director mapping
- [ ] `server/services/ai-model-governance.service.js` — model card entry
- [ ] `server/routes/ai-brain.route.js` — streaming route (Phase 5)

### Reference (read-only)

- `server/services/ai-brain/agent-registry.js`
- `server/services/ai-brain/llm-provider.js`
- `client/src/components/dietary/DietaryAIAssistant.tsx`
- `client/src/components/DrISHAChat.tsx`
- `client/src/pages/admin/AIGovernanceDashboard.tsx`

---

## Appendix A — Example curl (Phase 1 verification)

```bash
# Replace TOKEN with a valid admin JWT
curl -s -X POST http://localhost:5000/api/v3/ai-brain/agents/process \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What agents are available to me?",
    "forceAgent": "admin"
  }' | jq .
```

## Appendix B — Model card entry (draft)

Add to `MODEL_CARDS` in `ai-model-governance.service.js`:

```javascript
{
  id: 'admin-copilot',
  name: 'Admin AI Copilot',
  version: '1.0.0',
  type: 'conversational-agent',
  samdClass: 'NOT_SaMD',
  description: 'Privileged ops assistant for hospital/platform administrators. Default mode: configuration, analytics, audit — not clinical decision support.',
  owner: 'Platform Engineering',
  inputs: ['admin natural language query', 'conversation context', 'ops RAG documents'],
  outputs: ['natural language response', 'tool call results'],
  humanOversight: 'Required for all write/system configuration actions',
  lastValidated: null,
}
```

---

*Document created for deferred implementation. Update version and status fields when work begins.*
