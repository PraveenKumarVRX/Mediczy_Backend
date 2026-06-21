/**
 * Hospital OS — unified smart queue service
 * Replaces fragmented checkin_tokens, queue_tokens, and display-only queue logic.
 */

import pool from '../db/pgPool.js';
import { pushQueueEvent, pushToZone } from './display-sse-broker.service.js';

const DEPT_PREFIX = { opd: 'A', pharmacy: 'P', lab: 'L', er: 'ER', radiology: 'R' };
const ESI_PRIORITY = {
  'ESI-1': 100, resuscitation: 100,
  'ESI-2': 85, emergent: 85,
  'ESI-3': 70, urgent: 70,
  'ESI-4': 55, less_urgent: 55,
  'ESI-5': 40, non_urgent: 40,
};

let _tablesReady = false;

export async function ensureQueueTables() {
  if (_tablesReady) return;
  const { up } = await import('../migrations/20260617-hospital-queue-os.migration.js');
  await up();
  _tablesReady = true;
}

function defaultOrgId(organizationId) {
  const n = parseInt(organizationId, 10);
  return Number.isFinite(n) && n > 0 ? n : parseInt(process.env.HOSPITAL_DEFAULT_ORG_ID || '1', 10);
}

function todayDateStr() {
  return new Date().toISOString().slice(0, 10);
}

export function computePriorityScore({ triageLevel, queueType, priority }) {
  if (priority != null) return priority;
  if (triageLevel && ESI_PRIORITY[triageLevel] != null) return ESI_PRIORITY[triageLevel];
  if (queueType === 'emergency' || queueType === 'urgent') return 80;
  if (queueType === 'scheduled') return 60;
  return 50;
}

export async function nextTokenNumber(organizationId, department = 'opd') {
  await ensureQueueTables();
  const org = defaultOrgId(organizationId);
  const prefix = DEPT_PREFIX[department] || 'Q';
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM hospital_queue_entries
     WHERE organization_id = $1 AND department = $2 AND check_in_at::date = CURRENT_DATE`,
    [org, department]
  );
  const seq = (rows[0]?.c || 0) + 1;
  return `${prefix}-${String(seq).padStart(3, '0')}`;
}

export async function estimateWaitMinutes({ organizationId, doctorId, department = 'opd' }) {
  await ensureQueueTables();
  const org = defaultOrgId(organizationId);
  const waiting = await pool.query(
    `SELECT COUNT(*)::int AS c FROM hospital_queue_entries
     WHERE organization_id = $1 AND department = $2 AND status IN ('waiting','called')
       AND ($3::int IS NULL OR doctor_id = $3) AND check_in_at::date = CURRENT_DATE`,
    [org, department, doctorId || null]
  );
  const depth = waiting.rows[0]?.c || 0;

  let avgConsult = 15;
  if (doctorId) {
    const hist = await pool.query(
      `SELECT AVG(actual_wait_minutes)::float AS avg_wait,
              AVG(EXTRACT(EPOCH FROM (completed_at - serving_at))/60)::float AS avg_consult
       FROM hospital_queue_entries
       WHERE organization_id = $1 AND doctor_id = $2 AND status = 'completed'
         AND completed_at::date >= CURRENT_DATE - INTERVAL '7 days'`,
      [org, doctorId]
    );
    if (hist.rows[0]?.avg_consult) avgConsult = Math.max(8, Math.round(hist.rows[0].avg_consult));
  }

  return Math.max(5, depth * avgConsult);
}

export async function assignCounter(organizationId, queueZone) {
  await ensureQueueTables();
  const org = defaultOrgId(organizationId);
  const { rows } = await pool.query(
    `SELECT counter_id, COUNT(*)::int AS waiting
     FROM hospital_queue_entries
     WHERE organization_id = $1 AND queue_zone = $2 AND status IN ('waiting','called')
       AND check_in_at::date = CURRENT_DATE AND counter_id IS NOT NULL
     GROUP BY counter_id ORDER BY waiting ASC LIMIT 1`,
    [org, queueZone]
  );
  if (rows[0]?.counter_id) return rows[0].counter_id;
  const counters = ['Counter 1', 'Counter 2', 'Counter 3'];
  const idx = Math.floor(Math.random() * counters.length);
  return counters[idx];
}

export async function checkIn({
  organizationId,
  department = 'opd',
  queueZone = 'OPD-MAIN',
  patientId,
  patientName,
  appointmentId,
  doctorId,
  doctorName,
  queueType = 'walk_in',
  triageLevel,
  chiefComplaint,
  counterId,
  consentVersion,
  metadata = {},
  priorityScore,
}) {
  await ensureQueueTables();
  const org = defaultOrgId(organizationId);
  const tokenNumber = await nextTokenNumber(org, department);
  const resolvedPriority = priorityScore ?? computePriorityScore({ triageLevel, queueType });
  const resolvedCounter = counterId || await assignCounter(org, queueZone);
  const estimatedWaitMinutes = await estimateWaitMinutes({ organizationId: org, doctorId, department });

  const { rows } = await pool.query(
    `INSERT INTO hospital_queue_entries (
      organization_id, department, token_number, queue_zone, patient_id, patient_name,
      appointment_id, doctor_id, doctor_name, counter_id, queue_type, triage_level,
      priority_score, chief_complaint, status, estimated_wait_minutes, consent_version, metadata
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'waiting',$15,$16,$17)
    RETURNING *`,
    [
      org, department, tokenNumber, queueZone, patientId || null, patientName || null,
      appointmentId || null, doctorId || null, doctorName || null, resolvedCounter,
      queueType, triageLevel || null, resolvedPriority, chiefComplaint || null,
      estimatedWaitMinutes, consentVersion || null, JSON.stringify(metadata),
    ]
  );
  const entry = mapRow(rows[0]);
  pushQueueEvent(queueZone, 'queue_token_issued', { entry, board: await getBoardSnapshot({ organizationId: org, queueZone }) });
  return entry;
}

export async function getEntryById(id, organizationId) {
  await ensureQueueTables();
  const { rows } = await pool.query(
    `SELECT * FROM hospital_queue_entries WHERE id = $1 AND organization_id = $2`,
    [id, defaultOrgId(organizationId)]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function listDoctorQueue(doctorId, organizationId) {
  await ensureQueueTables();
  const { rows } = await pool.query(
    `SELECT * FROM hospital_queue_entries
     WHERE doctor_id = $1 AND organization_id = $2
       AND status IN ('waiting','called','serving')
       AND check_in_at::date = CURRENT_DATE
     ORDER BY priority_score DESC, check_in_at ASC`,
    [doctorId, defaultOrgId(organizationId)]
  );
  return rows.map(mapRow);
}

export async function callNext({ doctorId, organizationId, entryId }) {
  await ensureQueueTables();
  const org = defaultOrgId(organizationId);
  let entry;

  if (entryId) {
    entry = await getEntryById(entryId, org);
  } else {
    const { rows } = await pool.query(
      `SELECT * FROM hospital_queue_entries
       WHERE doctor_id = $1 AND organization_id = $2 AND status = 'waiting'
         AND check_in_at::date = CURRENT_DATE
       ORDER BY priority_score DESC, check_in_at ASC LIMIT 1`,
      [doctorId, org]
    );
    entry = rows[0] ? mapRow(rows[0]) : null;
  }

  if (!entry) return null;

  const { rows } = await pool.query(
    `UPDATE hospital_queue_entries SET status = 'called', called_at = NOW(), updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [entry.id]
  );
  const updated = mapRow(rows[0]);
  pushQueueEvent(updated.queueZone, 'queue_token_called', {
    entry: updated,
    board: await getBoardSnapshot({ organizationId: org, queueZone: updated.queueZone }),
  });
  return updated;
}

