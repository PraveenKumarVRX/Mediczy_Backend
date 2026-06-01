/**
 * AI Drug Interaction Checker Service
 * =====================================
 * Checks drug-drug, drug-food, and drug-condition interactions
 * when prescriptions are being written or reviewed.
 * 
 * Data sources:
 *   1. Built-in interaction database (common critical interactions)
 *   2. LLM-enhanced analysis via Brain cascade (iSHA → Groq → OpenAI)
 *   3. Patient's current medications + allergies + chronic conditions
 * 
 * Integration points:
 *   - Called during prescription creation
 *   - Available as standalone API endpoint
 *   - AI Brain tool (check_drug_interactions)
 */

import pool from '../db/pgPool.js';
import llmProvider from './ai-brain/llm-provider.js';
import interpretabilityService from './ai-interpretability.service.js';
import qualityGates from './ai-quality-gates.service.js';

// ─── Built-in Critical Drug Interactions Database ───────────
// Source: WHO Essential Medicines + FDA major interaction alerts
const CRITICAL_INTERACTIONS = [
  // Anticoagulants
  { drug1: /warfarin/i, drug2: /aspirin|ibuprofen|naproxen|nsaid/i, severity: 'major', effect: 'Increased bleeding risk. Combination significantly raises hemorrhage risk.' },
  { drug1: /warfarin/i, drug2: /metronidazole|fluconazole|amiodarone/i, severity: 'major', effect: 'Enhanced anticoagulant effect — risk of severe bleeding.' },
  
  // ACE Inhibitors + Potassium
  { drug1: /enalapril|lisinopril|ramipril|captopril/i, drug2: /spironolactone|potassium/i, severity: 'major', effect: 'Hyperkalemia risk — potentially fatal cardiac arrhythmia.' },
  
  // SSRIs + MAOIs
  { drug1: /fluoxetine|sertraline|paroxetine|citalopram|escitalopram/i, drug2: /selegiline|phenelzine|tranylcypromine|isocarboxazid|maoi/i, severity: 'contraindicated', effect: 'Risk of serotonin syndrome — potentially fatal. Must not combine.' },
  
  // Methotrexate + NSAIDs
  { drug1: /methotrexate/i, drug2: /ibuprofen|naproxen|diclofenac|nsaid/i, severity: 'major', effect: 'Reduced methotrexate clearance — increased toxicity risk.' },
  
  // Statins + Fibrates
  { drug1: /atorvastatin|simvastatin|rosuvastatin|lovastatin/i, drug2: /gemfibrozil|fenofibrate/i, severity: 'major', effect: 'Increased risk of rhabdomyolysis (muscle breakdown).' },
  
  // Metformin + Contrast dye
  { drug1: /metformin/i, drug2: /contrast|iodinated/i, severity: 'major', effect: 'Risk of lactic acidosis. Hold metformin 48h before/after contrast procedures.' },
  
  // Digoxin interactions
  { drug1: /digoxin/i, drug2: /amiodarone|verapamil|quinidine/i, severity: 'major', effect: 'Increased digoxin levels — risk of toxicity (nausea, arrhythmia).' },
  
  // Opioids + Benzodiazepines
  { drug1: /tramadol|morphine|codeine|oxycodone|fentanyl/i, drug2: /diazepam|lorazepam|alprazolam|clonazepam|midazolam/i, severity: 'major', effect: 'Respiratory depression risk. FDA black box warning for combination.' },
  
  // Ciprofloxacin + Tizanidine
  { drug1: /ciprofloxacin/i, drug2: /tizanidine/i, severity: 'contraindicated', effect: 'Ciprofloxacin increases tizanidine levels 10-fold — severe hypotension.' },
  
  // Sildenafil + Nitrates
  { drug1: /sildenafil|tadalafil|vardenafil/i, drug2: /nitroglycerin|isosorbide|nitrate/i, severity: 'contraindicated', effect: 'Severe hypotension — potentially fatal.' },
  
  // Lithium + NSAIDs
  { drug1: /lithium/i, drug2: /ibuprofen|naproxen|diclofenac|nsaid/i, severity: 'major', effect: 'NSAIDs reduce lithium clearance — toxicity risk.' },

  // Theophylline + Ciprofloxacin
  { drug1: /theophylline/i, drug2: /ciprofloxacin|erythromycin/i, severity: 'major', effect: 'Increased theophylline levels — seizure risk.' },

  // Clopidogrel + Omeprazole
  { drug1: /clopidogrel/i, drug2: /omeprazole|esomeprazole/i, severity: 'moderate', effect: 'Reduced efficacy of clopidogrel. Consider pantoprazole as alternative PPI.' },

  // Common Indian market drugs
  { drug1: /amlodipine/i, drug2: /simvastatin/i, severity: 'moderate', effect: 'Amlodipine increases simvastatin levels. Limit simvastatin to 20mg/day.' },
  { drug1: /metformin/i, drug2: /alcohol|ethanol/i, severity: 'major', effect: 'Increased risk of lactic acidosis.' },
];

