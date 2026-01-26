/**
 * Lab/Imaging Integration API Routes
 * Results viewer with abnormal flagging and patient notifications
 */

import express from 'express';
import { authDoctor } from '../middleware/doctor.middleware.js';
import LabResult from '../models/lab-result.model.js';
import { sendNotification } from '../services/notification.service.js';

const router = express.Router();

// Get Lab Results for Patient
router.get('/results/patient/:patientId', authDoctor, async (req, res) => {
  try {
    const { testType, hasAbnormal, status } = req.query;
    
    const where = { patientId: req.params.patientId };
    if (testType) where.testType = testType;
    if (hasAbnormal !== undefined) where.hasAbnormal = hasAbnormal === 'true';
    if (status) where.status = status;

    const results = await LabResult.findAll({
      where,
      order: [['orderedAt', 'DESC']],
      limit: 100
    });

    res.json({
      success: true,
      data: results,
      summary: {
        total: results.length,
        abnormal: results.filter(r => r.hasAbnormal).length,
        critical: results.filter(r => r.criticalValues?.length > 0).length,
        pendingReview: results.filter(r => r.status === 'completed' && !r.reviewedAt).length
      }
    });
  } catch (error) {
    console.error('Fetch lab results error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch results'
    });
  }
});

// Create Lab Order
router.post('/orders', authDoctor, async (req, res) => {
  try {
    const {
      patientId,
      testType,
      testName,
      testCode,
      category,
      priority,
      appointmentId
    } = req.body;

    const labResult = await LabResult.create({
      patientId,
      doctorId: req.doctor.id,
      testType,
      testName,
      testCode,
      category,
      priority: priority || 'routine',
      status: 'ordered',
      orderedAt: new Date(),
      appointmentId,
      results: []
    });

    res.json({
      success: true,
      data: labResult
    });
  } catch (error) {
    console.error('Create lab order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create lab order'
    });
  }
});

// Upload Lab Results (for lab integration)
router.post('/results/:id/upload', authDoctor, async (req, res) => {
  try {
    const {
      results,
      interpretation,
      reportPdfUrl,
      specimenQuality
    } = req.body;

    const labResult = await LabResult.findByPk(req.params.id);
    if (!labResult) {
      return res.status(404).json({
        success: false,
        message: 'Lab result not found'
      });
    }

    // Auto-detect abnormal values
    const abnormalParameters = results.filter(r => r.flag && r.flag !== 'N');
    const criticalValues = results.filter(r => r.flag === 'C' || r.flag === 'H' || r.flag === 'L');
    const hasAbnormal = abnormalParameters.length > 0;

    await labResult.update({
      results,
      interpretation,
      reportPdfUrl,
      specimenQuality,
      hasAbnormal,
      abnormalParameters,
      criticalValues,
      status: 'completed',
      resultedAt: new Date()
    });

    // Notify patient if critical
    if (criticalValues.length > 0) {
      await sendNotification({
        userId: labResult.patientId,
        type: 'critical_lab_result',
        title: 'Critical Lab Results Available',
        message: `Your ${labResult.testName} results require immediate attention. Please contact your doctor.`,
        priority: 'high'
      });

      await labResult.update({
        patientNotified: true,
        notifiedAt: new Date(),
        notificationMethod: 'app'
      });
    }

    res.json({
      success: true,
      data: labResult
    });
  } catch (error) {
    console.error('Upload results error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload results'
    });
  }
});

// Review Lab Results
router.post('/results/:id/review', authDoctor, async (req, res) => {
  try {
    const { reviewComments, requiresFollowUp, followUpNotes } = req.body;

    const labResult = await LabResult.findByPk(req.params.id);
    if (!labResult) {
      return res.status(404).json({
        success: false,
        message: 'Lab result not found'
      });
    }

    await labResult.update({
      reviewedBy: req.doctor.id,
      reviewedAt: new Date(),
      reviewComments,
      requiresFollowUp,
      followUpNotes,
      status: 'reviewed'
    });

    // Notify patient that results are ready
    if (!labResult.hasAbnormal) {
      await sendNotification({
        userId: labResult.patientId,
        type: 'lab_result_ready',
        title: 'Lab Results Ready',
        message: `Your ${labResult.testName} results are now available in your portal.`,
        priority: 'normal'
      });

      await labResult.update({
        patientNotified: true,
        notifiedAt: new Date(),
        notificationMethod: 'app'
      });
    }

    res.json({
      success: true,
      data: labResult
    });
  } catch (error) {
    console.error('Review result error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to review result'
    });
  }
});

// Get Pending Results Needing Review
router.get('/pending-review', authDoctor, async (req, res) => {
  try {
    const pendingResults = await LabResult.findAll({
      where: {
        doctorId: req.doctor.id,
        status: 'completed',
        reviewedAt: null
      },
      order: [
        ['priority', 'ASC'],
        ['resultedAt', 'ASC']
      ]
    });

    res.json({
      success: true,
      data: pendingResults,
      count: pendingResults.length
    });
  } catch (error) {
    console.error('Fetch pending results error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending results'
    });
  }
});

export default router;
