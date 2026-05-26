/**
 * HMIS Phase 3–5 tables migration — B8
 *
 * Creates all tables introduced by the phase 3-5 services that rely on
 * ensureTables() at startup. This migration makes schema intent explicit
 * and supports a dry-run / rollback rehearsal without starting the server.
 *
 * Tables created:
 *   anesthesia_assessments, anesthesia_records
 *   procedure_consumables, implant_records, family_notifications
 *   billing_estimates, non_payable_items
 *   corporate_referrals, corporate_eligibility_checks
 *   fitness_certificates, return_to_work_clearances
 *   discharge_packets
 *   follow_up_plans, recovery_checkins, remote_monitoring_alerts
 *   patient_feedback, outcome_records
 *   icu_admissions, icu_ventilator_charts, icu_drip_records
 *   icu_daily_goals, icu_severity_scores, icu_events
 *   consent_enforcement_log
 *   patient_navigation_events
 *   nursing_assessments, nursing_tasks
 *   bed_reservations
 *   discharge_readiness_items, discharge_overrides
 *   ot_safety_overrides
 *   emar_blocked_attempts
 */

export async function up(queryInterface, Sequelize) {
  const q = (sql) => queryInterface.sequelize.query(sql);

  // ── Phase 1: Navigation ───────────────────────────────────────────────────
  await q(`
    CREATE TABLE IF NOT EXISTS patient_navigation_events (
      id              BIGSERIAL PRIMARY KEY,
      organization_id BIGINT,
      patient_id      BIGINT NOT NULL,
      encounter_id    BIGINT,
      admission_id    BIGINT,
      category        TEXT NOT NULL,
      event_code      TEXT,
      title           TEXT NOT NULL,
      description     TEXT,
      status          TEXT DEFAULT 'completed',
      location        JSONB DEFAULT '{}'::jsonb,
      performed_by    TEXT,
      metadata        JSONB DEFAULT '{}'::jsonb,
      event_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_pne_patient  ON patient_navigation_events(patient_id);
    CREATE INDEX IF NOT EXISTS idx_pne_event_at ON patient_navigation_events(event_at DESC);
    CREATE INDEX IF NOT EXISTS idx_pne_org      ON patient_navigation_events(organization_id, event_at DESC);
  `);

  // ── Phase 1: Bed reservations ─────────────────────────────────────────────
  await q(`
    CREATE TABLE IF NOT EXISTS bed_reservations (
      id              BIGSERIAL PRIMARY KEY,
      organization_id BIGINT,
      bed_id          BIGINT NOT NULL,
      token           TEXT NOT NULL,
      reserved_by     TEXT,
      context         TEXT,
      expires_at      TIMESTAMPTZ NOT NULL,
      status          TEXT DEFAULT 'active',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_bed_res_active ON bed_reservations(bed_id) WHERE status = 'active';
  `);

  // ── Phase 1: Discharge readiness ──────────────────────────────────────────
  await q(`
    CREATE TABLE IF NOT EXISTS discharge_readiness_items (
      id              BIGSERIAL PRIMARY KEY,
      organization_id BIGINT,
      admission_id    BIGINT NOT NULL,
      dimension       TEXT NOT NULL,
      label           TEXT NOT NULL,
      mandatory       BOOLEAN DEFAULT TRUE,
      is_complete     BOOLEAN DEFAULT FALSE,
      completed_by    TEXT,
      completed_at    TIMESTAMPTZ,
      notes           TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_dri_admission ON discharge_readiness_items(admission_id);

    CREATE TABLE IF NOT EXISTS discharge_overrides (
      id              BIGSERIAL PRIMARY KEY,
      organization_id BIGINT,
      admission_id    BIGINT NOT NULL,
      reason_code     TEXT,
      approver_id     TEXT,
      approver_role   TEXT,
      missing_items   JSONB DEFAULT '[]'::jsonb,
      override_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // ── Phase 2: Nursing ──────────────────────────────────────────────────────
  await q(`
    CREATE TABLE IF NOT EXISTS nursing_assessments (
      id              BIGSERIAL PRIMARY KEY,
      organization_id BIGINT,
      admission_id    BIGINT NOT NULL,
      patient_id      BIGINT,
      assessment_type TEXT NOT NULL DEFAULT 'admission',
      assessed_by     TEXT,
      fall_risk       TEXT,
      pressure_sore_risk TEXT,
      infection_risk  TEXT,
      pain_score      SMALLINT,
      mobility_status TEXT,
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
    CREATE INDEX IF NOT EXISTS idx_nursing_assessment_admission ON nursing_assessments(admission_id, assessed_at DESC);

    CREATE TABLE IF NOT EXISTS nursing_tasks (
      id              BIGSERIAL PRIMARY KEY,
      organization_id BIGINT,
      admission_id    BIGINT NOT NULL,
      patient_id      BIGINT,
      ward_id         BIGINT,
      task_type       TEXT NOT NULL,
      title           TEXT NOT NULL,
      description     TEXT,
      priority        TEXT DEFAULT 'routine',
      due_at          TIMESTAMPTZ,
      assigned_to     TEXT,
      status          TEXT DEFAULT 'pending',
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

  // ── Phase 2: OT safety overrides ─────────────────────────────────────────
  await q(`
    CREATE TABLE IF NOT EXISTS ot_safety_overrides (
      id                BIGSERIAL PRIMARY KEY,
      organization_id   BIGINT,
      ot_booking_id     BIGINT NOT NULL,
      override_type     TEXT,
      blocked_transition TEXT,
      missing_items     JSONB DEFAULT '[]'::jsonb,
      reason_code       TEXT,
      approver_id       TEXT,
      approver_role     TEXT,
      override_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // ── Phase 2: eMAR blocked attempts ────────────────────────────────────────
  await q(`
    CREATE TABLE IF NOT EXISTS emar_blocked_attempts (
      id              BIGSERIAL PRIMARY KEY,
      organization_id BIGINT,
      order_id        BIGINT,
      admission_id    BIGINT,
      patient_id      BIGINT,
      attempted_by    TEXT,
      blocked_reasons JSONB DEFAULT '[]'::jsonb,
      attempted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_emar_blocked_order ON emar_blocked_attempts(order_id);
  `);

  // ── Phase 3: Anesthesia ───────────────────────────────────────────────────
  await q(`
    CREATE TABLE IF NOT EXISTS anesthesia_assessments (
      id                    BIGSERIAL PRIMARY KEY,
      organization_id       BIGINT,
      ot_booking_id         BIGINT,
      admission_id          BIGINT NOT NULL,
      patient_id            BIGINT,
      anesthetist_id        TEXT,
      assessment_date       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      asa_class             SMALLINT,
      airway_class          SMALLINT,
      airway_notes          TEXT,
      aspiration_risk       BOOLEAN DEFAULT FALSE,
      npo_status            TEXT,
      npo_confirmed_at      TIMESTAMPTZ,
      current_medications   JSONB DEFAULT '[]'::jsonb,
      allergies_confirmed   BOOLEAN DEFAULT FALSE,
      pre_op_labs_reviewed  BOOLEAN DEFAULT FALSE,
      cardiac_risk          TEXT,
      pulmonary_risk        TEXT,
      anesthesia_plan       TEXT,
      consent_obtained      BOOLEAN DEFAULT FALSE,
      consent_notes         TEXT,
      pre_med_given         BOOLEAN DEFAULT FALSE,
      pre_med_details       TEXT,
      clearance_status      TEXT DEFAULT 'pending',
      clearance_notes       TEXT,
      assessment_data       JSONB DEFAULT '{}'::jsonb,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_anesthesia_assessment_admission ON anesthesia_assessments(admission_id);
    CREATE INDEX IF NOT EXISTS idx_anesthesia_assessment_booking   ON anesthesia_assessments(ot_booking_id);

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
      airway_device         TEXT,
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
      fluids_given          JSONB DEFAULT '[]'::jsonb,
      drugs_given           JSONB DEFAULT '[]'::jsonb,
      regional_details      TEXT,
      intraop_events        TEXT,
      reversal_given        BOOLEAN DEFAULT FALSE,
      reversal_agent        TEXT,
      extubation_status     TEXT,
      pacu_destination      TEXT,
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
    CREATE INDEX IF NOT EXISTS idx_anesthesia_record_booking ON anesthesia_records(ot_booking_id);
  `);

  // ── Phase 3: OT consumables ───────────────────────────────────────────────
  await q(`
    CREATE TABLE IF NOT EXISTS procedure_consumables (
      id              BIGSERIAL PRIMARY KEY,
      organization_id BIGINT,
      ot_booking_id   BIGINT NOT NULL,
      admission_id    BIGINT,
      scanned_by      TEXT,
      item_code       TEXT,
      item_name       TEXT NOT NULL,
      category        TEXT,
      quantity        NUMERIC(10,3) NOT NULL DEFAULT 1,
      unit            TEXT DEFAULT 'piece',
      unit_cost       NUMERIC(12,2),
      lot_number      TEXT,
      expiry_date     DATE,
      is_billable     BOOLEAN DEFAULT TRUE,
      notes           TEXT,
      scanned_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_consumables_booking ON procedure_consumables(ot_booking_id);

    CREATE TABLE IF NOT EXISTS implant_records (
      id              BIGSERIAL PRIMARY KEY,
      organization_id BIGINT,
      ot_booking_id   BIGINT NOT NULL,
      admission_id    BIGINT,
      patient_id      BIGINT,
      recorded_by     TEXT,
      implant_name    TEXT NOT NULL,
      manufacturer    TEXT,
      model_number    TEXT,
      serial_number   TEXT,
      lot_number      TEXT,
      size_details    TEXT,
      implant_date    DATE,
      body_location   TEXT,
      unit_cost       NUMERIC(12,2),
      is_billable     BOOLEAN DEFAULT TRUE,
      notes           TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_implants_booking ON implant_records(ot_booking_id);
    CREATE INDEX IF NOT EXISTS idx_implants_patient ON implant_records(patient_id);

    CREATE TABLE IF NOT EXISTS family_notifications (
      id              BIGSERIAL PRIMARY KEY,
      organization_id BIGINT,
      ot_booking_id   BIGINT NOT NULL,
      patient_id      BIGINT,
      notification_type TEXT NOT NULL,
      message         TEXT,
      sent_by         TEXT,
      channel         TEXT DEFAULT 'manual',
      sent_to         TEXT,
      sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_family_notif_booking ON family_notifications(ot_booking_id);
  `);

  // ── Phase 4: Billing estimates ────────────────────────────────────────────
  await q(`
    CREATE TABLE IF NOT EXISTS billing_estimates (
      id                  BIGSERIAL PRIMARY KEY,
      organization_id     BIGINT,
      admission_id        BIGINT,
      patient_id          BIGINT,
      estimate_type       TEXT DEFAULT 'pre_admission',
      procedure_name      TEXT,
      room_charges        NUMERIC(12,2) DEFAULT 0,
      ot_charges          NUMERIC(12,2) DEFAULT 0,
      anesthesia_charges  NUMERIC(12,2) DEFAULT 0,
      consumable_charges  NUMERIC(12,2) DEFAULT 0,
      implant_charges     NUMERIC(12,2) DEFAULT 0,
      pharmacy_charges    NUMERIC(12,2) DEFAULT 0,
      lab_charges         NUMERIC(12,2) DEFAULT 0,
      imaging_charges     NUMERIC(12,2) DEFAULT 0,
      professional_fees   NUMERIC(12,2) DEFAULT 0,
      misc_charges        NUMERIC(12,2) DEFAULT 0,
      discount_amount     NUMERIC(12,2) DEFAULT 0,
      tax_amount          NUMERIC(12,2) DEFAULT 0,
      total_estimate      NUMERIC(12,2) DEFAULT 0,
      currency            TEXT DEFAULT 'INR',
      insurance_covered   NUMERIC(12,2) DEFAULT 0,
      patient_liability   NUMERIC(12,2) DEFAULT 0,
      notes               TEXT,
      prepared_by         TEXT,
      valid_until         DATE,
      status              TEXT DEFAULT 'draft',
      estimate_data       JSONB DEFAULT '{}'::jsonb,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_billing_estimate_admission ON billing_estimates(admission_id);

    CREATE TABLE IF NOT EXISTS non_payable_items (
      id                BIGSERIAL PRIMARY KEY,
      organization_id   BIGINT,
      admission_id      BIGINT NOT NULL,
      item_category     TEXT,
      item_description  TEXT NOT NULL,
      amount            NUMERIC(12,2) NOT NULL,
      reason_code       TEXT,
      approved_by       TEXT,
      notes             TEXT,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_non_payable_admission ON non_payable_items(admission_id);
  `);

  // ── Phase 4: Corporate HMIS ───────────────────────────────────────────────
  await q(`
    CREATE TABLE IF NOT EXISTS corporate_referrals (
      id                  BIGSERIAL PRIMARY KEY,
      organization_id     BIGINT,
      patient_id          BIGINT NOT NULL,
      admission_id        BIGINT,
      corporate_name      TEXT NOT NULL,
      tpa_name            TEXT,
      policy_number       TEXT,
      employee_id         TEXT,
      referral_code       TEXT,
      pre_auth_number     TEXT,
      pre_auth_amount     NUMERIC(12,2),
      pre_auth_date       DATE,
      approved_procedures TEXT,
      referral_status     TEXT DEFAULT 'pending',
      denial_reason       TEXT,
      contacted_by        TEXT,
      contacted_at        TIMESTAMPTZ,
      notes               TEXT,
      referral_data       JSONB DEFAULT '{}'::jsonb,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_corp_referral_patient    ON corporate_referrals(patient_id);
    CREATE INDEX IF NOT EXISTS idx_corp_referral_admission  ON corporate_referrals(admission_id);

    CREATE TABLE IF NOT EXISTS corporate_eligibility_checks (
      id                BIGSERIAL PRIMARY KEY,
      organization_id   BIGINT,
      patient_id        BIGINT NOT NULL,
      referral_id       BIGINT,
      corporate_name    TEXT,
      policy_number     TEXT,
      employee_id       TEXT,
      check_status      TEXT NOT NULL,
      benefit_limit     NUMERIC(12,2),
      used_amount       NUMERIC(12,2),
      balance_amount    NUMERIC(12,2),
      deductible        NUMERIC(12,2),
      copay_percent     NUMERIC(5,2),
      exclusions        TEXT,
      checked_by        TEXT,
      response_data     JSONB DEFAULT '{}'::jsonb,
      checked_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_eligibility_patient ON corporate_eligibility_checks(patient_id);

    CREATE TABLE IF NOT EXISTS fitness_certificates (
      id                BIGSERIAL PRIMARY KEY,
      organization_id   BIGINT,
      patient_id        BIGINT NOT NULL,
      admission_id      BIGINT,
      certificate_type  TEXT DEFAULT 'fitness',
      issued_by         TEXT NOT NULL,
      doctor_reg_no     TEXT,
      patient_name      TEXT,
      employee_id       TEXT,
      employer_name     TEXT,
      job_description   TEXT,
      examination_date  DATE NOT NULL DEFAULT CURRENT_DATE,
      fitness_status    TEXT NOT NULL,
      restrictions      TEXT,
      valid_from        DATE,
      valid_until       DATE,
      remarks           TEXT,
      certificate_data  JSONB DEFAULT '{}'::jsonb,
      signed_at         TIMESTAMPTZ,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_fitness_cert_patient ON fitness_certificates(patient_id);

    CREATE TABLE IF NOT EXISTS return_to_work_clearances (
      id                BIGSERIAL PRIMARY KEY,
      organization_id   BIGINT,
      patient_id        BIGINT NOT NULL,
      admission_id      BIGINT,
      fitness_cert_id   BIGINT,
      issued_by         TEXT NOT NULL,
      employer_name     TEXT,
      return_date       DATE NOT NULL,
      full_duty         BOOLEAN DEFAULT TRUE,
      restricted_duty   TEXT,
      follow_up_date    DATE,
      clearance_notes   TEXT,
      signed_at         TIMESTAMPTZ,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_rtw_patient ON return_to_work_clearances(patient_id);
  `);

  // ── Phase 5: Discharge packets ────────────────────────────────────────────
  await q(`
    CREATE TABLE IF NOT EXISTS discharge_packets (
      id                  BIGSERIAL PRIMARY KEY,
      organization_id     BIGINT,
      admission_id        BIGINT NOT NULL,
      patient_id          BIGINT,
      draft_content       TEXT,
      final_content       TEXT,
      diagnosis_summary   TEXT,
      procedure_summary   TEXT,
      medication_summary  TEXT,
      follow_up_summary   TEXT,
      diet_instructions   TEXT,
      activity_notes      TEXT,
      emergency_contacts  TEXT,
      ai_generated        BOOLEAN DEFAULT FALSE,
      ai_model            TEXT,
      signed_by           TEXT,
      signed_at           TIMESTAMPTZ,
      status              TEXT DEFAULT 'draft',
      sent_at             TIMESTAMPTZ,
      delivery_channel    TEXT,
      delivery_address    TEXT,
      delivery_receipt    JSONB DEFAULT '{}'::jsonb,
      packet_data         JSONB DEFAULT '{}'::jsonb,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_discharge_packet_admission ON discharge_packets(admission_id);
  `);

  // ── Phase 5: Follow-up & Recovery ────────────────────────────────────────
  await q(`
    CREATE TABLE IF NOT EXISTS follow_up_plans (
      id                BIGSERIAL PRIMARY KEY,
      organization_id   BIGINT,
      patient_id        BIGINT NOT NULL,
      admission_id      BIGINT,
      scheduled_by      TEXT,
      follow_up_date    DATE NOT NULL,
      follow_up_time    TIME,
      department        TEXT,
      doctor_id         TEXT,
      visit_type        TEXT DEFAULT 'outpatient',
      reason            TEXT,
      instructions      TEXT,
      reminder_sent     BOOLEAN DEFAULT FALSE,
      status            TEXT DEFAULT 'scheduled',
      appointment_id    BIGINT,
      notes             TEXT,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_followup_patient ON follow_up_plans(patient_id);
    CREATE INDEX IF NOT EXISTS idx_followup_date    ON follow_up_plans(follow_up_date, status);

    CREATE TABLE IF NOT EXISTS recovery_checkins (
      id                BIGSERIAL PRIMARY KEY,
      organization_id   BIGINT,
      patient_id        BIGINT NOT NULL,
      admission_id      BIGINT,
      follow_up_plan_id BIGINT,
      checkin_method    TEXT DEFAULT 'app',
      pain_score        SMALLINT,
      wound_status      TEXT,
      fever             BOOLEAN,
      bleeding          BOOLEAN,
      mobility          TEXT,
      medication_adherence BOOLEAN,
      symptoms          JSONB DEFAULT '[]'::jsonb,
      notes             TEXT,
      flagged_for_review BOOLEAN DEFAULT FALSE,
      reviewed_by       TEXT,
      reviewed_at       TIMESTAMPTZ,
      checkin_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_recovery_patient ON recovery_checkins(patient_id);
    CREATE INDEX IF NOT EXISTS idx_recovery_flagged ON recovery_checkins(flagged_for_review, checkin_at);

    CREATE TABLE IF NOT EXISTS remote_monitoring_alerts (
      id                BIGSERIAL PRIMARY KEY,
      organization_id   BIGINT,
      patient_id        BIGINT NOT NULL,
      admission_id      BIGINT,
      checkin_id        BIGINT,
      alert_type        TEXT NOT NULL,
      severity          TEXT DEFAULT 'medium',
      title             TEXT NOT NULL,
      description       TEXT,
      triggered_by      TEXT DEFAULT 'system',
      acknowledged      BOOLEAN DEFAULT FALSE,
      acknowledged_by   TEXT,
      acknowledged_at   TIMESTAMPTZ,
      resolved          BOOLEAN DEFAULT FALSE,
      resolved_at       TIMESTAMPTZ,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_rma_patient    ON remote_monitoring_alerts(patient_id);
    CREATE INDEX IF NOT EXISTS idx_rma_unresolved ON remote_monitoring_alerts(resolved, severity, created_at DESC);

    CREATE TABLE IF NOT EXISTS patient_feedback (
      id                BIGSERIAL PRIMARY KEY,
      organization_id   BIGINT,
      patient_id        BIGINT NOT NULL,
      admission_id      BIGINT,
      overall_rating    SMALLINT,
      doctor_rating     SMALLINT,
      nursing_rating    SMALLINT,
      cleanliness_rating SMALLINT,
      food_rating       SMALLINT,
      recommend_score   SMALLINT,
      positive_feedback TEXT,
      improvement_areas TEXT,
      follow_up_care_rating SMALLINT,
      feedback_channel  TEXT DEFAULT 'app',
      submitted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_feedback_patient ON patient_feedback(patient_id);

    CREATE TABLE IF NOT EXISTS outcome_records (
      id                BIGSERIAL PRIMARY KEY,
      organization_id   BIGINT,
      patient_id        BIGINT NOT NULL,
      admission_id      BIGINT,
      recorded_by       TEXT,
      outcome_date      DATE NOT NULL DEFAULT CURRENT_DATE,
      primary_outcome   TEXT NOT NULL,
      readmission       BOOLEAN DEFAULT FALSE,
      readmission_date  DATE,
      readmission_reason TEXT,
      complication_flag  BOOLEAN DEFAULT FALSE,
      complications      TEXT,
      wound_healing     TEXT,
      functional_status TEXT,
      proms_score       NUMERIC(5,2),
      proms_tool        TEXT,
      outcome_notes     TEXT,
      outcome_data      JSONB DEFAULT '{}'::jsonb,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_outcomes_patient ON outcome_records(patient_id);
    CREATE INDEX IF NOT EXISTS idx_outcomes_org     ON outcome_records(organization_id, outcome_date);
  `);

  // ── ICU ───────────────────────────────────────────────────────────────────
  await q(`
    CREATE TABLE IF NOT EXISTS icu_admissions (
      id                    BIGSERIAL PRIMARY KEY,
      organization_id       BIGINT,
      admission_id          BIGINT NOT NULL,
      patient_id            BIGINT NOT NULL,
      icu_unit              TEXT,
      bed_number            TEXT,
      admitted_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      discharged_at         TIMESTAMPTZ,
      discharge_destination TEXT,
      admitting_reason      TEXT,
      admitting_doctor_id   TEXT,
      status                TEXT DEFAULT 'active',
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_icu_active_admission ON icu_admissions(admission_id) WHERE status = 'active';
    CREATE INDEX IF NOT EXISTS idx_icu_unit ON icu_admissions(organization_id, icu_unit, status);

    CREATE TABLE IF NOT EXISTS icu_ventilator_charts (
      id                  BIGSERIAL PRIMARY KEY,
      organization_id     BIGINT,
      icu_admission_id    BIGINT NOT NULL,
      patient_id          BIGINT,
      charted_by          TEXT,
      mode                TEXT,
      fio2_percent        SMALLINT,
      peep_cmh2o          NUMERIC(5,1),
      tidal_volume_ml     SMALLINT,
      rate_bpm            SMALLINT,
      pip_cmh2o           NUMERIC(5,1),
      plateau_cmh2o       NUMERIC(5,1),
      compliance_ml_cmh2o NUMERIC(6,2),
      spo2_percent        SMALLINT,
      etco2_mmhg          SMALLINT,
      pip_alarm_high      NUMERIC(5,1),
      peep_alarm_low      NUMERIC(5,1),
      notes               TEXT,
      charted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_vent_icu_adm ON icu_ventilator_charts(icu_admission_id, charted_at DESC);

    CREATE TABLE IF NOT EXISTS icu_drip_records (
      id                BIGSERIAL PRIMARY KEY,
      organization_id   BIGINT,
      icu_admission_id  BIGINT NOT NULL,
      patient_id        BIGINT,
      recorded_by       TEXT,
      drug_name         TEXT NOT NULL,
      concentration     TEXT,
      rate_ml_hr        NUMERIC(8,2),
      dose_unit         TEXT,
      dose_value        NUMERIC(10,3),
      action            TEXT DEFAULT 'running',
      stopped_reason    TEXT,
      recorded_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_drip_icu_adm ON icu_drip_records(icu_admission_id, recorded_at DESC);

    CREATE TABLE IF NOT EXISTS icu_daily_goals (
      id                BIGSERIAL PRIMARY KEY,
      organization_id   BIGINT,
      icu_admission_id  BIGINT NOT NULL,
      patient_id        BIGINT,
      goal_date         DATE NOT NULL DEFAULT CURRENT_DATE,
      shift             TEXT DEFAULT 'day',
      set_by            TEXT,
      goals             JSONB DEFAULT '[]'::jsonb,
      sedation_target   TEXT,
      pain_target       TEXT,
      glucose_target    TEXT,
      fluid_balance_ml  INTEGER,
      ventilator_wean   BOOLEAN DEFAULT FALSE,
      mobility_goal     TEXT,
      notes             TEXT,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_goals_icu_adm ON icu_daily_goals(icu_admission_id, goal_date DESC);

    CREATE TABLE IF NOT EXISTS icu_severity_scores (
      id                BIGSERIAL PRIMARY KEY,
      organization_id   BIGINT,
      icu_admission_id  BIGINT NOT NULL,
      patient_id        BIGINT,
      scored_by         TEXT,
      score_type        TEXT NOT NULL,
      total_score       NUMERIC(6,2),
      components        JSONB DEFAULT '{}'::jsonb,
      interpretation    TEXT,
      mortality_risk    NUMERIC(5,2),
      scored_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_scores_icu_adm ON icu_severity_scores(icu_admission_id, scored_at DESC);

    CREATE TABLE IF NOT EXISTS icu_events (
      id                BIGSERIAL PRIMARY KEY,
      organization_id   BIGINT,
      icu_admission_id  BIGINT NOT NULL,
      patient_id        BIGINT,
      event_type        TEXT NOT NULL,
      severity          TEXT DEFAULT 'moderate',
      description       TEXT NOT NULL,
      action_taken      TEXT,
      reported_by       TEXT,
      event_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_events_icu_adm ON icu_events(icu_admission_id, event_at DESC);
  `);

  // ── B7: Consent enforcement log ───────────────────────────────────────────
  await q(`
    CREATE TABLE IF NOT EXISTS consent_enforcement_log (
      id              BIGSERIAL PRIMARY KEY,
      organization_id BIGINT,
      patient_id      BIGINT NOT NULL,
      action          TEXT NOT NULL,
      consent_type    TEXT NOT NULL,
      consent_id      BIGINT,
      status          TEXT NOT NULL,
      override_by     TEXT,
      override_role   TEXT,
      override_reason TEXT,
      context         JSONB DEFAULT '{}'::jsonb,
      checked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_consent_enf_patient ON consent_enforcement_log(patient_id, checked_at DESC);
  `);
}

export async function down(queryInterface) {
  const drop = (tbl) => queryInterface.sequelize.query(`DROP TABLE IF EXISTS ${tbl} CASCADE`);
  const tables = [
    'consent_enforcement_log',
    'icu_events', 'icu_severity_scores', 'icu_daily_goals', 'icu_drip_records', 'icu_ventilator_charts', 'icu_admissions',
    'outcome_records', 'patient_feedback', 'remote_monitoring_alerts', 'recovery_checkins', 'follow_up_plans',
    'discharge_packets',
    'return_to_work_clearances', 'fitness_certificates', 'corporate_eligibility_checks', 'corporate_referrals',
    'non_payable_items', 'billing_estimates',
    'family_notifications', 'implant_records', 'procedure_consumables',
    'anesthesia_records', 'anesthesia_assessments',
    'emar_blocked_attempts', 'ot_safety_overrides',
    'nursing_tasks', 'nursing_assessments',
    'discharge_overrides', 'discharge_readiness_items',
    'bed_reservations', 'patient_navigation_events'
  ];
  for (const t of tables) await drop(t);
}
