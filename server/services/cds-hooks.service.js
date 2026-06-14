/**
 * CDS Hooks Service
 * ==================
 * Implements HL7 CDS Hooks 2.0 point-of-care decision support for Mediczy.
 *
 * Four hooks are exposed:
 *   1. patient-view        — Health risk summary when a patient chart is opened
 *   2. medication-prescribe — Drug interaction + allergy warnings at prescribe time
 *   3. order-sign          — Duplicate order detection + allergy check before signing
 *   4. encounter-start     — ABHA / care-context summary at encounter start
 *
 * Each public function returns { cards: [] } so one hook failure never
 * breaks a different hook (errors are caught per handler and logged).
 *
 * Card shape (HL7 CDS Hooks spec):
 *   {
 *     summary  : string          // short (≤140 char) one-line title
 *     detail   : string          // markdown-safe detail text
 *     indicator: 'info' | 'warning' | 'critical'
 *     source   : { label, url }
 *     suggestions: []            // optional — array of suggested actions
 *   }
 */

import pool from '../db/pgPool.js';
import llmProvider from './ai-brain/llm-provider.js';

// ─── Shared helpers ──────────────────────────────────────────────────────────

const SOURCE = {
  label: 'Mediczy AI Clinical Decision Support',
  url:   'https://mediqzy.com/cds',
};

/** Safe pool.query wrapper — returns { rows: [] } on error */
async function safeQuery(sql, params = []) {
  try {
    return await pool.query(sql, params);
  } catch (err) {
    console.error('[CDS Hooks] DB query error:', err.message);
    return { rows: [] };
  }
}

/** Map a risk score (0–100) to a CDS indicator level */
function riskToIndicator(score) {
  if (score >= 70) return 'critical';
  if (score >= 40) return 'warning';
  return 'info';
}

/** Map drug interaction severity to CDS indicator */
function severityToIndicator(severity) {
  if (['contraindicated', 'major'].includes(severity)) return 'critical';
  if (severity === 'moderate') return 'warning';
  return 'info';
}

// ─── 1. Discovery ─────────────────────────────────────────────────────────────

/**
 * GET /cds-hooks/
 * Returns the HL7 CDS Hooks discovery document listing all registered hooks.
 */
function getDiscovery() {
  return {
    services: [
      {
        hook:        'patient-view',
        id:          'mediczy-patient-view',
        title:       'Mediczy Patient Health Risk Summary',
        description: 'Displays the patient\'s latest AI health risk score and clinical explanation when their chart is opened.',
        prefetch: {
          patient: 'Patient/{{context.patientId}}',
        },
      },
      {
        hook:        'medication-prescribe',
        id:          'mediczy-medication-prescribe',
        title:       'Mediczy Drug Interaction & Allergy Checker',
        description: 'Checks the medications being prescribed for drug-drug interactions, drug-allergy conflicts, and drug-condition contraindications using the Mediczy AI Brain.',
        prefetch: {
          patient:         'Patient/{{context.patientId}}',
          medications:     'MedicationRequest?patient={{context.patientId}}&status=active',
        },
      },
      {
        hook:        'order-sign',
        id:          'mediczy-order-sign',
        title:       'Mediczy Duplicate Order & Allergy Check',
        description: 'Detects duplicate prescriptions within the past 24 hours and verifies allergy safety before an order is signed.',
        prefetch: {
          patient: 'Patient/{{context.patientId}}',
        },
      },
      {
        hook:        'encounter-start',
        id:          'mediczy-encounter-start',
        title:       'Mediczy ABHA / Care-Context Summary',
        description: 'Loads the patient\'s ABHA ID and linked care context from the ABDM registry at the start of an encounter.',
        prefetch: {
          patient: 'Patient/{{context.patientId}}',
        },
      },
    ],
  };
}

// ─── 2. patient-view ─────────────────────────────────────────────────────────

