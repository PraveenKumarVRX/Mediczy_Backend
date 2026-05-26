# Daily Health Score — Scientific Methodology & References

**Document version:** 1.0  
**Implemented in:** `server/services/daily-health-score.service.js`  
**Last updated:** May 5, 2026

---

## Overview

The SmartHealth Daily Health Score is a single composite value (0–100, higher = healthier) computed each day per user. It aggregates seven evidence-based health domains, each drawn from nationally and internationally recognised clinical guidelines. Domain targets are stratified by **gender** and **age band** to avoid applying adult population averages to children, teenagers, or elderly users.

---

## Age Bands

| Band | Age Range | Rationale |
|---|---|---|
| `child` | < 13 | WHO/ICMR distinct activity & sleep norms |
| `teen` | 13–17 | Adolescent growth physiology |
| `young_adult` | 18–35 | Peak physiological capacity reference cohort |
| `middle_age` | 36–55 | Gradual metabolic decline; CVD risk window |
| `senior` | 56–70 | Reduced aerobic capacity; falls risk |
| `elderly` | ≥ 71 | Sarcopenia; conservative thresholds |

---

## Composite Weights

The relative importance of each domain in the final score:

| Domain | Weight | Justification |
|---|---|---|
| Physical Activity | **22 %** | Strongest single predictor of all-cause mortality (Lee et al., 2012; AHA LE8) |
| Nutrition | **20 %** | Second-largest modifiable risk factor globally (GBD Diet Collaborators, 2019) |
| Sleep | **20 %** | Sleep deprivation independently elevates CVD, diabetes, and mental illness risk |
| Vitals | **15 %** | BP + HR + SpO2 + glucose — direct clinical biomarkers |
| Medication Adherence | **10 %** | Non-adherence contributes to 125,000 preventable deaths/year (NEHI, 2009) |
| Hydration | **8 %** | Dehydration impairs cognition, renal function, and thermoregulation |
| Mental / Stress | **5 %** | Chronic stress drives cortisol elevation and downstream metabolic effects |

---

## Domain 1 — Physical Activity (22 %)

### Sub-components and internal weights

| Sub-component | Internal weight | Source |
|---|---|---|
| Steps | 60 % | Tudor-Locke & Bassett (2004); WHO GAPPA 2018 |
| Exercise minutes | 30 % | AHA Life's Essential 8; WHO Physical Activity Guidelines 2020 |
| Calorie burn | 10 % | Auxiliary signal; reference threshold 300 kcal/day |

### Step targets by age band

| Band | Steps/day | Reference |
|---|---|---|
| child | 12,000 | Tudor-Locke et al. (2011) — children normative data |
| teen | 11,000 | Tudor-Locke et al. (2011) |
| young_adult | 10,000 | Tudor-Locke & Bassett (2004) — widely adopted clinical standard |
| middle_age | 8,000 | JAMA (2021) — 8,000–10,000 steps associated with lower all-cause mortality |
| senior | 7,000 | Saint-Maurice et al. (2020) — diminishing returns above 7,500 for 60+ |
| elderly | 5,000 | Conservatively achievable; prevents functional decline |

### Exercise-minute targets

All aerobic targets align with **WHO Global Action Plan on Physical Activity 2018–2030** and **AHA Life's Essential 8 (2022)**:

- Adults (18–64): ≥ 150 min/week moderate OR ≥ 75 min/week vigorous → 30 min/day target used
- Children / teens: 60 min/day (WHO 2020 Physical Activity Guidelines for children)
- Elderly: 20 min/day (conservative, accounting for reduced aerobic reserve)

### Scoring function

```
activityScore = 0.6 × min(steps/target, 1.2) × 100
              + 0.3 × min(exerciseMins/target, 1.2) × 100
              + 0.1 × min(caloriesBurned/300, 1.0) × 100
```

The 1.2 cap (120%) rewards exceeding targets without penalising highly active users by a cliff ceiling.

---

## Domain 2 — Nutrition (20 %)

### Caloric target — Mifflin-St Jeor Equation

The most widely validated BMR prediction equation for clinical use (Frankenfield et al., 2005; AND/ASPEN systematic review).

**Male:**  
$$BMR = 10W + 6.25H - 5A + 5$$

**Female:**  
$$BMR = 10W + 6.25H - 5A - 161$$

Where W = weight (kg), H = height (cm), A = age (years).

**Activity multipliers (Harris-Benedict activity factors):**

| Activity level | Multiplier |
|---|---|
| sedentary | 1.20 |
| light | 1.375 |
| moderate | 1.55 |
| active | 1.725 |

