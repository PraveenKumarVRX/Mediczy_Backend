# Mediczy AI Model Cards
**Per-component documentation required under FDA TPLC guidance and EU MDR Annex I §17**

| Document ID   | MED-AI-CARDS-001      |
|---------------|-----------------------|
| Version       | 1.0                   |
| Date          | 2026-06-01            |
| Owner         | AI CTO                |
| Review Cycle  | With each model update / minimum annually |

---

> **What is a Model Card?**
> A model card is a short document that discloses the purpose, performance, limitations, and appropriate use of an AI model. Introduced by Mitchell et al. (2019) at Google; now required by FDA for AI/ML-based SaMD and recommended under EU MDCG 2021-6 guidance.

---

## Card 1 — Health Risk Scoring (v2-bayesian)

**Component key:** `health-risk-scoring-v2-bayesian`

### Intended Use
Compute a personalised health risk score (0–10 scale) across five dimensions — cardiovascular, diabetes, hypertension, medication adherence, and lifestyle — for all active patients. Output is **clinical decision support only**: it assists clinicians in identifying high-risk patients who may benefit from preventive intervention. It does **not** constitute a diagnosis.

### Not Intended For
- Replacing physician clinical judgment
- Acute emergency assessment (use Emergency Triage for that)
- Patients under 18 years (thresholds not validated for paediatric populations)
- Pregnant patients (risk thresholds differ substantially)
- Standalone patient-facing diagnosis without clinician review

### Regulatory Classification
**Class IIb SaMD** (moderate-high risk) under IMDRF/SaMD N12 and CDSCO Medical Device Rules 2017.

### Model Architecture

| Layer | Technology | Role |
|---|---|---|
| Data ingestion | PostgreSQL queries | Pulls vitals, labs, prescriptions, wellness logs per patient |
| Cardiovascular scoring | Rule-based additive model | Age, BMI, BP, HR, cholesterol, chronic conditions |
| Diabetes scoring | Rule-based additive model | HbA1c, fasting glucose, BMI, family history, conditions |
| Hypertension scoring | Rule-based additive model | Systolic BP trend, diastolic BP |
| Medication adherence | Prescription fill heuristic | Prescription count vs expected fills over 6 months |
| Lifestyle scoring | Wellness log aggregation | Activity, sleep, diet logs |
| Aggregation | Bayesian weighted average | Weights: cardio 0.25, diabetes 0.20, hypertension 0.20, adherence 0.15, lifestyle 0.10, mental 0.10 |
| Recommendations | GPT-4 / iSHA LLM | Personalised recommendations for high/critical risk patients |
| Interpretability | Exact SHAP (additive) | Per-feature attribution stored in `ai_health_risk_scores.shap_values` |

### Input Features

| Feature | Source | Missing Data Handling |
|---|---|---|
| Age | `users.dateOfBirth` | Defaults to 30 (conservative) if missing |
| BMI (height + weight) | `patients.height`, `patients.weight` | Skipped if either missing |
| Systolic blood pressure | `vitals_records` | Skipped if no recent vitals |
| Heart rate | `vitals_records` | Skipped if no recent vitals |
| Chronic conditions | `patients.chronicConditions` | Treated as absent if null |
| HbA1c, fasting glucose | `ai_report_lab_values` | Skipped if no lab reports |
| Total cholesterol, LDL, HDL, triglycerides | `ai_report_lab_values` | Skipped if no lab reports |
| Prescription history | `prescriptions` (6-month window) | Adherence score defaults to 7.0 if no prescriptions |
| Lifestyle data | wellness/activity tables | Lifestyle score defaults to 6.0 if no data |
| Mental health | Not yet implemented | **Fixed at 7.0 (baseline) — known limitation** |

### Output

| Field | Type | Range | Meaning |
|---|---|---|---|
| `overall_score` | Float | 0–10 | Higher = greater health risk |
| `risk_level` | Enum | low / moderate / high / critical | Thresholds: < 3.5 low, 3.5–5.5 moderate, 5.5–7.0 high, ≥ 7.0 critical |
| `subscores` | JSON | 0–10 per dimension | Dimension-level scores |
| `shap_values` | JSON | Signed float per dimension | SHAP attribution: positive = increases risk, negative = reduces |
| `confidence_score` | Float | 0–1 | Data completeness confidence |
| `counterfactuals` | JSON | — | Nearest actionable changes to lower risk level |

