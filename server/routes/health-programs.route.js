import express from 'express';
import pool from '../db/pgPool.js';
import { authUser } from '../middleware/auth.middleware.js';
import instrumentsService from '../services/mental-wellness-instruments.service.js';
import { HELPLINES } from '../utils/crisis-detection.js';

const router = express.Router();

const getUserId = (req) => req.user?.id;

function dayOfEnrollment(startDate) {
  const start = new Date(startDate);
  const today = new Date();
  start.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return Math.max(1, Math.floor((today - start) / 86400000) + 1);
}

// ── GET /api/programs  — browse catalog ────────────────────────────────────────
// NOTE: must be FIRST — before /:slug to avoid shadowing
router.get('/', authUser, async (req, res) => {
  try {
    const { category, org_id } = req.query;
    const params = [];
    let where = `WHERE p.status = 'active'`;
    if (category) { params.push(category); where += ` AND p.category = $${params.length}`; }
    if (org_id)   { params.push(org_id);   where += ` AND (p.org_id = $${params.length} OR p.org_id IS NULL)`; }
    else          {                          where += ` AND p.org_id IS NULL`; }

    const { rows } = await pool.query(`
      SELECT p.*,
             COUNT(DISTINCT pe.id)::int AS enrolled_count
      FROM   health_programs p
      LEFT JOIN program_enrollments pe ON pe.program_id = p.id AND pe.status = 'active'
      ${where}
      GROUP  BY p.id
      ORDER  BY p.sort_order, p.name
    `, params);

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[programs] list error', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/programs/my  — enrolled programs for logged-in user ──────────────
// IMPORTANT: must come BEFORE /:slug
router.get('/my', authUser, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { rows } = await pool.query(`
      SELECT pe.id          AS enrollment_id,
             pe.uuid        AS enrollment_uuid,
             pe.status      AS enrollment_status,
             pe.start_date,
             pe.end_date,
             pe.enrolled_at,
             pe.personalized_plan,
             p.id           AS program_id,
             p.name,
             p.slug,
             p.short_tagline,
             p.category,
             p.duration_days,
             p.color_hex,
             p.icon_name,
             p.thumbnail_url,
             p.coach_type,
             COALESCE(task_stats.completed, 0)::int AS tasks_done_today,
             COALESCE(task_stats.total,     0)::int AS tasks_total_today,
             hs.total_score,
             hs.score_date  AS last_scored_at
      FROM   program_enrollments pe
      JOIN   health_programs p  ON p.id = pe.program_id
      LEFT JOIN LATERAL (
        SELECT COUNT(*) FILTER (WHERE ptl.completed) AS completed,
               COUNT(*)                               AS total
        FROM   program_tasks  pt
        JOIN   program_task_logs ptl
               ON ptl.task_id = pt.id
               AND ptl.enrollment_id = pe.id
               AND ptl.log_date = CURRENT_DATE
        WHERE  pt.program_id = p.id
          AND  pt.frequency  = 'daily'
      ) task_stats ON TRUE
      LEFT JOIN LATERAL (
        SELECT total_score, score_date
        FROM   program_health_scores
        WHERE  enrollment_id = pe.id
        ORDER  BY score_date DESC LIMIT 1
      ) hs ON TRUE
      WHERE  pe.user_id = $1
      ORDER  BY pe.enrolled_at DESC
    `, [userId]);

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[programs] my error', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/programs/enrollment/:enrollmentId  — journey ─────────────────────
// IMPORTANT: must come BEFORE /:slug
router.get('/enrollment/:enrollmentId', authUser, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { rows: [enrollment] } = await pool.query(`
      SELECT pe.*, p.name AS program_name, p.slug, p.color_hex, p.icon_name,
             p.category, p.duration_days, p.coach_type
      FROM   program_enrollments pe
      JOIN   health_programs p ON p.id = pe.program_id
      WHERE  pe.id = $1 AND pe.user_id = $2
    `, [req.params.enrollmentId, userId]);
    if (!enrollment) return res.status(404).json({ success: false, message: 'Enrollment not found' });

    const day = dayOfEnrollment(enrollment.start_date);
    const progress = Math.min(100, Math.round((day / enrollment.duration_days) * 100));

    const { rows: todayTasks } = await pool.query(`
      SELECT pt.*, ptl.completed, ptl.completed_at, ptl.value, ptl.notes
      FROM   program_tasks pt
      LEFT JOIN program_task_logs ptl
             ON ptl.task_id = pt.id
             AND ptl.enrollment_id = $1
             AND ptl.log_date = CURRENT_DATE
      WHERE  pt.program_id = $2
        AND  pt.frequency  = 'daily'
        AND  pt.day_start <= $3
        AND  (pt.day_end IS NULL OR pt.day_end >= $3)
      ORDER  BY pt.stage, pt.sort_order
    `, [enrollment.id, enrollment.program_id, day]);

    const { rows: scores } = await pool.query(`
      SELECT * FROM program_health_scores
      WHERE enrollment_id = $1 ORDER BY score_date DESC LIMIT 10
    `, [enrollment.id]);

    const { rows: devices } = await pool.query(`
      SELECT * FROM program_device_connections WHERE enrollment_id=$1 AND is_active=TRUE
    `, [enrollment.id]);

    const currentStage = day <= 7 ? 1 : day <= 30 ? 2 : day <= 60 ? 3 : day <= 80 ? 4 : 5;
    const { rows: content } = await pool.query(`
      SELECT * FROM program_content
      WHERE program_id=$1 AND stage<=$2 AND published=TRUE
      ORDER BY stage DESC, sort_order LIMIT 5
    `, [enrollment.program_id, currentStage]);

    res.json({
      success: true,
      data: { enrollment, day, progress_pct: progress, current_stage: currentStage,
              today_tasks: todayTasks, scores, devices, content }
    });
  } catch (err) {
    console.error('[programs] journey error', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PATCH /api/programs/tasks/:taskId/complete ────────────────────────────────
// IMPORTANT: must come BEFORE /:slug
router.patch('/tasks/:taskId/complete', authUser, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userId = getUserId(req);
    const { enrollment_id, completed, value, notes } = req.body;

    const { rows: [enr] } = await client.query(
      `SELECT id FROM program_enrollments WHERE id=$1 AND user_id=$2`,
      [enrollment_id, userId]
    );
    if (!enr) return res.status(403).json({ success: false, message: 'Forbidden' });

    const { rows: [log] } = await client.query(`
      INSERT INTO program_task_logs (enrollment_id, task_id, log_date, completed, completed_at, value, notes)
      VALUES ($1, $2, CURRENT_DATE, $3, CASE WHEN $3 THEN NOW() ELSE NULL END, $4, $5)
      ON CONFLICT (enrollment_id, task_id, log_date) DO UPDATE
        SET completed=$3, completed_at=CASE WHEN $3 THEN NOW() ELSE NULL END,
            value=$4, notes=$5
      RETURNING *
    `, [enrollment_id, req.params.taskId, completed ?? true, value ?? null, notes ?? null]);

    await client.query('COMMIT');
    res.json({ success: true, data: log });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[programs] complete task error', err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
});

// ── POST /api/programs/devices ────────────────────────────────────────────────
router.post('/devices', authUser, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { enrollment_id, device_type, device_name, vendor, device_id } = req.body;

    const { rows: [enr] } = await pool.query(
      `SELECT id FROM program_enrollments WHERE id=$1 AND user_id=$2`,
      [enrollment_id, userId]
    );
    if (!enr) return res.status(403).json({ success: false, message: 'Forbidden' });

    const { rows: [device] } = await pool.query(`
      INSERT INTO program_device_connections (enrollment_id, device_type, device_name, vendor, device_id)
      VALUES ($1,$2,$3,$4,$5) RETURNING *
    `, [enrollment_id, device_type, device_name, vendor, device_id]);

    res.status(201).json({ success: true, data: device });
  } catch (err) {
    console.error('[programs] device connect error', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Admin: POST /api/programs  — create program ───────────────────────────────
router.post('/', authUser, async (req, res) => {
  try {
    if (!['admin','team','super_admin'].includes(req.userRole)) {
      return res.status(403).json({ success: false, message: 'Admin only' });
    }
    const {
      name, slug, description, short_tagline, category, duration_days,
      coach_type, thumbnail_url, color_hex, icon_name, org_id,
      subscription_required, price_inr, tags, sort_order
    } = req.body;

    const { rows: [prog] } = await pool.query(`
      INSERT INTO health_programs
        (name,slug,description,short_tagline,category,duration_days,coach_type,
         thumbnail_url,color_hex,icon_name,org_id,subscription_required,price_inr,tags,sort_order)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING *
    `, [name, slug, description, short_tagline, category, duration_days ?? 90,
        coach_type ?? 'hybrid', thumbnail_url, color_hex ?? '#0d9488',
        icon_name ?? 'Heart', org_id, subscription_required ?? false,
        price_inr ?? 0, tags ?? [], sort_order ?? 0]);

    res.status(201).json({ success: true, data: prog });
  } catch (err) {
    console.error('[programs] create error', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// MED-MIND-001 — mental-wellness instruments (PHQ-9, GAD-7)
// Plan: docs/planning/MENTAL_WELLNESS_MODULE_IMPLEMENTATION_PLAN_2026-11-08.md
//
// These live on /api/programs deliberately (plan AD-1): the prefix is already
// allow-listed for both `user` and `patient` in ringFencing.js, so a new prefix
// would 403 for every patient until both allow-lists were edited.
//
// They MUST stay above the /:slug catch-all below (plan R-3) — declared after it,
// GET /instruments resolves to the slug handler and 404s as "Program not found".
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Confirm the enrollment belongs to the calling user. Returns the row, or null.
 * Never trust an enrollment id from the client without this.
 */
async function loadOwnEnrollment(enrollmentId, userId) {
  const id = Number.parseInt(enrollmentId, 10);
  if (!Number.isInteger(id) || id <= 0) return null;
  const { rows: [row] } = await pool.query(
    `SELECT e.id, e.user_id, e.program_id, p.name AS program_name, p.slug AS program_slug
       FROM program_enrollments e
       JOIN health_programs p ON p.id = e.program_id
      WHERE e.id = $1 AND e.user_id = $2`,
    [id, userId],
  );
  return row || null;
}

// ── GET /api/programs/instruments — catalogue of screening instruments ────────
router.get('/instruments', authUser, (req, res) => {
  res.json({
    success: true,
    data: instrumentsService.listInstruments(),
    disclaimer: instrumentsService.DISCLAIMER,
    // Phase 3: served from the one shared list so the client never has to ship
    // its own copy of a crisis number. The client keeps a hardcoded fallback for
    // the case where this call fails — a crisis panel with no number on it would
    // be worse than a stale one.
    helplines: HELPLINES,
  });
});

// ── POST /api/programs/enrollment/:id/assessments — submit answers ────────────
router.post('/enrollment/:id/assessments', authUser, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'Not signed in' });

    const enrollment = await loadOwnEnrollment(req.params.id, userId);
    if (!enrollment) {
      // Same response whether it does not exist or belongs to someone else, so
      // this cannot be used to probe for other people's enrollment ids.
      return res.status(404).json({ success: false, message: 'Enrollment not found' });
    }

    const { instrumentCode, answers, assessmentId } = req.body || {};

    let result;
    try {
      result = instrumentsService.score(instrumentCode, answers);
    } catch (err) {
      if (err instanceof instrumentsService.InstrumentAnswerError) {
        return res.status(400).json({ success: false, message: err.message });
      }
      throw err;
    }

    // Only accept an assessmentId that belongs to this enrollment's program.
    let resolvedAssessmentId = null;
    if (assessmentId !== undefined && assessmentId !== null) {
      const aId = Number.parseInt(assessmentId, 10);
      if (Number.isInteger(aId) && aId > 0) {
        const { rows: [a] } = await pool.query(
          `SELECT id FROM program_assessments WHERE id = $1 AND program_id = $2`,
          [aId, enrollment.program_id],
        );
        if (a) resolvedAssessmentId = a.id;
      }
    }

    const { rows: [saved] } = await pool.query(`
      INSERT INTO program_assessment_responses
        (enrollment_id, assessment_id, instrument_code, instrument_ver,
         answers, raw_score, severity_band, flagged_items, is_self_report)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE)
      RETURNING id, administered_at
    `, [
      enrollment.id,
      resolvedAssessmentId,
      result.instrumentCode,
      result.instrumentVersion,
      JSON.stringify(result.answers),
      result.rawScore,
      result.band,
      JSON.stringify(result.flaggedItems),
    ]);

    res.status(201).json({
      success: true,
      data: {
        id: saved.id,
        administeredAt: saved.administered_at,
        instrumentCode: result.instrumentCode,
        instrumentVersion: result.instrumentVersion,
        rawScore: result.rawScore,
        maxScore: result.maxScore,
        band: result.band,
        interpretation: result.interpretation,
        flaggedItems: result.flaggedItems,
        // The client uses this to raise the crisis pathway (Phase 3). It is a
        // deterministic consequence of the patient's own answer, not a prediction.
        crisis: result.crisis,
        // The helplines travel with the flag, so a client that forgets to carry
        // its own list still has numbers to show. Null when nothing is flagged.
        support: result.support,
      },
      disclaimer: result.disclaimer,
    });
  } catch (err) {
    console.error('[programs] assessment submit error', err);
    res.status(500).json({ success: false, message: 'Could not save your check-in' });
  }
});

// ── GET /api/programs/enrollment/:id/assessments — own response history ───────
router.get('/enrollment/:id/assessments', authUser, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'Not signed in' });

    const enrollment = await loadOwnEnrollment(req.params.id, userId);
    if (!enrollment) return res.status(404).json({ success: false, message: 'Enrollment not found' });

    const instrumentCode = instrumentsService.normalizeInstrumentCode(req.query.instrumentCode);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 200);

    const { rows } = await pool.query(`
      SELECT id, instrument_code, instrument_ver, raw_score, severity_band,
             flagged_items, administered_at
        FROM program_assessment_responses
       WHERE enrollment_id = $1
         AND ($2::text IS NULL OR instrument_code = $2)
       ORDER BY administered_at DESC
       LIMIT $3
    `, [enrollment.id, instrumentCode, limit]);

    res.json({
      success: true,
      data: rows.map((r) => {
        const instrument = instrumentsService.getInstrument(r.instrument_code);
        return {
          id: r.id,
          instrumentCode: r.instrument_code,
          instrumentVersion: r.instrument_ver,
          instrumentName: instrument?.name || r.instrument_code,
          rawScore: r.raw_score === null ? null : Number(r.raw_score),
          maxScore: instrument?.maxScore ?? null,
          band: r.severity_band,
          flaggedItems: r.flagged_items || [],
          administeredAt: r.administered_at,
        };
      }),
      disclaimer: instrumentsService.DISCLAIMER,
    });
  } catch (err) {
    console.error('[programs] assessment history error', err);
    res.status(500).json({ success: false, message: 'Could not load your check-in history' });
  }
});

// ── GET /api/programs/:slug  — program detail ─────────────────────────────────
// MUST be LAST — it's a catch-all for slugs
router.get('/:slug', authUser, async (req, res) => {
  try {
    const { rows: [prog] } = await pool.query(
      `SELECT * FROM health_programs WHERE slug = $1 AND status = 'active'`,
      [req.params.slug]
    );
    if (!prog) return res.status(404).json({ success: false, message: 'Program not found' });

    const [params, tasks, content, assessments] = await Promise.all([
      pool.query(`SELECT * FROM program_tracking_params WHERE program_id=$1 ORDER BY sort_order`, [prog.id]),
      pool.query(`SELECT * FROM program_tasks WHERE program_id=$1 ORDER BY stage, sort_order`, [prog.id]),
      pool.query(`SELECT * FROM program_content WHERE program_id=$1 AND published=TRUE ORDER BY stage, sort_order`, [prog.id]),
      pool.query(`SELECT id,name,description,assessment_type,sort_order FROM program_assessments WHERE program_id=$1 ORDER BY sort_order`, [prog.id]),
    ]);

    res.json({
      success: true,
      data: { ...prog, tracking_params: params.rows, tasks: tasks.rows,
              content: content.rows, assessments: assessments.rows }
    });
  } catch (err) {
    console.error('[programs] detail error', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/programs/:slug/enroll ──────────────────────────────────────────
router.post('/:slug/enroll', authUser, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userId = getUserId(req);

    const { rows: [prog] } = await client.query(
      `SELECT id, duration_days FROM health_programs WHERE slug=$1 AND status='active'`,
      [req.params.slug]
    );
    if (!prog) return res.status(404).json({ success: false, message: 'Program not found' });

    const startDate = new Date();
    const endDate   = new Date(startDate);
    endDate.setDate(endDate.getDate() + prog.duration_days);

    const { rows: [enrollment] } = await client.query(`
      INSERT INTO program_enrollments (user_id, program_id, start_date, end_date, org_id)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id, program_id) DO UPDATE
        SET status='active', start_date=EXCLUDED.start_date, end_date=EXCLUDED.end_date
      RETURNING *
    `, [userId, prog.id, startDate.toISOString().slice(0,10), endDate.toISOString().slice(0,10), req.body.org_id || null]);

    const { rows: tasks } = await client.query(
      `SELECT id FROM program_tasks WHERE program_id=$1 AND frequency='daily' AND day_start=1`,
      [prog.id]
    );
    for (const task of tasks) {
      await client.query(`
        INSERT INTO program_task_logs (enrollment_id, task_id, log_date)
        VALUES ($1, $2, CURRENT_DATE) ON CONFLICT DO NOTHING
      `, [enrollment.id, task.id]);
    }

    await client.query('COMMIT');
    res.status(201).json({ success: true, data: enrollment });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[programs] enroll error', err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
});

export default router;
