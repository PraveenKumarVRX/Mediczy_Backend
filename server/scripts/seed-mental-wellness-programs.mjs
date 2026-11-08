/**
 * MED-MIND-001 Phase 1 — seed the mental-wellness programs.
 * Plan: docs/planning/MENTAL_WELLNESS_MODULE_IMPLEMENTATION_PLAN_2026-11-08.md
 *
 * ADDITIVE AND IDEMPOTENT. Production already holds 7 active programs
 * (diabetes-reset, weight-reset, pcos-reset, fatty-liver-reset,
 * corporate-wellness, hypertension-reset, executive-health — Phase 0 PF-2).
 * This script only inserts its own slugs and never touches, deactivates or
 * reorders an existing program.
 *
 * Seeding at least one active program is also what makes the "My Programs" nav
 * item visible (client/src/hooks/useProgramAvailability.ts) — already true here,
 * so this changes catalogue contents, not navigation.
 *
 * Run:
 *   node scripts/ssm-env-loader.mjs scripts/seed-mental-wellness-programs.mjs --dry-run
 *   node scripts/ssm-env-loader.mjs scripts/seed-mental-wellness-programs.mjs
 */
import path from 'path';
import { pathToFileURL } from 'url';
import pool from '../db/pgPool.js';

const DRY_RUN = process.argv.includes('--dry-run');

/**
 * coach_type 'hybrid' is honest here: Phase 0 PF-3 confirmed 61 active, verified
 * psychiatrists/psychologists, all teleconsult- and walk-in-capable, so a human
 * really is reachable. Sleep Reset is 'ai' because the validated insomnia
 * instrument (ISI) is commercially licensed and deliberately not implemented
 * (see PENDING_LICENCE_REVIEW in mental-wellness-instruments.service.js), so that
 * programme is habit-led rather than instrument-led.
 */
