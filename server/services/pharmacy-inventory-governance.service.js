import crypto from 'node:crypto';
import { QueryTypes } from 'sequelize';
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import sharedPool from '../db/pgPool.js';

const hash = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const key = (value) => {
  const normalized = String(value || '').trim();
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(normalized)) {
    const error = Object.assign(new Error('Idempotency-Key must be 8-128 characters using A-Z, a-z, 0-9, dot, underscore, colon or hyphen'), { code: 'validation_failed', status: 422 });
    throw error;
  }
  return normalized;
};
const fail = (message, code, status) => Object.assign(new Error(message), { code, status });

export async function ensurePharmacyGovernanceReady() {
  // Uses the raw pg pool, not Sequelize: Sequelize sniffs any query against
  // information_schema.tables and auto-classifies it as a "show tables" query,
  // reformatting the result into a flat array of table-name strings regardless of
  // the `type` option passed — so `r.table_name` always comes back undefined and
  // this check could never pass. Confirmed directly against prod (2026-10-19).
  const { rows } = await sharedPool.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name IN ('pharmacy_stock_movements','pharmacy_controlled_movements','pharmacy_wastage','pharmacy_recalls','pharmacy_recall_items')
  `);
  const present = new Set((rows || []).map((r) => r.table_name));
  const required = ['pharmacy_stock_movements','pharmacy_controlled_movements','pharmacy_wastage','pharmacy_recalls','pharmacy_recall_items'];
  if (required.some((table) => !present.has(table))) throw fail('Pharmacy governance schema is not migrated', 'PHARMACY_GOVERNANCE_SCHEMA_NOT_READY', 503);
  return true;
}

export async function issueFefo(client, { pharmacyId, organizationId = null, medicineId, quantity, referenceType, referenceId, actorId, idempotencyKey }) {
  await ensurePharmacyGovernanceReady();
  const qty = Number(quantity);
  if (!pharmacyId || !Number.isInteger(Number(medicineId)) || !Number.isInteger(qty) || qty <= 0) throw fail('Pharmacy, medicine and positive quantity are required', 'validation_failed', 422);
  const movementKeyBase = key(idempotencyKey || `issue-${referenceType || 'sale'}-${referenceId || Date.now()}-${medicineId}`);
  const requestHash = hash({ pharmacyId, organizationId, medicineId: Number(medicineId), qty, referenceType: referenceType || null, referenceId: referenceId || null });
  const existing = await client.query('SELECT * FROM pharmacy_stock_movements WHERE pharmacy_id = $1 AND idempotency_key LIKE $2 FOR UPDATE', [pharmacyId, `${movementKeyBase}:%`]);
  if (existing.rows.length) {
    if (existing.rows.some((row) => row.request_hash !== requestHash)) throw fail('Idempotency key was already used for another stock issue', 'idempotency_key_reuse', 422);
    return { replayed: true, movements: existing.rows };
  }

  const batches = await client.query(`
    SELECT id, quantity, COALESCE(reserved_quantity, 0) AS reserved_quantity
    FROM pharmacy_batches
    WHERE pharmacy_id = $1 AND medicine_id = $2
      AND quantity - COALESCE(reserved_quantity, 0) > 0
      AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
    ORDER BY expiry_date NULLS LAST, created_at ASC, id ASC
    FOR UPDATE
  `, [pharmacyId, medicineId]);
  let remaining = qty;
  const movements = [];
  for (const batch of batches.rows) {
    if (remaining <= 0) break;
    const available = Number(batch.quantity) - Number(batch.reserved_quantity || 0);
    const take = Math.min(remaining, available);
    if (take <= 0) continue;
    const updated = await client.query(`UPDATE pharmacy_batches SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2 RETURNING quantity`, [take, batch.id]);
    const movementKey = `${movementKeyBase}:${batch.id}`;
    const [movement] = (await client.query(`
      INSERT INTO pharmacy_stock_movements (pharmacy_id, organization_id, medicine_id, batch_id, movement_type, quantity, balance_after, reference_type, reference_id, idempotency_key, request_hash, actor_id)
      VALUES ($1,$2,$3,$4,'issue',$5,$6,$7,$8,$9,$10,$11) RETURNING *
    `, [pharmacyId, organizationId, medicineId, batch.id, take, updated.rows[0].quantity, referenceType || null, referenceId || null, movementKey, requestHash, actorId || null])).rows;
    movements.push(movement);
    remaining -= take;
  }
  if (remaining > 0) throw fail(`Insufficient non-expired batch stock for medicine ${medicineId}`, 'insufficient_stock', 409);
  return { replayed: false, movements };
}

export async function recordControlledMovement(input) {
  await ensurePharmacyGovernanceReady();
  if (!input.pharmacyId || !Number.isInteger(Number(input.medicineId)) || !Number.isFinite(Number(input.quantity)) || Number(input.quantity) <= 0) throw fail('Pharmacy, medicine and positive quantity are required', 'validation_failed', 422);
  if (!['receive', 'issue', 'return', 'wastage', 'adjustment'].includes(input.movementType)) throw fail('Unsupported controlled-drug movement type', 'validation_failed', 422);
  const movementKey = key(input.idempotencyKey);
  const requestHash = hash({ ...input, idempotencyKey: undefined });
  return sequelize.transaction(async (transaction) => {
    const existing = await sequelize.query('SELECT * FROM pharmacy_controlled_movements WHERE pharmacy_id = :pharmacyId AND idempotency_key = :idempotencyKey FOR UPDATE', { replacements: { pharmacyId: input.pharmacyId, idempotencyKey: movementKey }, type: QueryTypes.SELECT, transaction });
    if (existing[0]) {
      if (existing[0].request_hash !== requestHash) throw fail('Idempotency key was already used for another controlled-drug movement', 'idempotency_key_reuse', 422);
      return { replayed: true, movement: existing[0] };
    }
    if (['issue', 'wastage'].includes(input.movementType) && !input.witnessId) throw fail('A second-person witness is required', 'witness_required', 422);
    const [balanceRow] = await sequelize.query(`
      SELECT COALESCE(SUM(CASE WHEN movement_type IN ('receive','return') THEN quantity WHEN movement_type IN ('issue','wastage') THEN -quantity ELSE 0 END), 0) AS balance
      FROM pharmacy_controlled_movements WHERE pharmacy_id = :pharmacyId AND medicine_id = :medicineId
    `, { replacements: { pharmacyId: input.pharmacyId, medicineId: input.medicineId }, type: QueryTypes.SELECT, transaction });
    const signed = ['receive', 'return'].includes(input.movementType) ? Number(input.quantity) : -Number(input.quantity);
    const balanceAfter = Number(balanceRow?.balance || 0) + signed;
    if (balanceAfter < 0) throw fail('Controlled-drug movement would make the register negative', 'insufficient_controlled_stock', 409);
    // QueryTypes.INSERT returns [insertedRows, rowCount] — destructure both levels,
    // not just the outer tuple (confirmed directly against prod: the single-level
    // destructure used here previously returned the whole rows array as "movement").
    const [[row]] = await sequelize.query(`
      INSERT INTO pharmacy_controlled_movements (pharmacy_id, organization_id, medicine_id, batch_id, movement_type, quantity, balance_after, patient_id, prescription_id, witness_id, reason, idempotency_key, request_hash, actor_id)
      VALUES (:pharmacyId,:organizationId,:medicineId,:batchId,:movementType,:quantity,:balanceAfter,:patientId,:prescriptionId,:witnessId,:reason,:idempotencyKey,:requestHash,:actorId) RETURNING *
    `, { replacements: { pharmacyId: input.pharmacyId, organizationId: input.organizationId || null, medicineId: input.medicineId, batchId: input.batchId || null, movementType: input.movementType, quantity: input.quantity, balanceAfter, patientId: input.patientId || null, prescriptionId: input.prescriptionId || null, witnessId: input.witnessId || null, reason: input.reason || null, idempotencyKey: movementKey, requestHash, actorId: input.actorId || null }, type: QueryTypes.INSERT, transaction });
    return { replayed: false, movement: row };
  });
}

export { fail as pharmacyGovernanceError };
