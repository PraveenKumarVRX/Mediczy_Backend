# CDSCO MDR 2017 — Regulatory Filing Checklist

**Organisation:** MySmart Health Technologies Pvt Ltd  
**Device Name:** Mediczy AI Clinical Decision Support Platform  
**Device Class:** Class B (risk scoring, triage support)  
**Regulation:** Medical Devices Rules, 2017 (MDR 2017) — Schedule 3  
**CDSCO Submission Ref:** CDSCO-2026-0001 (preparation stage)  
**Version:** 1.0  
**Last Updated:** 2026-06-11

---

## Submission Status

| Section | Items Total | Completed | Pending |
|---------|:-----------:|:---------:|:-------:|
| Administrative | 5 | 0 | 5 |
| Design & Manufacturing | 5 | 5 | 0 |
| Safety & Risk | 5 | 4 | 1 |
| Clinical Evaluation | 4 | 2 | 2 |
| Quality Management | 4 | 3 | 1 |
| Labelling & IFU | 3 | 1 | 2 |
| Post-Market Surveillance | 3 | 2 | 1 |
| Declaration | 2 | 0 | 2 |
| **TOTAL** | **31** | **17** | **14** |

*Auto-populated from `cdsco_checklist` table — run `POST /api/samd-regulatory/cdsco/submissions/:id/checklist` for live status.*

---

## Section 1 — Administrative (Pending)

- [ ] **1.1** Device name, model and catalogue number
- [ ] **1.2** Intended purpose and indications for use
- [ ] **1.3** Target patient population and clinical context
- [ ] **1.4** Device classification (IMDRF SaMD Framework — Class II, serious situation, non-critical)
- [ ] **1.5** Manufacturer details and authorised representative in India

*Action: Complete company registration details and appoint authorised CDSCO representative.*

---

## Section 2 — Design & Manufacturing (Complete)

- [x] **2.1** Software architecture document (IEC 62304) → `docs/regulatory/IEC62304-SoftwareLifecycle.md`
- [x] **2.2** Software lifecycle description → PM2 + Git + ESM architecture documented
- [x] **2.3** Version history → `git log` + `ai_model_change_log`
- [x] **2.4** SOUP inventory → SW-008 to SW-010 in `iec62304_software_items`
- [x] **2.5** Software requirements → `iec62304_requirements` table + `docs/ai/AI_INTERPRETABILITY_AND_QUALITY_GATES.md`

---

## Section 3 — Safety & Risk (1 pending)

- [x] **3.1** Hazard log (ISO 14971) → `iso14971_hazards` (8 hazards)
- [x] **3.2** Risk controls → `iso14971_risk_controls` (all residual RPN < 9)
- [x] **3.3** Benefit-risk analysis → `iso14971_benefit_risk` (approved: benefits_outweigh_risks)
- [x] **3.4** Cybersecurity risk assessment → JWT auth + OWASP mitigations documented
- [ ] **3.5** Data privacy impact assessment (DPDP 2023 alignment) → *pending DPO review*

---

## Section 4 — Clinical Evaluation (2 pending)

- [x] **4.1** Clinical evaluation plan → `clinical_validation_studies` table structure
- [x] **4.2** Performance data → AUROC 0.78 (risk scoring), 0.85 (triage) — synthetic baseline
- [ ] **4.3** Literature review → *pending systematic review document*
- [ ] **4.4** Post-market clinical follow-up plan → *draft required*

*Note: Synthetic validation studies are baseline only. Prospective clinical study required before final CDSCO submission.*

---

## Section 5 — Quality Management (1 pending)

- [ ] **5.1** ISO 13485 certificate or declaration → *QMS documented, certification audit pending*
- [x] **5.2** Document control procedure → QMS-SOP-001 (approved)
- [x] **5.3** NCR and CAPA procedure → QMS-SOP-002 (approved)
- [x] **5.4** Internal audit records → `qms_audit_records` table (procedure in place)

---

## Section 6 — Labelling & IFU (2 pending)

- [x] **6.3** Warning statements → AI outputs carry confidence scores; iSHA includes "consult a doctor" disclaimer
- [ ] **6.1** Software label → *formal label document required*
- [ ] **6.2** Instructions for use (IFU) → *IFU document required (clinical + technical)*

---

## Section 7 — Post-Market Surveillance (1 pending)

- [x] **7.1** PMS plan → QMS-SOP-006 (approved) + automated via `ai_quality_gate_log`
- [x] **7.2** Vigilance procedure → Governance alert system + NCR process
- [ ] **7.3** PSUR schedule → *pending first annual report*

---

## Section 8 — Declaration (Pending)

- [ ] **8.1** Declaration of conformity → *requires authorised signatory*
- [ ] **8.2** No rejection statement → *requires authorised signatory*

---

## Next Steps to Complete Filing

1. **Appoint authorised CDSCO representative** (Section 1) — legal action
2. **Commission ISO 13485 certification audit** (Section 5.1) — 2–3 month lead time
3. **Conduct prospective clinical study** (Section 4.3) — replace synthetic baseline with real validation
4. **Draft IFU and software label** (Section 6)
5. **Complete DPDP 2023 impact assessment** (Section 3.5)
6. **File when checklist ≥ 80% complete** — auto-assessed at `GET /api/samd-regulatory/cdsco/dashboard`

---

## API Endpoints

```
GET  /api/samd-regulatory/cdsco/dashboard                             — Filing readiness overview
GET  /api/samd-regulatory/cdsco/submissions/:id/checklist             — Section-by-section checklist
GET  /api/samd-regulatory/cdsco/submissions/:id/technical-file        — Technical file summary
PATCH /api/samd-regulatory/cdsco/submissions/:id/checklist/:itemNumber — Update checklist item
PATCH /api/samd-regulatory/cdsco/submissions/:id/status               — Update submission status
```
