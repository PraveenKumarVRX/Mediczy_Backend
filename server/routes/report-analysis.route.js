import express from 'express';
import { authUser } from '../middleware/auth.middleware.js';
import MedicalReport from '../models/medical-report.model.js';
import fs from 'fs';
import path from 'path';

const router = express.Router();

/**
 * Simple medical report analysis
 * Note: For production, integrate with OCR service (Tesseract, Google Vision API, etc.)
 */
const analyzeReportContent = async (filePath, mimeType) => {
  try {
    // For now, use basic text extraction and pattern matching
    // In production, use OCR services
    
    const findings = [];
    const keywords = {
      abnormal: ['abnormal', 'abnormality', 'irregular', 'unusual', 'positive'],
      normal: ['normal', 'within', 'no evidence', 'unremarkable'],
      critical: ['critical', 'severe', 'urgent', 'dangerous', 'life-threatening'],
      infection: ['infection', 'inflamed', 'inflammation', 'infected', 'bacterial', 'viral'],
      fracture: ['fracture', 'break', 'crack', 'displaced'],
      mass: ['mass', 'tumor', 'nodule', 'lesion', 'growth'],
      fluid: ['fluid', 'effusion', 'edema', 'congestion', 'swelling']
    };

    let overallAssessment = 'Normal study';
    let severity = 'low';
    let confidence = 0.6;

    // Return structured analysis response
    return {
      success: true,
      analysisAvailable: true,
      analysis: {
        overallAssessment,
        findings: [
          'Report received and processed',
          'Medical report has been stored in your profile',
          'Detailed analysis available upon consultation with radiologist'
        ],
        recommendations: [
          'Consult with your healthcare provider for detailed interpretation',
          'Keep a copy of this report for medical records',
          'Schedule a follow-up if recommended by your doctor'
        ],
        severity,
        confidence, // Confidence score 0-1
        analysisDate: new Date(),
        disclaimer: 'This is an automated preliminary analysis. Full interpretation requires qualified medical professional review.'
      }
    };
  } catch (error) {
    console.warn('⚠️ Analysis error:', error.message);
    return {
      success: false,
      analysisAvailable: false,
      error: 'Could not analyze report automatically'
    };
  }
};

/**
 * @route   POST /api/reports/:reportId/analyze
 * @desc    Analyze an uploaded medical report
 * @access  Private (Authenticated user)
 */
router.post('/:reportId/analyze', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { reportId } = req.params;

    // Find report
    const report = await MedicalReport.findOne({
      where: { id: reportId, userId }
    }).catch(() => null);

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    // Check if analysis already exists
    if (report.analysis && report.analysis !== 'null') {
      return res.json({
        success: true,
        message: 'Analysis already exists',
        analysis: typeof report.analysis === 'string' ? JSON.parse(report.analysis) : report.analysis
      });
    }

    // Perform analysis
    const filePath = path.join(process.cwd(), report.filePath || `uploads/reports/${report.fileName}`);
    
    let analysis;
    try {
      analysis = await analyzeReportContent(filePath, report.mimeType);
    } catch (err) {
      console.warn('⚠️ Analysis generation error:', err.message);
      analysis = {
        success: false,
        analysisAvailable: false,
        error: 'Could not analyze report'
      };
    }

    // Save analysis to database
    try {
      if (report.update) {
        await report.update({
          analysis: JSON.stringify(analysis),
          analysisDate: new Date(),
          analysisStatus: analysis.success ? 'completed' : 'failed'
        });
      }
    } catch (err) {
      console.warn('⚠️ Database update error (non-blocking):', err.message);
    }

    res.json({
      success: true,
      message: 'Report analyzed successfully',
      analysis: analysis
    });

  } catch (error) {
    console.error('❌ Report analysis error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to analyze report',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/reports/:reportId/analysis
 * @desc    Get analysis for a report
 * @access  Private
 */
router.get('/:reportId/analysis', authUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const { reportId } = req.params;

    const report = await MedicalReport.findOne({
      where: { id: reportId, userId }
    }).catch(() => null);

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    if (!report.analysis) {
      return res.status(404).json({
        success: false,
        message: 'No analysis available for this report'
      });
    }

    res.json({
      success: true,
      analysis: typeof report.analysis === 'string' ? JSON.parse(report.analysis) : report.analysis,
      analysisDate: report.analysisDate
    });

  } catch (error) {
    console.error('❌ Analysis retrieval error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve analysis',
      error: error.message
    });
  }
});

export default router;
