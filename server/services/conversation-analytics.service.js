/**
 * Conversation Analytics Service
 * Provides analytics, reporting, and health diary features
 * for user conversations
 */

import { postgresSequelize as sequelize } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';
import logger from '../logger.js';

class ConversationAnalyticsService {
  /**
   * Get comprehensive user conversation report
   * @param {number} userId - User ID
   * @param {object} options - Filter options (startDate, endDate, category)
   * @returns {Promise<object>} Conversation report with statistics
   */
  async getUserConversationReport(userId, options = {}) {
    try {
      const { startDate = null, endDate = null, category = null } = options;

      const query = `
        SELECT 
          cc.id,
          cc.conversation_id,
          cc.category,
          cc.user_id_1,
          cc.user_id_2,
          cc.created_at,
          cc.updated_at,
          cc.last_message_at,
          cc.message_count,
          COUNT(cm.id) as message_count_actual,
          MAX(cm.created_at) as latest_message_date,
          ARRAY_AGG(DISTINCT cm.channel) FILTER (WHERE cm.channel IS NOT NULL) as channels_used,
          COUNT(CASE WHEN cm.health_sentiment IS NOT NULL THEN 1 END) as health_messages
        FROM chat_conversations cc
        LEFT JOIN chat_messages cm ON cc.id = cm.conversation_id
        WHERE (cc.user_id_1 = $1 OR cc.user_id_2 = $1)
          AND cc.is_archived = false
          ${startDate ? 'AND cc.created_at >= $2' : ''}
          ${endDate ? 'AND cc.created_at <= $3' : ''}
          ${category ? 'AND cc.category = $4' : ''}
        GROUP BY cc.id
        ORDER BY cc.last_message_at DESC
      `;

      const params = [userId];
      if (startDate) params.push(startDate);
      if (endDate) params.push(endDate);
      if (category) params.push(category);

      const conversations = await sequelize.query(query, {
        replacements: params.slice(0, typeof params[3] !== 'undefined' ? 4 : params.length),
        type: QueryTypes.SELECT
      });

      const totalMessages = conversations.reduce((sum, conv) => sum + (conv.message_count_actual || 0), 0);
      const avgConversationLength = conversations.length > 0 ? 
        Math.round(totalMessages / conversations.length) : 0;

      return {
        userId,
        period: { startDate, endDate },
        summary: {
          totalConversations: conversations.length,
          totalMessages,
          averageMessagesPerConversation: avgConversationLength,
          categoriesUsed: [...new Set(conversations.map(c => c.category).filter(c => c))],
          channelsUsed: conversations
            .flatMap(c => c.channels_used || [])
            .filter(Boolean)
            .reduce((acc, ch) => {
              acc[ch] = (acc[ch] || 0) + 1;
              return acc;
            }, {}),
          healthRelatedConversations: conversations.filter(c => c.health_messages > 0).length
        },
        conversations: conversations.map(conv => ({
          conversationId: conv.conversation_id,
          category: conv.category,
          withUserId: conv.user_id_1 === userId ? conv.user_id_2 : conv.user_id_1,
          messageCount: conv.message_count_actual || 0,
          healthMessages: conv.health_messages || 0,
          startedAt: conv.created_at,
          lastMessageAt: conv.latest_message_date,
          channels: conv.channels_used || []
        }))
      };
    } catch (error) {
      logger.error('🔴 Error getting conversation report:', error);
      throw error;
    }
  }

