/**
 * AI Analytics API Routes
 * ========================
 * Comprehensive analytics across all AI subsystems:
 *   1. Overview KPIs (conversations, tokens, cost, quality)
 *   2. LLM Operations (provider breakdown, cost trends, latency, errors)
 *   3. Conversation Analytics (volume, engagement, topics)
 *   4. Tool Usage Analytics (ranking, success rates, latency)
 *   5. Quality Analytics (response quality trends, satisfaction)
 *   6. Population Health Analytics (risk distribution, factors)
 *   7. Notification Analytics (delivery, read rates, channels)
 *   8. RAG Performance Analytics (retrieval quality, patterns)
 */

import { Router } from 'express';
import pool from '../db/pgPool.js';

const router = Router();
const db = pool;

// Helper: parse period to interval
function periodToInterval(period) {
  const map = { '24h': '24 hours', '7d': '7 days', '30d': '30 days', '90d': '90 days', '1y': '1 year' };
  return map[period] || '30 days';
}

// Helper: parse period to trunc unit for time series
function periodToTrunc(period) {
  if (period === '24h') return 'hour';
  if (period === '7d' || period === '30d') return 'day';
  return 'week';
}

// ════════════════════════════════════════════════════════════
// 1. OVERVIEW — High-level KPIs across all AI systems
// ════════════════════════════════════════════════════════════
router.get('/overview', async (req, res) => {
  try {
    const period = req.query.period || '30d';
    const interval = periodToInterval(period);

    const [convos, requests, tools, quality, risks, notifs, rag] = await Promise.all([
      // Conversations
      db.query(`
        SELECT COUNT(*) as total, 
               COALESCE(SUM(message_count), 0) as total_messages,
               COALESCE(SUM(token_count), 0) as total_tokens,
               COALESCE(SUM(tool_call_count), 0) as total_tool_calls,
               COALESCE(AVG(message_count), 0) as avg_messages_per_convo,
               COUNT(DISTINCT user_id) as unique_users
        FROM ai_brain_conversations
        WHERE created_at > NOW() - $1::interval
      `, [interval]),
      // LLM requests
      db.query(`
        SELECT COUNT(*) as total,
               COALESCE(SUM(total_tokens), 0) as tokens,
               COALESCE(SUM(cost_usd), 0) as cost,
               COALESCE(AVG(latency_ms), 0) as avg_latency,
               COUNT(*) FILTER (WHERE status = 'error') as errors
        FROM ai_request_logs
        WHERE created_at > NOW() - $1::interval
      `, [interval]),
      // Tool executions
      db.query(`
        SELECT COUNT(*) as total,
               COUNT(*) FILTER (WHERE status = 'success') as successes,
               COALESCE(AVG(latency_ms), 0) as avg_latency
        FROM ai_tool_executions
        WHERE created_at > NOW() - $1::interval
      `, [interval]),
      // Quality scores
      db.query(`
        SELECT COUNT(*) as total,
               COALESCE(AVG(relevance_score), 0) as avg_relevance,
               COALESCE(AVG(coherence_score), 0) as avg_coherence,
               COALESCE(AVG(medical_accuracy_score), 0) as avg_accuracy,
               COALESCE(AVG(empathy_score), 0) as avg_empathy,
               COUNT(*) FILTER (WHERE user_thumbs = 'up') as thumbs_up,
               COUNT(*) FILTER (WHERE user_thumbs = 'down') as thumbs_down
        FROM sib_response_quality
        WHERE created_at > NOW() - $1::interval
      `, [interval]),
      // Risk scores
      db.query(`
        SELECT COUNT(*) as total,
               COUNT(*) FILTER (WHERE risk_level = 'low') as low,
               COUNT(*) FILTER (WHERE risk_level = 'moderate') as moderate,
               COUNT(*) FILTER (WHERE risk_level = 'high') as high,
               COUNT(*) FILTER (WHERE risk_level = 'critical') as critical,
               COALESCE(AVG(overall_score), 0) as avg_score
        FROM ai_health_risk_scores
      `),
      // Smart notifications
      db.query(`
        SELECT COUNT(*) as total,
               COUNT(*) FILTER (WHERE status = 'sent') as sent,
               COUNT(*) FILTER (WHERE status = 'read' OR read_at IS NOT NULL) as read,
               COUNT(*) FILTER (WHERE status = 'pending') as pending
        FROM ai_smart_notifications
        WHERE created_at > NOW() - $1::interval
      `, [interval]),
      // RAG queries
      db.query(`
        SELECT COUNT(*) as total,
               COALESCE(AVG(top_score), 0) as avg_top_score,
               COALESCE(AVG(avg_score), 0) as avg_avg_score,
               COALESCE(AVG(latency_ms), 0) as avg_latency
        FROM ai_rag_query_logs
        WHERE created_at > NOW() - $1::interval
      `, [interval])
    ]);

    const c = convos.rows[0];
    const r = requests.rows[0];
    const t = tools.rows[0];
    const q = quality.rows[0];
    const rk = risks.rows[0];
    const n = notifs.rows[0];
    const rg = rag.rows[0];

    res.json({
      success: true,
      period,
      overview: {
        conversations: {
          total: +c.total,
          totalMessages: +c.total_messages,
          totalTokens: +c.total_tokens,
          totalToolCalls: +c.total_tool_calls,
          avgMessagesPerConvo: +parseFloat(c.avg_messages_per_convo).toFixed(1),
          uniqueUsers: +c.unique_users
        },
        llm: {
          totalRequests: +r.total,
          totalTokens: +r.tokens,
          totalCost: +parseFloat(r.cost).toFixed(4),
          avgLatencyMs: Math.round(+r.avg_latency),
          errors: +r.errors,
          errorRate: r.total > 0 ? +((r.errors / r.total) * 100).toFixed(1) : 0
        },
        tools: {
          totalExecutions: +t.total,
          successRate: t.total > 0 ? +((t.successes / t.total) * 100).toFixed(1) : 0,
          avgLatencyMs: Math.round(+t.avg_latency)
        },
        quality: {
          totalScored: +q.total,
          avgRelevance: +parseFloat(q.avg_relevance).toFixed(2),
          avgCoherence: +parseFloat(q.avg_coherence).toFixed(2),
          avgAccuracy: +parseFloat(q.avg_accuracy).toFixed(2),
          avgEmpathy: +parseFloat(q.avg_empathy).toFixed(2),
          overallScore: +((+q.avg_relevance + +q.avg_coherence + +q.avg_accuracy + +q.avg_empathy) / 4).toFixed(2),
          thumbsUp: +q.thumbs_up,
          thumbsDown: +q.thumbs_down,
          satisfactionRate: (q.thumbs_up + q.thumbs_down) > 0
            ? +(q.thumbs_up / (q.thumbs_up + q.thumbs_down) * 100).toFixed(1) : null
        },
        healthRisk: {
          totalPatients: +rk.total,
          avgScore: +parseFloat(rk.avg_score).toFixed(1),
          distribution: { low: +rk.low, moderate: +rk.moderate, high: +rk.high, critical: +rk.critical }
        },
        notifications: {
          total: +n.total,
          sent: +n.sent,
          read: +n.read,
          pending: +n.pending,
          readRate: n.total > 0 ? +((n.read / n.total) * 100).toFixed(1) : 0
        },
        rag: {
          totalQueries: +rg.total,
          avgTopScore: +parseFloat(rg.avg_top_score).toFixed(3),
          avgAvgScore: +parseFloat(rg.avg_avg_score).toFixed(3),
          avgLatencyMs: Math.round(+rg.avg_latency)
        }
      }
    });
  } catch (err) {
    console.error('[AIAnalytics] Overview error:', err.message);
    res.status(500).json({ error: 'Failed to fetch overview', details: err.message });
  }
});