### Caloric balance scoring

| Intake ratio (consumed ÷ target) | Score |
|---|---|
| 90–110 % (±10% of target) | 100 |
| 75–90 % or 110–125 % | 75 |
| 60–75 % or 125–140 % | 50 |
| < 60 % or > 140 % | 25 |

This tiered approach reflects evidence that both under-eating and over-eating carry health risk (GBD 2019 Diet Collaborators).

### Diet quality modifier

| Quality | Bonus |
|---|---|
| excellent | +15 |
| good | +8 |
| fair | 0 |
| poor | −15 |

References: **ICMR-NIN Dietary Guidelines for Indians (2024)**; Healthy Eating Index (USDA, 2020).

### Fallback caloric targets (when height/weight unavailable)

Derived from Indian Council of Medical Research (ICMR) Nutrient Requirements and Recommended Dietary Allowances for Indians (2020), gender × age band stratified.

---

## Domain 3 — Sleep (20 %)

### Recommended sleep hours by age band

| Band | Min | Optimal min | Optimal max | Max | Source |
|---|---|---|---|---|---|
| child (< 13) | 9 | 9 | 12 | 14 | AAP / NSF 2015 |
| teen (13–17) | 8 | 8 | 10 | 11 | NSF 2015; AAP 2016 |
| young_adult (18–35) | 7 | 7 | 9 | 11 | NSF / AASM 2015 |
| middle_age (36–55) | 7 | 7 | 9 | 10 | NSF / AASM 2015 |
| senior (56–70) | 7 | 7 | 8 | 9 | NSF / AASM 2015 |
| elderly (≥ 71) | 7 | 7 | 8 | 9 | NSF / AASM 2015 |

**References:**  
- National Sleep Foundation (2015) consensus recommendations  
- American Academy of Sleep Medicine (AASM) & Sleep Research Society joint consensus (Consensus Statement, *SLEEP*, 2015)  
- Pediatrics (AAP, 2016) for child/teen bands

### Scoring function

| Condition | Base score |
|---|---|
| Within optimal range | 100 |
| Below optimal, above minimum | 70 |
| Above optimal, within max | 80 |
| Mildly short (< min, ≥ min − 1 h) | 40 |
| Excessive (> max) | 50 |
| Severely short (< min − 1 h) | 20 |

Sleep quality modifier: excellent +10, good +5, fair 0, poor −15.

---

## Domain 4 — Vitals (15 %)

### Sub-component internal weights

| Vital | Weight | Rationale |
|---|---|---|
| Blood pressure | 35 % | Hypertension is the #1 cause of CVD worldwide (WHO, 2023) |
| Heart rate | 25 % | Elevated resting HR is an independent mortality predictor |
| SpO2 | 20 % | < 95% defines clinical hypoxaemia (BTS/NICE) |
| Blood glucose | 20 % | Fasting glucose is primary diabetes screening metric |

### Blood pressure thresholds

Based on **AHA/ACC 2017 Hypertension Guidelines** and **ESC/ESH 2018**:

| Category | Systolic (mmHg) | Diastolic (mmHg) | Score |
|---|---|---|---|
| Normal | ≤ 120 | ≤ 80 | 100 |
| Elevated | ≤ 130 | ≤ 85 | 75 |
| Stage 1 hypertension | ≤ 140 | ≤ 90 | 50 |
| Stage 2 hypertension | > 140 | > 90 | 20 |

### Resting heart rate thresholds (by age band)

| Band | Optimal range (bpm) | Reference |
|---|---|---|
| child | 60–100 | AHA pediatric norms |
| teen | 55–90 | AHA |
| young_adult | 50–85 | AHA; athlete lower limit 40 bpm |
| middle_age | 50–90 | AHA |
| senior | 55–90 | AHA |
| elderly | 60–95 | AHA; higher lower limit due to SA node changes |

Resting bradycardia < optimal min scored at 75 (possibly athletic); tachycardia > optimal max + 15 scored at 30.

### SpO2 thresholds

| SpO2 | Score | Reference |
|---|---|---|
| ≥ 98 % | 100 | Perfect arterial saturation |
| 95–97 % | 80 | Normal (WHO / pulse oximetry guidelines) |
| 90–94 % | 40 | Mild hypoxaemia — clinical review warranted |
| < 90 % | 10 | Significant hypoxaemia (NICE NG191) |

### Blood glucose (fasting, mg/dL)

Based on **ADA Standards of Medical Care in Diabetes (2024)** and **ICMR Diabetes Guidelines**:

