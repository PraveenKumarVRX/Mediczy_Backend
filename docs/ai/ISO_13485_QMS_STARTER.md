# ISO 13485 Quality Management System — Starter Package
**Mediczy SaMD Quality Framework**

| Document ID   | MED-QMS-001               |
|---------------|---------------------------|
| Version       | 0.1 (Starter Draft)       |
| Date          | 2026-06-01                |
| Owner         | Medical Director + AI CTO |
| Standard      | ISO 13485:2016            |
| Status        | Pre-certification — foundation documents only |

---

> **How to use this document:** This is the starting scaffold for the ISO 13485 QMS. A certified ISO 13485 consultant should review and complete this before external audit. Estimated consultant engagement: 3 months (Q4 2026).

---

## 1. Quality Policy

*[To be formally approved and signed by CEO/Medical Director before filing]*

Mediczy (MySmart Health Pvt Ltd) is committed to developing, deploying, and maintaining AI-assisted healthcare software that:
1. Is safe and effective for its intended medical purpose
2. Complies with applicable regulatory requirements (CDSCO Medical Device Rules 2017, ISO 13485, IEC 62304, ISO 14971)
3. Continuously improves through validated evidence, structured feedback, and governed model updates
4. Prioritises patient safety above product features, cost, and speed of deployment

This Quality Policy is reviewed annually by the Medical Director and is communicated to all staff involved in regulated software development and deployment.

---

## 2. Scope of QMS

**In scope:**
- AI/ML components classified as SaMD (Emergency Triage, Drug Interaction Checker, Health Risk Scoring, Lab Result Auto-Processing, Clinical Decision Support)
- Software development lifecycle (IEC 62304) for these components
- Post-market surveillance and vigilance reporting
- Supplier qualification for AI model providers (OpenAI, Groq, Google, iSHA)

**Out of scope:**
- General administrative software (appointment booking, billing, messaging)
- Non-AI clinical documentation tools where physician review is always mandatory

---

## 3. Document Control (ISO 13485 §4.2.4)

### 3.1 Document Hierarchy

```
Level 1: Quality Manual (this document)
    │
Level 2: Standard Operating Procedures (SOPs)
    │       ├── SOP-001: AI Model Change Control
    │       ├── SOP-002: Post-Market Surveillance
    │       ├── SOP-003: Adverse Event Reporting (Vigilance)
    │       ├── SOP-004: CAPA Process
    │       ├── SOP-005: Supplier Qualification
    │       └── SOP-006: Clinical Validation Management
    │
Level 3: Work Instructions + Forms
    │       ├── WI-001: Medical Director Change Approval Procedure
    │       ├── WI-002: Drift Monitor Response Procedure
    │       └── FORM-001: Change Approval Record
    │
Level 4: Records + Evidence
            ├── ai_model_change_log (DB)
            ├── ai_quality_gate_log (DB)
            ├── ai_drift_monitor (DB)
            └── operations_audit_log (DB)
```

### 3.2 Document Control Table

| Document | Owner | Review Cycle | Current Version | Location |
|---|---|---|---|---|
| QMS Starter (this doc) | Medical Director | Annual | 0.1 | docs/ai/ISO_13485_QMS_STARTER.md |
| SaMD Readiness Scorecard | AI CTO | Quarterly | 1.1 | docs/ai/SAMD_READINESS_SCORECARD.md |
| AI Model Cards | AI CTO | Per model update | 1.0 | docs/ai/AI_MODEL_CARDS.md |
| Clinical Validation Protocol | Medical Director | Per study | 1.0 | docs/ai/CLINICAL_VALIDATION_PROTOCOL.md |
| Interpretability Technical Spec | AI CTO | Per code change | 1.0 | docs/ai/AI_INTERPRETABILITY_AND_QUALITY_GATES.md |
| FMEA / Risk Management File | Medical Director | Annual | TODO | docs/ai/ISO_14971_RISK_FILE.md |

---

## 4. Management Responsibility (ISO 13485 §5)

### 4.1 Organisational Roles for Regulated Activity

| Role | Regulatory Responsibility | Current Assignment |
|---|---|---|
| **Medical Director** | Clinical validation oversight, model change approval (PCCP), adverse event signatory, quality policy owner | **VACANT — hire urgently** |
| **AI CTO** | Technical implementation of SaMD requirements, IEC 62304 documentation, model governance tooling | Mediczy AI Team |
| **Regulatory Affairs Lead** | CDSCO filing, vigilance reporting, post-market surveillance coordination | **VACANT — engage consultant Q3 2026** |
| **Quality Manager** | ISO 13485 internal audits, CAPA coordination, document control | **VACANT — part of ISO consultant scope** |
| **Biostatistician** | Clinical validation study design and analysis | **VACANT — engage consultant Q3 2026** |

### 4.2 Medical Director — Role Specification

**Title:** Medical Director, AI Safety and Governance  
**Reports to:** CEO  
**Time commitment:** Part-time acceptable (minimum 0.5 FTE) for initial phase; full-time recommended post-CDSCO filing