// ════════════════════════════════════════════════════════════
// 2. LLM OPERATIONS — Provider breakdown, cost/token trends
// ════════════════════════════════════════════════════════════
router.get('/llm-ops', async (req, res) => {
  try {
    const period = req.query.period || '30d';
    const interval = periodToInterval(period);
    const trunc = periodToTrunc(period);

    const [byProvider, timeSeries, latencyDist, topModels, errorLogs] = await Promise.all([
      // Provider breakdown
      db.query(`
        SELECT provider,
               COUNT(*) as requests,
               COALESCE(SUM(total_tokens), 0) as tokens,
               COALESCE(SUM(cost_usd), 0) as cost,
               COALESCE(AVG(latency_ms), 0) as avg_latency,
               COUNT(*) FILTER (WHERE status = 'error') as errors
        FROM ai_request_logs
        WHERE created_at > NOW() - $1::interval
        GROUP BY provider ORDER BY requests DESC
      `, [interval]),
      // Time series (token/cost/request trends)
      db.query(`
        SELECT date_trunc($2, created_at) as bucket,
               COUNT(*) as requests,
               COALESCE(SUM(total_tokens), 0) as tokens,
               COALESCE(SUM(cost_usd), 0) as cost,
               COALESCE(AVG(latency_ms), 0) as avg_latency
        FROM ai_request_logs
        WHERE created_at > NOW() - $1::interval
        GROUP BY bucket ORDER BY bucket
      `, [interval, trunc]),
      // Latency distribution (buckets)
      db.query(`
        SELECT 
          CASE
            WHEN latency_ms < 500 THEN '<500ms'
            WHEN latency_ms < 1000 THEN '500ms-1s'
            WHEN latency_ms < 2000 THEN '1-2s'
            WHEN latency_ms < 5000 THEN '2-5s'
            ELSE '>5s'
          END as bucket,
          COUNT(*) as count
        FROM ai_request_logs
        WHERE created_at > NOW() - $1::interval
        GROUP BY bucket ORDER BY MIN(latency_ms)
      `, [interval]),
      // Top models
      db.query(`
        SELECT model_name, provider,
               COUNT(*) as requests,
               COALESCE(AVG(latency_ms), 0) as avg_latency,
               COALESCE(SUM(total_tokens), 0) as tokens,
               COALESCE(SUM(cost_usd), 0) as cost
        FROM ai_request_logs
        WHERE created_at > NOW() - $1::interval
        GROUP BY model_name, provider ORDER BY requests DESC LIMIT 10
      `, [interval]),
      // Recent errors
      db.query(`
        SELECT provider, model_name, error_message, created_at
        FROM ai_request_logs
        WHERE status = 'error' AND created_at > NOW() - $1::interval
        ORDER BY created_at DESC LIMIT 20
      `, [interval])
    ]);

    res.json({
      success: true,
      period,
      llmOps: {
        byProvider: byProvider.rows.map(r => ({
          provider: r.provider,
          requests: +r.requests,
          tokens: +r.tokens,
          cost: +parseFloat(r.cost).toFixed(4),
          avgLatencyMs: Math.round(+r.avg_latency),
          errors: +r.errors,
          errorRate: r.requests > 0 ? +((r.errors / r.requests) * 100).toFixed(1) : 0
        })),
        timeSeries: timeSeries.rows.map(r => ({
          date: r.bucket,
          requests: +r.requests,
          tokens: +r.tokens,
          cost: +parseFloat(r.cost).toFixed(4),
          avgLatencyMs: Math.round(+r.avg_latency)
        })),
        latencyDistribution: latencyDist.rows.map(r => ({ bucket: r.bucket, count: +r.count })),
        topModels: topModels.rows.map(r => ({
          model: r.model_name,
          provider: r.provider,
          requests: +r.requests,
          avgLatencyMs: Math.round(+r.avg_latency),
          tokens: +r.tokens,
          cost: +parseFloat(r.cost).toFixed(4)
        })),
        recentErrors: errorLogs.rows.map(r => ({
          provider: r.provider,
          model: r.model_name,
          error: r.error_message?.substring(0, 200),
          time: r.created_at
        }))
      }
    });
  } catch (err) {
    console.error('[AIAnalytics] LLM ops error:', err.message);
    res.status(500).json({ error: 'Failed to fetch LLM ops', details: err.message });
  }
});


