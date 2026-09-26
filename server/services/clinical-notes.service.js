/**
 * Shared clinical note persistence (doctor + hospital HMIS).
 */
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';
import ClinicalNote from '../models/clinical-note.model.js';

let columnsReady = false;

export async function ensureClinicalNoteColumns() {
  if (columnsReady) return;
  await sequelize.query(`
    ALTER TABLE clinical_notes ADD COLUMN IF NOT EXISTS admission_id INTEGER;
    ALTER TABLE clinical_notes ADD COLUMN IF NOT EXISTS note_type VARCHAR(80) DEFAULT 'progress_note';
    ALTER TABLE clinical_notes ADD COLUMN IF NOT EXISTS author_role VARCHAR(80);
    ALTER TABLE clinical_notes ADD COLUMN IF NOT EXISTS organization_id INTEGER;
    CREATE INDEX IF NOT EXISTS idx_clinical_notes_admission ON clinical_notes(admission_id, "createdAt" DESC);
  `);
  columnsReady = true;
}

export async function resolveDoctorId({ doctorId, userId, organizationId }) {
  if (doctorId) return doctorId;
  if (userId) {
    const [byUser] = await sequelize.query(
      `SELECT id FROM doctors WHERE id = :userId OR user_id = :userId LIMIT 1`,
      { replacements: { userId }, type: QueryTypes.SELECT }
    );
    if (byUser?.id) return byUser.id;
  }
  if (organizationId) {
    const [byOrg] = await sequelize.query(
      `SELECT id FROM doctors WHERE hospital_id = :organizationId OR organization_id = :organizationId ORDER BY id ASC LIMIT 1`,
      { replacements: { organizationId }, type: QueryTypes.SELECT }
    );
    if (byOrg?.id) return byOrg.id;
  }
  const [any] = await sequelize.query(`SELECT id FROM doctors ORDER BY id ASC LIMIT 1`, { type: QueryTypes.SELECT });
  return any?.id || userId || 1;
}

export async function createClinicalNote(payload) {
  await ensureClinicalNoteColumns();
  const doctorId = await resolveDoctorId(payload);
  if (!payload.patientId) throw new Error('patientId is required');

  const note = await ClinicalNote.create({
    appointmentId: payload.appointmentId || null,
    patientId: payload.patientId,
    doctorId,
    subjective: payload.subjective || '',
    objective: payload.objective || '',
    assessment: payload.assessment || '',
    plan: payload.plan || '',
    chiefComplaint: payload.chiefComplaint || payload.subject || '',
    vitals: payload.vitals || {},
    icd10Codes: payload.icd10Codes || [],
    cptCodes: payload.cptCodes || [],
    status: payload.status || 'draft',
    isAiGenerated: payload.isAiGenerated || false,
    aiConfidenceScore: payload.aiConfidenceScore || null,
    encounterSummary: payload.encounterSummary || null,
  });

  if (payload.admissionId || payload.noteType || payload.authorRole || payload.organizationId) {
    await sequelize.query(
      `UPDATE clinical_notes SET
         admission_id = COALESCE(:admissionId, admission_id),
         note_type = COALESCE(:noteType, note_type),
         author_role = COALESCE(:authorRole, author_role),
         organization_id = COALESCE(:organizationId, organization_id)
       WHERE id = :id`,
      {
        replacements: {
          id: note.id,
          admissionId: payload.admissionId || null,
          noteType: payload.noteType || 'progress_note',
          authorRole: payload.authorRole || null,
          organizationId: payload.organizationId || null,
        },
        type: QueryTypes.UPDATE,
      }
    );
  }

  return getClinicalNoteById(note.id);
}

export async function getClinicalNoteById(id, { organizationId } = {}) {
  await ensureClinicalNoteColumns();
  // When a hospital context is given the note must belong to it (audit follow-up: notes were readable across tenants).
  const scoped = organizationId != null;
  const [row] = await sequelize.query(
    `SELECT cn.*, cn.admission_id, cn.note_type, cn.author_role, cn.organization_id
     FROM clinical_notes cn WHERE cn.id = :id ${scoped ? 'AND cn.organization_id = :organizationId' : ''} LIMIT 1`,
    { replacements: { id, ...(scoped ? { organizationId } : {}) }, type: QueryTypes.SELECT }
  );
  return row || null;
}

/**
 * `organizationId` scopes the listing to one hospital (the hospital-staff routes always pass it). Omitting it keeps the
 * legacy doctor-app behaviour. Notes with no organization (legacy rows) are NOT visible to any hospital.
 */