### Performance

| Metric | Target | Current Status |
|---|---|---|
| AUC — cardiovascular risk | ≥ 0.75 | **Not yet measured — clinical validation required** |
| AUC — diabetes risk | ≥ 0.75 | **Not yet measured — clinical validation required** |
| Calibration (Brier score) | < 0.25 | **Not yet measured** |

### Known Limitations

1. **Mental health subscore is a fixed baseline (7.0)** — not derived from patient data. This dimension contributes 10% of the overall score and is not patient-specific until mood tracking data is available. The subscore is suppressed in patient-facing displays until real data exists.
2. **Medication adherence assumes prescription fill ≡ medication taken** — actual adherence may be substantially lower. Pill count verification or pharmacy refill data would improve accuracy.
3. **Not validated on Indian subcontinent population demographics** — cardiovascular thresholds (e.g., ACC/AHA Pooled Cohort Equations) were derived from predominantly North American and European cohorts. South Asian patients have different risk profiles at equivalent BMI and lipid levels.
4. **Does not incorporate genetic risk factors** — no BRCA, APOE, or polygenic risk score integration.
5. **6-month data window for prescriptions and labs** — does not capture historical events older than 6 months.
6. **No temporal trend analysis** — score is a point-in-time snapshot; does not detect trends (e.g., steadily rising BP).

### Demographic Performance

| Group | Known Issue | Mitigation |
|---|---|---|
| South Asian patients | Cardiovascular risk underestimated at standard BMI thresholds | Recommend BMI cut-off reduction: overweight at BMI ≥ 23 (not 25) |
| Elderly (≥ 80 years) | Age factor capped implicitly at 65+ bracket | Age coefficient does not increase further above 65 |
| Paediatric (< 18) | Not validated — do not use | Exclude from scoring |
| Pregnant patients | Not validated — many thresholds do not apply | Exclude from scoring |

### Change Control Plan
Any change to scoring weights, thresholds, or feature set must:
1. Be proposed via `POST /api/ai-governance/changes/propose` (or by self-learning pipeline automatically)
2. Pass medical director review via the governance dashboard
3. Run in shadow mode on 30-day historical data before activation
4. Document expected vs. observed impact on score distributions
5. Be logged in `ai_model_change_log` with approver and rationale

**Freeze policy:** Scoring weights and thresholds are frozen until the clinical validation study completes.

### Last Clinical Validation
**Not yet performed.** Target: Q3 2026.

---

## Card 2 — Emergency Triage (ESI 5-Level)

**Component key:** `emergency-triage-esi-v1`

### Intended Use
Provide Emergency Severity Index (ESI) 5-level triage classification based on patient-reported symptoms and vital signs. Assists trained triage nurses and emergency physicians in prioritising patient care. Output is **clinical decision support** — a qualified clinician must review and confirm the triage level before it determines care sequence.

### Not Intended For
- Autonomous patient disposition without clinical review
- Replacing trained triage personnel (ESI-certified nurses)
- Paediatric-specific triage protocols (requires PEWS / paediatric ESI adjustment)
- Triage in mass-casualty or disaster scenarios (START triage protocol applies instead)
- Remote-only settings without immediate clinical capacity

### Regulatory Classification
**Class III SaMD (highest risk)** under IMDRF/SaMD N12. Emergency triage for life-threatening conditions drives time-critical clinical management decisions.

### Model Architecture

