/**
 * AI Intelligence Tools — Brain-callable tools for intelligent features
 * =====================================================================
 * Registers tools that the Brain orchestrator can invoke during conversations:
 *   - check_drug_interactions: Check drug-drug/drug-allergy interactions
 *   - emergency_triage: ESI-5 emergency assessment
 *   - get_health_risk_score: Get patient's health risk score
 *   - insurance_query: Ask insurance-related questions
 *   - get_clinical_insights: Get clinical insights for a patient
 *   - get_smart_notifications: Get AI-generated notifications
 */

import { register } from './index.js';
import drugInteractionChecker from '../../ai-drug-interaction.service.js';
import emergencyTriageService from '../../ai-emergency-triage.service.js';
import insuranceBotService from '../../ai-insurance-bot.service.js';
import pool from '../../../db/pgPool.js';
import hisScoreService from '../../ai-his-score.service.js';
import medicalNlpService from '../../ai-medical-nlp.service.js';

// ─── Drug Interaction Check Tool ────────────────────────────
register({
  name: 'check_drug_interactions',
  description: 'Check for drug-drug interactions, drug-allergy conflicts, and drug-condition contraindications. Use when a patient asks about medication safety, or when reviewing a prescription with multiple drugs.',
  category: 'clinical',
  parameters: {
    type: 'object',
    properties: {
      medications: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of medication/drug names to check for interactions'
      },
      patient_id: {
        type: 'number',
        description: 'Optional patient ID to include their existing medications, allergies, and conditions in the check'
      }
    },
    required: ['medications']
  },
  execute: async (params, context) => {
    const result = await drugInteractionChecker.checkInteractions({
      medications: params.medications,
      patientId: params.patient_id || null,
      useLLM: false // Quick check within Brain to avoid double-LLM
    });

    return {
      safe: result.safe,
      severity: result.severity,
      interactionCount: result.interactions.length,
      interactions: result.interactions.slice(0, 10),
      summary: result.summary,
      drugsChecked: result.drugsChecked
    };
  }
});

// ─── Emergency Triage Tool ──────────────────────────────────
register({
  name: 'emergency_triage',
  description: 'Perform ESI 5-Level emergency triage assessment based on symptoms and vitals. Use when a patient describes emergency symptoms, severe pain, or when urgent care assessment is needed.',
  category: 'emergency',
  parameters: {
    type: 'object',
    properties: {
      symptoms: {
        type: 'string',
        description: 'Patient symptoms and chief complaint description'
      },
      pain_scale: {
        type: 'number',
        description: 'Pain level on 0-10 scale'
      },
      vitals: {
        type: 'object',
        description: 'Vital signs: systolic, diastolic, heart_rate, oxygen_saturation, temperature, respiratory_rate',
        properties: {
          systolic: { type: 'number' },
          diastolic: { type: 'number' },
          heart_rate: { type: 'number' },
          oxygen_saturation: { type: 'number' },
          temperature: { type: 'number' },
          respiratory_rate: { type: 'number' }
        }
      }
    },
    required: ['symptoms']
  },
  execute: async (params, context) => {
    const result = await emergencyTriageService.triage({
      symptoms: params.symptoms,
      vitals: params.vitals || {},
      painScale: params.pain_scale || null,
      patientId: context.userId || null
    });

    return {
      esiLevel: result.esiLevel,
      description: result.esiDescription,
      category: result.category,
      specialty: result.specialty,
      ambulanceNeeded: result.ambulanceNeeded,
      immediateActions: result.immediateActions,
      estimatedWaitMinutes: result.estimatedWaitMinutes,
      redFlags: result.redFlagsDetected.map(rf => rf.category)
    };
  }
});

