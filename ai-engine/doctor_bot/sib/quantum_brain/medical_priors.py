"""
Medical Priors — Quantum Probability Amplitude Matrix
=====================================================

Encodes clinical knowledge as symptom→diagnosis likelihood ratios (LR).

LR = P(finding | diagnosis) / P(finding | ~diagnosis)
  LR >> 1  : finding strongly supports diagnosis
  LR = 1   : finding is neutral (doesn't change probability)
  LR < 1   : finding argues against diagnosis
  LR = 0   : finding rules out diagnosis completely

Source: UpToDate, JAMA Rational Clinical Examination, emergency medicine
textbooks. Only non-neutral values (LR ≠ 1) are stored — all others default 1.0.

Used exclusively by QuantumBayesianReasoner — not for direct clinical use.
"""

# ─── Canonical diagnosis list ─────────────────────────────────────────────────

DIAGNOSES = [
    # Cardiac (7)
    "myocardial_infarction",
    "unstable_angina",
    "stable_angina",
    "acute_heart_failure",
    "pericarditis",
    "aortic_dissection",
    "arrhythmia",
    # Pulmonary (6)
    "pulmonary_embolism",
    "pneumonia",
    "pneumothorax",
    "copd_exacerbation",
    "asthma_exacerbation",
    "pleuritis",
    # GI (7)
    "appendicitis",
    "acute_pancreatitis",
    "acute_cholecystitis",
    "peptic_ulcer",
    "gerd",
    "bowel_obstruction",
    "mesenteric_ischemia",
    # Neuro (6)
    "ischemic_stroke",
    "tia",
    "migraine",
    "meningitis",
    "subarachnoid_hemorrhage",
    "seizure",
    # Infectious / Systemic (5)
    "sepsis",
    "covid19",
    "influenza",
    "urinary_tract_infection",
    "cellulitis",
    # Endocrine / Metabolic (4)
    "diabetic_ketoacidosis",
    "hypoglycemia",
    "thyroid_crisis",
    "adrenal_crisis",
    # Renal (3)
    "acute_kidney_injury",
    "renal_colic",
    "nephrotic_syndrome",
]

# ─── Symptom likelihood ratio table ──────────────────────────────────────────
# symptom/finding → {diagnosis: LR}
# Unspecified pairs default to LR = 1.0 (neutral)

