# Botlet Confidence Thresholds - Recommended Configuration

## Overview

This document provides **recommended confidence thresholds** for different botlet types, intent categories, and autonomy levels. These thresholds have been calibrated based on:

- **Risk assessment** (medical, legal, user experience)
- **Complexity** of the task
- **Autonomy level** of the botlet
- **Historical performance** data

---

## Global Thresholds

### Universal Baseline
```javascript
{
  globalMinimumConfidence: 20,  // Below this, reject query entirely
  humanEscalationThreshold: 30, // Below this, always escalate to human
  semanticFallbackTrigger: 50   // Below this, use semantic embeddings fallback
}
```

---

## Intent-Specific Thresholds

### 1. EMERGENCY (Priority 0)

**Risk Level:** 🔴 CRITICAL - Life-threatening situations

```javascript
{
  minimum: 60,           // Reject if confidence < 60%
  preferred: 80,         // Optimal performance at 80%+
  escalationThreshold: 70, // Escalate if < 70%
  handoffThreshold: 50,  // Immediate handoff if < 50%
  
  autonomyLevel: 'supervised',
  reasoning: 'High stakes - any misclassification could be fatal'
}
```

**Routing Decision Tree:**
- `Confidence ≥ 80%` → Emergency triage botlet (supervised)
- `Confidence 70-79%` → Emergency triage + human oversight
- `Confidence 60-69%` → Immediate human escalation + botlet assistance
- `Confidence 50-59%` → Direct human agent
- `Confidence < 50%` → Emergency dispatch + 911 alert

---

### 2. APPOINTMENT (Priority 1)

**Risk Level:** 🟡 LOW - Administrative task

```javascript
{
  minimum: 50,           // Accept at 50%+ confidence
  preferred: 70,         // Best performance at 70%+
  escalationThreshold: 40, // Escalate if < 40%
  handoffThreshold: 30,  // Human handoff if < 30%
  
  autonomyLevel: 'fully_autonomous',
  reasoning: 'Low risk - booking errors are easily correctable'
}
```

**Routing Decision Tree:**
- `Confidence ≥ 70%` → Appointment scheduler botlet (autonomous)
- `Confidence 50-69%` → Appointment botlet with confirmation step
- `Confidence 40-49%` → Escalate to doctor search botlet first
- `Confidence 30-39%` → Human scheduling agent
- `Confidence < 30%` → Queue for manual review

---

### 3. DOCTOR SEARCH (Priority 2)

**Risk Level:** 🟡 LOW-MEDIUM - Search and navigation

```javascript
{
  minimum: 45,           // Accept at 45%+ confidence
  preferred: 65,         // Optimal at 65%+
  escalationThreshold: 35, // Escalate if < 35%
  handoffThreshold: 25,  // Human handoff if < 25%
  
  autonomyLevel: 'fully_autonomous',
  reasoning: 'Search results can be refined - low consequence of imperfect match'
}
```

**Routing Decision Tree:**
- `Confidence ≥ 65%` → Doctor search navigator (autonomous)
- `Confidence 45-64%` → Search with follow-up clarification
- `Confidence 35-44%` → Suggest multiple options + human refinement
- `Confidence 25-34%` → Human agent for manual search
- `Confidence < 25%` → General information fallback

---

### 4. PREGNANCY (Priority 2)

**Risk Level:** 🟠 HIGH - Maternal and fetal health

```javascript
{
  minimum: 55,           // Minimum 55% confidence
  preferred: 75,         // Best at 75%+
  escalationThreshold: 45, // Escalate if < 45%
  handoffThreshold: 35,  // Human OB/GYN if < 35%
  
  autonomyLevel: 'semi_autonomous',
  reasoning: 'High risk - pregnancy complications require expert care'
}
```

