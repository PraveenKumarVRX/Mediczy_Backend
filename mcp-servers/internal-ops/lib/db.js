/**
 * Read-only DB diagnostics — reuses the real, already-configured connection
 * pool from server/db/pgPool.js rather than re-deriving DB credentials/env
 * fallbacks here (that file's env-var resolution is non-trivial; importing
 * it directly means this can never drift out of sync with what the app
 * itself actually connects to). Node resolves `pg` for that file from
 * server/node_modules regardless of which process imports it, so this
 * works without server/ being a dependency of this package.
 *
 * Every query here is read-only and aggregate/count-shaped — no
 * patient-identifiable rows are ever returned, on purpose (see README:
 * this server's tools are scoped to non-PHI operational visibility, not
 * clinical data access).
 */
import pool from '../../../server/db/pgPool.js';

export async function getDbConnectionStats() {
  const { rows } = await pool.query(`
    SELECT
      count(*) FILTER (WHERE state = 'active')                AS active,
      count(*) FILTER (WHERE state = 'idle')                  AS idle,
      count(*) FILTER (WHERE state = 'idle in transaction')   AS idle_in_transaction,
      count(*)                                                AS total,
      max(EXTRACT(EPOCH FROM (now() - query_start))) FILTER (WHERE state = 'active') AS longest_active_query_seconds
    FROM pg_stat_activity
    WHERE datname = current_database()
  `);
  return rows[0];
}

export async function getRisStudyStats() {
  const [byModality, byStatus, recent] = await Promise.all([
    pool.query(`SELECT modality, count(*) AS count FROM ris_studies GROUP BY modality ORDER BY count DESC LIMIT 20`),
    pool.query(`SELECT report_status, count(*) AS count FROM ris_studies GROUP BY report_status ORDER BY count DESC`),
    pool.query(`SELECT count(*) AS count FROM ris_studies WHERE created_at > now() - interval '24 hours'`),
  ]);
  return {
    by_modality: byModality.rows,
    by_report_status: byStatus.rows,
    ingested_last_24h: Number(recent.rows[0]?.count || 0),
  };
}

export async function getCorporateHealthReportStats() {
  const exists = await pool.query(`SELECT to_regclass('public.corporate_health_reports') AS t`);
  if (!exists.rows[0]?.t) {
    return { table_exists: false };
  }
  const { rows } = await pool.query(`
    SELECT
      count(*)                                        AS total,
      count(*) FILTER (WHERE notified_email)           AS emailed,
      count(*) FILTER (WHERE notified_whatsapp)        AS whatsapped,
      count(*) FILTER (WHERE notified_at IS NOT NULL)  AS notified_at_all,
      count(DISTINCT corporate_id)                     AS distinct_corporates,
      max(created_at)                                  AS most_recent_upload
    FROM corporate_health_reports
  `);
  return { table_exists: true, ...rows[0] };
}
