# MediQzy v2.0 - Feasibility Assessment and Phased Implementation Plan

**Date:** May 15, 2026  
**Source roadmap:** `MEDIQZY_V2_IMPLEMENTATION_ROADMAP.md`  
**Purpose:** Convert the strategic v2.0 blueprint into an execution plan grounded in the current repository state.

---

## 1. Executive Decision

The v2.0 roadmap is feasible, but it should not be executed in the original tier order without adjustment.

The best delivery strategy is:

1. Close enterprise deal blockers first.
2. Productize partially built modules before starting speculative AI work.
3. Build shared platform primitives once, then reuse them across later features.
4. Keep Tier 4 research-heavy features out of the near-term commitment path.

The immediate goal should be **enterprise readiness**, not maximum feature count.

---

## 2. Current-State Reconciliation

The May 7 roadmap is directionally correct, but several items have changed or were more advanced than the document implied.

| Area | Roadmap Position | Current Repository Reality | Feasibility Implication |
|---|---|---|---|
| Dietary / Nutrition | Future Tier 2 module | Backend AI workflows plus dedicated frontend pages already exist | Treat as **hardening + workflow completion**, not greenfield |
| Blood Bank | Future Tier 1 module | Login/model/controller shell exists; no meaningful business workflow found | Still a **true build item** |
| CSSD | Future Tier 2 module | Login/model/controller shell exists; route is effectively auth-only | Still a **true build item** |
| Procurement | Future Tier 3 module | Login/model/controller shell exists; route is effectively auth-only | Still a **true build item** |
| Payroll | Future Tier 3 module | HR and Accounts payroll pages already exist | Reclassify as **integration/completion**, not net-new |
| Tariff | Future Tier 3 module | Insurance tariff surfaces exist, but not a generalized billing tariff engine | Still required before billing automation |
| Readmission Risk | Future Tier 1 UI feature | Backend model and insight plumbing exist | High-feasibility UI/productization task |
| Autosave | Future Tier 1 | Draft concepts exist in isolated screens, no generic clinical autosave framework | Needs shared framework work |
| Ambient Scribe | Future Tier 1 | Offline scribe stack exists, streaming workflow not found | Feasible but technically riskier than described |
| Sepsis / Deterioration Alerts | Future Tier 1 | Alert-adjacent services exist, no dedicated NEWS2/qSOFA engine found | Feasible, clinically sensitive, needs validation |

### Readiness Categories

| Category | Meaning | Examples |
|---|---|---|
| **Productize** | Core capability exists; needs UI, workflow, QA, and packaging | Dietary, payroll, readmission badge |
| **Build** | Some scaffolding exists, but core workflow is missing | Blood Bank, CSSD, Procurement, Tariff |
| **Platform primitive** | Shared capability needed by multiple later features | Clinical event bus, autosave framework, audit trail, alert routing |
| **Research / partner-dependent** | Feasible only with data, external integrations, or regulatory work | Voice biometrics, RWE, pharmacogenomics, AR planning |

---

## 3. Feasibility Assessment

### 3.1 High Feasibility, High Priority

These should be committed first because they either unblock enterprise sales or reuse infrastructure that already exists.

| Initiative | Feasibility | Why |
|---|---|---|
| Blood Bank full module | High | Well-understood workflow, necessary for tertiary hospitals |
| Autosave for clinical inputs | High | Mostly application architecture work, broad product value |
| Readmission risk badge | High | Backend already exists; mostly UI + workflow |
| Dietary workflow completion | High | Existing backend/frontend reduce delivery risk |
| Tariff master | High | Conventional domain model; major billing unlock |
| PREMS / patient feedback | High | Existing omnichannel stack can carry surveys |
| NABH document templates | High | Mostly template, workflow, and audit work |
| Implementation runbook | High | Documentation and delivery discipline, not code-heavy |

### 3.2 Medium Feasibility, Strong Differentiation

These are realistic after the enterprise-readiness layer is stable.

| Initiative | Feasibility | Main Risk |
|---|---|---|
| Ambient scribe streaming | Medium | Streaming UX, latency, audio quality, clinician trust |
| Auto clinical coding | Medium | Mapping quality, billing correctness, review workflow |
| Sepsis / deterioration alerts | Medium | Clinical validation, false positives, escalation design |
| NL patient cohort search | Medium | SQL safety, RLS guarantees, explainability |
| CSSD | Medium | Operational workflow depth and OT integration |
| Clinical trial matching | Medium | CTRI data quality / sync model |
| Wound tracking AI | Medium | Measurement reliability and photo standardization |
| SDoH screening | Medium | Workflow adoption and downstream ownership |

### 3.3 Lower Near-Term Feasibility