export async function startServing(id, organizationId) {
  await ensureQueueTables();
  const org = defaultOrgId(organizationId);
  const existing = await getEntryById(id, org);
  if (!existing) return null;

  const actualWait = existing.checkInAt
    ? Math.floor((Date.now() - new Date(existing.checkInAt).getTime()) / 60000)
    : null;

  const { rows } = await pool.query(
    `UPDATE hospital_queue_entries
     SET status = 'serving', serving_at = NOW(), actual_wait_minutes = $2, updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [id, actualWait]
  );
  const updated = mapRow(rows[0]);
  pushQueueEvent(updated.queueZone, 'queue_token_serving', { entry: updated });
  return updated;
}

export async function completeEntry(id, organizationId) {
  await ensureQueueTables();
  const { rows } = await pool.query(
    `UPDATE hospital_queue_entries SET status = 'completed', completed_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND organization_id = $2 RETURNING *`,
    [id, defaultOrgId(organizationId)]
  );
  if (!rows[0]) return null;
  const updated = mapRow(rows[0]);
  pushQueueEvent(updated.queueZone, 'queue_token_completed', { entry: updated });
  return updated;
}

export async function markNoShow(id, organizationId, reason) {
  await ensureQueueTables();
  const { rows } = await pool.query(
    `UPDATE hospital_queue_entries SET status = 'no_show', no_show_at = NOW(),
      metadata = metadata || $3::jsonb, updated_at = NOW()
     WHERE id = $1 AND organization_id = $2 RETURNING *`,
    [id, defaultOrgId(organizationId), JSON.stringify({ noShowReason: reason || 'No response' })]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function reorderEntry(id, organizationId, priorityScore) {
  await ensureQueueTables();
  const { rows } = await pool.query(
    `UPDATE hospital_queue_entries SET priority_score = $3, updated_at = NOW()
     WHERE id = $1 AND organization_id = $2 RETURNING *`,
    [id, defaultOrgId(organizationId), priorityScore]
  );
  const updated = rows[0] ? mapRow(rows[0]) : null;
  if (updated) {
    pushQueueEvent(updated.queueZone, 'queue_updated', {
      board: await getBoardSnapshot({ organizationId: defaultOrgId(organizationId), queueZone: updated.queueZone }),
    });
  }
  return updated;
}

export async function getBoardSnapshot({ organizationId, queueZone, department, doctorId, counterId }) {
  await ensureQueueTables();
  const org = defaultOrgId(organizationId);
  const params = [org];
  let where = `organization_id = $1 AND check_in_at::date = CURRENT_DATE AND status IN ('waiting','called','serving')`;

  if (queueZone) {
    params.push(queueZone);
    where += ` AND queue_zone = $${params.length}`;
  }
  if (department) {
    params.push(department);
    where += ` AND department = $${params.length}`;
  }
  if (doctorId) {
    params.push(doctorId);
    where += ` AND doctor_id = $${params.length}`;
  }
  if (counterId) {
    params.push(counterId);
    where += ` AND counter_id = $${params.length}`;
  }

  const { rows } = await pool.query(
    `SELECT * FROM hospital_queue_entries WHERE ${where}
     ORDER BY
       CASE status WHEN 'called' THEN 0 WHEN 'serving' THEN 1 ELSE 2 END,
       priority_score DESC, check_in_at ASC
     LIMIT 50`,
    params
  );

  const entries = rows.map(mapRow);
  const current = entries.find((e) => e.status === 'called' || e.status === 'serving') || entries[0];
  const next = entries.filter((e) => e.id !== current?.id && e.status === 'waiting').slice(0, 3);
  const waiting = entries.filter((e) => e.status === 'waiting').length;

  const avgWait = await estimateWaitMinutes({ organizationId: org, doctorId, department });

  return {
    current: current ? {
      token: current.tokenNumber,
      counter: current.counterId || 'Counter',
      doctor: current.doctorName || '',
      status: current.status,
      patientName: current.patientName,
    } : null,
    next: next.map((e) => ({ token: e.tokenNumber, counter: e.counterId || '' })),
    waiting,
    avgWaitMins: avgWait,
    live: true,
    entries,
  };
}

export async function allocateUhid(organizationId) {
  await ensureQueueTables();
  const org = defaultOrgId(organizationId);
  const { rows } = await pool.query(
    `INSERT INTO hospital_uhid_sequences (organization_id, last_value, prefix)
     VALUES ($1, 1, 'UHID')
     ON CONFLICT (organization_id)
     DO UPDATE SET last_value = hospital_uhid_sequences.last_value + 1
     RETURNING prefix, last_value`,
    [org]
  );
  const { prefix, last_value } = rows[0];
  return `${prefix}-${String(last_value).padStart(6, '0')}`;
}

export async function createNurseCall({ organizationId, bedId, wardZone, patientId, patientName }) {
  await ensureQueueTables();
  const org = defaultOrgId(organizationId);
  const { rows } = await pool.query(
    `INSERT INTO bedside_nurse_calls (organization_id, bed_id, ward_zone, patient_id, patient_name)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [org, bedId, wardZone || 'ward', patientId || null, patientName || null]
  );
  const call = rows[0];
  pushToZone(wardZone || 'ward', 'nurse_call', call);
  return call;
}

