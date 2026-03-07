/**
 * AI Emergency Triage Service
 * =============================
 * Implements ESI 5-Level Emergency Severity Index for patient triage.
 * 
 * ESI Levels:
 *   1 — Resuscitation (life-threatening, immediate intervention)
 *   2 — Emergent (high risk, severe pain, altered mental status)
 *   3 — Urgent (two or more resources needed)
 *   4 — Less Urgent (one resource expected)
 *   5 — Non-Urgent (no resources expected)
 * 
 * Features:
 *   - Rule-based ESI scoring with vital signs integration
 *   - LLM-enhanced symptom analysis
 *   - Red flag detection (stroke, MI, anaphylaxis, etc.)
 *   - Ambulance dispatch recommendation
 *   - Doctor specialty routing
 *   - Wait time estimation
 */

import pool from '../db/pgPool.js';
import llmProvider from './ai-brain/llm-provider.js';

// ─── Red Flag Conditions (ESI Level 1-2) ────────────────────
const RED_FLAGS = [
  { pattern: /chest.?pain|angina|mi|myocardial|heart.?attack/i, esi: 1, category: 'cardiac', action: 'ACTIVATE_CODE_STEMI' },
  { pattern: /stroke|facial.?droop|slurred.?speech|arm.?weakness|tia|hemiplegia/i, esi: 1, category: 'stroke', action: 'ACTIVATE_CODE_STROKE' },
  { pattern: /anaphyla|severe.?allerg|throat.?swell|can.?t.?breath|airway/i, esi: 1, category: 'anaphylaxis', action: 'EPINEPHRINE_READY' },
  { pattern: /unresponsive|unconscious|cardiac.?arrest|no.?pulse|not.?breathing/i, esi: 1, category: 'arrest', action: 'ACTIVATE_CODE_BLUE' },
  { pattern: /severe.?bleed|hemorrhag|massive.?blood/i, esi: 1, category: 'hemorrhage', action: 'MASSIVE_TRANSFUSION' },
  { pattern: /seizure.?continuous|status.?epilepticus/i, esi: 1, category: 'neuro', action: 'SEIZURE_PROTOCOL' },
  
  { pattern: /difficulty.?breathing|dyspnea|respiratory.?distress|asthma.?attack/i, esi: 2, category: 'respiratory', action: 'OXYGEN_READY' },
  { pattern: /severe.?pain.*(10|9|8).*(10|out.?of)/i, esi: 2, category: 'pain', action: 'PAIN_PROTOCOL' },
  { pattern: /poisoning|overdose|ingested|toxic/i, esi: 2, category: 'toxicology', action: 'POISON_CONTROL' },
  { pattern: /high.?fever.*(child|infant|baby|newborn)|febrile.?seizure/i, esi: 2, category: 'pediatric', action: 'PEDIATRIC_ALERT' },
  { pattern: /suicid|self.?harm|want.?to.?die|kill.?myself/i, esi: 2, category: 'psychiatric', action: 'CRISIS_INTERVENTION' },
  { pattern: /snake.?bite|scorpion|envenomation/i, esi: 2, category: 'toxicology', action: 'ANTIVENOM_READY' },
  { pattern: /fracture.?open|compound.?fracture|bone.?visible/i, esi: 2, category: 'trauma', action: 'ORTHO_TRAUMA_ALERT' },
  { pattern: /burn.*(face|airway|>20%|third.?degree)/i, esi: 2, category: 'burns', action: 'BURN_PROTOCOL' },
];

// ─── Vital Signs Thresholds for ESI Override ────────────────
const VITALS_THRESHOLDS = {
  esi1: {
    systolic: { max: 80 },     // Severe hypotension
    heartRate: { max: 150, min: 35 },
    spo2: { max: 85 },
    respiratoryRate: { max: 35, min: 6 },
    temperature: { max: 41.5 }
  },
  esi2: {
    systolic: { max: 90, min: undefined },
    heartRate: { max: 130, min: 45 },
    spo2: { max: 90 },
    respiratoryRate: { max: 28 },
    temperature: { max: 40.5 }
  }
};