const PROGRAMS = [
  {
    slug: 'mood-care',
    name: 'Mood Care',
    short_tagline: 'A guided 90 days for low mood, with check-ins that track how you are really doing',
    description:
      'A structured programme for persistent low mood. You take a short, validated check-in '
      + '(PHQ-9) every two weeks, build a few daily habits that are known to help, and can speak '
      + 'to a psychiatrist or psychologist whenever you want to. Your answers are private to you '
      + 'and the clinician you choose to consult.',
    category: 'mental_health',
    duration_days: 90,
    coach_type: 'hybrid',
    icon_name: 'Brain',
    color_hex: '#7c3aed',
    tags: ['mental health', 'mood', 'depression', 'wellbeing'],
    sort_order: 20,
    tracking: [
      { param_key: 'mood', param_label: 'Daily mood', unit: '1-5', normal_min: 3, normal_max: 5, tracking_freq: 'daily', score_weight: 1.5 },
      { param_key: 'sleep_hours', param_label: 'Sleep', unit: 'hours', normal_min: 7, normal_max: 9, tracking_freq: 'daily', score_weight: 1 },
      { param_key: 'phq9', param_label: 'PHQ-9 score', unit: 'points', normal_min: 0, normal_max: 4, tracking_freq: 'monthly', score_weight: 2 },
    ],
    tasks: [
      { title: 'Log how you are feeling', task_type: 'mood', frequency: 'daily', icon_name: 'Smile', sort_order: 1 },
      { title: 'Ten minutes outside', task_type: 'exercise', frequency: 'daily', target_value: 10, unit: 'minutes', icon_name: 'Sun', sort_order: 2 },
      { title: 'Write down one thing that went well', task_type: 'journal', frequency: 'daily', icon_name: 'PenLine', sort_order: 3 },
      { title: 'Message or meet one person', task_type: 'social', frequency: 'weekly', icon_name: 'Users', sort_order: 4 },
    ],
    content: [
      { content_type: 'article', title: 'What low mood does to sleep, appetite and energy', duration_mins: 4, stage: 1, sort_order: 1 },
      { content_type: 'audio', title: 'A ten-minute breathing exercise for heavy days', duration_mins: 10, stage: 1, sort_order: 2 },
      { content_type: 'article', title: 'When to see a doctor about your mood', duration_mins: 3, stage: 1, sort_order: 3 },
    ],
    assessments: [
      { name: 'PHQ-9 check-in', assessment_type: 'weekly_check', instrument_code: 'PHQ9', sort_order: 1 },
    ],
  },
  {
    slug: 'calm-resilience',
    name: 'Calm & Resilience',
    short_tagline: 'Sixty days of practical ways to turn down anxiety and worry',
    description:
      'For anxiety, worry and the feeling of being permanently on edge. A short validated '
      + 'check-in (GAD-7) every two weeks shows whether things are easing, alongside daily '
      + 'breathing and wind-down practices. A psychologist or psychiatrist is available online '
      + 'or in person at any point.',
    category: 'mental_health',
    duration_days: 60,
    coach_type: 'hybrid',
    icon_name: 'Wind',
    color_hex: '#0ea5e9',
    tags: ['mental health', 'anxiety', 'stress', 'wellbeing'],
    sort_order: 21,
    tracking: [
      { param_key: 'stress', param_label: 'Stress level', unit: '1-10', normal_min: 1, normal_max: 4, tracking_freq: 'daily', score_weight: 1.5 },
      { param_key: 'mood', param_label: 'Daily mood', unit: '1-5', normal_min: 3, normal_max: 5, tracking_freq: 'daily', score_weight: 1 },
      { param_key: 'gad7', param_label: 'GAD-7 score', unit: 'points', normal_min: 0, normal_max: 4, tracking_freq: 'monthly', score_weight: 2 },
    ],
    tasks: [
      { title: 'Five minutes of slow breathing', task_type: 'breathing', frequency: 'daily', target_value: 5, unit: 'minutes', icon_name: 'Wind', sort_order: 1 },
      { title: 'Note what is on your mind', task_type: 'journal', frequency: 'daily', icon_name: 'PenLine', sort_order: 2 },
      { title: 'Screen-free half hour before bed', task_type: 'sleep', frequency: 'daily', target_value: 30, unit: 'minutes', icon_name: 'Moon', sort_order: 3 },
      { title: 'Twenty minutes of movement', task_type: 'exercise', frequency: 'daily', target_value: 20, unit: 'minutes', icon_name: 'Footprints', sort_order: 4 },
    ],
    content: [
      { content_type: 'article', title: 'Why anxiety shows up in your body first', duration_mins: 4, stage: 1, sort_order: 1 },
      { content_type: 'audio', title: 'Box breathing, guided', duration_mins: 6, stage: 1, sort_order: 2 },
      { content_type: 'exercise', title: 'Grounding when worry takes over', duration_mins: 5, stage: 1, sort_order: 3 },
    ],
    assessments: [
      { name: 'GAD-7 check-in', assessment_type: 'weekly_check', instrument_code: 'GAD7', sort_order: 1 },
    ],
  },
  {
    slug: 'sleep-reset',
    name: 'Sleep Reset',
    short_tagline: 'Forty-five days of habits that rebuild a normal night',
    description:
      'A habit-led programme for broken sleep: a consistent wind-down, a steady wake time and '
      + 'a daily sleep log, so you can see what is actually changing.',
    category: 'mental_health',
    duration_days: 45,
    coach_type: 'ai',
    icon_name: 'Moon',
    color_hex: '#4f46e5',
    tags: ['sleep', 'insomnia', 'wellbeing'],
    sort_order: 22,
    tracking: [
      { param_key: 'sleep_hours', param_label: 'Hours slept', unit: 'hours', normal_min: 7, normal_max: 9, tracking_freq: 'daily', score_weight: 2 },
      { param_key: 'sleep_quality', param_label: 'Sleep quality', unit: '1-5', normal_min: 3, normal_max: 5, tracking_freq: 'daily', score_weight: 1 },
    ],
    tasks: [
      { title: 'Log last night', task_type: 'sleep', frequency: 'daily', icon_name: 'Moon', sort_order: 1 },
      { title: 'Same wake time, every day', task_type: 'sleep', frequency: 'daily', icon_name: 'AlarmClock', sort_order: 2 },
      { title: 'No caffeine after 2pm', task_type: 'diet', frequency: 'daily', icon_name: 'Coffee', sort_order: 3 },
    ],
    content: [
      { content_type: 'article', title: 'How a wind-down routine actually works', duration_mins: 4, stage: 1, sort_order: 1 },
      { content_type: 'audio', title: 'A body scan to fall asleep to', duration_mins: 12, stage: 1, sort_order: 2 },
    ],
    // No validated instrument: the ISI is commercially licensed (RK-8).
    assessments: [],
  },
];

