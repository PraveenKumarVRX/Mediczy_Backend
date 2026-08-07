/**
 * Hospital OS — unified smart queue service
 * Replaces fragmented checkin_tokens, queue_tokens, and display-only queue logic.
 *
 * Journey token: one public token (T-###) follows the patient across departments
 * (kiosk/OPD → lab → radiology → pharmacy). Each stop is a new queue row that
 * reuses the same token_number / journey_token.
 */

import crypto from 'crypto';
import pool from '../db/pgPool.js';
import { pushQueueEvent, pushToZone } from './display-sse-broker.service.js';
import * as queueNotify from './queue-notify.service.js';

const DEPT_PREFIX = { opd: 'A', pharmacy: 'P', lab: 'L', er: 'ER', radiology: 'R' };
export const JOURNEY_DEPARTMENTS = ['opd', 'lab', 'radiology', 'pharmacy', 'er'];
export const DEFAULT_ZONE_BY_DEPT = {
  opd: 'opd-waiting',
  lab: 'lab-waiting',
  radiology: 'radiology-waiting',
  pharmacy: 'pharmacy-waiting',
  er: 'er-waiting',
};
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
  try {
    const { up: harden } = await import('../migrations/20260801-qms-hardening.migration.js');
    await harden(pool);
  } catch (_) { /* best-effort */ }
  try {
    const { up: journey } = await import('../migrations/20260807-qms-journey-token.migration.js');
    await journey(pool);
  } catch (_) { /* best-effort */ }
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

/**
 * Org-day public journey token — same number at every department stop.
 * Format: T-001, T-002, …
 */
export async function nextJourneyToken(organizationId) {
  await ensureQueueTables();
  const org = defaultOrgId(organizationId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const upsert = await client.query(
      `INSERT INTO hospital_queue_journey_sequences (organization_id, seq_date, last_seq)
       VALUES ($1, CURRENT_DATE, 1)
       ON CONFLICT (organization_id, seq_date)
       DO UPDATE SET last_seq = hospital_queue_journey_sequences.last_seq + 1
       RETURNING last_seq`,
      [org],
    );
    await client.query('COMMIT');
    const seq = upsert.rows[0]?.last_seq || 1;
    return `T-${String(seq).padStart(3, '0')}`;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    // Fallback if journey sequence table missing
    const { rows } = await pool.query(
      `SELECT COUNT(DISTINCT COALESCE(journey_token, token_number))::int AS c
       FROM hospital_queue_entries
       WHERE organization_id = $1 AND check_in_at::date = CURRENT_DATE`,
      [org],
    );
    return `T-${String((rows[0]?.c || 0) + 1).padStart(3, '0')}`;
  } finally {
    client.release();
  }
}

/**
 * Token sequences are scoped per org + department + doctor (or queue zone).
 * Uses hospital_queue_token_sequences with row lock (no COUNT race).
 * Examples: A12-001 (doctor 12 OPD), A-001 (general OPD), L-003 (lab).
 * Prefer nextJourneyToken() for the public patient-facing number.
 */
