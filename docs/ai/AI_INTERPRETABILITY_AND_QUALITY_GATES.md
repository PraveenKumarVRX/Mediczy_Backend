# AI Interpretability & Quality Gates — Technical Specification
**Post-hoc explainability and pre-flight safety checks for all AI/ML outputs**

| Document ID   | MED-AI-TECH-002        |
|---------------|------------------------|
| Version       | 1.0                    |
| Date          | 2026-06-01             |
| Owner         | AI CTO                 |
| Implements    | IEC 82304-1 §7, ISO 14971 §6, FDA AI/ML Action Plan §4 |

---

## 1. Overview

Every patient-facing AI output in Mediczy passes through two mandatory layers before delivery:

```
AI Model Output
      │
      ▼
┌─────────────────────────┐
│  INTERPRETABILITY LAYER │  ← WHY did the model output this?
│  (ai-interpretability   │
│   .service.js)          │
│                         │
│  • SHAP values          │
│  • LIME attribution     │
│  • Counterfactuals      │
│  • Confidence score     │
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│  QUALITY GATE LAYER     │  ← IS IT SAFE TO DELIVER?
│  (ai-quality-gates      │
│   .service.js)          │
│                         │
│  • 8 safety checks      │
│  • Block / warn / pass  │
│  • Full audit log       │
└──────────┬──────────────┘
           │
    ┌──────┴──────┐
    │             │
  PASS          BLOCKED
    │             │
    ▼             ▼
Deliver to    Hold for
clinician/   clinical
patient      review
```

---

## 2. Interpretability Layer

### 2.1 SHAP Values — Health Risk Scoring

**Method:** Exact Shapley Value decomposition for additive models.

For the `v2-bayesian` health risk model (a weighted sum of subscores), SHAP values are exact — no approximation is needed. Each dimension's contribution is:

```
φᵢ = (scoreᵢ − baselineᵢ) × |weightᵢ| × signᵢ

where:
  scoreᵢ    = patient's actual subscore for dimension i
  baselineᵢ = population reference score for dimension i
  weightᵢ   = model weight for dimension i
  signᵢ     = +1 for risk dimensions, −1 for protective dimensions
```

**Reference baselines (40-year-old population average):**

| Dimension | Baseline | Weight | Direction |
|---|---|---|---|
| cardiovascular | 3.0 | 0.25 | Risk (↑ = bad) |
| diabetes | 2.5 | 0.20 | Risk (↑ = bad) |
| hypertension | 3.5 | 0.20 | Risk (↑ = bad) |
| medication_adherence | 7.0 | 0.15 | Protective (↑ = good) |
| lifestyle | 6.0 | 0.10 | Protective (↑ = good) |
| mental_health | 7.0 | 0.10 | Protective (↑ = good) |

**SHAP completeness property:** For this additive model, the sum of all SHAP values equals the difference between the patient's overall score and the baseline overall score. This is a mathematically guaranteed property — no approximation error.

**Example output for a high-risk patient:**

```json
{
  "shap": {
    "values": {
      "cardiovascular": { "shap": +1.25, "score": 8.0, "baseline": 3.0, "impact": "high", "direction": "risk" },
      "diabetes":       { "shap": +0.50, "score": 5.0, "baseline": 2.5, "impact": "moderate", "direction": "risk" },
      "hypertension":   { "shap": +0.30, "score": 5.0, "baseline": 3.5, "impact": "low", "direction": "risk" },
      "medication_adherence": { "shap": -0.30, "score": 9.0, "baseline": 7.0, "impact": "moderate", "direction": "protective" },
      "lifestyle":      { "shap": +0.10, "score": 5.0, "baseline": 6.0, "impact": "low", "direction": "protective" },
      "mental_health":  { "shap": 0.00, "score": 7.0, "baseline": 7.0, "impact": "low", "direction": "protective" }
    },
    "topContributor": "cardiovascular",
    "topProtector": "medication_adherence",
    "method": "exact-additive-shap",
    "modelVersion": "v2-bayesian"
  }
}
```

**Clinical reading:** Cardiovascular risk contributes +1.25 points above baseline (the biggest driver). Good medication adherence partially offsets with −0.30 points. The overall score is 1.85 points above the baseline expectation.

**Storage:** `ai_health_risk_scores.shap_values` (JSONB), `ai_health_risk_scores.feature_attributions` (ranked array)

**API access:** `GET /api/ai-governance/patient/:patientId/explanation`

---

### 2.2 Intra-Dimension Attribution — Cardiovascular Sub-SHAP

