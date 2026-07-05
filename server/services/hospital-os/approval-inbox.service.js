/**
 * Hospital OS — human approval inbox (T1+ autonomous drafts)
 */
import pool from '../../db/pgPool.js';
import { up as migrate } from '../../migrations/hospital-os-2035.migration.js';
import { publishEvent } from './hospital-events.service.js';
import { routeLabOrder } from '../emr-order-router.service.js';

let ready = false;

async function ensureTables() {
  if (ready) return;
  await migrate();
  ready = true;
}

export async function createApproval({
  tenantId = 'default',
  approvalType,
  title,
  summary,
  draftPayload = {},
  patientId,
  requestedBy,
  assignedRole = 'doctor',
  riskTier = 'T1',
  source = 'hospital-os',
}) {
  await ensureTables();
  const { rows } = await pool.query(
    `INSERT INTO hospital_os_approvals
      (tenant_id, approval_type, title, summary, draft_payload, patient_id, requested_by, assigned_role, risk_tier, source)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      tenantId, approvalType, title, summary || null,
      JSON.stringify(draftPayload), patientId || null, requestedBy || null,
      assignedRole, riskTier, source,
    ]
  );
  const approval = rows[0];
  await publishEvent({
    tenantId,
    eventType: 'approval.created',
    source: 'approval-inbox',
    entityType: 'approval',
    entityId: approval.id,
    payload: { approvalType, title, riskTier },
  });
  return approval;
}

export async function listApprovals({ tenantId = 'default', status = 'pending', patientId, limit = 50 } = {}) {
  await ensureTables();
  const params = [tenantId, status];
  let sql = `SELECT * FROM hospital_os_approvals WHERE tenant_id = $1 AND status = $2`;
  if (patientId) {
    params.push(patientId);
    sql += ` AND patient_id = $${params.length}`;
  }
  params.push(Math.min(limit, 100));
  sql += ` ORDER BY created_at DESC LIMIT $${params.length}`;
  const { rows } = await pool.query(sql, params);
  return rows;
}

export async function reviewApproval({ approvalId, reviewerId, action, notes }) {
  await ensureTables();
  const status = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'pending';
  const { rows } = await pool.query(
    `UPDATE hospital_os_approvals
     SET status = $2, reviewed_by = $3, reviewed_at = NOW(), review_notes = $4, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [approvalId, status, reviewerId, notes || null]
  );
  const approval = rows[0];
  if (!approval) throw new Error('Approval not found');
  if (status === 'approved') {
    const result = await executeApproval(approval, reviewerId);
    return { approval, execution: result };
  }
  return { approval, execution: null };
}

async function executeApproval(approval, reviewerId) {
  const payload = approval.draft_payload || {};
  let result = { executed: false, message: 'No executor for type' };

  if (approval.approval_type === 'lab_order' && payload.labOrderId) {
    result = await routeLabOrder({
      labOrderId: payload.labOrderId,
      hospitalId: payload.hospitalId,
      patientId: approval.patient_id,
      doctorId: reviewerId,
      tests: payload.tests,
      testType: payload.testType,
      totalAmount: payload.totalAmount,
      orderNumber: payload.orderNumber,
      priority: payload.priority || 'routine',
      notes: payload.notes,
    });
    result.executed = true;
  }

  await pool.query(
    `UPDATE hospital_os_approvals SET executed_at = NOW(), execution_result = $2::jsonb, updated_at = NOW() WHERE id = $1`,
    [approval.id, JSON.stringify(result)]
  );

  await publishEvent({
    eventType: 'approval.executed',
    source: 'approval-inbox',
    entityType: 'approval',
    entityId: approval.id,
    payload: { approvalType: approval.approval_type, result },
  });

  return result;
}

export default { createApproval, listApprovals, reviewApproval };
