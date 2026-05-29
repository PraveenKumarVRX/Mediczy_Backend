import express from 'express';
import { postgresSequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';
import { authUser } from '../middleware/auth.middleware.js';

const router = express.Router();

// ── Ensure table ─────────────────────────────────────────
let tableReady = false;
async function ensureTable() {
  if (tableReady) return;
  await postgresSequelize.query(`
    CREATE TABLE IF NOT EXISTS daily_activity (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      date DATE NOT NULL DEFAULT CURRENT_DATE,
      steps INTEGER DEFAULT 0,
      stairs INTEGER DEFAULT 0,
      calories_burned INTEGER DEFAULT 0,
      calories_consumed INTEGER DEFAULT 0,
      exercise_type TEXT,
      exercise_minutes INTEGER DEFAULT 0,
      sleep_hours NUMERIC(4,2) DEFAULT 0,
      sleep_quality TEXT CHECK (sleep_quality IN ('poor','fair','good','excellent')),
      heart_rate INTEGER,
      blood_pressure_systolic INTEGER,
      blood_pressure_diastolic INTEGER,
      spo2 INTEGER,
      temperature NUMERIC(4,1),
      weight NUMERIC(5,1),
      blood_sugar INTEGER,
      notes TEXT,
      source TEXT DEFAULT 'manual',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, date)
    );
    CREATE INDEX IF NOT EXISTS daily_activity_user_date ON daily_activity (user_id, date DESC);
  `);
  tableReady = true;
}

const VALID_SLEEP_QUALITY = new Set(['poor', 'fair', 'good', 'excellent']);

function validateRange(name, val, min, max) {
  if (val === undefined || val === null) return null;
  const n = Number(val);
  if (isNaN(n) || n < min || n > max) {
    throw new Error(`${name} must be between ${min} and ${max}`);
  }
  return n;
}

// ── POST /api/activity-tracker/log — Log or update today's activity ──
router.post('/log', authUser, async (req, res) => {
  try {
    await ensureTable();
    const userId = req.user.id;
    const {
      date, steps, stairs, caloriesBurned, caloriesConsumed,
      exerciseType, exerciseMinutes, sleepHours, sleepQuality,
      heartRate, bpSystolic, bpDiastolic, spo2, temperature,
      weight, bloodSugar, notes
    } = req.body;

    // ── Input validation ──────────────────────────────────────────────────────
    try {
      validateRange('steps', steps, 0, 100000);
      validateRange('stairs', stairs, 0, 10000);
      validateRange('caloriesBurned', caloriesBurned, 0, 20000);
      validateRange('caloriesConsumed', caloriesConsumed, 0, 20000);
      validateRange('exerciseMinutes', exerciseMinutes, 0, 1440);
      validateRange('sleepHours', sleepHours, 0, 24);
      validateRange('heartRate', heartRate, 30, 250);
      validateRange('bpSystolic', bpSystolic, 50, 300);
      validateRange('bpDiastolic', bpDiastolic, 30, 200);
      validateRange('spo2', spo2, 50, 100);
      validateRange('temperature', temperature, 30, 45);
      validateRange('weight', weight, 1, 500);
      validateRange('bloodSugar', bloodSugar, 20, 800);
      if (sleepQuality && !VALID_SLEEP_QUALITY.has(sleepQuality)) {
        throw new Error("sleepQuality must be poor|fair|good|excellent");
      }
    } catch (validationErr) {
      return res.status(400).json({ success: false, error: validationErr.message });
    }

    const targetDate = date || new Date().toISOString().split('T')[0];

    const [rows] = await postgresSequelize.query(`
      INSERT INTO daily_activity (
        user_id, date, steps, stairs, calories_burned, calories_consumed,
        exercise_type, exercise_minutes, sleep_hours, sleep_quality,
        heart_rate, blood_pressure_systolic, blood_pressure_diastolic,
        spo2, temperature, weight, blood_sugar, notes, source
      ) VALUES (
        :userId, :date, :steps, :stairs, :caloriesBurned, :caloriesConsumed,
        :exerciseType, :exerciseMinutes, :sleepHours, :sleepQuality,
        :heartRate, :bpSystolic, :bpDiastolic,
        :spo2, :temperature, :weight, :bloodSugar, :notes, 'manual'
      )
      ON CONFLICT (user_id, date) DO UPDATE SET
        steps = COALESCE(EXCLUDED.steps, daily_activity.steps),
        stairs = COALESCE(EXCLUDED.stairs, daily_activity.stairs),
        calories_burned = COALESCE(EXCLUDED.calories_burned, daily_activity.calories_burned),
        calories_consumed = COALESCE(EXCLUDED.calories_consumed, daily_activity.calories_consumed),
        exercise_type = COALESCE(EXCLUDED.exercise_type, daily_activity.exercise_type),
        exercise_minutes = COALESCE(EXCLUDED.exercise_minutes, daily_activity.exercise_minutes),
        sleep_hours = COALESCE(EXCLUDED.sleep_hours, daily_activity.sleep_hours),
        sleep_quality = COALESCE(EXCLUDED.sleep_quality, daily_activity.sleep_quality),
        heart_rate = COALESCE(EXCLUDED.heart_rate, daily_activity.heart_rate),
        blood_pressure_systolic = COALESCE(EXCLUDED.blood_pressure_systolic, daily_activity.blood_pressure_systolic),
        blood_pressure_diastolic = COALESCE(EXCLUDED.blood_pressure_diastolic, daily_activity.blood_pressure_diastolic),
        spo2 = COALESCE(EXCLUDED.spo2, daily_activity.spo2),
        temperature = COALESCE(EXCLUDED.temperature, daily_activity.temperature),
        weight = COALESCE(EXCLUDED.weight, daily_activity.weight),
        blood_sugar = COALESCE(EXCLUDED.blood_sugar, daily_activity.blood_sugar),
        notes = COALESCE(EXCLUDED.notes, daily_activity.notes),
        updated_at = NOW()
      RETURNING *
    `, {
      replacements: {
        userId,
        date: targetDate,
        steps: steps ?? null,
        stairs: stairs ?? null,
        caloriesBurned: caloriesBurned ?? null,
        caloriesConsumed: caloriesConsumed ?? null,
        exerciseType: exerciseType ?? null,
        exerciseMinutes: exerciseMinutes ?? null,
        sleepHours: sleepHours ?? null,
        sleepQuality: sleepQuality ?? null,
        heartRate: heartRate ?? null,
        bpSystolic: bpSystolic ?? null,
        bpDiastolic: bpDiastolic ?? null,
        spo2: spo2 ?? null,
        temperature: temperature ?? null,
        weight: weight ?? null,
        bloodSugar: bloodSugar ?? null,
        notes: notes ?? null
      },
      type: QueryTypes.INSERT
    });

    res.json({ success: true, activity: rows[0] || rows });
  } catch (error) {
    console.error('[ActivityTracker] Log error:', error);
    res.status(500).json({ success: false, error: 'Failed to log activity' });
  }
});

// ── GET /api/activity-tracker/today — Get today's activity ──
router.get('/today', authUser, async (req, res) => {
  try {
    await ensureTable();
    const [rows] = await postgresSequelize.query(`
      SELECT * FROM daily_activity WHERE user_id = :userId AND date = CURRENT_DATE
    `, { replacements: { userId: req.user.id }, type: QueryTypes.SELECT });

    res.json({ success: true, activity: rows || null });
  } catch (error) {
    console.error('[ActivityTracker] Today error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch today\'s activity' });
  }
});