| Layer | Technology | Role |
|---|---|---|
| Phase 1 — Red flag detection | Regex pattern matching (14 patterns) | Identifies ESI-1/2 conditions from symptom text |
| Phase 2 — Vitals assessment | Threshold rules (VITALS_THRESHOLDS) | Overrides ESI level based on critical vital signs |
| Phase 3 — Pain scale | Numeric threshold | Elevates ESI if pain ≥ 9/10 |
| Phase 4 — Age adjustment | Age-bracket rules | Infants < 1yr → ESI ≤ 2; Elderly > 80yr → ESI ≤ 3 |
| Phase 5 — LLM enrichment | iSHA / Groq / GPT-4 cascade | Borderline cases (ESI ≥ 3): LLM suggests possible upgrade |
| Interpretability | LIME surrogate (rule + text) | Attribution of symptom phrases + vitals stored per triage event |
| Quality gate | Pre-flight safety checks | ESI-1 mandatory alert, missing vitals flag, contradiction check |

### Red Flag Coverage

| Category | Conditions Covered | ESI Level Triggered |
|---|---|---|
| Cardiac | Chest pain, MI, angina | 1 |
| Stroke | Facial droop, slurred speech, TIA, hemiplegia | 1 |
| Anaphylaxis | Throat swelling, airway compromise | 1 |
| Cardiac arrest | Unresponsive, no pulse, not breathing | 1 |
| Haemorrhage | Severe bleeding | 1 |
| Seizure | Status epilepticus, continuous seizure | 1 |
| Respiratory | Dyspnoea, respiratory distress, asthma attack | 2 |
| High pain | Severe pain 8–10/10 | 2 |
| Toxicology | Poisoning, overdose | 2 |
| Psychiatric | Suicidal ideation, self-harm | 2 |
| Envenomation | Snakebite, scorpion sting | 2 |
| Trauma | Open/compound fracture | 2 |
| Burns | Face, airway, > 20%, third-degree | 2 |

### Known Limitations

1. **Language sensitivity** — red flag patterns are English regex. Mixed-language inputs (Hinglish, Tamil-English code-switching) may not match patterns reliably. Localised pattern sets required for non-English deployments.
2. **Pattern can be bypassed by paraphrasing** — "my heart really hurts" does not match `/chest.?pain/` — the LLM layer partially compensates but cannot guarantee coverage.
3. **No visual assessment** — cannot assess patient appearance, level of distress, diaphoresis, or cyanosis — all critical ESI determinants in the ESI v4 handbook.
4. **LLM component not independently validated** — the iSHA / Groq / GPT-4 cascade has not been prospectively evaluated on ESI reference cases.
5. **Vital signs not always available** — many triage events will have incomplete or absent vital signs, reducing confidence significantly.
6. **Paediatric age-specific thresholds not implemented** — normal HR, RR, and BP differ substantially between age groups in children. The current thresholds are adult norms.

### Vital Sign Thresholds Used

| Parameter | ESI-1 Trigger | ESI-2 Trigger |
|---|---|---|
| Systolic BP | < 80 mmHg | < 90 mmHg |
| Heart rate | > 150 or < 35 bpm | > 130 or < 45 bpm |
| SpO₂ | < 85% | < 90% |
| Respiratory rate | > 35 or < 6 /min | > 28 /min |
| Temperature | > 41.5 °C | > 40.5 °C |

### Safety Requirement (Non-Negotiable)
**A qualified clinician must be in the review loop for every ESI output before it determines patient care sequence.** The AI output must be displayed with the label: *"AI TRIAGE DECISION SUPPORT — REQUIRES CLINICAL CONFIRMATION."*

ESI-1 outputs automatically trigger a mandatory human alert (enforced by quality gate code `ESI1_HUMAN_ALERT_MANDATORY`).

### Last Clinical Validation
**Not yet performed.** Target: Q3 2026. Study design: prospective comparison of AI ESI assignment vs. certified triage nurse on ≥ 200 ED presentations.

---

## Card 3 — Drug Interaction Checker (v1-rules+llm)

**Component key:** `drug-interaction-checker-v1`

### Intended Use
Identify clinically significant drug-drug, drug-condition, and drug-food interactions at the point of prescribing. Provides severity classification (contraindicated / major / moderate) and clinical management recommendation. Assists prescribing physicians — does **not** replace pharmacist review for complex polypharmacy.

### Not Intended For
- Complete pharmacovigilance system — does not cover all possible drug pairs
- Replacing clinical pharmacist review for patients on > 5 concurrent medications
- Paediatric dosing calculations
- Renal / hepatic dose adjustment calculations

