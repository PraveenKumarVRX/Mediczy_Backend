/**
 * Daily Health Score Routes
 * POST /api/health-score/log    — Log today's health data (triggers real-time score update)
 * GET  /api/health-score/today  — Get today's score
 * GET  /api/health-score/history?days=7 — Score history
 */

import express from 'express';
import { postgresSequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';
import { authUser } from '../middleware/auth.middleware.js';
import dailyHealthScoreService, { computeDailyScore, ensureTables, enrichLogDataFromDiary } from '../services/daily-health-score.service.js';

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/health-score/log
// Log today's health data and immediately recompute score
// ─────────────────────────────────────────────────────────────────────────────
router.post('/log', authUser, async (req, res) => {
  try {
    await ensureTables();
    const userId = req.user.id;
    const today  = new Date().toISOString().split('T')[0];

    const {
      // Physical activity
      steps, stairs, exercise_type, exercise_minutes, calories_burned,
      // Nutrition
      calories_consumed, diet_quality,
      // Sleep
      sleep_hours, sleep_quality,
      // Vitals
      heart_rate, blood_pressure_systolic, blood_pressure_diastolic,
      spo2, temperature, weight, blood_sugar,
      // Hydration
      water_glasses,
      // Medication adherence
      medication_adherence_pct, medication_doses_taken, medication_doses_prescribed,
      // Mental health
      stress_score, mood_score,
      // Meta
      notes, source,
    } = req.body;

    // Upsert into daily_activity
    await postgresSequelize.query(`
      INSERT INTO daily_activity (
        user_id, date,
        steps, stairs, calories_burned, calories_consumed,
        exercise_type, exercise_minutes,
        sleep_hours, sleep_quality,
        heart_rate, blood_pressure_systolic, blood_pressure_diastolic,
        spo2, temperature, weight, blood_sugar,
        water_glasses, diet_quality,
        medication_adherence_pct, medication_doses_taken, medication_doses_prescribed,
        stress_score, mood_score,
        notes, source, updated_at
      ) VALUES (
        :userId, :today,
        :steps, :stairs, :caloriesBurned, :caloriesConsumed,
        :exerciseType, :exerciseMinutes,
        :sleepHours, :sleepQuality,
        :heartRate, :bpSystolic, :bpDiastolic,
        :spo2, :temperature, :weight, :bloodSugar,
        :waterGlasses, :dietQuality,
        :medPct, :medTaken, :medPrescribed,
        :stressScore, :moodScore,
        :notes, :source, NOW()
      )
      ON CONFLICT (user_id, date) DO UPDATE SET
        steps                      = COALESCE(EXCLUDED.steps,                      daily_activity.steps),
        stairs                     = COALESCE(EXCLUDED.stairs,                     daily_activity.stairs),
        calories_burned            = COALESCE(EXCLUDED.calories_burned,            daily_activity.calories_burned),
        calories_consumed          = COALESCE(EXCLUDED.calories_consumed,          daily_activity.calories_consumed),
        exercise_type              = COALESCE(EXCLUDED.exercise_type,              daily_activity.exercise_type),
        exercise_minutes           = COALESCE(EXCLUDED.exercise_minutes,           daily_activity.exercise_minutes),
        sleep_hours                = COALESCE(EXCLUDED.sleep_hours,                daily_activity.sleep_hours),
        sleep_quality              = COALESCE(EXCLUDED.sleep_quality,              daily_activity.sleep_quality),
        heart_rate                 = COALESCE(EXCLUDED.heart_rate,                 daily_activity.heart_rate),
        blood_pressure_systolic    = COALESCE(EXCLUDED.blood_pressure_systolic,    daily_activity.blood_pressure_systolic),
        blood_pressure_diastolic   = COALESCE(EXCLUDED.blood_pressure_diastolic,   daily_activity.blood_pressure_diastolic),
        spo2                       = COALESCE(EXCLUDED.spo2,                       daily_activity.spo2),
        temperature                = COALESCE(EXCLUDED.temperature,                daily_activity.temperature),
        weight                     = COALESCE(EXCLUDED.weight,                     daily_activity.weight),
        blood_sugar                = COALESCE(EXCLUDED.blood_sugar,                daily_activity.blood_sugar),
        water_glasses              = COALESCE(EXCLUDED.water_glasses,              daily_activity.water_glasses),
        diet_quality               = COALESCE(EXCLUDED.diet_quality,              daily_activity.diet_quality),
        medication_adherence_pct   = COALESCE(EXCLUDED.medication_adherence_pct,  daily_activity.medication_adherence_pct),
        medication_doses_taken     = COALESCE(EXCLUDED.medication_doses_taken,    daily_activity.medication_doses_taken),
        medication_doses_prescribed= COALESCE(EXCLUDED.medication_doses_prescribed, daily_activity.medication_doses_prescribed),
        stress_score               = COALESCE(EXCLUDED.stress_score,              daily_activity.stress_score),
        mood_score                 = COALESCE(EXCLUDED.mood_score,                daily_activity.mood_score),
        notes                      = COALESCE(EXCLUDED.notes,                     daily_activity.notes),
        source                     = COALESCE(EXCLUDED.source,                    daily_activity.source),
        updated_at                 = NOW()
    `, {
      replacements: {
        userId, today,
        steps:            steps            ?? null,
        stairs:           stairs           ?? null,
        caloriesBurned:   calories_burned  ?? null,
        caloriesConsumed: calories_consumed ?? null,
        exerciseType:     exercise_type    ?? null,
        exerciseMinutes:  exercise_minutes ?? null,
        sleepHours:       sleep_hours      ?? null,
        sleepQuality:     sleep_quality    ?? null,
        heartRate:        heart_rate       ?? null,
        bpSystolic:       blood_pressure_systolic  ?? null,
        bpDiastolic:      blood_pressure_diastolic ?? null,
        spo2:             spo2             ?? null,
        temperature:      temperature      ?? null,
        weight:           weight           ?? null,
        bloodSugar:       blood_sugar      ?? null,
        waterGlasses:     water_glasses    ?? null,
        dietQuality:      diet_quality     ?? null,
        medPct:           medication_adherence_pct ?? null,
        medTaken:         medication_doses_taken    ?? null,
        medPrescribed:    medication_doses_prescribed ?? null,
        stressScore:      stress_score     ?? null,
        moodScore:        mood_score       ?? null,
        notes:            notes            ?? null,
        source:           source           ?? 'manual',
      },
    });

    // Fetch user profile — DOB for precise daily age, most-recent weight
    const [profile] = await postgresSequelize.query(`
      SELECT
        u."dateOfBirth" AS "dateOfBirth",
        COALESCE(ha.gender, u.gender, 'other') AS gender,
        ha.height,
        COALESCE(
          (SELECT weight FROM daily_activity
           WHERE user_id = u.id AND weight IS NOT NULL
           ORDER BY date DESC LIMIT 1),
          ha.weight
        ) AS weight
      FROM users u
      LEFT JOIN user_health_assessments ha
        ON ha.user_id = u.id
        AND ha.id = (SELECT id FROM user_health_assessments WHERE user_id = u.id ORDER BY created_at DESC LIMIT 1)
      WHERE u.id = :userId
    `, { replacements: { userId }, type: QueryTypes.SELECT });

    // Fetch full log for today (merged)
    const [fullLog] = await postgresSequelize.query(
      `SELECT * FROM daily_activity WHERE user_id = :userId AND date = :today LIMIT 1`,
      { replacements: { userId, today }, type: QueryTypes.SELECT }
    );

    // Merge diary + lab report values; explicit daily_activity data wins
    const diaryEnrichment = await enrichLogDataFromDiary(userId, today);
    const mergedLog = Object.assign({}, diaryEnrichment);
    for (const [k, v] of Object.entries(fullLog || {})) {
      if (v !== null && v !== undefined) mergedLog[k] = v;
    }

    const result = await dailyHealthScoreService.computeForUser(
      userId, today, mergedLog, profile || {}
    );

    res.json({
      success: true,
      message: 'Health log saved and score updated',
      score: result.score,
      domains: result.domains,
      targets: result.targets,
      ageBand: result.ageBand,
      dataQuality: result.dataQuality,
      date:    today,
    });
  } catch (err) {
    console.error('health-score/log error:', err);
    res.status(500).json({ success: false, message: 'Failed to save health log', error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/health-score/today
// Returns today's pre-computed score (falls back to computing on the fly)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/today', authUser, async (req, res) => {
  try {
    await ensureTables();
    const userId = req.user.id;
    const today  = new Date().toISOString().split('T')[0];

    // Try pre-computed score
    const [stored] = await postgresSequelize.query(`
      SELECT * FROM daily_health_scores
      WHERE user_id = :userId AND score_date = :today
    `, { replacements: { userId, today }, type: QueryTypes.SELECT });

    if (stored) {
      return res.json({
        success: true,
        date:    today,
        score:   ['insufficient', 'partial'].includes(stored.targets?.dataQuality?.status)
          ? null
          : stored.composite_score,
        domains: {
          activity:   stored.activity_score,
          nutrition:  stored.nutrition_score,
          sleep:      stored.sleep_score,
          vitals:     stored.vitals_score,
          medication: stored.medication_score,
          hydration:  stored.hydration_score,
          mental:     stored.mental_score,
        },
        targets:    stored.targets,
        ageBand:    stored.age_band,
        computedAt: stored.computed_at,
        source:     'precomputed',
        dataQuality: stored.targets?.dataQuality || { status: 'unknown', observedDomains: [] },
      });
    }

    // Compute on-the-fly from today's log + diary enrichment (if the cron hasn't run yet)
    const [log] = await postgresSequelize.query(
      `SELECT * FROM daily_activity WHERE user_id = :userId AND date = :today LIMIT 1`,
      { replacements: { userId, today }, type: QueryTypes.SELECT }
    );

    const [profile] = await postgresSequelize.query(`
      SELECT
        u."dateOfBirth" AS "dateOfBirth",
        COALESCE(ha.gender, u.gender, 'other') AS gender,
        ha.height,
        COALESCE(
          (SELECT weight FROM daily_activity
           WHERE user_id = u.id AND weight IS NOT NULL
           ORDER BY date DESC LIMIT 1),
          ha.weight
        ) AS weight
      FROM users u
      LEFT JOIN user_health_assessments ha
        ON ha.user_id = u.id
        AND ha.id = (SELECT id FROM user_health_assessments WHERE user_id = u.id ORDER BY created_at DESC LIMIT 1)
      WHERE u.id = :userId
    `, { replacements: { userId }, type: QueryTypes.SELECT });

    // Enrich with health diary and recent lab report values
    const diaryEnrichment = await enrichLogDataFromDiary(userId, today);
    const mergedLog = Object.assign({}, diaryEnrichment);
    for (const [k, v] of Object.entries(log || {})) {
      if (v !== null && v !== undefined) mergedLog[k] = v;
    }

    const result = computeDailyScore(mergedLog, profile || {}, today);

    res.json({
      success: true,
      date:    today,
      score:   result.score,
      domains: result.domains,
      targets: result.targets,
      ageBand: result.ageBand,
      source:  'realtime',
      dataQuality: result.dataQuality,
    });
  } catch (err) {
    console.error('health-score/today error:', err);
    res.status(500).json({ success: false, message: 'Failed to get health score', error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/health-score/history?days=7
// ─────────────────────────────────────────────────────────────────────────────
router.get('/history', authUser, async (req, res) => {
  try {
    await ensureTables();
    const userId = req.user.id;
    const days   = Math.min(90, parseInt(req.query.days) || 7);

    const rows = await postgresSequelize.query(`
      SELECT
        score_date, composite_score,
        activity_score, nutrition_score, sleep_score,
        vitals_score, medication_score, hydration_score, mental_score,
        age_band, targets, computed_at
      FROM daily_health_scores
      WHERE user_id = :userId
        AND score_date >= CURRENT_DATE - INTERVAL '${days} days'
      ORDER BY score_date ASC
    `, { replacements: { userId }, type: QueryTypes.SELECT });

    res.json({
      success: true,
      days,
      history: rows.map(r => ({
        date:    r.score_date,
        score:   r.composite_score,
        domains: {
          activity:   r.activity_score,
          nutrition:  r.nutrition_score,
          sleep:      r.sleep_score,
          vitals:     r.vitals_score,
          medication: r.medication_score,
          hydration:  r.hydration_score,
          mental:     r.mental_score,
        },
        ageBand: r.age_band,
      })),
    });
  } catch (err) {
    console.error('health-score/history error:', err);
    res.status(500).json({ success: false, message: 'Failed to get history', error: err.message });
  }
});

export default router;