// ─── Specialty Routing Map ──────────────────────────────────
const SPECIALTY_ROUTING = {
  cardiac: 'Cardiology',
  stroke: 'Neurology',
  anaphylaxis: 'Emergency Medicine',
  arrest: 'Emergency Medicine',
  hemorrhage: 'General Surgery',
  neuro: 'Neurology',
  respiratory: 'Pulmonology',
  pain: 'Emergency Medicine',
  toxicology: 'Emergency Medicine',
  pediatric: 'Pediatrics',
  psychiatric: 'Psychiatry',
  trauma: 'Orthopedics',
  burns: 'Plastic Surgery',
  general: 'Emergency Medicine'
};

class EmergencyTriageService {
  /**
   * Triage a patient based on symptoms and vitals
   * @param {Object} params
   * @param {string} params.symptoms - Chief complaint / symptom description
   * @param {Object} [params.vitals] - Vital signs
   * @param {number} [params.painScale] - Pain level 0-10
   * @param {number} [params.age] - Patient age
   * @param {string} [params.gender] - Patient gender
   * @param {number} [params.patientId] - Patient ID for context
   * @returns {Object} Triage result with ESI level, actions, routing
   */
  async triage({ symptoms, vitals = {}, painScale = null, age = null, gender = null, patientId = null }) {
    const startTime = Date.now();

    // Phase 1: Rule-based red flag detection
    let esiLevel = 5;
    let category = 'general';
    let actions = [];
    let redFlagsDetected = [];

    // Check red flags
    for (const flag of RED_FLAGS) {
      if (flag.pattern.test(symptoms)) {
        if (flag.esi < esiLevel) {
          esiLevel = flag.esi;
          category = flag.category;
        }
        redFlagsDetected.push({
          category: flag.category,
          esi: flag.esi,
          action: flag.action
        });
        actions.push(flag.action);
      }
    }

    // Phase 2: Vitals-based ESI override
    if (vitals && Object.keys(vitals).length > 0) {
      const vitalsESI = this.assessVitals(vitals);
      if (vitalsESI < esiLevel) {
        esiLevel = vitalsESI;
        if (vitalsESI <= 2) actions.push('VITALS_CRITICAL');
      }
    }

    // Phase 3: Pain scale consideration
    if (painScale !== null) {
      if (painScale >= 9 && esiLevel > 2) {
        esiLevel = 2;
        actions.push('PAIN_PROTOCOL');
      } else if (painScale >= 7 && esiLevel > 3) {
        esiLevel = 3;
      }
    }

    // Phase 4: Age-based adjustments
    if (age !== null) {
      if (age < 1 && esiLevel > 2) {
        esiLevel = Math.min(esiLevel, 2); // Infants elevated
        actions.push('PEDIATRIC_ALERT');
      } else if (age > 80 && esiLevel > 3) {
        esiLevel = Math.min(esiLevel, 3); // Elderly elevated
      }
    }

    // Phase 5: LLM-enhanced symptom analysis for borderline cases
    let llmAnalysis = null;
    if (esiLevel >= 3) {
      try {
        llmAnalysis = await this.llmSymptomAnalysis(symptoms, vitals, painScale, age, gender);
        if (llmAnalysis.suggestedESI < esiLevel) {
          esiLevel = llmAnalysis.suggestedESI;
        }
        if (llmAnalysis.additionalCategory) {
          category = llmAnalysis.additionalCategory;
        }
      } catch (err) {
        console.error('[Triage] LLM analysis error:', err.message);
      }
    }

    // Determine routing
    const specialty = SPECIALTY_ROUTING[category] || 'Emergency Medicine';
    const ambulanceNeeded = esiLevel <= 2;
    const estimatedWaitMinutes = this.estimateWait(esiLevel);

    // Build response
    const result = {
      esiLevel,
      esiDescription: this.getESIDescription(esiLevel),
      category,
      specialty,
      ambulanceNeeded,
      ambulanceDispatch: ambulanceNeeded ? {
        priority: esiLevel === 1 ? 'LIGHTS_AND_SIRENS' : 'URGENT',
        equipment: this.getAmbulanceEquipment(category),
        paramedic_level: esiLevel === 1 ? 'ALS' : 'BLS',
      } : null,
      redFlagsDetected,
      actions: [...new Set(actions)],
      immediateActions: this.getImmediateActions(esiLevel, category),
      estimatedWaitMinutes,
      llmAnalysis: llmAnalysis?.reasoning || null,
      vitalsAssessment: vitals && Object.keys(vitals).length > 0 ? this.formatVitalsAssessment(vitals) : null,
      latencyMs: Date.now() - startTime
    };

    // Log triage for audit
    if (patientId) {
      await this.logTriageEvent(patientId, result);
    }

    console.log(`[Triage] ESI-${esiLevel} | ${category} | ambulance=${ambulanceNeeded} | ${Date.now() - startTime}ms`);
    return result;
  }

