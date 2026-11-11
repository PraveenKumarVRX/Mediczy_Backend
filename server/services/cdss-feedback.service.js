/**
 * CDSS Feedback Service — Closed-Loop Learning Pipeline
 * 
 * Tracks doctor acceptance/rejection of AI-suggested codes and responses.
 * Feeds results into self-learning pipeline for continuous improvement.
 */

import { connectPostgres } from '../db/postgres.js';
import { v4 as uuidv4 } from 'uuid';

import { schemaVerifier } from '../utils/schema-guard.js';
import schemaCheckPool from '../db/pgPool.js';

const ENSURECDSSFEEDBACKSCHEMA_TABLES = ['ai_cdss_feedback'];

const ensureCdssFeedbackSchema = schemaVerifier({
  pool: schemaCheckPool,
  tables: ENSURECDSSFEEDBACKSCHEMA_TABLES,
  code: 'SCHEMA_NOT_MIGRATED',
  message: 'Apply the platform-edge governance migration before recording CDSS feedback',
});

class CDSSFeedbackService {
  constructor() {
    this.initialized = false;
  }

  async ensureTable() {
    if (this.initialized) return;
    const pool = await connectPostgres();
    // Schema is owned by the migration; this used to build the table on
    // the request path, taking an ACCESS EXCLUSIVE lock mid-request.
    await ensureCdssFeedbackSchema();
    this.initialized = true;
  }

  async recordFeedback({ queryId, userId, action, feedbackType, originalResponse, modification, reason, codesKept, codesRemoved, codesAdded, queryText, tenantId }) {
    await this.ensureTable();
    const pool = await connectPostgres();
    const result = await pool.query(
      `INSERT INTO ai_cdss_feedback (query_id, user_id, action, feedback_type, original_response, modification, reason, codes_kept, codes_removed, codes_added, query_text, tenant_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id, query_id, action, created_at`,
      [queryId, userId, action, feedbackType || 'general', JSON.stringify(originalResponse || {}), JSON.stringify(modification || {}), reason || null, codesKept || [], codesRemoved || [], codesAdded || [], queryText || null, tenantId || 'default']
    );
    return result.rows[0];
  }

  async getFeedbackStats(days = 30) {
    await this.ensureTable();
    const pool = await connectPostgres();
    const result = await pool.query(`
      SELECT 
        action,
        COUNT(*) as count,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(DISTINCT query_id) as unique_queries
      FROM ai_cdss_feedback
      WHERE created_at > NOW() - INTERVAL '${parseInt(days)} days'
      GROUP BY action
    `);
    
    const codeAccuracy = await pool.query(`
      SELECT 
        COALESCE(AVG(array_length(codes_kept, 1)), 0) as avg_codes_kept,
        COALESCE(AVG(array_length(codes_removed, 1)), 0) as avg_codes_removed,
        COALESCE(AVG(array_length(codes_added, 1)), 0) as avg_codes_added
      FROM ai_cdss_feedback
      WHERE created_at > NOW() - INTERVAL '${parseInt(days)} days'
        AND array_length(codes_kept, 1) IS NOT NULL
    `);

    return {
      byAction: result.rows,
      codeAccuracy: codeAccuracy.rows[0],
      period: `${days} days`
    };
  }

  async getRecentFeedback(limit = 50) {
    await this.ensureTable();
    const pool = await connectPostgres();
    const result = await pool.query(
      `SELECT id, query_id, user_id, action, feedback_type, reason, codes_kept, codes_removed, codes_added, query_text, created_at
       FROM ai_cdss_feedback ORDER BY created_at DESC LIMIT $1`, [limit]
    );
    return result.rows;
  }
}

const cdssFeedbackService = new CDSSFeedbackService();
export default cdssFeedbackService;
export { CDSSFeedbackService };