  /**
   * Get health diary entries from conversations
   * Extracts health-related messages and insights
   * @param {number} userId - User ID
   * @param {object} options - Filter options
   * @returns {Promise<object>} Health diary data
   */
  async getUserHealthDiary(userId, options = {}) {
    try {
      const { startDate = null, endDate = null, includeKeywords = true } = options;

      const query = `
        SELECT 
          cm.id as message_id,
          cm.conversation_id,
          cm.sender_id,
          cm.recipient_id,
          cm.content,
          cm.health_keywords,
          cm.health_sentiment,
          cm.message_type,
          cm.channel,
          cm.created_at,
          cc.category as conversation_category
        FROM chat_messages cm
        LEFT JOIN chat_conversations cc ON cm.conversation_id = cc.id
        WHERE (cm.sender_id = $1 OR cm.recipient_id = $1)
          AND (cm.health_keywords IS NOT NULL OR cm.health_sentiment IS NOT NULL)
          ${startDate ? 'AND cm.created_at >= $2' : ''}
          ${endDate ? 'AND cm.created_at <= $3' : ''}
        ORDER BY cm.created_at DESC
      `;

      const params = [userId];
      if (startDate) params.push(startDate);
      if (endDate) params.push(endDate);

      const healthMessages = await sequelize.query(query, {
        replacements: params.slice(0, typeof params[2] !== 'undefined' ? 3 : 1),
        type: QueryTypes.SELECT
      });

      // Aggregate health insights
      const sentiments = healthMessages.map(m => m.health_sentiment).filter(Boolean);
      const allKeywords = [];
      healthMessages.forEach(m => {
        if (m.health_keywords && Array.isArray(m.health_keywords)) {
          allKeywords.push(...m.health_keywords);
        } else if (m.health_keywords && typeof m.health_keywords === 'object') {
          allKeywords.push(...Object.values(m.health_keywords).flat());
        }
      });

      const keywordCounts = {};
      allKeywords.forEach(keyword => {
        keywordCounts[keyword] = (keywordCounts[keyword] || 0) + 1;
      });

      return {
        userId,
        totalEntries: healthMessages.length,
        period: { startDate, endDate },
        sentimentBreakdown: {
          positive: sentiments.filter(s => s === 'positive').length,
          neutral: sentiments.filter(s => s === 'neutral').length,
          negative: sentiments.filter(s => s === 'negative').length
        },
        topKeywords: Object.entries(keywordCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([keyword, count]) => ({ keyword, count })),
        entries: healthMessages.map(msg => ({
          date: msg.created_at,
          type: msg.message_type,
          sentiment: msg.health_sentiment,
          keywords: msg.health_keywords,
          content: msg.content.substring(0, 200), // Preview
          channel: msg.channel,
          conversationCategory: msg.conversation_category,
          withUserId: msg.sender_id === userId ? msg.recipient_id : msg.sender_id
        }))
      };
    } catch (error) {
      logger.error('🔴 Error getting health diary:', error);
      throw error;
    }
  }

  /**
   * Get conversation metrics for analytics dashboard
   * @param {number} userId - User ID
   * @returns {Promise<object>} Dashboard metrics
   */
  async getUserDashboardMetrics(userId) {
    try {
      const query = `
        SELECT 
          (SELECT COUNT(*) FROM chat_conversations 
           WHERE (user_id_1 = $1 OR user_id_2 = $1) 
             AND is_archived = false) as active_conversations,
          (SELECT COUNT(*) FROM chat_conversations 
           WHERE (user_id_1 = $1 OR user_id_2 = $1) 
             AND created_at >= NOW() - INTERVAL '7 days'
             AND is_archived = false) as conversations_this_week,
          (SELECT COUNT(*) FROM chat_conversations 
           WHERE (user_id_1 = $1 OR user_id_2 = $1) 
             AND created_at >= NOW() - INTERVAL '30 days'
             AND is_archived = false) as conversations_this_month,
          (SELECT COUNT(*) FROM chat_messages 
           WHERE (sender_id = $1 OR recipient_id = $1)
             AND created_at >= NOW() - INTERVAL '7 days') as messages_this_week,
          (SELECT AVG(message_count) FROM chat_conversations 
           WHERE (user_id_1 = $1 OR user_id_2 = $1)
             AND message_count > 0) as avg_conversation_length,
          (SELECT COUNT(DISTINCT channel) FROM chat_messages 
           WHERE (sender_id = $1 OR recipient_id = $1)) as communication_channels,
          (SELECT COUNT(*) FROM chat_conversations 
           WHERE (user_id_1 = $1 OR user_id_2 = $1)
             AND health_context IS NOT NULL
             AND is_archived = false) as conversations_with_health_context,
          (SELECT MAX(created_at) FROM chat_messages 
           WHERE (sender_id = $1 OR recipient_id = $1)) as last_message_at
      `;

      const [metrics] = await sequelize.query(query, {
        replacements: [userId],
        type: QueryTypes.SELECT
      });

      return {
        userId,
        activeConversations: metrics.active_conversations || 0,
        thisWeek: metrics.conversations_this_week || 0,
        thisMonth: metrics.conversations_this_month || 0,
        messagesThisWeek: metrics.messages_this_week || 0,
        averageConversationLength: Math.round(metrics.avg_conversation_length || 0),
        communicationChannels: metrics.communication_channels || 0,
        healthContextConversations: metrics.conversations_with_health_context || 0,
        lastActivityAt: metrics.last_message_at
      };
    } catch (error) {
      logger.error('🔴 Error getting dashboard metrics:', error);
      throw error;
    }
  }

