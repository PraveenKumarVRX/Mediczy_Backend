-- Scheduler call log for services/ai-brain/gpu-scheduler.service.js.
-- Not an entity table (no unique_id / uid rule); append-only operational log.
CREATE TABLE IF NOT EXISTS ai_gpu_scheduler_log (
  id          BIGSERIAL PRIMARY KEY,
  gpu         VARCHAR(20) NOT NULL,
  priority    SMALLINT NOT NULL DEFAULT 2,
  wait_ms     INTEGER NOT NULL DEFAULT 0,
  exec_ms     INTEGER NOT NULL DEFAULT 0,
  success     BOOLEAN NOT NULL DEFAULT true,
  error_type  VARCHAR(60),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gpu_sched_log_gpu ON ai_gpu_scheduler_log (gpu, created_at DESC);
