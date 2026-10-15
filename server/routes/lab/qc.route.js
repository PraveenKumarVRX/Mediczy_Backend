import express from 'express';
import pool from '../../db/pgPool.js';
import { authLab } from '../../middleware/authLab.middleware.js';
import { chartBands, evaluateWestgard, WESTGARD_RULES } from '../../services/lab-quality-control.service.js';

const router = express.Router();
router.use(authLab);

const actorId = (req) => String(req.lab?.email || req.lab?.id || 'lab');
const labId = (req) => Number(req.lab?.id);
const positiveInt = (value, fallback = 50) => Math.min(200, Math.max(1, Number.parseInt(value, 10) || fallback));

function materialInput(body = {}) {
  const input = {
    analyte: String(body.analyte || '').trim(),
    instrumentId: body.instrumentId ? String(body.instrumentId).trim() : null,
    level: String(body.level || 'normal').trim(),
    lotNumber: String(body.lotNumber || '').trim(),
    units: String(body.units || '').trim(),
    targetMean: Number(body.targetMean),
    targetSd: Number(body.targetSd),
  };
  if (!input.analyte || !input.lotNumber || !input.units || !Number.isFinite(input.targetMean) || !Number.isFinite(input.targetSd) || input.targetSd <= 0) {
    const error = new Error('analyte, lotNumber, units, targetMean and a positive targetSd are required');
    error.statusCode = 400;
    throw error;
  }
  return input;
}

async function getMaterial(client, id, lab) {
  const result = await client.query(
    `SELECT * FROM lab_qc_materials WHERE id = $1 AND lab_id = $2`,
    [id, lab],
  );
  return result.rows[0] || null;
}

router.get('/rules', (_req, res) => res.json({ success: true, rules: WESTGARD_RULES }));

router.get('/materials', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT m.*, COUNT(r.id)::int AS run_count,
              MAX(r.run_at) AS last_run_at
       FROM lab_qc_materials m
       LEFT JOIN lab_qc_runs r ON r.material_id = m.id AND r.lab_id = m.lab_id
       WHERE m.lab_id = $1
       GROUP BY m.id
       ORDER BY m.active DESC, m.analyte, m.level, m.lot_number`,
      [labId(req)],
    );
    res.json({ success: true, materials: result.rows });
  } catch (error) {
    console.error('[lab/qc] list materials:', error);
    res.status(500).json({ success: false, code: 'internal_error', message: 'Failed to load QC materials' });
  }
});

router.post('/materials', async (req, res) => {
  try {
    const input = materialInput(req.body);
    const result = await pool.query(
      `INSERT INTO lab_qc_materials
       (lab_id, analyte, instrument_id, level, lot_number, units, target_mean, target_sd, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [labId(req), input.analyte, input.instrumentId, input.level, input.lotNumber, input.units, input.targetMean, input.targetSd, actorId(req)],
    );
    res.status(201).json({ success: true, material: result.rows[0] });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, code: 'validation_failed', message: error.message });
    if (error.code === '23505') return res.status(409).json({ success: false, code: 'duplicate_qc_material', message: 'That QC material lot already exists' });
    console.error('[lab/qc] create material:', error);
    res.status(500).json({ success: false, code: 'internal_error', message: 'Failed to create QC material' });
  }
});

router.get('/materials/:id/chart', async (req, res) => {
  try {
    const material = await getMaterial(pool, req.params.id, labId(req));
    if (!material) return res.status(404).json({ success: false, code: 'not_found', message: 'QC material not found' });
    const limit = positiveInt(req.query.limit, 100);
    const result = await pool.query(
      `SELECT id, measured_value, z_score, decision, rule_flags, run_at, operator_id, instrument_run_id, notes
       FROM lab_qc_runs WHERE material_id = $1 AND lab_id = $2
       ORDER BY run_at DESC LIMIT $3`,
      [material.id, labId(req), limit],
    );
    res.json({
      success: true,
      material,
      bands: chartBands(material.target_mean, material.target_sd),
      points: result.rows.reverse(),
    });
  } catch (error) {
    console.error('[lab/qc] chart:', error);
    res.status(500).json({ success: false, code: 'internal_error', message: 'Failed to load QC chart' });
  }
});

