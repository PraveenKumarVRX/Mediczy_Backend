import express from 'express';
import { db } from '../../db/index.js';
import { requirePharmacyAuth } from '../../middleware/pharmacyAuth.middleware.js';
import crypto from 'node:crypto';
import { ensurePharmacyGovernanceReady, recordControlledMovement, pharmacyGovernanceError } from '../../services/pharmacy-inventory-governance.service.js';
import { logPharmacyAudit } from '../../services/pharmacy-audit.service.js';

const router = express.Router();
router.use(requirePharmacyAuth);
const actorId = (req) => req.pharmacyToken?.id || req.user?.id;
const pharmacyId = (req) => req.pharmacyId;

router.post('/controlled-movements', async (req, res) => {
  try {
    const result = await recordControlledMovement({ ...req.body, pharmacyId: pharmacyId(req), organizationId: req.user?.tenant_id || null, actorId: actorId(req) });
    await logPharmacyAudit({ pharmacyId: pharmacyId(req), actorId: actorId(req), action: 'controlled.movement', resourceType: 'controlled_movement', resourceId: result.movement?.id, details: { movementType: req.body.movementType, medicineId: req.body.medicineId, replayed: result.replayed }, req });
    return res.status(result.replayed ? 200 : 201).json({ success: true, ...result });
  } catch (error) { return res.status(error.status || 500).json({ success: false, code: error.code || 'CONTROLLED_MOVEMENT_FAILED', message: error.message }); }
});

router.get('/controlled-register', async (req, res) => {
  try {
    await ensurePharmacyGovernanceReady();
    const limit = Math.min(250, Math.max(1, Number.parseInt(req.query.limit, 10) || 100));
    const result = await db.query(`SELECT * FROM pharmacy_controlled_movements WHERE pharmacy_id = $1 ORDER BY created_at DESC LIMIT $2`, [pharmacyId(req), limit]);
    return res.json({ success: true, movements: result.rows });
  } catch (error) { return res.status(error.status || 503).json({ success: false, code: error.code || 'PHARMACY_GOVERNANCE_UNAVAILABLE', message: error.message || 'Controlled register is unavailable' }); }
});

