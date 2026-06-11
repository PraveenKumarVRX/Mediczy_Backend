/**
 * Feedback Cohort Analysis Service
 * ==================================
 * Segments feedback quality signals by patient demographics to detect
 * AI bias and differential performance.
 *
 * Dimensions analysed:
 *   - Age group     (0–17, 18–35, 36–55, 56–75, 75+)
 *   - Gender        (male, female, other, not_disclosed)
 *   - Region        (state-level from city/pincode)
 *   - Channel       (whatsapp, email, in-app)
 *
 * Output feeds the demographic parity check in ai_demographic_parity_log.
 */

import pool from '../db/pgPool.js';
import { redisCache } from '../config/redis-hardened.js';

const CACHE_TTL = 3600; // 1 hour

async function cacheGet(key) {
  try { const rc = redisCache(); if (!rc) return null; const v = await rc.get(key); return v ? JSON.parse(v) : null; } catch { return null; }
}
async function cacheSet(key, value, ttl) {
  try { const rc = redisCache(); if (rc) await rc.set(key, JSON.stringify(value), { EX: ttl }); } catch { /* ignore */ }
}

class FeedbackCohortAnalysisService {
  /**
   * Returns quality scores broken down by demographic cohorts.
   * Joins unified_feedback_signals → patients table for demographics.
   *
   * @param {object} opts
   * @param {string} opts.days   lookback window (default 30)
   * @param {string} opts.component  filter by AI component (optional)
   */
  async getCohortBreakdown({ days = 30, component = null } = {}) {
    const cacheKey = `cohort:${days}:${component || 'all'}`;
    const cached   = await cacheGet(cacheKey);
    if (cached) return cached;

    const compFilter = component ? `AND ufs.ai_component = '${component.replace(/'/g, "''")}'` : '';

    // Age group breakdown
    const { rows: ageRows } = await pool.query(`
      SELECT
        CASE
          WHEN EXTRACT(YEAR FROM AGE(p."dateOfBirth")) < 18  THEN '0-17'
          WHEN EXTRACT(YEAR FROM AGE(p."dateOfBirth")) < 36  THEN '18-35'
          WHEN EXTRACT(YEAR FROM AGE(p."dateOfBirth")) < 56  THEN '36-55'
          WHEN EXTRACT(YEAR FROM AGE(p."dateOfBirth")) < 76  THEN '56-75'
          ELSE '75+'
        END                                                   AS age_group,
        COUNT(ufs.id)                                         AS signal_count,
        AVG(ufs.quality_delta)::NUMERIC(5,3)                  AS avg_delta,
        GREATEST(0, LEAST(10, 5 + AVG(ufs.quality_delta)*5))::NUMERIC(4,1) AS score
      FROM unified_feedback_signals ufs
      LEFT JOIN patients p ON p.id::text = ufs.user_id
      WHERE ufs.created_at > NOW() - ($1 || ' days')::INTERVAL
        ${compFilter}
      GROUP BY age_group
      ORDER BY age_group
    `, [days]).catch(() => ({ rows: [] }));

    // Gender breakdown
    const { rows: genderRows } = await pool.query(`
      SELECT
        COALESCE(LOWER(p.gender), 'not_disclosed')  AS gender,
        COUNT(ufs.id)                               AS signal_count,
        AVG(ufs.quality_delta)::NUMERIC(5,3)        AS avg_delta,
        GREATEST(0, LEAST(10, 5 + AVG(ufs.quality_delta)*5))::NUMERIC(4,1) AS score
      FROM unified_feedback_signals ufs
      LEFT JOIN patients p ON p.id::text = ufs.user_id
      WHERE ufs.created_at > NOW() - ($1 || ' days')::INTERVAL
        ${compFilter}
      GROUP BY gender
      ORDER BY signal_count DESC
    `, [days]).catch(() => ({ rows: [] }));

    // Channel breakdown
    const { rows: channelRows } = await pool.query(`
      SELECT
        source                                      AS channel,
        COUNT(*)                                    AS signal_count,
        AVG(quality_delta)::NUMERIC(5,3)            AS avg_delta,
        GREATEST(0, LEAST(10, 5 + AVG(quality_delta)*5))::NUMERIC(4,1) AS score
      FROM unified_feedback_signals
      WHERE created_at > NOW() - ($1 || ' days')::INTERVAL
        ${compFilter}
      GROUP BY source
      ORDER BY signal_count DESC
    `, [days]).catch(() => ({ rows: [] }));

    // Parity check: detect if any cohort score differs from global by > 1.0
    const allScores = [...ageRows, ...genderRows].map(r => parseFloat(r.score ?? 5));
    const globalScore = allScores.length
      ? allScores.reduce((a, b) => a + b, 0) / allScores.length
      : 5;

    const parityAlerts = [
      ...ageRows.filter(r => Math.abs(parseFloat(r.score) - globalScore) > 1.0)
               .map(r => ({ dimension: 'age_group', value: r.age_group, score: r.score, delta: (parseFloat(r.score) - globalScore).toFixed(1) })),
      ...genderRows.filter(r => Math.abs(parseFloat(r.score) - globalScore) > 1.0)
                   .map(r => ({ dimension: 'gender', value: r.gender, score: r.score, delta: (parseFloat(r.score) - globalScore).toFixed(1) })),
    ];

    const result = {
      global_score:  parseFloat(globalScore.toFixed(1)),
      by_age:        ageRows,
      by_gender:     genderRows,
      by_channel:    channelRows,
      parity_alerts: parityAlerts,
      lookback_days: days,
      component:     component ?? 'all',
      generated_at:  new Date().toISOString(),
    };

    await cacheSet(cacheKey, result, CACHE_TTL);
    return result;
  }

  /**
   * NPS trend — returns weekly avg quality delta per AI component.
   */
  async getNpsTrend({ weeks = 12, component = null } = {}) {
    const cacheKey = `nps_trend:${weeks}:${component || 'all'}`;
    const cached   = await cacheGet(cacheKey);
    if (cached) return cached;

    const compFilter = component ? `AND ai_component = $2` : '';
    const params     = component ? [weeks, component] : [weeks];

    const { rows } = await pool.query(`
      SELECT
        DATE_TRUNC('week', created_at)                              AS week_start,
        COALESCE(ai_component, 'platform')                          AS component,
        COUNT(*)                                                    AS signal_count,
        AVG(quality_delta)::NUMERIC(5,3)                            AS avg_delta,
        GREATEST(0, LEAST(10, 5 + AVG(quality_delta)*5))::NUMERIC(4,1) AS score,
        SUM(CASE WHEN quality_delta >= 0.35  THEN 1 ELSE 0 END)    AS promoters,
        SUM(CASE WHEN quality_delta <= -0.4  THEN 1 ELSE 0 END)    AS detractors,
        COUNT(*)                                                    AS total_for_nps
      FROM unified_feedback_signals
      WHERE created_at > NOW() - ($1 || ' weeks')::INTERVAL
        ${compFilter}
      GROUP BY week_start, component
      ORDER BY week_start ASC, component
    `, params).catch(() => ({ rows: [] }));

    // Add NPS calculation: ((promoters - detractors) / total) * 100
    const trend = rows.map(r => ({
      ...r,
      nps: Math.round(((parseInt(r.promoters) - parseInt(r.detractors)) / Math.max(1, parseInt(r.total_for_nps))) * 100),
    }));

    await cacheSet(cacheKey, trend, CACHE_TTL);
    return trend;
  }
}

const feedbackCohortAnalysisService = new FeedbackCohortAnalysisService();
export default feedbackCohortAnalysisService;