// ════════════════════════════════════════════════════════════
// 3. CONVERSATION ANALYTICS — Volume, engagement, topics
// ════════════════════════════════════════════════════════════
router.get('/conversations', async (req, res) => {
  try {
    const period = req.query.period || '30d';
    const interval = periodToInterval(period);
    const trunc = periodToTrunc(period);

    const [timeSeries, byUserType, engagement, topConversations] = await Promise.all([
      // Volume time series
      db.query(`
        SELECT date_trunc($2, created_at) as bucket,
               COUNT(*) as conversations,
               COALESCE(SUM(message_count), 0) as messages,
               COALESCE(SUM(token_count), 0) as tokens,
               COUNT(DISTINCT user_id) as users
        FROM ai_brain_conversations
        WHERE created_at > NOW() - $1::interval
        GROUP BY bucket ORDER BY bucket
      `, [interval, trunc]),
      // By user type
      db.query(`
        SELECT user_type, COUNT(*) as conversations,
               COALESCE(AVG(message_count), 0) as avg_messages,
               COALESCE(AVG(token_count), 0) as avg_tokens,
               COALESCE(AVG(tool_call_count), 0) as avg_tool_calls
        FROM ai_brain_conversations
        WHERE created_at > NOW() - $1::interval
        GROUP BY user_type ORDER BY conversations DESC
      `, [interval]),
      // Engagement distribution
      db.query(`
        SELECT 
          CASE
            WHEN message_count <= 2 THEN '1-2 msgs'
            WHEN message_count <= 5 THEN '3-5 msgs'
            WHEN message_count <= 10 THEN '6-10 msgs'
            WHEN message_count <= 20 THEN '11-20 msgs'
            ELSE '20+ msgs'
          END as bucket,
          COUNT(*) as count
        FROM ai_brain_conversations
        WHERE created_at > NOW() - $1::interval
        GROUP BY bucket ORDER BY MIN(message_count)
      `, [interval]),
      // Top conversations by engagement
      db.query(`
        SELECT id, title, user_type, message_count, token_count, tool_call_count, created_at
        FROM ai_brain_conversations
        WHERE created_at > NOW() - $1::interval
        ORDER BY message_count DESC LIMIT 10
      `, [interval])
    ]);

    res.json({
      success: true,
      period,
      conversations: {
        timeSeries: timeSeries.rows.map(r => ({
          date: r.bucket,
          conversations: +r.conversations,
          messages: +r.messages,
          tokens: +r.tokens,
          users: +r.users
        })),
        byUserType: byUserType.rows.map(r => ({
          userType: r.user_type,
          conversations: +r.conversations,
          avgMessages: +parseFloat(r.avg_messages).toFixed(1),
          avgTokens: Math.round(+r.avg_tokens),
          avgToolCalls: +parseFloat(r.avg_tool_calls).toFixed(1)
        })),
        engagementDistribution: engagement.rows.map(r => ({ bucket: r.bucket, count: +r.count })),
        topConversations: topConversations.rows.map(r => ({
          id: r.id,
          title: r.title || 'Untitled',
          userType: r.user_type,
          messages: r.message_count,
          tokens: r.token_count,
          toolCalls: r.tool_call_count,
          date: r.created_at
        }))
      }
    });
  } catch (err) {
    console.error('[AIAnalytics] Conversations error:', err.message);
    res.status(500).json({ error: 'Failed to fetch conversation analytics', details: err.message });
  }
});