  /**
   * Assess vitals against ESI thresholds
   */
  assessVitals(vitals) {
    const sys = vitals.systolic || vitals.blood_pressure_systolic;
    const hr = vitals.heart_rate || vitals.pulse || vitals.heartRate;
    const spo2 = vitals.oxygen_saturation || vitals.spo2;
    const rr = vitals.respiratory_rate || vitals.respiratoryRate;
    const temp = vitals.temperature;

    // Check ESI 1 thresholds
    const t1 = VITALS_THRESHOLDS.esi1;
    if (sys && sys < t1.systolic.max) return 1;
    if (hr && (hr > t1.heartRate.max || hr < t1.heartRate.min)) return 1;
    if (spo2 && spo2 < t1.spo2.max) return 1;
    if (rr && (rr > t1.respiratoryRate.max || rr < t1.respiratoryRate.min)) return 1;
    if (temp && temp > t1.temperature.max) return 1;

    // Check ESI 2 thresholds
    const t2 = VITALS_THRESHOLDS.esi2;
    if (sys && sys < t2.systolic.max) return 2;
    if (hr && (hr > t2.heartRate.max || hr < t2.heartRate.min)) return 2;
    if (spo2 && spo2 < t2.spo2.max) return 2;
    if (rr && rr > t2.respiratoryRate.max) return 2;
    if (temp && temp > t2.temperature.max) return 2;

    return 5; // Vitals within normal range
  }

