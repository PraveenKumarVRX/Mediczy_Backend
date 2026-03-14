import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import Report from '../models/postgres/report.model.postgres.js';
import { analyzeReport, analyzeAllPending, getPatientLabValues } from '../services/report-analysis.service.js';

const router = express.Router();

/**
 * @route   POST /api/reports/:reportId/analyze
 * @desc    AI-analyze an uploaded medical report (PDF or image)
 * @access  Private (report owner)
 */
router.post('/:reportId/analyze', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const reportId = parseInt(req.params.reportId, 10);
    const force = req.query.force === 'true';

    if (isNaN(reportId)) {
      return res.status(400).json({ success: false, message: 'Invalid report ID' });
    }

    console.log(`[ReportAnalysis] User ${userId} analyzing report ${reportId} (force=${force})`);

    const result = await analyzeReport(reportId, userId, { force });

    res.json({
      success: true,
      cached: result.cached || false,
      message: result.cached ? 'Analysis retrieved from cache' : 'Report analyzed successfully',
      analysis: result.analysis
    });

  } catch (error) {
    console.error('❌ Report analysis error:', error);
    const status = error.statusCode || 500;
    res.status(status).json({
      success: false,
      message: error.message || 'Failed to analyze report'
    });
  }
});

/**
 * @route   POST /api/reports/analyze-all
 * @desc    Analyze all pending reports for the current user
 * @access  Private
 */
router.post('/analyze-all', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    console.log(`[ReportAnalysis] User ${userId} — bulk analyze all pending`);

    const results = await analyzeAllPending(userId);

    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    res.json({
      success: true,
      message: `Analyzed ${succeeded} reports (${failed} failed)`,
      total: results.length,
      succeeded,
      failed,
      results
    });

  } catch (error) {
    console.error('❌ Bulk analysis error:', error);
    res.status(500).json({
      success: false,
      message: 'Bulk analysis failed',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/reports/:reportId/analysis
 * @desc    Get analysis for a specific report
 * @access  Private (report owner)
 */
router.get('/:reportId/analysis', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const reportId = parseInt(req.params.reportId, 10);

    if (isNaN(reportId)) {
      return res.status(400).json({ success: false, message: 'Invalid report ID' });
    }

    const report = await Report.findOne({
      where: { id: reportId, userId, status: 'active' }
    });

    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    if (!report.aiAnalysis || report.analysisStatus !== 'completed') {
      return res.status(404).json({
        success: false,
        message: 'No analysis available — analyze the report first',
        analysisStatus: report.analysisStatus || 'pending'
      });
    }

    res.json({
      success: true,
      analysis: report.aiAnalysis,
      analysisStatus: report.analysisStatus,
      analyzedAt: report.aiAnalysis?.analyzedAt
    });

  } catch (error) {
    console.error('❌ Analysis retrieval error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve analysis' });
  }
});

/**
 * @route   GET /api/reports/lab-values
 * @desc    Get all extracted lab values for the current user (for HRA dashboard)
 * @access  Private
 */
router.get('/lab-values', authUser, async (req, res) => {
  try {
    const labValues = await getPatientLabValues(req.user.id);

    res.json({
      success: true,
      count: labValues.length,
      labValues
    });

  } catch (error) {
    console.error('❌ Lab values retrieval error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve lab values' });
  }
});

export default router;
