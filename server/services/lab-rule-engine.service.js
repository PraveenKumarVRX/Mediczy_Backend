/**
 * Lab-triggered CDSS Rule Engine
 *
 * Fires structured IF-THEN clinical alerts based on lab values,
 * current medications, and patient diagnosis flags.
 *
 * Guidelines referenced per rule:
 *   - Hyperkalaemia        → BTS / NICE NG35 / AHA HF Guideline
 *   - Hyponatraemia        → ESC/ERS/ERA-EDTA Hyponatraemia Guideline 2014
 *   - Anticoagulation INR  → NICE NG196 Atrial Fibrillation Guideline 2021
 *   - AKI (creatinine rise) → KDIGO 2012 AKI Guideline
 *   - Sepsis lactate        → Surviving Sepsis Campaign 2021
 *   - Haemoglobin          → NICE NG24 Blood Transfusion Guideline
 *   - Glucose              → ADA Standards of Care 2024
 *   - Troponin             → ESC NSTE-ACS 2020
 *   - Hypocalcaemia        → AACE/ACE Calcium Guideline
 *   - INR supratherapeutic → BCSH / NICE NG196
 *   - Hepatotoxicity ALT   → DILI Network / EASL Guideline
 *   - Hypertriglyceridaemia → AHA/ACC Cholesterol Guideline 2019
 *   - Thyroid TSH          → ATA Guidelines
 *   - PT/APTT coag         → BCSH Guideline
 *   - Critical culture      → IDSA Sepsis Guideline
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';
import { publishEvent } from './hypergrid-event-bus.service.js';

// ── Rule definitions ─────────────────────────────────────────────────────────

const RULES = [
  // ── Cardiology / Electrolytes
  {
    id: 'hyperkalaemia_mild',
    name: 'Hyperkalaemia (mild)',
    severity: 'moderate',
    check: ({ labs }) => labs.potassium >= 5.5 && labs.potassium < 6.0,
    title: 'Hyperkalaemia — mild (K⁺ 5.5-5.9 mmol/L)',
    message: ({ labs, meds }) =>
      `Potassium ${labs.potassium} mmol/L.${meds?.aceInhibitor || meds?.arb ? ' Patient is on ACE inhibitor/ARB — consider dose review.' : ''} Repeat ECG, stop exacerbating drugs (NICE NG35).`,
    guideline: 'NICE NG35 / BTS Hyperkalaemia Guideline',
  },
  {
    id: 'hyperkalaemia_severe',
    name: 'Hyperkalaemia (severe)',
    severity: 'critical',
    check: ({ labs }) => labs.potassium >= 6.0,
    title: 'Severe Hyperkalaemia — K⁺ ≥6.0 mmol/L',
    message: ({ labs, meds }) =>
      `Potassium ${labs.potassium} mmol/L — immediate action required. ECG (peaked T waves, wide QRS).${meds?.aceInhibitor ? ' HOLD ACE inhibitor/ARB.' : ''} Calcium gluconate + insulin/dextrose ± salbutamol (NICE NG35).`,
    guideline: 'NICE NG35 / BTS Hyperkalaemia Guideline',
  },
  {
    id: 'hypokalaemia',
    name: 'Hypokalaemia',
    severity: 'moderate',
    check: ({ labs }) => labs.potassium != null && labs.potassium < 3.0,
    title: 'Hypokalaemia — K⁺ <3.0 mmol/L',
    message: ({ labs, meds }) =>
      `Potassium ${labs.potassium} mmol/L.${meds?.diuretic ? ' Patient on diuretics — increased loss likely.' : ''} IV/oral potassium replacement; ECG monitoring.`,
    guideline: 'AHA/ACC HF Guideline',
  },

  // ── Fluid/Sodium
  {
    id: 'hyponatraemia_moderate',
    name: 'Hyponatraemia (moderate)',
    severity: 'moderate',
    check: ({ labs }) => labs.sodium != null && labs.sodium < 130 && labs.sodium >= 125,
    title: 'Hyponatraemia — Na⁺ 125-129 mmol/L',
    message: ({ labs }) => `Sodium ${labs.sodium} mmol/L. Assess volume status; urine Na⁺ and osmolality. Restrict free water if dilutional (ESC/ERS/ERA-EDTA 2014).`,
    guideline: 'ESC/ERS/ERA-EDTA Hyponatraemia Guideline 2014',
  },
  {
    id: 'hyponatraemia_severe',
    name: 'Hyponatraemia (severe)',
    severity: 'critical',
    check: ({ labs }) => labs.sodium != null && labs.sodium < 125,
    title: 'Severe Hyponatraemia — Na⁺ <125 mmol/L',
    message: ({ labs }) => `Sodium ${labs.sodium} mmol/L — urgent management required. If symptoms (seizures, reduced GCS): 150 mL 3% NaCl bolus (max correction 10 mmol/L/24h to prevent osmotic demyelination) (ESC/ERS/ERA-EDTA 2014).`,
    guideline: 'ESC/ERS/ERA-EDTA Hyponatraemia Guideline 2014',
  },

  // ── Coagulation / Anticoagulation
  {
    id: 'inr_supratherapeutic',
    name: 'INR supratherapeutic (warfarin)',
    severity: 'high',
    check: ({ labs, meds }) => labs.inr >= 3.0 && meds?.warfarin,
    title: 'INR supratherapeutic — INR ≥3.0 on warfarin',
    message: ({ labs }) => `INR ${labs.inr}. If no bleeding: reduce or omit warfarin dose. If INR >5.0: consider oral vitamin K 1-5 mg. If major bleeding: 4-factor PCC + IV vitamin K 5 mg (NICE NG196/BCSH).`,
    guideline: 'NICE NG196 / BCSH Anticoagulation Guideline',
  },
  {
    id: 'inr_critical',
    name: 'INR critical (warfarin)',
    severity: 'critical',
    check: ({ labs, meds }) => labs.inr >= 5.0 && meds?.warfarin,
    title: 'Critical INR ≥5.0 — immediate reversal consideration',
    message: ({ labs }) => `INR ${labs.inr}. Hold warfarin. Assess for bleeding. If bleeding: 4-factor PCC (Octaplex/Beriplex) + IV vitamin K 5 mg (NICE NG196).`,
    guideline: 'NICE NG196 / BCSH',
  },
  {
    id: 'aptt_elevated_heparin',
    name: 'APTT supratherapeutic (heparin)',
    severity: 'high',
    check: ({ labs, meds }) => labs.aptt != null && labs.aptt > 120 && meds?.heparin,
    title: 'APTT supratherapeutic >120 s on heparin',
    message: ({ labs }) => `APTT ${labs.aptt}s. Stop heparin infusion for 1 hour, reduce rate by 25%, recheck APTT in 6h (BCSH Heparin Guideline).`,
    guideline: 'BCSH Heparin Guideline',
  },

  // ── Renal / AKI
  {
    id: 'aki_stage1',
    name: 'AKI Stage 1 (creatinine rise)',
    severity: 'moderate',
    check: ({ labs }) => {
      if (!labs.creatinine || !labs.baselineCreatinine) return false;
      const rise = labs.creatinine - labs.baselineCreatinine;
      const ratio = labs.creatinine / labs.baselineCreatinine;
      return rise >= 26.5 || (ratio >= 1.5 && ratio < 2.0);
    },
    title: 'AKI Stage 1 — creatinine rise ≥26.5 µmol/L or ×1.5',
    message: ({ labs }) => `Creatinine ${labs.creatinine} µmol/L (baseline ${labs.baselineCreatinine}). KDIGO AKI Stage 1. Stop nephrotoxins (NSAIDs, aminoglycosides, contrast). Optimise fluid status. Recheck creatinine in 24h.`,
    guideline: 'KDIGO 2012 AKI Guideline',
  },
  {
    id: 'aki_stage2',
    name: 'AKI Stage 2',
    severity: 'high',
    check: ({ labs }) => {
      if (!labs.creatinine || !labs.baselineCreatinine) return false;
      const ratio = labs.creatinine / labs.baselineCreatinine;
      return ratio >= 2.0 && ratio < 3.0;
    },
    title: 'AKI Stage 2 — creatinine ×2.0-2.9',
    message: ({ labs }) => `Creatinine ${labs.creatinine} µmol/L (baseline ${labs.baselineCreatinine}). KDIGO AKI Stage 2. Nephrology review. Strict fluid balance. Hold ACE/ARB/NSAIDs. Renal dose adjustment required.`,
    guideline: 'KDIGO 2012 AKI Guideline',
  },
  {
    id: 'aki_stage3',
    name: 'AKI Stage 3',
    severity: 'critical',
    check: ({ labs }) => {
      if (!labs.creatinine || !labs.baselineCreatinine) return false;
      const ratio = labs.creatinine / labs.baselineCreatinine;
      return ratio >= 3.0 || (labs.creatinine >= 354 && (labs.creatinine - labs.baselineCreatinine) >= 44);
    },
    title: 'AKI Stage 3 — creatinine ×3 or ≥354 µmol/L with acute rise ≥44',
    message: ({ labs }) => `Creatinine ${labs.creatinine} µmol/L (baseline ${labs.baselineCreatinine}). KDIGO AKI Stage 3 — critical. Immediate nephrology consultation. Assess for renal replacement therapy. Strict I&O monitoring.`,
    guideline: 'KDIGO 2012 AKI Guideline',
  },

  // ── Sepsis / Lactate
  {
    id: 'elevated_lactate',
    name: 'Elevated lactate — possible sepsis',
    severity: 'high',
    check: ({ labs }) => labs.lactate != null && labs.lactate >= 2.0 && labs.lactate < 4.0,
    title: 'Elevated Lactate 2-3.9 mmol/L — tissue hypoperfusion',
    message: () => 'Lactate ≥2 mmol/L with suspected infection: initiate Sepsis-1h bundle (blood cultures ×2, broad-spectrum antibiotics, 30 mL/kg IV crystalloid, vasopressors if MAP <65 mmHg) (SSC 2021).',
    guideline: 'Surviving Sepsis Campaign 2021',
  },
  {
    id: 'critical_lactate',
    name: 'Critical lactate — septic shock',
    severity: 'critical',
    check: ({ labs }) => labs.lactate != null && labs.lactate >= 4.0,
    title: 'Critical Lactate ≥4 mmol/L — Septic Shock criterion met',
    message: ({ labs }) => `Lactate ${labs.lactate} mmol/L. Septic Shock (Sepsis-3): vasopressor + lactate re-measurement at 2h. ICU involvement. 30 mL/kg IV fluid bolus if not given (SSC 2021).`,
    guideline: 'ESICM/SCCM Sepsis-3 / SSC 2021',
  },

  // ── Haematology
  {
    id: 'anaemia_transfusion_threshold',
    name: 'Anaemia — potential transfusion threshold',
    severity: 'moderate',
    check: ({ labs, diagnosis }) => labs.haemoglobin != null && labs.haemoglobin < 80 && !diagnosis?.activeBleed,
    title: 'Haemoglobin <80 g/L — consider transfusion threshold review',
    message: ({ labs }) => `Hb ${labs.haemoglobin} g/L. NICE NG24: transfuse at Hb <70 g/L (stable patients) or Hb <80 g/L (cardiac symptoms). Ensure group & screen is current.`,
    guideline: 'NICE NG24 Blood Transfusion Guideline',
  },
  {
    id: 'critical_anaemia',
    name: 'Critical anaemia',
    severity: 'critical',
    check: ({ labs }) => labs.haemoglobin != null && labs.haemoglobin < 60,
    title: 'Critical Anaemia — Hb <60 g/L',
    message: ({ labs }) => `Hb ${labs.haemoglobin} g/L. Urgent cross-match and transfusion. Identify and treat cause. Consider HDU monitoring (NICE NG24).`,
    guideline: 'NICE NG24 Blood Transfusion Guideline',
  },
  {
    id: 'thrombocytopenia_severe',
    name: 'Severe thrombocytopenia',
    severity: 'high',
    check: ({ labs }) => labs.platelets != null && labs.platelets < 50,
    title: 'Severe Thrombocytopenia — platelets <50 ×10⁹/L',
    message: ({ labs, meds }) =>
      `Platelets ${labs.platelets} ×10⁹/L.${meds?.heparin ? ' Consider HIT if on heparin (4T score).' : ''} Review anticoagulants. Haematology review if cause unknown.`,
    guideline: 'BCSH Thrombocytopenia Guideline',
  },

  // ── Glucose / Diabetes
  {
    id: 'hypoglycaemia',
    name: 'Hypoglycaemia',
    severity: 'critical',
    check: ({ labs }) => labs.glucose != null && labs.glucose < 4.0,
    title: 'Hypoglycaemia — BGL <4.0 mmol/L',
    message: ({ labs, meds }) =>
      `Glucose ${labs.glucose} mmol/L.${meds?.insulin ? ' Patient on insulin.' : ''}${meds?.sulphonylurea ? ' Patient on sulphonylurea.' : ''} If conscious: 15-20 g rapid-acting carbohydrate. If unconscious: IV 10% dextrose 200 mL or glucagon 1 mg IM (ADA 2024).`,
    guideline: 'ADA Standards of Care 2024',
  },
  {
    id: 'hyperglycaemia_critical',
    name: 'Critical hyperglycaemia',
    severity: 'high',
    check: ({ labs }) => labs.glucose != null && labs.glucose > 25.0,
    title: 'Critical Hyperglycaemia >25 mmol/L — possible DKA/HHS',
    message: ({ labs }) => `Glucose ${labs.glucose} mmol/L. Check ketones, ABG (pH/bicarbonate), urine ketones. If DKA: fixed-rate insulin infusion 0.1 units/kg/h + IV fluids (JBDS DKA Guideline). If HHS: cautious rehydration.`,
    guideline: 'JBDS DKA Guideline / ADA 2024',
  },

  // ── Troponin / Cardiac markers
  {
    id: 'raised_troponin',
    name: 'Raised high-sensitivity troponin',
    severity: 'high',
    check: ({ labs }) => labs.hsTroponinAboveUln === true || (labs.hsTroponin != null && labs.hsTroponinUln != null && labs.hsTroponin > labs.hsTroponinUln),
    title: 'High-Sensitivity Troponin above 99th percentile URL',
    message: () => 'Serial hs-Troponin at 0h/1h or 0h/2h (ESC 0h/1h algorithm). If delta rise diagnostic: initiate NSTE-ACS pathway. HEART score recommended. Discuss with cardiology (ESC NSTE-ACS 2020).',
    guideline: 'ESC NSTE-ACS 2020 Guidelines',
  },

  // ── Liver / Hepatotoxicity
  {
    id: 'alt_elevated_hepatotoxicity',
    name: 'ALT elevation — possible hepatotoxicity',
    severity: 'moderate',
    check: ({ labs }) => labs.alt != null && labs.altUln != null && labs.alt > 3 * labs.altUln,
    title: 'ALT >3×ULN — possible drug-induced liver injury',
    message: ({ labs, meds }) =>
      `ALT ${labs.alt} U/L (${(labs.alt / labs.altUln).toFixed(1)}×ULN).${meds?.statins ? ' Review statin use.' : ''}${meds?.paracetamol ? ' Check paracetamol cumulative dose.' : ''} Review all hepatotoxic drugs. Hepatology review if ALT >5×ULN (EASL DILI Guideline).`,
    guideline: 'EASL DILI Guideline / DILI Network',
  },

  // ── Lipids
  {
    id: 'hypertriglyceridaemia_pancreatitis_risk',
    name: 'Hypertriglyceridaemia — pancreatitis risk',
    severity: 'high',
    check: ({ labs }) => labs.triglycerides != null && labs.triglycerides > 11.3,
    title: 'Severe Hypertriglyceridaemia >11.3 mmol/L — pancreatitis risk',
    message: ({ labs }) => `Triglycerides ${labs.triglycerides} mmol/L. High risk of acute pancreatitis. Hold triglyceride-raising agents (thiazides, beta-blockers, retinoids). Fibrate ± insulin infusion for rapid lowering. Strict fat-free diet (AHA/ACC 2019).`,
    guideline: 'AHA/ACC 2019 Cholesterol Guideline',
  },

  // ── Thyroid
  {
    id: 'tsh_critically_low',
    name: 'TSH suppressed — possible thyrotoxicosis',
    severity: 'moderate',
    check: ({ labs }) => labs.tsh != null && labs.tsh < 0.1,
    title: 'TSH <0.1 mU/L — possible thyrotoxicosis / thyroid storm risk',
    message: ({ labs }) => `TSH ${labs.tsh} mU/L. Check free T4 and T3. If symptomatic (HR >130, fever, altered consciousness): thyroid storm — contact endocrinology urgently (ATA Thyrotoxicosis Guideline).`,
    guideline: 'ATA Thyrotoxicosis Guideline',
  },
  {
    id: 'tsh_elevated',
    name: 'TSH elevated — hypothyroidism',
    severity: 'low',
    check: ({ labs }) => labs.tsh != null && labs.tsh > 10,
    title: 'TSH >10 mU/L — significant hypothyroidism',
    message: ({ labs }) => `TSH ${labs.tsh} mU/L. Check free T4. If symptomatic or TSH >10: levothyroxine initiation/optimisation (ATA Hypothyroidism Guideline).`,
    guideline: 'ATA Hypothyroidism Guideline',
  },

  // ── Calcium
  {
    id: 'hypocalcaemia_symptomatic',
    name: 'Hypocalcaemia',
    severity: 'moderate',
    check: ({ labs }) => labs.correctedCalcium != null && labs.correctedCalcium < 1.9,
    title: 'Hypocalcaemia — corrected Ca²⁺ <1.9 mmol/L',
    message: ({ labs }) => `Corrected calcium ${labs.correctedCalcium} mmol/L. Tetany/seizure risk. IV calcium gluconate 10 mL 10% over 10 min if symptomatic; oral supplements if mild (AACE/ACE Guideline).`,
    guideline: 'AACE/ACE Calcium Guideline',
  },
  {
    id: 'hypercalcaemia_severe',
    name: 'Severe hypercalcaemia',
    severity: 'high',
    check: ({ labs }) => labs.correctedCalcium != null && labs.correctedCalcium > 3.0,
    title: 'Severe Hypercalcaemia — corrected Ca²⁺ >3.0 mmol/L',
    message: ({ labs }) => `Corrected calcium ${labs.correctedCalcium} mmol/L. IV 0.9% NaCl 200-300 mL/h. Consider bisphosphonate (zoledronic acid) if malignancy-related. Investigate cause (PTH, PTHrP, vitamin D) (AACE/ACE Guideline).`,
    guideline: 'AACE/ACE Calcium Guideline',
  },

  // ── Drug interaction — ACE + hyperkalaemia
  {
    id: 'ace_arb_hyperK_combination',
    name: 'ACE/ARB in hyperkalaemia',
    severity: 'high',
    check: ({ labs, meds }) => labs.potassium >= 5.5 && (meds?.aceInhibitor || meds?.arb),
    title: 'ACE inhibitor / ARB continuation with K⁺ ≥5.5 mmol/L',
    message: ({ labs }) => `K⁺ ${labs.potassium} mmol/L — hold ACE inhibitor / ARB until potassium normalised. Recheck K⁺ in 24-48h before restarting (NICE NG35 / AHA HF Guideline).`,
    guideline: 'NICE NG35 / AHA HF Guideline',
  },

  // ── Positive microbiology
  {
    id: 'positive_blood_culture',
    name: 'Positive blood culture',
    severity: 'critical',
    check: ({ labs }) => labs.bloodCulturePositive === true,
    title: 'Positive Blood Culture — bacteraemia / sepsis work-up',
    message: ({ labs }) => `Positive blood culture${labs.bloodCultureOrganism ? `: ${labs.bloodCultureOrganism}` : ''}. Review empiric antibiotics against sensitivities. Source identification and control. Repeat cultures. Infectious diseases/microbiology review (IDSA Sepsis Guideline).`,
    guideline: 'IDSA Sepsis Guideline / NICE NG51',
  },
];

// ── Table bootstrap ───────────────────────────────────────────────────────────

const ensureTables = async () => {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS lab_rule_alerts (
      id SERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL,
      patient_id INTEGER NOT NULL,
      admission_id INTEGER,
      rule_id VARCHAR(80) NOT NULL,
      rule_name VARCHAR(120) NOT NULL,
      severity VARCHAR(24) NOT NULL,
      title VARCHAR(240) NOT NULL,
      message TEXT NOT NULL,
      guideline VARCHAR(240),
      lab_values JSONB NOT NULL DEFAULT '{}'::jsonb,
      status VARCHAR(24) NOT NULL DEFAULT 'open',
      acknowledged_by INTEGER,
      acknowledged_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_lab_rule_alerts_patient ON lab_rule_alerts(patient_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_lab_rule_alerts_open ON lab_rule_alerts(organization_id, status) WHERE status = 'open';
  `);
};
ensureTables().catch(e => console.warn('[lab-rule-engine] table bootstrap:', e.message));

// ── Core evaluation ───────────────────────────────────────────────────────────

/**
 * Run all rules against a lab context. Returns fired alerts (does NOT deduplicate).
 * @param {object} context - { labs, meds, diagnosis }
 * @returns {Array} fired rules (raw, not yet persisted)
 */