These are viable, but they should remain outside the first commercial implementation promise.

| Initiative | Feasibility | Reason to Defer |
|---|---|---|
| Voice biometric ID | Low-medium | Model accuracy, consent, spoofing, field conditions |
| Predictive staffing | Medium | Requires enough clean historical operational data |
| Antibiogram network | Medium | Needs LIS normalization and sustained data volume |
| RWE platform | Medium-long | Privacy, governance, pricing, partner onboarding |
| Digital pathology AI | Medium-long | Dataset, validation, specialist acceptance |
| Pharmacogenomics | Medium-long | External knowledge sources and interpretation risk |
| Predictive revenue cycle AI | Medium-long | Needs claim outcomes history |
| AR surgical planning | Low near-term | Heavy R&D, hardware, workflow validation |
| Ambient smart room | Low-medium | Hardware rollout and hospital infrastructure |

---

## 4. Recommended Phase Model

### Phase 0 - Baseline and Architecture Control

**Duration:** 2 weeks  
**Goal:** Remove uncertainty before feature construction.

Deliverables:

1. Freeze an updated v2.0 capability matrix: `built`, `partial`, `shell`, `missing`.
2. Decide canonical ownership for clinical events, audit logging, drafts, and alerts.
3. Define FHIR-compatible data contracts for all new clinical modules.
4. Create enterprise demo scope and acceptance criteria.
5. Set release discipline: feature flags, migration plan, QA gates, rollback plan.

Exit criteria:

- No roadmap item remains ambiguously classified.
- Architecture review completed for event bus, drafts, notifications, and clinical AI review loops.

### Phase 1 - Enterprise Readiness Foundation

**Duration:** 6 to 8 weeks  
**Goal:** Become contract-ready for a serious tertiary hospital deployment.

Scope:

1. Blood Bank full workflow
2. Generic clinical autosave framework
3. Dietary workflow completion
4. Tariff master MVP
5. PREMS / patient feedback loop
6. NABH templates and implementation runbook
7. Readmission risk badge at discharge

Why this phase first:

- These items directly answer the enterprise deal blockers listed in the roadmap.
- They are largely deterministic engineering problems.
- They create visible completeness across clinical, finance, and patient-experience domains.

Expected outcome:

- Stronger MGM/enterprise demo
- Lower implementation risk
- Clearer paperless workflow story

### Phase 2 - Clinical Intelligence Layer

**Duration:** 8 to 10 weeks  
**Goal:** Turn existing AI infrastructure into doctor-facing workflow advantages.

Scope:

1. Clinical event bus
2. Sepsis / deterioration alert engine
3. Auto clinical coding
4. Natural-language cohort search
5. Ambient scribe streaming MVP
6. Care-plan suggestion from readmission risk

Dependencies:

- Phase 1 autosave and audit primitives
- Alert routing standards
- Billing integration points from tariff master

Exit criteria:

- Every AI-generated clinical output is reviewable, attributable, and auditable.
- Alerting is validated with real clinician scenarios before broad rollout.

### Phase 3 - Department Depth and Operations

**Duration:** 10 to 12 weeks  
**Goal:** Fill major hospital operating gaps beyond the core clinical journey.

Scope:

1. CSSD full workflow
2. Procurement and GRN workflow
3. Dietary discharge counselling and intake tracking
4. Payroll completion / integration cleanup
5. Discharge planning workflow
6. Central stores / supply chain linking

Why after Phase 2:

- These are broad operational workflows with many cross-department handoffs.
- They benefit from shared eventing, drafts, approvals, and audit capabilities already built earlier.

### Phase 4 - Differentiation Expansion

**Duration:** 12 to 16 weeks  
**Goal:** Add high-value capabilities that differentiate MediQzy, but are not needed to close the first enterprise gap.

Scope:

1. Wound tracking AI
2. SDoH screening and referrals
3. Clinical trial matching
4. Predictive staffing
5. Antibiogram + infection surveillance

Decision rule:

- Only start items with validated data source, named operational owner, and measurable KPI.

### Phase 5 - Strategic Bets

**Duration:** Rolling 6 months+  
**Goal:** Build long-term moats and new revenue engines.

Scope:

1. RWE platform
2. Digital pathology AI
3. Pharmacogenomics
4. Predictive revenue-cycle AI
5. Ambient smart room
6. Voice biometrics
7. AR surgical planning
8. Carbon / ESG reporting

Funding rule:

- Treat these as separately funded product bets, not dependencies for core HMIS readiness.

---

## 5. Revised Priority Order

The original roadmap mixes deal blockers, platform work, and moonshots in one sequence. The recommended execution order is:

