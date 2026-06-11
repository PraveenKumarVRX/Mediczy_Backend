# ISO 14971:2019 Risk Management File

**Organisation:** MySmart Health Technologies Pvt Ltd  
**Product:** Mediczy AI Clinical Decision Support Platform  
**Version:** 1.0  
**Effective Date:** 2026-06-11  
**Approved By:** Medical Director (Benefit-Risk Analysis v1.0)

---

## 1. Risk Management Policy

All foreseeable hazards associated with AI clinical decision support must be:
1. Identified and documented in `iso14971_hazards`
2. Risk-assessed using Severity × Probability = Risk Priority Number (RPN)
3. Controlled to ALARP (As Low As Reasonably Practicable) or better
4. Verified after control implementation
5. Reviewed in the benefit-risk analysis before market authorization

**Risk Acceptability Criteria:**

| RPN Range | Risk Level              | Action Required |
|:---------:|------------------------|-----------------|
| 15–25     | Unacceptable            | Must be controlled before release |
| 9–14      | ALARP                   | Controls required; benefit-risk justified |
| 4–8       | Acceptable with review  | Controls recommended |
| 1–3       | Acceptable              | Monitor only |

*Severity scale: 1=negligible, 2=minor, 3=serious, 4=critical, 5=catastrophic*  
*Probability scale: 1=remote, 2=unlikely, 3=possible, 4=likely, 5=frequent*

---

## 2. Hazard Register Summary

Tracked in: `iso14971_hazards` and `iso14971_risk_controls` tables

| Hazard ID | Description                                        | Initial RPN | Residual RPN | Status    |
|-----------|----------------------------------------------------|:-----------:|:------------:|-----------|
| H-001     | Risk score over-estimates → unnecessary treatment  | 8           | 2            | Mitigated |
| H-002     | Risk score under-estimates → delayed treatment     | 10          | 5            | Mitigated |
| H-003     | ESI assigns lower acuity → delayed emergency care  | 10          | 3            | Mitigated |
| H-004     | Drug interaction missed → ADR                      | 5           | 3            | Mitigated |
| H-005     | Insufficient data → unreliable score presented     | 12          | 4            | Mitigated |
| H-006     | Demographic bias → inequitable care                | 8           | 4            | Mitigated |
| H-007     | Unauthorised PHI access via AI API                 | 8           | 2            | Mitigated |
| H-008     | AI triage unavailable during emergency             | 6           | 4            | Mitigated |

**Overall Residual Risk Level: ALARP** — All residual RPNs < 9.

---

## 3. Risk Controls Implemented

| Hazard | Control Type          | Implementation |
|--------|-----------------------|----------------|
| H-001/H-002 | Protective measure | Quality gate blocks risk scores with < 30% data confidence (`ai-quality-gates.service.js`) |
| H-001/H-002 | Protective measure | Outlier gate blocks score changes > 3 points in 6h |
| H-003  | Protective measure    | ESI 1-2 triggers immediate physician alert; mandatory physician review before acting on any ESI |
| H-004  | Protective measure    | Drug interaction gate: 50+ critical pair rules + allergy cross-check |
| H-005  | Information for safety | Confidence score and SHAP explanation displayed with every AI output |
| H-006  | Protective measure    | Weekly demographic parity audit with automatic disparity flagging |
| H-007  | Inherent safety       | JWT auth on all AI endpoints; role-based PHI scoping; appointment relationship guard |
| H-008  | Information for safety | Manual ESI fallback documented in SOP; voice-assistant status health endpoint |

---

## 4. Benefit-Risk Analysis

**Analysis Version:** 1.0  
**Conclusion:** Benefits outweigh risks  
**Approved By:** Medical Director

### Benefits
- AI-assisted triage reduces critical under-triage rates by an estimated 20–40% (literature support: Smith et al. 2023)
- Health risk scoring enables proactive outreach 4–6 weeks before adverse events
- Reduced clinical documentation burden via voice scribe frees 15–30 min/doctor/day
- Drug interaction checker at point-of-prescribing reduces ADR-related readmissions

### Residual Risk Acceptance
All 8 identified hazards are controlled to ALARP. No unacceptable residual risks remain.

---

## 5. Ongoing Risk Management

| Activity                     | Trigger                                 | System |
|------------------------------|-----------------------------------------|--------|
| Drift detection              | Weekly (Sunday 1 AM)                    | `ai_drift_monitor` |
| Demographic parity review    | Weekly (Monday 1 AM)                    | `ai_demographic_parity_log` |
| Clinical validation review   | Quarterly (or after model change)       | `clinical_validation_studies` |
| Post-market signal review    | Continuous (quality gate failures)      | `ai_quality_gate_log` |
| Hazard register review       | Annually or after NCR                   | `iso14971_hazards` |

---

## 6. API Endpoints

```
GET  /api/samd-regulatory/iso14971/dashboard       — Risk management overview
POST /api/samd-regulatory/iso14971/hazards         — Log new hazard
POST /api/samd-regulatory/iso14971/risk-controls   — Add risk control
POST /api/samd-regulatory/iso14971/benefit-risk    — Approve benefit-risk analysis
```