| Range (mg/dL) | Category | Score |
|---|---|---|
| 70–100 | Normal fasting | 100 |
| 100–125 | Pre-diabetic | 60 |
| < 70 | Hypoglycaemia | 50 |
| ≥ 126 | Diabetic range | 20 |

---

## Domain 5 — Medication Adherence (10 %)

**Input:** `medication_adherence_pct` (0–100) or `doses_taken / doses_prescribed` ratio.  
**Score:** Equal to the adherence percentage.  
**If no medications prescribed:** Score = 100 (full marks — no adherence burden).

**Evidence basis:**  
- WHO (2003) *Adherence to Long-term Therapies* — non-adherence linked to 10× higher hospitalisation risk in chronic disease  
- Sokol et al. (2005) — medication adherence inversely correlated with hospitalisation across diabetes, hypertension, hypercholesterolaemia, CHF  
- A score of 80+ (≥ 80 % adherence) is used as the clinical threshold for "adherent" in most trials (Haynes, 2001)

---

## Domain 6 — Hydration (8 %)

### Daily water intake targets (glasses of 250 mL)

Based on **National Academies of Sciences, Engineering, and Medicine (NASEM) 2004** Dietary Reference Intakes for water, adjusted for Indian climate (ICMR-NIN 2024):

| Age band | Male (glasses) | Female (glasses) |
|---|---|---|
| child | 7 | 6 |
| teen | 10 | 9 |
| young_adult | 15 | 11 |
| middle_age | 15 | 11 |
| senior | 12 | 10 |
| elderly | 11 | 9 |

> Note: NASEM recommends ~3.7 L/day total water for adult males and ~2.7 L/day for adult females (all sources including food). The glass targets above reflect drinking water intake only (approx. 60–70% of total requirement), consistent with ICMR guidance for the Indian context.

**Scoring:** `min(glasses_logged / target, 1.0) × 100`

---

## Domain 7 — Mental Health / Stress (5 %)

### Inputs

| Input | Scale | Scoring direction |
|---|---|---|
| `stress_score` | 1–10 | Inverted (1 = low stress = 100 pts; 10 = max stress = 0 pts) |
| `mood_score` | 1–10 | Direct (10 = great mood = 100 pts; 1 = very low mood = 0 pts) |

### Formula

```
stress_component = ((10 − stress_score) / 9) × 100
mood_component   = ((mood_score − 1)    / 9) × 100
mentalScore      = mean(available components)
```

**Evidence basis:**  
- **PSS (Perceived Stress Scale)**, Cohen et al. (1983) — 10-item gold standard for self-reported stress  
- **WHO-5 Wellbeing Index** — validated mood/wellbeing metric; scores < 50/100 indicate poor wellbeing  
- The simplified 1–10 scale maps conceptually onto PSS scoring quartiles and WHO-5 response bands

**Default when no data logged:** 70/100 — neutral, not penalised, reflecting that absence of self-report is not absence of wellbeing.

---

## Why No Data Defaults to Neutral (50–70)

Several domains return a neutral default (50 or 70) when no data is logged for that day. This is intentional:

1. **Avoid penalising passive users** — Users who haven't yet integrated the app with wearables or logged data should not receive a misleadingly low score.
2. **Vitals default (70):** Even without measurement, most healthy users have unremarkable vitals. Defaulting to 0 would be clinically misleading.
3. **Medication default (100):** If no prescription is on file, the user has no adherence burden — full marks is appropriate.

This approach mirrors the **partial data strategy** used by Apple Health's Vitals summary and Fitbit's Wellness Report.

---

## Composite Score Formula

$$\text{Score} = \sum_{i} w_i \cdot d_i$$

Where $w_i$ is the domain weight and $d_i$ is the domain score (0–100).

| Domain $i$ | $w_i$ |
|---|---|
| activity | 0.22 |
| nutrition | 0.20 |
| sleep | 0.20 |
| vitals | 0.15 |
| medication | 0.10 |
| hydration | 0.08 |
| mental | 0.05 |
| **Total** | **1.00** |

Final score is clamped to [0, 100] and rounded to the nearest integer.

---

## Score Interpretation Guide

| Score | Colour | Label | Clinical context |
|---|---|---|---|
| 85–100 | Green | Excellent | Meets or exceeds targets across all major domains |
| 70–84 | Light green | Good | Minor gaps in one or two areas |
| 55–69 | Yellow | Fair | Meaningful gaps in lifestyle factors; actionable |
| 40–54 | Orange | Needs improvement | Multiple domains below target; health risk accumulating |
| 0–39 | Red | Poor | Significant lifestyle deficits; clinical review warranted |

---

## Limitations & Known Assumptions