/**
 * POST /cds-hooks/patient-view
 * Body: { hook, hookInstance, context: { patientId } }
 *
 * Returns a card with the patient's latest AI health risk score plus an
 * LLM-generated plain-language explanation of the top contributing factors.
 */
async function handlePatientView(context) {
  const cards = [];
  try {
    const patientId = context?.patientId;
    if (!patientId) return { cards };

    const { rows } = await safeQuery(
      `SELECT risk_score, risk_level, risk_factors, shap_values, feature_attributions,
              confidence_score, computed_at
       FROM   ai_health_risk_scores
       WHERE  patient_id = $1
       ORDER  BY computed_at DESC
       LIMIT  1`,
      [patientId],
    );

    if (rows.length === 0) {
      cards.push({
        summary:   'No health risk score available yet',
        detail:    'The AI health risk scoring pipeline has not processed this patient yet. A score will appear after the next scheduled run (every 6 hours).',
        indicator: 'info',
        source:    SOURCE,
        suggestions: [],
      });
      return { cards };
    }

    const record        = rows[0];
    const score         = Math.round(record.risk_score ?? 0);
    const level         = record.risk_level || (score >= 70 ? 'High' : score >= 40 ? 'Moderate' : 'Low');
    const confidence    = record.confidence_score != null ? `${Math.round(record.confidence_score * 100)}%` : 'N/A';
    const computedAt    = record.computed_at ? new Date(record.computed_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Unknown';
    const riskFactors   = Array.isArray(record.risk_factors) ? record.risk_factors : [];

    // Build plain-language detail via LLM (skip cache — clinical content)
    let aiDetail = '';
    try {
      const factorText = riskFactors.length
        ? riskFactors.slice(0, 5).join(', ')
        : 'No specific factors recorded';

      const llmResp = await llmProvider.chat({
        messages: [
          {
            role:    'system',
            content: 'You are a concise clinical decision support assistant. Respond in 2-3 sentences of plain English suitable for a busy clinician.',
          },
          {
            role:    'user',
            content: `Patient health risk score: ${score}/100 (${level}). Confidence: ${confidence}. Top risk factors: ${factorText}. Write a brief clinical summary of what this means and what to watch for.`,
          },
        ],
        skipCache:     true,
        cognitiveTier: 'reflex',
        maxTokens:     200,
      });
      aiDetail = llmResp?.content || '';
    } catch (llmErr) {
      console.error('[CDS Hooks] patient-view LLM error:', llmErr.message);
    }

    const detail = [
      `**Risk Score:** ${score}/100 (${level}) | **Confidence:** ${confidence} | **Computed:** ${computedAt}`,
      riskFactors.length ? `**Top Factors:** ${riskFactors.slice(0, 5).join(', ')}` : '',
      aiDetail,
    ].filter(Boolean).join('\n\n');

    cards.push({
      summary:   `Health Risk: ${level} (${score}/100)`,
      detail,
      indicator: riskToIndicator(score),
      source:    SOURCE,
      suggestions: [
        {
          label: 'View Full Risk Report',
          uuid:  `patient-view-risk-${patientId}`,
          actions: [
            {
              type:        'create',
              description: 'Open the AI health risk dashboard for this patient',
              resource:    { resourceType: 'Task', description: `Review AI risk report for patient ${patientId}` },
            },
          ],
        },
      ],
    });
  } catch (err) {
    console.error('[CDS Hooks] handlePatientView error:', err.message);
  }

  return { cards };
}

// ─── 3. medication-prescribe ─────────────────────────────────────────────────

/**
 * POST /cds-hooks/medication-prescribe
 * Body: { hook, hookInstance, context: { patientId, medications: [{name}] } }
 *
 * Runs the built-in critical interaction matrix and returns CDS warning cards.
 * Also checks the patient's documented allergies from the patients table.
 */
async function handleMedicationPrescribe(context) {
  const cards = [];
  try {
    const patientId  = context?.patientId;
    const newMeds    = (context?.medications || [])
      .map(m => (typeof m === 'string' ? m : m.name || m.medicationCodeableConcept?.text || '').trim())
      .filter(Boolean);

    if (!patientId && newMeds.length === 0) return { cards };

    // Load patient's current meds, allergies, and chronic conditions
    const patientRes = await safeQuery(
      `SELECT p."currentMedications", p.allergies, p."chronicConditions"
       FROM   patients p
       WHERE  p.id = $1`,
      [patientId],
    );

    const patient       = patientRes.rows[0] || {};
    const existingMeds  = Array.isArray(patient.currentMedications)
      ? patient.currentMedications.map(m => (m.name || m.medicine || m || '').trim()).filter(Boolean)
      : [];
    const allergies     = Array.isArray(patient.allergies) ? patient.allergies : [];
    const conditions    = Array.isArray(patient.chronicConditions) ? patient.chronicConditions : [];
    const allDrugs      = [...new Set([...newMeds, ...existingMeds])];

    // ── Allergy conflicts ────────────────────────────────────────────────────
    for (const drug of newMeds) {
      for (const allergy of allergies) {
        if (!allergy) continue;
        const drugLower    = drug.toLowerCase();
        const allergyLower = allergy.toLowerCase();
        if (drugLower.includes(allergyLower) || allergyLower.includes(drugLower)) {
          cards.push({
            summary:   `ALLERGY ALERT: ${drug} — patient has documented allergy to ${allergy}`,
            detail:    `**CONTRAINDICATION:** The patient has a documented allergy to **${allergy}**. Prescribing **${drug}** may cause a serious adverse reaction. Do not prescribe without specialist review.`,
            indicator: 'critical',
            source:    SOURCE,
            suggestions: [
              { label: `Remove ${drug} from order`, uuid: `allergy-${drug}-${patientId}` },
            ],
          });
        }
      }
    }

    // ── Drug–drug interactions (built-in critical matrix) ────────────────────
    const CRITICAL_INTERACTIONS = [
      { drug1: /warfarin/i,                                                drug2: /aspirin|ibuprofen|naproxen|nsaid/i,               severity: 'major',          effect: 'Increased bleeding risk. Combination significantly raises haemorrhage risk.' },
      { drug1: /warfarin/i,                                                drug2: /metronidazole|fluconazole|amiodarone/i,           severity: 'major',          effect: 'Enhanced anticoagulant effect — risk of severe bleeding.' },
      { drug1: /enalapril|lisinopril|ramipril|captopril/i,                 drug2: /spironolactone|potassium/i,                       severity: 'major',          effect: 'Hyperkalaemia risk — potentially fatal cardiac arrhythmia.' },
      { drug1: /fluoxetine|sertraline|paroxetine|citalopram|escitalopram/i, drug2: /selegiline|phenelzine|tranylcypromine|isocarboxazid|maoi/i, severity: 'contraindicated', effect: 'Risk of serotonin syndrome — potentially fatal. Must not combine.' },
      { drug1: /methotrexate/i,                                            drug2: /ibuprofen|naproxen|diclofenac|nsaid/i,            severity: 'major',          effect: 'Reduced methotrexate clearance — increased toxicity risk.' },
      { drug1: /atorvastatin|simvastatin|rosuvastatin|lovastatin/i,        drug2: /gemfibrozil|fenofibrate/i,                        severity: 'major',          effect: 'Increased risk of rhabdomyolysis (muscle breakdown).' },
      { drug1: /metformin/i,                                               drug2: /contrast|iodinated/i,                             severity: 'major',          effect: 'Risk of lactic acidosis. Hold metformin 48 h before/after contrast procedures.' },
      { drug1: /digoxin/i,                                                 drug2: /amiodarone|verapamil|quinidine/i,                 severity: 'major',          effect: 'Increased digoxin levels — risk of toxicity (nausea, arrhythmia).' },
      { drug1: /tramadol|morphine|codeine|oxycodone|fentanyl/i,            drug2: /diazepam|lorazepam|alprazolam|clonazepam|midazolam/i, severity: 'major',      effect: 'Respiratory depression risk. FDA black box warning for combination.' },
      { drug1: /ciprofloxacin/i,                                           drug2: /tizanidine/i,                                     severity: 'contraindicated', effect: 'Ciprofloxacin increases tizanidine levels 10-fold — severe hypotension.' },
      { drug1: /sildenafil|tadalafil|vardenafil/i,                         drug2: /nitroglycerin|isosorbide|nitrate/i,               severity: 'contraindicated', effect: 'Severe hypotension — potentially fatal.' },
      { drug1: /lithium/i,                                                  drug2: /ibuprofen|naproxen|diclofenac|nsaid/i,           severity: 'major',          effect: 'NSAIDs reduce lithium clearance — toxicity risk.' },
      { drug1: /theophylline/i,                                            drug2: /ciprofloxacin|erythromycin/i,                     severity: 'major',          effect: 'Increased theophylline levels — seizure risk.' },
      { drug1: /clopidogrel/i,                                             drug2: /omeprazole|esomeprazole/i,                        severity: 'moderate',       effect: 'Reduced clopidogrel efficacy. Consider pantoprazole as alternative PPI.' },
      { drug1: /amlodipine/i,                                              drug2: /simvastatin/i,                                    severity: 'moderate',       effect: 'Amlodipine increases simvastatin levels. Limit simvastatin to 20 mg/day.' },
      { drug1: /metformin/i,                                               drug2: /alcohol|ethanol/i,                                severity: 'major',          effect: 'Increased risk of lactic acidosis.' },
    ];

    const DRUG_CONDITION_INTERACTIONS = [
      { drug: /metformin/i,                                          condition: /renal|kidney|ckd/i,          severity: 'major',          effect: 'Contraindicated in severe renal impairment (eGFR < 30).' },
      { drug: /nsaid|ibuprofen|diclofenac|naproxen/i,               condition: /gastric|ulcer|gerd|gi bleed/i, severity: 'major',        effect: 'Risk of GI bleeding. Use gastroprotection.' },
      { drug: /nsaid|ibuprofen|diclofenac|naproxen/i,               condition: /renal|kidney|ckd/i,          severity: 'major',          effect: 'NSAIDs can worsen renal function.' },
      { drug: /beta.?blocker|atenolol|metoprolol|propranolol/i,      condition: /asthma|copd|bronchospasm/i,  severity: 'major',          effect: 'Beta-blockers may worsen bronchospasm. Use cardioselective agents with caution.' },
      { drug: /corticosteroid|prednisolone|dexamethasone/i,          condition: /diabetes|diabetic/i,         severity: 'moderate',       effect: 'Corticosteroids raise blood glucose. Monitor closely.' },
      { drug: /ace.?inhibitor|enalapril|lisinopril|ramipril/i,       condition: /pregnan/i,                   severity: 'contraindicated', effect: 'ACE inhibitors are teratogenic — contraindicated in pregnancy.' },
    ];

    const seen = new Set();
    for (let i = 0; i < allDrugs.length; i++) {
      for (let j = i + 1; j < allDrugs.length; j++) {
        for (const rule of CRITICAL_INTERACTIONS) {
          const match =
            (rule.drug1.test(allDrugs[i]) && rule.drug2.test(allDrugs[j])) ||
            (rule.drug1.test(allDrugs[j]) && rule.drug2.test(allDrugs[i]));
          if (!match) continue;

          const key = `${allDrugs[i]}+${allDrugs[j]}`;
          if (seen.has(key)) continue;
          seen.add(key);

          cards.push({
            summary:   `Drug Interaction (${rule.severity}): ${allDrugs[i]} + ${allDrugs[j]}`,
            detail:    `**Severity:** ${rule.severity.toUpperCase()}\n\n${rule.effect}\n\n**Drugs involved:** ${allDrugs[i]} and ${allDrugs[j]}`,
            indicator: severityToIndicator(rule.severity),
            source:    SOURCE,
            suggestions: [
              { label: `Review interaction for ${allDrugs[i]} + ${allDrugs[j]}`, uuid: `ddi-${allDrugs[i]}-${allDrugs[j]}-${patientId}` },
            ],
          });
        }
      }
    }

    // ── Drug–condition interactions ──────────────────────────────────────────
    for (const drug of newMeds) {
      for (const rule of DRUG_CONDITION_INTERACTIONS) {
        if (!rule.drug.test(drug)) continue;
        for (const condition of conditions) {
          if (!condition || !rule.condition.test(condition)) continue;
          const key = `cond-${drug}-${condition}`;
          if (seen.has(key)) continue;
          seen.add(key);

          cards.push({
            summary:   `Drug-Condition Alert (${rule.severity}): ${drug} contraindicated with ${condition}`,
            detail:    `**Severity:** ${rule.severity.toUpperCase()}\n\n${rule.effect}\n\n**Drug:** ${drug}  |  **Condition:** ${condition}`,
            indicator: severityToIndicator(rule.severity),
            source:    SOURCE,
            suggestions: [
              { label: `Remove ${drug} from order`, uuid: `dci-${drug}-${condition}-${patientId}` },
            ],
          });
        }
      }
    }

    // ── LLM enrichment for novel combinations (no built-in rule matched) ─────
    if (newMeds.length > 0 && cards.filter(c => c.indicator !== 'info').length === 0) {
      try {
        const llmResp = await llmProvider.chat({
          messages: [
            {
              role:    'system',
              content: 'You are a clinical pharmacist assistant. If there are no clinically significant interactions to report, reply with exactly "NO_ALERTS". Otherwise list each concern in ≤2 sentences per item.',
            },
            {
              role:    'user',
              content: `New medications being prescribed: ${newMeds.join(', ')}.\nExisting medications: ${existingMeds.join(', ') || 'none'}.\nPatient conditions: ${conditions.join(', ') || 'none'}.\nAny drug interactions or contraindications the prescriber should know about?`,
            },
          ],
          skipCache:     true,
          cognitiveTier: 'standard',
          maxTokens:     400,
        });

        const llmText = (llmResp?.content || '').trim();
        if (llmText && llmText !== 'NO_ALERTS' && llmText.length > 10) {
          cards.push({
            summary:   'AI Pharmacist: Possible Interaction — Review Recommended',
            detail:    llmText,
            indicator: 'warning',
            source:    SOURCE,
            suggestions: [],
          });
        }
      } catch (llmErr) {
        console.error('[CDS Hooks] medication-prescribe LLM error:', llmErr.message);
      }
    }

    if (cards.length === 0) {
      cards.push({
        summary:   'No known drug interactions detected',
        detail:    `No critical interactions were found for the prescribed medications against this patient's profile. Always apply clinical judgement.`,
        indicator: 'info',
        source:    SOURCE,
        suggestions: [],
      });
    }
  } catch (err) {
    console.error('[CDS Hooks] handleMedicationPrescribe error:', err.message);
  }

  return { cards };
}

// ─── 4. order-sign ────────────────────────────────────────────────────────────

/**
 * POST /cds-hooks/order-sign
 * Body: { hook, hookInstance, context: { patientId, orders: [{medication}] } }
 *
 * Detects duplicate prescriptions signed in the last 24 h and performs a
 * final allergy safety check before the clinician commits the order.
 */
async function handleOrderSign(context) {
  const cards = [];
  try {
    const patientId = context?.patientId;
    if (!patientId) return { cards };

    const incomingOrders = (context?.orders || context?.draftOrders || [])
      .map(o => {
        if (typeof o === 'string') return o;
        return (
          o.medication ||
          o.medicationCodeableConcept?.text ||
          o.name ||
          o.drug ||
          ''
        ).trim();
      })
      .filter(Boolean);

    // ── Check for recent duplicate prescriptions (last 24 h) ────────────────
    const recentRes = await safeQuery(
      `SELECT medicine_name, created_at
       FROM   prescriptions
       WHERE  patient_id = $1
         AND  created_at > NOW() - INTERVAL '24 hours'`,
      [patientId],
    );

    const recentMeds = recentRes.rows.map(r => (r.medicine_name || '').toLowerCase());

    for (const order of incomingOrders) {
      const orderLower = order.toLowerCase();
      const duplicate  = recentMeds.find(m => m && (m.includes(orderLower) || orderLower.includes(m)));
      if (duplicate) {
        const matchedRow = recentRes.rows.find(r => (r.medicine_name || '').toLowerCase() === duplicate);
        const prescribedAt = matchedRow?.created_at
          ? new Date(matchedRow.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
          : 'within the last 24 hours';

        cards.push({
          summary:   `Duplicate Order: ${order} was already prescribed ${prescribedAt}`,
          detail:    `**Warning:** A prescription for **${order}** (or a similar drug) was signed **${prescribedAt}**. Confirm this is intentional before signing again to avoid double-dosing.`,
          indicator: 'warning',
          source:    SOURCE,
          suggestions: [
            { label: `Remove duplicate ${order}`, uuid: `dup-${order}-${patientId}` },
            { label: 'Keep order — intentional repeat', uuid: `dup-keep-${order}-${patientId}` },
          ],
        });
      }
    }

    // ── Final allergy safety check ───────────────────────────────────────────
    const allergyRes = await safeQuery(
      `SELECT p.allergies FROM patients p WHERE p.id = $1`,
      [patientId],
    );

    const allergies = Array.isArray(allergyRes.rows[0]?.allergies)
      ? allergyRes.rows[0].allergies
      : [];

    for (const order of incomingOrders) {
      for (const allergy of allergies) {
        if (!allergy) continue;
        const orderLower   = order.toLowerCase();
        const allergyLower = allergy.toLowerCase();
        if (orderLower.includes(allergyLower) || allergyLower.includes(orderLower)) {
          cards.push({
            summary:   `STOP — ALLERGY: ${order} conflicts with documented allergy to ${allergy}`,
            detail:    `**CRITICAL SAFETY ALERT:** The patient has a documented allergy to **${allergy}**. Signing this order for **${order}** may cause a serious adverse drug reaction. This order must NOT be signed without urgent specialist review.`,
            indicator: 'critical',
            source:    SOURCE,
            suggestions: [
              { label: `Cancel order for ${order}`, uuid: `allergy-sign-${order}-${patientId}` },
            ],
          });
        }
      }
    }

    if (cards.length === 0) {
      cards.push({
        summary:   'Order check passed — no duplicates or allergy conflicts detected',
        detail:    'No duplicate orders in the last 24 hours and no allergy conflicts were found for this order set.',
        indicator: 'info',
        source:    SOURCE,
        suggestions: [],
      });
    }
  } catch (err) {
    console.error('[CDS Hooks] handleOrderSign error:', err.message);
  }

  return { cards };
}

// ─── 5. encounter-start ───────────────────────────────────────────────────────

/**
 * POST /cds-hooks/encounter-start
 * Body: { hook, hookInstance, context: { patientId, encounterId } }
 *
 * Loads the patient's ABHA ID + ABHA address from the patients table and
 * surfaces a care-context summary card for the clinician.
 */
async function handleEncounterStart(context) {
  const cards = [];
  try {
    const patientId = context?.patientId;
    if (!patientId) return { cards };

    const { rows } = await safeQuery(
      `SELECT abha_id, abha_address,
              first_name, last_name,
              "dateOfBirth", gender,
              "chronicConditions", allergies,
              "currentMedications"
       FROM   patients
       WHERE  id = $1`,
      [patientId],
    );

    if (rows.length === 0) {
      cards.push({
        summary:   'Patient record not found in Mediczy',
        detail:    `No patient record found for ID ${patientId}. Verify patient registration before proceeding.`,
        indicator: 'warning',
        source:    SOURCE,
        suggestions: [],
      });
      return { cards };
    }

    const patient = rows[0];
    const abhaId  = patient.abha_id || null;
    const abhAddr = patient.abha_address || null;

    // ── ABHA identity card ────────────────────────────────────────────────────
    if (abhaId || abhAddr) {
      const patientName = [patient.first_name, patient.last_name].filter(Boolean).join(' ') || `Patient #${patientId}`;
      const detail      = [
        `**Patient:** ${patientName}`,
        abhaId  ? `**ABHA ID:** ${abhaId}`          : null,
        abhAddr ? `**ABHA Address:** ${abhAddr}`     : null,
        '**Status:** ABHA linked — care context available via ABDM',
        '',
        'Use the ABDM consent flow to fetch longitudinal health records from linked facilities.',
      ].filter(Boolean).join('\n\n');

      cards.push({
        summary:   abhaId ? `ABHA linked: ${abhaId}` : `ABHA address: ${abhAddr}`,
        detail,
        indicator: 'info',
        source:    { label: 'Mediczy ABDM Integration', url: 'https://mediqzy.com/abdm' },
        suggestions: [
          {
            label: 'Fetch ABDM Care Records',
            uuid:  `abdm-fetch-${patientId}`,
            actions: [
              {
                type:        'create',
                description: 'Initiate ABDM consent request to fetch care records',
                resource:    { resourceType: 'Task', description: `Fetch ABDM care records for ABHA ${abhaId || abhAddr}` },
              },
            ],
          },
        ],
      });
    } else {
      cards.push({
        summary:   'No ABHA ID on file — patient not linked to ABDM',
        detail:    'This patient does not have a linked ABHA ID or ABHA address. Consider registering them on the ABDM portal to enable longitudinal health record access across facilities.',
        indicator: 'info',
        source:    { label: 'Mediczy ABDM Integration', url: 'https://mediqzy.com/abdm' },
        suggestions: [
          { label: 'Link ABHA ID', uuid: `abdm-link-${patientId}` },
        ],
      });
    }

    // ── Clinical snapshot card ────────────────────────────────────────────────
    const conditions  = Array.isArray(patient.chronicConditions)  ? patient.chronicConditions  : [];
    const allergies   = Array.isArray(patient.allergies)          ? patient.allergies          : [];
    const currentMeds = Array.isArray(patient.currentMedications) ? patient.currentMedications : [];

    const conditionList = conditions.slice(0, 5).join(', ')  || 'None recorded';
    const allergyList   = allergies.slice(0, 5).join(', ')   || 'None recorded';
    const medCount      = currentMeds.length;

    if (conditions.length || allergies.length || medCount) {
      cards.push({
        summary:   `Encounter snapshot — ${conditions.length} condition(s), ${allergies.length} allerg(y/ies), ${medCount} medication(s)`,
        detail:    [
          `**Chronic Conditions:** ${conditionList}`,
          `**Known Allergies:** ${allergyList}`,
          `**Current Medications:** ${medCount > 0 ? `${medCount} active prescription(s) on file` : 'None recorded'}`,
        ].join('\n\n'),
        indicator: allergies.length > 0 ? 'warning' : 'info',
        source:    SOURCE,
        suggestions: [],
      });
    }
  } catch (err) {
    console.error('[CDS Hooks] handleEncounterStart error:', err.message);
  }

  return { cards };
}

// ─── Exports ─────────────────────────────────────────────────────────────────

export default {
  getDiscovery,
  handlePatientView,
  handleMedicationPrescribe,
  handleOrderSign,
  handleEncounterStart,
};