// ════════════════════════════════════════════════════════════
// 4. TOOL USAGE ANALYTICS — Ranking, success rates, latency
// ════════════════════════════════════════════════════════════
router.get('/tool-usage', async (req, res) => {
  try {
    const period = req.query.period || '30d';
    const interval = periodToInterval(period);
    const trunc = periodToTrunc(period);

    const [ranking, timeSeries, byCategory, recentFailures] = await Promise.all([
      // Tool ranking
      db.query(`
        SELECT tool_name, tool_category,
               COUNT(*) as executions,
               COUNT(*) FILTER (WHERE status = 'success') as successes,
               COUNT(*) FILTER (WHERE status != 'success') as failures,
               COALESCE(AVG(latency_ms), 0) as avg_latency,
               COALESCE(MIN(latency_ms), 0) as min_latency,
               COALESCE(MAX(latency_ms), 0) as max_latency,
               COUNT(*) FILTER (WHERE is_write = true) as writes
        FROM ai_tool_executions
        WHERE created_at > NOW() - $1::interval
        GROUP BY tool_name, tool_category ORDER BY executions DESC
      `, [interval]),
      // Time series
      db.query(`
        SELECT date_trunc($2, created_at) as bucket,
               COUNT(*) as executions,
               COUNT(*) FILTER (WHERE status = 'success') as successes,
               COALESCE(AVG(latency_ms), 0) as avg_latency
        FROM ai_tool_executions
        WHERE created_at > NOW() - $1::interval
        GROUP BY bucket ORDER BY bucket
      `, [interval, trunc]),
      // By category
      db.query(`
        SELECT tool_category, COUNT(*) as executions,
               COUNT(*) FILTER (WHERE status = 'success') as successes
        FROM ai_tool_executions
        WHERE created_at > NOW() - $1::interval
        GROUP BY tool_category ORDER BY executions DESC
      `, [interval]),
      // Recent failures
      db.query(`
        SELECT tool_name, error_message, created_at
        FROM ai_tool_executions
        WHERE status != 'success' AND created_at > NOW() - $1::interval
        ORDER BY created_at DESC LIMIT 15
      `, [interval])
    ]);

    res.json({
      success: true,
      period,
      toolUsage: {
        ranking: ranking.rows.map(r => ({
          name: r.tool_name,
          category: r.tool_category,
          executions: +r.executions,
          successes: +r.successes,
          failures: +r.failures,
          successRate: r.executions > 0 ? +((r.successes / r.executions) * 100).toFixed(1) : 0,
          avgLatencyMs: Math.round(+r.avg_latency),
          minLatencyMs: +r.min_latency,
          maxLatencyMs: +r.max_latency,
          writes: +r.writes
        })),
        timeSeries: timeSeries.rows.map(r => ({
          date: r.bucket,
          executions: +r.executions,
          successes: +r.successes,
          avgLatencyMs: Math.round(+r.avg_latency)
        })),
        byCategory: byCategory.rows.map(r => ({
          category: r.tool_category,
          executions: +r.executions,
          successRate: r.executions > 0 ? +((r.successes / r.executions) * 100).toFixed(1) : 0
        })),
        recentFailures: recentFailures.rows.map(r => ({
          tool: r.tool_name,
          error: r.error_message?.substring(0, 200),
          time: r.created_at
        }))
      }
    });
  } catch (err) {
    console.error('[AIAnalytics] Tool usage error:', err.message);
    res.status(500).json({ error: 'Failed to fetch tool usage', details: err.message });
  }
});


