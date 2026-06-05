# Mediczy SaMD Readiness Scorecard
**Software as a Medical Device — Regulatory Compliance Assessment**

| Document ID   | MED-REG-SAMD-001              |
|---------------|-------------------------------|
| Version       | 1.1                           |
| Date          | 2026-06-01                    |
| Owner         | AI CTO / Medical Director     |
| Review Cycle  | Quarterly                     |
| Status        | IN PROGRESS — 10/16 complete  |

---

## 1. Regulatory Context

### 1.1 Applicable Regulations

| Jurisdiction | Framework | Applicable Sections |
|---|---|---|
| India (primary) | CDSCO Medical Device Rules 2017 (amended 2020, 2022) | Software Medical Devices: Class B, C classification |
| Global (future) | FDA Digital Health Center of Excellence — AI/ML-Based SaMD Action Plan (Jan 2021) | Predetermined Change Control Plan (PCCP), TPLC |
| EU (future) | EU MDR 2017/745 Annex I §17, MDCG 2019-11 | Software lifecycle, clinical evaluation |
| International | IEC 62304:2006+A1:2015 | Software lifecycle processes |
| International | IEC 82304-1:2016 | Health software safety requirements |
| International | ISO 14971:2019 | Risk management for medical devices |
| International | ISO 13485:2016 | Quality management systems |

### 1.2 SaMD Definition Check

A software qualifies as SaMD when it:
> "is intended to be used for one or more medical purposes that are performed without being part of a hardware medical device." — IMDRF/SaMD N10

**Mediczy qualifies** because its AI features: (a) process medical data, (b) generate outputs used for clinical decisions (triage routing, drug prescribing, risk stratification), and (c) operate without a hardware device.

---

## 2. AI Component Risk Classification

### 2.1 Classification Matrix

Risk classification uses the IMDRF/SaMD N12 framework: **Significance of Information × State of Healthcare Situation**.

| AI Component | Intended Purpose | Healthcare Situation | Info Significance | IMDRF Class | FDA Analog | CDSCO India |
|---|---|---|---|---|---|---|
| Emergency Triage (ESI 5-level) | Prioritise time-critical care | Critical (life-threatening) | Drives clinical management | **IV (Highest)** | Class III | Class C |
| Drug Interaction Checker | Flag contraindications at prescribing | Serious / Critical | Drives clinical management | **IV (Highest)** | Class III | Class C |
| Health Risk Scoring (v2-bayesian) | Stratify patients for preventive care | Non-serious / Serious | Informs clinical management | **II–III** | Class II | Class B |
| Lab Result Auto-Processing + Flagging | Flag abnormal values, notify patient | Serious | Informs clinical management | **III** | Class IIb | Class B–C |
| Clinical Decision Support (AI Brain) | Assist physician during consultation | Non-serious / Serious | Informs (physician decides) | **II** | Class IIa | Class B |
| Medical Scribe (Whisper + Bimedix) | Documentation productivity tool | N/A | Does NOT drive clinical decisions | **NOT SaMD*** | Not regulated | Not regulated |
| Voice Agent (LiveKit + iSHA) | Patient engagement, appointment booking | Non-serious | Administrative / wellness | **I** | Class I / exempt | Class A |

*The Medical Scribe is NOT SaMD **only if** a qualified physician reviews and signs every generated note before it enters the medical record. If notes are committed without physician review, it re-classifies as SaMD Class III.

### 2.2 Classification Rationale — Key Decisions

**Why Emergency Triage is Class IV / Class III (not lower):**
The ESI output directly determines which patients receive immediate care versus wait. An under-triage error (ESI-5 assigned to ESI-1 patient) is directly life-threatening. Even though a human nurse/physician is in the loop, the AI output strongly anchors the human decision under time pressure.

**Why Drug Interaction Checker is Class IV / Class III:**
A missed contraindication (e.g., SSRI + MAOI, sildenafil + nitrates) can cause immediate, fatal patient harm. The checker informs a prescribing decision that is executed minutes later.

**Why Medical Scribe is NOT SaMD:**
The output is a draft document. The physician's review, modification, and signature is the clinical act — not the AI output itself. This aligns with FDA Digital Health Policy: "software intended to be used as an EHR system, or as part of an EHR system, that is intended to transfer, store, convert formats, or display medical device data and results" is exempt.

