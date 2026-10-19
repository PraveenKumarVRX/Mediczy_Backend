/**
 * Nursing IPD Service — Phase 2
 *
 * Covers:
 *  - Structured nursing assessments (admission, shift, risk)
 *  - IPD task board (priority task list per ward/nurse)
 */

import { requireIndividualNurse, nursingQuery,nursingContext,assertAdmission,boundedNumber,clinicalError,nursingAudit,requireText } from './nursing-context.service.js';
import { QueryTypes } from 'sequelize';

// SCHEMA_NOT_MIGRATED is returned by the shared query adapter; schema is migration-owned.

// ── Nursing assessments ───────────────────────────────────────────────────────

export async function createNursingAssessment({
  organizationId, admissionId, patientId, assessmentType = 'admission',
  assessedBy, fallRisk, pressureSoreRisk, infectionRisk, painScore,
  mobilityStatus, nutritionStatus, cognitiveStatus, ivAccess, woundStatus,
  drainDetails, intakeMl, outputMl, allergiesConfirmed, medsReconciled,
  patientEducated, educationTopics, notes, assessmentData, assessedAt
}) {
    requireIndividualNurse();
  const ctx=nursingContext();
  const admission=await assertAdmission(admissionId,{active:true,patientId});
  organizationId=ctx.organizationId;patientId=admission.patient_id;assessedBy=ctx.actorId;
  if(!['admission','shift','risk','discharge_education'].includes(assessmentType)) throw clinicalError(422,'INVALID_ASSESSMENT','Invalid assessment type');
  if(painScore!=null) boundedNumber(painScore,0,10,'Pain score');
  const [result] = await nursingQuery(
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
  const ctx=nursingContext();await assertAdmission(admissionId);
  return nursingQuery(
    `SELECT * FROM nursing_assessments WHERE admission_id = :admId AND organization_id= :org ORDER BY assessed_at DESC`,
    { replacements: { admId: admissionId, org:ctx.organizationId }, type: QueryTypes.SELECT }
  );
}

// ── Task board ────────────────────────────────────────────────────────────────

export async function createNursingTask({
  organizationId, admissionId, patientId, wardId, taskType,
  title, description, priority = 'routine', dueAt, assignedTo, templateKey
}) {
  const ctx=nursingContext();const admission=await assertAdmission(admissionId,{active:true,patientId});
  organizationId=ctx.organizationId;patientId=admission.patient_id;wardId=admission.current_ward_id;
  requireText(title,'Task title',500);
  if(!['stat','urgent','routine'].includes(priority)) throw clinicalError(422,'INVALID_PRIORITY','Invalid task priority');
  const [result] = await nursingQuery(
    `INSERT INTO nursing_tasks (organization_id, admission_id, patient_id, ward_id,
       task_type, title, description, priority, due_at, assigned_to, template_key)
     VALUES (:orgId, :admId, :patientId, :wardId, :type, :title, :desc, :priority, :due, :assignedTo, :template)
     ON CONFLICT (organization_id,admission_id,template_key) WHERE template_key IS NOT NULL DO NOTHING RETURNING *`,
    {
      replacements: {
        orgId: organizationId || null, admId: admissionId, patientId: patientId || null,
        wardId: wardId || null, type: taskType, title, desc: description || null,
        priority, due: dueAt || null, assignedTo: assignedTo || null, template:templateKey||null
      },
      type: QueryTypes.INSERT
    }
  );
  return result[0];
}

export async function getNursingTaskBoard(organizationId,{admissionId,wardId,assignedTo,status,windowHours=24}={}) {
  const ctx=nursingContext();if(admissionId) await assertAdmission(admissionId);
  return nursingQuery(`SELECT t.*,t.due_at AS scheduled_at,a.admission_number FROM nursing_tasks t JOIN ip_admissions a ON a.id=t.admission_id AND a.organization_id=t.organization_id
    WHERE t.organization_id= :org AND (:admission::bigint IS NULL OR t.admission_id= :admission) AND (:ward::bigint IS NULL OR t.ward_id= :ward)
    AND (:nurse::text IS NULL OR t.assigned_to= :nurse) AND (:status ='all' OR t.status= :status)
    AND (t.due_at IS NULL OR t.due_at<=NOW()+ :hours *INTERVAL '1 hour')
    AND (:role !='nurse' OR EXISTS(SELECT 1 FROM nursing_assignments na WHERE na.organization_id= :org AND na.nurse_id= :actor AND na.ward_id=t.ward_id AND na.starts_at<=NOW() AND na.ends_at>NOW() AND na.revoked_at IS NULL))
    ORDER BY CASE t.priority WHEN 'stat' THEN 1 WHEN 'urgent' THEN 2 ELSE 3 END,t.due_at NULLS LAST,t.id`,{replacements:{org:ctx.organizationId,admission:admissionId||null,ward:wardId||null,nurse:assignedTo||null,status:status||'all',hours:boundedNumber(windowHours,1,720,'Window hours'),role:ctx.role,actor:ctx.actorId},type:QueryTypes.SELECT});
}
export async function completeNursingTask(taskId,organizationId,{notes,version}={}) {
    requireIndividualNurse();
  const ctx=nursingContext();const [task]=await nursingQuery('SELECT * FROM nursing_tasks WHERE id= :id AND organization_id= :org FOR UPDATE',{replacements:{id:taskId,org:ctx.organizationId},type:QueryTypes.SELECT});
  if(!task) throw clinicalError(404,'TASK_NOT_FOUND','Task not found');await assertAdmission(task.admission_id,{active:true});
  if(task.status==='completed') return task;
  if(Number(version)!==task.version) throw clinicalError(409,'STALE_VERSION','The task changed; refresh first');
  const [row]=await nursingQuery("UPDATE nursing_tasks SET status='completed',completed_by= :actor,completed_at=NOW(),notes= :notes,version=version+1,updated_at=NOW() WHERE id= :id RETURNING *",{replacements:{id:taskId,actor:String(ctx.actorId),notes:notes||null},type:QueryTypes.SELECT});
  await nursingAudit('nursing.task.completed','nursing_task',taskId);return row;
}

export async function autoGenerateAdmissionTasks(admissionId, organizationId, { wardId, patientId } = {}) {
  const defaults = [
    { taskType: 'assessment', title: 'Complete admission nursing assessment', priority: 'urgent', dueHours: 2 },
    { taskType: 'vitals',     title: 'Record baseline vitals',               priority: 'urgent', dueHours: 1 },
    { taskType: 'medication', title: 'Review and reconcile admission medications', priority: 'urgent', dueHours: 4 },
    { taskType: 'wound_care', title: 'Inspect and document skin condition',  priority: 'routine', dueHours: 8 },
    { taskType: 'education',  title: 'Orientation — call bell, diet, activity restrictions', priority: 'routine', dueHours: 6 },
  ];
  await assertAdmission(admissionId,{active:true});
  const created = [];
  for (const d of defaults) {
    const due = new Date(Date.now() + d.dueHours * 3600000);
    const task = await createNursingTask({ organizationId, admissionId, patientId, wardId, taskType: d.taskType, title: d.title, priority: d.priority, dueAt: due, templateKey:d.taskType });
    if(task) created.push(task);
  }
  return created;
}