// Drug-Condition Interactions
const DRUG_CONDITION_INTERACTIONS = [
  { drug: /metformin/i, condition: /renal|kidney|ckd/i, severity: 'major', effect: 'Contraindicated in severe renal impairment (eGFR < 30).' },
  { drug: /nsaid|ibuprofen|diclofenac|naproxen/i, condition: /gastric|ulcer|gerd|gi bleed/i, severity: 'major', effect: 'Risk of GI bleeding. Use gastroprotection.' },
  { drug: /nsaid|ibuprofen|diclofenac|naproxen/i, condition: /renal|kidney|ckd/i, severity: 'major', effect: 'NSAIDs can worsen renal function.' },
  { drug: /beta.?blocker|atenolol|metoprolol|propranolol/i, condition: /asthma|copd|bronchospasm/i, severity: 'major', effect: 'Beta-blockers may worsen bronchospasm. Use cardioselective agents with caution.' },
  { drug: /corticosteroid|prednisolone|dexamethasone/i, condition: /diabetes|diabetic/i, severity: 'moderate', effect: 'Corticosteroids raise blood glucose. Monitor closely.' },
  { drug: /ace.?inhibitor|enalapril|lisinopril|ramipril/i, condition: /pregnan/i, severity: 'contraindicated', effect: 'ACE inhibitors are teratogenic — contraindicated in pregnancy.' },
];