---

## 3. Readiness Scorecard

### 3.1 Technical Interpretability — 5/5 COMPLETE

| Item | Status | Evidence | Standard | Date |
|---|---|---|---|---|
| SHAP values on risk scoring | **DONE** | `ai-interpretability.service.js:computeShapValues()` — exact additive SHAP per patient score | FDA AI/ML Action Plan §4 (transparency) | 2026-06-01 |
| LIME attribution on triage decisions | **DONE** | `ai-interpretability.service.js:computeTriageLimeAttribution()` — symptom phrase + vitals attribution | EU MDR Annex I §17.1 | 2026-06-01 |
| Counterfactual explanations | **DONE** | `ai-interpretability.service.js:generateCounterfactuals()` — nearest counterfactual per risk level | FDA PCCP guidance §3.2 | 2026-06-01 |
| Confidence / uncertainty quantification | **DONE** | `computeConfidenceScore()` — data completeness → margin of error | IEC 82304-1 §7.2 | 2026-06-01 |
| Post-hoc explanation API for clinicians | **DONE** | `GET /api/ai-governance/patient/:id/explanation` | FDA TPLC transparency | 2026-06-01 |

### 3.2 Model Governance & Change Control — 3/3 COMPLETE

| Item | Status | Evidence | Standard | Date |
|---|---|---|---|---|
| Model cards for all SaMD components | **DONE** | `ai-model-governance.service.js:MODEL_CARDS` — 4 cards; synced to `ai_model_cards` DB table | FDA TPLC, MDCG 2021-6 | 2026-06-01 |
| Predetermined Change Control Plan (PCCP) enforcement | **DONE** | Self-learning pipeline now routes all threshold/prompt changes through `proposeChange()` → medical director approval gate | FDA AI/ML PCCP guidance (Apr 2023) | 2026-06-01 |
| Model change audit trail | **DONE** | `ai_model_change_log` table: every proposed/approved/rejected change recorded with timestamp, approver, diff | ISO 13485 §4.2.4 | 2026-06-01 |

### 3.3 Monitoring & Surveillance — 2/2 COMPLETE

| Item | Status | Evidence | Standard | Date |
|---|---|---|---|---|
| Input distribution drift detection (PSI) | **DONE** | `runDriftMonitor()` — Population Stability Index on risk score distributions; alerts at PSI > 0.20 | FDA TPLC post-market monitoring | 2026-06-01 |
| Demographic parity monitoring | **DONE** | `computeDemographicParity()` — weekly age × gender stratified risk score analysis; disparity flags | EU MDR Annex I §17.4, FDA bias guidance | 2026-06-01 |

### 3.4 Safety & Quality Gates — 1/1 COMPLETE

| Item | Status | Evidence | Standard | Date |
|---|---|---|---|---|
| Pre-flight AI quality gate (8 safety checks) | **DONE** | `ai-quality-gates.service.js` — hallucination guard, allergy cross-check, forbidden drug combos, outlier detection, ESI-1 mandatory alert, dosage anomaly detection | IEC 62304 §7.3, ISO 14971 §6 | 2026-06-01 |

### 3.5 Audit & Traceability — 1/1 COMPLETE (pre-existing)

| Item | Status | Evidence | Standard |
|---|---|---|---|
| Full AI decision audit trail | **DONE (pre-existing)** | `isha_audit_log`, `sib_decision_log`, `sib_response_quality`, `ai_brain_conversations`, `ai_quality_gate_log`, `operations_audit_log` | ISO 13485 §4.2.4, IEC 62304 §5.5 |

### 3.6 Clinical Validation — 0/2 COMPLETE ← CRITICAL GAP

| Item | Status | Required Action | Priority |
|---|---|---|---|
| Clinical validation study — Emergency Triage | **MISSING** | Prospective study comparing AI ESI assignment vs. trained triage nurse on ≥200 cases. Target: sensitivity ≥ 0.95 for ESI-1/2 cases. | P0 — blocks Class III submission |
| Clinical validation study — Health Risk Scoring | **MISSING** | Retrospective study against ACC/AHA Pooled Cohort Equations on ≥500 patient records with ≥12 month outcome follow-up. Target: AUC ≥ 0.75 for cardiovascular events. | P0 — blocks Class IIb submission |

