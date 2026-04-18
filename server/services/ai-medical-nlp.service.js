/**
 * Mediqzy Medical NLP — Clinical Entity Extraction Service
 * =========================================================
 * Extracts structured medical entities from unstructured clinical text
 * (Dr. iSHA conversations, AI Scribe notes, clinical memos).
 *
 * Entity types extracted:
 *   symptom     — headache, chest pain, dyspnea
 *   diagnosis   — Type 2 Diabetes, Hypertension, GERD
 *   medication  — Metformin 500mg, Amlodipine 5mg
 *   procedure   — ECG, Echocardiogram, CABG
 *   allergy     — Penicillin allergy, sulfa sensitivity
 *   lab         — HbA1c, CBC, LFT
 *   vital       — BP 140/90, SpO2 98%, Temperature 38.5°C
 *   body_part   — left arm, lower abdomen
 *   severity    — moderate, severe, 7/10 pain
 *
 * Output: FHIR R4 compatible JSON resources persisted in medical_entities table.
 *
 * Architecture:
 *   1. Rule-based pre-extraction (fast, no API cost, handles common patterns)
 *   2. LLM extraction (for complex, ambiguous, or novel entities)
 *   3. ICD-10 / RxNorm code lookup (pattern-based, local)
 *   4. FHIR resource builder
 *   5. Persistence + deduplication
 *
 * Used by:
 *   - AI Scribe (post-consultation)
 *   - Dr. iSHA (end of conversation)
 *   - Clinical insights cron (for population analysis)
 */

import pool from '../db/pgPool.js';
import llmProvider from './ai-brain/llm-provider.js';

// ─── Common symptom patterns ─────────────────────────────────
const SYMPTOM_PATTERNS = [
  { pattern: /\b(headache|head ache|cephalgia|migraine)\b/i,         name: 'Headache',           icd10: 'R51.9'  },
  { pattern: /\b(chest pain|chest tightness|angina)\b/i,             name: 'Chest pain',         icd10: 'R07.9'  },
  { pattern: /\b(fever|pyrexia|high temperature|febrile)\b/i,        name: 'Fever',              icd10: 'R50.9'  },
  { pattern: /\b(cough|coughing)\b/i,                                name: 'Cough',              icd10: 'R05.9'  },
  { pattern: /\b(shortness of breath|dyspnea|breathless)\b/i,        name: 'Dyspnea',            icd10: 'R06.00' },
  { pattern: /\b(nausea|nauseous|vomiting|vomit)\b/i,                name: 'Nausea/Vomiting',    icd10: 'R11.2'  },
  { pattern: /\b(diarrhea|diarrhoea|loose stools|loose motion)\b/i,  name: 'Diarrhea',           icd10: 'R19.7'  },
  { pattern: /\b(abdominal pain|stomach pain|tummy pain|belly pain)\b/i, name: 'Abdominal pain', icd10: 'R10.9'  },
  { pattern: /\b(back pain|backache|lumbago)\b/i,                    name: 'Back pain',          icd10: 'M54.5'  },
  { pattern: /\b(fatigue|tiredness|exhausted|weakness)\b/i,          name: 'Fatigue',            icd10: 'R53.83' },
  { pattern: /\b(dizziness|dizzy|vertigo|lightheaded)\b/i,           name: 'Dizziness',          icd10: 'R42'    },
  { pattern: /\b(swelling|edema|oedema|bloating)\b/i,                name: 'Edema',              icd10: 'R60.9'  },
  { pattern: /\b(rash|skin rash|hives|urticaria)\b/i,                name: 'Skin rash',          icd10: 'R21'    },
  { pattern: /\b(joint pain|arthralgia|joint ache)\b/i,              name: 'Arthralgia',         icd10: 'M25.50' },
  { pattern: /\b(insomnia|sleeplessness|can.{1,5}t sleep|sleep issue)\b/i, name: 'Insomnia',     icd10: 'G47.00' },
  { pattern: /\b(anxiety|anxious|panic attack|nervous)\b/i,          name: 'Anxiety',            icd10: 'F41.1'  },
  { pattern: /\b(depression|depressed|low mood|sadness)\b/i,         name: 'Depression',         icd10: 'F32.9'  },
  { pattern: /\b(palpitation|heart racing|tachycardia)\b/i,          name: 'Palpitations',       icd10: 'R00.2'  },
];