// ════════════════════════════════════════════════════════════
// 5. QUALITY ANALYTICS — Response quality trends, satisfaction
// ════════════════════════════════════════════════════════════
router.get('/quality', async (req, res) => {
  try {
    const period = req.query.period || '30d';
    const interval = periodToInterval(period);
    const trunc = periodToTrunc(period);

    const [timeSeries, byProvider, byIntent, distribution, recent] = await Promise.all([
      // Quality score trends over time
      db.query(`
        SELECT date_trunc($2, created_at) as bucket,
               COUNT(*) as scored,
               COALESCE(AVG(relevance_score), 0) as relevance,
               COALESCE(AVG(coherence_score), 0) as coherence,
               COALESCE(AVG(medical_accuracy_score), 0) as accuracy,
               COALESCE(AVG(empathy_score), 0) as empathy,
               COUNT(*) FILTER (WHERE user_thumbs = 'up') as thumbs_up,
               COUNT(*) FILTER (WHERE user_thumbs = 'down') as thumbs_down
        FROM sib_response_quality
        WHERE created_at > NOW() - $1::interval
        GROUP BY bucket ORDER BY bucket
      `, [interval, trunc]),
      // Quality by provider
      db.query(`
        SELECT provider,
               COUNT(*) as scored,
               COALESCE(AVG(relevance_score), 0) as relevance,
               COALESCE(AVG(coherence_score), 0) as coherence,
               COALESCE(AVG(medical_accuracy_score), 0) as accuracy,
               COALESCE(AVG(empathy_score), 0) as empathy,
               COALESCE(AVG(response_time_ms), 0) as avg_response_time
        FROM sib_response_quality
        WHERE created_at > NOW() - $1::interval AND provider IS NOT NULL
        GROUP BY provider ORDER BY scored DESC
      `, [interval]),
      // Quality by intent
      db.query(`
        SELECT intent,
               COUNT(*) as scored,
               COALESCE(AVG((relevance_score + coherence_score + medical_accuracy_score + empathy_score) / 4), 0) as avg_overall
        FROM sib_response_quality
        WHERE created_at > NOW() - $1::interval AND intent IS NOT NULL
        GROUP BY intent ORDER BY scored DESC LIMIT 10
      `, [interval]),
      // Score distribution   
      db.query(`
        SELECT 
          CASE
            WHEN (relevance_score + coherence_score + medical_accuracy_score + empathy_score) / 4 >= 0.9 THEN 'Excellent (≥90%)'
            WHEN (relevance_score + coherence_score + medical_accuracy_score + empathy_score) / 4 >= 0.75 THEN 'Good (75-89%)'
            WHEN (relevance_score + coherence_score + medical_accuracy_score + empathy_score) / 4 >= 0.6 THEN 'Fair (60-74%)'
            ELSE 'Poor (<60%)'
          END as bucket,
          COUNT(*) as count
        FROM sib_response_quality
        WHERE created_at > NOW() - $1::interval
        GROUP BY bucket
      `, [interval]),
      // Lowest-scored recent responses (for remediation)
      db.query(`
        SELECT id, query, intent, provider,
               relevance_score, coherence_score, medical_accuracy_score, empathy_score,
               (relevance_score + coherence_score + medical_accuracy_score + empathy_score) / 4 as overall,
               created_at
        FROM sib_response_quality
        WHERE created_at > NOW() - $1::interval
        ORDER BY (relevance_score + coherence_score + medical_accuracy_score + empathy_score) ASC
        LIMIT 10
      `, [interval])
    ]);

    res.json({
      success: true,
      period,
      quality: {
        timeSeries: timeSeries.rows.map(r => ({
          date: r.bucket,
          scored: +r.scored,
          relevance: +parseFloat(r.relevance).toFixed(2),
          coherence: +parseFloat(r.coherence).toFixed(2),
          accuracy: +parseFloat(r.accuracy).toFixed(2),
          empathy: +parseFloat(r.empathy).toFixed(2),
          thumbsUp: +r.thumbs_up,
          thumbsDown: +r.thumbs_down
        })),
        byProvider: byProvider.rows.map(r => ({
          provider: r.provider,
          scored: +r.scored,
          relevance: +parseFloat(r.relevance).toFixed(2),
          coherence: +parseFloat(r.coherence).toFixed(2),
          accuracy: +parseFloat(r.accuracy).toFixed(2),
          empathy: +parseFloat(r.empathy).toFixed(2),
          avgResponseTimeMs: Math.round(+r.avg_response_time)
        })),
        byIntent: byIntent.rows.map(r => ({
          intent: r.intent,
          scored: +r.scored,
          avgOverall: +parseFloat(r.avg_overall).toFixed(2)
        })),
        scoreDistribution: distribution.rows.map(r => ({ bucket: r.bucket, count: +r.count })),
        lowestScored: recent.rows.map(r => ({
          id: r.id,
          query: r.query?.substring(0, 100),
          intent: r.intent,
          provider: r.provider,
          overall: +parseFloat(r.overall).toFixed(2),
          scores: {
            relevance: +parseFloat(r.relevance_score).toFixed(2),
            coherence: +parseFloat(r.coherence_score).toFixed(2),
            accuracy: +parseFloat(r.medical_accuracy_score).toFixed(2),
            empathy: +parseFloat(r.empathy_score).toFixed(2)
          },
          date: r.created_at
        }))
      }
    });
  } catch (err) {
    console.error('[AIAnalytics] Quality error:', err.message);
    res.status(500).json({ error: 'Failed to fetch quality analytics', details: err.message });
  }
});