**Recommended approach:**
- Partner with 2–3 hospitals in the Mediczy network for a retrospective chart review study
- Use the existing `ai_health_risk_scores` + `vitals_records` + `lab_results` tables as the data source
- Engage a clinical biostatistician for the analysis and validation report
- Estimated timeline: 4–6 months

### 3.7 Quality Management System — 0/2 COMPLETE

| Item | Status | Required Action | Priority |
|---|---|---|---|
| ISO 13485 Quality Management System | **MISSING** | Establish documented QMS: document control, design control, CAPA, complaint handling, supplier qualification | P1 |
| IEC 62304 Software Lifecycle Documentation | **MISSING** | Produce: software architecture document, software requirements specification, hazard analysis, unit/integration test protocols, maintenance procedures | P1 |

**Recommended approach:**
- Engage an ISO 13485 consultant for a 3-month documentation sprint
- The existing CLAUDE.md, migration files, and audit logs provide a strong starting foundation
- Target certification 6–9 months after clinical validation data is available

### 3.8 Risk Management — 0/1 COMPLETE

| Item | Status | Required Action | Priority |
|---|---|---|---|
| ISO 14971 Risk Management File (FMEA) | **MISSING** | Produce Failure Mode & Effects Analysis covering: (a) AI model failure modes, (b) hardware/connectivity failure, (c) data quality degradation, (d) model drift, (e) adversarial inputs | P1 |

**Known failure modes to document (starter list):**

| Failure Mode | Potential Harm | Current Mitigation | Residual Risk |
|---|---|---|---|
| ESI under-triage (ESI-5 for ESI-1 patient) | Patient death | Rule-based red flag patterns, LIME confidence gate | Moderate |
| Hallucinated drug dosage in scribe | Adverse drug event | Dosage anomaly gate, mandatory physician review | Low (with physician review) |
| Drug interaction missed (not in rule base) | Adverse drug event | LLM cascade cross-check | Moderate |
| Health risk score from sparse data | Missed high-risk patient | Confidence score < 0.5 → clinician review flag | Low |
| Autonomous model change (PCCP violation) | Systematic degradation | Human approval gate on all changes | Low (mitigated 2026-06-01) |
| Input distribution drift | Declining accuracy | PSI drift monitoring, alerts at PSI > 0.20 | Low |
| LLM provider outage (iSHA / Groq / OpenAI) | Delayed clinical decisions | 3-tier cascade fallback; rule-based fallback | Low |
| Patient data in wrong context window | Privacy breach | Tenant isolation, patient-scoped queries | Low |

### 3.9 Regulatory Filing — 0/2 COMPLETE

| Item | Status | Required Action | Priority |
|---|---|---|---|
| CDSCO India — Class B/C Medical Device Registration | **MISSING** | File Form MD-14 (or MD-5 for import) under Medical Device Rules 2017. Requires: technical file, clinical evidence, QMS certificate, labelling | P2 — required before commercial launch |
| FDA / CE Marking (for international expansion) | **MISSING** | Scoped to target markets. FDA: De Novo or 510(k) for Class II; PMA for Class III. EU: CE Mark with Notified Body for Class IIb+ | P3 — plan for Year 2 |

---

## 4. Overall Readiness Score

```
Technical Interpretability  ████████████ 5/5  (100%)
Model Governance            ████████████ 3/3  (100%)
Monitoring & Surveillance   ████████████ 2/2  (100%)
Safety & Quality Gates      ████████████ 1/1  (100%)
Audit & Traceability        ████████████ 1/1  (100%)  [pre-existing]
─────────────────────────────────────────────────────
Software Readiness          ████████████ 12/12 (100%)

Clinical Validation         ░░░░░░░░░░░░ 0/2   (0%)   ← P0 GAP
Quality Management System   ░░░░░░░░░░░░ 0/2   (0%)   ← P1 GAP
Risk Management File        ░░░░░░░░░░░░ 0/1   (0%)   ← P1 GAP
Regulatory Filing           ░░░░░░░░░░░░ 0/2   (0%)   ← P2/P3 GAP
─────────────────────────────────────────────────────
Overall SaMD Readiness      ████████░░░░ 12/19 (63%)
```

