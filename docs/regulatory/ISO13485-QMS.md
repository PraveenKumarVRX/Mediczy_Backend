# ISO 13485:2016 Quality Management System

**Organisation:** MySmart Health Technologies Pvt Ltd  
**Product:** Mediczy / Mediqzy AI Clinical Decision Support Platform  
**Document Number:** QMS-POL-001 (reference)  
**Version:** 1.0  
**Effective Date:** 2026-06-11  
**Review Date:** 2027-06-11  
**Approved By:** Medical Director

---

## 1. Scope

This QMS covers the design, development, deployment, and post-market surveillance of the Mediczy AI Clinical Decision Support Platform, specifically:

- AI Health Risk Scoring Engine (Class IIb SaMD)
- Emergency Triage ESI Engine (Class III SaMD)
- Drug Interaction Checker (Class III SaMD)
- Medical Scribe (NOT SaMD)
- Dr. iSHA Voice + Text Clinical Assistant (NOT SaMD — decision-support only)

---

## 2. Document Control

**Procedure Reference:** QMS-SOP-001  
**System:** All QMS documents tracked in `qms_documents` table (PostgreSQL)

| Doc Number     | Title                                      | Status   |
|----------------|--------------------------------------------|----------|
| QMS-SOP-001    | Document Control Procedure                 | Approved |
| QMS-SOP-002    | Non-Conformance and CAPA Management        | Approved |
| QMS-SOP-003    | Internal Audit Procedure                   | Approved |
| QMS-SOP-004    | AI Model Change Control (PCCP)             | Approved |
| QMS-SOP-005    | Clinical Validation and Performance Evaluation | Approved |
| QMS-SOP-006    | Post-Market Surveillance Procedure         | Approved |
| QMS-POL-001    | Quality Policy                             | Approved |
| QMS-POL-002    | Data Privacy and PHI Handling Policy       | Approved |
| QMS-POL-003    | AI Ethics and Bias Mitigation Policy       | Approved |
| QMS-WI-001     | How to Raise a Non-Conformance             | Approved |
| QMS-WI-002     | Medical Director Governance Review Workflow | Approved |
| QMS-FORM-001   | Non-Conformance Report Form                | Approved |
| QMS-FORM-002   | CAPA Action Plan Form                      | Approved |

---

## 3. Non-Conformance and CAPA

**Procedure Reference:** QMS-SOP-002  
**System:** `qms_non_conformances` and `qms_capa` tables

### Non-Conformance Sources
- Internal audit findings
- Customer complaints (PHI breach, misdiagnosis support, downtime)
- Process deviations in AI pipelines
- Post-market surveillance signals

### CAPA Process
1. Non-Conformance raised (NCR number auto-assigned)
2. Root cause analysis within 5 business days
3. CAPA plan documented with responsible person and target date
4. Implementation verified by Quality Manager
5. Effectiveness check at 90 days post-implementation

### AI-Specific NCR Triggers
- Quality gate failure rate > 20% sustained over 7 days
- AUROC drop > 0.05 from baseline
- PSI drift flag on any feature
- Demographic disparity > 10% across gender/age strata

---

## 4. Internal Audit Schedule

**Procedure Reference:** QMS-SOP-003  
**System:** `qms_audit_records` table

| Audit Type     | Scope                            | Frequency    |
|----------------|----------------------------------|--------------|
| Internal       | AI pipeline quality gates         | Quarterly    |
| Internal       | Document control and SOPs         | Semi-annual  |
| Internal       | Clinical data handling (PHI)      | Annual       |
| External       | CDSCO pre-submission audit        | Before filing|

---

## 5. AI-Specific Quality Controls

| Control                        | Implementation                              | Frequency  |
|-------------------------------|----------------------------------------------|------------|
| Quality gate checks            | `ai-quality-gates.service.js`               | Per output |
| Confidence score threshold     | Block outputs < 30% confidence               | Per output |
| Model drift monitoring (PSI)   | `ai-model-governance.service.js`            | Weekly     |
| Demographic parity audit       | `ai-model-governance.service.js`            | Weekly     |
| Self-learning change approval  | Medical Director review via governance API   | Per change |
| Clinical validation review     | `clinical-validation.service.js`            | Quarterly  |

---

## 6. Post-Market Surveillance

**Procedure Reference:** QMS-SOP-006

PMS inputs captured automatically:
- `ai_quality_gate_log` — every gate pass/fail
- `ai_drift_monitor` — weekly PSI results
- `ai_demographic_parity_log` — demographic disparity tracking
- `ai_model_change_log` — PCCP change audit trail
- `ai_health_risk_scores.confidence_score` — data quality tracking

PSUR (Periodic Safety Update Report) to be filed annually with CDSCO after market authorization.

---

## 7. API Endpoints

```
GET  /api/samd-regulatory/qms/dashboard          — QMS health overview
GET  /api/samd-regulatory/qms/documents          — Document registry
POST /api/samd-regulatory/qms/ncr               — Raise non-conformance
POST /api/samd-regulatory/qms/capa              — Create CAPA
POST /api/samd-regulatory/qms/audit             — Log audit record
```
