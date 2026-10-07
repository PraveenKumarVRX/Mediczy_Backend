/**
 * Collection service — the one place collection state changes.
 *
 * Every mutation is a single database transaction that:
 *   1. locks the task row (SELECT … FOR UPDATE), scoped to the owners the caller is entitled to, so a task of
 *      another tenant is indistinguishable from one that does not exist;
 *   2. checks the caller's permission, the expected version, and the state machine;
 *   3. applies the change, appends the task/custody event and the outbox row;
 *   4. when an Idempotency-Key is present, records the operation in the SAME transaction, so a crash leaves
 *      either everything or nothing and a retry returns the stored result instead of repeating a side effect.
 *
 * Actor, owner and worker are always derived from the authenticated principal. Nothing in a request body can
 * name them. (The legacy LabsService took `updatedBy` from the body and wrote four statements with no lock.)
 */
import crypto from 'node:crypto';
import {
  resolve, permittedCommands, foreignModeFields, ACTORS, COMMANDS, STATIC_COMMANDS, FINAL_STATUSES,
} from './state-machine.js';
import { CollectionError, notFound, forbidden, invalid, conflict, fromTransition } from './errors.js';
import { PERMISSIONS, permissionForCommand, assertCan, can, canWorkMode } from './permissions.js';
import * as v from './validation.js';

const LAB_ACTORS = [ACTORS.DISPATCH, ACTORS.LAB_RECEIVER];
const CONTAINERS = ['unspecified', 'edta', 'serum', 'plasma_heparin', 'fluoride', 'citrate', 'urine', 'culture', 'other'];
// Timestamps written by commands come from the database clock (now()), never the app server's, so ordering
// across events and the median handoff time cannot be skewed by a drifting app host.
const DB_NOW = Symbol('db_now');
const PRE_COLLECTION = ['unassigned', 'assigned', 'accepted', 'en_route', 'arrived', 'at_bedside', 'verified', 'consented'];
const ACTIVE_ADMISSION = ['pre_admitted', 'admitted', 'in_ot', 'in_icu'];