// ─── Common diagnosis patterns ───────────────────────────────
const DIAGNOSIS_PATTERNS = [
  { pattern: /\b(type 2 diabetes|t2dm|diabetes mellitus type 2|diabetes)\b/i, name: 'Type 2 Diabetes Mellitus', icd10: 'E11.9' },
  { pattern: /\b(type 1 diabetes|t1dm)\b/i,         name: 'Type 1 Diabetes Mellitus', icd10: 'E10.9' },
  { pattern: /\b(hypertension|high blood pressure|htn)\b/i, name: 'Essential Hypertension', icd10: 'I10' },
  { pattern: /\b(hypothyroidism|underactive thyroid)\b/i, name: 'Hypothyroidism',     icd10: 'E03.9'  },
  { pattern: /\b(hyperthyroidism|overactive thyroid)\b/i, name: 'Hyperthyroidism',    icd10: 'E05.90' },
  { pattern: /\b(asthma|bronchial asthma)\b/i,       name: 'Asthma',                 icd10: 'J45.909' },
  { pattern: /\b(copd|chronic obstructive pulmonary)\b/i, name: 'COPD',              icd10: 'J44.1'  },
  { pattern: /\b(gerd|acid reflux|gastroesophageal reflux|heartburn)\b/i, name: 'GERD', icd10: 'K21.0' },
  { pattern: /\b(arthritis|osteoarthritis)\b/i,      name: 'Osteoarthritis',         icd10: 'M19.90' },
  { pattern: /\b(rheumatoid arthritis|ra)\b/i,       name: 'Rheumatoid Arthritis',   icd10: 'M06.9'  },
  { pattern: /\b(ckd|chronic kidney disease|renal failure)\b/i, name: 'Chronic Kidney Disease', icd10: 'N18.9' },
  { pattern: /\b(anemia|anaemia|low hemoglobin)\b/i, name: 'Anemia',                 icd10: 'D64.9'  },
  { pattern: /\b(uti|urinary tract infection|cystitis)\b/i, name: 'UTI',             icd10: 'N39.0'  },
];

// ─── Common medication patterns ──────────────────────────────
const MEDICATION_PATTERNS = [
  { pattern: /\b(metformin)\b/i,       name: 'Metformin',    rxnorm: '6809'   },
  { pattern: /\b(amlodipine)\b/i,      name: 'Amlodipine',   rxnorm: '17767'  },
  { pattern: /\b(atorvastatin)\b/i,    name: 'Atorvastatin', rxnorm: '83367'  },
  { pattern: /\b(paracetamol|acetaminophen)\b/i, name: 'Paracetamol', rxnorm: '161' },
  { pattern: /\b(ibuprofen)\b/i,       name: 'Ibuprofen',    rxnorm: '5640'   },
  { pattern: /\b(omeprazole)\b/i,      name: 'Omeprazole',   rxnorm: '7646'   },
  { pattern: /\b(pantoprazole)\b/i,    name: 'Pantoprazole', rxnorm: '40790'  },
  { pattern: /\b(lisinopril)\b/i,      name: 'Lisinopril',   rxnorm: '29046'  },
  { pattern: /\b(levothyroxine|thyroxine)\b/i, name: 'Levothyroxine', rxnorm: '10582' },
  { pattern: /\b(aspirin)\b/i,         name: 'Aspirin',      rxnorm: '1191'   },
  { pattern: /\b(clopidogrel)\b/i,     name: 'Clopidogrel',  rxnorm: '32968'  },
  { pattern: /\b(amoxicillin)\b/i,     name: 'Amoxicillin',  rxnorm: '723'    },
  { pattern: /\b(azithromycin)\b/i,    name: 'Azithromycin', rxnorm: '18631'  },
];

// ─── Vital signs pattern ─────────────────────────────────────
const VITAL_PATTERN = /\b(?:bp|blood pressure)[:\s]+(\d{2,3})[/\\](\d{2,3})|spo2[:\s]+(\d{2,3})%?|temp(?:erature)?[:\s]+(\d{2,3}(?:\.\d)?)[°℃℉]?[CF]?|pulse[:\s]+(\d{2,3})/gi;

// ─── Negation words ──────────────────────────────────────────
const NEGATION_PATTERN = /\b(no|not|without|deny|denies|denying|absent|negative for|rules out)\b\s+\w{0,30}\s*$/i;

class MedicalNlpService {

