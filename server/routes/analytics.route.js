/**
 * Conversation Analytics Controller
 * Endpoints for conversation analytics, health diary, and reporting
 * These endpoints are protected and require user authentication
 */

import express from 'express';
import conversationAnalyticsService from '../services/conversation-analytics.service.js';
import { authenticateToken } from '../middleware/authentication.js';
import logger from '../logger.js';

const router = express.Router();

/**
 * POST /api/analytics/user-conversation-report
 * Get comprehensive conversation report for a user
 * Query params: startDate, endDate, category
 */
router.get('/user-conversation-report', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { startDate, endDate, category } = req.query;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const report = await conversationAnalyticsService.getUserConversationReport(userId, {
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      category
    });

    res.json({
      status: 'success',
      data: report
    });
  } catch (error) {
    logger.error('❌ Error fetching conversation report:', error);
    res.status(500).json({ 
      status: 'error',
      message: 'Failed to fetch conversation report',
      error: error.message 
    });
  }
});

/**
 * GET /api/analytics/health-diary
 * Get health diary entries extracted from conversations
 * Query params: startDate, endDate
 */
router.get('/health-diary', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { startDate, endDate } = req.query;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const healthDiary = await conversationAnalyticsService.getUserHealthDiary(userId, {
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      includeKeywords: true
    });

    res.json({
      status: 'success',
      data: healthDiary
    });
  } catch (error) {
    logger.error('❌ Error fetching health diary:', error);
    res.status(500).json({ 
      status: 'error',
      message: 'Failed to fetch health diary',
      error: error.message 
    });
  }
});

/**
 * GET /api/analytics/health-diary/summary
 * Get summarized health diary metrics (for dashboard)
 */
router.get('/health-diary/summary', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Get past 30 days of health data
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const healthDiary = await conversationAnalyticsService.getUserHealthDiary(userId, {
      startDate,
      includeKeywords: true
    });

    res.json({
      status: 'success',
      data: {
        userId,
        period: '30 days',
        metrics: {
          totalEntries: healthDiary.totalEntries,
          sentimentBreakdown: healthDiary.sentimentBreakdown,
          topKeywords: healthDiary.topKeywords
        }
      }
    });
  } catch (error) {
    logger.error('❌ Error fetching health diary summary:', error);
    res.status(500).json({ 
      status: 'error',
      message: 'Failed to fetch health diary summary',
      error: error.message 
    });
  }
});

/**
 * GET /api/analytics/dashboard
 * Get dashboard metrics for analytics/health overview
 */
router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const metrics = await conversationAnalyticsService.getUserDashboardMetrics(userId);

    res.json({
      status: 'success',
      data: metrics
    });
  } catch (error) {
    logger.error('❌ Error fetching dashboard metrics:', error);
    res.status(500).json({ 
      status: 'error',
      message: 'Failed to fetch dashboard metrics',
      error: error.message 
    });
  }
});

/**
 * GET /api/analytics/conversation-stats/:userId2
 * Get statistics for conversation between two users
 * Admin or self-serve access
 */
router.get('/pairwise-stats/:userId2', authenticateToken, async (req, res) => {
  try {
    const userId1 = req.user?.id || req.userId;
    const userId2 = parseInt(req.params.userId2);

    if (!userId1) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Security: Users can only view their own pairwise stats (or admins)
    if (userId1 !== userId2 && !req.user?.roles?.includes('admin')) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    const stats = await conversationAnalyticsService.getPairwiseConversationStats(userId1, userId2);

    res.json({
      status: 'success',
      data: stats
    });
  } catch (error) {
    logger.error('❌ Error fetching pairwise stats:', error);
    res.status(500).json({ 
      status: 'error',
      message: 'Failed to fetch pairwise statistics',
      error: error.message 
    });
  }
});

/**
 * POST /api/analytics/archive-old
 * Archive conversations older than specified days
 * ADMIN ONLY - For data retention/compliance
 */
router.post('/archive-old', authenticateToken, async (req, res) => {
  try {
    // Check admin role
    if (!req.user?.roles?.includes('admin')) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { olderThanDays = 90 } = req.body;

    if (olderThanDays < 30) {
      return res.status(400).json({ 
        error: 'Cannot archive conversations younger than 30 days'
      });
    }

    const result = await conversationAnalyticsService.archiveOldConversations(olderThanDays);

    logger.info(`✅ Admin ${req.user?.id} archived ${result.archived} conversations`);

    res.json({
      status: 'success',
      data: result
    });
  } catch (error) {
    logger.error('❌ Error archiving conversations:', error);
    res.status(500).json({ 
      status: 'error',
      message: 'Failed to archive conversations',
      error: error.message 
    });
  }
});

/**
 * GET /api/analytics/conversation-export
 * Export user's conversations in bulk
 * For HIPAA/compliance - exports as JSON for backup
 */
router.get('/conversation-export', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { format = 'json' } = req.query;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Get all conversation data
    const report = await conversationAnalyticsService.getUserConversationReport(userId);
    const healthDiary = await conversationAnalyticsService.getUserHealthDiary(userId);

    const exportData = {
      exportedAt: new Date().toISOString(),
      userId,
      conversationReport: report,
      healthDiary: healthDiary
    };

    if (format === 'csv') {
      // TODO: Implement CSV export
      res.json({ status: 'error', message: 'CSV export not yet implemented' });
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="conversations-${userId}-${Date.now()}.json"`);
      res.json(exportData);
    }
  } catch (error) {
    logger.error('❌ Error exporting conversations:', error);
    res.status(500).json({ 
      status: 'error',
      message: 'Failed to export conversations',
      error: error.message 
    });
  }
});

export default router;
