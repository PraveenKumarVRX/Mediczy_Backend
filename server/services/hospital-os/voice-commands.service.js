/**
 * Hospital OS — voice command → draft actions (approval inbox)
 */
import pool from '../../db/pgPool.js';
import { createApproval } from './approval-inbox.service.js';
import { up as migrate } from '../../migrations/hospital-os-2035.migration.js';

async function insertLabOrderDraft({ patientId, doctorId, hospitalId, tests, priority, notes }) {
  const testList = Array.isArray(tests) ? tests : [{ name: String(tests), price: 0 }];
  const orderNumber = `LAB-${Date.now()}`;
  const { rows } = await pool.query(
    `INSERT INTO lab_orders (patient_id, doctor_id, test_type, status, priority, notes, order_number, tests, total_amount, hospital_id, created_at, updated_at)
     VALUES ($1, $2, $3, 'draft', $4, $5, $6, $7::jsonb, $8, $9, NOW(), NOW())
     RETURNING id`,
    [
      patientId,
      doctorId,
      testList.map((t) => t.name).join(', '),
      priority || 'routine',
      notes || 'Voice draft — pending approval',
      orderNumber,
      JSON.stringify(testList),
      testList.reduce((s, t) => s + (Number(t.price) || 0), 0),
      hospitalId,
    ]
  ).catch(async () => {
    const { rows: r2 } = await pool.query(
      `INSERT INTO lab_orders (patient_id, doctor_id, test_type, status, created_at)
       VALUES ($1, $2, $3, 'draft', NOW()) RETURNING id`,
      [patientId, doctorId, testList.map((t) => t.name).join(', ')]
    );
    return r2;
  });
  return { labOrderId: rows[0].id, orderNumber, tests: testList };
}

export async function draftLabOrderFromVoice({
  utterance,
  patientId,
  doctorId,
  hospitalId,
  tests,
  priority,
  tenantId = 'default',
}) {
  await migrate();
  const draft = await insertLabOrderDraft({ patientId, doctorId, hospitalId, tests, priority, notes: utterance });

  const approval = await createApproval({
    tenantId,
    approvalType: 'lab_order',
    title: `Lab order: ${draft.tests.map((t) => t.name).join(', ')}`,
    summary: utterance,
    patientId,
    requestedBy: doctorId,
    riskTier: 'T1',
    source: 'voice',
    draftPayload: {
      labOrderId: draft.labOrderId,
      hospitalId,
      tests: draft.tests,
      orderNumber: draft.orderNumber,
      priority,
    },
  });

  await pool.query(
    `INSERT INTO hospital_os_voice_drafts (tenant_id, user_id, utterance, intent, draft_payload, approval_id, status)
     VALUES ($1, $2, $3, 'draft_lab_order', $4::jsonb, $5, 'pending_approval')`,
    [tenantId, doctorId, utterance, JSON.stringify(draft), approval.id]
  );

  return {
    success: true,
    message: 'Lab order drafted — awaiting physician approval',
    approvalId: approval.id,
    labOrderId: draft.labOrderId,
    tier: 'T1',
    requiresApproval: true,
  };
}

export async function draftImagingOrderFromVoice({
  utterance,
  patientId,
  doctorId,
  hospitalId,
  modality,
  bodyPart,
  tenantId = 'default',
}) {
  await migrate();
  const approval = await createApproval({
    tenantId,
    approvalType: 'imaging_order',
    title: `Imaging: ${modality} ${bodyPart || ''}`.trim(),
    summary: utterance,
    patientId,
    requestedBy: doctorId,
    riskTier: 'T1',
    source: 'voice',
    draftPayload: { modality, bodyPart, hospitalId, patientId, doctorId, status: 'draft' },
  });

  await pool.query(
    `INSERT INTO hospital_os_voice_drafts (tenant_id, user_id, utterance, intent, draft_payload, approval_id, status)
     VALUES ($1, $2, $3, 'draft_imaging_order', $4::jsonb, $5, 'pending_approval')`,
    [tenantId, doctorId, utterance, JSON.stringify({ modality, bodyPart }), approval.id]
  );

  return {
    success: true,
    message: 'Imaging order drafted — awaiting approval',
    approvalId: approval.id,
    tier: 'T1',
    requiresApproval: true,
  };
}

export async function draftTeamNotification({
  utterance,
  team,
  patientId,
  requestedBy,
  tenantId = 'default',
}) {
  await migrate();
  const approval = await createApproval({
    tenantId,
    approvalType: 'team_notification',
    title: `Notify ${team}`,
    summary: utterance,
    patientId,
    requestedBy,
    riskTier: 'T0',
    source: 'voice',
    draftPayload: { team, message: utterance, patientId },
  });

  return {
    success: true,
    approvalId: approval.id,
    message: `Notification to ${team} queued`,
    tier: 'T0',
    requiresApproval: false,
  };
}

export default { draftLabOrderFromVoice, draftImagingOrderFromVoice, draftTeamNotification };