**Routing Decision Tree:**
- `Confidence ≥ 75%` → Pregnancy specialist botlet (semi-autonomous)
- `Confidence 55-74%` → Pregnancy botlet + OB/GYN referral
- `Confidence 45-54%` → Direct OB/GYN specialist referral
- `Confidence 35-44%` → Human maternal health team
- `Confidence < 35%` → Emergency triage if symptoms present

---

### 5. MENTAL HEALTH (Priority 2)

**Risk Level:** 🟠 HIGH - Psychological crisis potential

```javascript
{
  minimum: 55,           // Minimum 55% confidence
  preferred: 75,         // Optimal at 75%+
  escalationThreshold: 45, // Escalate if < 45%
  handoffThreshold: 35,  // Crisis counselor if < 35%
  
  autonomyLevel: 'semi_autonomous',
  reasoning: 'Risk of suicide/self-harm - requires sensitivity and expertise'
}
```

**Routing Decision Tree:**
- `Confidence ≥ 75%` → Mental health specialist botlet
- `Confidence 55-74%` → Mental health botlet + psychiatrist referral
- `Confidence 45-54%` → Direct psychiatrist/psychologist referral
- `Confidence 35-44%` → Human crisis counselor
- `Confidence < 35%` → Emergency mental health services + crisis hotline

---

### 6. PEDIATRIC (Priority 2)

**Risk Level:** 🟠 HIGH - Child health

```javascript
{
  minimum: 55,           // Minimum 55% confidence
  preferred: 75,         // Best at 75%+
  escalationThreshold: 45, // Escalate if < 45%
  handoffThreshold: 35,  // Pediatrician if < 35%
  
  autonomyLevel: 'semi_autonomous',
  reasoning: 'Children deteriorate quickly - err on side of caution'
}
```

**Routing Decision Tree:**
- `Confidence ≥ 75%` → Pediatric specialist botlet
- `Confidence 55-74%` → Pediatric botlet + pediatrician referral
- `Confidence 45-54%` → Direct pediatrician referral
- `Confidence 35-44%` → Pediatric emergency assessment
- `Confidence < 35%` → Emergency services if acute symptoms

---

### 7. MEDICAL CONSULT (Priority 3)

**Risk Level:** 🟠 MEDIUM-HIGH - Diagnostic assistance

```javascript
{
  minimum: 40,           // Accept at 40%+ confidence
  preferred: 65,         // Optimal at 65%+
  escalationThreshold: 35, // Escalate if < 35%
  handoffThreshold: 25,  // Human doctor if < 25%
  
  autonomyLevel: 'semi_autonomous',
  reasoning: 'Medical advice carries risk - but general consultation is lower stakes than diagnosis'
}
```

**Routing Decision Tree:**
- `Confidence ≥ 65%` → Medical consultant botlet
- `Confidence 40-64%` → Consultant botlet with disclaimer + specialist referral option
- `Confidence 35-39%` → Specialist botlet based on symptoms
- `Confidence 25-34%` → Human general practitioner
- `Confidence < 25%` → Triage to appropriate specialist

---

### 8. MEDICATION (Priority 3)

**Risk Level:** 🟠 MEDIUM-HIGH - Drug interactions and safety

```javascript
{
  minimum: 45,           // Minimum 45% confidence
  preferred: 70,         // Best at 70%+
  escalationThreshold: 40, // Escalate if < 40%
  handoffThreshold: 30,  // Pharmacist if < 30%
  
  autonomyLevel: 'semi_autonomous',
  reasoning: 'Medication errors can be dangerous - need high confidence'
}
```

**Routing Decision Tree:**
- `Confidence ≥ 70%` → Medication information botlet
- `Confidence 45-69%` → Medication botlet + pharmacist verification
- `Confidence 40-44%` → Direct pharmacist consultation
- `Confidence 30-39%` → Prescribing doctor consultation
- `Confidence < 30%` → Medical records review + doctor appointment

---

### 9. LAB TEST (Priority 3)

**Risk Level:** 🟡 MEDIUM - Interpretation and explanation