class DrugInteractionChecker {
  /**
   * Check interactions for a list of medications
   * @param {Object} params
   * @param {Array<string|{name:string}>} params.medications - Drugs to check
   * @param {number} [params.patientId] - Patient ID to load current meds/conditions
   * @param {boolean} [params.useLLM=true] - Whether to enhance with LLM analysis
   * @returns {Object} { interactions, summary, severity, safe }
   */
  async checkInteractions({ medications, patientId = null, useLLM = true }) {
    const startTime = Date.now();
    const db = pool;

    // Normalize medication names
    const drugNames = medications.map(m => {
      if (typeof m === 'string') return m.trim();
      return (m.name || m.medicine || m.drug || '').trim();
    }).filter(Boolean);

    if (drugNames.length === 0) {
      return { interactions: [], summary: 'No medications provided', severity: 'none', safe: true };
    }

    // Load patient's existing medications and conditions if patientId provided
    let existingMeds = [];
    let conditions = [];
    let allergies = [];

    if (patientId) {
      try {
        const { rows } = await db.query(`
          SELECT p."currentMedications", p.allergies, p."chronicConditions"
          FROM patients p
          WHERE p.id = $1
        `, [patientId]);

        if (rows.length > 0) {
          const patient = rows[0];
          existingMeds = Array.isArray(patient.currentMedications)
            ? patient.currentMedications.map(m => m.name || m.medicine || m).filter(Boolean)
            : [];
          conditions = patient.chronicConditions || [];
          allergies = patient.allergies || [];
        }
      } catch (err) {
        console.error('[DrugInteraction] Patient lookup error:', err.message);
      }
    }

    // Merge new drugs with existing medications
    const allDrugs = [...new Set([...drugNames, ...existingMeds])];
    const interactions = [];

    // 1. Check drug-drug interactions from built-in database
    for (let i = 0; i < allDrugs.length; i++) {
      for (let j = i + 1; j < allDrugs.length; j++) {
        for (const rule of CRITICAL_INTERACTIONS) {
          if (
            (rule.drug1.test(allDrugs[i]) && rule.drug2.test(allDrugs[j])) ||
            (rule.drug1.test(allDrugs[j]) && rule.drug2.test(allDrugs[i]))
          ) {
            interactions.push({
              type: 'drug-drug',
              drug1: allDrugs[i],
              drug2: allDrugs[j],
              severity: rule.severity,
              effect: rule.effect,
              source: 'built-in'
            });
          }
        }
      }
    }

    // 2. Check drug-condition interactions
    for (const drug of allDrugs) {
      for (const rule of DRUG_CONDITION_INTERACTIONS) {
        if (rule.drug.test(drug)) {
          for (const condition of conditions) {
            if (rule.condition.test(condition)) {
              interactions.push({
                type: 'drug-condition',
                drug: drug,
                condition: condition,
                severity: rule.severity,
                effect: rule.effect,
                source: 'built-in'
              });
            }
          }
        }
      }
    }

    // 3. Check drug-allergy conflicts
    for (const drug of allDrugs) {
      for (const allergy of allergies) {
        if (drug.toLowerCase().includes(allergy.toLowerCase()) || 
            allergy.toLowerCase().includes(drug.toLowerCase())) {
          interactions.push({
            type: 'drug-allergy',
            drug: drug,
            allergy: allergy,
            severity: 'contraindicated',
            effect: `Patient has documented allergy to ${allergy}. This medication should NOT be prescribed.`,
            source: 'patient-record'
          });
        }
      }
    }

    // 4. LLM-enhanced interaction check for drugs not in built-in database
    if (useLLM && allDrugs.length >= 2) {
      try {
        const llmInteractions = await this.llmInteractionCheck(allDrugs, conditions, allergies);
        // Only add LLM-found interactions not already caught by built-in rules
        for (const llmInt of llmInteractions) {
          const isDuplicate = interactions.some(existing =>
            existing.drug1 === llmInt.drug1 && existing.drug2 === llmInt.drug2 ||
            existing.drug1 === llmInt.drug2 && existing.drug2 === llmInt.drug1
          );
          if (!isDuplicate) {
            interactions.push({ ...llmInt, source: 'llm-analysis' });
          }
        }
      } catch (err) {
        console.error('[DrugInteraction] LLM check error:', err.message);
      }
    }

    // Determine overall severity
    let maxSeverity = 'none';
    if (interactions.some(i => i.severity === 'contraindicated')) maxSeverity = 'contraindicated';
    else if (interactions.some(i => i.severity === 'major')) maxSeverity = 'major';
    else if (interactions.some(i => i.severity === 'moderate')) maxSeverity = 'moderate';
    else if (interactions.length > 0) maxSeverity = 'minor';

    // Generate summary
    const summary = interactions.length === 0
      ? `No interactions detected among ${allDrugs.length} medications.`
      : `Found ${interactions.length} interaction(s): ${interactions.filter(i => i.severity === 'contraindicated').length} contraindicated, ${interactions.filter(i => i.severity === 'major').length} major, ${interactions.filter(i => i.severity === 'moderate').length} moderate.`;

    // ── Confidence score: how complete is the patient context? ──────────────
    const confidence = interpretabilityService.computeConfidenceScore(
      {
        prescriptions:      drugNames.length,
        report_lab_values:  conditions.length,
        vitals:             false,
        labs:               false
      },
      { chronicConditions: conditions, allergies }
    );

    // ── SaMD Quality Gate (Class III — highest risk) ──────────────────────
    let llmRecommendationText = '';
    try {
      // Extract last LLM recommendation from llm interactions if available
      const llmInts = interactions.filter(i => i.source === 'llm-analysis');
      llmRecommendationText = llmInts.map(i => i.effect).join(' ');
    } catch { /* non-blocking */ }

    const gateResult = await qualityGates.checkDrugInteraction({
      patientId,
      drugs:        allDrugs,
      interactions,
      recommendation: llmRecommendationText,
      patient:      { chronicConditions: conditions, allergies, gender: null, age: null }
    });

    if (gateResult.hasBlockers) {
      console.warn(`[DrugInteraction] Gate BLOCKED for patient ${patientId}: ${gateResult.blockers.map(b => b.code).join(', ')}`);
    }
    await qualityGates.logGateResult(gateResult, { source: 'drug_interaction', drugCount: allDrugs.length });

    const elapsed = Date.now() - startTime;
    console.log(`[DrugInteraction] Checked ${allDrugs.length} drugs in ${elapsed}ms: ${interactions.length} interactions found | gate=${gateResult.severity}`);

    return {
      interactions,
      summary,
      severity:          maxSeverity,
      safe:              interactions.length === 0 && !gateResult.hasBlockers,
      drugsChecked:      allDrugs,
      conditionsChecked: conditions,
      allergiesChecked:  allergies,
      confidence:        { score: confidence.score, tier: confidence.tier, missingSources: confidence.missingSources },
      qualityGate: {
        passed:          gateResult.passed,
        severity:        gateResult.severity,
        blockers:        gateResult.blockers,
        warnings:        gateResult.warnings,
        requiredActions: gateResult.requiredActions
      },
      latencyMs: elapsed
    };
  }

