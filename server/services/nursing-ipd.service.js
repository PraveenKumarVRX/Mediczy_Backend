/**
 * Nursing IPD Service — Phase 2
 *
 * Covers:
 *  - Structured nursing assessments (admission, shift, risk)
 *  - IPD task board (priority task list per ward/nurse)
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';

async function ensureTables() {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS nursing_assessments (
      id              BIGSERIAL PRIMARY KEY,
      organization_id BIGINT,
      admission_id    BIGINT NOT NULL,
      patient_id      BIGINT,
      assessment_type TEXT NOT NULL DEFAULT 'admission',  -- admission | shift | risk | discharge_education
      assessed_by     TEXT,
      fall_risk       TEXT,        -- low | medium | high
      pressure_sore_risk TEXT,     -- low | medium | high (Braden)
      infection_risk  TEXT,
      pain_score      SMALLINT,
      mobility_status TEXT,        -- independent | assisted | dependent | bedbound
      nutrition_status TEXT,
      cognitive_status TEXT,
      iv_access       TEXT,
      wound_status    TEXT,
      drain_details   TEXT,
      intake_ml       INTEGER,
      output_ml       INTEGER,
      allergies_confirmed BOOLEAN DEFAULT FALSE,
      meds_reconciled     BOOLEAN DEFAULT FALSE,
      patient_educated    BOOLEAN DEFAULT FALSE,
      education_topics    JSONB DEFAULT '[]'::jsonb,
      notes           TEXT,
      assessment_data JSONB DEFAULT '{}'::jsonb,
      assessed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_nursing_assessment_admission
      ON nursing_assessments(admission_id, assessed_at DESC);

    CREATE TABLE IF NOT EXISTS nursing_tasks (
      id              BIGSERIAL PRIMARY KEY,
      organization_id BIGINT,
      admission_id    BIGINT NOT NULL,
      patient_id      BIGINT,
      ward_id         BIGINT,
      task_type       TEXT NOT NULL,   -- vitals | medication | wound_care | assessment | education | other
      title           TEXT NOT NULL,
      description     TEXT,
      priority        TEXT DEFAULT 'routine',  -- stat | urgent | routine
      due_at          TIMESTAMPTZ,
      assigned_to     TEXT,
      status          TEXT DEFAULT 'pending',  -- pending | in_progress | completed | missed
      completed_by    TEXT,
      completed_at    TIMESTAMPTZ,
      notes           TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_nursing_tasks_admission ON nursing_tasks(admission_id);
    CREATE INDEX IF NOT EXISTS idx_nursing_tasks_ward      ON nursing_tasks(ward_id, status, due_at);
    CREATE INDEX IF NOT EXISTS idx_nursing_tasks_due       ON nursing_tasks(due_at, status);
  `);
}
ensureTables().catch(e => console.warn('[nursing-ipd] table init:', e.message));

// ── Nursing assessments ───────────────────────────────────────────────────────

export async function createNursingAssessment({
  organizationId, admissionId, patientId, assessmentType = 'admission',
  assessedBy, fallRisk, pressureSoreRisk, infectionRisk, painScore,
  mobilityStatus, nutritionStatus, cognitiveStatus, ivAccess, woundStatus,
  drainDetails, intakeMl, outputMl, allergiesConfirmed, medsReconciled,
  patientEducated, educationTopics, notes, assessmentData, assessedAt
}) {
  const [result] = await sequelize.query(
    `INSERT INTO nursing_assessments (
       organization_id, admission_id, patient_id, assessment_type, assessed_by,
       fall_risk, pressure_sore_risk, infection_risk, pain_score, mobility_status,
       nutrition_status, cognitive_status, iv_access, wound_status, drain_details,
       intake_ml, output_ml, allergies_confirmed, meds_reconciled, patient_educated,
       education_topics, notes, assessment_data, assessed_at
     ) VALUES (
       :orgId, :admId, :patientId, :type, :by,
       :fall, :pressure, :infection, :pain, :mobility,
       :nutrition, :cognitive, :iv, :wound, :drain,
       :intake, :output, :allergies, :meds, :educated,
       :topics::jsonb, :notes, :data::jsonb, :assessedAt
     ) RETURNING *`,
    {
      replacements: {
        orgId: organizationId || null, admId: admissionId, patientId: patientId || null,
        type: assessmentType, by: assessedBy || null,
        fall: fallRisk || null, pressure: pressureSoreRisk || null, infection: infectionRisk || null,
        pain: painScore ?? null, mobility: mobilityStatus || null,
        nutrition: nutritionStatus || null, cognitive: cognitiveStatus || null,
        iv: ivAccess || null, wound: woundStatus || null, drain: drainDetails || null,
        intake: intakeMl ?? null, output: outputMl ?? null,
        allergies: allergiesConfirmed ?? false, meds: medsReconciled ?? false,
        educated: patientEducated ?? false, topics: JSON.stringify(educationTopics || []),
        notes: notes || null, data: JSON.stringify(assessmentData || {}),
        assessedAt: assessedAt || new Date()
      },
      type: QueryTypes.INSERT
    }
  );
  return result[0];
}

export async function getAdmissionAssessments(admissionId) {
  return sequelize.query(
    `SELECT * FROM nursing_assessments WHERE admission_id = :admId ORDER BY assessed_at DESC`,
    { replacements: { admId: admissionId }, type: QueryTypes.SELECT }
  );
}

// ── Task board ────────────────────────────────────────────────────────────────

export async function createNursingTask({
  organizationId, admissionId, patientId, wardId, taskType,
  title, description, priority = 'routine', dueAt, assignedTo
}) {
  const [result] = await sequelize.query(
    `INSERT INTO nursing_tasks (organization_id, admission_id, patient_id, ward_id,
       task_type, title, description, priority, due_at, assigned_to)
     VALUES (:orgId, :admId, :patientId, :wardId, :type, :title, :desc, :priority, :due, :assignedTo)
     RETURNING *`,
    {
      replacements: {
        orgId: organizationId || null, admId: admissionId, patientId: patientId || null,
        wardId: wardId || null, type: taskType, title, desc: description || null,
        priority, due: dueAt || null, assignedTo: assignedTo || null
      },
      type: QueryTypes.INSERT
    }
  );
  return result[0];
}

export async function getNursingTaskBoard(organizationId, { wardId, assignedTo, status, windowHours = 4 } = {}) {
  let where = 'organization_id = :orgId';
  const replacements = { orgId: organizationId };

  if (wardId)     { where += ' AND ward_id = :wardId';     replacements.wardId = wardId; }
  if (assignedTo) { where += ' AND assigned_to = :nurse';  replacements.nurse = assignedTo; }

  const statusFilter = status || 'pending';
  where += ` AND status = :status AND (due_at IS NULL OR due_at <= NOW() + INTERVAL '${parseInt(windowHours)} hours')`;
  replacements.status = statusFilter;

  return sequelize.query(
    `SELECT t.*, a.admission_number FROM nursing_tasks t
     LEFT JOIN ip_admissions a ON a.id = t.admission_id
     WHERE ${where}
     ORDER BY
       CASE priority WHEN 'stat' THEN 1 WHEN 'urgent' THEN 2 ELSE 3 END,
       due_at ASC NULLS LAST`,
    { replacements, type: QueryTypes.SELECT }
  );
}

export async function completeNursingTask(taskId, organizationId, { completedBy, notes } = {}) {
  await sequelize.query(
    `UPDATE nursing_tasks
     SET status = 'completed', completed_by = :by, completed_at = NOW(), notes = :notes, updated_at = NOW()
     WHERE id = :taskId AND organization_id = :orgId`,
    { replacements: { taskId, orgId: organizationId, by: completedBy || null, notes: notes || null }, type: QueryTypes.UPDATE }
  );
  return { success: true };
}

export async function autoGenerateAdmissionTasks(admissionId, organizationId, { wardId, patientId } = {}) {
  const defaults = [
    { taskType: 'assessment', title: 'Complete admission nursing assessment', priority: 'urgent', dueHours: 2 },
    { taskType: 'vitals',     title: 'Record baseline vitals',               priority: 'urgent', dueHours: 1 },
    { taskType: 'medication', title: 'Review and reconcile admission medications', priority: 'urgent', dueHours: 4 },
    { taskType: 'wound_care', title: 'Inspect and document skin condition',  priority: 'routine', dueHours: 8 },
    { taskType: 'education',  title: 'Orientation — call bell, diet, activity restrictions', priority: 'routine', dueHours: 6 },
  ];
  const created = [];
  for (const d of defaults) {
    const due = new Date(Date.now() + d.dueHours * 3600000);
    const task = await createNursingTask({ organizationId, admissionId, patientId, wardId, taskType: d.taskType, title: d.title, priority: d.priority, dueAt: due });
    created.push(task);
  }
  return created;
}