SYMPTOM_LRS: dict = {
    # ── Chief complaints ──────────────────────────────────────────────────────
    "chest_pain": {
        "myocardial_infarction":   8.0,
        "unstable_angina":         6.0,
        "stable_angina":           5.0,
        "pericarditis":            4.0,
        "aortic_dissection":       5.0,
        "pulmonary_embolism":      3.0,
        "pneumothorax":            2.5,
        "pleuritis":               2.5,
        "gerd":                    2.0,
        "peptic_ulcer":            1.5,
        "acute_heart_failure":     0.7,
        "meningitis":              0.1,
        "ischemic_stroke":         0.1,
        "appendicitis":            0.2,
    },
    "dyspnea": {
        "pulmonary_embolism":      4.5,
        "acute_heart_failure":     5.0,
        "copd_exacerbation":       5.0,
        "asthma_exacerbation":     6.0,
        "pneumonia":               3.0,
        "pneumothorax":            4.0,
        "myocardial_infarction":   2.5,
        "sepsis":                  2.0,
        "diabetic_ketoacidosis":   2.0,
        "anemia":                  1.5,
        "meningitis":              0.3,
        "appendicitis":            0.3,
    },
    "fever": {
        "pneumonia":               5.0,
        "sepsis":                  6.0,
        "meningitis":              7.0,
        "influenza":               4.5,
        "covid19":                 3.5,
        "urinary_tract_infection": 3.0,
        "cellulitis":              3.5,
        "appendicitis":            2.5,
        "acute_cholecystitis":     2.5,
        "acute_pancreatitis":      1.5,
        "pericarditis":            3.0,
        "thyroid_crisis":          2.0,
        "endocarditis":            4.0,
        "myocardial_infarction":   0.5,
        "pulmonary_embolism":      0.7,
        "stable_angina":           0.1,
    },
    "headache": {
        "meningitis":              4.0,
        "subarachnoid_hemorrhage": 8.0,
        "migraine":                6.0,
        "ischemic_stroke":         2.5,
        "tia":                     2.0,
        "influenza":               2.5,
        "covid19":                 2.0,
        "hypertensive_emergency":  3.0,
        "diabetic_ketoacidosis":   1.5,
        "appendicitis":            0.2,
        "acute_cholecystitis":     0.2,
    },
    "abdominal_pain": {
        "appendicitis":            6.0,
        "acute_pancreatitis":      5.5,
        "acute_cholecystitis":     5.0,
        "peptic_ulcer":            4.0,
        "bowel_obstruction":       4.5,
        "mesenteric_ischemia":     4.0,
        "gerd":                    2.0,
        "urinary_tract_infection": 1.5,
        "renal_colic":             3.5,
        "diabetic_ketoacidosis":   2.0,
        "myocardial_infarction":   1.2,
        "pulmonary_embolism":      0.5,
    },
    "nausea_vomiting": {
        "acute_pancreatitis":      3.0,
        "appendicitis":            2.5,
        "bowel_obstruction":       3.5,
        "acute_cholecystitis":     2.5,
        "diabetic_ketoacidosis":   3.0,
        "meningitis":              2.5,
        "migraine":                3.0,
        "myocardial_infarction":   2.0,
        "adrenal_crisis":          3.0,
        "sepsis":                  1.5,
        "influenza":               2.5,
        "renal_colic":             2.0,
    },
    "altered_consciousness": {
        "hypoglycemia":            8.0,
        "ischemic_stroke":         4.0,
        "subarachnoid_hemorrhage": 3.5,
        "meningitis":              4.0,
        "seizure":                 5.0,
        "sepsis":                  3.0,
        "diabetic_ketoacidosis":   2.5,
        "adrenal_crisis":          3.0,
        "thyroid_crisis":          2.5,
        "acute_kidney_injury":     2.0,
        "migraine":                0.5,
    },
    "focal_neurological_deficit": {
        "ischemic_stroke":         10.0,
        "tia":                     8.0,
        "subarachnoid_hemorrhage": 3.0,
        "meningitis":              2.0,
        "hypoglycemia":            2.5,
        "migraine":                1.5,
        "seizure":                 1.5,
        "sepsis":                  0.5,
        "pulmonary_embolism":      0.3,
    },
    "syncope": {
        "arrhythmia":              5.0,
        "aortic_dissection":       2.5,
        "pulmonary_embolism":      2.5,
        "subarachnoid_hemorrhage": 2.0,
        "myocardial_infarction":   2.0,
        "hypoglycemia":            3.0,
        "adrenal_crisis":          2.0,
        "stable_angina":           0.5,
    },
    "palpitations": {
        "arrhythmia":              8.0,
        "thyroid_crisis":          3.0,
        "pulmonary_embolism":      2.0,
        "sepsis":                  2.0,
        "myocardial_infarction":   1.5,
        "diabetic_ketoacidosis":   1.5,
        "anxiety_disorder":        2.0,
        "meningitis":              0.3,
    },
    "flank_pain": {
        "renal_colic":             9.0,
        "urinary_tract_infection": 3.0,
        "acute_kidney_injury":     2.0,
        "aortic_dissection":       2.5,
        "appendicitis":            0.5,
        "acute_pancreatitis":      0.5,
    },
    "dysuria": {
        "urinary_tract_infection": 10.0,
        "renal_colic":             1.5,
        "acute_kidney_injury":     1.0,
        "appendicitis":            0.2,
        "pneumonia":               0.1,
    },
    "cough": {
        "pneumonia":               4.0,
        "copd_exacerbation":       4.0,
        "asthma_exacerbation":     3.5,
        "covid19":                 4.0,
        "influenza":               3.5,
        "pulmonary_embolism":      2.0,
        "acute_heart_failure":     2.0,
        "pleuritis":               1.5,
        "gerd":                    1.5,
        "meningitis":              0.2,
        "appendicitis":            0.1,
    },
    "leg_swelling": {
        "acute_heart_failure":     4.0,
        "pulmonary_embolism":      3.5,
        "cellulitis":              3.5,
        "nephrotic_syndrome":      3.0,
        "acute_kidney_injury":     2.0,
        "dvt":                     5.0,
        "myocardial_infarction":   0.7,
        "appendicitis":            0.1,
    },
    "diaphoresis": {
        "myocardial_infarction":   5.0,
        "aortic_dissection":       4.0,
        "sepsis":                  3.0,
        "hypoglycemia":            5.0,
        "thyroid_crisis":          3.0,
        "pulmonary_embolism":      2.0,
        "adrenal_crisis":          3.0,
    },
    "polyuria_polydipsia": {
        "diabetic_ketoacidosis":   8.0,
        "hypoglycemia":            0.3,
        "acute_kidney_injury":     2.0,
        "nephrotic_syndrome":      1.5,
        "urinary_tract_infection": 1.5,
    },
    "back_pain_tearing": {
        "aortic_dissection":       12.0,
        "renal_colic":             3.0,
        "myocardial_infarction":   1.5,
        "pulmonary_embolism":      0.5,
        "appendicitis":            0.3,
    },
    "rash": {
        "cellulitis":              4.0,
        "meningitis":              3.0,
        "sepsis":                  2.0,
        "influenza":               1.5,
        "covid19":                 1.5,
        "thyroid_crisis":          0.5,
        "myocardial_infarction":   0.2,
    },
    "wheezing": {
        "asthma_exacerbation":     8.0,
        "copd_exacerbation":       5.0,
        "acute_heart_failure":     2.5,
        "anaphylaxis":             4.0,
        "pulmonary_embolism":      1.5,
        "pneumonia":               0.7,
    },

    # ── Vital sign patterns ────────────────────────────────────────────────────
    "hypotension": {
        "sepsis":                  7.0,
        "myocardial_infarction":   3.0,
        "aortic_dissection":       4.0,
        "pulmonary_embolism":      3.5,
        "adrenal_crisis":          5.0,
        "anaphylaxis":             6.0,
        "acute_heart_failure":     2.5,
        "mesenteric_ischemia":     3.0,
        "subarachnoid_hemorrhage": 2.0,
        "hypoglycemia":            1.5,
        "stable_angina":           0.1,
        "gerd":                    0.1,
    },
    "tachycardia": {
        "pulmonary_embolism":      3.0,
        "sepsis":                  3.5,
        "thyroid_crisis":          5.0,
        "arrhythmia":              4.0,
        "diabetic_ketoacidosis":   3.0,
        "myocardial_infarction":   2.0,
        "influenza":               2.0,
        "anemia":                  2.5,
        "pulmonary_embolism":      3.5,
    },
    "hypoxia": {
        "pulmonary_embolism":      5.0,
        "pneumonia":               4.5,
        "pneumothorax":            5.0,
        "copd_exacerbation":       4.0,
        "asthma_exacerbation":     4.5,
        "acute_heart_failure":     4.0,
        "sepsis":                  3.0,
        "myocardial_infarction":   2.5,
        "stable_angina":           0.3,
        "appendicitis":            0.3,
    },

    # ── Lab findings ───────────────────────────────────────────────────────────
    "elevated_troponin": {
        "myocardial_infarction":  15.0,
        "unstable_angina":         4.0,
        "pulmonary_embolism":      2.5,
        "myocarditis":             5.0,
        "sepsis":                  2.0,
        "acute_kidney_injury":     1.5,
        "gerd":                    0.1,
        "appendicitis":            0.2,
        "migraine":                0.1,
    },
    "elevated_d_dimer": {
        "pulmonary_embolism":      5.0,
        "deep_vein_thrombosis":    5.0,
        "aortic_dissection":       4.0,
        "sepsis":                  2.5,
        "covid19":                 2.5,
        "myocardial_infarction":   1.5,
        "stable_angina":           0.5,
    },
    "elevated_creatinine": {
        "acute_kidney_injury":    12.0,
        "nephrotic_syndrome":      3.0,
        "sepsis":                  2.5,
        "diabetic_ketoacidosis":   2.0,
        "renal_colic":             1.5,
        "adrenal_crisis":          1.5,
        "stable_angina":           0.3,
        "migraine":                0.2,
    },
    "elevated_wbc": {
        "sepsis":                  5.0,
        "appendicitis":            5.0,
        "pneumonia":               4.0,
        "acute_cholecystitis":     3.5,
        "acute_pancreatitis":      2.5,
        "meningitis":              4.0,
        "urinary_tract_infection": 3.0,
        "diabetic_ketoacidosis":   2.5,
        "myocardial_infarction":   1.5,
        "migraine":                0.3,
    },
    "elevated_glucose": {
        "diabetic_ketoacidosis":  12.0,
        "hypoglycemia":            0.05,
        "sepsis":                  2.5,
        "acute_pancreatitis":      2.0,
        "thyroid_crisis":          1.5,
        "myocardial_infarction":   1.5,
    },
    "low_glucose": {
        "hypoglycemia":           15.0,
        "adrenal_crisis":          3.0,
        "sepsis":                  2.0,
        "diabetic_ketoacidosis":   0.05,
    },
    "elevated_lipase": {
        "acute_pancreatitis":     12.0,
        "acute_cholecystitis":     2.0,
        "bowel_obstruction":       2.0,
        "peptic_ulcer":            1.5,
        "mesenteric_ischemia":     1.5,
        "appendicitis":            0.5,
    },
    "metabolic_acidosis": {
        "diabetic_ketoacidosis":   6.0,
        "sepsis":                  4.0,
        "acute_kidney_injury":     3.5,
        "mesenteric_ischemia":     4.0,
        "methanol_ingestion":      5.0,
        "adrenal_crisis":          3.0,
        "myocardial_infarction":   2.0,
        "gerd":                    0.1,
    },

    # ── ECG / Imaging findings ─────────────────────────────────────────────────
    "st_elevation": {
        "myocardial_infarction":  18.0,
        "pericarditis":            3.0,
        "unstable_angina":         0.3,
        "pulmonary_embolism":      0.5,
        "migraine":                0.0,
    },
    "st_depression": {
        "myocardial_infarction":   4.0,
        "unstable_angina":         5.0,
        "stable_angina":           4.0,
        "arrhythmia":              1.5,
        "pulmonary_embolism":      1.5,
    },
    "consolidation_on_xray": {
        "pneumonia":              10.0,
        "pulmonary_embolism":      2.0,
        "tuberculosis":            5.0,
        "covid19":                 4.0,
        "copd_exacerbation":       0.5,
        "asthma_exacerbation":     0.2,
    },
    "pleural_effusion": {
        "acute_heart_failure":     5.0,
        "pneumonia":               2.5,
        "pulmonary_embolism":      2.0,
        "pleuritis":               3.0,
        "nephrotic_syndrome":      3.0,
        "malignancy":              4.0,
        "pneumothorax":            0.1,
    },
    "dilated_renal_pelvis": {
        "renal_colic":             8.0,
        "urinary_tract_infection": 1.5,
        "acute_kidney_injury":     2.0,
        "appendicitis":            0.2,
    },

    # ── Risk factors (weaker, background-shifting) ─────────────────────────────
    "diabetes": {
        "diabetic_ketoacidosis":   5.0,
        "hypoglycemia":            3.0,
        "myocardial_infarction":   2.0,
        "ischemic_stroke":         1.8,
        "acute_kidney_injury":     1.8,
        "urinary_tract_infection": 1.5,
        "sepsis":                  1.5,
    },
    "smoking_history": {
        "myocardial_infarction":   2.5,
        "copd_exacerbation":       3.0,
        "pulmonary_embolism":      1.5,
        "ischemic_stroke":         2.0,
        "aortic_dissection":       1.5,
    },
    "immobilization": {
        "pulmonary_embolism":      4.0,
        "deep_vein_thrombosis":    4.0,
        "pneumonia":               2.0,
        "acute_kidney_injury":     1.5,
        "stable_angina":           0.5,
    },
    "known_hypertension": {
        "aortic_dissection":       3.0,
        "ischemic_stroke":         2.5,
        "myocardial_infarction":   2.0,
        "acute_kidney_injury":     1.5,
        "subarachnoid_hemorrhage": 2.0,
        "renal_colic":             0.7,
    },
    "elderly_age_over_65": {
        "myocardial_infarction":   2.0,
        "ischemic_stroke":         2.5,
        "sepsis":                  2.0,
        "acute_heart_failure":     2.5,
        "acute_kidney_injury":     2.0,
        "bowel_obstruction":       1.5,
        "meningitis":              1.5,
        "asthma_exacerbation":     0.7,
    },
    "pregnancy_or_postpartum": {
        "pulmonary_embolism":      5.0,
        "deep_vein_thrombosis":    5.0,
        "thyroid_crisis":          2.0,
        "urinary_tract_infection": 2.5,
        "aortic_dissection":       2.0,
    },
}

