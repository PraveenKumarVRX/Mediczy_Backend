/**
 * Wellness Tools — 3 tools for health risk, goals, and logging
 * get_health_risk_score, get_wellness_goals, log_wellness_data
 */

import pool from '../../../db/pgPool.js';
import { register } from './index.js';

// ─── 1. Get Health Risk Score ──────────────────────────────

register({
  name: 'get_health_risk_score',
  description: 'Get the patient\'s AI-computed health risk score (1-10) with subscores for diabetes, cardiac, lifestyle, etc. Also returns risk factors and recommendations.',
  category: 'wellness',
  parameters: {
    type: 'object',
    properties: {
      patient_id: { type: 'string', description: 'Patient ID (number)' }
    },
    required: []
  },
  async execute(params, ctx) {
    const db = pool;
    const patientId = Number(params.patient_id) || ctx.userId;

    const { rows } = await db.query(
      `SELECT * FROM ai_health_risk_scores WHERE patient_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [patientId]
    );

    if (rows.length === 0) {
      return {
        message: 'No health risk assessment available yet. A risk score is generated from vitals, lab results, and health history.',
        patient_id: patientId,
        riskScore: null
      };
    }

    const score = rows[0];
    return {
      overallScore: score.overall_score,
      riskLevel: score.risk_level,
      subscores: score.subscores,
      riskFactors: score.risk_factors,
      recommendations: score.recommendations,
      modelVersion: score.model_version,
      lastUpdated: score.updated_at
    };
  }
});

// ─── 2. Get Wellness Goals ─────────────────────────────────

register({
  name: 'get_wellness_goals',
  description: 'Get the patient\'s active wellness goals (steps, sleep, exercise, water, meditation, nutrition, weight, screening) with progress and streaks.',
  category: 'wellness',
  parameters: {
    type: 'object',
    properties: {
      patient_id: { type: 'string', description: 'Patient ID (number)' },
      include_completed: { type: 'boolean', description: 'Include completed goals (default false)' }
    },
    required: []
  },
  async execute(params, ctx) {
    const db = pool;
    const patientId = Number(params.patient_id) || ctx.userId;
    const includeCompleted = params.include_completed || false;

    const statusFilter = includeCompleted ? '' : `AND status = 'active'`;

    const { rows } = await db.query(
      `SELECT id, goal_type, title, target_value, target_unit, current_value,
              frequency, start_date, end_date, status, streak_days, metadata
       FROM ai_wellness_goals
       WHERE patient_id = $1 ${statusFilter}
       ORDER BY created_at DESC`,
      [patientId]
    );

    // Also get recent logs for progress
    const { rows: recentLogs } = await db.query(
      `SELECT metric_type, value, unit, log_date, notes
       FROM ai_wellness_logs
       WHERE patient_id = $1 AND log_date >= CURRENT_DATE - INTERVAL '7 days'
       ORDER BY log_date DESC
       LIMIT 20`,
      [patientId]
    );

    return {
      goals: rows.map(g => ({
        id: g.id,
        type: g.goal_type,
        title: g.title,
        target: `${g.target_value} ${g.target_unit || ''}`,
        current: g.current_value,
        progress: g.target_value > 0 ? Math.round((g.current_value / g.target_value) * 100) : 0,
        streak: g.streak_days,
        frequency: g.frequency,
        status: g.status,
        startDate: g.start_date,
        endDate: g.end_date
      })),
      recentLogs,
      goalCount: rows.length
    };
  }
});

// ─── 3. Log Wellness Data (write tool) ─────────────────────

register({
  name: 'log_wellness_data',
  description: 'Log a daily wellness data entry (steps walked, sleep hours, water intake, exercise minutes, weight, etc.). This is a WRITE operation.',
  category: 'wellness',
  isWrite: true,
  parameters: {
    type: 'object',
    properties: {
      metric_type: { type: 'string', description: 'Type: steps, sleep_hours, water_ml, exercise_min, weight_kg, blood_pressure, blood_sugar, heart_rate' },
      value: { type: 'string', description: 'Numeric value (as a number)' },
      unit: { type: 'string', description: 'Unit of measurement' },
      notes: { type: 'string', description: 'Optional notes' },
      date: { type: 'string', description: 'Date (YYYY-MM-DD), defaults to today' }
    },
    required: ['metric_type', 'value']
  },
  async execute(params, ctx) {
    const db = pool;
    const patientId = ctx.userId;
    if (!patientId) return { error: 'Authentication required' };

    const logDate = params.date || new Date().toISOString().split('T')[0];
    const numericValue = Number(params.value);
    if (isNaN(numericValue)) return { error: 'Invalid numeric value' };

    // Find matching goal
    const { rows: goals } = await db.query(
      `SELECT id FROM ai_wellness_goals
       WHERE patient_id = $1 AND goal_type = $2 AND status = 'active'
       LIMIT 1`,
      [patientId, params.metric_type]
    );

    const { rows: [log] } = await db.query(
      `INSERT INTO ai_wellness_logs (patient_id, goal_id, log_date, metric_type, value, unit, notes, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'ai_bot')
       RETURNING id, log_date, metric_type, value`,
      [
        patientId,
        goals[0]?.id || null,
        logDate,
        params.metric_type,
        numericValue,
        params.unit || null,
        params.notes || null
      ]
    );

    // Update goal progress if applicable
    if (goals[0]) {
      await db.query(
        `UPDATE ai_wellness_goals SET current_value = current_value + $1, updated_at = NOW() WHERE id = $2`,
        [numericValue, goals[0].id]
      );
    }

    return {
      success: true,
      logId: log.id,
      metric: log.metric_type,
      value: log.value,
      date: log.log_date,
      message: `Logged ${numericValue} ${params.unit || params.metric_type} for ${logDate}`
    };
  }
});