// ─── Health Risk Score Tool ─────────────────────────────────
register({
  name: 'get_health_risk_score',
  description: 'Get the AI-computed health risk score for a patient. Shows overall risk level, subscores (cardiovascular, diabetes, hypertension, medication adherence, lifestyle), risk factors, and personalized recommendations.',
  category: 'clinical',
  parameters: {
    type: 'object',
    properties: {
      patient_id: {
        type: 'number',
        description: 'Patient ID to look up risk score for'
      }
    },
    required: []
  },
  execute: async (params, context) => {
    const db = pool;
    
    // If no patient_id, try to find from user context
    let patientId = params.patient_id;
    if (!patientId && context.userId) {
      try {
        const { rows } = await db.query('SELECT id FROM patients WHERE "userId" = $1', [context.userId]);
        if (rows.length > 0) patientId = rows[0].id;
      } catch { /* continue */ }
    }

    if (!patientId) {
      return { error: 'No patient ID available. Please specify a patient.' };
    }

    try {
      const { rows } = await db.query(`
        SELECT * FROM ai_health_risk_scores WHERE patient_id = $1
        ORDER BY updated_at DESC LIMIT 1
      `, [patientId]);

      if (rows.length === 0) {
        return { message: 'No health risk score available yet for this patient. Scores are computed every 6 hours.' };
      }

      const score = rows[0];
      return {
        overallScore: score.overall_score,
        riskLevel: score.risk_level,
        subscores: score.subscores,
        riskFactors: score.risk_factors,
        recommendations: score.recommendations,
        lastUpdated: score.updated_at,
        validUntil: score.valid_until,
        modelVersion: score.model_version
      };
    } catch (err) {
      return { error: 'Failed to retrieve risk score: ' + err.message };
    }
  }
});

// ─── Insurance Query Tool ───────────────────────────────────
register({
  name: 'insurance_query',
  description: 'Query the AI insurance advisor about health insurance coverage, claims, pre-authorization, policy terms, or network hospitals. Uses specialized insurance AI model when available.',
  category: 'insurance',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The insurance-related question to ask'
      },
      insurance_type: {
        type: 'string',
        description: 'Type of insurance: health, life, dental, travel',
        enum: ['health', 'life', 'dental', 'travel']
      }
    },
    required: ['query']
  },
  execute: async (params, context) => {
    const result = await insuranceBotService.query({
      query: params.query,
      userId: context.userId,
      insuranceType: params.insurance_type || 'health'
    });

    return {
      response: result.response,
      source: result.source,
      disclaimer: 'This is AI-generated insurance guidance. Please verify with your insurance provider for binding decisions.'
    };
  }
});

// ─── Clinical Insights Tool ────────────────────────────────
register({
  name: 'get_clinical_insights',
  description: 'Get AI-generated clinical insights for a patient including vitals trends, medication adherence alerts, comorbidity risks, and preventive care recommendations.',
  category: 'clinical',
  parameters: {
    type: 'object',
    properties: {
      patient_id: {
        type: 'number',
        description: 'Patient ID to get insights for'
      },
      insight_type: {
        type: 'string',
        description: 'Filter by insight type: trend_alert, adherence_gap, comorbidity_risk, preventive_care, readmission_risk',
        enum: ['trend_alert', 'adherence_gap', 'comorbidity_risk', 'preventive_care', 'readmission_risk']
      }
    },
    required: []
  },
  execute: async (params, context) => {
    const db = pool;

    let patientId = params.patient_id;
    if (!patientId && context.userId) {
      try {
        const { rows } = await db.query('SELECT id FROM patients WHERE "userId" = $1', [context.userId]);
        if (rows.length > 0) patientId = rows[0].id;
      } catch { /* continue */ }
    }

    if (!patientId) {
      return { message: 'No patient ID available.' };
    }

    try {
      let query = `
        SELECT insight_type, title, description, severity, is_actionable, created_at
        FROM ai_clinical_insights
        WHERE target_type = 'patient' AND target_id = $1
          AND (expires_at IS NULL OR expires_at > NOW())
      `;
      const params_arr = [patientId];

      if (params.insight_type) {
        query += ' AND insight_type = $2';
        params_arr.push(params.insight_type);
      }

      query += ' ORDER BY created_at DESC LIMIT 10';

      const { rows } = await db.query(query, params_arr);
      return {
        insightCount: rows.length,
        insights: rows,
        message: rows.length === 0 ? 'No clinical insights available for this patient.' : undefined
      };
    } catch (err) {
      return { error: 'Failed to retrieve insights: ' + err.message };
    }
  }
});