  /**
   * Archive old conversations (compliance/retention)
   * @param {number} olderThanDays - Archive conversations older than N days
   * @returns {Promise<object>} Archive results
   */
  async archiveOldConversations(olderThanDays = 90) {
    try {
      const query = `
        UPDATE chat_conversations
        SET is_archived = true,
            archived_at = NOW()
        WHERE last_message_at < NOW() - INTERVAL '${olderThanDays} days'
          AND is_archived = false
        RETURNING id, conversation_id, archived_at
      `;

      const archivedConvs = await sequelize.query(query, {
        type: QueryTypes.SELECT
      });

      logger.info(`📦 Archived ${archivedConvs.length} conversations older than ${olderThanDays} days`);

      return {
        archived: archivedConvs.length,
        timestamp: new Date(),
        olderThanDays
      };
    } catch (error) {
      logger.error('🔴 Error archiving conversations:', error);
      throw error;
    }
  }

  /**
   * Get conversation statistics between two users
   * @param {number} userId1 - First user ID
   * @param {number} userId2 - Second user ID
   * @returns {Promise<object>} Pairwise statistics
   */
  async getPairwiseConversationStats(userId1, userId2) {
    try {
      const query = `
        SELECT 
          cc.id,
          cc.conversation_id,
          cc.category,
          cc.created_at,
          CC.updated_at,
          cc.last_message_at,
          COUNT(cm.id) as total_messages,
          COUNT(CASE WHEN cm.sender_id = $1 THEN 1 END) as messages_from_user1,
          COUNT(CASE WHEN cm.sender_id = $2 THEN 1 END) as messages_from_user2,
          COUNT(CASE WHEN cm.health_sentiment IS NOT NULL THEN 1 END) as health_related,
          AVG(EXTRACT(EPOCH FROM (cm.read_at - cm.created_at))) as avg_read_time_seconds
        FROM chat_conversations cc
        LEFT JOIN chat_messages cm ON cc.id = cm.conversation_id
        WHERE (cc.user_id_1 = $1 AND cc.user_id_2 = $2)
           OR (cc.user_id_1 = $2 AND cc.user_id_2 = $1)
        GROUP BY cc.id
        ORDER BY cc.last_message_at DESC
      `;

      const stats = await sequelize.query(query, {
        replacements: [userId1, userId2],
        type: QueryTypes.SELECT
      });

      return {
        betweenUsers: [userId1, userId2],
        totalConversations: stats.length,
        aggregated: stats.reduce((acc, stat) => ({
          totalMessages: (acc.totalMessages || 0) + stat.total_messages,
          messagesFromUser1: (acc.messagesFromUser1 || 0) + stat.messages_from_user1,
          messagesFromUser2: (acc.messagesFromUser2 || 0) + stat.messages_from_user2,
          healthRelatedMessages: (acc.healthRelatedMessages || 0) + stat.health_related,
          avgReadTimeSeconds: stat.avg_read_time_seconds ? 
            Math.round(stat.avg_read_time_seconds) : null
        }), {}),
        conversations: stats
      };
    } catch (error) {
      logger.error('🔴 Error getting pairwise stats:', error);
      throw error;
    }
  }
}

export default new ConversationAnalyticsService();