export async function nextTokenNumber(organizationId, department = 'opd', { doctorId, queueZone } = {}) {
  await ensureQueueTables();
  try {
    const { up: harden } = await import('../migrations/20260801-qms-hardening.migration.js');
    await harden(pool);
  } catch (_) { /* already applied / best-effort */ }

  const org = defaultOrgId(organizationId);
  const prefix = DEPT_PREFIX[department] || 'Q';
  const docId = doctorId ? parseInt(doctorId, 10) : 0;
  const zoneKey = doctorId ? '' : String(queueZone || '');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const upsert = await client.query(
      `INSERT INTO hospital_queue_token_sequences
         (organization_id, department, doctor_id, queue_zone, seq_date, last_seq)
       VALUES ($1, $2, $3, $4, CURRENT_DATE, 1)
       ON CONFLICT (organization_id, department, doctor_id, queue_zone, seq_date)
       DO UPDATE SET last_seq = hospital_queue_token_sequences.last_seq + 1
       RETURNING last_seq`,
      [org, department, docId || 0, zoneKey],
    );
    await client.query('COMMIT');
    const seq = upsert.rows[0]?.last_seq || 1;
    const padded = String(seq).padStart(3, '0');
    if (docId) return `${prefix}${docId}-${padded}`;
    return `${prefix}-${padded}`;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    // Fallback COUNT if sequence table missing
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM hospital_queue_entries
       WHERE organization_id = $1 AND department = $2
         AND ($3::int = 0 OR doctor_id = $3)
         AND check_in_at::date = CURRENT_DATE`,
      [org, department, docId || 0],
    );
    const seq = (rows[0]?.c || 0) + 1;
    const padded = String(seq).padStart(3, '0');
    if (docId) return `${prefix}${docId}-${padded}`;
    return `${prefix}-${padded}`;
  } finally {
    client.release();
  }
}

export async function estimateWaitMinutes({ organizationId, doctorId, department = 'opd', entryId }) {
  await ensureQueueTables();
  const org = defaultOrgId(organizationId);
  const stats = await getConsultDurationStats(org, doctorId, department);

  let position = 0;
  if (entryId) {
    const entry = await getEntryById(entryId, org);
    if (entry) {
      const ahead = await pool.query(
        `SELECT COUNT(*)::int AS c FROM hospital_queue_entries
         WHERE organization_id = $1 AND department = $2 AND status IN ('waiting','called')
           AND check_in_at::date = CURRENT_DATE
           AND (priority_score > $3 OR (priority_score = $3 AND check_in_at < $4))`,
        [org, department, entry.priorityScore, entry.checkInAt]
      );
      position = ahead.rows[0]?.c || 0;
    }
  } else {
    const waiting = await pool.query(
      `SELECT COUNT(*)::int AS c FROM hospital_queue_entries
       WHERE organization_id = $1 AND department = $2 AND status IN ('waiting','called')
         AND ($3::int IS NULL OR doctor_id = $3) AND check_in_at::date = CURRENT_DATE`,
      [org, department, doctorId || null]
    );
    position = waiting.rows[0]?.c || 0;
  }

  const hour = new Date().getHours();
  const peakFactor = hour >= 9 && hour <= 12 ? 1.15 : hour >= 17 && hour <= 20 ? 1.1 : 1.0;
  const p50 = stats.p50Consult || 15;
  const estimate = Math.round(position * p50 * peakFactor);
  return Math.max(5, estimate);
}

async function getConsultDurationStats(organizationId, doctorId, department = 'opd') {
  const params = [organizationId];
  let doctorFilter = '';
  if (doctorId) {
    params.push(doctorId);
    doctorFilter = ' AND doctor_id = $2';
  }
  const { rows } = await pool.query(
    `SELECT
       COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - serving_at))/60), 15) AS p50,
       COALESCE(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - serving_at))/60), 22) AS p90,
       COUNT(*)::int AS sample_size
     FROM hospital_queue_entries
     WHERE organization_id = $1 AND status = 'completed'
       AND serving_at IS NOT NULL AND completed_at IS NOT NULL
       AND completed_at::date >= CURRENT_DATE - INTERVAL '14 days'
       ${doctorFilter}`,
    params
  );
  const r = rows[0] || {};
  return {
    p50Consult: Math.max(8, Math.round(parseFloat(r.p50) || 15)),
    p90Consult: Math.max(10, Math.round(parseFloat(r.p90) || 22)),
    sampleSize: r.sample_size || 0,
  };
}

export async function getHospitalQueueAnalytics(organizationId) {
  await ensureQueueTables();
  const org = defaultOrgId(organizationId);
  const { rows } = await pool.query(
    `SELECT
       department,
       COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
       COUNT(*) FILTER (WHERE status = 'no_show')::int AS no_show,
       COUNT(*) FILTER (WHERE status IN ('waiting','called','serving'))::int AS active,
       COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY actual_wait_minutes) FILTER (WHERE status = 'completed'), 0) AS p50_wait,
       COALESCE(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY actual_wait_minutes) FILTER (WHERE status = 'completed'), 0) AS p90_wait,
       COALESCE(AVG(EXTRACT(EPOCH FROM (completed_at - serving_at))/60) FILTER (WHERE status = 'completed'), 0) AS avg_consult_min
     FROM hospital_queue_entries
     WHERE organization_id = $1 AND check_in_at::date = CURRENT_DATE
     GROUP BY department`,
    [org]
  );
  const totals = await pool.query(
    `SELECT COUNT(*)::int AS total_today,
            COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_today
     FROM hospital_queue_entries WHERE organization_id = $1 AND check_in_at::date = CURRENT_DATE`,
    [org]
  );
  return { byDepartment: rows, totals: totals.rows[0] || {}, generatedAt: new Date().toISOString() };
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
  queueZone = 'opd-waiting',
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
  /** Reuse an existing journey (transfer / continue) */
  journeyId = null,
  journeyToken = null,
  parentEntryId = null,
  stepOrder = 1,
  nextDepartment = null,
}) {
  await ensureQueueTables();
  const org = defaultOrgId(organizationId);
  // Prefer per-doctor OPD zone when doctor is known (multi-OPD hospitals)
  let zone = queueZone || DEFAULT_ZONE_BY_DEPT[department] || 'opd-waiting';
  if (department === 'opd' && doctorId && (!queueZone || queueZone === 'OPD-MAIN' || queueZone === 'opd-waiting')) {
    zone = `opd-doc-${parseInt(doctorId, 10)}`;
  }
  if (zone === 'OPD-MAIN') zone = 'opd-waiting';

  // Public token is journey-scoped (same at every department). Internal dept seq unused for display.
  const tokenNumber = journeyToken || (await nextJourneyToken(org));
  const resolvedJourneyId = journeyId || crypto.randomUUID();
  const resolvedPriority = priorityScore ?? computePriorityScore({ triageLevel, queueType });
  const resolvedCounter = counterId || doctorName || await assignCounter(org, zone);
  const estimatedWaitMinutes = await estimateWaitMinutes({ organizationId: org, doctorId, department });

  const { rows } = await pool.query(
    `INSERT INTO hospital_queue_entries (
      organization_id, department, token_number, queue_zone, patient_id, patient_name,
      appointment_id, doctor_id, doctor_name, counter_id, queue_type, triage_level,
      priority_score, chief_complaint, status, estimated_wait_minutes, consent_version, metadata,
      journey_id, journey_token, parent_entry_id, step_order, next_department
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'waiting',$15,$16,$17,$18,$19,$20,$21,$22)
    RETURNING *`,
    [
      org, department, tokenNumber, zone, patientId || null, patientName || null,
      appointmentId || null, doctorId || null, doctorName || null, resolvedCounter,
      queueType, triageLevel || null, resolvedPriority, chiefComplaint || null,
      estimatedWaitMinutes, consentVersion || null, JSON.stringify(metadata),
      resolvedJourneyId, tokenNumber, parentEntryId || null, stepOrder || 1, nextDepartment || null,
    ]
  );
  const entry = mapRow(rows[0]);
  if (!entry) throw new Error('Queue check-in failed to persist entry');
  const board = await getBoardSnapshot({ organizationId: org, queueZone: zone, doctorId });
  pushQueueEvent(zone, 'queue_token_issued', { entry, board });

  const meta = typeof entry.metadata === 'object' && entry.metadata ? entry.metadata : {};
  if (meta.notifyOptIn && meta.notifyPhone) {
    queueNotify.notifyQueueCheckIn({ ...entry, notifyOptIn: true }, meta.notifyPhone).catch(() => {});
  }
  queueNotify.refreshPositionNotifications(org, zone).catch(() => {});

  return entry;
}

/**
 * Complete current department stop and enqueue the same journey token at the next department.
 * Patient keeps the same public token (T-###) for Lab / Radiology / Pharmacy / OPD.
 */
export async function transferToDepartment(entryId, organizationId, nextDepartment, { notes, queueZone, doctorId, doctorName } = {}) {
  await ensureQueueTables();
  const org = defaultOrgId(organizationId);
  const dept = String(nextDepartment || '').toLowerCase().trim();
  if (!JOURNEY_DEPARTMENTS.includes(dept)) {
    throw Object.assign(
      new Error(`Invalid next department. Use one of: ${JOURNEY_DEPARTMENTS.join(', ')}`),
      { status: 400 },
    );
  }

  const current = await getEntryById(entryId, org);
  if (!current) {
    throw Object.assign(new Error('Queue entry not found'), { status: 404 });
  }
  if (!['waiting', 'called', 'serving', 'completed'].includes(current.status)) {
    throw Object.assign(new Error(`Cannot transfer from status ${current.status}`), { status: 409 });
  }
  if (current.department === dept && ['waiting', 'called', 'serving'].includes(current.status)) {
    throw Object.assign(new Error(`Patient is already active in ${dept}`), { status: 409 });
  }

  // One active stop per journey
  const active = await pool.query(
    `SELECT id, department, status FROM hospital_queue_entries
     WHERE organization_id = $1 AND journey_id = $2::uuid
       AND status IN ('waiting','called','serving')
       AND id <> $3
     LIMIT 1`,
    [org, current.journeyId, current.id],
  );
  if (active.rows[0] && active.rows[0].department === dept) {
    return {
      from: current,
      to: await getEntryById(active.rows[0].id, org),
      reused: true,
    };
  }
  if (active.rows[0]) {
    throw Object.assign(
      new Error(`Journey already active at ${active.rows[0].department} (complete or transfer that stop first)`),
      { status: 409 },
    );
  }

  let from = current;
  if (current.status !== 'completed') {
    from = await completeEntry(current.id, org);
  }

  await pool.query(
    `UPDATE hospital_queue_entries SET next_department = $3, updated_at = NOW()
     WHERE id = $1 AND organization_id = $2`,
    [from.id, org, dept],
  );

  const zone = queueZone || DEFAULT_ZONE_BY_DEPT[dept] || `${dept}-waiting`;
  const meta = {
    ...(typeof from.metadata === 'object' && from.metadata ? from.metadata : {}),
    transferredFrom: from.department,
    transferredFromEntryId: from.id,
    transferNotes: notes || undefined,
    source: 'journey-transfer',
  };

  const to = await checkIn({
    organizationId: org,
    department: dept,
    queueZone: zone,
    patientId: from.patientId,
    patientName: from.patientName,
    appointmentId: from.appointmentId,
    doctorId: doctorId || undefined,
    doctorName: doctorName || undefined,
    queueType: 'transfer',
    chiefComplaint: notes || from.chiefComplaint,
    metadata: meta,
    journeyId: from.journeyId,
    journeyToken: from.journeyToken || from.tokenNumber,
    parentEntryId: from.id,
    stepOrder: (from.stepOrder || 1) + 1,
  });

  pushQueueEvent(from.queueZone, 'queue_token_transferred', { from, to });
  pushQueueEvent(to.queueZone, 'queue_token_issued', { entry: to });

  return { from, to, reused: false };
}

/**
 * Look up today's journey by public token (T-014 / legacy A-014).
 * Returns active stop + full journey history.
 */
export async function findJourneyByToken(organizationId, tokenNumber) {
  await ensureQueueTables();
  const org = defaultOrgId(organizationId);
  const token = String(tokenNumber || '').trim().toUpperCase();
  if (!token) return null;

  const { rows } = await pool.query(
    `SELECT * FROM hospital_queue_entries
     WHERE organization_id = $1
       AND check_in_at::date = CURRENT_DATE
       AND (UPPER(journey_token) = $2 OR UPPER(token_number) = $2)
     ORDER BY COALESCE(step_order, 1) ASC, id ASC`,
    [org, token],
  );
  if (!rows.length) return null;
  const steps = rows.map(mapRow);
  const active = steps.find((s) => ['waiting', 'called', 'serving'].includes(s.status)) || null;
  const latest = steps[steps.length - 1];
  return {
    journeyId: latest.journeyId,
    journeyToken: latest.journeyToken || latest.tokenNumber,
    tokenNumber: latest.journeyToken || latest.tokenNumber,
    patientName: latest.patientName,
    patientId: latest.patientId,
    active,
    currentDepartment: active?.department || latest.department,
    steps,
  };
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
  const board = await getBoardSnapshot({ organizationId: org, queueZone: updated.queueZone });
  pushQueueEvent(updated.queueZone, 'queue_token_called', { entry: updated, board });

  const meta = updated.metadata || {};
  if (meta.notifyPhone) {
    queueNotify.notifyTokenCalled(updated, meta.notifyPhone).catch(() => {});
  }
  queueNotify.refreshPositionNotifications(org, updated.queueZone).catch(() => {});

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
  const durationStats = await getConsultDurationStats(org, doctorId, department);

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
    waitEstimate: {
      p50ConsultMins: durationStats.p50Consult,
      p90ConsultMins: durationStats.p90Consult,
      sampleSize: durationStats.sampleSize,
    },
    live: true,
    entries,
  };
}

export function parseKioskQrPayload(raw) {
  const payload = String(raw || '').trim();
  if (!payload) return { type: 'unknown', raw: '' };
  try {
    const parsed = payload.startsWith('{') ? JSON.parse(payload) : null;
    if (parsed?.type === 'appointment' && (parsed.id || parsed.appointmentId)) {
      return { type: 'appointment', appointmentId: parsed.id || parsed.appointmentId };
    }
    if (parsed?.type === 'walk-in' || parsed?.type === 'register') {
      return { type: 'walk-in', department: parsed.dept || parsed.department || 'opd' };
    }
    if (parsed?.uhid || parsed?.token) {
      return { type: 'token', uhid: parsed.uhid, token: parsed.token };
    }
  } catch (_) {}
  if (payload.includes('abha') || /^[\d-]{10,}$/.test(payload)) {
    return { type: 'abha', healthId: payload };
  }
  if (/^A-\d+/i.test(payload) || /^[A-Z]+-\d+/i.test(payload)) {
    return { type: 'token', token: payload };
  }
  return { type: 'manual', raw: payload.slice(0, 200) };
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
    tokenNumber: row.journey_token || row.token_number,
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
    journeyId: row.journey_id,
    journeyToken: row.journey_token || row.token_number,
    parentEntryId: row.parent_entry_id,
    stepOrder: row.step_order || 1,
    nextDepartment: row.next_department || null,
  };
}

export default {
  ensureQueueTables,
  checkIn,
  transferToDepartment,
  findJourneyByToken,
  nextJourneyToken,
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
  getHospitalQueueAnalytics,
  getConsultDurationStats,
  parseKioskQrPayload,
  JOURNEY_DEPARTMENTS,
  DEFAULT_ZONE_BY_DEPT,
};