router.post('/wastage', async (req, res) => {
  const { medicineId, batchId, quantity, reason, notes, idempotencyKey } = req.body || {};
  try {
    await ensurePharmacyGovernanceReady();
    if (!medicineId || !batchId || !Number.isInteger(Number(quantity)) || Number(quantity) <= 0 || !reason || !idempotencyKey) return res.status(422).json({ success: false, code: 'validation_failed', message: 'Medicine, batch, positive quantity, reason and Idempotency-Key are required' });
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(String(idempotencyKey))) return res.status(422).json({ success: false, code: 'validation_failed', message: 'Invalid Idempotency-Key' });
    const requestHash = crypto.createHash('sha256').update(JSON.stringify({ medicineId, batchId: batchId || null, quantity, reason, notes: notes || null })).digest('hex');
    const existing = await db.query('SELECT * FROM pharmacy_wastage WHERE pharmacy_id = $1 AND idempotency_key = $2', [pharmacyId(req), idempotencyKey]);
    if (existing.rows[0]) {
      if (existing.rows[0].request_hash !== requestHash) return res.status(422).json({ success: false, code: 'idempotency_key_reuse', message: 'Idempotency key was already used for another wastage record' });
      return res.json({ success: true, replayed: true, wastage: existing.rows[0] });
    }
    const pool = await db.getClient();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const batch = batchId
        ? (await client.query(`SELECT id, quantity FROM pharmacy_batches WHERE id = $1 AND pharmacy_id = $2 AND medicine_id = $3 FOR UPDATE`, [batchId, pharmacyId(req), medicineId])).rows[0]
        : null;
      if (batchId && !batch) throw pharmacyGovernanceError('Batch not found for this pharmacy and medicine', 'not_found', 404);
      if (batch && Number(batch.quantity) < Number(quantity)) throw pharmacyGovernanceError('Wastage exceeds the available batch quantity', 'insufficient_stock', 409);
      if (batch) await client.query(`UPDATE pharmacy_batches SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2`, [quantity, batch.id]);
      const result = await client.query(`INSERT INTO pharmacy_wastage (pharmacy_id, organization_id, medicine_id, batch_id, quantity, reason, notes, idempotency_key, request_hash, actor_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [pharmacyId(req), req.user?.tenant_id || null, medicineId, batchId || null, quantity, reason, notes || null, idempotencyKey, requestHash, actorId(req)]);
      await client.query(`INSERT INTO pharmacy_stock_movements (pharmacy_id, organization_id, medicine_id, batch_id, movement_type, quantity, balance_after, reference_type, reference_id, idempotency_key, request_hash, reason, actor_id) VALUES ($1,$2,$3,$4,'wastage',$5,$6,'wastage',$7,$8,$9,$10,$11)`, [pharmacyId(req), req.user?.tenant_id || null, medicineId, batchId || null, quantity, batch ? Number(batch.quantity) - Number(quantity) : null, result.rows[0].id, `${idempotencyKey}:movement`, requestHash, reason, actorId(req)]);
      await client.query('COMMIT');
      await logPharmacyAudit({ pharmacyId: pharmacyId(req), actorId: actorId(req), action: 'wastage.create', resourceType: 'wastage', resourceId: result.rows[0]?.id, details: { medicineId, quantity, reason }, req });
      return res.status(201).json({ success: true, wastage: result.rows[0] });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  } catch (error) { return res.status(error.status || 503).json({ success: false, code: error.code || 'WASTAGE_FAILED', message: error.message }); }
});

router.get('/recalls', async (req, res) => {
  try {
    await ensurePharmacyGovernanceReady();
    const result = await db.query(`SELECT r.*, COUNT(ri.id)::int AS item_count FROM pharmacy_recalls r LEFT JOIN pharmacy_recall_items ri ON ri.recall_id = r.id WHERE r.pharmacy_id = $1 GROUP BY r.id ORDER BY r.created_at DESC`, [pharmacyId(req)]);
    return res.json({ success: true, recalls: result.rows });
  } catch (error) { return res.status(error.status || 503).json({ success: false, code: error.code || 'RECALLS_UNAVAILABLE', message: error.message }); }
});

router.post('/recalls', async (req, res) => {
  const { recallNumber, reason, items } = req.body || {};
  const clientPool = await db.getClient();
  const client = await clientPool.connect();
  try {
    if (!recallNumber || !reason || !Array.isArray(items) || !items.length) return res.status(422).json({ success: false, code: 'validation_failed', message: 'Recall number, reason and at least one item are required' });
    await ensurePharmacyGovernanceReady();
    await client.query('BEGIN');
    const recall = (await client.query(`INSERT INTO pharmacy_recalls (pharmacy_id, organization_id, recall_number, reason, opened_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [pharmacyId(req), req.user?.tenant_id || null, recallNumber, reason, actorId(req)])).rows[0];
    for (const item of items) {
      if (!item.medicineId || !Number.isInteger(Number(item.quantity)) || Number(item.quantity) <= 0) throw pharmacyGovernanceError('Recall items require medicineId and positive quantity', 'validation_failed', 422);
      await client.query(`INSERT INTO pharmacy_recall_items (recall_id, pharmacy_id, medicine_id, batch_id, quantity) VALUES ($1,$2,$3,$4,$5)`, [recall.id, pharmacyId(req), item.medicineId, item.batchId || null, item.quantity]);
    }
    await client.query('COMMIT');
    await logPharmacyAudit({ pharmacyId: pharmacyId(req), actorId: actorId(req), action: 'recall.create', resourceType: 'recall', resourceId: recall.id, details: { recallNumber, itemCount: items.length }, req });
    return res.status(201).json({ success: true, recall });
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); return res.status(error.status || 500).json({ success: false, code: error.code || 'RECALL_FAILED', message: error.message }); }
  finally { client.release(); }
});

export default router;