// ════════════════════════════════════════════════════════════
// 6. POPULATION HEALTH — Risk distribution, factors
// ════════════════════════════════════════════════════════════
router.get('/population-health', async (req, res) => {
  try {
    const [riskDist, scoreHist, topFactors, recentScores, trends] = await Promise.all([
      // Risk level distribution
      db.query(`
        SELECT risk_level, COUNT(*) as count,
               COALESCE(AVG(overall_score), 0) as avg_score
        FROM ai_health_risk_scores
        GROUP BY risk_level ORDER BY avg_score DESC
      `),
      // Score histogram 
      db.query(`
        SELECT 
          CASE
            WHEN overall_score <= 2 THEN '0-2 (Very Low)'
            WHEN overall_score <= 4 THEN '2-4 (Low)'
            WHEN overall_score <= 6 THEN '4-6 (Moderate)'
            WHEN overall_score <= 8 THEN '6-8 (High)'
            ELSE '8-10 (Critical)'
          END as bucket,
          COUNT(*) as count
        FROM ai_health_risk_scores
        GROUP BY bucket ORDER BY MIN(overall_score)
      `),
      // Common risk factors
      db.query(`
        SELECT factor, COUNT(*) as frequency
        FROM ai_health_risk_scores, 
             LATERAL jsonb_array_elements_text(
               CASE WHEN jsonb_typeof(risk_factors) = 'array' THEN risk_factors ELSE '[]'::jsonb END
             ) as factor
        GROUP BY factor ORDER BY frequency DESC LIMIT 15
      `),
      // Recent scores
      db.query(`
        SELECT patient_id, overall_score, risk_level, subscores, 
               risk_factors, recommendations, updated_at
        FROM ai_health_risk_scores
        ORDER BY updated_at DESC LIMIT 20
      `),
      // Clinical insights breakdown
      db.query(`
        SELECT insight_type, severity, COUNT(*) as count,
               COUNT(*) FILTER (WHERE action_taken IS NOT NULL) as actioned
        FROM ai_clinical_insights
        GROUP BY insight_type, severity ORDER BY count DESC
      `)
    ]);

    res.json({
      success: true,
      populationHealth: {
        riskDistribution: riskDist.rows.map(r => ({
          level: r.risk_level,
          count: +r.count,
          avgScore: +parseFloat(r.avg_score).toFixed(1)
        })),
        scoreHistogram: scoreHist.rows.map(r => ({ bucket: r.bucket, count: +r.count })),
        topRiskFactors: topFactors.rows.map(r => ({ factor: r.factor, frequency: +r.frequency })),
        recentScores: recentScores.rows.map(r => ({
          patientId: r.patient_id,
          score: +r.overall_score,
          level: r.risk_level,
          subscores: r.subscores,
          factors: r.risk_factors,
          recommendations: r.recommendations,
          updatedAt: r.updated_at
        })),
        clinicalInsights: trends.rows.map(r => ({
          type: r.insight_type,
          severity: r.severity,
          count: +r.count,
          actioned: +r.actioned
        }))
      }
    });
  } catch (err) {
    console.error('[AIAnalytics] Population health error:', err.message);
    res.status(500).json({ error: 'Failed to fetch population health', details: err.message });
  }
});