**Mandatory qualifications:**
- MBBS + MD or equivalent (any clinical specialty)
- Minimum 5 years clinical practice
- Familiarity with clinical decision support systems or digital health preferred
- Experience with regulatory submissions (CDSCO, FDA, or CE) is a strong advantage

**Key responsibilities:**
1. Review and approve all AI model changes via governance dashboard (`/admin/ai-governance`)
2. Sign off on clinical validation study protocol and results
3. Be named signatory on CDSCO regulatory filing
4. Review and acknowledge all adverse events or near-misses involving AI outputs
5. Quarterly review of SaMD readiness scorecard
6. Annual review of all AI model cards
7. Chair the AI Safety Review Board (quarterly meeting)

**Scope of authority:**
- Unilateral authority to halt any AI feature if patient safety concern arises
- Must approve before any model change with `risk_assessment = 'high'` is applied
- Final authority on clinical validation study design and success criteria

**Compensation:** To be determined per engagement type (employee, advisor, or consulting basis)

---

## 5. Standard Operating Procedures (Stubs)

*Each SOP below needs full expansion by the ISO consultant. Stubs provided to show required scope.*

### SOP-001: AI Model Change Control

**Purpose:** Ensure all changes to AI/ML model components follow the Predetermined Change Control Plan (PCCP) and receive appropriate review before deployment.

**Trigger:** Any proposed change to: model weights, scoring thresholds, system prompts, tool selection logic, LLM provider routing, or feature engineering.

**Procedure:**
1. Change is proposed (automatically by self-learning pipeline or manually by engineer)
2. Change is logged in `ai_model_change_log` with `status = 'pending_review'`
3. Medical Director is notified (via governance dashboard and email)
4. Medical Director reviews rationale, previous and new config
5. If `risk_assessment = 'low'`: Medical Director can approve within 3 business days
6. If `risk_assessment = 'moderate'`: Medical Director reviews + AI CTO sign-off required
7. If `risk_assessment = 'high'`: Medical Director + CEO sign-off + shadow run on historical data required
8. Approved change is applied; rejected changes are archived with reason
9. Change applied: `status = 'applied'`, `applied_at` timestamp recorded
10. Post-application monitoring: drift monitor runs within 48 hours of significant change

**Record:** `ai_model_change_log` table  
**Escalation:** Any `risk_assessment = 'high'` change not reviewed within 5 business days escalates to CEO

### SOP-002: Post-Market Surveillance

**Purpose:** Continuously monitor deployed AI components for safety signals and performance degradation.

**Scheduled activities:**

| Activity | Frequency | Owner | Tool |
|---|---|---|---|
| Drift monitor (PSI check) | Weekly | AI CTO | `POST /api/ai-governance/drift/run` |
| Quality gate audit log review | Weekly | Medical Director | `/admin/ai-governance` → Quality Gates tab |
| Demographic parity report | Monthly | Medical Director | `/api/ai-governance/demographic-parity` |
| Model card currency review | Per model update | AI CTO | `POST /api/ai-governance/model-cards/sync` |
| SaMD readiness scorecard review | Quarterly | Medical Director + AI CTO | docs/ai/SAMD_READINESS_SCORECARD.md |
| Clinical validation results review | Annually (post-study) | Medical Director | Study reports |

### SOP-003: Adverse Event Reporting (Vigilance)

**Purpose:** Comply with CDSCO Medical Device Rules 2017 vigilance requirements.

**Definition of reportable event:** Any malfunction or deterioration in characteristics or performance of the AI system that has led to, or could lead to, patient harm.

**Timeframes:**
- Death or serious deterioration: report within 10 calendar days of becoming aware
- Other serious incidents: report within 30 calendar days

**Procedure:**
1. Staff member or patient reports potential harm related to AI output
2. Medical Director notified within 24 hours
3. Medical Director investigates: was the AI output plausible given the inputs? Did the quality gate flag it? Was the physician in the loop?
4. If reportable: complete CDSCO Vigilance Form MV-9 and submit
5. Corrective action plan developed within 30 days
6. Root cause analysis completed and documented in CAPA system

### SOP-004: CAPA Process (Corrective and Preventive Action)

**Purpose:** Systematically identify, investigate, and resolve quality problems.

**Trigger:** Adverse event, quality gate block rate > 5% in any week, drift PSI > 0.20, failed clinical validation metric, internal audit finding.

**Process:**
1. Problem statement captured (what happened, when, how detected)
2. Immediate containment action (e.g., disable AI feature, require physician sign-off for all outputs)
3. Root cause analysis (5-Why or Fishbone)
4. Corrective action plan with owner and deadline
5. Implementation and verification
6. Effectiveness check (30-day follow-up)
7. CAPA closed when effectiveness confirmed

### SOP-005: Supplier Qualification

**Purpose:** Ensure external AI model providers meet quality and reliability requirements.

**In-scope suppliers:** OpenAI, Groq, Google (Gemini), Anthropic, ElevenLabs, LiveKit, iSHA/isha.buzz