// ─── Smart Notifications Tool ───────────────────────────────
register({
  name: 'get_smart_notifications',
  description: 'Get AI-generated smart notifications for the current user. These include medication reminders, health alerts, wellness nudges, and follow-up reminders.',
  category: 'notifications',
  parameters: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        description: 'Filter by status: pending, sent, read',
        enum: ['pending', 'sent', 'read']
      },
      limit: {
        type: 'number',
        description: 'Maximum number of notifications to return (default: 10)'
      }
    },
    required: []
  },
  execute: async (params, context) => {
    const db = pool;
    const limit = params.limit || 10;

    try {
      let query = `SELECT notification_type, title, message, priority, status, created_at
                    FROM ai_smart_notifications WHERE user_id = $1`;
      const queryParams = [context.userId];

      if (params.status) {
        query += ' AND status = $2';
        queryParams.push(params.status);
      }

      query += ` ORDER BY created_at DESC LIMIT $${queryParams.length + 1}`;
      queryParams.push(limit);

      const { rows } = await db.query(query, queryParams);
      return {
        count: rows.length,
        notifications: rows,
        message: rows.length === 0 ? 'No smart notifications at this time.' : undefined
      };
    } catch (err) {
      return { error: 'Failed to retrieve notifications: ' + err.message };
    }
  }
});

// ─── HIS Score Tool ──────────────────────────────────────────
register({
  name: 'get_his_score',
  description: "Get a patient's Mediqzy Health Intelligence Score (HIS) — a single 0-100 composite score summarizing overall health status, risk tier, and 6 clinical dimensions. Use when discussing a patient's overall health, risk level, or when explaining health progress over time.",
  category: 'clinical',
  parameters: {
    type: 'object',
    properties: {
      patient_id: { type: 'number', description: 'Patient ID to get HIS score for' },
    },
    required: ['patient_id'],
  },
  execute: async (params) => {
    try {
      const score = await hisScoreService.getScore(params.patient_id, false);
      if (!score) return { message: 'No HIS score computed yet for this patient.' };
      return {
        his_score: score.his_score,
        risk_tier: score.risk_tier,
        trend: score.trend_direction,
        predicted_30d: score.predicted_30d_score,
        percentile_rank: score.percentile_rank,
        subscores: score.subscores,
        computed_at: score.computed_at,
      };
    } catch (err) {
      return { error: 'Failed to retrieve HIS score: ' + err.message };
    }
  },
});

// ─── Medical Entities Tool ───────────────────────────────────
register({
  name: 'get_medical_entities',
  description: "Get structured medical entities (symptoms, diagnoses, medications, allergies, vitals) extracted from a patient's clinical history. Use to understand what conditions, drugs, or symptoms have been documented for a patient.",
  category: 'clinical',
  parameters: {
    type: 'object',
    properties: {
      patient_id: { type: 'number', description: 'Patient ID' },
      days: { type: 'number', description: 'Look-back period in days (default 90)' },
    },
    required: ['patient_id'],
  },
  execute: async (params) => {
    try {
      const entities = await medicalNlpService.getPatientEntities(params.patient_id, params.days || 90);
      const summary = {};
      for (const [type, list] of Object.entries(entities)) {
        summary[type] = list
          .filter(e => !e.negated)
          .map(e => e.normalized_name)
          .filter((v, i, arr) => arr.indexOf(v) === i) // deduplicate
          .slice(0, 10);
      }
      return { entities: summary, total: Object.values(summary).flat().length };
    } catch (err) {
      return { error: 'Failed to retrieve medical entities: ' + err.message };
    }
  },
});