export async function listCmsSlides(organizationId, zoneId) {
  await ensureQueueTables();
  const { rows } = await pool.query(
    `SELECT * FROM display_content_schedules
     WHERE organization_id = $1 AND zone_id = $2 AND active = true
       AND (starts_at IS NULL OR starts_at <= NOW())
       AND (ends_at IS NULL OR ends_at >= NOW())
     ORDER BY sort_order ASC, id ASC`,
    [defaultOrgId(organizationId), zoneId]
  );
  return rows;
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    department: row.department,
    tokenNumber: row.token_number,
    queueZone: row.queue_zone,
    patientId: row.patient_id,
    patientName: row.patient_name,
    appointmentId: row.appointment_id,
    doctorId: row.doctor_id,
    doctorName: row.doctor_name,
    counterId: row.counter_id,
    queueType: row.queue_type,
    triageLevel: row.triage_level,
    priorityScore: row.priority_score,
    chiefComplaint: row.chief_complaint,
    status: row.status,
    estimatedWaitMinutes: row.estimated_wait_minutes,
    actualWaitMinutes: row.actual_wait_minutes,
    checkInAt: row.check_in_at,
    calledAt: row.called_at,
    servingAt: row.serving_at,
    completedAt: row.completed_at,
    metadata: row.metadata,
  };
}

export default {
  ensureQueueTables,
  checkIn,
  getBoardSnapshot,
  listDoctorQueue,
  callNext,
  startServing,
  completeEntry,
  markNoShow,
  reorderEntry,
  allocateUhid,
  createNurseCall,
  listCmsSlides,
  estimateWaitMinutes,
};