```javascript
{
  minimum: 45,           // Accept at 45%+ confidence
  preferred: 70,         // Optimal at 70%+
  escalationThreshold: 40, // Escalate if < 40%
  handoffThreshold: 30,  // Lab specialist if < 30%
  
  autonomyLevel: 'semi_autonomous',
  reasoning: 'Lab interpretation requires expertise - but explaining results is moderate risk'
}
```

**Routing Decision Tree:**
- `Confidence ≥ 70%` → Lab test explanation botlet
- `Confidence 45-69%` → Lab botlet + doctor follow-up recommendation
- `Confidence 40-44%` → Direct doctor consultation for results
- `Confidence 30-39%` → Lab specialist or pathologist
- `Confidence < 30%` → Referring physician review

---

### 10. LIFESTYLE (Priority 4)

**Risk Level:** 🟢 LOW - General wellness advice

```javascript
{
  minimum: 35,           // Accept at 35%+ confidence
  preferred: 60,         // Optimal at 60%+
  escalationThreshold: 30, // Escalate if < 30%
  handoffThreshold: 20,  // Human wellness coach if < 20%
  
  autonomyLevel: 'fully_autonomous',
  reasoning: 'General advice is low risk - users expect educational content'
}
```

**Routing Decision Tree:**
- `Confidence ≥ 60%` → Lifestyle guidance botlet (autonomous)
- `Confidence 35-59%` → Lifestyle botlet with resource links
- `Confidence 30-34%` → Nutritionist/fitness coach referral
- `Confidence 20-29%` → Human wellness coach
- `Confidence < 20%` → General information fallback

---

### 11. GENERAL INFO (Priority 5)

**Risk Level:** 🟢 VERY LOW - Educational content

```javascript
{
  minimum: 30,           // Very permissive threshold
  preferred: 55,         // Optimal at 55%+
  escalationThreshold: 25, // Escalate if < 25%
  handoffThreshold: 15,  // Human support if < 15%
  
  autonomyLevel: 'fully_autonomous',
  reasoning: 'Informational queries have minimal risk - can provide general responses'
}
```

**Routing Decision Tree:**
- `Confidence ≥ 55%` → General information botlet
- `Confidence 30-54%` → General botlet with multiple resources
- `Confidence 25-29%` → FAQ redirect or search
- `Confidence 15-24%` → Human support agent
- `Confidence < 15%` → "Could not understand" fallback

---

## Autonomy Level Adjustments

### Fully Autonomous Botlets
- Can operate at **lower confidence thresholds** (35-50%)
- Suitable for: Appointments, Doctor Search, Lifestyle, General Info
- Rationale: Low-risk tasks where mistakes are easily correctable

### Semi-Autonomous Botlets
- Require **moderate confidence** (45-55% minimum)
- Suitable for: Medical Consult, Medication, Lab Test, Pregnancy, Pediatric, Mental Health
- Rationale: Medium-risk tasks requiring expert validation

### Assisted Botlets
- Need **high confidence** (60%+ minimum)
- Suitable for: Complex diagnostics, prescription management
- Rationale: High-risk tasks requiring human oversight

### Supervised Botlets
- Demand **very high confidence** (70%+ minimum)
- Suitable for: Emergency triage, critical care
- Rationale: Life-threatening situations requiring immediate human review

---

## Dynamic Threshold Adjustment

### Performance-Based Tuning

Monitor these metrics to adjust thresholds dynamically:

```javascript
// Increase threshold if:
- False positive rate > 10%
- User dissatisfaction rate > 15%
- Escalation rate > 30%

// Decrease threshold if:
- False negative rate > 5%
- Botlet utilization < 50%
- User wait times > 5 minutes
```

### Time-Based Adjustments

```javascript
// Peak hours (higher load):
thresholds.minimum += 5  // Stricter to reduce load

// Off-peak hours (lower load):
thresholds.minimum -= 5  // More permissive to improve coverage
```

