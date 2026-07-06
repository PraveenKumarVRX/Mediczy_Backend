/**
 * Phase 1–2: Imaging workflow state machine (Temporal-ready; DB-backed).
 * States: received → ai_analysis → assigned → drafting → review → signed
 */
import pool from '../../db/pgPool.js';
import { publishEvent, KAFKA_TOPICS } from '../../config/kafka.js';
import { recordMetric } from './imaging-observability.service.js';

export const WORKFLOW_STATES = [
  'received', 'ai_analysis', 'assigned', 'drafting', 'review', 'signed', 'archived',
];

const TRANSITIONS = {
  received: ['ai_analysis', 'assigned'],
  ai_analysis: ['assigned'],
  assigned: ['drafting'],
  drafting: ['review'],
  review: ['signed', 'drafting'],
  signed: ['archived'],
  archived: [],
};

export async function startWorkflow({ studyId, studyInstanceUID, tenantId, priority = 'routine', payload = {} }) {
  const r = await pool.query(
    `INSERT INTO imaging_workflow_instances
       (study_id, study_instance_uid, tenant_id, state, priority, payload)
     VALUES ($1,$2,$3,'received',$4,$5::jsonb)
     RETURNING *`,
    [studyId, studyInstanceUID, tenantId, priority, JSON.stringify(payload)],
  );
  const instance = r.rows[0];
  await pool.query(`UPDATE ris_studies SET workflow_state = 'received' WHERE id = $1`, [studyId]).catch(() => {});
  await logTransition(instance.id, null, 'received', null, 'system', { auto: true });
  await publishEvent(KAFKA_TOPICS.IMAGING_WORKFLOW_TRANSITION, {
    instanceId: instance.id, studyId, studyInstanceUID, state: 'received', tenantId,
  }).catch(() => {});
  await recordMetric('imaging_workflow_started', 1, { tenantId, modality: payload.modality });
  return instance;
}

export async function transitionWorkflow(instanceId, toState, actor = {}) {
  const cur = await pool.query(`SELECT * FROM imaging_workflow_instances WHERE id = $1`, [instanceId]);
  const instance = cur.rows[0];
  if (!instance) throw new Error('Workflow instance not found');
  const from = instance.state;
  if (!TRANSITIONS[from]?.includes(toState)) {
    throw new Error(`Invalid transition ${from} → ${toState}`);
  }
  const r = await pool.query(
    `UPDATE imaging_workflow_instances SET state = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [instanceId, toState],
  );
  if (instance.study_id) {
    await pool.query(`UPDATE ris_studies SET workflow_state = $2 WHERE id = $1`, [instance.study_id, toState]).catch(() => {});
  }
  await logTransition(instanceId, from, toState, actor.id, actor.name, {});
  await publishEvent(KAFKA_TOPICS.IMAGING_WORKFLOW_TRANSITION, {
    instanceId, from, to: toState, studyId: instance.study_id, tenantId: instance.tenant_id,
  }).catch(() => {});
  await recordMetric('imaging_workflow_transition', 1, { from, to: toState });
  return r.rows[0];
}

export async function assignRadiologist(instanceId, radiologistId, radiologistName) {
  await pool.query(
    `UPDATE imaging_workflow_instances SET assigned_to = $2, assigned_name = $3, updated_at = NOW() WHERE id = $1`,
    [instanceId, radiologistId, radiologistName],
  );
  const cur = await pool.query(`SELECT * FROM imaging_workflow_instances WHERE id = $1`, [instanceId]);
  const instance = cur.rows[0];
  if (instance?.state === 'assigned') return instance;
  return transitionWorkflow(instanceId, 'assigned', { id: radiologistId, name: radiologistName });
}

async function logTransition(instanceId, from, to, actorId, actorName, details) {
  await pool.query(
    `INSERT INTO imaging_workflow_events (instance_id, from_state, to_state, actor_id, actor_name, details)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
    [instanceId, from, to, actorId, actorName, JSON.stringify(details)],
  );
}

export async function getWorkflowForStudy(studyId) {
  const r = await pool.query(
    `SELECT w.*, (
       SELECT json_agg(e ORDER BY e.created_at) FROM imaging_workflow_events e WHERE e.instance_id = w.id
     ) AS events
     FROM imaging_workflow_instances w WHERE w.study_id = $1 ORDER BY w.created_at DESC LIMIT 1`,
    [studyId],
  );
  return r.rows[0] || null;
}

export async function listWorkflowQueue(tenantId, state = 'assigned', limit = 50) {
  const r = await pool.query(
    `SELECT w.*, s.patient_name, s.modality, s.study_date, s.priority AS study_priority
     FROM imaging_workflow_instances w
     LEFT JOIN ris_studies s ON s.id = w.study_id
     WHERE w.tenant_id = $1 AND w.state = $2
     ORDER BY w.updated_at DESC LIMIT $3`,
    [tenantId, state, limit],
  );
  return r.rows;
}