### Regulatory Classification
**Class III SaMD** — a missed contraindication can result in immediate patient death.

### Interaction Database

| Source | Coverage | Pairs Defined |
|---|---|---|
| WHO Essential Medicines List (critical pairs) | Global essential medicines | ~50 critical pairs |
| FDA major interaction alerts | US approved medications | ~20 selected pairs |
| India-specific market additions | Indian market drugs (amlodipine/simvastatin, metformin/alcohol) | 5 pairs |
| Drug-condition interactions | Renal, hepatic, pregnancy | 7 conditions |

### Known Limitations

1. **Incomplete coverage** — the built-in database covers ~50 critical pairs out of thousands of clinically significant interactions. The LLM cascade provides extended coverage but with unverified confidence.
2. **LLM may hallucinate interactions** — the LLM can generate plausible but unverified interaction claims for rare combinations. These must be verified against clinical references (Micromedex, MIMS) before acting.
3. **Drug name matching is regex-based** — generic name to brand name variations (e.g., "Ecosprin" for "aspirin") may not be recognised. Requires pharmacy dispensing system integration for reliable name normalisation.
4. **Severity is categorical** — does not provide patient-specific severity based on pharmacokinetics, genetic polymorphisms (e.g., CYP2D6 status), or renal/hepatic function.
5. **No Bayesian updating** — does not adjust interaction probability based on actual patient exposure history.

### Safety Requirement
All `contraindicated` severity flags must require prescribing physician acknowledgement (quality gate `CONTRAINDICATED_COMBO`) before a prescription can proceed. The acknowledgement is audit-logged.

---

## Card 4 — Medical Scribe (Whisper + Bimedix)

**Component key:** `medical-scribe-whisper-bimedix`

### Intended Use
Convert doctor-patient consultations (audio) to structured clinical notes across 14 medical specialties. Output is a **draft document** for physician review. The physician reviews, edits, and signs the note — the AI-generated draft never becomes a medical record without this step.

### Regulatory Classification
**NOT SaMD** — classified as a documentation productivity tool, not a medical device, because:
- The AI output does not drive a clinical decision
- A qualified physician is always the final actor (review + signature)
- Analogous to a medical transcription service

**Caveat:** If notes are ever committed to the medical record without physician review, the classification changes to Class III SaMD immediately.

### Safety Controls Built Into System

| Control | Implementation |
|---|---|
| Physician review enforcement | Note UI shows "DRAFT — NOT YET REVIEWED" watermark; commit is blocked without signature |
| Medication hallucination detection | Output scanned for anomalous dosages before presenting to physician |
| Allergy omission alert | If patient has documented allergies not referenced in note, physician is warned |
| Doctor sign-off requirement | `physician_signed_at` must be populated before note is committed to `clinical_notes` table |

### Known Limitations

1. **Speech recognition accuracy** — degrades with heavy accents, background noise, simultaneous speech, or speakers with speech impediments. The offline Whisper model (ggml-medium) achieves ~85–92% WER on clear medical English; lower for accented speech.
2. **Hallucination risk** — LLM (Bimedix / Indic-Gemma-2B) can generate plausible but incorrect medication names, dosages, or findings not actually spoken. The physician review step is the primary mitigation.
3. **Not validated across all 14 specialty templates** — full validation exists for General Medicine and Internal Medicine only.
4. **Indic language accuracy** — Whisper model accuracy for regional Indian languages is significantly lower than English for clinical terminology.

---

## Model Card Version Control

All model cards are:
- Stored statically in `server/services/ai-model-governance.service.js` (`MODEL_CARDS` object)
- Synced to the `ai_model_cards` database table via `POST /api/ai-governance/model-cards/sync`
- Versioned by the `version` field; any card update requires a governance change log entry

**To update a model card:** Edit the relevant entry in `MODEL_CARDS`, increment the `version` field, run `POST /api/ai-governance/model-cards/sync`, and record the change in `ai_model_change_log`.

---

*These model cards are part of the Mediczy Technical File for SaMD regulatory submission. They are living documents and must be updated whenever the corresponding AI component is materially changed.*