### User-Specific Adjustments

```javascript
// Premium users:
thresholds.escalationThreshold += 10  // Faster human escalation

// First-time users:
thresholds.minimum += 5  // More conservative routing

// Repeat users (good history):
thresholds.minimum -= 5  // More autonomy
```

---

## Calibration Formulas

### Confidence Score Calibration

```javascript
calibratedConfidence = rawConfidence × calibrationFactor

where:
  calibrationFactor = successRate / expectedSuccessRate
  
Example:
  rawConfidence = 60%
  actualSuccessRate = 75%
  expectedSuccessRate = 80%
  calibrationFactor = 0.9375
  calibratedConfidence = 60 × 0.9375 = 56.25%
```

### Risk-Adjusted Thresholds

```javascript
adjustedThreshold = baseThreshold × (1 + riskMultiplier)

where:
  riskMultiplier = {
    'very_low': 0.0,      // No adjustment
    'low': 0.1,           // +10%
    'medium': 0.25,       // +25%
    'high': 0.5,          // +50%
    'critical': 1.0       // +100% (double the threshold)
  }

Example (Emergency):
  baseThreshold = 50%
  riskMultiplier = 1.0 (critical)
  adjustedThreshold = 50 × (1 + 1.0) = 100% ❌ (too strict)
  
Better approach:
  adjustedThreshold = baseThreshold + (riskMultiplier × 20)
  adjustedThreshold = 50 + (1.0 × 20) = 70% ✅
```

---

## Testing Recommendations

### A/B Testing Setup

```javascript
// Test different thresholds with user segments
Control Group: Current thresholds
Test Group A: Thresholds + 10%
Test Group B: Thresholds - 10%

Measure:
- User satisfaction
- Escalation rate
- Resolution time
- Accuracy rate

Duration: 2-4 weeks
Sample size: 1000+ interactions per group
```

### Confidence Calibration Testing

```bash
# Run calibration test suite
node --input-type=module -e "
import BotletRouter from './server/utils/botletRouter.js';
const router = new BotletRouter();

// Test queries at different confidence levels
const testCases = [
  { query: 'I need emergency help', expectedConfidence: 85 },
  { query: 'book appointment', expectedConfidence: 75 },
  { query: 'find doctor', expectedConfidence: 70 },
  { query: 'general question', expectedConfidence: 50 }
];

for (const test of testCases) {
  const result = await router.route(test.query, {});
  console.log(\`Confidence: \${result.confidence} (expected: \${test.expectedConfidence})\`);
}
"
```

---

## Summary Table

| Intent | Min | Preferred | Escalation | Handoff | Risk | Autonomy |
|--------|-----|-----------|------------|---------|------|----------|
| Emergency | 60% | 80% | 70% | 50% | 🔴 Critical | Supervised |
| Pregnancy | 55% | 75% | 45% | 35% | 🟠 High | Semi-Auto |
| Mental Health | 55% | 75% | 45% | 35% | 🟠 High | Semi-Auto |
| Pediatric | 55% | 75% | 45% | 35% | 🟠 High | Semi-Auto |
| Appointment | 50% | 70% | 40% | 30% | 🟡 Low | Fully Auto |
| Doctor Search | 45% | 65% | 35% | 25% | 🟡 Low-Med | Fully Auto |
| Medication | 45% | 70% | 40% | 30% | 🟠 Med-High | Semi-Auto |
| Lab Test | 45% | 70% | 40% | 30% | 🟡 Medium | Semi-Auto |
| Medical Consult | 40% | 65% | 35% | 25% | 🟠 Med-High | Semi-Auto |
| Lifestyle | 35% | 60% | 30% | 20% | 🟢 Low | Fully Auto |
| General Info | 30% | 55% | 25% | 15% | 🟢 Very Low | Fully Auto |

---

**Last Updated:** December 24, 2025  
**Version:** 1.0.0  
**Status:** ✅ Production-Ready Recommendations
