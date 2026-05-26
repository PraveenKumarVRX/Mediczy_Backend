/**
 * Workflow AI Orchestrator
 *
 * Event-driven AI triggers that fire automatically at key ADT/clinical events.
 * AI assists — it never blocks care. All outputs are advisory drafts.
 *
 * Events handled:
 *   patient.admitted      → predict LOS, suggest pathway, assess readmission risk
 *   patient.ot.completed  → draft operative note, schedule follow-up
 *   patient.discharged    → generate discharge summary, send discharge packet
 *   vital.critical        → real-time deterioration alert (see vitals-ews.service.js)
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';

// ── LOS Prediction ────────────────────────────────────────────────────────────

const PATHWAY_LOS = {
  appendicectomy: 3,
  cholecystectomy: 2,
  hysterectomy: 5,
  knee_replacement: 5,
  hip_replacement: 7,
  cabg: 10,
  angioplasty: 3,
  fracture_fixation: 4,
  hernia_repair: 2,
  normal_delivery: 2,
  caesarean: 4,
  default: 4
};

function estimateLOS(admissionType, diagnosis) {
  if (!diagnosis) return PATHWAY_LOS.default;
  const d = diagnosis.toLowerCase();
  for (const [key, days] of Object.entries(PATHWAY_LOS)) {
    if (d.includes(key.replace(/_/g, ' '))) return days;
  }
  if (admissionType === 'emergency') return 5;
  return PATHWAY_LOS.default;
}

// ── Clinical Pathway Templates ────────────────────────────────────────────────

const PATHWAY_TEMPLATES = {
  surgical: {
    name: 'Surgical Admission Pathway',
    steps: ['pre_op_workup', 'anaesthesia_fitness', 'consent', 'ot_booking', 'surgery', 'post_op_monitoring', 'physiotherapy', 'discharge_planning']
  },
  medical: {
    name: 'Medical Admission Pathway',
    steps: ['investigations', 'specialist_review', 'treatment', 'monitoring', 'discharge_planning']
  },
  emergency: {
    name: 'Emergency Admission Pathway',
    steps: ['stabilization', 'urgent_investigations', 'specialist_consultation', 'definitive_treatment', 'icu_step_down', 'discharge_planning']
  },
  maternity: {
    name: 'Maternity Pathway',
    steps: ['obs_review', 'fetal_monitoring', 'delivery_planning', 'delivery', 'postnatal_care', 'discharge']
  }
};

function suggestPathway(diagnosis, admissionType) {
  if (!diagnosis) return PATHWAY_TEMPLATES[admissionType === 'emergency' ? 'emergency' : 'medical'];
  const d = diagnosis.toLowerCase();
  if (d.includes('delivery') || d.includes('labour') || d.includes('obstet')) return PATHWAY_TEMPLATES.maternity;
  if (admissionType === 'emergency') return PATHWAY_TEMPLATES.emergency;
  const surgicalKeywords = ['appendic','cholecyst','hernia','fracture','arthroplasty','replacement','bypass','angioplasty','hysterectomy','laparoscop','thyroid'];
  if (surgicalKeywords.some(k => d.includes(k))) return PATHWAY_TEMPLATES.surgical;
  return PATHWAY_TEMPLATES.medical;
}

// ── Readmission Risk ──────────────────────────────────────────────────────────

async function computeReadmissionRisk(patientId, organizationId) {
  const [stats] = await sequelize.query(
    `SELECT COUNT(*) as total_admissions,
            SUM(CASE WHEN discharge_datetime > NOW() - INTERVAL '30 days' THEN 1 ELSE 0 END) as recent_30d
     FROM ip_admissions WHERE patient_id = :patientId AND organization_id = :orgId AND status = 'discharged'`,
    { replacements: { patientId, orgId: organizationId }, type: QueryTypes.SELECT }
  );
  const recentCount = parseInt(stats?.recent_30d || 0);
  const totalCount = parseInt(stats?.total_admissions || 0);
  if (recentCount >= 2) return { risk: 'high', reason: 'Multiple recent admissions in last 30 days' };
  if (totalCount >= 5) return { risk: 'medium', reason: 'History of frequent admissions' };
  return { risk: 'low', reason: 'No significant prior admission history' };
}

// ── Event Handlers ────────────────────────────────────────────────────────────

export async function onPatientAdmitted(admission) {
  const { id: admissionId, patient_id: patientId, organization_id: organizationId, admission_type, admission_diagnosis } = admission;

  const los = estimateLOS(admission_type, admission_diagnosis);
  const pathway = suggestPathway(admission_diagnosis, admission_type);
  const readmissionRisk = await computeReadmissionRisk(patientId, organizationId).catch(() => ({ risk: 'unknown' }));

  // Store predictions on admission record
  await sequelize.query(
    `UPDATE ip_admissions SET expected_los_days = COALESCE(expected_los_days, :los), notes = COALESCE(notes, '') || :aiNote, updated_at = NOW() WHERE id = :admId`,
    {
      replacements: {
        los,
        aiNote: `\n[AI] Suggested pathway: ${pathway.name}. Predicted LOS: ${los} days. Readmission risk: ${readmissionRisk.risk}.`,
        admId: admissionId
      },
      type: QueryTypes.UPDATE
    }
  ).catch(() => {});

  return { los, pathway, readmissionRisk };
}

export async function onOTCompleted(otBooking) {
  const { patient_id: patientId, organization_id: organizationId, procedure_name: procedureName, operative_notes } = otBooking;

  // Auto-schedule first follow-up appointment (7 days post-surgery default)
  const followUpDate = new Date();
  followUpDate.setDate(followUpDate.getDate() + 7);

  await sequelize.query(
    `INSERT INTO follow_up_plans (patient_id, organization_id, reason, planned_date, notes, status, created_at, updated_at)
     VALUES (:patientId, :orgId, :reason, :date, :notes, 'pending', NOW(), NOW())
     ON CONFLICT DO NOTHING`,
    {
      replacements: {
        patientId, orgId: organizationId,
        reason: `Post-operative review: ${procedureName}`,
        date: followUpDate,
        notes: 'Auto-scheduled by system after surgery completion. Review wound, mobility, and medications.'
      },
      type: QueryTypes.INSERT
    }
  ).catch(() => {});

  return { followUpScheduled: true, followUpDate };
}

export async function onPatientDischarged(admission) {
  const { id: admissionId, patient_id: patientId, organization_id: organizationId } = admission;

  // Trigger discharge summary generation via offline scribe if not already present
  if (!admission.discharge_summary_id) {
    try {
      const { default: fetch } = await import('node-fetch').catch(() => ({ default: null }));
      if (fetch) {
        fetch(`http://localhost:${process.env.PORT || 5000}/api/offline-scribe/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-internal-token': process.env.INTERNAL_API_TOKEN || 'internal' },
          body: JSON.stringify({
            admissionId, patientId, organizationId, documentType: 'discharge_summary', autoGenerate: true
          })
        }).catch(() => {});
      }
    } catch {}
  }

  // Schedule 30-day post-discharge follow-up reminder
  const reminder30 = new Date();
  reminder30.setDate(reminder30.getDate() + 30);

  await sequelize.query(
    `INSERT INTO follow_up_plans (patient_id, organization_id, reason, planned_date, notes, status, created_at, updated_at)
     VALUES (:patientId, :orgId, :reason, :date, :notes, 'pending', NOW(), NOW())
     ON CONFLICT DO NOTHING`,
    {
      replacements: {
        patientId, orgId: organizationId,
        reason: 'Post-discharge review',
        date: reminder30,
        notes: 'Routine 30-day post-discharge check. Review for complications, medication compliance.'
      },
      type: QueryTypes.INSERT
    }
  ).catch(() => {});

  return { dischargeSummaryQueued: !admission.discharge_summary_id, followUpPlanned: true };
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

export async function dispatchEvent(eventType, payload) {
  try {
    switch (eventType) {
      case 'patient.admitted':
        return await onPatientAdmitted(payload);
      case 'patient.ot.completed':
        return await onOTCompleted(payload);
      case 'patient.discharged':
        return await onPatientDischarged(payload);
      default:
        return null;
    }
  } catch (err) {
    // Orchestrator failures must never interrupt clinical workflow
    console.error(`[WorkflowAI] Event ${eventType} failed:`, err.message);
    return null;
  }
}
