# Clinical Validation Study Protocol
**Mediczy AI/ML SaMD — Evidence Generation Plan**

| Document ID   | MED-CL-VAL-001              |
|---------------|-----------------------------|
| Version       | 1.0 (Draft)                 |
| Date          | 2026-06-01                  |
| Owner         | Medical Director + AI CTO   |
| Status        | DRAFT — awaiting IRB review |
| Target start  | Q3 2026                     |

---

## Study 1 — Health Risk Scoring Validation (v2-bayesian)

### 1.1 Study Objective
Validate that the Mediczy v2-bayesian health risk scoring model predicts clinically meaningful cardiovascular and diabetes risk with performance non-inferior to established reference tools (ACC/AHA Pooled Cohort Equations, ADA Type 2 Diabetes Risk Score).

### 1.2 Study Design
**Type:** Retrospective cohort study  
**Design:** Single-blind validation against structured clinical outcomes  
**Setting:** 2–3 partner hospitals with existing Mediczy deployment  
**Duration:** 12-month outcome follow-up per patient (retrospective: data already exists)

### 1.3 Inclusion / Exclusion Criteria

**Inclusion:**
- Active patients in Mediczy system with ≥ 1 computed `ai_health_risk_scores` record
- Age 18–79 years
- At least 3 of the following data sources available: vitals, lab results, prescriptions, chronic conditions list
- Minimum 12 months of follow-up outcome data available in clinical records

**Exclusion:**
- Patients under 18 years (paediatric norms not implemented)
- Pregnant patients at time of index risk score (physiologically distinct)
- Patients with < 30% data completeness score (insufficient input data)
- Patients enrolled in oncology protocols (competing mortality risk confounders)

### 1.4 Sample Size Calculation
**Primary endpoint:** AUC for cardiovascular event prediction at 12 months  
**Hypothesis:** H₀: AUC ≤ 0.65 (no better than chance); H₁: AUC ≥ 0.75  
**Power:** 80% | **Alpha:** 0.05 (two-sided)  
**Estimated event rate:** 5% cardiovascular events in 12 months (Indian urban population)  
**Required n:** **≥ 500 patients** (based on Hanley-McNeil formula for AUC comparison)

*Increase to 800 if event rate is lower than 5% at interim analysis.*

### 1.5 Primary Outcomes

| Outcome | Definition | Time Point |
|---|---|---|
| Cardiovascular event | Hospitalisation for MI, stroke, or ACS documented in EMR | 12 months |
| Diabetes diagnosis | New ICD-10 code E11 or HbA1c ≥ 6.5% in 12-month window | 12 months |
| High-risk confirmation | High/Critical Mediczy score patient seen by cardiologist or endocrinologist | 6 months |

### 1.6 Secondary Outcomes
- Sensitivity and specificity of risk level classification (low/moderate/high/critical) vs clinical outcome
- Positive predictive value (PPV) and negative predictive value (NPV)
- Calibration: Hosmer-Lemeshow goodness-of-fit test
- Subgroup analysis: age groups (18–39, 40–59, 60–79), gender, presence of diabetes

### 1.7 Reference Standard Comparison

| Reference Tool | Use Case | Data Required |
|---|---|---|
| ACC/AHA Pooled Cohort Equations (2013) | 10-year cardiovascular risk | Age, gender, total cholesterol, HDL, SBP, BP treatment, diabetes, smoking |
| Framingham Risk Score | Short-term CV risk | Cholesterol, BP, BMI, age, smoking |
| ADA Risk Score | Type 2 diabetes | Age, BMI, family history, gestational diabetes, hypertension, physical activity |

**Comparison metric:** Concordance between Mediczy overall risk level and ACC/AHA risk category (low <7.5%, intermediate 7.5–20%, high >20%).

### 1.8 Data Collection Plan

**Step 1:** SQL export from Mediczy production DB
```sql
SELECT 
  r.patient_id,
  r.overall_score,
  r.risk_level,
  r.subscores,
  r.confidence_score,
  r.data_completeness,
  r.model_version,
  r.updated_at as score_date,
  p."dateOfBirth", p."chronicConditions", p.height, p.weight,
  u.gender
FROM ai_health_risk_scores r
JOIN patients p ON p.id = r.patient_id
JOIN users u ON u.id = p."userId"
WHERE r.model_version = 'v2-bayesian'
  AND r.updated_at < NOW() - INTERVAL '12 months'
  AND r.confidence_score >= 0.5;
```

**Step 2:** Clinical outcome extraction from partner hospital EMR (manual chart review for cardiovascular events) — blinded to Mediczy score.

**Step 3:** Merge datasets by patient_id under data sharing agreement (DPA required with each hospital).

**Step 4:** Biostatistician runs ROC/AUC analysis, calibration testing, subgroup analysis.

### 1.9 Statistical Analysis Plan

| Analysis | Method | Software |
|---|---|---|
| Primary AUC | DeLong method | R: pROC package |
| Calibration | Hosmer-Lemeshow test | R: ResourceSelection |
| Subgroup comparison | Mann-Whitney U / Kruskal-Wallis | R |
| Sensitivity/specificity | Youden's J-optimal threshold | R: pROC |
| Missing data | Multiple imputation (MICE) | R: mice |

**Significance threshold:** p < 0.05, reported with 95% confidence intervals.

### 1.10 Success Criteria (Pass/Fail for CDSCO filing)