Within the cardiovascular dimension, each input feature's contribution to the 0–10 cardiovascular score is tracked separately:

| Feature | Contribution Type |
|---|---|
| Age bracket | Cumulative additive |
| BMI | Cumulative additive |
| Systolic blood pressure | Cumulative additive |
| Heart rate | Cumulative additive |
| Chronic cardiac conditions | Cumulative additive |
| Lab values (cholesterol, LDL, HDL, TG) | Cumulative additive (capped at +3.0) |

This enables statements like: *"Your cardiovascular score of 8.0 is driven primarily by your BP (contributed +2.0) and age (contributed +2.5), with elevated cholesterol adding +1.5."*

---

### 2.3 LIME Attribution — Emergency Triage

**Method:** Local Interpretable Model-agnostic Explanations (surrogate approach).

For the triage service, the model is hybrid (rules + LLM). LIME is implemented as:
1. **Rule-layer attribution:** Exact match of symptom text against all 14 red-flag patterns — each match is attributed with the phrase that triggered it and the ESI level it would assign
2. **Vitals attribution:** Each vital sign is evaluated against ESI thresholds — abnormal vitals are attributed with their specific contribution
3. **Absence attribution:** Explicitly notes what was NOT found (no ESI-1 red flags, no vitals)
4. **Decision path:** Step-by-step trace of the phases that determined the final ESI level

**Example output:**

```json
{
  "lime": {
    "symptomAttributions": [
      { "phrase": "chest pain", "label": "Cardiac emergency signal", "esiInfluence": 1, "importance": 1.0, "type": "rule_match" }
    ],
    "vitalAttributions": [
      { "vital": "Systolic BP", "value": "85 mmHg", "label": "Hypotension (< 90)", "importance": 0.8 }
    ],
    "topFactors": [
      { "phrase": "chest pain", "label": "Cardiac emergency signal", "importance": 1.0 },
      { "vital": "Systolic BP", "value": "85 mmHg", "label": "Hypotension (< 90)", "importance": 0.8 }
    ],
    "decisionPath": [
      { "step": 1, "rule": "Red flag pattern matched (ESI-1)", "outcome": "Escalate to ESI Level 1" },
      { "step": 2, "rule": "Vital signs abnormal: Systolic BP", "outcome": "Vitals override confirmed ESI-1" }
    ],
    "humanReadableSummary": "ESI Level 1 (Resuscitation) assigned. Primary driver: Cardiac emergency signal. Contributing factors: Hypotension (< 90).",
    "method": "lime-rule-surrogate",
    "confidence": 0.95
  }
}
```

**Storage:** `ai_triage_interpretations.lime_attribution` (JSONB)

---

### 2.4 Counterfactual Explanations

**Method:** Nearest-counterfactual — what is the minimum change that would move the patient to the next lower risk level?

For each actionable dimension (cardiovascular, diabetes, hypertension, medication adherence, lifestyle), the counterfactual generator computes whether addressing that dimension could close the gap to the target risk level.

**Example output:**

```json
{
  "counterfactual": {
    "currentLevel": "high",
    "currentScore": 6.2,
    "targetLevel": "moderate",
    "targetScore": 5.49,
    "counterfactuals": [
      {
        "dimension": "cardiovascular",
        "currentScore": 8.0,
        "requiredChange": "decrease",
        "action": "Reduce systolic blood pressure below 130 mmHg",
        "impact": "high",
        "timeframe": "3-6 months with treatment",
        "modifiable": true
      },
      {
        "dimension": "medication_adherence",
        "currentScore": 4.0,
        "requiredChange": "increase",
        "action": "Improve medication adherence — use pill organizer or app reminders",
        "impact": "high",
        "timeframe": "1 month",
        "modifiable": true
      }
    ],
    "achievable": true
  }
}
```

**Clinical use:** Counterfactuals are the patient-facing component — displayed in the patient health dashboard as personalised, actionable goals.

**Storage:** `ai_health_risk_scores.counterfactuals` (JSONB)

---

### 2.5 Confidence Scoring

**Method:** Input data completeness → output confidence interval.

The confidence score reflects how much of the expected input data was available when the model ran. It is **not** a statistical confidence interval derived from model uncertainty — it is a data quality proxy.

| Data Source | Weight | Why Important |
|---|---|---|
| Recent vitals | 0.25 | Largest single contributor to BP, HR scoring |
| Prescription history | 0.20 | Required for adherence score |
| Lab orders | 0.20 | Required for HbA1c, cholesterol |
| Extracted lab values | 0.15 | Enables specific biomarker-level scoring |
| Date of birth | 0.10 | Required for age factor |
| Height & weight | 0.05 | Required for BMI |
| Chronic conditions recorded | 0.05 | Adds categorical risk |