export async function listClinicalNotes({ patientId, admissionId, limit = 50, organizationId } = {}) {
  await ensureClinicalNoteColumns();
  const clauses = [];
  const replacements = { limit: Number(limit) || 50 };
  if (organizationId != null) {
    clauses.push(`organization_id = :organizationId`);
    replacements.organizationId = organizationId;
  }
  if (patientId) {
    clauses.push(`"patientId" = :patientId`);
    replacements.patientId = patientId;
  }
  if (admissionId) {
    clauses.push(`admission_id = :admissionId`);
    replacements.admissionId = admissionId;
  }
  if (!patientId && !admissionId) return [];           // never an unbounded listing, even for a hospital
  return sequelize.query(
    `SELECT * FROM clinical_notes WHERE ${clauses.join(' AND ')} ORDER BY "createdAt" DESC LIMIT :limit`,
    { replacements, type: QueryTypes.SELECT }
  );
}

/**
 * Care-relationship check for the doctor app (audit follow-up: /clinical-workflow/notes/patient|admission/:id returned
 * ANY patient's notes to ANY doctor). A doctor may read a patient's notes when they wrote one for that patient, or
 * have an appointment with them. `patientId` is matched as a user id and as a patients.id (both are in use).
 */
export async function doctorHasCareRelationship(doctorId, patientId) {
  const d = Number(doctorId); const p = Number(patientId);
  if (!Number.isInteger(d) || d <= 0 || !Number.isInteger(p) || p <= 0) return false;
  await ensureClinicalNoteColumns();
  const rows = await sequelize.query(
    `SELECT 1 FROM clinical_notes WHERE "doctorId" = :d AND "patientId" = :p
     UNION ALL
     SELECT 1 FROM appointments a
      WHERE a."doctorId" = :d
        AND (a."userId" = :p OR a."userId" IN (SELECT "userId" FROM patients WHERE id = :p))
     LIMIT 1`,
    { replacements: { d, p }, type: QueryTypes.SELECT }
  );
  return rows.length > 0;
}

/**
 * Notes the doctor is entitled to see: the listing is narrowed to patients they have a care relationship with, or —
 * for hospital-employed doctors — notes stamped with their own hospital. Nothing else is returned.
 */
export async function listClinicalNotesForDoctor({ doctorId, doctorOrganizationId, patientId, admissionId, limit } = {}) {
  const notes = await listClinicalNotes({ patientId, admissionId, limit });
  const allowedPatients = new Map();
  const visible = [];
  for (const note of notes) {
    if (Number(note.doctorId) === Number(doctorId)) { visible.push(note); continue; }
    if (doctorOrganizationId != null && note.organization_id != null && Number(note.organization_id) === Number(doctorOrganizationId)) { visible.push(note); continue; }
    if (!allowedPatients.has(note.patientId)) allowedPatients.set(note.patientId, await doctorHasCareRelationship(doctorId, note.patientId));
    if (allowedPatients.get(note.patientId)) visible.push(note);
  }
  return visible;
}

export async function updateClinicalNote(id, doctorId, updates) {
  await ensureClinicalNoteColumns();
  const note = await ClinicalNote.findOne({ where: { id, doctorId } });
  if (!note) return null;
  if (note.status === 'signed') throw new Error('Signed notes cannot be edited');

  const allowed = [
    'subjective', 'objective', 'assessment', 'plan', 'chiefComplaint',
    'vitals', 'icd10Codes', 'cptCodes', 'encounterSummary', 'status',
  ];
  const patch = Object.fromEntries(
    Object.entries(updates || {}).filter(([key]) => allowed.includes(key))
  );
  await note.update({ ...patch, status: patch.status || 'draft' });

  if (updates.admissionId != null || updates.noteType || updates.authorRole) {
    await sequelize.query(
      `UPDATE clinical_notes SET
         admission_id = COALESCE(:admissionId, admission_id),
         note_type = COALESCE(:noteType, note_type),
         author_role = COALESCE(:authorRole, author_role)
       WHERE id = :id`,
      {
        replacements: {
          id,
          admissionId: updates.admissionId ?? null,
          noteType: updates.noteType ?? null,
          authorRole: updates.authorRole ?? null,
        },
        type: QueryTypes.UPDATE,
      }
    );
  }
  return getClinicalNoteById(id);
}

export async function signClinicalNote(id, doctorId) {
  const note = await ClinicalNote.findOne({ where: { id, doctorId } });
  if (!note) return null;

  const crypto = await import('crypto');
  const signatureHash = crypto.createHash('sha256')
    .update(`${note.id}-${doctorId}-${new Date().toISOString()}`)
    .digest('hex');

  await note.update({ status: 'signed', signedAt: new Date(), signatureHash });
  return getClinicalNoteById(id);
}