// ── GET /api/activity-tracker/history — Get activity history ──
router.get('/history', authUser, async (req, res) => {
  try {
    await ensureTable();
    const { startDate, endDate } = req.query;
    const safeDays = Math.min(Math.max(parseInt(req.query.days) || 30, 1), 365);

    let query, replacements;
    if (startDate && endDate) {
      query = `SELECT * FROM daily_activity WHERE user_id = :userId AND date BETWEEN :startDate AND :endDate ORDER BY date DESC LIMIT 500`;
      replacements = { userId: req.user.id, startDate, endDate };
    } else {
      query = `SELECT * FROM daily_activity WHERE user_id = :userId AND date >= CURRENT_DATE - :days::int ORDER BY date DESC`;
      replacements = { userId: req.user.id, days: safeDays };
    }

    const rows = await postgresSequelize.query(query, {
      replacements, type: QueryTypes.SELECT
    });

    res.json({ success: true, activities: rows, count: rows.length });
  } catch (error) {
    console.error('[ActivityTracker] History error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch history' });
  }
});

// ── GET /api/activity-tracker/summary — Weekly/monthly summary ──
router.get('/summary', authUser, async (req, res) => {
  try {
    await ensureTable();
    const { period = 'week' } = req.query;
    const days = period === 'month' ? 30 : 7;

    const rows = await postgresSequelize.query(`
      SELECT
        COUNT(*)::int as days_logged,
        COALESCE(AVG(steps), 0)::int as avg_steps,
        COALESCE(SUM(steps), 0)::int as total_steps,
        COALESCE(AVG(stairs), 0)::int as avg_stairs,
        COALESCE(AVG(calories_burned), 0)::int as avg_calories_burned,
        COALESCE(AVG(calories_consumed), 0)::int as avg_calories_consumed,
        COALESCE(AVG(exercise_minutes), 0)::int as avg_exercise_minutes,
        COALESCE(SUM(exercise_minutes), 0)::int as total_exercise_minutes,
        COALESCE(AVG(sleep_hours), 0)::numeric(4,1) as avg_sleep_hours,
        COALESCE(AVG(heart_rate), 0)::int as avg_heart_rate,
        COALESCE(AVG(spo2), 0)::int as avg_spo2,
        COALESCE(AVG(weight), 0)::numeric(5,1) as avg_weight,
        COALESCE(AVG(blood_sugar), 0)::int as avg_blood_sugar,
        COALESCE(AVG(blood_pressure_systolic), 0)::int as avg_bp_systolic,
        COALESCE(AVG(blood_pressure_diastolic), 0)::int as avg_bp_diastolic,
        MIN(date) as from_date,
        MAX(date) as to_date
      FROM daily_activity
      WHERE user_id = :userId AND date >= CURRENT_DATE - :days::int
    `, { replacements: { userId: req.user.id, days }, type: QueryTypes.SELECT });

    // Daily breakdown for charts
    const daily = await postgresSequelize.query(`
      SELECT date, steps, stairs, calories_burned, calories_consumed,
             exercise_minutes, sleep_hours, heart_rate, spo2, weight, blood_sugar,
             blood_pressure_systolic, blood_pressure_diastolic
      FROM daily_activity
      WHERE user_id = :userId AND date >= CURRENT_DATE - :days::int
      ORDER BY date ASC
    `, { replacements: { userId: req.user.id, days }, type: QueryTypes.SELECT });

    res.json({
      success: true,
      period,
      summary: rows[0] || {},
      daily
    });
  } catch (error) {
    console.error('[ActivityTracker] Summary error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch summary' });
  }
});

// ── GET /api/activity-tracker — Status endpoint ──
router.get('/', authUser, async (req, res) => {
  await ensureTable();
  res.json({ success: true, message: 'Activity Tracker API', endpoints: ['/log', '/today', '/history', '/summary'] });
});

export default router;