// ════════════════════════════════════════════════════════════
// 7. NOTIFICATION ANALYTICS — Delivery, read rates, channels
// ════════════════════════════════════════════════════════════
router.get('/notifications', async (req, res) => {
  try {
    const period = req.query.period || '30d';
    const interval = periodToInterval(period);
    const trunc = periodToTrunc(period);

    const [byType, byPriority, byChannel, timeSeries, readLatency] = await Promise.all([
      // By notification type
      db.query(`
        SELECT notification_type,
               COUNT(*) as total,
               COUNT(*) FILTER (WHERE status = 'sent') as sent,
               COUNT(*) FILTER (WHERE status = 'read' OR read_at IS NOT NULL) as read_count,
               COUNT(*) FILTER (WHERE status = 'pending') as pending
        FROM ai_smart_notifications
        WHERE created_at > NOW() - $1::interval
        GROUP BY notification_type ORDER BY total DESC
      `, [interval]),
      // By priority
      db.query(`
        SELECT priority, COUNT(*) as total,
               COUNT(*) FILTER (WHERE status = 'read' OR read_at IS NOT NULL) as read_count
        FROM ai_smart_notifications
        WHERE created_at > NOW() - $1::interval
        GROUP BY priority ORDER BY total DESC
      `, [interval]),
      // By channel
      db.query(`
        SELECT channel, COUNT(*) as total,
               COUNT(*) FILTER (WHERE status = 'read' OR read_at IS NOT NULL) as read_count
        FROM ai_smart_notifications
        WHERE created_at > NOW() - $1::interval
        GROUP BY channel ORDER BY total DESC
      `, [interval]),
      // Volume over time
      db.query(`
        SELECT date_trunc($2, created_at) as bucket,
               COUNT(*) as total,
               COUNT(*) FILTER (WHERE status = 'read' OR read_at IS NOT NULL) as read_count
        FROM ai_smart_notifications
        WHERE created_at > NOW() - $1::interval
        GROUP BY bucket ORDER BY bucket
      `, [interval, trunc]),
      // Average time to read 
      db.query(`
        SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (read_at - created_at)) / 3600), 0) as avg_hours_to_read
        FROM ai_smart_notifications
        WHERE read_at IS NOT NULL AND created_at > NOW() - $1::interval
      `, [interval])
    ]);

    res.json({
      success: true,
      period,
      notifications: {
        byType: byType.rows.map(r => ({
          type: r.notification_type,
          total: +r.total,
          sent: +r.sent,
          read: +r.read_count,
          pending: +r.pending,
          readRate: r.total > 0 ? +((r.read_count / r.total) * 100).toFixed(1) : 0
        })),
        byPriority: byPriority.rows.map(r => ({
          priority: r.priority,
          total: +r.total,
          read: +r.read_count,
          readRate: r.total > 0 ? +((r.read_count / r.total) * 100).toFixed(1) : 0
        })),
        byChannel: byChannel.rows.map(r => ({
          channel: r.channel,
          total: +r.total,
          read: +r.read_count,
          readRate: r.total > 0 ? +((r.read_count / r.total) * 100).toFixed(1) : 0
        })),
        timeSeries: timeSeries.rows.map(r => ({
          date: r.bucket,
          total: +r.total,
          read: +r.read_count
        })),
        avgHoursToRead: +parseFloat(readLatency.rows[0]?.avg_hours_to_read || 0).toFixed(1)
      }
    });
  } catch (err) {
    console.error('[AIAnalytics] Notifications error:', err.message);
    res.status(500).json({ error: 'Failed to fetch notification analytics', details: err.message });
  }
});


