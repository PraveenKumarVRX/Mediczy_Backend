import pool from '../db/pgPool.js';

/** Migration-owned HRMS schema. HR requests only check readiness; they never run DDL. */
export async function up() {
  await pool.query(`    CREATE TABLE IF NOT EXISTS hr_locations (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      location_type TEXT NOT NULL DEFAULT 'branch',
      address TEXT,
      city TEXT,
      state TEXT,
      phone TEXT,
      email TEXT,
      hr_manager_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'active',
      metadata JSONB DEFAULT '{}'::jsonb,
      created_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (tenant_id, code)
    );

    CREATE TABLE IF NOT EXISTS hr_biometric_devices (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      device_uid TEXT NOT NULL,
      name TEXT NOT NULL,
      location TEXT,
      vendor TEXT,
      connection_type TEXT DEFAULT 'api',
      status TEXT NOT NULL DEFAULT 'online',
      last_sync_at TIMESTAMPTZ,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (tenant_id, device_uid)
    );

    CREATE TABLE IF NOT EXISTS hr_biometric_events (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      device_id BIGINT REFERENCES hr_biometric_devices(id) ON DELETE SET NULL,
      staff_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      employee_code TEXT,
      biometric_user_id TEXT,
      event_type TEXT NOT NULL DEFAULT 'check_in',
      event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      source TEXT NOT NULL DEFAULT 'manual',
      confidence NUMERIC(5,2),
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );


    CREATE TABLE IF NOT EXISTS hr_recruitment_requisitions (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      requisition_code TEXT NOT NULL,
      title TEXT NOT NULL,
      department TEXT NOT NULL,
      role TEXT DEFAULT 'staff',
      openings INTEGER NOT NULL DEFAULT 1,
      priority TEXT NOT NULL DEFAULT 'normal',
      status TEXT NOT NULL DEFAULT 'open',
      location TEXT,
      employment_type TEXT DEFAULT 'Full-time',
      experience_min INTEGER DEFAULT 0,
      experience_max INTEGER DEFAULT 20,
      skills TEXT[] DEFAULT ARRAY[]::TEXT[],
      description TEXT,
      ai_job_brief JSONB DEFAULT '{}'::jsonb,
      created_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (tenant_id, requisition_code)
    );

    CREATE TABLE IF NOT EXISTS hr_recruitment_candidates (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      requisition_id BIGINT REFERENCES hr_recruitment_requisitions(id) ON DELETE SET NULL,
      candidate_code TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      current_position TEXT,
      experience_years NUMERIC(4,1) DEFAULT 0,
      source TEXT DEFAULT 'direct',
      stage TEXT NOT NULL DEFAULT 'sourced',
      resume_text TEXT,
      skills TEXT[] DEFAULT ARRAY[]::TEXT[],
      ai_score NUMERIC(5,2),
      ai_summary TEXT,
      ai_recommendation TEXT,
      ai_risks TEXT[] DEFAULT ARRAY[]::TEXT[],
      expected_ctc NUMERIC(12,2),
      notice_period_days INTEGER,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (tenant_id, candidate_code)
    );

    CREATE TABLE IF NOT EXISTS hr_recruitment_interviews (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      candidate_id BIGINT REFERENCES hr_recruitment_candidates(id) ON DELETE CASCADE,
      round_name TEXT NOT NULL DEFAULT 'HR Screen',
      interviewer TEXT,
      scheduled_at TIMESTAMPTZ,
      mode TEXT DEFAULT 'video',
      status TEXT NOT NULL DEFAULT 'scheduled',
      score NUMERIC(5,2),
      feedback TEXT,
      ai_questions TEXT[] DEFAULT ARRAY[]::TEXT[],
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS hr_benefit_programs (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'Internal',
      benefit_type TEXT NOT NULL DEFAULT 'wellness',
      coverage TEXT,
      enrolled_count INTEGER NOT NULL DEFAULT 0,
      annual_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
      renewal_date DATE,
      status TEXT NOT NULL DEFAULT 'active',
      compliance_notes TEXT,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS hr_performance_reviews (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      staff_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      cycle TEXT NOT NULL DEFAULT 'current',
      review_period_start DATE,
      review_period_end DATE,
      manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      kra_score NUMERIC(5,2) DEFAULT 0,
      attendance_score NUMERIC(5,2) DEFAULT 0,
      patient_score NUMERIC(5,2) DEFAULT 0,
      quality_score NUMERIC(5,2) DEFAULT 0,
      teamwork_score NUMERIC(5,2) DEFAULT 0,
      overall_score NUMERIC(5,2) DEFAULT 0,
      rating NUMERIC(3,1) DEFAULT 0,
      overall_label TEXT DEFAULT 'Pending',
      status TEXT NOT NULL DEFAULT 'draft',
      manager_notes TEXT,
      ai_summary TEXT,
      ai_risks TEXT[] DEFAULT ARRAY[]::TEXT[],
      metadata JSONB DEFAULT '{}'::jsonb,
      created_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (tenant_id, staff_user_id, cycle)
    );

    CREATE TABLE IF NOT EXISTS hr_leave_requests (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      staff_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      leave_type TEXT NOT NULL DEFAULT 'Casual',
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      days NUMERIC(5,1) NOT NULL DEFAULT 1,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      approver_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS hr_shift_rosters (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      staff_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      location_id BIGINT REFERENCES hr_locations(id) ON DELETE SET NULL,
      shift_name TEXT NOT NULL,
      shift_start TIME,
      shift_end TIME,
      roster_date DATE NOT NULL,
      week_day TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      notes TEXT,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS hr_onboarding_tasks (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      staff_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      task_key TEXT NOT NULL,
      task_label TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      due_date DATE,
      completed_at TIMESTAMPTZ,
      owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (tenant_id, staff_user_id, task_key)
    );

    CREATE TABLE IF NOT EXISTS hr_employee_documents (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      staff_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      document_type TEXT NOT NULL DEFAULT 'general',
      original_name TEXT NOT NULL,
      mime_type TEXT,
      file_size BIGINT DEFAULT 0,
      storage_provider TEXT NOT NULL DEFAULT 'local',
      storage_key TEXT NOT NULL,
      public_url TEXT,
      verification_status TEXT NOT NULL DEFAULT 'pending',
      metadata JSONB DEFAULT '{}'::jsonb,
      uploaded_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS hr_timesheets (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      staff_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      work_date DATE NOT NULL,
      task TEXT NOT NULL DEFAULT 'General duty',
      hours NUMERIC(5,2) NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'submitted',
      notes TEXT,
      approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS hr_lms_programs (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      program_code TEXT NOT NULL,
      title TEXT NOT NULL,
      department TEXT DEFAULT 'All',
      trainer TEXT,
      scheduled_at TIMESTAMPTZ,
      duration_hours NUMERIC(5,2) DEFAULT 1,
      capacity INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'scheduled',
      metadata JSONB DEFAULT '{}'::jsonb,
      created_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (tenant_id, program_code)
    );

    CREATE TABLE IF NOT EXISTS hr_lms_enrollments (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      program_id BIGINT REFERENCES hr_lms_programs(id) ON DELETE CASCADE,
      staff_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'enrolled',
      completed_at TIMESTAMPTZ,
      score NUMERIC(5,2),
      certification_expires_at DATE,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (tenant_id, program_id, staff_user_id)
    );

    CREATE TABLE IF NOT EXISTS hr_goals (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      staff_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      metric TEXT DEFAULT 'Completion',
      target_value NUMERIC(12,2) DEFAULT 100,
      current_value NUMERIC(12,2) DEFAULT 0,
      due_date DATE,
      status TEXT NOT NULL DEFAULT 'active',
      owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS hr_engagement_surveys (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      audience TEXT DEFAULT 'All staff',
      status TEXT NOT NULL DEFAULT 'draft',
      starts_at TIMESTAMPTZ,
      ends_at TIMESTAMPTZ,
      questions JSONB DEFAULT '[]'::jsonb,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS hr_engagement_survey_responses (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      survey_id BIGINT REFERENCES hr_engagement_surveys(id) ON DELETE CASCADE,
      staff_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      score NUMERIC(5,2),
      sentiment TEXT DEFAULT 'neutral',
      answers JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS hr_helpdesk_tickets (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      ticket_code TEXT NOT NULL,
      staff_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      category TEXT DEFAULT 'general',
      subject TEXT NOT NULL,
      description TEXT,
      priority TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'open',
      assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
      resolved_at TIMESTAMPTZ,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (tenant_id, ticket_code)
    );

    CREATE TABLE IF NOT EXISTS hr_cv_documents (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      candidate_id BIGINT REFERENCES hr_recruitment_candidates(id) ON DELETE SET NULL,
      source_email_id BIGINT,
      original_name TEXT NOT NULL,
      mime_type TEXT,
      file_size BIGINT DEFAULT 0,
      storage_provider TEXT NOT NULL DEFAULT 'local',
      storage_key TEXT NOT NULL,
      public_url TEXT,
      ai_summary TEXT,
      ai_skills TEXT[] DEFAULT ARRAY[]::TEXT[],
      ai_score NUMERIC(5,2),
      metadata JSONB DEFAULT '{}'::jsonb,
      uploaded_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS hr_email_settings (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      display_name TEXT,
      email TEXT NOT NULL,
      provider TEXT DEFAULT 'custom',
      smtp_host TEXT,
      smtp_port INTEGER DEFAULT 587,
      smtp_secure BOOLEAN DEFAULT false,
      smtp_username TEXT,
      smtp_password TEXT,
      imap_host TEXT,
      imap_port INTEGER DEFAULT 993,
      imap_secure BOOLEAN DEFAULT true,
      imap_username TEXT,
      imap_password TEXT,
      is_default BOOLEAN DEFAULT false,
      is_active BOOLEAN DEFAULT true,
      last_synced_at TIMESTAMPTZ,
      created_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS hr_email_inbox (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL,
      settings_id BIGINT REFERENCES hr_email_settings(id) ON DELETE SET NULL,
      message_id TEXT,
      folder TEXT DEFAULT 'inbox',
      from_addr TEXT DEFAULT '',
      from_name TEXT DEFAULT '',
      to_addrs TEXT[] DEFAULT ARRAY[]::TEXT[],
      cc_addrs TEXT[] DEFAULT ARRAY[]::TEXT[],
      subject TEXT DEFAULT '',
      body_text TEXT,
      body_html TEXT,
      attachments JSONB DEFAULT '[]'::jsonb,
      ai_intent TEXT DEFAULT 'general',
      ai_status TEXT DEFAULT 'new',
      linked_candidate_id BIGINT REFERENCES hr_recruitment_candidates(id) ON DELETE SET NULL,
      linked_benefit_id BIGINT REFERENCES hr_benefit_programs(id) ON DELETE SET NULL,
      is_read BOOLEAN DEFAULT false,
      received_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (tenant_id, message_id)
    );

    ALTER TABLE hr_biometric_devices ADD COLUMN IF NOT EXISTS location_id BIGINT REFERENCES hr_locations(id) ON DELETE SET NULL;
    ALTER TABLE hr_recruitment_requisitions ADD COLUMN IF NOT EXISTS location_id BIGINT REFERENCES hr_locations(id) ON DELETE SET NULL;

    CREATE INDEX IF NOT EXISTS idx_hr_locations_tenant ON hr_locations(tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_hr_locations_code ON hr_locations(tenant_id, code);
    CREATE INDEX IF NOT EXISTS idx_hr_bio_devices_tenant ON hr_biometric_devices(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_hr_bio_devices_location ON hr_biometric_devices(tenant_id, location_id);
    CREATE INDEX IF NOT EXISTS idx_hr_bio_events_tenant_day ON hr_biometric_events(tenant_id, event_at);
    CREATE INDEX IF NOT EXISTS idx_hr_bio_events_staff ON hr_biometric_events(staff_user_id, event_at);

    CREATE INDEX IF NOT EXISTS idx_hr_recruitment_req_tenant ON hr_recruitment_requisitions(tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_hr_recruitment_candidates_tenant ON hr_recruitment_candidates(tenant_id, stage);
    CREATE INDEX IF NOT EXISTS idx_hr_recruitment_candidates_req ON hr_recruitment_candidates(requisition_id, stage);
    CREATE INDEX IF NOT EXISTS idx_hr_recruitment_interviews_candidate ON hr_recruitment_interviews(candidate_id, scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_hr_benefit_programs_tenant ON hr_benefit_programs(tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_hr_performance_reviews_tenant ON hr_performance_reviews(tenant_id, cycle, status);
    CREATE INDEX IF NOT EXISTS idx_hr_performance_reviews_staff ON hr_performance_reviews(staff_user_id, cycle);
    CREATE INDEX IF NOT EXISTS idx_hr_leave_requests_tenant ON hr_leave_requests(tenant_id, status, start_date);
    CREATE INDEX IF NOT EXISTS idx_hr_shift_rosters_tenant ON hr_shift_rosters(tenant_id, roster_date, staff_user_id);
    CREATE INDEX IF NOT EXISTS idx_hr_onboarding_tasks_staff ON hr_onboarding_tasks(tenant_id, staff_user_id, status);
    CREATE INDEX IF NOT EXISTS idx_hr_employee_documents_staff ON hr_employee_documents(tenant_id, staff_user_id, document_type);
    CREATE INDEX IF NOT EXISTS idx_hr_timesheets_tenant ON hr_timesheets(tenant_id, work_date, status);
    CREATE INDEX IF NOT EXISTS idx_hr_lms_programs_tenant ON hr_lms_programs(tenant_id, status, scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_hr_lms_enrollments_program ON hr_lms_enrollments(program_id, status);
    CREATE INDEX IF NOT EXISTS idx_hr_goals_tenant ON hr_goals(tenant_id, status, due_date);
    CREATE INDEX IF NOT EXISTS idx_hr_surveys_tenant ON hr_engagement_surveys(tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_hr_helpdesk_tenant ON hr_helpdesk_tickets(tenant_id, status, priority);
    CREATE INDEX IF NOT EXISTS idx_hr_cv_documents_tenant ON hr_cv_documents(tenant_id, candidate_id);
    CREATE INDEX IF NOT EXISTS idx_hr_email_settings_tenant ON hr_email_settings(tenant_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_hr_email_inbox_tenant ON hr_email_inbox(tenant_id, received_at DESC);
    CREATE INDEX IF NOT EXISTS idx_hr_email_inbox_intent ON hr_email_inbox(tenant_id, ai_intent, ai_status);
  `);
  console.log('[migration] HRMS schema ready');
}

export async function down() {
  await pool.query(`DROP TABLE IF EXISTS hr_email_inbox CASCADE, hr_email_settings CASCADE, hr_cv_documents CASCADE, hr_helpdesk_tickets CASCADE, hr_engagement_survey_responses CASCADE, hr_engagement_surveys CASCADE, hr_goals CASCADE, hr_lms_enrollments CASCADE, hr_lms_programs CASCADE, hr_timesheets CASCADE, hr_employee_documents CASCADE, hr_onboarding_tasks CASCADE, hr_shift_rosters CASCADE, hr_leave_requests CASCADE, hr_performance_reviews CASCADE, hr_benefit_programs CASCADE, hr_recruitment_interviews CASCADE, hr_recruitment_candidates CASCADE, hr_recruitment_requisitions CASCADE, hr_biometric_events CASCADE, hr_biometric_devices CASCADE, hr_locations CASCADE;`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  up().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
}

export default { up, down };
