/**
 * Shared clinical note persistence (doctor + hospital HMIS).
 */
import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';
import ClinicalNote from '../models/clinical-note.model.js';
import { appendClinicalEvent } from './careos/clinical-timeline.service.js';

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

  if (payload.organizationId) {
    appendClinicalEvent({
      organizationId: payload.organizationId,
      patientId: payload.patientId,
      admissionId: payload.admissionId || null,
      eventType: 'clinical_note',
      title: `${(payload.noteType || 'progress_note').replace(/_/g, ' ')} added`,
      body: payload.chiefComplaint || payload.subject || payload.assessment || null,
      actorType: payload.isAiGenerated ? 'ai' : 'doctor',
      actorId: doctorId,
      severity: 'info',
      metadata: { noteId: note.id, noteType: payload.noteType || 'progress_note' },
    }).catch((err) => console.warn('[clinical-notes] timeline event failed:', err.message));
  }

  return getClinicalNoteById(note.id);
}

export async function getClinicalNoteById(id) {
  await ensureClinicalNoteColumns();
  const [row] = await sequelize.query(
    `SELECT cn.*, cn.admission_id, cn.note_type, cn.author_role, cn.organization_id
     FROM clinical_notes cn WHERE cn.id = :id LIMIT 1`,
    { replacements: { id }, type: QueryTypes.SELECT }
  );
  return row || null;
}

export async function listClinicalNotes({ patientId, admissionId, limit = 50 } = {}) {
  await ensureClinicalNoteColumns();
  const clauses = [];
  const replacements = { limit: Number(limit) || 50 };
  if (patientId) {
    clauses.push(`"patientId" = :patientId`);
    replacements.patientId = patientId;
  }
  if (admissionId) {
    clauses.push(`admission_id = :admissionId`);
    replacements.admissionId = admissionId;
  }
  if (!clauses.length) return [];
  return sequelize.query(
    `SELECT * FROM clinical_notes WHERE ${clauses.join(' AND ')} ORDER BY "createdAt" DESC LIMIT :limit`,
    { replacements, type: QueryTypes.SELECT }
  );
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