1. Blood Bank
2. Autosave
3. Tariff Master
4. Dietary completion
5. PREMS
6. NABH templates + implementation runbook
7. Readmission UI
8. Clinical event bus
9. Sepsis alerts
10. Auto coding
11. Ambient scribe MVP
12. NL cohort search
13. CSSD
14. Procurement / GRN
15. Discharge planning workflow

This order is intentionally less glamorous than the visionary roadmap. It is the shortest path to a credible enterprise deployment.

---

## 6. Workstream Structure

### Workstream A - Clinical Core

- Blood Bank
- Autosave
- Discharge planning
- Sepsis alerts
- Readmission workflows

### Workstream B - Finance and Commercial

- Tariff master
- Auto coding
- Billing integration
- Revenue-cycle later-stage work

### Workstream C - Department Operations

- Dietary
- CSSD
- Procurement
- Payroll

### Workstream D - AI Productization

- Ambient scribe
- NL cohort search
- Wound tracking
- Trial matching

### Workstream E - Compliance and Deployment

- NABH templates
- PREMS
- Implementation runbook
- Audit coverage

Recommended staffing for Phases 1 to 3:

| Role | Count |
|---|---:|
| Backend engineers | 3 |
| Frontend engineers | 3 |
| AI/backend engineer | 1 |
| QA engineer | 2 |
| Product / implementation analyst | 1 |
| Clinical SME part-time | 1 |
| DevOps / release support part-time | 1 |

---

## 7. Shared Platform Primitives to Build Once

These are worth doing early because later roadmap items depend on them repeatedly.

1. **Clinical event bus**
   - `VitalSaved`
   - `NoteSigned`
   - `AdmissionCreated`
   - `DischargeDrafted`
   - `LabResultPublished`

2. **Draft and autosave service**
   - Generic draft persistence
   - Conflict handling
   - Resume-on-reload
   - Audit history

3. **Clinical review workflow**
   - AI suggestion
   - Human accept / edit / reject
   - Attribution and audit

4. **Notification routing**
   - Role-aware alerts
   - Escalation paths
   - Read / acknowledge state

5. **Reference-data service**
   - Tariffs
   - Diet templates
   - Blood groups
   - CSSD instrument sets
   - Common dictionaries

---

## 8. Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| Roadmap overstates readiness of shell modules | Missed deadlines | Use `built / partial / shell / missing` audit before commitment |
| AI clinical outputs create liability | Safety and trust risk | Keep human review in loop; log all suggestions |
| Too many concurrent features | Slow delivery and poor quality | Cap active initiatives per phase |
| Enterprise demos outrun implementation | Sales credibility risk | Demo only feature-flagged, testable workflows |
| Data quality insufficient for predictive AI | Weak model performance | Gate predictive features on minimum dataset readiness |
| Hardware-dependent features stall | Schedule risk | Keep ambient room / biometrics out of early critical path |

---

## 9. Definition of Done by Feature Type

### Clinical feature

- Role-based workflow complete
- Audit trail
- Draft / recovery behavior
- Error states
- Export / print where relevant
- Clinical SME sign-off

### Department module

- Login
- Dashboard
- CRUD workflow
- Search / filter
- Status transitions
- Reports
- Cross-module integration

### AI feature

- Offline / fallback behavior
- Review loop
- Confidence or rationale surface
- Audit record
- Failure-safe behavior
- Evaluation dataset and acceptance threshold

---

## 10. First 30 Days

### Week 1

1. Reconcile roadmap against repo and create status matrix.
2. Finalize enterprise readiness backlog.
3. Define schemas for Blood Bank, Tariff Master, and clinical drafts.
4. Freeze release branches and feature-flag strategy.

### Week 2

1. Build clinical autosave framework.
2. Start Blood Bank backend and frontend workflow.
3. Write implementation runbook skeleton.
4. Start Tariff Master domain model.

### Week 3

1. Complete Blood Bank MVP.
2. Wire autosave into notes, prescriptions, vitals, and IP sheets.
3. Add readmission risk badge to discharge summary.
4. Complete Dietary workflow gap analysis.

### Week 4

1. Deliver PREMS MVP.
2. Finish Tariff Master MVP.
3. Produce enterprise-readiness demo build.
4. Run clinical QA and implementation dry run.

---

## 11. Recommended Next Decision

Approve **Phase 0 + Phase 1** as the committed delivery package.

Do not yet commit Phase 2+ dates externally. They should remain internal until the enterprise-readiness layer is stable and the revised current-state audit is complete.

## Phase 0 Execution Artifacts

- `MEDIQZY_V2_CAPABILITY_MATRIX.md`
- `MEDIQZY_V2_PHASE1_BACKLOG.md`
- `MEDIQZY_V2_IMPLEMENTATION_RUNBOOK.md`
