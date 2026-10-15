import pool from '../db/pgPool.js';

export const HRMS_REQUIRED_TABLES = [
  'hr_locations', 'hr_biometric_devices', 'hr_biometric_events', 'hr_recruitment_requisitions',
  'hr_recruitment_candidates', 'hr_recruitment_interviews', 'hr_benefit_programs', 'hr_performance_reviews',
  'hr_leave_requests', 'hr_shift_rosters', 'hr_onboarding_tasks', 'hr_employee_documents', 'hr_timesheets',
  'hr_lms_programs', 'hr_lms_enrollments', 'hr_goals', 'hr_engagement_surveys',
  'hr_engagement_survey_responses', 'hr_helpdesk_tickets', 'hr_cv_documents', 'hr_email_settings', 'hr_email_inbox',
];

export async function ensureHrmsSchemaReady() {
  const { rows } = await pool.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name = ANY($1::text[])
  `, [HRMS_REQUIRED_TABLES]);
  const present = new Set(rows.map((row) => row.table_name));
  const missing = HRMS_REQUIRED_TABLES.filter((name) => !present.has(name));
  if (missing.length) {
    const error = new Error(`HRMS schema is not migrated: ${missing.join(', ')}`);
    error.code = 'SCHEMA_NOT_MIGRATED';
    error.status = 503;
    throw error;
  }
}