export function evaluateRules(context) {
  const fired = [];
  for (const rule of RULES) {
    try {
      if (rule.check(context)) {
        fired.push({
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          title: rule.title,
          message: typeof rule.message === 'function' ? rule.message(context) : rule.message,
          guideline: rule.guideline,
        });
      }
    } catch (_) { /* rule errors are non-fatal */ }
  }
  return fired;
}

/**
 * Process a lab result submission: run rules, persist new alerts, publish to event bus.
 * @param {object} opts - { organizationId, patientId, admissionId, labs, meds, diagnosis, recordedBy }
 * @returns {Array} persisted alert rows
 */
export async function processLabResult(opts) {
  const { organizationId, patientId, admissionId, labs, meds, diagnosis, recordedBy } = opts;
  const fired = evaluateRules({ labs, meds, diagnosis });
  if (!fired.length) return [];

  const persisted = [];
  for (const alert of fired) {
    const [row] = await sequelize.query(
      `INSERT INTO lab_rule_alerts
         (organization_id, patient_id, admission_id, rule_id, rule_name, severity, title, message, guideline, lab_values)
       VALUES (:organizationId, :patientId, :admissionId, :ruleId, :ruleName, :severity, :title, :message, :guideline, :labValues)
       RETURNING *`,
      {
        replacements: {
          organizationId,
          patientId,
          admissionId: admissionId || null,
          ruleId: alert.ruleId,
          ruleName: alert.ruleName,
          severity: alert.severity,
          title: alert.title,
          message: alert.message,
          guideline: alert.guideline,
          labValues: JSON.stringify(labs),
        },
        type: QueryTypes.INSERT,
      }
    );
    persisted.push(row);

    // Publish to event bus for real-time notification
    await publishEvent('lab_rule_alert', {
      alertId: row.id,
      patientId,
      admissionId,
      severity: alert.severity,
      title: alert.title,
      ruleId: alert.ruleId,
    }).catch(() => {});
  }
  return persisted;
}

export async function getOpenAlerts(organizationId, patientId) {
  return sequelize.query(
    `SELECT * FROM lab_rule_alerts WHERE organization_id = :orgId AND patient_id = :patientId AND status = 'open' ORDER BY created_at DESC`,
    { replacements: { orgId: organizationId, patientId }, type: QueryTypes.SELECT }
  );
}

export async function acknowledgeLabAlert(alertId, userId) {
  const [row] = await sequelize.query(
    `UPDATE lab_rule_alerts SET status = 'acknowledged', acknowledged_by = :userId, acknowledged_at = NOW() WHERE id = :id RETURNING *`,
    { replacements: { id: alertId, userId }, type: QueryTypes.UPDATE }
  );
  return row;
}

export async function getRules() {
  return RULES.map(({ id, name, severity, guideline }) => ({ id, name, severity, guideline }));
}