| Metric | Minimum Threshold | Target |
|---|---|---|
| AUC (cardiovascular) | ≥ 0.70 | ≥ 0.75 |
| AUC (diabetes) | ≥ 0.70 | ≥ 0.75 |
| Sensitivity (high/critical) | ≥ 0.80 | ≥ 0.90 |
| Specificity (low risk) | ≥ 0.70 | ≥ 0.80 |
| Hosmer-Lemeshow p-value | > 0.05 (well calibrated) | > 0.10 |

### 1.11 Timeline

| Milestone | Target Date |
|---|---|
| IRB/Ethics submission | 2026-07-15 |
| IRB approval | 2026-08-15 |
| Data extraction and linkage | 2026-09-01 |
| Biostatistician analysis | 2026-10-01 |
| Draft clinical evaluation report | 2026-11-01 |
| Final report + CDSCO filing | 2026-12-01 |

---

## Study 2 — Emergency Triage (ESI) Validation

### 2.1 Study Objective
Demonstrate that the Mediczy ESI triage system achieves clinically acceptable agreement with trained emergency triage nurses for 5-level ESI classification, with non-inferior sensitivity for high-acuity cases (ESI-1 and ESI-2).

### 2.2 Study Design
**Type:** Prospective observational comparison study  
**Design:** Parallel: AI ESI assignment vs. trained triage nurse ESI assignment (blinded)  
**Setting:** Emergency department of 1–2 partner hospitals  
**Duration:** 3 months prospective enrollment

### 2.3 Sample Size
**Required n:** **≥ 200 ED presentations** (targeting ≥ 40 ESI-1/2 cases based on ~20% high-acuity ED prevalence)  
**Power:** 80% for Cohen's kappa ≥ 0.60 (substantial agreement)  
**Minimum ESI-1/2 cases:** 40 (for sensitivity analysis of critical patients)

### 2.4 Protocol
1. Patient presents to ED — chief complaint and vitals recorded by triage nurse as usual
2. Same chief complaint text and vitals entered into Mediczy triage interface by research assistant (simultaneously, blinded to nurse's assessment)
3. Nurse records ESI level based on clinical assessment
4. Mediczy AI records ESI level from algorithm output
5. Both captured — neither influences the other
6. Gold standard: ED physician confirms final disposition within 1 hour of presentation

### 2.5 Primary Outcomes

| Metric | Target |
|---|---|
| Cohen's kappa (overall 5-level agreement) | ≥ 0.60 |
| Sensitivity for ESI-1 and ESI-2 | ≥ 0.90 |
| Specificity for ESI-4 and ESI-5 (avoid over-triage) | ≥ 0.80 |
| Under-triage rate (AI assigns lower severity than nurse) | < 5% |

### 2.6 Under-Triage is the Critical Safety Endpoint
An under-triage error (AI assigns ESI-5 to an ESI-1 patient) is the primary safety concern. The study must demonstrate:
- **Zero missed ESI-1 cases** (100% sensitivity for life-threatening presentations)
- Under-triage rate (any level) < 5%

If zero-missed-ESI-1 is not achieved, the system must be immediately modified before any further clinical use.

### 2.7 Language and Local Adaptation Testing
Include a 10% sub-sample of patients whose chief complaint is recorded in Hindi or a regional language (Tamil, Kannada, Telugu, Marathi). Document sensitivity difference vs English-language inputs — this is required for India-specific deployment.

---

## Regulatory Filing Plan

### Required Documents for CDSCO Class B/C Filing

| Document | Source | Status |
|---|---|---|
| Technical File (software description, architecture) | CLAUDE.md + docs/ai/ | Partial — needs IEC 62304 format |
| Clinical Evaluation Report (Study 1 + Study 2) | Biostatistician analysis | Pending studies |
| Risk Management File (ISO 14971 FMEA) | docs/ai/ISO_14971_RISK_FILE.md | TODO |
| Instructions for Use (IFU) | New document | TODO |
| Declaration of Conformity | Legal/regulatory | TODO |
| Software Lifecycle Documentation (IEC 62304) | New document | TODO |
| QMS Certificate (ISO 13485) | External certification body | TODO |
| Labelling (product description + intended use) | New document | TODO |

### Filing Form
**Form MD-14** (Application for grant of licence to manufacture medical device in India)  
or  
**Form MD-5** if manufactured outside India (import licence)

**Submit to:** Central Drugs Standard Control Organisation (CDSCO), New Delhi  
**Fee:** ₹50,000–₹2,00,000 depending on device class  
**Expected review time:** 6–12 months

---

## Partner Hospital Engagement Template

*Use this letter for initial hospital outreach:*

---

**Re: Invitation to participate in AI validation study for digital health platform**

Dear [Chief Medical Officer / Research Director],

Mediczy (operated by MySmart Health Pvt Ltd) is conducting a clinical validation study for our AI-assisted health risk scoring and emergency triage features as part of our Software as a Medical Device (SaMD) regulatory filing with CDSCO.

We invite [Hospital Name] to participate as a study partner. Your involvement would include:
- Sharing de-identified patient outcome data (cardiovascular events, diabetes diagnoses) for a retrospective analysis covering the past 12–18 months, for patients already using the Mediczy platform
- Hosting a prospective emergency triage comparison study in your ED for 3 months
- No patient care changes — this is an observational study only

We will provide:
- Full Data Processing Agreement (DPA/BAA) and ethics compliance support
- Co-authorship on any resulting publications
- Access to the Mediczy platform at no cost during the study period
- Biostatistician support for your institution's internal analysis

Please contact us at [email] to schedule a call with our Medical Director.

---

*This document constitutes part of the Mediczy Technical File for SaMD regulatory submission.*