export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().filter((k) => value[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function createCollectionService({ pool, now = () => new Date() }) {
  // ── transaction + idempotency plumbing ─────────────────────────────────────
  async function tx(fn) {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const out = await fn(c);
      await c.query('COMMIT');
      return out;
    } catch (err) {
      await c.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      c.release();
    }
  }

  async function idempotent(c, { principal, operationId, command, hashInput, deviceId }, run) {
    const hash = sha256(stableStringify(hashInput));
    const ins = await c.query(
      `INSERT INTO lab_mobile_operations (actor_ref, operation_id, command, request_hash, device_id)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (actor_ref, operation_id) DO NOTHING RETURNING 1`,
      [principal.ref, operationId, command, hash, deviceId || null],
    );
    if (ins.rowCount === 1) {
      const result = await run();
      await c.query(
        `UPDATE lab_mobile_operations SET status = 'succeeded', http_status = $3, response = $4::jsonb, completed_at = now()
          WHERE actor_ref = $1 AND operation_id = $2`,
        [principal.ref, operationId, result.status, JSON.stringify(result.body)],
      );
      return result;
    }
    const { rows } = await c.query(
      'SELECT request_hash, status, http_status, response FROM lab_mobile_operations WHERE actor_ref = $1 AND operation_id = $2',
      [principal.ref, operationId],
    );
    const prior = rows[0];
    if (!prior || prior.request_hash !== hash) {
      throw new CollectionError('idempotency_key_reuse', 422, 'This Idempotency-Key was already used for a different request');
    }
    if (prior.status !== 'succeeded') throw conflict('operation_in_progress', 'This operation is still being processed');
    return { status: prior.http_status, body: prior.response, replayed: true };
  }

  const withOperation = (principal, meta, run) => tx(async (c) => {
    const go = () => run(c);
    if (!meta.operationId) return go();
    return idempotent(c, { principal, ...meta }, go);
  });

  // ── small writers ──────────────────────────────────────────────────────────
  async function taskEvent(c, task, { eventType, from, to, version, actor, principal, operationId, data = {} }) {
    await c.query(
      `INSERT INTO lab_collection_task_events
         (task_id, owner_uid, event_type, from_status, to_status, task_version, actor_kind, actor_ref, operation_id, data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
      [task.id, task.owner_uid, eventType, from, to, version, actor, principal.ref, operationId || null, JSON.stringify(data)],
    );
  }

  async function custodyEvent(c, specimen, { eventType, from, to, actor, principal, operationId, evidence = {} }) {
    await c.query(
      `INSERT INTO lab_specimen_custody_events
         (specimen_id, task_id, owner_uid, event_type, from_state, to_state, actor_kind, actor_ref, operation_id, evidence)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
      [specimen.id, specimen.task_id, specimen.owner_uid, eventType, from, to,
        actor === ACTORS.PHLEBOTOMIST ? 'phlebotomist' : 'lab', principal.ref, operationId || null, JSON.stringify(evidence)],
    );
  }

  async function outbox(c, { ownerUid, type, id, event, payload, correlationId, dedupe }) {
    await c.query(
      `INSERT INTO lab_collection_outbox (owner_uid, aggregate_type, aggregate_id, event_type, payload, correlation_id, dedupe_key)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7) ON CONFLICT (dedupe_key) DO NOTHING`,
      [ownerUid, type, id, event, JSON.stringify(payload || {}), correlationId || null, dedupe],
    );
  }

  async function raiseException(c, task, { code, reason, specimenId = null, ownerRole = 'dispatch', principal, nextAction = null }) {
    await c.query(
      `INSERT INTO lab_collection_exceptions (owner_uid, task_id, specimen_id, code, reason, owner_role, next_action, raised_by, due_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now() + interval '4 hours')
       ON CONFLICT DO NOTHING`,
      [task.owner_uid, task.id, specimenId, code, reason || null, ownerRole, nextAction, principal.ref],
    );
  }

  // ── reads ──────────────────────────────────────────────────────────────────
  const TASK_SELECT = `
    SELECT t.*, h.address, h.contact_phone, h.departed_at, h.arrived_at, h.arrival_evidence,
           w.facility_uid, w.admission_ref, w.ward_name, w.bed_label, w.round_label,
           w.isolation_required, w.isolation_ack_at, w.order_version, w.at_bedside_at,
           p.display_name AS assignee_name
      FROM lab_collection_tasks t
      LEFT JOIN lab_collection_task_home h ON h.task_id = t.id
      LEFT JOIN lab_collection_task_ward w ON w.task_id = t.id
      LEFT JOIN lab_phlebotomists p ON p.id = t.assigned_to`;

  function ownerScope(principal) {
    if (principal.type === 'lab') return [principal.ownerUid];
    return (principal.memberships || []).map((m) => m.ownerUid);
  }

  const AFTER_ACCEPT = ['accepted', 'en_route', 'arrived', 'at_bedside', 'verified', 'consented', 'collected', 'in_transit', 'handed_over', 'ward_handoff'];

  function project(row, principal) {
    const lab = principal.type === 'lab';
    const actor = lab ? ACTORS.DISPATCH : ACTORS.PHLEBOTOMIST;
    const snap = row.patient_snapshot || {};
    const out = {
      id: row.id,
      mode: row.mode,
      status: row.status,
      priority: row.priority,
      scheduledStart: row.scheduled_start,
      scheduledEnd: row.scheduled_end,
      version: row.version,
      assignmentVersion: row.assignment_version,
      patient: { name: snap.name || null, age: snap.age ?? null, gender: snap.gender || null, ...(lab ? { uhid: snap.uhid || null, scheduleSlot: snap.scheduleSlot || null } : {}) },
      collectedAt: row.collected_at,
      closedAt: row.closed_at,
      createdAt: row.created_at,
      permittedCommands: permittedCommands({ mode: row.mode, status: row.status, actor })
        .concat(lab ? permittedCommands({ mode: row.mode, status: row.status, actor: ACTORS.LAB_RECEIVER }) : []),
    };
    if (lab) {
      Object.assign(out, {
        ownerUid: row.owner_uid, sourceKind: row.source_kind, sourceRef: row.source_ref, partnerUid: row.partner_uid,
        assignedTo: row.assigned_to, assigneeName: row.assignee_name || null, redrawOf: row.redraw_of, cancelReason: row.cancel_reason,
      });
    }
    if (row.mode === 'home') {
      out.home = { departedAt: row.departed_at, arrivedAt: row.arrived_at };
      // Address and phone are the most sensitive fields on the task: a collector sees them only once they have accepted it.
      if (lab || AFTER_ACCEPT.includes(row.status)) Object.assign(out.home, { address: row.address, contactPhone: row.contact_phone });
    } else {
      out.ward = {
        facilityUid: row.facility_uid, wardName: row.ward_name, bedLabel: row.bed_label, roundLabel: row.round_label,
        isolationRequired: row.isolation_required, isolationAckAt: row.isolation_ack_at, atBedsideAt: row.at_bedside_at,
        ...(lab ? { admissionRef: row.admission_ref, orderVersion: row.order_version } : {}),
      };
    }
    return out;
  }

  async function testsOf(c, taskId) {
    const { rows } = await c.query(
      `SELECT id, test_code, test_name, container_type, required_volume_ml, handling, priority, status, specimen_id
         FROM lab_collection_task_tests WHERE task_id = $1 ORDER BY created_at, id`, [taskId]);
    return rows.map((r) => ({
      id: r.id, code: r.test_code, name: r.test_name, containerType: r.container_type,
      requiredVolumeMl: r.required_volume_ml === null ? null : Number(r.required_volume_ml),
      handling: r.handling, priority: r.priority, status: r.status, specimenId: r.specimen_id,
    }));
  }

  async function specimensOf(c, taskId) {
    const { rows } = await c.query(
      `SELECT id, barcode, container_type, status, collected_at, received_at, sample_condition, rejection_reason
         FROM lab_collection_specimens WHERE task_id = $1 ORDER BY created_at, id`, [taskId]);
    return rows.map((r) => ({
      id: r.id, barcode: r.barcode, containerType: r.container_type, status: r.status, collectedAt: r.collected_at,
      receivedAt: r.received_at, condition: r.sample_condition, rejectionReason: r.rejection_reason,
    }));
  }

  async function readTask(c, principal, taskId, { lock = false, ignoreAssignee = false } = {}) {
    const id = v.uuid(taskId, 'taskId');
    const scope = ownerScope(principal);
    if (!scope.length) throw notFound();
    const { rows } = await c.query(
      `${TASK_SELECT} WHERE t.id = $1 AND t.owner_uid = ANY($2::text[]) ${lock ? 'FOR UPDATE OF t' : ''}`, [id, scope]);
    const row = rows[0];
    // A collector sees only tasks assigned to them; anything else looks absent rather than forbidden.
    if (!row || (principal.type === 'phlebotomist' && !ignoreAssignee && row.assigned_to !== principal.id)) throw notFound();
    return row;
  }

  async function getTask(principal, taskId) {
    const c = await pool.connect();
    try {
      const row = await readTask(c, principal, taskId);
      assertCan(principal, principal.type === 'lab' ? PERMISSIONS.READ : PERMISSIONS.WORKLIST, row.owner_uid);
      if (!canWorkMode(principal, row.owner_uid, row.mode)) throw notFound();
      return { task: project(row, principal), tests: await testsOf(c, row.id), specimens: await specimensOf(c, row.id) };
    } finally {
      c.release();
    }
  }

  // The key is carried as Postgres text, not a JS Date: timestamptz has microsecond precision and a Date has
  // milliseconds, so a Date round-trip would re-include every row that shares the cursor's millisecond.
  const TS_TEXT = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d{1,6})?([+-]\d{2}(:?\d{2})?|Z)$/;
  function decodeCursor(cursor) {
    if (!cursor) return [null, null];
    try {
      const o = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
      if (typeof o.k !== 'string' || !TS_TEXT.test(o.k)) throw new Error('bad key');
      return [o.k, v.uuid(o.i, 'cursor')];
    } catch {
      throw invalid('cursor is not valid', { field: 'cursor' });
    }
  }
  const encodeCursor = (row) => Buffer.from(JSON.stringify({ k: row.sort_key_text, i: row.id })).toString('base64url');

  /** The collector's worklist: only their own assignments, only owners/modes they are entitled to, minimum projection. */
  async function listWorklist(principal, { mode, cursor, limit = 50 } = {}) {
    const scopes = (principal.memberships || []).filter((m) => m.scopes.includes(PERMISSIONS.WORKLIST));
    if (!scopes.length) return { tasks: [], nextCursor: null, serverTime: now().toISOString() };
    const lim = v.int(limit, 'limit', { min: 1, max: 100 });
    const [ck, ci] = decodeCursor(cursor);
    const m = mode ? v.oneOf(mode, 'mode', ['home', 'ward']) : null;
    const owners = scopes.filter((s) => (m ? (m === 'home' ? s.canHome : s.canWard) : (s.canHome || s.canWard))).map((s) => s.ownerUid);
    const c = await pool.connect();
    try {
      const { rows } = await c.query(
        `${TASK_SELECT.replace('SELECT t.*,', 'SELECT t.*, COALESCE(t.scheduled_start, t.created_at) AS sort_key, COALESCE(t.scheduled_start, t.created_at)::text AS sort_key_text,')}
          WHERE t.assigned_to = $1 AND t.owner_uid = ANY($2::text[])
            AND ($3::text IS NULL OR t.mode = $3)
            AND ((t.mode = 'home' AND t.owner_uid = ANY($6::text[])) OR (t.mode = 'ward' AND t.owner_uid = ANY($7::text[])))
            AND (t.status <> ALL($8::text[]) OR t.closed_at > now() - interval '2 days')
            AND ($4::text IS NULL OR (COALESCE(t.scheduled_start, t.created_at), t.id) > ($4::timestamptz, $5::uuid))
          ORDER BY sort_key, t.id LIMIT ${lim + 1}`,
        [principal.id, owners, m, ck, ci,
          scopes.filter((s) => s.canHome).map((s) => s.ownerUid), scopes.filter((s) => s.canWard).map((s) => s.ownerUid), FINAL_STATUSES]);
      const page = rows.slice(0, lim);
      return {
        tasks: page.map((r) => project(r, principal)),
        nextCursor: rows.length > lim ? encodeCursor(page[page.length - 1]) : null,
        serverTime: now().toISOString(),
      };
    } finally {
      c.release();
    }
  }

  /** Dispatch board: tasks of one owner with filters, plus aggregate counts computed in SQL. */
  async function board(principal, filters = {}) {
    assertCan(principal, PERMISSIONS.READ, principal.ownerUid);
    const lim = v.int(filters.limit ?? 50, 'limit', { min: 1, max: 200 });
    const [ck, ci] = decodeCursor(filters.cursor);
    const mode = filters.mode ? v.oneOf(filters.mode, 'mode', ['home', 'ward']) : null;
    const statuses = filters.status ? String(filters.status).split(',').map((s) => s.trim()).filter(Boolean) : null;
    const from = v.date(filters.from, 'from');
    const to = v.date(filters.to, 'to');
    const assignedTo = filters.assignedTo ? v.uuid(filters.assignedTo, 'assignedTo') : null;
    const overdue = filters.overdue === true || filters.overdue === 'true';
    const c = await pool.connect();
    try {
      const where = `t.owner_uid = $1 AND ($2::text IS NULL OR t.mode = $2) AND ($3::text[] IS NULL OR t.status = ANY($3))
        AND ($4::uuid IS NULL OR t.assigned_to = $4) AND ($5::timestamptz IS NULL OR COALESCE(t.scheduled_start, t.created_at) >= $5)
        AND ($6::timestamptz IS NULL OR COALESCE(t.scheduled_start, t.created_at) <= $6)
        AND (NOT $7::boolean OR (t.scheduled_end < now() AND t.status = ANY($8::text[])))`;
      const base = [principal.ownerUid, mode, statuses, assignedTo, from, to, overdue, PRE_COLLECTION];
      const { rows } = await c.query(
        `${TASK_SELECT.replace('SELECT t.*,', 'SELECT t.*, COALESCE(t.scheduled_start, t.created_at) AS sort_key, COALESCE(t.scheduled_start, t.created_at)::text AS sort_key_text,')}
          WHERE ${where} AND ($9::text IS NULL OR (COALESCE(t.scheduled_start, t.created_at), t.id) > ($9::timestamptz, $10::uuid))
          ORDER BY sort_key, t.id LIMIT ${lim + 1}`, [...base, ck, ci]);
      const counts = await c.query(
        `SELECT t.mode, t.status, count(*)::int AS n, count(*) FILTER (WHERE t.scheduled_end < now() AND t.status = ANY($2::text[]))::int AS overdue
           FROM lab_collection_tasks t WHERE t.owner_uid = $1 GROUP BY t.mode, t.status`, [principal.ownerUid, PRE_COLLECTION]);
      const summary = { byMode: { home: {}, ward: {} }, overdue: 0, unassigned: 0 };
      for (const r of counts.rows) {
        summary.byMode[r.mode][r.status] = r.n;
        summary.overdue += r.overdue;
        if (r.status === 'unassigned') summary.unassigned += r.n;
      }
      const page = rows.slice(0, lim);
      return { tasks: page.map((r) => project(r, principal)), nextCursor: rows.length > lim ? encodeCursor(page[page.length - 1]) : null, summary };
    } finally {
      c.release();
    }
  }

  async function timeline(principal, taskId) {
    assertCan(principal, PERMISSIONS.READ, principal.ownerUid);
    const c = await pool.connect();
    try {
      const row = await readTask(c, principal, taskId);
      const ev = await c.query('SELECT event_type, from_status, to_status, task_version, actor_kind, actor_ref, data, occurred_at FROM lab_collection_task_events WHERE task_id = $1', [row.id]);
      const cu = await c.query(`SELECT e.event_type, e.from_state, e.to_state, e.actor_kind, e.actor_ref, e.evidence, e.occurred_at, s.barcode
                   FROM lab_specimen_custody_events e JOIN lab_collection_specimens s ON s.id = e.specimen_id WHERE e.task_id = $1`, [row.id]);
      const co = await c.query('SELECT outcome, consent_version, method, language, given_by, actor_ref, recorded_at FROM lab_collection_consents WHERE task_id = $1', [row.id]);
      const ve = await c.query('SELECT method, result, identifier_types, actor_ref, recorded_at FROM lab_collection_patient_verifications WHERE task_id = $1', [row.id]);
      const items = [
        ...ev.rows.map((r) => ({ at: r.occurred_at, kind: 'task', type: r.event_type, from: r.from_status, to: r.to_status, version: r.task_version, actor: r.actor_ref, data: r.data })),
        ...cu.rows.map((r) => ({ at: r.occurred_at, kind: 'custody', type: r.event_type, from: r.from_state, to: r.to_state, actor: r.actor_ref, barcode: r.barcode, data: r.evidence })),
        ...co.rows.map((r) => ({ at: r.recorded_at, kind: 'consent', type: r.outcome, actor: r.actor_ref, data: { version: r.consent_version, method: r.method, language: r.language, givenBy: r.given_by } })),
        ...ve.rows.map((r) => ({ at: r.recorded_at, kind: 'verification', type: r.result, actor: r.actor_ref, data: { method: r.method, identifierTypes: r.identifier_types } })),
      ].sort((a, b) => new Date(a.at) - new Date(b.at));
      return { taskId: row.id, items };
    } finally {
      c.release();
    }
  }

  // ── source rechecks ────────────────────────────────────────────────────────
  /** Re-read the booking/admission a task came from. Returns null when it is still valid, else why not. */
  async function recheckSource(c, task) {
    if (task.source_kind === 'booking') {
      const { rows } = await c.query('SELECT status FROM api_lab_bookings WHERE booking_id = $1 AND tenant_uid = $2', [task.source_ref, task.partner_uid]);
      if (!rows[0]) return { code: 'source_changed', reason: 'The booking no longer exists' };
      if (['cancelled', 'completed'].includes(String(rows[0].status).toLowerCase())) return { code: 'source_changed', reason: `The booking is ${rows[0].status}` };
    }
    if (task.source_kind === 'admission' && /^\d{1,9}$/.test(task.admission_ref || '')) {
      const { rows } = await c.query(
        `SELECT a.status::text AS status, b.bed_number FROM ip_admissions a LEFT JOIN beds b ON b.id = a.bed_id
          WHERE a.id = $1::int AND a.organization_uid = $2`, [task.admission_ref, task.facility_uid]);
      if (!rows[0]) return { code: 'source_changed', reason: 'The admission no longer exists' };
      if (!ACTIVE_ADMISSION.includes(rows[0].status)) return { code: 'source_changed', reason: `The patient is ${rows[0].status}` };
      if (task.bed_label && rows[0].bed_number && rows[0].bed_number !== task.bed_label) {
        return { code: 'source_changed', reason: `The patient has moved from bed ${task.bed_label} to ${rows[0].bed_number}` };
      }
    }
    return null;
  }

  // ── eligibility ────────────────────────────────────────────────────────────
  async function assertEligible(c, ownerUid, phlebotomistId, mode) {
    const { rows } = await c.query(
      `SELECT p.status, p.qualification_expires, p.verified_at, m.status AS m_status, m.active_from, m.active_to, m.can_home, m.can_ward, m.scopes
         FROM lab_phlebotomists p JOIN lab_phlebotomist_memberships m ON m.phlebotomist_id = p.id AND m.owner_uid = $2 AND m.status <> 'ended'
        WHERE p.id = $1`, [phlebotomistId, ownerUid]);
    const r = rows[0];
    const why = (reason) => invalid('That worker cannot be assigned this task', { code: 'worker_not_eligible', reason });
    if (!r) throw why('not a member of this lab');
    if (r.status !== 'active') throw why(`worker is ${r.status}`);
    if (!r.verified_at) throw why('worker is not verified');
    if (r.qualification_expires && new Date(r.qualification_expires) < new Date(now().toISOString().slice(0, 10))) throw why('qualification has expired');
    if (r.m_status !== 'active' || new Date(r.active_from) > now() || (r.active_to && new Date(r.active_to) <= now())) throw why('membership is not active');
    if (!(mode === 'home' ? r.can_home : r.can_ward)) throw why(`not enabled for ${mode} collection`);
    if (!r.scopes.includes(PERMISSIONS.COLLECT)) throw why('worker lacks collection scope');
  }

  // ── command handlers ───────────────────────────────────────────────────────
  // Each handler gets { c, task, principal, actor, payload, operationId, correlationId } and returns
  //   { patch?: {col: value}, data?: {...}, outcome?, stay?: true, status?: 409, body?: {...} }
  // `stay` means "commit what I wrote but do not move the task" (a recorded mismatch, a blocked step).
  const HANDLERS = {
    async assign({ c, task, payload }) {
      const wid = v.uuid(payload.phlebotomistId, 'phlebotomistId');
      await assertEligible(c, task.owner_uid, wid, task.mode);
      return { patch: { assigned_to: wid, assignment_version: task.assignment_version + 1 }, data: { assignedTo: wid } };
    },

    async reassign({ c, task, payload }) {
      const wid = v.uuid(payload.phlebotomistId, 'phlebotomistId');
      const reason = v.str(payload.reason, 'reason', { max: 300 });
      if (wid === task.assigned_to) throw invalid('The task is already assigned to that worker', { field: 'phlebotomistId' });
      await assertEligible(c, task.owner_uid, wid, task.mode);
      return {
        patch: { assigned_to: wid, assignment_version: task.assignment_version + 1 },
        data: { from: task.assigned_to, to: wid, reason },
      };
    },

    async accept({ payload, task }) {
      // The collector acknowledges a specific assignment, not just "the task".
      const av = v.int(payload.assignmentVersion, 'assignmentVersion');
      if (av !== task.assignment_version) {
        throw conflict('assignment_changed', 'This task was reassigned', { currentAssignmentVersion: task.assignment_version });
      }
      return {};
    },

    async decline({ c, task, principal, payload }) {
      const reason = v.str(payload.reason, 'reason', { max: 300 });
      await raiseException(c, task, { code: 'declined_by_worker', reason, principal, nextAction: 'Reassign to another collector' });
      return { patch: { assigned_to: null, assignment_version: task.assignment_version + 1 }, data: { reason, declinedBy: task.assigned_to } };
    },

    async depart({ c, task }) {
      await c.query('UPDATE lab_collection_task_home SET departed_at = now() WHERE task_id = $1', [task.id]);
      return {};
    },

    async arrive({ c, task, payload }) {
      let evidence = null;
      if (payload.evidence !== undefined) {
        const e = v.exactly(payload.evidence, 'evidence', ['method', 'withinRadius', 'accuracyM']);
        evidence = {
          method: v.oneOf(e.method, 'evidence.method', ['geo', 'manual', 'otp']),
          withinRadius: v.bool(e.withinRadius, 'evidence.withinRadius'),
          accuracyM: e.accuracyM === undefined ? null : v.int(e.accuracyM, 'evidence.accuracyM', { max: 100000 }),
        };
      }
      await c.query('UPDATE lab_collection_task_home SET arrived_at = now(), arrival_evidence = $2::jsonb WHERE task_id = $1',
        [task.id, evidence ? JSON.stringify(evidence) : null]);
      return {};
    },

    async bedside({ c, task, principal, payload }) {
      if (payload.locationConfirmed !== true) throw invalid('locationConfirmed must be true: confirm the ward and bed', { field: 'locationConfirmed' });
      const blocked = await recheckSource(c, task);
      if (blocked) {
        await raiseException(c, task, { ...blocked, principal, nextAction: 'Confirm the order and patient location' });
        return { stay: true, status: 409, body: { code: blocked.code, message: blocked.reason } };
      }
      await c.query('UPDATE lab_collection_task_ward SET at_bedside_at = now() WHERE task_id = $1', [task.id]);
      return {};
    },

    async verify_patient({ c, task, principal, payload, operationId }) {
      const method = v.oneOf(payload.method, 'method', ['two_identifiers', 'wristband']);
      const result = v.oneOf(payload.result, 'result', ['match', 'mismatch']);
      const types = Array.isArray(payload.identifierTypes) ? [...new Set(payload.identifierTypes.map((x) => v.str(x, 'identifierTypes[]', { max: 40 })))] : null;
      if (!types || !types.length) throw invalid('identifierTypes is required', { field: 'identifierTypes' });
      if (method === 'two_identifiers' && types.length < 2) throw invalid('Two different identifier types are required', { field: 'identifierTypes' });
      await c.query(
        `INSERT INTO lab_collection_patient_verifications (task_id, method, result, identifier_types, actor_ref, operation_id)
         VALUES ($1, $2, $3, $4::text[], $5, $6)`, [task.id, method, result, types, principal.ref, operationId || null]);
      if (result === 'mismatch') {
        await raiseException(c, task, { code: 'identity_mismatch', reason: 'Patient could not be matched to the order', principal, nextAction: 'Do not collect. Confirm identity with the ordering team' });
        return { stay: true, status: 200, body: { outcome: 'mismatch', message: 'Mismatch recorded. Do not collect.' } };
      }
      return { data: { method, identifierTypes: types } };
    },

    async consent({ c, task, principal, payload, operationId }) {
      const outcome = v.oneOf(payload.outcome, 'outcome', ['granted', 'refused']);
      const row = {
        version: v.str(payload.consentVersion, 'consentVersion', { max: 40 }),
        method: v.oneOf(payload.method, 'method', ['verbal', 'written', 'digital']),
        language: v.str(payload.language, 'language', { max: 40 }),
        givenBy: v.oneOf(payload.givenBy ?? 'patient', 'givenBy', ['patient', 'guardian', 'witnessed']),
      };
      await c.query(
        `INSERT INTO lab_collection_consents (task_id, outcome, consent_version, method, language, given_by, actor_ref, operation_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [task.id, outcome, row.version, row.method, row.language, row.givenBy, principal.ref, operationId || null]);
      if (outcome === 'refused') {
        await raiseException(c, task, { code: 'patient_refused', reason: 'Patient refused collection', principal, nextAction: 'Inform the ordering team' });
        return { patch: { closed_at: DB_NOW }, data: { outcome } };
      }
      return { data: { outcome, consentVersion: row.version } };
    },

    async scan_specimen({ c, task, principal, actor, payload, operationId }) {
      const barcode = v.str(payload.barcode, 'barcode', { max: 64 });
      if (!v.isBarcode(barcode)) throw invalid('barcode has an unsupported format', { field: 'barcode' });
      const ids = Array.isArray(payload.testIds) ? [...new Set(payload.testIds.map((x) => v.uuid(x, 'testIds[]')))] : [];
      if (!ids.length) throw invalid('testIds must list at least one required test', { field: 'testIds' });
      const { rows: tests } = await c.query(
        'SELECT id, container_type, status FROM lab_collection_task_tests WHERE task_id = $1 AND id = ANY($2::uuid[]) FOR UPDATE', [task.id, ids]);
      if (tests.length !== ids.length) throw invalid('Some tests do not belong to this task', { field: 'testIds' });
      const done = tests.filter((t) => t.status !== 'required');
      if (done.length) throw conflict('test_already_scanned', 'Some tests already have a specimen', { testIds: done.map((t) => t.id) });
      const containers = new Set(tests.map((t) => t.container_type));
      if (containers.size > 1) throw invalid('One tube cannot hold tests that need different containers', { field: 'testIds', containers: [...containers] });
      let specimen;
      try {
        const ins = await c.query(
          `INSERT INTO lab_collection_specimens (task_id, owner_uid, barcode, container_type, status, collected_by)
           VALUES ($1, $2, $3, $4, 'scanned', $5) RETURNING *`, [task.id, task.owner_uid, barcode, [...containers][0], principal.id]);
        specimen = ins.rows[0];
      } catch (err) {
        if (err.code === '23505') throw conflict('duplicate_barcode', 'That barcode is already registered', { barcode });
        throw err;
      }
      await c.query(`UPDATE lab_collection_task_tests SET status = 'scanned', specimen_id = $2 WHERE id = ANY($1::uuid[])`, [ids, specimen.id]);
      await custodyEvent(c, specimen, { eventType: 'scanned', from: null, to: 'scanned', actor, principal, operationId, evidence: { testIds: ids } });
      return { outcome: { specimenId: specimen.id, barcode }, data: { specimenId: specimen.id, barcode, testIds: ids } };
    },

    async collect({ c, task, principal, actor, payload, operationId }) {
      const { rows: missing } = await c.query(
        `SELECT test_name FROM lab_collection_task_tests WHERE task_id = $1 AND status = 'required'`, [task.id]);
      if (missing.length) throw conflict('specimens_incomplete', 'Every required test needs a scanned specimen first', { missing: missing.map((m) => m.test_name) });
      const { rows: has } = await c.query('SELECT count(*)::int AS n FROM lab_collection_task_tests WHERE task_id = $1', [task.id]);
      if (!has[0].n) throw conflict('specimens_incomplete', 'The task has no tests to collect');
      if (task.mode === 'ward') {
        if (task.isolation_required && payload.isolationAcknowledged !== true) {
          throw invalid('The isolation precautions must be acknowledged', { field: 'isolationAcknowledged' });
        }
        if (payload.orderVersion !== undefined && v.int(payload.orderVersion, 'orderVersion') !== task.order_version) {
          throw conflict('order_changed', 'The order changed since this task was fetched', { currentOrderVersion: task.order_version });
        }
      }
      const blocked = await recheckSource(c, task);
      if (blocked) {
        await raiseException(c, task, { ...blocked, principal, nextAction: 'Do not collect until the order is confirmed' });
        return { stay: true, status: 409, body: { code: blocked.code, message: blocked.reason } };
      }
      if (task.mode === 'ward' && task.isolation_required) {
        await c.query('UPDATE lab_collection_task_ward SET isolation_ack_at = now() WHERE task_id = $1', [task.id]);
      }
      const { rows: specs } = await c.query(`SELECT * FROM lab_collection_specimens WHERE task_id = $1 AND status = 'scanned' FOR UPDATE`, [task.id]);
      await c.query(`UPDATE lab_collection_specimens SET status = 'collected', collected_at = now() WHERE task_id = $1 AND status = 'scanned'`, [task.id]);
      await c.query(`UPDATE lab_collection_task_tests SET status = 'collected' WHERE task_id = $1 AND status = 'scanned'`, [task.id]);
      for (const s of specs) await custodyEvent(c, s, { eventType: 'collected', from: 'scanned', to: 'collected', actor, principal, operationId });
      return { patch: { collected_at: DB_NOW }, data: { specimens: specs.length } };
    },

    async start_transit({ c, task, principal, actor, operationId }) {
      const { rows: specs } = await c.query(`SELECT * FROM lab_collection_specimens WHERE task_id = $1 AND status = 'collected' FOR UPDATE`, [task.id]);
      await c.query(`UPDATE lab_collection_specimens SET status = 'in_transit' WHERE task_id = $1 AND status = 'collected'`, [task.id]);
      for (const s of specs) await custodyEvent(c, s, { eventType: 'in_transit', from: 'collected', to: 'in_transit', actor, principal, operationId });
      return { data: { specimens: specs.length } };
    },

    async handoff({ c, task, principal, actor, payload, operationId }) {
      const receiverKind = v.oneOf(payload.receiverKind, 'receiverKind', ['lab', 'collection_point']);
      const receiverRef = v.str(payload.receiverRef, 'receiverRef', { max: 80, optional: true });
      if (task.mode === 'home' && receiverKind !== 'lab') throw invalid('A home collection is handed to the lab', { field: 'receiverKind' });
      const from = task.mode === 'home' ? 'in_transit' : 'collected';
      const { rows: specs } = await c.query(`SELECT * FROM lab_collection_specimens WHERE task_id = $1 AND status = $2 FOR UPDATE`, [task.id, from]);
      if (!specs.length) throw conflict('no_specimens', 'There are no specimens to hand over');
      await c.query(`UPDATE lab_collection_specimens SET status = 'handed_over' WHERE task_id = $1 AND status = $2`, [task.id, from]);
      for (const s of specs) {
        await custodyEvent(c, s, { eventType: 'handed_over', from, to: 'handed_over', actor, principal, operationId, evidence: { receiverKind, receiverRef } });
      }
      return { data: { receiverKind, receiverRef, specimens: specs.length } };
    },

    async cancel({ task, payload }) {
      const reason = v.str(payload.reason, 'reason', { max: 300 });
      return { patch: { cancel_reason: reason, closed_at: DB_NOW }, data: { reason } };
    },
  };

  const OUTBOX_EVENTS = {
    assign: 'collection.task.assigned', reassign: 'collection.task.reassigned', collect: 'collection.task.collected',
    handoff: 'collection.task.handed_over', cancel: 'collection.task.cancelled', consent: 'collection.task.consent',
    decline: 'collection.task.declined',
  };

  const PATCHABLE = ['assigned_to', 'assignment_version', 'cancel_reason', 'collected_at', 'closed_at'];

  async function execute(c, { principal, command, taskId, expectedVersion, operationId, correlationId, payload }) {
    const task = await readTask(c, principal, taskId, { lock: true });
    assertCan(principal, permissionForCommand(command), task.owner_uid);
    if (!canWorkMode(principal, task.owner_uid, task.mode)) throw notFound();
    if (expectedVersion !== undefined && expectedVersion !== null && v.int(expectedVersion, 'expectedVersion', { min: 1 }) !== task.version) {
      throw conflict('version_conflict', 'The task changed since you loaded it', { currentVersion: task.version, status: task.status });
    }
    const def = COMMANDS[command] || STATIC_COMMANDS[command];
    if (!def || !HANDLERS[command]) throw new CollectionError('unknown_command', 400, `Unknown command "${command}"`);
    const actor = principal.type === 'phlebotomist' ? ACTORS.PHLEBOTOMIST : def.actors.find((a) => LAB_ACTORS.includes(a));
    if (!actor) throw forbidden('This account cannot issue that command');
    const foreign = foreignModeFields(task.mode, payload);
    if (foreign.length) throw invalid(`These fields do not apply to a ${task.mode} task: ${foreign.join(', ')}`, { fields: foreign });

    let decision;
    try {
      decision = resolve({ mode: task.mode, status: task.status, command, actor, context: { outcome: payload.outcome } });
    } catch (err) {
      throw fromTransition(err);
    }

    const result = await HANDLERS[command]({ c, task, principal, actor, payload, operationId, correlationId });
    if (result.stay) return { status: result.status || 200, body: { ...(result.body || {}), task: project(await readTask(c, principal, task.id, { ignoreAssignee: true }), principal) } };

    let version = task.version;
    if (decision.moves) {
      const patch = result.patch || {};
      const sets = ['status = $2', 'version = version + 1'];
      const params = [task.id, decision.to, task.version];
      for (const col of PATCHABLE) {
        if (!(col in patch)) continue;
        if (patch[col] === DB_NOW) sets.push(`${col} = now()`);
        else { params.push(patch[col]); sets.push(`${col} = $${params.length}`); }
      }
      const upd = await c.query(
        `UPDATE lab_collection_tasks SET ${sets.join(', ')} WHERE id = $1 AND version = $3 RETURNING version`, params);
      if (upd.rowCount !== 1) throw conflict('version_conflict', 'The task changed while this command was running');
      version = upd.rows[0].version;
    }
    await taskEvent(c, task, {
      eventType: decision.event, from: task.status, to: decision.to, version, actor, principal, operationId,
      data: result.data || {},
    });
    if (OUTBOX_EVENTS[command]) {
      await outbox(c, {
        ownerUid: task.owner_uid, type: 'collection_task', id: task.id, event: OUTBOX_EVENTS[command], correlationId,
        payload: { taskId: task.id, mode: task.mode, status: decision.to, version },
        dedupe: `${task.id}:${version}:${command}`,
      });
    }
    return {
      status: 200,
      body: {
        // A decline un-assigns the task, so the collector who declined must still get the outcome of their own command.
        task: project(await readTask(c, principal, task.id, { ignoreAssignee: true }), principal),
        tests: await testsOf(c, task.id),
        ...(result.outcome ? { result: result.outcome } : {}),
      },
    };
  }

  /** The single entry point for every task command (accept, collect, assign, cancel, …). */
  function command({ principal, command: name, taskId, expectedVersion, operationId, deviceId, correlationId, payload }) {
    const p = v.body(payload);
    return withOperation(principal, {
      operationId, command: name, deviceId,
      hashInput: { command: name, taskId, expectedVersion: expectedVersion ?? null, payload: p },
    }, (c) => execute(c, { principal, command: name, taskId, expectedVersion, operationId, correlationId, payload: p }));
  }

  // ── create ─────────────────────────────────────────────────────────────────
  function normaliseTests(raw) {
    if (!Array.isArray(raw) || !raw.length) throw invalid('tests must list at least one test', { field: 'tests' });
    if (raw.length > 50) throw invalid('A task can carry at most 50 tests', { field: 'tests' });
    return raw.map((t, i) => {
      const o = typeof t === 'string' ? { name: t } : (t || {});
      const rawCode = o.code ?? o.testCode ?? o.id;
      return {
        code: v.str(rawCode === undefined || rawCode === null ? undefined : String(rawCode), `tests[${i}].code`, { max: 60, optional: true }),
        name: v.str(o.name ?? o.testName ?? o.test_name ?? o.title, `tests[${i}].name`, { max: 160 }),
        containerType: v.oneOf(o.containerType, `tests[${i}].containerType`, CONTAINERS, { fallback: 'unspecified' }),
        volumeMl: o.requiredVolumeMl === undefined || o.requiredVolumeMl === null ? null : Number(o.requiredVolumeMl),
        handling: v.str(o.handling, `tests[${i}].handling`, { max: 120, optional: true }),
        priority: v.oneOf(o.priority, `tests[${i}].priority`, ['routine', 'urgent', 'stat'], { fallback: 'routine' }),
      };
    });
  }

  async function assertPartner(c, ownerUid, partnerUid, mode) {
    const { rows } = await c.query(
      `SELECT allow_home, allow_ward FROM lab_collection_partners WHERE owner_uid = $1 AND partner_uid = $2 AND status = 'active'`, [ownerUid, partnerUid]);
    if (!rows[0] || !(mode === 'home' ? rows[0].allow_home : rows[0].allow_ward)) {
      throw forbidden('This lab is not linked to that hospital for this kind of collection', { partnerUid });
    }
  }

  const PATIENT_KEYS = ['name', 'age', 'gender', 'uhid'];
  const HOME_KEYS = ['address', 'contactPhone'];
  const WARD_KEYS = ['facilityUid', 'admissionRef', 'wardName', 'bedLabel', 'roundLabel', 'isolationRequired'];
  const CREATE_KEYS = ['mode', 'source', 'bookingId', 'patient', 'tests', 'priority', 'scheduledStart', 'scheduledEnd', ...HOME_KEYS, ...WARD_KEYS];

  function createTask({ principal, input, operationId, deviceId, correlationId }) {
    const body = v.body(input);
    return withOperation(principal, { operationId, command: 'create_task', deviceId, hashInput: { command: 'create_task', body } }, async (c) => {
      assertCan(principal, PERMISSIONS.DISPATCH, principal.ownerUid);
      v.exactly(body, 'body', CREATE_KEYS);
      const mode = v.oneOf(body.mode ?? (body.bookingId ? 'home' : undefined), 'mode', ['home', 'ward']);
      const foreign = foreignModeFields(mode, body);
      if (foreign.length) throw invalid(`These fields do not apply to a ${mode} task: ${foreign.join(', ')}`, { fields: foreign });
      const source = v.oneOf(body.source, 'source', ['manual', 'booking', 'admission'], { fallback: body.bookingId ? 'booking' : (mode === 'ward' ? 'admission' : 'manual') });
      if (source === 'booking' && mode !== 'home') throw invalid('A booking is a home collection', { field: 'source' });
      if (source === 'admission' && mode !== 'ward') throw invalid('An admission is a ward collection', { field: 'source' });
      if (mode === 'ward' && source !== 'admission') throw invalid('A ward collection must come from an admission', { field: 'source' });

      let partnerUid = null;
      let sourceRef = null;
      let patient;
      let tests;
      let home = null;
      let ward = null;
      let start = v.date(body.scheduledStart, 'scheduledStart');
      let end = v.date(body.scheduledEnd, 'scheduledEnd');

      if (source === 'booking') {
        const bookingId = v.str(body.bookingId, 'bookingId', { max: 80 });
        const { rows } = await c.query(
          `SELECT booking_id, tenant_uid, tests, collection_type, collection_date, collection_time_slot, collection_address, patient_name, patient_age, patient_gender, status
             FROM api_lab_bookings WHERE booking_id = $1`, [bookingId]);
        const b = rows[0];
        if (!b) throw notFound('Booking');
        await assertPartner(c, principal.ownerUid, b.tenant_uid, 'home');
        if (b.collection_type !== 'home-collection') throw invalid('That booking is not a home collection', { field: 'bookingId' });
        if (['cancelled', 'completed'].includes(String(b.status).toLowerCase())) throw conflict('source_changed', `The booking is ${b.status}`);
        partnerUid = b.tenant_uid;
        sourceRef = b.booking_id;
        patient = { name: b.patient_name, age: b.patient_age, gender: b.patient_gender, scheduleSlot: b.collection_time_slot };
        tests = normaliseTests(body.tests ?? (Array.isArray(b.tests) ? b.tests : []));
        home = { address: b.collection_address, contactPhone: null };
        if (b.collection_date && !start) {
          start = new Date(`${new Date(b.collection_date).toISOString().slice(0, 10)}T00:00:00.000Z`);
          end = end || new Date(start.getTime() + 24 * 3600 * 1000);
        }
        if (!home.address || typeof home.address !== 'object') throw invalid('The booking has no collection address', { field: 'bookingId' });
      } else {
        const p = v.exactly(body.patient ?? {}, 'patient', PATIENT_KEYS);
        patient = {
          name: v.str(p.name, 'patient.name', { min: 2, max: 120 }),
          age: p.age === undefined || p.age === null ? null : v.int(p.age, 'patient.age', { max: 130 }),
          gender: v.oneOf(p.gender, 'patient.gender', ['male', 'female', 'other'], { optional: true }),
          uhid: v.str(p.uhid, 'patient.uhid', { max: 40, optional: true }),
        };
        tests = normaliseTests(body.tests);
        if (mode === 'home') {
          const a = v.exactly(body.address, 'address', ['line1', 'line2', 'city', 'state', 'pincode', 'landmark']);
          home = {
            address: { line1: v.str(a.line1, 'address.line1', { max: 200 }), line2: v.str(a.line2, 'address.line2', { max: 200, optional: true }),
              city: v.str(a.city, 'address.city', { max: 80 }), state: v.str(a.state, 'address.state', { max: 80, optional: true }),
              pincode: v.str(a.pincode, 'address.pincode', { max: 12, optional: true }), landmark: v.str(a.landmark, 'address.landmark', { max: 200, optional: true }) },
            contactPhone: v.str(body.contactPhone, 'contactPhone', { max: 20, optional: true }),
          };
        }
      }

      if (mode === 'ward') {
        partnerUid = v.ownerUid(body.facilityUid, 'facilityUid');
        await assertPartner(c, principal.ownerUid, partnerUid, 'ward');
        const admissionRef = v.str(body.admissionRef, 'admissionRef', { max: 20 });
        if (!/^\d{1,9}$/.test(admissionRef)) throw invalid('admissionRef is not valid', { field: 'admissionRef' });
        const { rows } = await c.query(
          `SELECT a.status::text AS status, w.name AS ward_name, b.bed_number
             FROM ip_admissions a LEFT JOIN wards w ON w.id = a.ward_id LEFT JOIN beds b ON b.id = a.bed_id
            WHERE a.id = $1::int AND a.organization_uid = $2`, [admissionRef, partnerUid]);
        if (!rows[0]) throw notFound('Admission');
        if (!ACTIVE_ADMISSION.includes(rows[0].status)) throw conflict('source_changed', `The patient is ${rows[0].status}`);
        sourceRef = admissionRef;
        ward = {
          facilityUid: partnerUid, admissionRef, wardName: rows[0].ward_name || v.str(body.wardName, 'wardName', { max: 80, optional: true }),
          bedLabel: rows[0].bed_number || v.str(body.bedLabel, 'bedLabel', { max: 40, optional: true }),
          roundLabel: v.str(body.roundLabel, 'roundLabel', { max: 60, optional: true }),
          isolationRequired: v.bool(body.isolationRequired, 'isolationRequired') ?? false,
        };
      }

      if (start && end && end < start) throw invalid('scheduledEnd must not be before scheduledStart', { field: 'scheduledEnd' });
      const priority = v.oneOf(body.priority, 'priority', ['routine', 'urgent', 'stat'], { fallback: 'routine' });

      let task;
      try {
        const ins = await c.query(
          `INSERT INTO lab_collection_tasks (owner_uid, mode, source_kind, source_ref, partner_uid, priority, scheduled_start, scheduled_end, patient_snapshot, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10) RETURNING *`,
          [principal.ownerUid, mode, source, sourceRef, partnerUid, priority, start, end, JSON.stringify(patient), principal.ref]);
        task = ins.rows[0];
      } catch (err) {
        if (err.code === '23505') throw conflict('task_exists', 'A live collection task already exists for that booking/admission');
        throw err;
      }
      if (home) {
        await c.query('INSERT INTO lab_collection_task_home (task_id, address, contact_phone) VALUES ($1, $2::jsonb, $3)',
          [task.id, JSON.stringify(home.address), home.contactPhone]);
      }
      if (ward) {
        await c.query(
          `INSERT INTO lab_collection_task_ward (task_id, facility_uid, admission_ref, ward_name, bed_label, round_label, isolation_required)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [task.id, ward.facilityUid, ward.admissionRef, ward.wardName, ward.bedLabel, ward.roundLabel, ward.isolationRequired]);
      }
      for (const t of tests) {
        await c.query(
          `INSERT INTO lab_collection_task_tests (task_id, test_code, test_name, container_type, required_volume_ml, handling, priority)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`, [task.id, t.code, t.name, t.containerType, t.volumeMl, t.handling, t.priority]);
      }
      await taskEvent(c, task, { eventType: 'task.created', from: null, to: 'unassigned', version: 1, actor: ACTORS.DISPATCH, principal, operationId, data: { mode, source } });
      await outbox(c, {
        ownerUid: task.owner_uid, type: 'collection_task', id: task.id, event: 'collection.task.created', correlationId,
        payload: { taskId: task.id, mode, status: 'unassigned', version: 1 }, dedupe: `${task.id}:1:create`,
      });
      return { status: 201, body: { task: project(await readTask(c, principal, task.id), principal), tests: await testsOf(c, task.id) } };
    });
  }

  // ── lab receipt ────────────────────────────────────────────────────────────
  function receiveSpecimen({ principal, specimenId, input, operationId, deviceId, correlationId }) {
    const body = v.body(input);
    return withOperation(principal, { operationId, command: 'receive_specimen', deviceId, hashInput: { command: 'receive_specimen', specimenId, body } }, async (c) => {
      const sid = v.uuid(specimenId, 'specimenId');
      assertCan(principal, PERMISSIONS.RECEIVE, principal.ownerUid);
      const outcome = v.oneOf(body.outcome, 'outcome', ['accepted', 'rejected']);
      const condition = v.str(body.condition, 'condition', { max: 120, optional: true });
      const reason = outcome === 'rejected' ? v.str(body.reason, 'reason', { max: 300 }) : null;

      const probe = await c.query('SELECT task_id FROM lab_collection_specimens WHERE id = $1 AND owner_uid = $2', [sid, principal.ownerUid]);
      if (!probe.rows[0]) throw notFound('Specimen');
      // Lock order is always task → specimens, so concurrent receipts for one task serialise instead of deadlocking.
      const task = await readTask(c, principal, probe.rows[0].task_id, { lock: true });
      const { rows } = await c.query('SELECT * FROM lab_collection_specimens WHERE id = $1 FOR UPDATE', [sid]);
      const specimen = rows[0];

      if (specimen.status === 'received' || specimen.status === 'rejected') {
        const same = (specimen.status === 'received') === (outcome === 'accepted');
        if (same) return { status: 200, body: { specimen: { id: sid, status: specimen.status }, replayed: true } };
        throw conflict('already_decided', `That specimen was already ${specimen.status}`);
      }
      if (specimen.status !== 'handed_over') throw conflict('not_handed_over', 'The specimen has not been handed over to the lab yet', { status: specimen.status });
      try {
        resolve({ mode: task.mode, status: task.status, command: 'receive', actor: ACTORS.LAB_RECEIVER });
      } catch (err) {
        throw fromTransition(err);
      }

      const to = outcome === 'accepted' ? 'received' : 'rejected';
      await c.query(
        `UPDATE lab_collection_specimens SET status = $2, received_at = now(), received_by = $3, sample_condition = $4, rejection_reason = $5 WHERE id = $1`,
        [sid, to, principal.ref, condition, reason]);
      await c.query(`UPDATE lab_collection_task_tests SET status = $2 WHERE specimen_id = $1`, [sid, to]);
      await custodyEvent(c, specimen, { eventType: to, from: 'handed_over', to, actor: ACTORS.LAB_RECEIVER, principal, operationId, evidence: { condition, reason } });
      if (outcome === 'rejected') {
        await raiseException(c, task, { code: 'specimen_rejected', reason, specimenId: sid, ownerRole: 'dispatch', principal, nextAction: 'Request a redraw' });
      }

      const left = await c.query(
        `SELECT count(*) FILTER (WHERE status = 'handed_over')::int AS pending, count(*) FILTER (WHERE status = 'rejected')::int AS rejected
           FROM lab_collection_specimens WHERE task_id = $1`, [task.id]);
      let taskStatus = task.status;
      let version = task.version;
      if (left.rows[0].pending === 0) {
        const d = resolve({ mode: task.mode, status: task.status, command: 'receive', actor: ACTORS.LAB_RECEIVER, context: { anyRejected: left.rows[0].rejected > 0 } });
        const upd = await c.query(
          `UPDATE lab_collection_tasks SET status = $2, version = version + 1, closed_at = now() WHERE id = $1 AND version = $3 RETURNING version`, [task.id, d.to, task.version]);
        if (upd.rowCount !== 1) throw conflict('version_conflict', 'The task changed while receiving');
        taskStatus = d.to;
        version = upd.rows[0].version;
        await taskEvent(c, task, { eventType: d.event, from: task.status, to: d.to, version, actor: ACTORS.LAB_RECEIVER, principal, operationId, data: { rejected: left.rows[0].rejected } });
        await outbox(c, {
          ownerUid: task.owner_uid, type: 'collection_task', id: task.id, event: 'collection.task.received', correlationId,
          payload: { taskId: task.id, status: d.to, version }, dedupe: `${task.id}:${version}:receive`,
        });
      }
      return { status: 200, body: { specimen: { id: sid, status: to }, task: { id: task.id, status: taskStatus, version } } };
    });
  }

  // ── redraw and exceptions ──────────────────────────────────────────────────
  function requestRedraw({ principal, taskId, input, operationId, deviceId }) {
    const body = v.body(input);
    return withOperation(principal, { operationId, command: 'request_redraw', deviceId, hashInput: { command: 'request_redraw', taskId, body } }, async (c) => {
      assertCan(principal, PERMISSIONS.DISPATCH, principal.ownerUid);
      const task = await readTask(c, principal, taskId, { lock: true });
      if (task.status !== 'rejected_by_lab') throw conflict('invalid_transition', 'A redraw can only be requested for a task the lab rejected', { status: task.status });
      const existing = await c.query('SELECT id FROM lab_collection_tasks WHERE redraw_of = $1', [task.id]);
      if (existing.rows[0]) return { status: 200, body: { redrawTaskId: existing.rows[0].id, replayed: true } };
      const { rows: rejected } = await c.query(
        `SELECT t.* FROM lab_collection_task_tests t JOIN lab_collection_specimens s ON s.id = t.specimen_id
          WHERE t.task_id = $1 AND s.status = 'rejected'`, [task.id]);
      if (!rejected.length) throw conflict('nothing_to_redraw', 'No specimens were rejected');
      const ins = await c.query(
        `INSERT INTO lab_collection_tasks (owner_uid, mode, source_kind, source_ref, partner_uid, priority, scheduled_start, scheduled_end, patient_snapshot, redraw_of, created_by)
         VALUES ($1, $2, $3, $4, $5, 'urgent', now(), now() + interval '1 day', $6::jsonb, $7, $8) RETURNING *`,
        [task.owner_uid, task.mode, task.source_kind, task.source_ref, task.partner_uid, JSON.stringify(task.patient_snapshot), task.id, principal.ref]);
      const nt = ins.rows[0];
      if (task.mode === 'home') {
        await c.query('INSERT INTO lab_collection_task_home (task_id, address, contact_phone) VALUES ($1, $2::jsonb, $3)', [nt.id, JSON.stringify(task.address), task.contact_phone]);
      } else {
        await c.query(
          `INSERT INTO lab_collection_task_ward (task_id, facility_uid, admission_ref, ward_name, bed_label, round_label, isolation_required, order_version)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [nt.id, task.facility_uid, task.admission_ref, task.ward_name, task.bed_label, task.round_label, task.isolation_required, task.order_version]);
      }
      for (const t of rejected) {
        await c.query(
          `INSERT INTO lab_collection_task_tests (task_id, test_code, test_name, container_type, required_volume_ml, handling, priority)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`, [nt.id, t.test_code, t.test_name, t.container_type, t.required_volume_ml, t.handling, t.priority]);
      }
      await c.query(
        `UPDATE lab_collection_exceptions SET status = 'resolved', resolved_by = $2, resolved_at = now(), resolution = $3, redraw_task_id = $4
          WHERE task_id = $1 AND code = 'specimen_rejected' AND status = 'open'`,
        [task.id, principal.ref, v.str(body.note, 'note', { max: 300, optional: true }) || 'Redraw requested', nt.id]);
      await taskEvent(c, nt, { eventType: 'task.created', from: null, to: 'unassigned', version: 1, actor: ACTORS.DISPATCH, principal, operationId, data: { redrawOf: task.id } });
      return { status: 201, body: { redrawTaskId: nt.id } };
    });
  }

  async function listExceptions(principal, { status = 'open', limit = 100 } = {}) {
    assertCan(principal, PERMISSIONS.READ, principal.ownerUid);
    const st = v.oneOf(status, 'status', ['open', 'resolved']);
    const lim = v.int(limit, 'limit', { min: 1, max: 200 });
    const c = await pool.connect();
    try {
      const { rows } = await c.query(
        `SELECT e.id, e.task_id, e.specimen_id, e.code, e.reason, e.status, e.owner_role, e.due_at, e.next_action, e.created_at,
                e.resolved_at, e.resolution, e.redraw_task_id, (e.status = 'open' AND e.due_at < now()) AS overdue, t.mode
           FROM lab_collection_exceptions e JOIN lab_collection_tasks t ON t.id = e.task_id
          WHERE e.owner_uid = $1 AND e.status = $2 ORDER BY e.created_at DESC LIMIT ${lim}`, [principal.ownerUid, st]);
      return { exceptions: rows.map((r) => ({
        id: r.id, taskId: r.task_id, specimenId: r.specimen_id, code: r.code, reason: r.reason, status: r.status, ownerRole: r.owner_role,
        dueAt: r.due_at, overdue: r.overdue, nextAction: r.next_action, createdAt: r.created_at, resolvedAt: r.resolved_at,
        resolution: r.resolution, redrawTaskId: r.redraw_task_id, mode: r.mode })) };
    } finally {
      c.release();
    }
  }

  function resolveException({ principal, exceptionId, input, operationId, deviceId }) {
    const body = v.body(input);
    return withOperation(principal, { operationId, command: 'resolve_exception', deviceId, hashInput: { command: 'resolve_exception', exceptionId, body } }, async (c) => {
      assertCan(principal, PERMISSIONS.DISPATCH, principal.ownerUid);
      const id = v.uuid(exceptionId, 'exceptionId');
      const resolution = v.str(body.resolution, 'resolution', { max: 300 });
      const { rows } = await c.query(
        `UPDATE lab_collection_exceptions SET status = 'resolved', resolved_by = $3, resolved_at = now(), resolution = $4
          WHERE id = $1 AND owner_uid = $2 AND status = 'open' RETURNING id, task_id`, [id, principal.ownerUid, principal.ref, resolution]);
      if (!rows[0]) {
        const e = await c.query('SELECT status FROM lab_collection_exceptions WHERE id = $1 AND owner_uid = $2', [id, principal.ownerUid]);
        if (!e.rows[0]) throw notFound('Exception');
        return { status: 200, body: { id, status: 'resolved', replayed: true } };
      }
      return { status: 200, body: { id, status: 'resolved' } };
    });
  }

  // ── aggregates and export ──────────────────────────────────────────────────
  async function kpis(principal, { days = 30 } = {}) {
    assertCan(principal, PERMISSIONS.READ, principal.ownerUid);
    const d = v.int(days, 'days', { min: 1, max: 365 });
    const c = await pool.connect();
    try {
      const { rows } = await c.query(
        `SELECT
           count(*) FILTER (WHERE status = ANY($2::text[]))::int AS open_before_collection,
           count(*) FILTER (WHERE status = ANY($2::text[]) AND scheduled_end < now())::int AS overdue,
           count(*) FILTER (WHERE status IN ('en_route', 'arrived', 'at_bedside'))::int AS in_field,
           count(*) FILTER (WHERE status = 'collected')::int AS collected,
           count(*) FILTER (WHERE status IN ('in_transit', 'handed_over', 'ward_handoff'))::int AS handed_over_pending_receipt,
           count(*) FILTER (WHERE status = 'lab_received' AND closed_at > now() - make_interval(days => $3))::int AS lab_received,
           count(*) FILTER (WHERE status = 'rejected_by_lab' AND closed_at > now() - make_interval(days => $3))::int AS rejected,
           count(*) FILTER (WHERE status = 'refused' AND closed_at > now() - make_interval(days => $3))::int AS refused,
           count(*) FILTER (WHERE redraw_of IS NOT NULL AND created_at > now() - make_interval(days => $3))::int AS redraws
         FROM lab_collection_tasks WHERE owner_uid = $1`, [principal.ownerUid, PRE_COLLECTION, d]);
      const med = await c.query(
        `SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM h.at - t.collected_at)) AS median_seconds
           FROM lab_collection_tasks t
           JOIN (SELECT task_id, min(occurred_at) AS at FROM lab_specimen_custody_events WHERE event_type = 'handed_over' GROUP BY task_id) h ON h.task_id = t.id
          WHERE t.owner_uid = $1 AND t.collected_at > now() - make_interval(days => $2)`, [principal.ownerUid, d]);
      const r = rows[0];
      return {
        windowDays: d,
        openBeforeCollection: r.open_before_collection, overdue: r.overdue, inField: r.in_field, collected: r.collected,
        handedOverPendingReceipt: r.handed_over_pending_receipt, labReceived: r.lab_received, rejected: r.rejected, refused: r.refused, redraws: r.redraws,
        medianCollectToHandoffSeconds: med.rows[0].median_seconds === null ? null : Math.round(Number(med.rows[0].median_seconds)),
      };
    } finally {
      c.release();
    }
  }

  /** Server-side export rows; CSV encoding lives in toCsv so the formula-injection guard is in one place. */
  async function exportRows(principal, { from, to } = {}) {
    assertCan(principal, PERMISSIONS.READ, principal.ownerUid);
    const f = v.date(from, 'from');
    const t = v.date(to, 'to');
    const c = await pool.connect();
    try {
      const { rows } = await c.query(
        `SELECT t.id, t.mode, t.status, t.priority, t.source_kind, t.created_at, t.collected_at, t.closed_at, p.display_name AS collector,
                (SELECT count(*) FROM lab_collection_specimens s WHERE s.task_id = t.id)::int AS specimens,
                (SELECT count(*) FROM lab_collection_specimens s WHERE s.task_id = t.id AND s.status = 'rejected')::int AS rejected_specimens
           FROM lab_collection_tasks t LEFT JOIN lab_phlebotomists p ON p.id = t.assigned_to
          WHERE t.owner_uid = $1 AND ($2::timestamptz IS NULL OR t.created_at >= $2) AND ($3::timestamptz IS NULL OR t.created_at <= $3)
          ORDER BY t.created_at DESC LIMIT 5000`, [principal.ownerUid, f, t]);
      return rows;
    } finally {
      c.release();
    }
  }

  /** Linked hospitals plus what a dispatcher can turn into a task right now (bookings and admissions of those hospitals only). */
  async function partners(principal) {
    assertCan(principal, PERMISSIONS.READ, principal.ownerUid);
    const c = await pool.connect();
    try {
      const links = await c.query(
        `SELECT p.partner_uid, p.allow_home, p.allow_ward, t.name AS name
           FROM lab_collection_partners p
           LEFT JOIN entity_registry r ON r.uid = p.partner_uid
           LEFT JOIN tenants t ON r.source_table = 'tenants' AND t.unique_id = p.partner_uid
          WHERE p.owner_uid = $1 AND p.status = 'active' ORDER BY name`, [principal.ownerUid]);
      const bookings = await c.query(
        `SELECT b.booking_id, b.tenant_uid, b.patient_name, b.collection_date, b.collection_time_slot, b.status
           FROM api_lab_bookings b
           JOIN lab_collection_partners p ON p.partner_uid = b.tenant_uid AND p.owner_uid = $1 AND p.status = 'active' AND p.allow_home
          WHERE b.collection_type = 'home-collection' AND lower(b.status) NOT IN ('cancelled', 'completed')
            AND NOT EXISTS (SELECT 1 FROM lab_collection_tasks t WHERE t.owner_uid = $1 AND t.source_kind = 'booking'
                              AND t.source_ref = b.booking_id AND t.status <> ALL($2::text[]))
          ORDER BY b.collection_date NULLS LAST, b.created_at LIMIT 100`, [principal.ownerUid, FINAL_STATUSES]);
      const admissions = await c.query(
        `SELECT a.id, a.organization_uid, a.admission_number, a.uhid, a.status::text AS status, w.name AS ward_name, b.bed_number
           FROM ip_admissions a
           JOIN lab_collection_partners p ON p.partner_uid = a.organization_uid AND p.owner_uid = $1 AND p.status = 'active' AND p.allow_ward
           LEFT JOIN wards w ON w.id = a.ward_id LEFT JOIN beds b ON b.id = a.bed_id
          WHERE a.status::text = ANY($2::text[])
            AND NOT EXISTS (SELECT 1 FROM lab_collection_tasks t WHERE t.owner_uid = $1 AND t.source_kind = 'admission'
                              AND t.source_ref = a.id::text AND t.status <> ALL($3::text[]))
          ORDER BY a.admission_datetime DESC LIMIT 100`, [principal.ownerUid, ACTIVE_ADMISSION, FINAL_STATUSES]);
      return {
        partners: links.rows.map((r) => ({ uid: r.partner_uid, name: r.name, allowHome: r.allow_home, allowWard: r.allow_ward })),
        bridgeableBookings: bookings.rows.map((r) => ({
          bookingId: r.booking_id, partnerUid: r.tenant_uid, patientName: r.patient_name, collectionDate: r.collection_date, slot: r.collection_time_slot, status: r.status })),
        bridgeableAdmissions: admissions.rows.map((r) => ({
          admissionRef: String(r.id), facilityUid: r.organization_uid, admissionNumber: r.admission_number, uhid: r.uhid, status: r.status, wardName: r.ward_name, bedLabel: r.bed_number })),
      };
    } finally {
      c.release();
    }
  }

  return {
    command, partners, createTask, receiveSpecimen, requestRedraw, resolveException,
    getTask, listWorklist, board, timeline, listExceptions, kpis, exportRows,
    // exposed for tests
    _internals: { project, tx },
  };
}

/** CSV with the standard spreadsheet formula-injection guard (a leading = + - @ is neutralised). */
export function toCsv(rows, columns) {
  const cell = (val) => {
    if (val === null || val === undefined) return '';
    let s = val instanceof Date ? val.toISOString() : String(val);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(','), ...rows.map((r) => columns.map((k) => cell(r[k])).join(','))].join('\n');
}

export { can };