**Qualification criteria for each:**
- Data Processing Agreement (DPA) executed ✓ (check status per vendor)
- Uptime SLA ≥ 99.5%
- SOC 2 Type II certification or equivalent
- Data residency compliance (India data residency required for patient data)
- Security incident notification within 72 hours

**Current qualification status:**

| Supplier | DPA Status | SOC 2 | Data Residency | Qualified |
|---|---|---|---|---|
| OpenAI | Pending | Yes (US) | US only | Partial |
| Groq | Pending | Pending | US only | Partial |
| Google (Gemini) | Pending | Yes | India region available | Partial |
| Anthropic | Pending | Yes | US only | Partial |
| iSHA (isha.buzz) | Internal | N/A | India | Yes |
| ElevenLabs | Pending | Pending | US only | Partial |
| LiveKit | Pending | Yes | Multi-region | Partial |

*Action: Legal to execute DPAs with each supplier before CDSCO filing.*

---

## 6. Internal Audit Schedule (ISO 13485 §8.2.4)

*To be conducted after QMS is fully documented (Q1 2027):*

| Audit Area | Frequency | Auditor |
|---|---|---|
| Model change control records | Semi-annual | Quality Manager (external) |
| Post-market surveillance execution | Annual | ISO consultant |
| Clinical validation data integrity | Annual | Biostatistician |
| Supplier qualification records | Annual | Quality Manager |
| Software lifecycle documentation | Annual | ISO consultant |

---

## 7. ISO 14971 FMEA — Starter Table

*Full FMEA to be completed as a separate document: `docs/ai/ISO_14971_RISK_FILE.md`*

| ID | Failure Mode | Cause | Effect | Severity (1–5) | Probability (1–5) | RPN | Current Control | Residual Risk |
|---|---|---|---|---|---|---|---|---|
| FM-001 | Under-triage: ESI-1 patient receives ESI-4/5 | LLM misinterpretation of atypical symptom presentation | Patient death from delayed care | 5 | 2 | 10 | Rule-based red flag patterns, quality gate, mandatory nurse review | Moderate |
| FM-002 | Drug interaction missed (not in rule base + LLM hallucination) | Rare drug pair not in built-in DB; LLM generates false negative | Adverse drug event | 5 | 2 | 10 | LLM cascade, forbidden combo gate, pharmacist review requirement | Moderate |
| FM-003 | Health risk score from sparse data (< 30% completeness) | Patient with no vitals/labs | Missed high-risk patient; false low score | 4 | 3 | 12 | Confidence score gate blocks < 30% completeness scores | Low |
| FM-004 | Autonomous model change without clinical review | PCCP violation | Systematic accuracy degradation | 4 | 1 | 4 | Governance gate: all changes require Medical Director approval | Very Low |
| FM-005 | Medical scribe committed without physician review | UI bug or workflow bypass | Incorrect clinical note enters record | 5 | 1 | 5 | Mandatory physician signature gate in DB | Low |
| FM-006 | Input drift: risk scores for new patient demographics unvalidated | New hospital onboarded with different population | Systematic under/over-estimation | 3 | 3 | 9 | Weekly PSI drift monitor; alert at PSI > 0.20 | Low |
| FM-007 | LLM provider outage | Cloud API failure | Clinical decision support unavailable | 2 | 2 | 4 | 3-tier cascade: iSHA → Groq → OpenAI; rule-based fallback | Very Low |
| FM-008 | Patient data cross-contamination between tenants | Multi-tenant isolation bug | Privacy breach + wrong clinical context | 5 | 1 | 5 | Tenant isolation enforced at DB query level; audit log | Low |

*RPN = Severity × Probability. Action required for RPN ≥ 10.*

---

## 8. Next Steps for Consultant Engagement

When engaging the ISO 13485 consultant in Q4 2026, provide them with:

1. **This document** as the starting QMS scaffold
2. **CLAUDE.md** — codebase guide showing existing automated controls
3. **AI Model Cards** (`docs/ai/AI_MODEL_CARDS.md`) — component documentation
4. **SaMD Readiness Scorecard** (`docs/ai/SAMD_READINESS_SCORECARD.md`) — gap analysis
5. **Database schema** for the 6 governance tables (from migration file)
6. **Governance dashboard access** at `/admin/ai-governance`

The consultant's scope should include:
- [ ] Complete all Level 2 SOPs (001–006 above)
- [ ] Write Instructions for Use (IFU) document
- [ ] Complete FMEA in ISO 14971 format
- [ ] Write IEC 62304 Software Lifecycle document
- [ ] Conduct gap audit against ISO 13485:2016 checklist
- [ ] Schedule and conduct internal audit
- [ ] Prepare for external certification body audit

**Estimated cost:** ₹8–15 lakh for full QMS implementation and certification support  
**Estimated timeline:** 3–4 months from engagement start to external audit readiness

---

*This document is a living foundation. Update on every major QMS change. Version history maintained in git.*