  /**
   * Main entry point: extract entities from clinical text.
   * @param {string} text - Raw clinical text
   * @param {number} patientId
   * @param {string} source - 'chat' | 'scribe' | 'report'
   * @param {string} sourceId - conversation_id or scribe session id
   * @param {string} tenantId
   * @returns {Promise<Array>} Extracted entities
   */
  async extract(text, patientId, source = 'chat', sourceId = null, tenantId = null) {
    if (!text || text.trim().length < 10) return [];

    const entities = [];

    // Stage 1: Rule-based extraction (fast, no cost)
    entities.push(...this._extractSymptoms(text));
    entities.push(...this._extractDiagnoses(text));
    entities.push(...this._extractMedications(text));
    entities.push(...this._extractVitals(text));

    // Stage 2: LLM extraction for complex entities
    try {
      const llmEntities = await this._extractWithLLM(text);
      // Merge, deduplicate by normalized_name + entity_type
      const existing = new Set(entities.map(e => `${e.entity_type}:${e.normalized_name}`));
      for (const e of llmEntities) {
        const key = `${e.entity_type}:${e.normalized_name}`;
        if (!existing.has(key)) {
          entities.push(e);
          existing.add(key);
        }
      }
    } catch (err) {
      console.warn('[NLP] LLM extraction failed, using rule-based only:', err.message);
    }

    if (entities.length === 0) return [];

    // Stage 3: Build FHIR resources + persist
    const persisted = await this._persist(entities, patientId, source, sourceId, tenantId);
    return persisted;
  }

  // ─── Rule-based extractors ────────────────────────────────

  _extractSymptoms(text) {
    const entities = [];
    for (const { pattern, name, icd10 } of SYMPTOM_PATTERNS) {
      const match = text.match(pattern);
      if (!match) continue;
      const negated = this._isNegated(text, match.index);
      entities.push({
        entity_type: 'symptom', entity_text: match[0], normalized_name: name,
        icd10_code: icd10, confidence: 0.85, negated,
        attributes: { source: 'rule_based' },
      });
    }
    return entities;
  }

  _extractDiagnoses(text) {
    const entities = [];
    for (const { pattern, name, icd10 } of DIAGNOSIS_PATTERNS) {
      const match = text.match(pattern);
      if (!match) continue;
      const negated = this._isNegated(text, match.index);
      entities.push({
        entity_type: 'diagnosis', entity_text: match[0], normalized_name: name,
        icd10_code: icd10, confidence: 0.88, negated,
        attributes: { source: 'rule_based' },
      });
    }
    return entities;
  }

  _extractMedications(text) {
    const entities = [];
    for (const { pattern, name, rxnorm } of MEDICATION_PATTERNS) {
      const match = text.match(pattern);
      if (!match) continue;
      // Try to extract dosage and frequency near the medication name
      const context = text.substring(Math.max(0, match.index - 10), match.index + 80);
      const dosage    = context.match(/(\d+(?:\.\d+)?)\s*(?:mg|mcg|ml|iu|units?)/i)?.[0] || null;
      const frequency = context.match(/\b(once|twice|thrice|od|bd|tds|qid|daily|every \d+ hours)\b/i)?.[0] || null;
      entities.push({
        entity_type: 'medication', entity_text: match[0], normalized_name: name,
        rxnorm_code: rxnorm, confidence: 0.90, negated: false,
        attributes: { dosage, frequency, source: 'rule_based' },
      });
    }
    return entities;
  }

  _extractVitals(text) {
    const entities = [];
    let match;
    const re = new RegExp(VITAL_PATTERN.source, 'gi');
    while ((match = re.exec(text)) !== null) {
      const raw = match[0];
      let name = 'Vital sign', value = raw;
      if (/bp|blood pressure/i.test(raw))  { name = 'Blood Pressure'; }
      else if (/spo2/i.test(raw))           { name = 'SpO2'; }
      else if (/temp/i.test(raw))           { name = 'Temperature'; }
      else if (/pulse/i.test(raw))          { name = 'Pulse'; }
      entities.push({
        entity_type: 'vital', entity_text: raw, normalized_name: name,
        icd10_code: null, confidence: 0.92, negated: false,
        attributes: { raw_value: value, source: 'rule_based' },
      });
    }
    return entities;
  }

  _isNegated(text, matchIndex) {
    const preceding = text.substring(Math.max(0, matchIndex - 60), matchIndex);
    return NEGATION_PATTERN.test(preceding);
  }

  // ─── LLM-based extraction ─────────────────────────────────

  async _extractWithLLM(text) {
    const prompt = `You are a clinical NLP system. Extract all medical entities from the text below.
Return ONLY a JSON array. Each item must have:
  entity_type: "symptom"|"diagnosis"|"medication"|"procedure"|"allergy"|"lab"|"vital"|"severity"
  entity_text: exact text fragment
  normalized_name: standard medical term
  icd10_code: ICD-10 code if known, else null
  rxnorm_code: RxNorm code for drugs if known, else null
  negated: true if negated (e.g. "no fever"), else false
  attributes: { dosage, frequency, duration, severity, laterality } — only fields present in text
  confidence: 0.0-1.0

Clinical text:
"""${text.substring(0, 1500)}"""

JSON array:`;

    const response = await llmProvider.chat({
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 1200,
      temperature: 0.1,
    });

    const raw = response?.content || response?.choices?.[0]?.message?.content || '';
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.filter(e => e.entity_type && e.normalized_name).map(e => ({
      ...e,
      confidence: Math.min(1, Math.max(0, parseFloat(e.confidence) || 0.75)),
      attributes: { ...e.attributes, source: 'llm' },
    }));
  }

