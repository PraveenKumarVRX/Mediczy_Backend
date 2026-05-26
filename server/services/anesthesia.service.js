/**
 * Anesthesia Service — Phase 3
 *
 * Pre-anesthesia assessment + intra-operative anesthesia record.
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';

async function ensureTables() {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS anesthesia_assessments (
      id                    BIGSERIAL PRIMARY KEY,
      organization_id       BIGINT,
      ot_booking_id         BIGINT,
      admission_id          BIGINT NOT NULL,
      patient_id            BIGINT,
      anesthetist_id        TEXT,
      assessment_date       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      asa_class             SMALLINT,   -- 1-6
      airway_class          SMALLINT,   -- Mallampati 1-4
      airway_notes          TEXT,
      aspiration_risk       BOOLEAN DEFAULT FALSE,
      npo_status            TEXT,       -- fasting | not_fasting | unclear
      npo_confirmed_at      TIMESTAMPTZ,
      current_medications   JSONB DEFAULT '[]'::jsonb,
      allergies_confirmed   BOOLEAN DEFAULT FALSE,
      pre_op_labs_reviewed  BOOLEAN DEFAULT FALSE,
      cardiac_risk          TEXT,       -- low | intermediate | high
      pulmonary_risk        TEXT,
      anesthesia_plan       TEXT,       -- general | spinal | epidural | regional | sedation | local
      consent_obtained      BOOLEAN DEFAULT FALSE,
      consent_notes         TEXT,
      pre_med_given         BOOLEAN DEFAULT FALSE,
      pre_med_details       TEXT,
      clearance_status      TEXT DEFAULT 'pending',  -- cleared | conditional | deferred | refused
      clearance_notes       TEXT,
      assessment_data       JSONB DEFAULT '{}'::jsonb,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_anesthesia_assessment_admission
      ON anesthesia_assessments(admission_id);
    CREATE INDEX IF NOT EXISTS idx_anesthesia_assessment_booking
      ON anesthesia_assessments(ot_booking_id);

    CREATE TABLE IF NOT EXISTS anesthesia_records (
      id                    BIGSERIAL PRIMARY KEY,
      organization_id       BIGINT,
      ot_booking_id         BIGINT NOT NULL,
      admission_id          BIGINT,
      patient_id            BIGINT,
      anesthetist_id        TEXT,
      anesthesia_type       TEXT,
      induction_agent       TEXT,
      induction_dose        TEXT,
      maintenance_agent     TEXT,
      airway_device         TEXT,        -- ETT | LMA | mask | spinal | epidural
      airway_device_size    TEXT,
      intubation_attempts   SMALLINT DEFAULT 1,
      intubation_grade      SMALLINT,
      position              TEXT,
      iv_access             TEXT,
      preop_bp_systolic     SMALLINT,
      preop_bp_diastolic    SMALLINT,
      preop_hr              SMALLINT,
      preop_spo2            SMALLINT,
      blood_loss_ml         INTEGER,
      urine_output_ml       INTEGER,
      fluids_given          JSONB DEFAULT '[]'::jsonb,   -- [{ type, amount_ml }]
      drugs_given           JSONB DEFAULT '[]'::jsonb,   -- [{ drug, dose, time }]
      regional_details      TEXT,
      intraop_events        TEXT,
      reversal_given        BOOLEAN DEFAULT FALSE,
      reversal_agent        TEXT,
      extubation_status     TEXT,    -- smooth | difficult | reintubated | not_applicable
      pacu_destination      TEXT,    -- ward | icu | pacu
      pacu_arrival_bp_sys   SMALLINT,
      pacu_arrival_hr       SMALLINT,
      pacu_arrival_spo2     SMALLINT,
      pacu_pain_score       SMALLINT,
      pacu_aldrete_score    SMALLINT,
      complications         TEXT,
      record_start          TIMESTAMPTZ,
      record_end            TIMESTAMPTZ,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_anesthesia_record_booking
      ON anesthesia_records(ot_booking_id);
  `);
}
ensureTables().catch(e => console.warn('[anesthesia] table init:', e.message));

// ── Pre-anesthesia assessment ─────────────────────────────────────────────────

export async function createAssessment(data) {
  const {
    organizationId, otBookingId, admissionId, patientId, anesthetistId,
    asaClass, airwayClass, airwayNotes, aspirationRisk, npoStatus, npoConfirmedAt,
    currentMedications, allergiesConfirmed, preOpLabsReviewed, cardiacRisk,
    pulmonaryRisk, anesthesiaPlan, consentObtained, consentNotes,
    preMedGiven, preMedDetails, clearanceStatus, clearanceNotes, assessmentData
  } = data;

  const [result] = await sequelize.query(
    `INSERT INTO anesthesia_assessments (
       organization_id, ot_booking_id, admission_id, patient_id, anesthetist_id,
       asa_class, airway_class, airway_notes, aspiration_risk, npo_status, npo_confirmed_at,
       current_medications, allergies_confirmed, pre_op_labs_reviewed, cardiac_risk,
       pulmonary_risk, anesthesia_plan, consent_obtained, consent_notes,
       pre_med_given, pre_med_details, clearance_status, clearance_notes, assessment_data
     ) VALUES (
       :orgId, :bookingId, :admId, :patientId, :anesthId,
       :asa, :airway, :airwayNotes, :aspiration, :npo, :npoAt,
       :meds::jsonb, :allergies, :labs, :cardiac,
       :pulmonary, :plan, :consent, :consentNotes,
       :preMed, :preMedDetails, :clearance, :clearanceNotes, :data::jsonb
     ) RETURNING *`,
    {
      replacements: {
        orgId: organizationId || null, bookingId: otBookingId || null,
        admId: admissionId, patientId: patientId || null, anesthId: anesthetistId || null,
        asa: asaClass || null, airway: airwayClass || null, airwayNotes: airwayNotes || null,
        aspiration: aspirationRisk ?? false, npo: npoStatus || null, npoAt: npoConfirmedAt || null,
        meds: JSON.stringify(currentMedications || []), allergies: allergiesConfirmed ?? false,
        labs: preOpLabsReviewed ?? false, cardiac: cardiacRisk || null,
        pulmonary: pulmonaryRisk || null, plan: anesthesiaPlan || null,
        consent: consentObtained ?? false, consentNotes: consentNotes || null,
        preMed: preMedGiven ?? false, preMedDetails: preMedDetails || null,
        clearance: clearanceStatus || 'pending', clearanceNotes: clearanceNotes || null,
        data: JSON.stringify(assessmentData || {})
      },
      type: QueryTypes.INSERT
    }
  );

  // Sync clearance status back to OT booking
  if (otBookingId && clearanceStatus) {
    await sequelize.query(
      `UPDATE ot_bookings SET updated_at = NOW() WHERE id = :bookingId`,
      { replacements: { bookingId: otBookingId }, type: QueryTypes.UPDATE }
    );
  }

  return result[0];
}

export async function getAssessmentByBooking(otBookingId) {
  const [row] = await sequelize.query(
    `SELECT * FROM anesthesia_assessments WHERE ot_booking_id = :bookingId ORDER BY created_at DESC LIMIT 1`,
    { replacements: { bookingId: otBookingId }, type: QueryTypes.SELECT }
  );
  return row || null;
}

// ── Intra-operative record ────────────────────────────────────────────────────

export async function createRecord(data) {
  const {
    organizationId, otBookingId, admissionId, patientId, anesthetistId,
    anesthesiaType, inductionAgent, inductionDose, maintenanceAgent,
    airwayDevice, airwayDeviceSize, intubationAttempts, intubationGrade,
    position, ivAccess, preopBpSystolic, preopBpDiastolic, preopHr, preopSpo2,
    bloodLossMl, urineOutputMl, fluidsGiven, drugsGiven, regionalDetails,
    intraopEvents, reversalGiven, reversalAgent, extubationStatus, pacuDestination,
    pacuArrivalBpSys, pacuArrivalHr, pacuArrivalSpo2, pacuPainScore, pacuAldreteScore,
    complications, recordStart, recordEnd
  } = data;

  const [result] = await sequelize.query(
    `INSERT INTO anesthesia_records (
       organization_id, ot_booking_id, admission_id, patient_id, anesthetist_id,
       anesthesia_type, induction_agent, induction_dose, maintenance_agent,
       airway_device, airway_device_size, intubation_attempts, intubation_grade,
       position, iv_access, preop_bp_systolic, preop_bp_diastolic, preop_hr, preop_spo2,
       blood_loss_ml, urine_output_ml, fluids_given, drugs_given, regional_details,
       intraop_events, reversal_given, reversal_agent, extubation_status, pacu_destination,
       pacu_arrival_bp_sys, pacu_arrival_hr, pacu_arrival_spo2, pacu_pain_score, pacu_aldrete_score,
       complications, record_start, record_end
     ) VALUES (
       :orgId, :bookingId, :admId, :patientId, :anesthId,
       :type, :indAgent, :indDose, :maintenance,
       :airway, :airwaySize, :intubAttempts, :intubGrade,
       :position, :ivAccess, :bpSys, :bpDia, :hr, :spo2,
       :bloodLoss, :urine, :fluids::jsonb, :drugs::jsonb, :regional,
       :events, :reversal, :reversalAgent, :extubation, :pacu,
       :pacuBp, :pacuHr, :pacuSpo2, :pacuPain, :pacuAldrete,
       :complications, :start, :end
     ) RETURNING *`,
    {
      replacements: {
        orgId: organizationId || null, bookingId: otBookingId, admId: admissionId || null,
        patientId: patientId || null, anesthId: anesthetistId || null,
        type: anesthesiaType || null, indAgent: inductionAgent || null, indDose: inductionDose || null,
        maintenance: maintenanceAgent || null, airway: airwayDevice || null,
        airwaySize: airwayDeviceSize || null, intubAttempts: intubationAttempts || 1,
        intubGrade: intubationGrade || null, position: position || null, ivAccess: ivAccess || null,
        bpSys: preopBpSystolic || null, bpDia: preopBpDiastolic || null, hr: preopHr || null, spo2: preopSpo2 || null,
        bloodLoss: bloodLossMl || null, urine: urineOutputMl || null,
        fluids: JSON.stringify(fluidsGiven || []), drugs: JSON.stringify(drugsGiven || []),
        regional: regionalDetails || null, events: intraopEvents || null,
        reversal: reversalGiven ?? false, reversalAgent: reversalAgent || null,
        extubation: extubationStatus || null, pacu: pacuDestination || null,
        pacuBp: pacuArrivalBpSys || null, pacuHr: pacuArrivalHr || null,
        pacuSpo2: pacuArrivalSpo2 || null, pacuPain: pacuPainScore || null,
        pacuAldrete: pacuAldreteScore || null, complications: complications || null,
        start: recordStart || null, end: recordEnd || null
      },
      type: QueryTypes.INSERT
    }
  );
  return result[0];
}

export async function getRecordByBooking(otBookingId) {
  const [row] = await sequelize.query(
    `SELECT * FROM anesthesia_records WHERE ot_booking_id = :bookingId ORDER BY created_at DESC LIMIT 1`,
    { replacements: { bookingId: otBookingId }, type: QueryTypes.SELECT }
  );
  return row || null;
}

export async function updateRecord(recordId, updates) {
  const allowed = ['intraop_events','drugs_given','fluids_given','blood_loss_ml','urine_output_ml',
    'complications','extubation_status','pacu_destination','pacu_arrival_bp_sys','pacu_arrival_hr',
    'pacu_arrival_spo2','pacu_pain_score','pacu_aldrete_score','record_end'];
  const sets = [];
  const replacements = { recordId };
  for (const [k, v] of Object.entries(updates)) {
    if (!allowed.includes(k)) continue;
    sets.push(`${k} = :${k}`);
    replacements[k] = (k.endsWith('_given')) ? JSON.stringify(v) : v;
  }
  if (!sets.length) return { success: true };
  sets.push('updated_at = NOW()');
  await sequelize.query(
    `UPDATE anesthesia_records SET ${sets.join(', ')} WHERE id = :recordId`,
    { replacements, type: QueryTypes.UPDATE }
  );
  return { success: true };
}
