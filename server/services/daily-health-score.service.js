/**
 * Daily Health Score Service
 *
 * Computes a science-backed composite health score (0–100) for each user
 * based on the previous day's logged activity, nutrition, sleep, vitals,
 * medication adherence, hydration, and mental health.
 *
 * Reference frameworks:
 *  - WHO Global Action Plan on Physical Activity 2018–2030
 *  - AHA Life's Essential 8 (2022)
 *  - ICMR-NIN Dietary Guidelines for Indians (2024)
 *  - Sleep Foundation / AASM adult sleep recommendations
 *  - Mifflin-St Jeor BMR equation for caloric targets
 *
 * Gender × age-band specific targets are applied throughout.
 *
 * Scoring domains and weights:
 *  1. Physical Activity   22%
 *  2. Nutrition           20%
 *  3. Sleep               20%
 *  4. Vitals              15%
 *  5. Medication          10%
 *  6. Hydration            8%
 *  7. Mental / Stress      5%
 *
 * Each domain yields 0–100; final score = weighted sum.
 */

import cron from 'node-cron';
import { postgresSequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';
import { sleepHours } from '../utils/health-display.js';

export async function currentDailyScore(userId) {
  await ensureTables();
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const [enriched, logs, profiles] = await Promise.all([
    enrichLogDataFromDiary(userId, date),
    postgresSequelize.query('SELECT * FROM daily_activity WHERE user_id = :userId AND date = :date LIMIT 1', { replacements: { userId, date }, type: QueryTypes.SELECT }),
    postgresSequelize.query(`SELECT u."dateOfBirth", COALESCE(ha.gender, u.gender, 'other') AS gender, ha.height,
      COALESCE((SELECT weight FROM daily_activity WHERE user_id = u.id AND weight IS NOT NULL ORDER BY date DESC LIMIT 1), ha.weight) AS weight
      FROM users u LEFT JOIN user_health_assessments ha ON ha.user_id = u.id
      AND ha.id = (SELECT id FROM user_health_assessments WHERE user_id = u.id ORDER BY created_at DESC LIMIT 1)
      WHERE u.id = :userId`, { replacements: { userId }, type: QueryTypes.SELECT }),
  ]);
  const merged = { ...enriched };
  for (const [key, value] of Object.entries(logs[0] || {})) if (value != null) merged[key] = value;
  const result = computeDailyScore(merged, profiles[0] || {}, date);
  return { ...result, date, computedAt: new Date().toISOString(), domains: Object.fromEntries(Object.entries(result.domains).map(([key, value]) => [key, result.dataQuality.observedDomains.includes(key) ? value : null])) };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Age-band helper
// ─────────────────────────────────────────────────────────────────────────────
function getAgeBand(age) {
  if (!age || age < 1) return 'adult';
  if (age < 13)  return 'child';
  if (age < 18)  return 'teen';
  if (age < 36)  return 'young_adult';
  if (age < 56)  return 'middle_age';
  if (age < 71)  return 'senior';
  return 'elderly';
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Gender + age-band specific targets
// ─────────────────────────────────────────────────────────────────────────────
const TARGETS = {
  steps: {
    child:       12000,
    teen:        11000,
    young_adult: 10000,
    middle_age:   8000,
    senior:       7000,
    elderly:      5000,
    adult:        8000,
  },
  exercise_minutes: {
    child: 60, teen: 60, young_adult: 30, middle_age: 30,
    senior: 30, elderly: 20, adult: 30,
  },
  sleep_hours: {
    // { min, optimal_min, optimal_max, max }
    child:       { min: 9,   opt_min: 9,   opt_max: 12, max: 14 },
    teen:        { min: 8,   opt_min: 8,   opt_max: 10, max: 11 },
    young_adult: { min: 7,   opt_min: 7,   opt_max: 9,  max: 11 },
    middle_age:  { min: 7,   opt_min: 7,   opt_max: 9,  max: 10 },
    senior:      { min: 7,   opt_min: 7,   opt_max: 8,  max: 9  },
    elderly:     { min: 7,   opt_min: 7,   opt_max: 8,  max: 9  },
    adult:       { min: 7,   opt_min: 7,   opt_max: 9,  max: 10 },
  },
  // water in glasses (250 mL each)
  water_glasses: {
    male: {
      child: 7, teen: 10, young_adult: 15, middle_age: 15,
      senior: 12, elderly: 11, adult: 13,
    },
    female: {
      child: 6, teen: 9, young_adult: 11, middle_age: 11,
      senior: 10, elderly: 9, adult: 10,
    },
    other: {
      child: 7, teen: 9, young_adult: 13, middle_age: 13,
      senior: 11, elderly: 10, adult: 11,
    },
  },
  // Calorie targets derived per request via Mifflin-St Jeor; fallback table:
  calories_fallback: {
    male: {
      child: 1800, teen: 2400, young_adult: 2500, middle_age: 2200,
      senior: 2000, elderly: 1800, adult: 2200,
    },
    female: {
      child: 1600, teen: 2000, young_adult: 2000, middle_age: 1800,
      senior: 1700, elderly: 1600, adult: 1800,
    },
    other: {
      child: 1700, teen: 2200, young_adult: 2250, middle_age: 2000,
      senior: 1850, elderly: 1700, adult: 2000,
    },
  },
  // BP: { systolic, diastolic } — normal upper limit
  bp_normal: { systolic: 120, diastolic: 80 },
  bp_elevated: { systolic: 130, diastolic: 85 },
  bp_high: { systolic: 140, diastolic: 90 },
  // Resting HR optimal by age
  hr_optimal: {
    child: { min: 60, max: 100 },
    teen: { min: 55, max: 90 },
    young_adult: { min: 50, max: 85 },
    middle_age: { min: 50, max: 90 },
    senior: { min: 55, max: 90 },
    elderly: { min: 60, max: 95 },
    adult: { min: 50, max: 90 },
  },
  // SpO2 normal >= 95%
  spo2_normal: 95,
  // Blood glucose fasting mg/dL
  glucose_normal: { min: 70, max: 100 },
  glucose_prediabetic: { min: 100, max: 126 },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. Mifflin-St Jeor calorie target
// ─────────────────────────────────────────────────────────────────────────────
function getCalorieTarget(gender, age, heightCm, weightKg, activityLevel) {
  if (!heightCm || !weightKg || !age) return null;
  let bmr;
  const g = (gender || '').toLowerCase();
  if (g === 'female') {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
  } else {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  }
  const mults = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725 };
  const mult = mults[activityLevel] || 1.375;
  return Math.round(bmr * mult);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Domain scorers (each returns 0–100)
// ─────────────────────────────────────────────────────────────────────────────

function scoreActivity(data, ageBand) {
  const targetSteps = TARGETS.steps[ageBand] || 8000;
  const targetMins  = TARGETS.exercise_minutes[ageBand] || 30;

  const steps   = data.steps || 0;
  const mins    = data.exercise_minutes || 0;
  const kcal    = data.calories_burned || 0;

  // Steps sub-score (60% weight within domain)
  const stepScore = Math.min(steps / targetSteps, 1.2) * 100;   // allow 20% bonus
  // Exercise minutes sub-score (30% weight)
  const minScore  = Math.min(mins / targetMins, 1.2) * 100;
  // Calorie burn sub-score (10% weight) — any burn > 300 kcal = full
  const kcalScore = Math.min(kcal / 300, 1) * 100;

  const raw = 0.6 * stepScore + 0.3 * minScore + 0.1 * kcalScore;
  return Math.min(Math.round(raw), 100);
}

function scoreNutrition(data, gender, ageBand, heightCm, weightKg, activityLevel) {
  const gKey = (gender || 'other').toLowerCase();
  let calTarget = null;
  if (heightCm && weightKg) {
    calTarget = getCalorieTarget(gKey, 30, heightCm, weightKg, activityLevel);
  }
  if (!calTarget) {
    calTarget = (TARGETS.calories_fallback[gKey] || TARGETS.calories_fallback.other)[ageBand] || 2000;
  }

  const consumed = data.calories_consumed || 0;
  // No data logged → neutral 50
  if (consumed === 0) return 50;

  // Ideal: within ±10% of target
  const ratio = consumed / calTarget;
  let calScore;
  if (ratio >= 0.9 && ratio <= 1.1)       calScore = 100;
  else if (ratio >= 0.75 && ratio < 0.9)  calScore = 75;
  else if (ratio > 1.1 && ratio <= 1.25)  calScore = 75;
  else if (ratio >= 0.6 && ratio < 0.75)  calScore = 50;
  else if (ratio > 1.25 && ratio <= 1.4)  calScore = 50;
  else                                     calScore = 25;

  // Diet quality modifier (if logged)
  const qualityBonus = { excellent: 15, good: 8, fair: 0, poor: -15 };
  const bonus = qualityBonus[data.diet_quality] || 0;

  return Math.max(0, Math.min(100, calScore + bonus));
}

function scoreSleep(data, ageBand) {
  const t   = TARGETS.sleep_hours[ageBand] || TARGETS.sleep_hours.adult;
  const hrs = parseFloat(data.sleep_hours) || 0;
  if (hrs === 0) return 50; // no data → neutral

  let baseScore;
  if (hrs >= t.opt_min && hrs <= t.opt_max)   baseScore = 100;
  else if (hrs >= t.min && hrs < t.opt_min)   baseScore = 70;
  else if (hrs > t.opt_max && hrs <= t.max)   baseScore = 80;
  else if (hrs < t.min && hrs >= t.min - 1)   baseScore = 40;
  else if (hrs > t.max)                        baseScore = 50;
  else                                          baseScore = 20;

  // Quality modifier
  const qualityBonus = { excellent: 10, good: 5, fair: 0, poor: -15 };
  const bonus = qualityBonus[data.sleep_quality] || 0;

  // Screen time penalty: WHO/APA recommend < 2h recreational; blue-light disrupts melatonin.
  // > 6h → −20, 4–6h → −10, 2–4h → −5, ≤ 2h → no penalty.
  let screenPenalty = 0;
  if (data.screen_time_hours != null) {
    const st = data.screen_time_hours;
    if      (st > 6) screenPenalty = -20;
    else if (st > 4) screenPenalty = -10;
    else if (st > 2) screenPenalty = -5;
  }

  return Math.max(0, Math.min(100, baseScore + bonus + screenPenalty));
}

function scoreVitals(data, ageBand) {
  let totalWeight = 0, totalScore = 0;

  // Blood pressure
  if (data.blood_pressure_systolic && data.blood_pressure_diastolic) {
    const sys = data.blood_pressure_systolic;
    const dia = data.blood_pressure_diastolic;
    let bpScore;
    if (sys <= 120 && dia <= 80)       bpScore = 100;
    else if (sys <= 130 && dia <= 85)  bpScore = 75;
    else if (sys <= 140 && dia <= 90)  bpScore = 50;
    else                                bpScore = 20;
    totalScore  += bpScore * 0.35;
    totalWeight += 0.35;
  }

  // Resting heart rate
  if (data.heart_rate) {
    const hr    = data.heart_rate;
    const hrRef = TARGETS.hr_optimal[ageBand] || TARGETS.hr_optimal.adult;
    let hrScore;
    if (hr >= hrRef.min && hr <= hrRef.max)                hrScore = 100;
    else if (hr < hrRef.min && hr >= hrRef.min - 10)       hrScore = 75;
    else if (hr > hrRef.max && hr <= hrRef.max + 15)       hrScore = 70;
    else                                                    hrScore = 30;
    totalScore  += hrScore * 0.25;
    totalWeight += 0.25;
  }

  // SpO2
  if (data.spo2) {
    const spScore = data.spo2 >= 98 ? 100
                  : data.spo2 >= 95 ? 80
                  : data.spo2 >= 90 ? 40
                  : 10;
    totalScore  += spScore * 0.20;
    totalWeight += 0.20;
  }

  // Blood glucose (fasting reference)
  if (data.blood_sugar) {
    const g  = data.blood_sugar;
    const bg = TARGETS.glucose_normal;
    let bgScore;
    if (g >= bg.min && g < bg.max)                                bgScore = 100;
    else if (g >= bg.max && g < TARGETS.glucose_prediabetic.max)   bgScore = 60;
    else if (g < bg.min)                                           bgScore = 50;
    else                                                            bgScore = 20;
    totalScore  += bgScore * 0.20;
    totalWeight += 0.20;
  }

  if (totalWeight === 0) return 70; // no vitals logged → assume okay
  return Math.min(100, Math.round(totalScore / totalWeight));
}

function scoreMedication(data) {
  // medication_adherence_pct: 0–100 set by the daily log when user marks meds taken
  if (data.medication_adherence_pct != null) {
    return Math.round(data.medication_adherence_pct);
  }
  // medication_doses_taken / medication_doses_prescribed
  if (data.medication_doses_prescribed && data.medication_doses_prescribed > 0) {
    const pct = (data.medication_doses_taken || 0) / data.medication_doses_prescribed;
    return Math.min(100, Math.round(pct * 100));
  }
  return 100; // no meds prescribed → full marks
}

function scoreHydration(data, gender, ageBand) {
  const gKey = (gender || 'other').toLowerCase();
  const genderKey = ['male','female'].includes(gKey) ? gKey : 'other';
  const target = (TARGETS.water_glasses[genderKey] || TARGETS.water_glasses.other)[ageBand] || 10;
  const glasses = data.water_glasses || 0;
  if (glasses === 0) return 50; // no data → neutral
  return Math.min(100, Math.round((glasses / target) * 100));
}

function scoreMental(data) {
  // stress_score: 1–10 (1=low stress=good, 10=extreme stress=bad)
  // mood_score: 1–10 (10=great mood=good)
  let parts = 0, total = 0;
  if (data.stress_score != null) {
    const stressRaw = Math.max(1, Math.min(10, data.stress_score));
    total += Math.round(((10 - stressRaw) / 9) * 100);
    parts++;
  }
  if (data.mood_score != null) {
    const moodRaw = Math.max(1, Math.min(10, data.mood_score));
    total += Math.round(((moodRaw - 1) / 9) * 100);
    parts++;
  }
  if (parts === 0) return 70; // no data → neutral

  const base = Math.round(total / parts);

  // Screen time also strains mental health (anxiety, FOMO, dopamine dysregulation).
  // > 8h → −15, 6–8h → −8, 4–6h → −3, ≤ 4h → no penalty.
  let screenPenalty = 0;
  if (data.screen_time_hours != null) {
    const st = data.screen_time_hours;
    if      (st > 8) screenPenalty = -15;
    else if (st > 6) screenPenalty = -8;
    else if (st > 4) screenPenalty = -3;
  }

  return Math.max(0, Math.min(100, base + screenPenalty));
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Enrich log data from health diary + recent lab reports
//    Fills null gaps in daily_activity with data the user captured elsewhere
// ─────────────────────────────────────────────────────────────────────────────

// Glucose-related key names in aiAnalysis.keyValues (case-insensitive match)
const GLUCOSE_KEYS = new Set([
  'glucose', 'blood sugar', 'fasting blood sugar', 'fbs', 'rbs',
  'blood glucose', 'random blood sugar', 'pp blood sugar', 'ppbs',
  'fasting glucose', 'plasma glucose',
]);
const SPO2_KEYS = new Set([
  'spo2', 'oxygen saturation', 'o2 saturation', 'oximetry', 'spo₂',
]);

export async function enrichLogDataFromDiary(userId, dateStr) {
  try {
    // 1. Health diary entries for the scoring date
    const diaryRows = await postgresSequelize.query(`
      SELECT "entryType", data, mood, severity
      FROM health_diary
      WHERE "userId" = :userId
        AND ("entryDate" AT TIME ZONE 'Asia/Kolkata')::date = :date
        -- Compared as text, not as enum_health_diary_entryType: 'screen_time' is not a label on
        -- that enum, and Postgres casts every literal in the list, so including it made the whole
        -- query fail with "invalid input value for enum" and lost ALL diary enrichment, not just
        -- screen time. Adding the label needs ALTER TYPE as its owner (postgres); this does not.
        AND "entryType"::text IN ('vital', 'sleep', 'mood', 'activity', 'medication', 'lab_result', 'device_reading', 'screen_time')
    `, {
      replacements: { userId, date: dateStr },
      type: QueryTypes.SELECT,
    });

    // 2. All wearable readings for the scoring date (~48 readings/day at 30-min intervals).
    //    Fetch every reading, then aggregate per type in JS:
    //      vitals (HR, BP, SpO2, glucose, temp, stress) → average across the day
    //      steps / calories / hydration                 → max  (cumulative device counter)
    //      sleep                                        → sum  (may span multiple segments)
    //      weight                                       → last reading of the day
    //      ecg                                          → flag availability only
    const wearableRows = await postgresSequelize.query(`
      SELECT reading_type, value, unit, activity, recorded_at
      FROM health_readings
      WHERE user_id = :userId
        AND (recorded_at AT TIME ZONE 'Asia/Kolkata')::date = :date
      ORDER BY reading_type, recorded_at ASC
    `, {
      replacements: { userId, date: dateStr },
      type: QueryTypes.SELECT,
    });

    // 3. Recent completed lab reports (last 90 days) for extracted lab values
    const reportRows = await postgresSequelize.query(`
      SELECT "aiAnalysis"
      FROM reports
      WHERE "userId" = :userId
        AND "analysisStatus" = 'completed'
        AND family_member_id IS NULL
        AND "aiAnalysis" IS NOT NULL
        AND COALESCE("reportDate", "updatedAt") >= NOW() - INTERVAL '90 days'
      ORDER BY COALESCE("reportDate", "updatedAt") DESC
      LIMIT 5
    `, {
      replacements: { userId },
      type: QueryTypes.SELECT,
    });

    const enriched = {};
    // Manual readings and web/BLE integrations also use the health_data store.
    const healthRows = await postgresSequelize.query(`SELECT DISTINCT ON (data_type) data_type, value, unit, metadata
      FROM health_data WHERE user_id = :userId AND (recorded_at AT TIME ZONE 'Asia/Kolkata')::date = :date
      ORDER BY data_type, recorded_at DESC, id DESC`, { replacements: { userId, date: dateStr }, type: QueryTypes.SELECT }).catch(() => []);
    const metricFields = { heart_rate: 'heart_rate', steps: 'steps', sleep: 'sleep_hours', spo2: 'spo2', weight: 'weight', blood_glucose: 'blood_sugar', calories: 'calories_burned', water: 'water_glasses', blood_pressure_systolic: 'blood_pressure_systolic', blood_pressure_diastolic: 'blood_pressure_diastolic' };
    for (const row of healthRows) {
      const key = metricFields[row.data_type];
      if (key && Number.isFinite(Number(row.value))) enriched[key] = key === 'sleep_hours' ? sleepHours(row.value, row.unit) : Number(row.value);
      if (row.data_type === 'blood_pressure' && row.metadata?.systolic && row.metadata?.diastolic) {
        enriched.blood_pressure_systolic = Number(row.metadata.systolic);
        enriched.blood_pressure_diastolic = Number(row.metadata.diastolic);
      }
    }
    let medicationCount = 0;

    // ── Health diary enrichment ──────────────────────────────────────────────
    for (const entry of diaryRows) {
      const d = entry.data || {};

      switch (entry.entryType) {
        case 'vital':
        case 'device_reading': {
          if (enriched.blood_pressure_systolic == null) {
            const v = d.blood_pressure_systolic ?? d.bpSystolic ?? d.systolic ?? d.bp_systolic ?? null;
            if (v != null) enriched.blood_pressure_systolic = Number(v);
          }
          if (enriched.blood_pressure_diastolic == null) {
            const v = d.blood_pressure_diastolic ?? d.bpDiastolic ?? d.diastolic ?? d.bp_diastolic ?? null;
            if (v != null) enriched.blood_pressure_diastolic = Number(v);
          }
          if (enriched.heart_rate == null) {
            const v = d.heart_rate ?? d.heartRate ?? d.hr ?? d.pulse ?? null;
            if (v != null) enriched.heart_rate = Number(v);
          }
          if (enriched.spo2 == null) {
            const v = d.spo2 ?? d.oxygen_saturation ?? d.oxygenSaturation ?? d.spO2 ?? null;
            if (v != null) enriched.spo2 = Number(v);
          }
          if (enriched.blood_sugar == null) {
            const v = d.blood_sugar ?? d.bloodSugar ?? d.glucose ?? d.fbs ?? d.rbs ?? null;
            if (v != null) enriched.blood_sugar = Number(v);
          }
          if (enriched.temperature == null) {
            const v = d.temperature ?? d.body_temperature ?? d.bodyTemperature ?? null;
            if (v != null) enriched.temperature = Number(v);
          }
          break;
        }

        case 'sleep': {
          if (enriched.sleep_hours == null) {
            const v = d.sleep_hours ?? d.hours ?? d.duration ?? d.sleepHours ?? null;
            if (v != null) enriched.sleep_hours = Number(v);
          }
          if (enriched.sleep_quality == null) {
            const v = d.sleep_quality ?? d.quality ?? d.sleepQuality ?? null;
            if (v != null) enriched.sleep_quality = String(v);
          }
          break;
        }

        case 'mood': {
          if (enriched.mood_score == null) {
            // health_diary.mood is 1–5; daily_activity mood_score is 1–10
            if (entry.mood != null) {
              enriched.mood_score = Math.min(10, Math.round(entry.mood * 2));
            } else if (d.mood_score != null) {
              enriched.mood_score = d.mood_score;
            }
          }
          if (enriched.stress_score == null && d.stress_score != null) {
            enriched.stress_score = d.stress_score;
          }
          break;
        }

        case 'activity': {
          if (enriched.steps == null) {
            const v = d.steps ?? null;
            if (v != null) enriched.steps = Number(v);
          }
          if (enriched.exercise_minutes == null) {
            const v = d.exercise_minutes ?? d.exerciseMinutes ?? d.duration ?? null;
            if (v != null) enriched.exercise_minutes = Number(v);
          }
          if (enriched.calories_burned == null) {
            const v = d.calories_burned ?? d.caloriesBurned ?? d.calories ?? null;
            if (v != null) enriched.calories_burned = Number(v);
          }
          break;
        }

        case 'medication': {
          if (d.action === 'taken' || d.status === 'taken') medicationCount++;
          break;
        }

        case 'screen_time': {
          // screen_time entry: data.hours | data.screen_time_hours | data.minutes
          if (enriched.screen_time_hours == null) {
            const h = d.hours ?? d.screen_time_hours ?? d.screenTimeHours ?? null;
            const m = d.minutes ?? d.screen_time_minutes ?? null;
            if (h != null) enriched.screen_time_hours = Number(h);
            else if (m != null) enriched.screen_time_hours = Number(m) / 60;
          }
          break;
        }

        case 'lab_result': {
          if (enriched.blood_sugar == null) {
            const v = d.glucose ?? d.blood_sugar ?? d.bloodSugar ?? d.fbs ?? d.rbs ?? null;
            if (v != null) enriched.blood_sugar = Number(v);
          }
          if (enriched.spo2 == null) {
            const v = d.spo2 ?? d.oxygen_saturation ?? null;
            if (v != null) enriched.spo2 = Number(v);
          }
          break;
        }
      }
    }

    // Count medication diary entries as doses taken
    if (medicationCount > 0 && enriched.medication_doses_taken == null) {
      enriched.medication_doses_taken = medicationCount;
    }

    // ── Wearable device enrichment ───────────────────────────────────────────
    // Group all readings by type, then aggregate appropriately.
    // Wearable data wins over diary entries but loses to explicit daily_activity
    // values (those are applied later in the merge step).
    if (wearableRows.length > 0) {
      // Bucket readings by type
      const byType = {};
      for (const row of wearableRows) {
        if (!byType[row.reading_type]) byType[row.reading_type] = [];
        byType[row.reading_type].push(row);
      }

      // Helper: extract a numeric value from the JSONB `value` field using ordered keys
      const num = (v, ...keys) => {
        for (const k of keys) {
          const n = parseFloat(v[k] ?? v);
          if (!isNaN(n) && n > 0) return n;
        }
        return null;
      };

      // Helper: arithmetic mean of an array, ignoring nulls
      const avg = (arr) => {
        const valid = arr.filter(x => x != null && !isNaN(x));
        return valid.length ? valid.reduce((s, x) => s + x, 0) / valid.length : null;
      };

      // ── heart_rate: average BPM (exclude active/exercise readings for resting HR) ──
      if (byType.heart_rate) {
        const resting = byType.heart_rate
          .filter(r => !r.activity || ['resting', 'sleeping', null].includes(r.activity))
          .map(r => num(r.value, 'avg', 'bpm', 'value'));
        const all = byType.heart_rate.map(r => num(r.value, 'avg', 'bpm', 'value'));
        const result = avg(resting.length >= 3 ? resting : all);
        if (result != null) enriched.heart_rate = Math.round(result);
      }

      // ── blood_pressure: average systolic + diastolic across all readings ──
      if (byType.blood_pressure) {
        const sys = avg(byType.blood_pressure.map(r => num(r.value, 'systolic', 'sys')));
        const dia = avg(byType.blood_pressure.map(r => num(r.value, 'diastolic', 'dia')));
        if (sys != null) enriched.blood_pressure_systolic  = Math.round(sys);
        if (dia != null) enriched.blood_pressure_diastolic = Math.round(dia);
      }

      // ── spo2: average percentage ──
      if (byType.spo2) {
        const result = avg(byType.spo2.map(r => num(r.value, 'percentage', 'spo2', 'value')));
        if (result != null) enriched.spo2 = Math.round(result);
      }

      // ── steps: max value (device accumulates a running daily total) ──
      if (byType.steps) {
        const vals = byType.steps.map(r => num(r.value, 'count', 'steps', 'value')).filter(Boolean);
        if (vals.length) enriched.steps = Math.max(...vals);
      }

      // ── calories: max burned (cumulative counter); max consumed separately ──
      if (byType.calories) {
        const burned   = byType.calories.map(r => num(r.value, 'burned', 'value')).filter(Boolean);
        const consumed = byType.calories.map(r => num(r.value, 'consumed')).filter(Boolean);
        if (burned.length)   enriched.calories_burned   = Math.max(...burned);
        if (consumed.length) enriched.calories_consumed = Math.max(...consumed);
      }

      // ── sleep: sum of all sleep segment durations recorded during the night ──
      if (byType.sleep) {
        const durations = byType.sleep
          .map(r => num(r.value, 'duration_hours', 'hours', 'duration'))
          .filter(Boolean);
        if (durations.length) enriched.sleep_hours = Math.round(durations.reduce((s, x) => s + x, 0) * 10) / 10;

        // Sleep quality: prefer 'excellent'>'good'>'fair'>'poor' across all segments
        if (enriched.sleep_quality == null) {
          const ORDER = { excellent: 3, good: 2, fair: 1, poor: 0 };
          let bestQ = null, bestScore = -1;
          for (const r of byType.sleep) {
            const q = r.value.quality || null;
            const eff = r.value.efficiency != null ? Number(r.value.efficiency) : null;
            const derived = eff != null
              ? (eff >= 90 ? 'excellent' : eff >= 75 ? 'good' : eff >= 60 ? 'fair' : 'poor')
              : q;
            if (derived && (ORDER[derived] ?? -1) > bestScore) {
              bestScore = ORDER[derived];
              bestQ = derived;
            }
          }
          if (bestQ) enriched.sleep_quality = bestQ;
        }
      }

      // ── blood_glucose: average of all readings; auto-convert mmol/L → mg/dL ──
      if (byType.blood_glucose && enriched.blood_sugar == null) {
        const vals = byType.blood_glucose.map(r => {
          let g = num(r.value, 'mg_dl', 'mgdl', 'value');
          if (g == null && r.value.mmol_l != null) g = Math.round(Number(r.value.mmol_l) * 18.0);
          return g;
        }).filter(Boolean);
        const result = avg(vals);
        if (result != null) enriched.blood_sugar = Math.round(result);
      }

      // ── temperature: average °C (auto-convert °F if needed) ──
      if (byType.temperature && enriched.temperature == null) {
        const vals = byType.temperature.map(r => {
          let t = num(r.value, 'celsius', 'value');
          if (t == null && r.value.fahrenheit != null)
            t = ((Number(r.value.fahrenheit) - 32) * 5 / 9);
          return t;
        }).filter(Boolean);
        const result = avg(vals);
        if (result != null) enriched.temperature = parseFloat(result.toFixed(1));
      }

      // ── stress: average score; scale 1–100 → 1–10 if needed ──
      if (byType.stress && enriched.stress_score == null) {
        const vals = byType.stress.map(r => num(r.value, 'score', 'value')).filter(Boolean);
        const result = avg(vals);
        if (result != null) {
          enriched.stress_score = result <= 10 ? Math.round(result) : Math.round(result / 10);
        }
      }

      // ── hydration: max glasses or convert ml → glasses (cumulative counter) ──
      if (byType.hydration && enriched.water_glasses == null) {
        const vals = byType.hydration.map(r => {
          if (r.value.glasses != null) return Number(r.value.glasses);
          if (r.value.ml      != null) return Number(r.value.ml) / 250;
          return null;
        }).filter(Boolean);
        if (vals.length) enriched.water_glasses = Math.round(Math.max(...vals));
      }

      // ── weight: last reading of the day ──
      if (byType.weight && enriched.weight == null) {
        const last = byType.weight[byType.weight.length - 1];
        const w = num(last.value, 'kg', 'value');
        if (w != null) enriched.weight = w;
      }

      // ── ecg: flag availability; capture rhythm from any reading ──
      if (byType.ecg) {
        if (!enriched._wearableMeta) enriched._wearableMeta = {};
        enriched._wearableMeta.ecgAvailable  = true;
        enriched._wearableMeta.ecgReadings   = byType.ecg.length;
        const withRhythm = byType.ecg.find(r => r.value.rhythm);
        if (withRhythm) enriched._wearableMeta.ecgRhythm = withRhythm.value.rhythm;
      }
    }

    // ── Lab report AI analysis enrichment ────────────────────────────────────
    for (const report of reportRows) {
      const keyValues = (report.aiAnalysis && report.aiAnalysis.keyValues) || {};
      for (const [key, val] of Object.entries(keyValues)) {
        const kLower = key.toLowerCase().trim();
        const numVal = val && parseFloat(val.value);
        if (!numVal || isNaN(numVal) || numVal <= 0) continue;

        if (enriched.blood_sugar == null && GLUCOSE_KEYS.has(kLower)) {
          enriched.blood_sugar = numVal;
        }
        if (enriched.spo2 == null && SPO2_KEYS.has(kLower)) {
          enriched.spo2 = numVal;
        }
      }
    }

    return enriched;
  } catch (err) {
    // Non-fatal — scoring continues without diary enrichment
    console.error('enrichLogDataFromDiary error (non-fatal):', err.message);
    return {};
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Composite score
// ─────────────────────────────────────────────────────────────────────────────
const WEIGHTS = {
  activity:   0.22,
  nutrition:  0.20,
  sleep:      0.20,
  vitals:     0.15,
  medication: 0.10,
  hydration:  0.08,
  mental:     0.05,
};

export function computeDailyScore(logData, userProfile, scoringDate) {
  // Derive exact age from date_of_birth on the scoring date for daily precision
  let age;
  // The current users table uses camelCase (`dateOfBirth`), while older
  // installations used `date_of_birth`. Accept both while migrations are
  // rolled out so a score never silently falls back to an arbitrary age.
  const dateOfBirth = userProfile.dateOfBirth || userProfile.date_of_birth;
  if (dateOfBirth) {
    const ref  = scoringDate ? new Date(scoringDate) : new Date();
    const dob  = new Date(dateOfBirth);
    age = ref.getFullYear() - dob.getFullYear();
    const hadBirthday = (
      ref.getMonth() > dob.getMonth() ||
      (ref.getMonth() === dob.getMonth() && ref.getDate() >= dob.getDate())
    );
    if (!hadBirthday) age -= 1;
  } else {
    age = parseInt(userProfile.age) || 30;
  }

  const gender = (userProfile.gender || 'other').toLowerCase();
  const band   = getAgeBand(age);
  const height = parseFloat(userProfile.height) || null;
  // Prefer today's logged weight (most recent measurement) over HRA baseline
  const weight = parseFloat(logData.weight) || parseFloat(userProfile.weight) || null;
  const actLevel = logData.exercise_frequency || 'light';

  const domains = {
    activity:   scoreActivity(logData, band),
    nutrition:  scoreNutrition(logData, gender, band, height, weight, actLevel),
    sleep:      scoreSleep(logData, band),
    vitals:     scoreVitals(logData, band),
    medication: scoreMedication(logData),
    hydration:  scoreHydration(logData, gender, band),
    mental:     scoreMental(logData),
  };

  // Do not present an inferred wellness score as measured health data. In
  // particular, a new user with no connected device used to receive neutral
  // points for sleep, vitals, hydration and mental health, which could be
  // rendered as a reassuring "Good" score. A zero is also not evidence of a
  // reading: Android clients initialise several counters to zero before a
  // Health Connect/device sync completes.
  const hasPositiveNumber = (...values) => values.some(value => {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0;
  });
  const observedDomains = [];
  if (hasPositiveNumber(logData.steps, logData.stairs, logData.exercise_minutes, logData.calories_burned)) observedDomains.push('activity');
  if (hasPositiveNumber(logData.calories_consumed) || logData.diet_quality) observedDomains.push('nutrition');
  if (hasPositiveNumber(logData.sleep_hours) || logData.sleep_quality) observedDomains.push('sleep');
  if (hasPositiveNumber(logData.heart_rate, logData.blood_pressure_systolic, logData.blood_pressure_diastolic, logData.spo2, logData.blood_sugar, logData.temperature)) observedDomains.push('vitals');
  if (logData.medication_adherence_pct != null || (logData.medication_doses_taken != null && hasPositiveNumber(logData.medication_doses_prescribed))) observedDomains.push('medication');
  if (hasPositiveNumber(logData.water_glasses)) observedDomains.push('hydration');
  if (logData.stress_score != null || logData.mood_score != null) observedDomains.push('mental');
  const dataQuality = {
    status: observedDomains.length === 0 ? 'insufficient' : observedDomains.length < 3 ? 'partial' : 'complete',
    observedDomains,
    minimumDomainsForScore: 3,
  };

  const observedWeight = observedDomains.reduce((sum, domain) => sum + WEIGHTS[domain], 0);
  const composite = observedWeight > 0 ? observedDomains.reduce((sum, domain) => sum + domains[domain] * WEIGHTS[domain], 0) / observedWeight : 0;

  return {
    // A score is intentionally withheld until enough independently observed
    // domains exist. Clients can use dataQuality to show a clear connect/log
    // data CTA instead of an invented score.
    score:   dataQuality.status !== 'complete' ? null : Math.min(100, Math.max(0, Math.round(composite))),
    domains,
    ageBand: band,
    dataQuality,
    targets: {
      steps:         TARGETS.steps[band],
      exerciseMins:  TARGETS.exercise_minutes[band],
      sleepHours:    TARGETS.sleep_hours[band],
      waterGlasses:  (TARGETS.water_glasses[(gender === 'female' ? 'female' : gender === 'male' ? 'male' : 'other')] || TARGETS.water_glasses.other)[band],
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. DB table bootstrap
// ─────────────────────────────────────────────────────────────────────────────
let tableReady = false;
async function ensureTables() {
  if (tableReady) return;
  await postgresSequelize.query(`
    CREATE TABLE IF NOT EXISTS daily_health_scores (
      id             SERIAL PRIMARY KEY,
      user_id        INTEGER NOT NULL,
      score_date     DATE    NOT NULL,
      composite_score INTEGER NOT NULL DEFAULT 0,
      activity_score  INTEGER DEFAULT 0,
      nutrition_score INTEGER DEFAULT 0,
      sleep_score     INTEGER DEFAULT 0,
      vitals_score    INTEGER DEFAULT 0,
      medication_score INTEGER DEFAULT 0,
      hydration_score INTEGER DEFAULT 0,
      mental_score    INTEGER DEFAULT 0,
      age_band        VARCHAR(20),
      targets         JSONB,
      computed_at     TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, score_date)
    );
    CREATE INDEX IF NOT EXISTS idx_dhs_user_date ON daily_health_scores(user_id, score_date DESC);

    ALTER TABLE daily_activity
      ADD COLUMN IF NOT EXISTS water_glasses         INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS diet_quality          VARCHAR(20),
      ADD COLUMN IF NOT EXISTS exercise_frequency    VARCHAR(20),
      ADD COLUMN IF NOT EXISTS medication_adherence_pct INTEGER,
      ADD COLUMN IF NOT EXISTS medication_doses_taken     INTEGER,
      ADD COLUMN IF NOT EXISTS medication_doses_prescribed INTEGER,
      ADD COLUMN IF NOT EXISTS stress_score          INTEGER,
      ADD COLUMN IF NOT EXISTS mood_score            INTEGER;
  `);
  tableReady = true;
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Compute + persist for all active users (yesterday's data)
// ─────────────────────────────────────────────────────────────────────────────
async function computeAndStoreAllUsers(targetDate) {
  const dateStr = targetDate || new Date(Date.now() - 86400000).toISOString().split('T')[0];
  console.log(`📊 Daily health score cron — computing for date: ${dateStr}`);

  try {
    await ensureTables();

    // Fetch all active users with DOB for daily-precise age calculation
    const users = await postgresSequelize.query(`
      SELECT DISTINCT
        u.id                                             AS user_id,
        u."dateOfBirth"                                  AS "dateOfBirth",
        COALESCE(ha.gender, u.gender, 'other')            AS gender,
        ha.height,
        -- Use the most recently logged weight, fall back to HRA baseline
        COALESCE(
          (SELECT weight FROM daily_activity
           WHERE user_id = u.id AND weight IS NOT NULL
           ORDER BY date DESC LIMIT 1),
          ha.weight
        )                                                AS weight
      FROM users u
      LEFT JOIN user_health_assessments ha
        ON ha.user_id = u.id
        AND ha.id = (
          SELECT id FROM user_health_assessments
          WHERE user_id = u.id
          ORDER BY created_at DESC LIMIT 1
        )
      WHERE u.status = 'active'
         OR u.is_active = true
    `, { type: QueryTypes.SELECT });

    console.log(`📊 Processing ${users.length} users`);
    let processed = 0, skipped = 0;

    for (const user of users) {
      try {
        // Fetch yesterday's activity log
        const [log] = await postgresSequelize.query(`
          SELECT * FROM daily_activity
          WHERE user_id = :userId AND date = :date
          LIMIT 1
        `, {
          replacements: { userId: user.user_id, date: dateStr },
          type: QueryTypes.SELECT,
        });

        // Enrich with health diary entries and recent lab report values.
        // Diary/lab data fills null gaps; explicit daily_activity values always win.
        const diaryEnrichment = await enrichLogDataFromDiary(user.user_id, dateStr);
        const baseLog = log || {};
        const mergedData = Object.assign({}, diaryEnrichment);
        for (const [k, v] of Object.entries(baseLog)) {
          if (v !== null && v !== undefined) mergedData[k] = v;
        }

        const result = computeDailyScore(mergedData, {
          dateOfBirth: user.dateOfBirth,
          gender: user.gender,
          height: user.height,
          weight: user.weight,
        }, dateStr);

        await postgresSequelize.query(`
          INSERT INTO daily_health_scores
            (user_id, score_date, composite_score,
             activity_score, nutrition_score, sleep_score,
             vitals_score, medication_score, hydration_score, mental_score,
             age_band, targets, computed_at)
          VALUES
            (:userId, :date, :composite,
             :activity, :nutrition, :sleep,
             :vitals, :medication, :hydration, :mental,
             :ageBand, :targets, NOW())
          ON CONFLICT (user_id, score_date) DO UPDATE SET
            composite_score  = EXCLUDED.composite_score,
            activity_score   = EXCLUDED.activity_score,
            nutrition_score  = EXCLUDED.nutrition_score,
            sleep_score      = EXCLUDED.sleep_score,
            vitals_score     = EXCLUDED.vitals_score,
            medication_score = EXCLUDED.medication_score,
            hydration_score  = EXCLUDED.hydration_score,
            mental_score     = EXCLUDED.mental_score,
            age_band         = EXCLUDED.age_band,
            targets          = EXCLUDED.targets,
            computed_at      = NOW()
        `, {
          replacements: {
            userId:     user.user_id,
            date:       dateStr,
            // `composite_score` predates data-quality states and is NOT NULL.
            // Persist 0 as a sentinel; the API returns null when targets carry
            // an insufficient-data marker.
            composite:  result.score ?? 0,
            activity:   result.domains.activity,
            nutrition:  result.domains.nutrition,
            sleep:      result.domains.sleep,
            vitals:     result.domains.vitals,
            medication: result.domains.medication,
            hydration:  result.domains.hydration,
            mental:     result.domains.mental,
            ageBand:    result.ageBand,
            targets:    JSON.stringify({ ...result.targets, dataQuality: result.dataQuality }),
          },
        });
        processed++;
      } catch (userErr) {
        console.error(`📊 Error processing user ${user.user_id}:`, userErr.message);
        skipped++;
      }
    }

    console.log(`📊 Daily health score done — ${processed} computed, ${skipped} errors`);
  } catch (err) {
    console.error('📊 Daily health score cron failed:', err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Exported service
// ─────────────────────────────────────────────────────────────────────────────
class DailyHealthScoreService {
  constructor() {
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    ensureTables().catch(console.error);

    // Run at 09:00 AM every day (server local time = IST)
    cron.schedule('0 9 * * *', async () => {
      await computeAndStoreAllUsers();
    });

    console.log('✅ Daily health score service started (cron: 09:00 AM daily)');
  }

  // Expose for on-demand recalculation (e.g. after a user logs data)
  async computeForUser(userId, date, logData, userProfile) {
    await ensureTables();
    const result = computeDailyScore(logData, userProfile, date);
    const dateStr = date || new Date().toISOString().split('T')[0];

    await postgresSequelize.query(`
      INSERT INTO daily_health_scores
        (user_id, score_date, composite_score,
         activity_score, nutrition_score, sleep_score,
         vitals_score, medication_score, hydration_score, mental_score,
         age_band, targets, computed_at)
      VALUES
        (:userId, :date, :composite,
         :activity, :nutrition, :sleep,
         :vitals, :medication, :hydration, :mental,
         :ageBand, :targets, NOW())
      ON CONFLICT (user_id, score_date) DO UPDATE SET
        composite_score  = EXCLUDED.composite_score,
        activity_score   = EXCLUDED.activity_score,
        nutrition_score  = EXCLUDED.nutrition_score,
        sleep_score      = EXCLUDED.sleep_score,
        vitals_score     = EXCLUDED.vitals_score,
        medication_score = EXCLUDED.medication_score,
        hydration_score  = EXCLUDED.hydration_score,
        mental_score     = EXCLUDED.mental_score,
        age_band         = EXCLUDED.age_band,
        targets          = EXCLUDED.targets,
        computed_at      = NOW()
    `, {
      replacements: {
        userId, date: dateStr,
        composite:  result.score ?? 0,
        activity:   result.domains.activity,
        nutrition:  result.domains.nutrition,
        sleep:      result.domains.sleep,
        vitals:     result.domains.vitals,
        medication: result.domains.medication,
        hydration:  result.domains.hydration,
        mental:     result.domains.mental,
        ageBand:    result.ageBand,
        targets:    JSON.stringify({ ...result.targets, dataQuality: result.dataQuality }),
      },
    });

    return result;
  }
}

export default new DailyHealthScoreService();
export { computeAndStoreAllUsers, ensureTables };