  /**
   * LLM-based symptom assessment
   */
  async llmSymptomAnalysis(symptoms, vitals, painScale, age, gender) {
    const prompt = `You are an emergency medicine triage nurse using the ESI 5-Level system.

Patient presents with:
- Symptoms: ${symptoms}
- Vitals: ${JSON.stringify(vitals) || 'not available'}
- Pain: ${painScale !== null ? `${painScale}/10` : 'not assessed'}
- Age: ${age || 'unknown'}, Gender: ${gender || 'unknown'}

Assess and respond with ONLY a JSON object:
{
  "suggestedESI": <1-5>,
  "reasoning": "<brief clinical reasoning>",
  "additionalCategory": "<cardiac|respiratory|neuro|trauma|etc or null>",
  "resourcesNeeded": <number 0-3>
}`;

    const result = await llmProvider.chat({
      messages: [{ role: 'user', content: prompt }],
      tools: null,
      conversationId: `triage-${Date.now()}`
    });

    const content = result.content || '';
    const match = content.match(/\{[\s\S]*?\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch { /* fall through */ }
    }

    return { suggestedESI: 4, reasoning: 'Unable to parse LLM assessment', additionalCategory: null, resourcesNeeded: 1 };
  }

  /**
   * Get ESI level description
   */
  getESIDescription(level) {
    const descriptions = {
      1: 'RESUSCITATION — Life-threatening, requires immediate intervention',
      2: 'EMERGENT — High risk situation, severe pain or distress',
      3: 'URGENT — Multiple resources needed, stable but requires prompt care',
      4: 'LESS URGENT — One resource expected, can wait',
      5: 'NON-URGENT — No resources expected, can be seen by telemedicine'
    };
    return descriptions[level] || 'UNKNOWN';
  }

  /**
   * Estimate wait time based on ESI level
   */
  estimateWait(esiLevel) {
    const waits = { 1: 0, 2: 5, 3: 30, 4: 60, 5: 120 };
    return waits[esiLevel] || 60;
  }

  /**
   * Get ambulance equipment based on category
   */
  getAmbulanceEquipment(category) {
    const equipment = {
      cardiac: ['12-lead ECG', 'Defibrillator', 'Aspirin', 'Nitroglycerine', 'IV access kit'],
      stroke: ['Stroke assessment kit', 'IV access', 'Blood glucose monitor', 'O2 mask'],
      anaphylaxis: ['Epinephrine auto-injector', 'Antihistamines', 'O2 mask', 'IV fluids'],
      arrest: ['AED', 'BVM', 'Advanced airway kit', 'IV access', 'Epinephrine'],
      hemorrhage: ['Trauma bandages', 'Tourniquets', 'IV fluids x4', 'Blood pressure cuff'],
      burns: ['Sterile burn dressings', 'IV fluids', 'Pain management kit'],
      default: ['Basic life support kit', 'O2 cylinder', 'IV access kit']
    };
    return equipment[category] || equipment.default;
  }

  /**
   * Get immediate actions for the triage level
   */
  getImmediateActions(esiLevel, category) {
    if (esiLevel === 1) {
      return [
        'Activate emergency response team immediately',
        'Prepare resuscitation bay',
        'Notify attending physician STAT',
        'Prepare defibrillator and airway equipment',
        'Start continuous vital sign monitoring'
      ];
    }
    if (esiLevel === 2) {
      return [
        'Place patient in monitored bed',
        'Obtain IV access',
        'Order STAT labs (CBC, BMP, Troponin if cardiac)',
        'Notify attending physician within 10 minutes',
        'Continuous pulse oximetry'
      ];
    }
    if (esiLevel === 3) {
      return [
        'Assign to next available bed',
        'Vital signs every 30 minutes',
        'Order appropriate labs/imaging',
        'Physician evaluation within 30 minutes'
      ];
    }
    return [
      'Register and seat in waiting area',
      'Provide comfort measures',
      'Re-assess if condition changes'
    ];
  }

  /**
   * Format vitals assessment
   */
  formatVitalsAssessment(vitals) {
    const assessments = [];
    const sys = vitals.systolic || vitals.blood_pressure_systolic;
    const dia = vitals.diastolic || vitals.blood_pressure_diastolic;

    if (sys) {
      if (sys > 180) assessments.push({ param: 'Blood Pressure', value: `${sys}/${dia}`, status: 'CRITICAL' });
      else if (sys > 140) assessments.push({ param: 'Blood Pressure', value: `${sys}/${dia}`, status: 'HIGH' });
      else if (sys < 90) assessments.push({ param: 'Blood Pressure', value: `${sys}/${dia}`, status: 'LOW' });
      else assessments.push({ param: 'Blood Pressure', value: `${sys}/${dia}`, status: 'NORMAL' });
    }

    const hr = vitals.heart_rate || vitals.pulse;
    if (hr) {
      if (hr > 120 || hr < 50) assessments.push({ param: 'Heart Rate', value: `${hr} bpm`, status: 'ABNORMAL' });
      else assessments.push({ param: 'Heart Rate', value: `${hr} bpm`, status: 'NORMAL' });
    }

    const spo2 = vitals.oxygen_saturation || vitals.spo2;
    if (spo2) {
      if (spo2 < 90) assessments.push({ param: 'SpO2', value: `${spo2}%`, status: 'CRITICAL' });
      else if (spo2 < 95) assessments.push({ param: 'SpO2', value: `${spo2}%`, status: 'LOW' });
      else assessments.push({ param: 'SpO2', value: `${spo2}%`, status: 'NORMAL' });
    }

    return assessments;
  }

  /**
   * Log triage event to clinical insights for audit trail
   */
  async logTriageEvent(patientId, triageResult) {
    try {
      const db = pool;
      await db.query(`
        INSERT INTO ai_clinical_insights 
          (insight_type, target_type, target_id, title, description, severity, data, is_actionable, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW() + INTERVAL '30 days')
      `, [
        'emergency_triage',
        'patient',
        patientId,
        `Emergency Triage: ESI Level ${triageResult.esiLevel}`,
        triageResult.esiDescription,
        triageResult.esiLevel <= 2 ? 'critical' : triageResult.esiLevel === 3 ? 'warning' : 'info',
        JSON.stringify({
          esiLevel: triageResult.esiLevel,
          category: triageResult.category,
          specialty: triageResult.specialty,
          ambulanceNeeded: triageResult.ambulanceNeeded,
          redFlags: triageResult.redFlagsDetected,
          actions: triageResult.actions
        }),
        triageResult.esiLevel <= 3
      ]);
    } catch (err) {
      console.error('[Triage] Audit log error:', err.message);
    }
  }
}

const emergencyTriageService = new EmergencyTriageService();
export default emergencyTriageService;
