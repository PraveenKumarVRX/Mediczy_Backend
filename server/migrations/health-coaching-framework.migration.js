/**
 * Health Coaching Framework Engine
 * Unlimited configurable programs per organization — "Netflix of Health Programs"
 *
 * Tables:
 *   health_programs              — program catalog (created by admin per org)
 *   program_tracking_params      — what vitals/metrics each program tracks
 *   program_tasks                — daily/weekly task templates per program
 *   program_content              — videos, articles, tips per program
 *   program_assessments          — questionnaire definitions per program
 *   program_enrollments          — user ↔ program membership
 *   program_task_logs            — user daily task completion records
 *   program_health_scores        — periodic score snapshots (0-100 composite)
 *   program_device_connections   — CGM, BP monitor, ring, watch, etc.
 */

import pool from '../db/pgPool.js';

export async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Program catalog ────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS health_programs (
        id              SERIAL PRIMARY KEY,
        uuid            UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
        org_id          VARCHAR(100),                        -- null = platform-level (visible to all)
        name            VARCHAR(200) NOT NULL,
        slug            VARCHAR(200) UNIQUE NOT NULL,
        description     TEXT,
        short_tagline   VARCHAR(300),
        category        VARCHAR(80) NOT NULL,               -- diabetes, cardiac, pcos, fatty_liver, corporate_wellness, …
        duration_days   INTEGER NOT NULL DEFAULT 90,
        coach_type      VARCHAR(30) DEFAULT 'hybrid',       -- ai, human, hybrid
        thumbnail_url   TEXT,
        color_hex       VARCHAR(7) DEFAULT '#6366f1',
        icon_name       VARCHAR(60) DEFAULT 'Heart',
        status          VARCHAR(20) DEFAULT 'active'        -- draft, active, archived
                        CHECK (status IN ('draft','active','archived')),
        subscription_required BOOLEAN DEFAULT FALSE,
        price_inr       NUMERIC(10,2) DEFAULT 0,
        tags            TEXT[] DEFAULT '{}',
        sort_order      INTEGER DEFAULT 0,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ── Tracking parameters (what gets measured in a program) ──────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS program_tracking_params (
        id              SERIAL PRIMARY KEY,
        program_id      INTEGER NOT NULL REFERENCES health_programs(id) ON DELETE CASCADE,
        param_key       VARCHAR(60) NOT NULL,   -- fbs, ppbs, hba1c, weight, steps, sleep, bp_sys, bp_dia, …
        param_label     VARCHAR(100) NOT NULL,
        unit            VARCHAR(30),
        normal_min      NUMERIC,
        normal_max      NUMERIC,
        score_weight    NUMERIC(4,2) DEFAULT 1, -- contribution weight to composite score
        tracking_freq   VARCHAR(20) DEFAULT 'daily' CHECK (tracking_freq IN ('daily','weekly','monthly')),
        sort_order      INTEGER DEFAULT 0
      )
    `);

    // ── Task templates (daily / weekly activities) ─────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS program_tasks (
        id              SERIAL PRIMARY KEY,
        program_id      INTEGER NOT NULL REFERENCES health_programs(id) ON DELETE CASCADE,
        title           VARCHAR(200) NOT NULL,
        description     TEXT,
        task_type       VARCHAR(60) NOT NULL,  -- walk, water, sleep, medication, exercise, log_sugar, log_bp, …
        frequency       VARCHAR(20) DEFAULT 'daily' CHECK (frequency IN ('daily','weekly','once')),
        target_value    NUMERIC,
        unit            VARCHAR(30),
        icon_name       VARCHAR(60) DEFAULT 'CheckCircle2',
        day_start       INTEGER DEFAULT 1,     -- from day N of enrollment
        day_end         INTEGER,               -- to day N (null = entire program)
        stage           SMALLINT DEFAULT 1,    -- which journey stage owns this task
        sort_order      INTEGER DEFAULT 0
      )
    `);

    // ── Educational content ────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS program_content (
        id              SERIAL PRIMARY KEY,
        program_id      INTEGER NOT NULL REFERENCES health_programs(id) ON DELETE CASCADE,
        content_type    VARCHAR(30) DEFAULT 'article' CHECK (content_type IN ('video','article','tip','recipe','exercise')),
        title           VARCHAR(300) NOT NULL,
        body            TEXT,
        url             TEXT,
        thumbnail_url   TEXT,
        duration_mins   INTEGER,
        tags            TEXT[] DEFAULT '{}',
        stage           SMALLINT DEFAULT 1,
        sort_order      INTEGER DEFAULT 0,
        published       BOOLEAN DEFAULT TRUE
      )
    `);

    // ── Assessment questionnaires ──────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS program_assessments (
        id              SERIAL PRIMARY KEY,
        program_id      INTEGER NOT NULL REFERENCES health_programs(id) ON DELETE CASCADE,
        name            VARCHAR(200) NOT NULL,
        description     TEXT,
        assessment_type VARCHAR(60) DEFAULT 'onboarding',  -- onboarding, lifestyle, weekly_check, outcome
        questions       JSONB NOT NULL DEFAULT '[]',
        sort_order      INTEGER DEFAULT 0
      )
    `);

    // ── Enrollments ────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS program_enrollments (
        id                  SERIAL PRIMARY KEY,
        uuid                UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
        user_id             INTEGER NOT NULL,
        program_id          INTEGER NOT NULL REFERENCES health_programs(id),
        org_id              VARCHAR(100),
        enrolled_at         TIMESTAMPTZ DEFAULT NOW(),
        start_date          DATE NOT NULL DEFAULT CURRENT_DATE,
        end_date            DATE,
        status              VARCHAR(20) DEFAULT 'active'
                            CHECK (status IN ('active','paused','completed','cancelled')),
        assigned_coach_id   INTEGER,
        assigned_doctor_id  INTEGER,
        assigned_dietician_id INTEGER,
        assessment_answers  JSONB DEFAULT '{}',
        personalized_plan   JSONB DEFAULT '{}',   -- doctor-written plan visible in app
        notes               TEXT,
        completed_at        TIMESTAMPTZ,
        UNIQUE (user_id, program_id)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pe_user ON program_enrollments(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pe_program ON program_enrollments(program_id)`);

    // ── Daily task logs ────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS program_task_logs (
        id              SERIAL PRIMARY KEY,
        enrollment_id   INTEGER NOT NULL REFERENCES program_enrollments(id) ON DELETE CASCADE,
        task_id         INTEGER NOT NULL REFERENCES program_tasks(id) ON DELETE CASCADE,
        log_date        DATE NOT NULL DEFAULT CURRENT_DATE,
        completed       BOOLEAN DEFAULT FALSE,
        completed_at    TIMESTAMPTZ,
        value           NUMERIC,      -- actual measured value if applicable
        notes           VARCHAR(500),
        UNIQUE (enrollment_id, task_id, log_date)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ptl_enrollment ON program_task_logs(enrollment_id, log_date)`);

    // ── Composite health scores ────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS program_health_scores (
        id              SERIAL PRIMARY KEY,
        enrollment_id   INTEGER NOT NULL REFERENCES program_enrollments(id) ON DELETE CASCADE,
        score_date      DATE NOT NULL DEFAULT CURRENT_DATE,
        total_score     NUMERIC(5,1) NOT NULL DEFAULT 0,   -- 0–100
        component_scores JSONB DEFAULT '{}',               -- {"sugar_control": 75, "sleep": 60, …}
        is_baseline     BOOLEAN DEFAULT FALSE,
        UNIQUE (enrollment_id, score_date)
      )
    `);

    // ── Connected devices per enrollment ───────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS program_device_connections (
        id              SERIAL PRIMARY KEY,
        enrollment_id   INTEGER NOT NULL REFERENCES program_enrollments(id) ON DELETE CASCADE,
        device_type     VARCHAR(60) NOT NULL, -- cgm, smart_ring, bp_monitor, weighing_scale, smart_watch, ecg_patch
        device_name     VARCHAR(150),
        device_id       VARCHAR(200),         -- vendor device ID
        vendor          VARCHAR(100),
        connected_at    TIMESTAMPTZ DEFAULT NOW(),
        last_sync_at    TIMESTAMPTZ,
        is_active       BOOLEAN DEFAULT TRUE
      )
    `);

    // ── Seed 7 flagship programs ───────────────────────────────────────────────
    await client.query(`
      INSERT INTO health_programs (name, slug, description, short_tagline, category, duration_days, coach_type, color_hex, icon_name, tags, sort_order)
      VALUES
        ('Diabetes Reset',      'diabetes-reset',     'A science-backed 90-day program to reverse pre-diabetes and achieve sugar control through lifestyle, nutrition, and medical supervision.', 'Control your sugar. Reclaim your life.', 'diabetes',          90, 'hybrid', '#ef4444', 'Activity',    ARRAY['diabetes','sugar','HbA1c'],     1),
        ('Weight Reset',        'weight-reset',       'Structured 90-day medically supervised weight loss combining nutrition coaching, exercise, and behavioural change strategies.',            'Lose weight. Keep it off.',             'obesity',           90, 'hybrid', '#f97316', 'Scale',       ARRAY['weight','obesity','BMI'],          2),
        ('PCOS Reset',          'pcos-reset',         'Comprehensive 90-day holistic program addressing PCOS through hormonal balance, diet, lifestyle, and stress management.',                 'Balance your hormones naturally.',      'pcos',              90, 'hybrid', '#a855f7', 'Flower2',     ARRAY['pcos','hormones','women'],          3),
        ('Fatty Liver Reset',   'fatty-liver-reset',  '90-day liver detox and recovery program with dietary interventions, targeted supplementation, and lifestyle coaching.',                   'Heal your liver. Restore your health.', 'fatty_liver',       90, 'hybrid', '#84cc16', 'Leaf',        ARRAY['liver','nafld','detox'],            4),
        ('Corporate Wellness',  'corporate-wellness', '30-day structured wellness program for corporate employees covering stress, sleep, movement, nutrition, and preventive health.',           'Perform better. Feel better.',          'corporate_wellness',30, 'ai',     '#0ea5e9', 'Briefcase',   ARRAY['corporate','stress','wellness'],    5),
        ('Hypertension Reset',  'hypertension-reset', '60-day blood pressure management program with daily monitoring, dietary guidance, stress reduction, and medication adherence support.',   'Keep your pressure in check.',          'hypertension',      60, 'hybrid', '#6366f1', 'HeartPulse',  ARRAY['bp','hypertension','heart'],        6),
        ('Executive Health',    'executive-health',   'Premium 90-day program for C-suite executives covering comprehensive health optimisation, longevity, and peak performance.',              'Peak performance. Optimal health.',     'executive_health',  90, 'human',  '#f59e0b', 'Crown',       ARRAY['executive','premium','longevity'],  7)
      ON CONFLICT (slug) DO NOTHING
    `);

    // ── Seed tracking params for Diabetes Reset ────────────────────────────────
    await client.query(`
      INSERT INTO program_tracking_params (program_id, param_key, param_label, unit, normal_min, normal_max, score_weight, tracking_freq, sort_order)
      SELECT p.id, v.param_key, v.param_label, v.unit, v.nmin, v.nmax, v.w, v.freq::VARCHAR, v.so
      FROM health_programs p
      CROSS JOIN (VALUES
        ('fbs',    'Fasting Blood Sugar',   'mg/dL', 70,  100, 0.3, 'daily',  1),
        ('ppbs',   'Post-Meal Blood Sugar', 'mg/dL', 70,  140, 0.2, 'daily',  2),
        ('hba1c',  'HbA1c',                '%',     4.0, 5.6, 0.2, 'monthly',3),
        ('weight', 'Weight',               'kg',    null,null, 0.1, 'daily',  4),
        ('steps',  'Daily Steps',          'steps', 8000,null, 0.1, 'daily',  5),
        ('sleep',  'Sleep',                'hours', 7,   9,   0.1, 'daily',  6)
      ) AS v(param_key, param_label, unit, nmin, nmax, w, freq, so)
      WHERE p.slug = 'diabetes-reset'
      ON CONFLICT DO NOTHING
    `);

    // ── Seed daily tasks for Diabetes Reset ───────────────────────────────────
    await client.query(`
      INSERT INTO program_tasks (program_id, title, task_type, frequency, target_value, unit, icon_name, stage, sort_order)
      SELECT p.id, v.title, v.task_type, 'daily', v.tval, v.unit, v.icon, v.stage, v.so
      FROM health_programs p
      CROSS JOIN (VALUES
        ('Log fasting sugar',    'log_sugar',  null,   'mg/dL', 'Droplets',    1, 1),
        ('Walk 30 minutes',      'walk',       30,     'min',   'Footprints',  2, 2),
        ('Drink 3 litres water', 'water',      3,      'litres','Droplet',     2, 3),
        ('Sleep before 10:30 PM','sleep',      7.5,    'hours', 'Moon',        2, 4),
        ('Take medication',      'medication', null,   null,    'Pill',        2, 5),
        ('Log weight',           'log_weight', null,   'kg',    'Scale',       3, 6),
        ('Mindful meal — no refined carbs', 'diet', null, null, 'Salad',       2, 7)
      ) AS v(title, task_type, tval, unit, icon, stage, so)
      WHERE p.slug = 'diabetes-reset'
      ON CONFLICT DO NOTHING
    `);

    await client.query('COMMIT');
    console.log('[migration] health-coaching-framework: UP complete');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function down() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tables = [
      'program_device_connections',
      'program_health_scores',
      'program_task_logs',
      'program_enrollments',
      'program_assessments',
      'program_content',
      'program_tasks',
      'program_tracking_params',
      'health_programs',
    ];
    for (const t of tables) {
      await client.query(`DROP TABLE IF EXISTS ${t} CASCADE`);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