**Interpretation:**
- The **software** (code-level) SaMD requirements are now fully implemented
- The **clinical and regulatory** requirements require offline organisational work (validation studies, QMS, filing)
- The platform is **safe to operate in clinical beta** under the following conditions (see Section 5)

---

## 5. Safe Operation Conditions (Pre-Certification)

Until full CDSCO filing is complete, the following safeguards must be in place for lawful clinical operation in India:

| Safeguard | Requirement | Responsible Party |
|---|---|---|
| Emergency Triage | A trained triage nurse or physician must review every ESI output before acting on it. AI output must be labelled "AI DECISION SUPPORT — REQUIRES CLINICAL REVIEW" | Hospital Operations |
| Drug Interaction Checker | A prescribing physician must acknowledge all flagged interactions before completing a prescription | Medical Director |
| Health Risk Scores | Risk scores must be labelled "AI-generated — validate with clinical assessment" | Product Team |
| Medical Scribe | Every generated note must show a "DRAFT — PHYSICIAN REVIEW REQUIRED" watermark and block commit without physician signature | Engineering |
| Self-learning changes | All model changes must be approved by the designated Medical Director via the governance dashboard before applying | Medical Director |
| Adverse event reporting | Any patient harm that may be attributable to an AI output must be reported to CDSCO under Vigilance Protocol within 30 days | Regulatory Affairs |

---

## 6. Roadmap to Full SaMD Certification

```
NOW ─────── Q3 2026 ──────── Q4 2026 ──────── Q1 2027 ──────── Q2 2027
 │                │                │                │                │
[Code Complete]  [Clinical        [ISO 13485      [CDSCO          [Full
 Software        Validation       QMS + IEC       Filing          Commercial
 Readiness       Studies          62304 Docs]     Submitted]      Clearance]
 12/12]          Underway]                                         (target)
                                  ISO 14971
                                  Risk File
```

### Q3 2026 (Months 1–3): Clinical Validation
- [ ] Identify 2–3 partner hospitals for validation studies
- [ ] IRB/Ethics approval for retrospective chart review
- [ ] Biostatistician engagement for study design
- [ ] Run retrospective validation: Health Risk Scoring vs ACC/AHA PCE
- [ ] Begin prospective triage comparison study

### Q4 2026 (Months 4–6): Quality & Risk Documentation
- [ ] ISO 13485 consultant engagement
- [ ] Software architecture document (IEC 62304 §5.2)
- [ ] Software requirements specification (IEC 62304 §5.3)
- [ ] Full FMEA — all AI failure modes (ISO 14971)
- [ ] CAPA (Corrective and Preventive Action) process established
- [ ] Document control system set up

### Q1 2027 (Months 7–9): Filing Preparation
- [ ] Compile Technical File for CDSCO
- [ ] Clinical evaluation report from validation studies
- [ ] Labelling review (IVD / non-IVD classification confirmation)
- [ ] Form MD-14 submission to CDSCO
- [ ] Notified Body pre-submission meeting (if EU CE targeting)

### Q2 2027 (Months 10–12): Clearance & Launch
- [ ] CDSCO Class B/C clearance received
- [ ] Post-market surveillance plan activated
- [ ] Annual model performance review scheduled
- [ ] PCCP filed with next significant model update

---

## 7. Governance Contacts

| Role | Responsibility | Current Assignee |
|---|---|---|
| Medical Director | Model change approval, clinical validation oversight | TBD |
| AI CTO | Technical implementation, interpretability, governance tooling | Mediczy AI Team |
| Regulatory Affairs Lead | CDSCO filing, vigilance reporting | TBD — hire recommended |
| Biostatistician | Clinical validation study design and analysis | TBD — engage consultant |
| ISO 13485 Consultant | QMS documentation and internal audit | TBD — engage Q3 2026 |

---

## 8. Change Log

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-06-01 | AI CTO | Initial scorecard created following AI blackbox audit |
| 1.1 | 2026-06-01 | AI CTO | Interpretability infrastructure complete; migration run; model cards synced |

---

*This document is confidential. It constitutes part of the Mediczy Technical File for SaMD regulatory purposes.*