// ════════════════════════════════════════════════════════════
// 8. RAG PERFORMANCE — Retrieval quality, patterns
// ════════════════════════════════════════════════════════════
router.get('/rag', async (req, res) => {
  try {
    const period = req.query.period || '30d';
    const interval = periodToInterval(period);
    const trunc = periodToTrunc(period);

    const [timeSeries, scoreDist, topQueries] = await Promise.all([
      // RAG performance over time
      db.query(`
        SELECT date_trunc($2, created_at) as bucket,
               COUNT(*) as queries,
               COALESCE(AVG(top_score), 0) as avg_top_score,
               COALESCE(AVG(avg_score), 0) as avg_avg_score,
               COALESCE(AVG(chunks_retrieved), 0) as avg_chunks,
               COALESCE(AVG(latency_ms), 0) as avg_latency
        FROM ai_rag_query_logs
        WHERE created_at > NOW() - $1::interval
        GROUP BY bucket ORDER BY bucket
      `, [interval, trunc]),
      // Score quality distribution
      db.query(`
        SELECT 
          CASE 
            WHEN top_score >= 0.9 THEN 'Excellent (≥0.9)'
            WHEN top_score >= 0.7 THEN 'Good (0.7-0.89)'
            WHEN top_score >= 0.5 THEN 'Fair (0.5-0.69)'
            ELSE 'Poor (<0.5)'
          END as bucket,
          COUNT(*) as count
        FROM ai_rag_query_logs
        WHERE created_at > NOW() - $1::interval
        GROUP BY bucket ORDER BY MIN(top_score) DESC
      `, [interval]),
      // Recent queries with scores
      db.query(`
        SELECT query_text, chunks_retrieved, top_score, avg_score, latency_ms, created_at
        FROM ai_rag_query_logs
        WHERE created_at > NOW() - $1::interval
        ORDER BY created_at DESC LIMIT 20
      `, [interval])
    ]);

    res.json({
      success: true,
      period,
      rag: {
        timeSeries: timeSeries.rows.map(r => ({
          date: r.bucket,
          queries: +r.queries,
          avgTopScore: +parseFloat(r.avg_top_score).toFixed(3),
          avgAvgScore: +parseFloat(r.avg_avg_score).toFixed(3),
          avgChunks: +parseFloat(r.avg_chunks).toFixed(1),
          avgLatencyMs: Math.round(+r.avg_latency)
        })),
        scoreDistribution: scoreDist.rows.map(r => ({ bucket: r.bucket, count: +r.count })),
        recentQueries: topQueries.rows.map(r => ({
          query: r.query_text?.substring(0, 150),
          chunks: r.chunks_retrieved,
          topScore: +parseFloat(r.top_score).toFixed(3),
          avgScore: +parseFloat(r.avg_score).toFixed(3),
          latencyMs: r.latency_ms,
          date: r.created_at
        }))
      }
    });
  } catch (err) {
    console.error('[AIAnalytics] RAG error:', err.message);
    res.status(500).json({ error: 'Failed to fetch RAG analytics', details: err.message });
  }
});

export default router;
