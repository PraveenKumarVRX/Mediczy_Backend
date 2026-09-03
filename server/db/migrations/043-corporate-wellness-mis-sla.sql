-- Corporate wellness operational layer:
-- - HR-facing weekly MIS reports
-- - 2-working-day health report SLA tracking
-- - employee-wise pre-employment and annual health check-up records

CREATE TABLE IF NOT EXISTS corporate_health_reports (
  id BIGSERIAL PRIMARY KEY,
  corporate_id BIGINT NOT NULL REFERENCES corporates(id) ON DELETE CASCADE,
  employee_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lab_order_id BIGINT,
  report_name VARCHAR(300) NOT NULL,
  report_type VARCHAR(80) NOT NULL DEFAULT 'annual_health_checkup',
  report_date DATE NOT NULL DEFAULT CURRENT_DATE,
  s3_key TEXT,
  report_url TEXT,
  file_size_bytes BIGINT,
  mime_type VARCHAR(160),
  notes TEXT,
  uploaded_by BIGINT,
  notified_email BOOLEAN NOT NULL DEFAULT FALSE,
  notified_whatsapp BOOLEAN NOT NULL DEFAULT FALSE,
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE corporate_health_reports
  ADD COLUMN IF NOT EXISTS checkup_type VARCHAR(80) NOT NULL DEFAULT 'annual_health_checkup',
  ADD COLUMN IF NOT EXISTS checkup_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS report_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS report_delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sla_status VARCHAR(40) NOT NULL DEFAULT 'pending_due',
  ADD COLUMN IF NOT EXISTS sla_notes TEXT;

UPDATE corporate_health_reports
   SET checkup_type = COALESCE(NULLIF(checkup_type, ''), report_type, 'annual_health_checkup'),
       checkup_completed_at = COALESCE(checkup_completed_at, report_date::timestamptz),
       report_delivered_at = COALESCE(report_delivered_at, created_at)
 WHERE checkup_completed_at IS NULL
    OR report_delivered_at IS NULL
    OR checkup_type IS NULL;

UPDATE corporate_health_reports
   SET report_due_at = (
         report_date
         + CASE EXTRACT(ISODOW FROM report_date)::int
             WHEN 1 THEN 2
             WHEN 2 THEN 2
             WHEN 3 THEN 2
             WHEN 4 THEN 4
             WHEN 5 THEN 4
             WHEN 6 THEN 3
             ELSE 2
           END
       )::timestamptz + TIME '23:59:59',
       sla_status = CASE
         WHEN COALESCE(report_delivered_at, created_at) <= (
           (
             report_date
             + CASE EXTRACT(ISODOW FROM report_date)::int
                 WHEN 1 THEN 2
                 WHEN 2 THEN 2
                 WHEN 3 THEN 2
                 WHEN 4 THEN 4
                 WHEN 5 THEN 4
                 WHEN 6 THEN 3
                 ELSE 2
               END
           )::timestamptz + TIME '23:59:59'
         ) THEN 'on_time'
         ELSE 'breached'
       END
 WHERE report_due_at IS NULL
    OR sla_status IN ('pending_due', 'pending_overdue');

CREATE INDEX IF NOT EXISTS idx_corp_health_reports_employee
  ON corporate_health_reports (corporate_id, employee_id, report_date DESC);

CREATE INDEX IF NOT EXISTS idx_corp_health_reports_type
  ON corporate_health_reports (corporate_id, checkup_type, report_date DESC);

CREATE INDEX IF NOT EXISTS idx_corp_health_reports_sla
  ON corporate_health_reports (corporate_id, sla_status, report_due_at);

ALTER TABLE corporate_generated_reports
  ADD COLUMN IF NOT EXISTS report_key VARCHAR(180),
  ADD COLUMN IF NOT EXISTS period_start DATE,
  ADD COLUMN IF NOT EXISTS period_end DATE,
  ADD COLUMN IF NOT EXISTS scheduled_frequency VARCHAR(40),
  ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(40) NOT NULL DEFAULT 'not_sent',
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS metrics JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS uq_corp_generated_reports_key
  ON corporate_generated_reports (corporate_id, report_key)
  WHERE report_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_corp_generated_reports_period
  ON corporate_generated_reports (corporate_id, scheduled_frequency, period_start DESC);
