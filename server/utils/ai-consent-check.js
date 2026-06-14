/**
 * Checks whether a patient has active AI analysis consent.
 * Call at the top of every AI cron patient loop.
 * Skipped patients are logged to ai_quality_gate_log with gate_type CONSENT_MISSING.
 */

export async function hasAiConsent(pool, patientId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM consent_records
     WHERE patient_id = $1
       AND purpose = 'ai_analysis'
       AND status = 'active'
       AND (expires_at IS NULL OR expires_at > NOW())
     LIMIT 1`,
    [patientId]
  );
  return rows.length > 0;
}

export async function logConsentMissing(pool, patientId, cronJob) {
  try {
    await pool.query(
      `INSERT INTO ai_quality_gate_log
         (patient_id, gate_type, passed, details, created_at)
       VALUES ($1, 'CONSENT_MISSING', false, $2, NOW())`,
      [patientId, JSON.stringify({ cronJob, reason: 'No active ai_analysis consent record' })]
    );
  } catch {
    // Non-fatal — don't let a logging failure block the cron
  }
}