**Confidence tiers:**

| Score | Tier | Action |
|---|---|---|
| ≥ 0.80 | High | Output can be presented as actionable decision support |
| 0.50 – 0.79 | Moderate | Present with disclaimer; encourage clinician verification of missing data |
| < 0.50 | Low | Do not act on output; request missing data from patient first |
| < 0.30 | Critical (blocked) | Quality gate blocks persistence; flag for data collection |

**Margin of error formula:**
```
margin_of_error = (1 − confidence_score) × 2.5
```
On a 0–10 scale, a confidence of 0.5 implies ±1.25 points uncertainty on the overall risk score.

---

## 3. Quality Gates

### 3.1 Gate Catalogue

Eight independent safety checks run on every AI output. Gates are applied per output type:

| Gate | Applied To | Failure Mode Detected |
|---|---|---|
| Data Completeness | Risk Score | Low-data output presented as high-confidence |
| Score Sanity | Risk Score | Score outside [0, 10] range |
| Score Outlier Detection | Risk Score | > 3-point change in 6 hours |
| Recommendation Safety | Risk Score | Recommendation conflicts with patient conditions |
| Mental Health Baseline Flag | Risk Score | Fixed baseline surfaced without disclosure |
| ESI-1 Mandatory Human Alert | Triage | ESI-1 delivered without paging a clinician |
| High ESI + Low Confidence | Triage | Critical triage with inadequate supporting data |
| Missing Vitals (High ESI) | Triage | ESI-1/2 without any vital sign data |
| ESI-5 with Critical Keywords | Triage | Possible under-triage |
| Dosage Hallucination Guard | Triage, Scribe | LLM generates dose ≥ 1000 mg or > 8 tablets/day |
| Forbidden Drug Combinations | Drug Interaction, Scribe | SSRI+MAOI, sildenafil+nitrate, warfarin+NSAID, etc. |
| Contraindicated Severity | Drug Interaction | "Contraindicated" pair — requires physician sign-off |
| Allergy Conflict | Drug Interaction | Drug in recommendation matches patient's documented allergy |
| Condition-Drug Conflict | Drug Interaction | Known condition makes drug unsafe (e.g., ACE inhibitor in pregnancy) |
| Allergy Omission (Scribe) | Scribe | Patient has allergies but note doesn't mention them |
| Physician Review Required | Scribe | Always enforced — mandatory watermark and commit block |
| Missing Vitals in Note | Scribe | Note lacks any vital sign documentation |
| Missing Diagnosis in Note | Scribe | No assessment/impression section |

### 3.2 Gate Result Structure

```javascript
{
  gateType:        "health_risk_score",
  patientId:       12345,
  passed:          false,           // true if no blockers
  severity:        "blocked",       // 'pass' | 'review' | 'warning' | 'blocked'
  blockers: [                       // hard stops — output must not be delivered
    {
      code:    "CRITICALLY_INCOMPLETE_DATA",
      message: "Only 25% of expected data sources available",
      action:  "Do not present as actionable. Request missing data."
    }
  ],
  warnings: [                       // soft flags — output may be delivered with caveats
    {
      code:    "MENTAL_HEALTH_BASELINE",
      message: "Mental health score is fixed baseline (7.0) — not from patient data",
      action:  "Suppress mental health subscore from patient display"
    }
  ],
  requiredActions: [                // mandatory steps before acting on output
    {
      code:    "ESI1_HUMAN_ALERT_MANDATORY",
      message: "ESI Level 1 — page on-duty physician immediately",
      blocking: true
    }
  ],
  checkedAt: "2026-06-01T10:30:00Z"
}
```

### 3.3 Gate Enforcement Flow

```
Risk Score / Triage / Drug Check output generated
                    │
                    ▼
          ┌─────────────────┐
          │  Quality Gate   │
          │  checkXxx()     │
          └────────┬────────┘
                   │
         ┌─────────┴─────────┐
         │                   │
    BLOCKER?              NO BLOCKER?
         │                   │
         ▼                   ▼
  DO NOT PERSIST        PERSIST OUTPUT
  DO NOT DELIVER              │
  Log to audit            WARNINGS?
  Flag for                    │
  clinician             ┌─────┴─────┐
  review                │           │
                     YES            NO
                        │           │
                        ▼           ▼
                  Deliver with   Deliver
                  disclaimer     normally
```

### 3.4 Forbidden Drug Combinations (Hard Block List)