# ─── Diagnosis interference matrix ────────────────────────────────────────────
# Pairs with significant quantum interference (non-zero)
# Positive = constructive (often comorbid, amplify each other's probability)
# Negative = destructive (mutually exclusive presentation, cancel each other)
# Scale: -1.0 to +1.0

INTERFERENCE_PAIRS: dict = {
    # Mutually exclusive acute presentations
    ("myocardial_infarction",    "stable_angina"):         -0.6,
    ("myocardial_infarction",    "gerd"):                  -0.7,
    ("ischemic_stroke",          "migraine"):              -0.5,
    ("subarachnoid_hemorrhage",  "migraine"):              -0.4,
    ("pneumothorax",             "pneumonia"):             -0.3,
    ("diabetic_ketoacidosis",    "hypoglycemia"):          -0.9,
    ("pulmonary_embolism",       "asthma_exacerbation"):   -0.3,
    ("aortic_dissection",        "myocardial_infarction"): -0.2,

    # Often comorbid / share pathophysiology (constructive)
    ("sepsis",                   "acute_kidney_injury"):   +0.6,
    ("sepsis",                   "acute_heart_failure"):   +0.4,
    ("myocardial_infarction",    "arrhythmia"):            +0.5,
    ("copd_exacerbation",        "pneumonia"):             +0.4,
    ("acute_cholecystitis",      "acute_pancreatitis"):    +0.3,
    ("urinary_tract_infection",  "acute_kidney_injury"):   +0.3,
    ("diabetic_ketoacidosis",    "acute_kidney_injury"):   +0.4,
    ("acute_heart_failure",      "acute_kidney_injury"):   +0.5,

    # Diagnostic lookalikes — mild positive interference (same presentation, different cause)
    ("myocardial_infarction",    "pericarditis"):          +0.2,
    ("pulmonary_embolism",       "pneumonia"):             +0.2,
    ("meningitis",               "subarachnoid_hemorrhage"): +0.2,
    ("appendicitis",             "acute_cholecystitis"):   +0.1,
    ("ischemic_stroke",          "tia"):                   +0.3,
}

