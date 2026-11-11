/**
 * OT Scheduling Service
 *
 * Manages operation theatre bookings, WHO safety checklists,
 * and emergency OT fast-track activation.
 *
 * B2 Safety: status transitions to 'incision' and 'completed' are hard-gated
 * on checklist completion.  Emergency override is allowed for defined roles and
 * is immutably audited.
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';
import { dispatchEvent } from './workflow-ai-orchestrator.service.js';

import { schemaVerifier } from '../utils/schema-guard.js';
// ── B2: Override audit table bootstrap ───────────────────────────────────────

const SCHEMA_TABLES = ['ot_safety_overrides'];

// Owned by the migration, verified here. Creating these on demand would let a
// skipped migration look healthy on tables without its indexes and constraints.
const ensureOTSafetyTables = schemaVerifier({
  sequelize,
  tables: SCHEMA_TABLES,
  code: 'SCHEMA_NOT_MIGRATED',
  message: 'Apply migration 20261015002900-ot-safety-governance before using OT safety overrides',
});


// Roles allowed to override OT hard-stops
const OVERRIDE_ALLOWED_ROLES = new Set(['surgeon', 'anesthetist', 'ot_head', 'admin', 'super_admin']);

// Which checklist(s) must be complete before each transition
const TRANSITION_GATES = {
  incision:   ['sign_in', 'time_out'],
  completed:  ['sign_in', 'time_out', 'sign_out'],
};

const WHO_CHECKLISTS = {
  sign_in: [
    { id: 'identity', label: 'Patient identity, site and procedure confirmed', required: true },
    { id: 'site_marked', label: 'Surgical site marked', required: true },
    { id: 'anaesthesia_check', label: 'Anaesthesia machine and medication check complete', required: true },
    { id: 'pulse_ox', label: 'Pulse oximeter on patient and functioning', required: true },
    { id: 'allergy', label: 'Known allergy checked', required: true },
    { id: 'airway_risk', label: 'Difficult airway / aspiration risk assessed', required: true },
    { id: 'blood_loss', label: 'Risk of > 500 ml blood loss — fluids and blood products available', required: false }
  ],
  time_out: [
    { id: 'team_intro', label: 'All team members introduced by name and role', required: true },
    { id: 'patient_confirm', label: 'Patient name, procedure and site confirmed', required: true },
    { id: 'antibiotic', label: 'Antibiotic prophylaxis given within last 60 minutes', required: true },
    { id: 'imaging', label: 'Essential imaging displayed', required: false },
    { id: 'implant_concern', label: 'Equipment or implant concerns raised', required: false },
    { id: 'critical_steps', label: 'Surgeon reviews critical steps, duration, blood loss', required: true }
  ],
  sign_out: [
    { id: 'procedure_name', label: 'Procedure name recorded', required: true },
    { id: 'count_correct', label: 'Instrument, swab and needle counts correct', required: true },
    { id: 'specimen', label: 'Specimen labelled', required: false },
    { id: 'equipment_issues', label: 'Equipment problems to address', required: false },
    { id: 'recovery_plan', label: 'Surgeon, anaesthesiologist and nurse review key concerns for recovery', required: true }
  ]
};

export async function bookOT({
  organizationId,
  admissionId,
  patientId,
  surgeonId,
  anesthetistId,
  otRoomId,
  procedureCode,
  procedureName,
  scheduledStart,
  scheduledEnd,
  bookingType = 'elective',
  implantsRequired = false,
  bloodUnitsReserved = 0,
  preAuthId,
  anesthesiaType,
  notes
}) {
  await ensureOTSafetyTables();
  // Check for conflicts
  const conflicts = await checkConflicts(organizationId, otRoomId, scheduledStart, scheduledEnd);
  if (conflicts.length > 0 && bookingType !== 'emergency') {
    throw new Error(`OT room has ${conflicts.length} conflict(s) in the requested slot`);
  }

  const [result] = await sequelize.query(
    `INSERT INTO ot_bookings (
      organization_id, admission_id, patient_id, surgeon_id, anesthetist_id,
      ot_room_id, procedure_code, procedure_name, scheduled_start, scheduled_end,
      booking_type, implants_required, blood_units_reserved, pre_auth_id,
      anesthesia_type, notes, ot_status, created_at, updated_at
    ) VALUES (
      :orgId, :admId, :patientId, :surgeonId, :anesthetistId,
      :roomId, :procCode, :procName, :start, :end,
      :bookType, :implants, :bloodUnits, :preAuth,
      :anesthType, :notes, 'scheduled', NOW(), NOW()
    ) RETURNING *`,
    {
      replacements: {
        orgId: organizationId, admId: admissionId || null, patientId,
        surgeonId: surgeonId || null, anesthetistId: anesthetistId || null,
        roomId: otRoomId || null, procCode: procedureCode || null, procName: procedureName,
        start: scheduledStart, end: scheduledEnd,
        bookType: bookingType, implants: implantsRequired, bloodUnits: bloodUnitsReserved,
        preAuth: preAuthId || null, anesthType: anesthesiaType || null, notes: notes || null
      },
      type: QueryTypes.INSERT
    }
  );
  return result[0];
}

export async function emergencyActivateOT({
  organizationId,
  patientId,
  admissionId,
  surgeonId,
  procedureName,
  anesthesiaType,
  notes
}) {
  await ensureOTSafetyTables();
  // Find the first available OT room (emergency rooms first)
  const [room] = await sequelize.query(
    `SELECT * FROM ot_rooms
     WHERE organization_id = :orgId AND status = 'available' AND active = true
     ORDER BY CASE room_type WHEN 'emergency' THEN 1 WHEN 'major' THEN 2 ELSE 3 END
     LIMIT 1`,
    { replacements: { orgId: organizationId }, type: QueryTypes.SELECT }
  );

  const now = new Date();
  const end = new Date(now.getTime() + 3 * 60 * 60 * 1000); // 3-hour default window

  return bookOT({
    organizationId, admissionId, patientId, surgeonId, anesthetistId: null,
    otRoomId: room?.id || null, procedureName,
    scheduledStart: now, scheduledEnd: end,
    bookingType: 'emergency', anesthesiaType, notes
  });
}

export async function updateOTStatus(organizationId, bookingId, status, {
  operativeNotes,
  performedBy,
  override = null    // { reasonCode, approverId, approverRole } — emergency bypass
} = {}) {
  await ensureOTSafetyTables();
  const validStatuses = ['scheduled','patient_in','prep','incision','closure','completed','cancelled','postponed'];
  if (!validStatuses.includes(status)) throw new Error('Invalid OT status');

  // ── B2: Hard-stop gate ─────────────────────────────────────────────────────
  const requiredChecklists = TRANSITION_GATES[status];
  if (requiredChecklists) {
    const checklists = await sequelize.query(
      `SELECT checklist_type, is_complete FROM ot_checklists WHERE ot_booking_id = :bookingId`,
      { replacements: { bookingId }, type: QueryTypes.SELECT }
    );
    const completedMap = Object.fromEntries(checklists.map(c => [c.checklist_type, c.is_complete]));
    const missing = requiredChecklists.filter(cl => !completedMap[cl]);

    if (missing.length > 0) {
      // Override path
      if (override?.reasonCode && override?.approverId) {
        if (!OVERRIDE_ALLOWED_ROLES.has(override.approverRole)) {
          throw new Error(`Role '${override.approverRole}' is not authorised to override OT safety checks`);
        }
        // Immutable audit record
        await sequelize.query(
          `INSERT INTO ot_safety_overrides
             (ot_booking_id, organization_id, override_type, blocked_transition, missing_items, reason_code, approver_id, approver_role, context)
           VALUES (:bookingId, :orgId, 'checklist_bypass', :transition, :missing::jsonb, :reason, :approver, :role, '{}'::jsonb)`,
          {
            replacements: {
              bookingId, orgId: organizationId, transition: status,
              missing: JSON.stringify(missing), reason: override.reasonCode,
              approver: override.approverId, role: override.approverRole || null
            },
            type: QueryTypes.INSERT
          }
        );
      } else {
        const labels = missing.map(m => WHO_CHECKLISTS[m]?.map(i => i.required ? i.label : null).filter(Boolean).join(', ')).join(' | ');
        const blocked = new Error(`Cannot advance to '${status}': incomplete required checklists [${missing.join(', ')}]. Missing items: ${labels}`);
        // A machine-readable code so the theatre screen can tell a safety stop
        // from a validation slip, rather than both arriving as a bare 400.
        blocked.code = 'OT_STATUS_BLOCKED';
        blocked.status = 409;
        blocked.details = { missingChecklists: missing, attemptedTransition: status };
        throw blocked;
      }
    }
  }

  // A case cannot be closed on an unwritten note. The operative note is the
  // clinical record of what was done; completing without one leaves the
  // procedure undocumented at exactly the point the record is relied upon for
  // coding, claims and any later review. The override path above covers the
  // emergency case for checklists; a note is written after the fact, so the
  // transition waits for it rather than bypassing it.
  if (status === 'completed') {
    const [signedNote] = await sequelize.query(
      `SELECT id FROM operative_notes
        WHERE ot_booking_id = :bookingId AND status = 'signed' LIMIT 1`,
      { replacements: { bookingId }, type: QueryTypes.SELECT }
    );
    if (!signedNote) {
      const error = new Error('A signed operative note is required before an OT case can be marked completed.');
      error.code = 'OPERATIVE_NOTE_REQUIRED';
      error.status = 409;
      error.details = { bookingId };
      throw error;
    }
  }

  const updates = ['ot_status = :status', 'updated_at = NOW()'];
  const replacements = { status, bookingId, orgId: organizationId };

  if (status === 'patient_in') {
    updates.push('actual_start = NOW()');
  }
  if (status === 'completed') {
    updates.push('actual_end = NOW()');
    if (operativeNotes) { updates.push('operative_notes = :opNotes'); replacements.opNotes = operativeNotes; }
  }

  await sequelize.query(
    `UPDATE ot_bookings SET ${updates.join(', ')} WHERE id = :bookingId AND organization_id = :orgId`,
    { replacements, type: QueryTypes.UPDATE }
  );

  // Free OT room when completed/cancelled
  if (['completed','cancelled'].includes(status)) {
    const [booking] = await sequelize.query(
      `SELECT ot_room_id, patient_id, organization_id, procedure_name, operative_notes FROM ot_bookings WHERE id = :bookingId`,
      { replacements: { bookingId }, type: QueryTypes.SELECT }
    );
    if (booking?.ot_room_id) {
      await sequelize.query(
        `UPDATE ot_rooms SET status = 'cleaning' WHERE id = :roomId`,
        { replacements: { roomId: booking.ot_room_id }, type: QueryTypes.UPDATE }
      );
    }
    // Prediction Agent: auto-schedule the post-op follow-up as soon as the
    // case is marked complete, instead of relying on staff to remember.
    if (status === 'completed' && booking) {
      dispatchEvent('patient.ot.completed', booking).catch((err) => console.warn('[ot-scheduling] prediction agent dispatch failed:', err.message));
    }
  }

  return { success: true };
}

export async function submitChecklist(organizationId, bookingId, checklistType, items, completedBy) {
  await ensureOTSafetyTables();
  if (!WHO_CHECKLISTS[checklistType]) throw new Error('Invalid checklist type');

  const isComplete = WHO_CHECKLISTS[checklistType]
    .filter(i => i.required)
    .every(i => items[i.id] === true);

  const existing = await sequelize.query(
    `SELECT id FROM ot_checklists WHERE ot_booking_id = :bookingId AND checklist_type = :type`,
    { replacements: { bookingId, type: checklistType }, type: QueryTypes.SELECT }
  );

  if (existing.length) {
    await sequelize.query(
      `UPDATE ot_checklists SET checklist_data = :data::jsonb, is_complete = :complete, completed_by = :by, completed_at = NOW() WHERE ot_booking_id = :bookingId AND checklist_type = :type`,
      { replacements: { data: JSON.stringify(items), complete: isComplete, by: completedBy, bookingId, type: checklistType }, type: QueryTypes.UPDATE }
    );
  } else {
    await sequelize.query(
      `INSERT INTO ot_checklists (ot_booking_id, checklist_type, checklist_data, is_complete, completed_by, completed_at, created_at)
       VALUES (:bookingId, :type, :data::jsonb, :complete, :by, NOW(), NOW())`,
      { replacements: { bookingId, type: checklistType, data: JSON.stringify(items), complete: isComplete, by: completedBy }, type: QueryTypes.INSERT }
    );
  }

  return { success: true, isComplete, missingRequired: WHO_CHECKLISTS[checklistType].filter(i => i.required && !items[i.id]).map(i => i.label) };
}

export async function getChecklistStatus(organizationId, bookingId) {
  await ensureOTSafetyTables();
  const checklists = await sequelize.query(
    `SELECT checklist_type, is_complete, completed_at FROM ot_checklists WHERE ot_booking_id = :bookingId`,
    { replacements: { bookingId }, type: QueryTypes.SELECT }
  );
  const status = {};
  for (const type of ['sign_in','time_out','sign_out']) {
    const c = checklists.find(x => x.checklist_type === type);
    status[type] = { completed: !!c?.is_complete, completedAt: c?.completed_at || null, template: WHO_CHECKLISTS[type] };
  }
  return status;
}

export async function getOTSchedule(organizationId, date, roomId) {
  await ensureOTSafetyTables();
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  let where = 'ob.organization_id = :orgId AND ob.scheduled_start >= :start AND ob.scheduled_start <= :end';
  const replacements = { orgId: organizationId, start: dayStart, end: dayEnd };
  if (roomId) { where += ' AND ob.ot_room_id = :roomId'; replacements.roomId = roomId; }

  return sequelize.query(
    `SELECT ob.*, r.name as room_name, r.room_type,
            a.admission_number
     FROM ot_bookings ob
     LEFT JOIN ot_rooms r ON r.id = ob.ot_room_id
     LEFT JOIN ip_admissions a ON a.id = ob.admission_id
     WHERE ${where}
     ORDER BY ob.scheduled_start`,
    { replacements, type: QueryTypes.SELECT }
  );
}

export async function checkConflicts(organizationId, roomId, start, end) {
  await ensureOTSafetyTables();
  if (!roomId) return [];
  return sequelize.query(
    `SELECT id FROM ot_bookings
     WHERE organization_id = :orgId AND ot_room_id = :roomId
       AND ot_status NOT IN ('cancelled','completed')
       AND ((scheduled_start < :end AND scheduled_end > :start))`,
    { replacements: { orgId: organizationId, roomId, start, end }, type: QueryTypes.SELECT }
  );
}