These combinations result in a `FORBIDDEN_DRUG_COMBINATION` blocker regardless of context:

| Drug A | Drug B | Reason |
|---|---|---|
| Warfarin | Aspirin, NSAIDs | Major bleeding risk |
| SSRIs (fluoxetine, sertraline, etc.) | MAOIs (selegiline, phenelzine, etc.) | Serotonin syndrome — potentially fatal |
| Sildenafil / tadalafil | Nitrates / nitroglycerin | Fatal hypotension |
| Ciprofloxacin | Tizanidine | 10× tizanidine level increase |
| Methotrexate | NSAIDs | Methotrexate toxicity |
| ACE inhibitors | Pregnancy | Teratogenic |

### 3.5 Audit Log

Every gate result is persisted to `ai_quality_gate_log`:
- Available via `GET /api/ai-governance/quality-gates/log`
- Filterable by `gate_type` and `severity`
- Retained indefinitely (regulatory requirement)
- Summary statistics available in the governance dashboard

---

## 4. API Reference

### Interpretability endpoints

| Endpoint | Auth | Description |
|---|---|---|
| `GET /api/ai-governance/patient/:id/explanation` | Doctor / Admin | SHAP + counterfactual bundle for a patient |
| `GET /api/ai-governance/quality-gates/log` | Admin / Medical Director | Full quality gate audit log |

### Governance endpoints

| Endpoint | Auth | Description |
|---|---|---|
| `GET /api/ai-governance/dashboard` | Medical Director / Super Admin | Full governance dashboard |
| `GET /api/ai-governance/changes/pending` | Medical Director / Super Admin | Pending model changes awaiting approval |
| `POST /api/ai-governance/changes/:id/approve` | Medical Director / Super Admin | Approve a pending change |
| `POST /api/ai-governance/changes/:id/reject` | Medical Director / Super Admin | Reject a pending change with reason |
| `GET /api/ai-governance/changes/history` | Medical Director / Super Admin | Change audit trail |
| `GET /api/ai-governance/model-cards` | Medical Director / Super Admin | All model cards |
| `GET /api/ai-governance/model-cards/:key` | Medical Director / Super Admin | Single model card |
| `POST /api/ai-governance/model-cards/sync` | Super Admin | Sync static cards to DB |
| `POST /api/ai-governance/drift/run` | Medical Director / Super Admin | Manual drift monitor run |
| `GET /api/ai-governance/drift/results` | Medical Director / Super Admin | Recent drift results |
| `GET /api/ai-governance/demographic-parity` | Medical Director / Super Admin | Bias/parity report |
| `GET /api/ai-governance/samd-readiness` | Medical Director / Super Admin | SaMD readiness checklist |

---

## 5. Drift Detection (PSI)

### 5.1 Method

Population Stability Index (PSI) is computed weekly by comparing the distribution of AI risk scores (current 7-day window) against a 30-day baseline window.

```
PSI = Σᵢ (Aᵢ% − Eᵢ%) × ln(Aᵢ% / Eᵢ%)

where:
  Eᵢ = expected (baseline) proportion in bin i
  Aᵢ = actual (current) proportion in bin i
  bins = 10 equal-width buckets over the value range
```

### 5.2 Alert Thresholds

| PSI Value | Interpretation | Action |
|---|---|---|
| < 0.10 | No significant shift | Monitor only |
| 0.10 – 0.20 | Minor shift | Investigate data collection or population changes |
| > 0.20 | Major shift | Alert medical director. Consider model re-calibration. Do not apply self-learning changes until resolved. |

### 5.3 Features Monitored

- `overall_risk_score` (primary)
- `cardiovascular_risk_score` (subscore)
- Additional features added as patient population grows

---

## 6. Implementation Files

| File | Purpose |
|---|---|
| [server/services/ai-interpretability.service.js](../../server/services/ai-interpretability.service.js) | SHAP, LIME, counterfactuals, confidence |
| [server/services/ai-model-governance.service.js](../../server/services/ai-model-governance.service.js) | Model cards, PCCP, drift detection, demographic parity |
| [server/services/ai-quality-gates.service.js](../../server/services/ai-quality-gates.service.js) | 8 safety gate checks, audit logging |
| [server/routes/ai-governance.route.js](../../server/routes/ai-governance.route.js) | All governance + explanation API endpoints |
| [server/migrations/samd-interpretability-governance.migration.js](../../server/migrations/samd-interpretability-governance.migration.js) | DB schema for all new tables and columns |

---

*This specification is part of the Mediczy Technical File. It must be reviewed and updated whenever the interpretability or quality gate logic changes.*