async function seedProgram(client, spec) {
  const { rows: [existing] } = await client.query(
    `SELECT id, name, status FROM health_programs WHERE slug = $1`, [spec.slug],
  );
  if (existing) {
    console.log(`  = ${spec.slug.padEnd(18)} already present (id ${existing.id}, ${existing.status}) — left untouched`);
    return { skipped: true };
  }
  if (DRY_RUN) {
    console.log(`  + ${spec.slug.padEnd(18)} WOULD insert: ${spec.tracking.length} params, `
      + `${spec.tasks.length} tasks, ${spec.content.length} content, ${spec.assessments.length} assessments`);
    return { inserted: true };
  }

  const { rows: [prog] } = await client.query(`
    INSERT INTO health_programs
      (name, slug, description, short_tagline, category, duration_days, coach_type,
       color_hex, icon_name, status, subscription_required, price_inr, tags, sort_order)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active',FALSE,0,$10,$11)
    RETURNING id
  `, [
    spec.name, spec.slug, spec.description, spec.short_tagline, spec.category,
    spec.duration_days, spec.coach_type, spec.color_hex, spec.icon_name,
    spec.tags, spec.sort_order,
  ]);

  for (const p of spec.tracking) {
    await client.query(`
      INSERT INTO program_tracking_params
        (program_id, param_key, param_label, unit, normal_min, normal_max, score_weight, tracking_freq, sort_order)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    `, [prog.id, p.param_key, p.param_label, p.unit, p.normal_min, p.normal_max,
        p.score_weight ?? 1, p.tracking_freq ?? 'daily', p.sort_order ?? 0]);
  }

  for (const t of spec.tasks) {
    await client.query(`
      INSERT INTO program_tasks
        (program_id, title, description, task_type, frequency, target_value, unit, icon_name, sort_order)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    `, [prog.id, t.title, t.description ?? null, t.task_type, t.frequency ?? 'daily',
        t.target_value ?? null, t.unit ?? null, t.icon_name ?? 'CheckCircle2', t.sort_order ?? 0]);
  }

  for (const c of spec.content) {
    await client.query(`
      INSERT INTO program_content
        (program_id, content_type, title, body, duration_mins, stage, sort_order, published)
      VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE)
    `, [prog.id, c.content_type, c.title, c.body ?? null,
        c.duration_mins ?? null, c.stage ?? 1, c.sort_order ?? 0]);
  }

  for (const a of spec.assessments) {
    // questions holds PRESENTATION metadata only — the authoritative item text
    // and the scoring tables live in mental-wellness-instruments.service.js, so a
    // score can never be produced from an editable database row (plan AD-5).
    await client.query(`
      INSERT INTO program_assessments (program_id, name, description, assessment_type, questions, sort_order)
      VALUES ($1,$2,$3,$4,$5,$6)
    `, [prog.id, a.name,
        'Served from the instrument registry; this row carries no scoring logic.',
        a.assessment_type,
        JSON.stringify({ instrumentCode: a.instrument_code, source: 'mental-wellness-instruments.service.js' }),
        a.sort_order ?? 0]);
  }

  console.log(`  + ${spec.slug.padEnd(18)} inserted (id ${prog.id})`);
  return { inserted: true };
}

export async function seed() {
  const client = await pool.connect();
  try {
    const { rows: [pre] } = await client.query(`SELECT COUNT(*)::int AS n FROM health_programs`);
    console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}health_programs before: ${pre.n} rows`);

    const { rows: missing } = await client.query(
      `SELECT 1 FROM information_schema.tables
        WHERE table_schema='public' AND table_name='program_assessment_responses'`);
    if (!missing.length) {
      console.warn('! program_assessment_responses is missing — run the '
        + '20261110000100-mental-wellness-instruments migration first, or check-ins cannot be saved.');
    }

    if (!DRY_RUN) await client.query('BEGIN');
    let inserted = 0;
    let skipped = 0;
    for (const spec of PROGRAMS) {
      const r = await seedProgram(client, spec);
      if (r.inserted) inserted += 1; else skipped += 1;
    }
    if (!DRY_RUN) await client.query('COMMIT');

    const { rows: [post] } = await client.query(`SELECT COUNT(*)::int AS n FROM health_programs`);
    console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}done — ${inserted} to insert/inserted, ${skipped} left untouched; `
      + `health_programs now: ${post.n} rows`);
  } catch (err) {
    if (!DRY_RUN) { try { await client.query('ROLLBACK'); } catch { /* ignore */ } }
    throw err;
  } finally {
    client.release();
  }
}

// Loader-aware: ssm-env-loader.mjs imports its target without rewriting argv,
// so argv[1] is the loader. See the same guard in the migration.
function invokedAsScript() {
  for (const candidate of [process.argv[1], process.argv[2]]) {
    if (!candidate) continue;
    try {
      if (pathToFileURL(path.resolve(process.cwd(), candidate)).href === import.meta.url) return true;
    } catch { /* not a path */ }
  }
  return false;
}

if (invokedAsScript()) {
  seed()
    .then(() => pool.end())
    .catch(async (error) => { console.error(error); await pool.end(); process.exitCode = 1; });
}

export default { seed, PROGRAMS };