1. **Self-reported inputs** (nutrition, stress, mood, medication) are unvalidated and subject to reporting bias.
2. **Vitals** are consumer-grade wearable or manual readings — not calibrated medical devices. SpO2 accuracy on darker skin tones is lower (Sjoding et al., 2020 — NEJM).
3. **Steps** from phone pedometers have ±15–20% error depending on carrying position (Tudor-Locke et al., 2011).
4. **Caloric targets** use Mifflin-St Jeor which has RMSE of ~150 kcal/day in validation studies (Frankenfield et al., 2005).
5. **Mental health** is captured via a 2-item proxy — not a validated clinical instrument. Not suitable for clinical screening.
6. **Medication adherence** does not account for PRN (as-needed) medications.
7. The scoring is **not a diagnostic tool** and does not replace clinical assessment.

---

## Key References

| # | Citation |
|---|---|
| 1 | WHO. *Global Action Plan on Physical Activity 2018–2030.* Geneva: World Health Organization, 2018. |
| 2 | Lloyd-Jones DM et al. *Life's Essential 8.* Circulation. 2022;146(5):e18–e43. (AHA Life's Essential 8) |
| 3 | WHO. *Guidelines on Physical Activity and Sedentary Behaviour.* Geneva, 2020. |
| 4 | Tudor-Locke C, Bassett DR. *How many steps/day are enough?* Sports Med. 2004;34(1):1–8. |
| 5 | Tudor-Locke C et al. *How many steps/day is enough? For children and adolescents.* Int J Behav Nutr Phys Act. 2011;8:78. |
| 6 | Saint-Maurice PF et al. *Association of Daily Step Count and Step Intensity With Mortality Among US Adults.* JAMA. 2020;323(12):1151–1160. |
| 7 | GBD 2019 Diet Collaborators. *Health effects of dietary risks in 195 countries, 1990–2019.* Lancet. 2019;393(10184):1958–1972. |
| 8 | Mifflin MD et al. *A new predictive equation for resting energy expenditure in healthy individuals.* Am J Clin Nutr. 1990;51(2):241–247. |
| 9 | Frankenfield D et al. *Comparison of predictive equations for resting metabolic rate in healthy nonobese and obese adults.* J Am Diet Assoc. 2005;105(5):775–789. |
| 10 | ICMR-NIN. *Dietary Guidelines for Indians.* 2024. Indian Council of Medical Research / National Institute of Nutrition, Hyderabad. |
| 11 | Hirshkowitz M et al. *National Sleep Foundation's sleep time duration recommendations.* Sleep Health. 2015;1(1):40–43. |
| 12 | Watson NF et al. *Recommended Amount of Sleep for a Healthy Adult: A Joint Consensus Statement of the AASM and Sleep Research Society.* SLEEP. 2015;38(6):843–844. |
| 13 | AAP. *American Academy of Pediatrics recommends children and teenagers not use media one hour before bedtime.* Pediatrics. 2016. |
| 14 | Whelton PK et al. *2017 ACC/AHA High Blood Pressure Guideline.* J Am Coll Cardiol. 2018;71(19):e127–e248. |
| 15 | Williams B et al. *2018 ESC/ESH Guidelines for the management of arterial hypertension.* Eur Heart J. 2018;39(33):3021–3104. |
| 16 | American Diabetes Association. *Standards of Medical Care in Diabetes — 2024.* Diabetes Care. 2024;47(Suppl 1). |
| 17 | National Academies of Sciences. *Dietary Reference Intakes for Water, Potassium, Sodium, Chloride, and Sulfate.* Washington DC: NASEM, 2004. |
| 18 | WHO. *Adherence to Long-term Therapies: Evidence for Action.* Geneva: World Health Organization, 2003. |
| 19 | Sokol MC et al. *Impact of medication adherence on hospitalization risk and healthcare cost.* Med Care. 2005;43(6):521–530. |
| 20 | Cohen S, Kamarck T, Mermelstein R. *A global measure of perceived stress.* J Health Soc Behav. 1983;24(4):385–396. |
| 21 | WHO. *WHO-5 Wellbeing Index.* Regional Office for Europe, 1998. |
| 22 | Sjoding MW et al. *Racial Bias in Pulse Oximetry Measurement.* N Engl J Med. 2020;383:2477–2478. |
| 23 | Lee I-M et al. *Effect of Physical Inactivity on Major Non-Communicable Diseases Worldwide.* Lancet. 2012;380(9838):219–229. |
| 24 | NEHI. *Thinking Outside the Pillbox: A System-wide Approach to Improving Patient Medication Adherence.* NEHI Research Brief, 2009. |