# ─── Chief complaint → candidate diagnosis sets ────────────────────────────────
# Seed the initial superposition based on presenting complaint.
# Only candidates with non-negligible prior probability are included.

COMPLAINT_PRIORS: dict = {
    "chest_pain": [
        "myocardial_infarction", "unstable_angina", "stable_angina",
        "pericarditis", "aortic_dissection", "pulmonary_embolism",
        "pneumothorax", "pleuritis", "gerd", "peptic_ulcer",
        "acute_pancreatitis", "acute_heart_failure",
    ],
    "shortness_of_breath": [
        "pulmonary_embolism", "acute_heart_failure", "pneumonia",
        "pneumothorax", "copd_exacerbation", "asthma_exacerbation",
        "myocardial_infarction", "sepsis", "diabetic_ketoacidosis",
        "anemia", "arrhythmia",
    ],
    "abdominal_pain": [
        "appendicitis", "acute_pancreatitis", "acute_cholecystitis",
        "peptic_ulcer", "gerd", "bowel_obstruction", "mesenteric_ischemia",
        "renal_colic", "urinary_tract_infection", "diabetic_ketoacidosis",
    ],
    "headache": [
        "migraine", "subarachnoid_hemorrhage", "meningitis",
        "ischemic_stroke", "tia", "hypertensive_emergency",
        "influenza", "covid19",
    ],
    "fever": [
        "sepsis", "pneumonia", "meningitis", "urinary_tract_infection",
        "cellulitis", "influenza", "covid19", "appendicitis",
        "acute_cholecystitis", "pericarditis",
    ],
    "neurological": [
        "ischemic_stroke", "tia", "subarachnoid_hemorrhage",
        "meningitis", "seizure", "migraine", "hypoglycemia",
    ],
    "altered_consciousness": [
        "hypoglycemia", "sepsis", "ischemic_stroke", "seizure",
        "diabetic_ketoacidosis", "subarachnoid_hemorrhage",
        "adrenal_crisis", "thyroid_crisis", "acute_kidney_injury",
    ],
    "flank_pain": [
        "renal_colic", "urinary_tract_infection", "acute_kidney_injury",
        "aortic_dissection",
    ],
    "general": DIAGNOSES,  # fallback: all diagnoses in superposition
}
