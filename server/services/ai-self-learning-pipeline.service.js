/**
 * AI Self-Learning Pipeline Service
 * ====================================
 * Analyzes AI response quality and user feedback to continuously
 * improve the AI system's medical accuracy and empathy.
 * 
 * Pipeline stages:
 *   1. Collect feedback signals (thumbs up/down, follow-up count, response time)
 *   2. Score response quality across dimensions
 *   3. Identify patterns (common failures, successful approaches)
 *   4. Generate learning insights (stored in sib_learning_insights)
 *   5. Apply insights to system prompts and tool selection
 * 
 * Populates: sib_response_quality, sib_learning_insights
 * Schedule: Every 4 hours
 */

import cron from 'node-cron';
import pool from '../db/pgPool.js';
import llmProvider from './ai-brain/llm-provider.js';
import { v4 as uuidv4 } from 'uuid';
import { tick, tickError, tickStart } from '../utils/cronRegistry.js';

class SelfLearningPipeline {
  constructor() {
    this.isRunning = false;
    this.cronJob = null;
  }

  start() {
    if (this.isRunning) {
      console.log('⚠️  Self-learning pipeline already running');
      return;
    }

    this.isRunning = true;

    // Initial run after 60 seconds
    setTimeout(() => {
      this.runPipeline().catch(err =>
        console.error('[SelfLearn] Initial run error:', err.message)
      );
    }, 60000);

    // Run every 4 hours
    this.cronJob = cron.schedule('30 */4 * * *', async () => {
      await this.runPipeline();
    });

    console.log('✅ AI Self-Learning Pipeline started (every 4 hours)');
  }

  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.isRunning = false;
      console.log('🛑 Self-Learning Pipeline stopped');
    }
  }

  /**
   * Main pipeline execution
   */
  async runPipeline() {
    const startTime = Date.now();
    tickStart('ai_self_learning');
    console.log('🧠 [SelfLearn] Starting learning pipeline...');

    try {
      const db = pool;

      // Stage 1: Process unscored conversations
      const scored = await this.scoreRecentConversations(db);

      // Stage 2: Analyze patterns from scored responses
      const patterns = await this.analyzePatterns(db);

      // Stage 3: Generate learning insights  
      const insights = await this.generateInsights(db, patterns);

      // Stage 4: Apply approved insights to system prompts
      const applied = await this.applyInsights(db);

      // Stage 5: Update quality metrics
      await this.updateQualityMetrics(db);

      const elapsed = Date.now() - startTime;
      console.log(`✅ [SelfLearn] Pipeline complete: ${scored} scored, ${patterns.length} patterns, ${insights} insights, ${applied} applied in ${elapsed}ms`);
      tick('ai_self_learning', { scored, patterns: patterns.length, insights, applied, elapsedMs: elapsed });

    } catch (error) {
      tickError('ai_self_learning', error.message);
      console.error('❌ [SelfLearn] Pipeline error:', error.message);
    }
  }

  /**
   * Stage 1: Score recent conversations for quality
   */
  async scoreRecentConversations(db) {
    let scored = 0;

    try {
      // Get recent brain conversations not yet quality-scored
      const { rows: conversations } = await db.query(`
        SELECT c.id, c.user_id, c.title, c.message_count, c.tool_call_count,
               c.token_count, c.created_at
        FROM ai_brain_conversations c
        WHERE c.created_at > NOW() - INTERVAL '24 hours'
          AND NOT EXISTS (
            SELECT 1 FROM sib_response_quality q
            WHERE q.conversation_id = c.id::text
          )
        ORDER BY c.created_at DESC
        LIMIT 50
      `);

      for (const conv of conversations) {
        try {
          // Get messages for this conversation
          const { rows: messages } = await db.query(`
            SELECT role, content, tool_name, created_at
            FROM ai_brain_messages
            WHERE conversation_id = $1
            ORDER BY created_at ASC
          `, [conv.id]);

          const userMessages = messages.filter(m => m.role === 'user');
          const assistantMessages = messages.filter(m => m.role === 'assistant');

          if (userMessages.length === 0 || assistantMessages.length === 0) continue;

          // Score each Q&A pair
          for (let i = 0; i < Math.min(userMessages.length, assistantMessages.length); i++) {
            const query = userMessages[i].content;
            const response = assistantMessages[i].content;

            if (!query || !response) continue;

            // Compute quality scores
            const scores = this.computeQualityScores(query, response, messages);

            await db.query(`
              INSERT INTO sib_response_quality 
                (response_id, conversation_id, query, response, intent, provider,
                 relevance_score, coherence_score, medical_accuracy_score, empathy_score,
                 response_time_ms, tokens_used, follow_up_count, metadata, created_at)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
            `, [
              uuidv4(),
              conv.id.toString(),
              query.substring(0, 2000),
              response.substring(0, 5000),
              scores.intent,
              'brain-cascade',
              scores.relevance,
              scores.coherence,
              scores.medicalAccuracy,
              scores.empathy,
              null, // response_time_ms — not available retroactively
              conv.token_count,
              userMessages.length - 1,
              JSON.stringify({ toolsUsed: conv.tool_call_count })
            ]);

            scored++;
          }
        } catch (convErr) {
          console.error(`[SelfLearn] Scoring conv ${conv.id} error:`, convErr.message);
        }
      }
    } catch (err) {
      console.error('[SelfLearn] Stage 1 error:', err.message);
    }

    return scored;
  }

  /**
   * Compute quality scores for a Q&A pair using heuristics
   */
  computeQualityScores(query, response, allMessages) {
    // Detect intent
    const intent = this.detectIntent(query);

    // Relevance: does response address the query?
    let relevance = 0.7; // baseline
    const queryKeywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const responseLC = response.toLowerCase();
    const keywordHits = queryKeywords.filter(kw => responseLC.includes(kw)).length;
    relevance = Math.min(1, relevance + (keywordHits / Math.max(queryKeywords.length, 1)) * 0.3);

    // Coherence: length, structure, no truncation
    let coherence = 0.7;
    if (response.length > 100) coherence += 0.1;
    if (response.length > 300) coherence += 0.1;
    if (response.includes('\n')) coherence += 0.05; // Has paragraph breaks
    if (/\d+[\.\)]/m.test(response)) coherence += 0.05; // Has numbered/bulleted lists

    // Medical accuracy: presence of clinical terms, dosages, contraindications
    let medicalAccuracy = 0.6;
    if (/mg|dose|tablet|capsule|injection|syrup/i.test(response)) medicalAccuracy += 0.1;
    if (/contraindic|side.?effect|interaction|precaution/i.test(response)) medicalAccuracy += 0.1;
    if (/consult.*doctor|seek.*medical|professional.*advice/i.test(response)) medicalAccuracy += 0.1;
    if (/diagnos|symptom|condition|treatment/i.test(response)) medicalAccuracy += 0.1;

    // Empathy: warmth, concern, support language
    let empathy = 0.6;
    if (/understand|concern|worr|hope|feel better|sorry to hear/i.test(response)) empathy += 0.15;
    if (/please|care|safe|important|matter/i.test(response)) empathy += 0.1;
    if (/don't hesitate|reach out|we're here|take care/i.test(response)) empathy += 0.1;
    if (/!/g.test(response)) empathy += 0.05;

    return {
      intent,
      relevance: Math.round(relevance * 100) / 100,
      coherence: Math.round(coherence * 100) / 100,
      medicalAccuracy: Math.round(medicalAccuracy * 100) / 100,
      empathy: Math.round(empathy * 100) / 100
    };
  }

  /**
   * Detect query intent
   */
  detectIntent(query) {
    const q = query.toLowerCase();
    if (/symptom|pain|hurt|ache|fever|cough|headache/i.test(q)) return 'symptom_check';
    if (/medicine|drug|tablet|dose|prescription/i.test(q)) return 'medication_query';
    if (/appointment|book|schedule|doctor/i.test(q)) return 'appointment';
    if (/report|lab|test|result/i.test(q)) return 'lab_results';
    if (/diet|exercise|sleep|lifestyle|weight/i.test(q)) return 'wellness';
    if (/emergency|urgent|severe|911/i.test(q)) return 'emergency';
    if (/insurance|claim|policy|coverage/i.test(q)) return 'insurance';
    return 'general_health';
  }

  /**
   * Stage 2: Analyze patterns from scored responses
   */
  async analyzePatterns(db) {
    const patterns = [];

    try {
      // Find intents with low average scores
      const { rows: intentScores } = await db.query(`
        SELECT intent,
               COUNT(*) as count,
               AVG(relevance_score) as avg_relevance,
               AVG(coherence_score) as avg_coherence,
               AVG(medical_accuracy_score) as avg_accuracy,
               AVG(empathy_score) as avg_empathy
        FROM sib_response_quality
        WHERE created_at > NOW() - INTERVAL '7 days'
        GROUP BY intent
        HAVING COUNT(*) >= 3
      `);

      for (const intent of intentScores) {
        const avgOverall = (
          parseFloat(intent.avg_relevance || 0) +
          parseFloat(intent.avg_coherence || 0) +
          parseFloat(intent.avg_accuracy || 0) +
          parseFloat(intent.avg_empathy || 0)
        ) / 4;

        if (avgOverall < 0.7) {
          patterns.push({
            type: 'low_quality_intent',
            intent: intent.intent,
            avgScore: avgOverall,
            count: parseInt(intent.count),
            weakestDimension: this.findWeakest(intent)
          });
        }
      }

      // Find responses with many follow-ups (indicates confusion)
      const { rows: highFollowUp } = await db.query(`
        SELECT intent, AVG(follow_up_count) as avg_followups, COUNT(*) as count
        FROM sib_response_quality
        WHERE created_at > NOW() - INTERVAL '7 days'
          AND follow_up_count > 3
        GROUP BY intent
        HAVING COUNT(*) >= 2
      `);

      for (const row of highFollowUp) {
        patterns.push({
          type: 'high_followup',
          intent: row.intent,
          avgFollowups: parseFloat(row.avg_followups),
          count: parseInt(row.count)
        });
      }

    } catch (err) {
      console.error('[SelfLearn] Stage 2 error:', err.message);
    }

    return patterns;
  }

  findWeakest(scores) {
    const dims = {
      relevance: parseFloat(scores.avg_relevance || 0),
      coherence: parseFloat(scores.avg_coherence || 0),
      accuracy: parseFloat(scores.avg_accuracy || 0),
      empathy: parseFloat(scores.avg_empathy || 0)
    };
    return Object.entries(dims).sort((a, b) => a[1] - b[1])[0][0];
  }

  /**
   * Stage 3: Generate learning insights from patterns
   */
  async generateInsights(db, patterns) {
    let insightsCreated = 0;

    for (const pattern of patterns) {
      try {
        // Check if we already have a recent insight for this pattern
        const { rows: existing } = await db.query(`
          SELECT id FROM sib_learning_insights
          WHERE insight_type = $1 AND category = $2
            AND created_at > NOW() - INTERVAL '24 hours'
          LIMIT 1
        `, [pattern.type, pattern.intent]);

        if (existing.length > 0) continue;

        const insightId = uuidv4();
        let description = '';
        let improvedPattern = '';

        if (pattern.type === 'low_quality_intent') {
          description = `Responses for "${pattern.intent}" intent show below-threshold quality (avg: ${pattern.avgScore.toFixed(2)}). Weakest dimension: ${pattern.weakestDimension}. Sample size: ${pattern.count} responses.`;
          improvedPattern = this.suggestImprovement(pattern);
        } else if (pattern.type === 'high_followup') {
          description = `Users ask ${pattern.avgFollowups.toFixed(1)} follow-up questions on average for "${pattern.intent}" queries. This suggests initial responses may be incomplete or unclear.`;
          improvedPattern = 'Provide more comprehensive initial responses with anticipatory information for common follow-up questions.';
        }

        await db.query(`
          INSERT INTO sib_learning_insights 
            (insight_id, insight_type, category, description, original_pattern, improved_pattern,
             confidence_score, impact_score, status, metadata, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, NOW(), NOW())
        `, [
          insightId,
          pattern.type,
          pattern.intent,
          description,
          JSON.stringify(pattern),
          improvedPattern,
          Math.min(0.9, pattern.count / 10), // Confidence scales with sample size
          pattern.type === 'low_quality_intent' ? 1 - pattern.avgScore : 0.5,
          JSON.stringify({ generatedBy: 'self-learning-pipeline-v2' })
        ]);

        insightsCreated++;
      } catch (err) {
        console.error('[SelfLearn] Insight generation error:', err.message);
      }
    }

    return insightsCreated;
  }

  /**
   * Stage 4A: Apply approved insights to system prompts.
   *
   * Strategy:
   *  - Read insights with status='approved' and confidence > 0.7
   *  - For each: fetch the current brain-system-prompt template
   *  - INSERT a new version with the improved_pattern appended as a guidance bullet
   *  - Mark insight as 'applied'
   *  - Max 3 applications per pipeline run (avoid prompt bloat)
   */
  async applyInsights(db) {
    const MAX_PER_RUN = 3;
    const CONFIDENCE_THRESHOLD = 0.7;
    let applied = 0;

    try {
      const { rows: insights } = await db.query(`
        SELECT insight_id, description, improved_pattern, confidence_score, category
          FROM sib_learning_insights
         WHERE status = 'approved'
           AND confidence_score >= $1
           AND applied_at IS NULL
         ORDER BY impact_score DESC, confidence_score DESC
         LIMIT $2
      `, [CONFIDENCE_THRESHOLD, MAX_PER_RUN]);

      if (insights.length === 0) return 0;

      // Get current active prompt template
      const { rows: templates } = await db.query(`
        SELECT id, name, template, version
          FROM ai_prompt_templates
         WHERE name = 'brain-system-prompt'
           AND is_active = true
         ORDER BY version DESC
         LIMIT 1
      `);

      if (templates.length === 0) {
        console.warn('[SelfLearn] No active brain-system-prompt template found — skipping apply');
        return 0;
      }

      const current = templates[0];

      for (const insight of insights) {
        try {
          if (!insight.improved_pattern) continue;

          // Build patch: append guidance bullet at end of template
          const guidanceLine = `\n\n[AUTO-LEARNING ${new Date().toISOString().split('T')[0]}] ${insight.category?.toUpperCase() || 'GENERAL'}: ${insight.improved_pattern.trim()}`;

          // Avoid duplicate guidance (idempotency check)
          if (current.template.includes(insight.improved_pattern.substring(0, 60))) {
            await db.query(`UPDATE sib_learning_insights SET status='applied', applied_at=NOW() WHERE insight_id=$1`, [insight.insight_id]);
            applied++;
            continue;
          }

          const newTemplate = current.template + guidanceLine;
          const newVersion = (current.version || 1) + 1;

          // Deactivate old, insert new version
          await db.query('BEGIN');
          await db.query(`UPDATE ai_prompt_templates SET is_active = false WHERE name = 'brain-system-prompt' AND is_active = true`);
          await db.query(`
            INSERT INTO ai_prompt_templates (name, template, version, is_active, created_at, updated_at)
            VALUES ('brain-system-prompt', $1, $2, true, NOW(), NOW())
          `, [newTemplate, newVersion]);
          await db.query(`UPDATE sib_learning_insights SET status='applied', applied_at=NOW() WHERE insight_id=$1`, [insight.insight_id]);
          await db.query('COMMIT');

          console.log(`[SelfLearn] Applied insight (id=${insight.insight_id}, category=${insight.category}, version=${current.version}→${newVersion})`);
          // Update current template for next iteration in this run
          current.template = newTemplate;
          current.version = newVersion;
          applied++;
        } catch (err) {
          await db.query('ROLLBACK').catch(() => {});
          console.error('[SelfLearn] applyInsights single error:', err.message);
        }
      }
    } catch (err) {
      console.error('[SelfLearn] applyInsights error:', err.message);
    }

    return applied;
  }

  /**
   * Suggest improvements based on pattern weakness
   */
  suggestImprovement(pattern) {
    const improvements = {
      relevance: 'Ensure system prompt emphasizes directly addressing the user query. Include relevant medical terminology matching for better context awareness.',
      coherence: 'Improve response structure with clear sections: Assessment, Explanation, Recommendations, and When-to-Seek-Help.',
      accuracy: 'Enhance medical knowledge retrieval. Ensure responses cite clinical guidelines when applicable. Cross-reference with drug interaction database.',
      empathy: 'Add empathetic acknowledgment at the start of responses. Include phrases like "I understand your concern" and offer reassurance where appropriate.'
    };

    return improvements[pattern.weakestDimension] || 'Review and improve response quality for this intent category.';
  }

  /**
   * Stage 4: Update aggregate quality metrics
   */
  async updateQualityMetrics(db) {
    try {
      // Calculate overall system quality score
      const { rows } = await db.query(`
        SELECT 
          COUNT(*) as total_responses,
          AVG(relevance_score) as avg_relevance,
          AVG(coherence_score) as avg_coherence,
          AVG(medical_accuracy_score) as avg_accuracy,
          AVG(empathy_score) as avg_empathy,
          AVG(COALESCE(user_rating, 3)) as avg_user_rating
        FROM sib_response_quality
        WHERE created_at > NOW() - INTERVAL '30 days'
      `);

      if (rows.length > 0 && rows[0].total_responses > 0) {
        const metrics = rows[0];
        console.log(`[SelfLearn] Quality Metrics (30d): Relevance=${parseFloat(metrics.avg_relevance || 0).toFixed(2)}, Coherence=${parseFloat(metrics.avg_coherence || 0).toFixed(2)}, Accuracy=${parseFloat(metrics.avg_accuracy || 0).toFixed(2)}, Empathy=${parseFloat(metrics.avg_empathy || 0).toFixed(2)}, Responses=${metrics.total_responses}`);
      }
    } catch (err) {
      console.error('[SelfLearn] Metrics update error:', err.message);
    }
  }

  /**
   * Record user feedback for a conversation
   */
  async recordFeedback(conversationId, { thumbs, rating, comment }) {
    try {
      const db = pool;
      await db.query(`
        UPDATE sib_response_quality
        SET user_thumbs = $1,
            user_rating = $2,
            metadata = metadata || $3
        WHERE conversation_id = $4
      `, [
        thumbs,
        rating,
        JSON.stringify({ feedbackComment: comment, feedbackAt: new Date().toISOString() }),
        conversationId.toString()
      ]);
    } catch (err) {
      console.error('[SelfLearn] Feedback recording error:', err.message);
    }
  }
}

const selfLearningPipeline = new SelfLearningPipeline();
export default selfLearningPipeline;