router.post('/materials/:id/runs', async (req, res) => {
  const client = await pool.connect();
  try {
    const material = await getMaterial(client, req.params.id, labId(req));
    if (!material) return res.status(404).json({ success: false, code: 'not_found', message: 'QC material not found' });
    const value = Number(req.body.measuredValue);
    if (!Number.isFinite(value)) return res.status(400).json({ success: false, code: 'validation_failed', message: 'measuredValue must be a finite number' });

    await client.query('BEGIN');
    const history = await client.query(
      `SELECT measured_value FROM lab_qc_runs
       WHERE material_id = $1 AND lab_id = $2
       ORDER BY run_at DESC LIMIT 9`,
      [material.id, labId(req)],
    );
    const values = history.rows.reverse().map((row) => Number(row.measured_value));
    values.push(value);
    const decision = evaluateWestgard(values, material.target_mean, material.target_sd);
    const run = await client.query(
      `INSERT INTO lab_qc_runs
       (lab_id, material_id, measured_value, z_score, decision, rule_flags, operator_id, instrument_run_id, notes)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9)
       RETURNING *`,
      [labId(req), material.id, value, decision.zScore, decision.status, JSON.stringify(decision.flags), actorId(req), req.body.instrumentRunId || null, req.body.notes || null],
    );

    const nextRelease = decision.releaseBlocked ? 'locked' : decision.status === 'warning' && material.release_status === 'released' ? 'review' : material.release_status;
    if (nextRelease !== material.release_status) {
      await client.query(`UPDATE lab_qc_materials SET release_status = $1, updated_at = NOW() WHERE id = $2 AND lab_id = $3`, [nextRelease, material.id, labId(req)]);
    }
    await client.query(
      `INSERT INTO lab_qc_audit_events (lab_id, material_id, run_id, event_type, actor_id, reason, payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
      [labId(req), material.id, run.rows[0].id, `qc_run_${decision.status}`, actorId(req), req.body.notes || null, JSON.stringify({ flags: decision.flags, zScore: decision.zScore })],
    );
    await client.query('COMMIT');
    res.status(201).json({ success: true, run: run.rows[0], decision, releaseStatus: nextRelease });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[lab/qc] record run:', error);
    res.status(error.statusCode || 500).json({ success: false, code: error.statusCode ? 'validation_failed' : 'internal_error', message: error.statusCode ? error.message : 'Failed to record QC run' });
  } finally {
    client.release();
  }
});

router.post('/materials/:id/unlock', async (req, res) => {
  try {
    const material = await getMaterial(pool, req.params.id, labId(req));
    if (!material) return res.status(404).json({ success: false, code: 'not_found', message: 'QC material not found' });
    const reason = String(req.body.reason || '').trim();
    if (reason.length < 5) return res.status(400).json({ success: false, code: 'validation_failed', message: 'A release reason of at least 5 characters is required' });
    const updated = await pool.query(
      `UPDATE lab_qc_materials SET release_status = 'released', updated_at = NOW() WHERE id = $1 AND lab_id = $2 RETURNING *`,
      [material.id, labId(req)],
    );
    await pool.query(
      `INSERT INTO lab_qc_audit_events (lab_id, material_id, event_type, actor_id, reason, payload)
       VALUES ($1,$2,'qc_material_unlocked',$3,$4,'{}'::jsonb)`,
      [labId(req), material.id, actorId(req), reason],
    );
    res.json({ success: true, material: updated.rows[0] });
  } catch (error) {
    console.error('[lab/qc] unlock:', error);
    res.status(500).json({ success: false, code: 'internal_error', message: 'Failed to unlock QC material' });
  }
});

export default router;

