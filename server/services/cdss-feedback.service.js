/**
 * CDSS Feedback Service — Closed-Loop Learning Pipeline
 * 
 * Tracks doctor acceptance/rejection of AI-suggested codes and responses.
 * Feeds results into self-learning pipeline for continuous improvement.
 */

import { connectPostgres } from '../db/postgres.js';
import { v4 as uuidv4 } from 'uuid';

class CDSSFeedbackService {
  constructor() {
    this.initialized = false;
  }

  async ensureTable() {
    if (this.initialized) return;
    const pool = await connectPostgres();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_cdss_feedback (
        id SERIAL PRIMARY KEY,
        query_id VARCHAR(64) NOT NULL,
        user_id INTEGER,
        user_role VARCHAR(32) DEFAULT 'doctor',
        action VARCHAR(20) NOT NULL CHECK (action IN ('accepted','modified','rejected')),
        feedback_type VARCHAR(32) DEFAULT 'general',
        original_response JSONB,
        modification JSONB,
        reason TEXT,
        codes_kept TEXT[],
        codes_removed TEXT[],
        codes_added TEXT[],
        query_text TEXT,
        tenant_id VARCHAR(64) DEFAULT 'default',
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_cdss_feedback_query ON ai_cdss_feedback(query_id);
      CREATE INDEX IF NOT EXISTS idx_cdss_feedback_action ON ai_cdss_feedback(action);
      CREATE INDEX IF NOT EXISTS idx_cdss_feedback_created ON ai_cdss_feedback(created_at);
    `);
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