  // ─── FHIR R4 resource builder ─────────────────────────────

  _buildFHIR(entity, patientId) {
    const base = {
      resourceType: null,
      id: `mediqzy-${patientId}-${Date.now()}`,
      status: entity.negated ? 'refuted' : 'active',
      subject: { reference: `Patient/${patientId}` },
      recordedDate: new Date().toISOString(),
    };

    switch (entity.entity_type) {
      case 'symptom':
      case 'diagnosis':
        base.resourceType = 'Condition';
        base.code = {
          coding: [{
            system: 'http://hl7.org/fhir/sid/icd-10',
            code: entity.icd10_code,
            display: entity.normalized_name,
          }],
          text: entity.entity_text,
        };
        base.clinicalStatus = { coding: [{ code: entity.negated ? 'resolved' : 'active' }] };
        break;

      case 'medication':
        base.resourceType = 'MedicationStatement';
        base.medication = {
          coding: [{
            system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
            code: entity.rxnorm_code,
            display: entity.normalized_name,
          }],
        };
        base.dosage = entity.attributes?.dosage ? [{ text: entity.attributes.dosage }] : [];
        break;

      case 'allergy':
        base.resourceType = 'AllergyIntolerance';
        base.code = { text: entity.normalized_name };
        base.type = 'allergy';
        break;

      case 'vital':
        base.resourceType = 'Observation';
        base.code = { text: entity.normalized_name };
        base.valueString = entity.attributes?.raw_value;
        break;

      default:
        base.resourceType = 'Observation';
        base.code = { text: entity.normalized_name };
    }

    return base;
  }

  // ─── Persistence ──────────────────────────────────────────

  async _persist(entities, patientId, source, sourceId, tenantId) {
    const db = pool;
    const persisted = [];

    for (const entity of entities) {
      try {
        const fhir = this._buildFHIR(entity, patientId);
        const { rows: [row] } = await db.query(`
          INSERT INTO medical_entities
            (patient_id, tenant_id, source, source_id, entity_type, entity_text,
             normalized_name, icd10_code, rxnorm_code, attributes, confidence,
             negated, fhir_resource, extracted_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
          ON CONFLICT DO NOTHING
          RETURNING id, entity_type, normalized_name, icd10_code, negated
        `, [
          patientId, tenantId, source, sourceId,
          entity.entity_type, entity.entity_text, entity.normalized_name,
          entity.icd10_code || null, entity.rxnorm_code || null,
          JSON.stringify(entity.attributes || {}),
          entity.confidence, entity.negated || false,
          JSON.stringify(fhir),
        ]);
        if (row) persisted.push(row);
      } catch (err) {
        console.error('[NLP] Persist entity error:', err.message);
      }
    }

    return persisted;
  }

  /**
   * Retrieve all entities for a patient (structured summary).
   */
  async getPatientEntities(patientId, days = 90) {
    const { rows } = await pool.query(`
      SELECT entity_type, normalized_name, icd10_code, rxnorm_code,
             attributes, confidence, negated, extracted_at, source
      FROM medical_entities
      WHERE patient_id = $1 AND extracted_at > NOW() - ($2 || ' days')::interval
      ORDER BY extracted_at DESC
    `, [patientId, days]);

    // Group by type
    const grouped = {};
    for (const row of rows) {
      if (!grouped[row.entity_type]) grouped[row.entity_type] = [];
      grouped[row.entity_type].push(row);
    }
    return grouped;
  }

  /**
   * Export a patient's entities as a FHIR R4 Bundle.
   */
  async getFHIRBundle(patientId) {
    const { rows } = await pool.query(
      `SELECT fhir_resource FROM medical_entities WHERE patient_id = $1 AND negated = FALSE ORDER BY extracted_at DESC LIMIT 200`,
      [patientId]
    );
    return {
      resourceType: 'Bundle',
      type: 'collection',
      timestamp: new Date().toISOString(),
      entry: rows.map(r => ({ resource: r.fhir_resource })),
    };
  }
}

const medicalNlpService = new MedicalNlpService();
export default medicalNlpService;