  /**
   * LLM-based interaction analysis for comprehensive coverage
   */
  async llmInteractionCheck(drugs, conditions, allergies) {
    const prompt = `You are a clinical pharmacology expert. Analyze the following medications for drug-drug interactions. Consider the patient's conditions and allergies.

Medications: ${drugs.join(', ')}
Conditions: ${conditions.join(', ') || 'none reported'}
Allergies: ${allergies.join(', ') || 'none reported'}

For each interaction found, respond with ONLY a JSON array. If no interactions, respond with [].
Format: [{"drug1": "name", "drug2": "name", "severity": "minor|moderate|major|contraindicated", "effect": "brief clinical description", "type": "drug-drug"}]

Only include clinically significant interactions. Do not repeat interactions already obvious from the drug names.`;

    const result = await llmProvider.chat({
      messages: [{ role: 'user', content: prompt }],
      tools: null,
      conversationId: `drug-check-${Date.now()}`
    });

    const content = result.content || '';
    const match = content.match(/\[[\s\S]*?\]/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        return Array.isArray(parsed) ? parsed : [];
      } catch { return []; }
    }
    return [];
  }

  /**
   * Quick check — no LLM, just built-in database (for real-time prescription UI)
   */
  quickCheck(medications) {
    const drugNames = medications.map(m => typeof m === 'string' ? m : (m.name || m.medicine || '')).filter(Boolean);
    const interactions = [];

    for (let i = 0; i < drugNames.length; i++) {
      for (let j = i + 1; j < drugNames.length; j++) {
        for (const rule of CRITICAL_INTERACTIONS) {
          if (
            (rule.drug1.test(drugNames[i]) && rule.drug2.test(drugNames[j])) ||
            (rule.drug1.test(drugNames[j]) && rule.drug2.test(drugNames[i]))
          ) {
            interactions.push({
              type: 'drug-drug',
              drug1: drugNames[i],
              drug2: drugNames[j],
              severity: rule.severity,
              effect: rule.effect
            });
          }
        }
      }
    }

    return {
      interactions,
      safe: interactions.length === 0,
      severity: interactions.some(i => i.severity === 'contraindicated') ? 'contraindicated'
        : interactions.some(i => i.severity === 'major') ? 'major'
        : interactions.length > 0 ? 'moderate' : 'none'
    };
  }
}

const drugInteractionChecker = new DrugInteractionChecker();
export default drugInteractionChecker;
