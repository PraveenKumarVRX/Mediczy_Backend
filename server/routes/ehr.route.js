/**
 * EHR (Electronic Health Records) Routes
 * Admin access to patient health records and integration with prescriptions
 */

import express from 'express';
import { EHRRecord, HealthDiary } from '../models/postgres/ehr.model.postgres.js';
import { Prescription, Report } from '../models/index.js';
import { authUser } from '../middleware/auth.middleware.js';
import { Op } from 'sequelize';

const router = express.Router();

/**
 * @route   GET /api/ehr/patient/:patientId
 * @desc    Get all EHR records for a patient (Admin/Doctor access)
 * @access  Private
 */
router.get('/patient/:patientId', authUser, async (req, res) => {
  try {
    const { patientId } = req.params;
    const { recordType, startDate, endDate, status } = req.query;
    
    // Check authorization - admin, doctor, or the patient themselves
    const userRole = req.user?.role || req.userRole;
    const userId = req.user?.id || req.user?.dataValues?.id || req.user?._id;
    
    if (userRole !== 'admin' && userRole !== 'doctor' && parseInt(patientId) !== parseInt(userId)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    // Build query
    const where = { patientId: parseInt(patientId), status: status || 'active' };
    if (recordType) where.recordType = recordType;
    if (startDate || endDate) {
      where.recordDate = {};
      if (startDate) where.recordDate[Op.gte] = startDate;
      if (endDate) where.recordDate[Op.lte] = endDate;
    }
    
    const records = await EHRRecord.findAll({
      where,
      order: [['recordDate', 'DESC'], ['createdAt', 'DESC']]
    });
    
    res.json({
      success: true,
      count: records.length,
      records
    });
  } catch (error) {
    console.error('Get EHR records error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch EHR records',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/ehr/record/:id
 * @desc    Get a single EHR record
 * @access  Private
 */
router.get('/record/:id', authUser, async (req, res) => {
  try {
    const { id } = req.params;
    
    const record = await EHRRecord.findByPk(id);
    if (!record) {
      return res.status(404).json({ success: false, message: 'Record not found' });
    }
    
    // Check authorization
    const userRole = req.user?.role || req.userRole;
    const userId = req.user?.id || req.user?.dataValues?.id || req.user?._id;
    
    if (userRole !== 'admin' && userRole !== 'doctor' && record.patientId !== parseInt(userId)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    res.json({
      success: true,
      record
    });
  } catch (error) {
    console.error('Get EHR record error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch record',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/ehr/summary/:patientId
 * @desc    Get EHR summary for a patient (counts by type)
 * @access  Private
 */
router.get('/summary/:patientId', authUser, async (req, res) => {
  try {
    const { patientId } = req.params;
    
    // Authorization check
    const userRole = req.user?.role || req.userRole;
    const userId = req.user?.id || req.user?.dataValues?.id || req.user?._id;
    
    if (userRole !== 'admin' && userRole !== 'doctor' && parseInt(patientId) !== parseInt(userId)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    const records = await EHRRecord.findAll({
      where: { patientId: parseInt(patientId), status: 'active' },
      attributes: ['recordType', 'recordDate']
    });
    
    // Group by type
    const summary = {
      total: records.length,
      byType: {},
      recentActivity: []
    };
    
    records.forEach(r => {
      summary.byType[r.recordType] = (summary.byType[r.recordType] || 0) + 1;
    });
    
    // Get recent 5 records
    const recentRecords = await EHRRecord.findAll({
      where: { patientId: parseInt(patientId), status: 'active' },
      order: [['createdAt', 'DESC']],
      limit: 5
    });
    
    summary.recentActivity = recentRecords.map(r => ({
      id: r.id,
      type: r.recordType,
      title: r.title,
      date: r.recordDate,
      doctor: r.doctorName
    }));
    
    res.json({
      success: true,
      summary
    });
  } catch (error) {
    console.error('Get EHR summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch summary',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/ehr/prescriptions/:patientId
 * @desc    Get all prescriptions in EHR format for a patient
 * @access  Private
 */
router.get('/prescriptions/:patientId', authUser, async (req, res) => {
  try {
    const { patientId } = req.params;
    
    // Authorization check
    const userRole = req.user?.role || req.userRole;
    const userId = req.user?.id || req.user?.dataValues?.id || req.user?._id;
    
    if (userRole !== 'admin' && userRole !== 'doctor' && parseInt(patientId) !== parseInt(userId)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    // Get prescriptions from both EHR and prescription tables
    const ehrPrescriptions = await EHRRecord.findAll({
      where: { 
        patientId: parseInt(patientId), 
        recordType: 'prescription',
        status: 'active'
      },
      order: [['recordDate', 'DESC']]
    });
    
    const directPrescriptions = await Prescription.findAll({
      where: { patientId: parseInt(patientId) },
      order: [['createdAt', 'DESC']]
    });
    
    res.json({
      success: true,
      ehrRecords: ehrPrescriptions,
      prescriptions: directPrescriptions
    });
  } catch (error) {
    console.error('Get EHR prescriptions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch prescriptions',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/ehr/record
 * @desc    Create a new EHR record (Admin/Doctor/Hospital)
 * @access  Private
 */
router.post('/record', authUser, async (req, res) => {
  try {
    const userRole = req.user?.role || req.userRole;
    const userType = req.user?.userType || req.user?.type;
    // Allow admin, doctor, and hospital users to create EHR records
    const isHospitalUser = userType === 'hospital' || userRole === 'hospital' || 
      ['hospital_admin', 'hospital_staff', 'hospital_doctor'].includes(userRole);
    if (userRole !== 'admin' && userRole !== 'doctor' && !isHospitalUser) {
      return res.status(403).json({ success: false, message: 'Admin, doctor, or hospital access required' });
    }
    
    const {
      patientId,
      recordType,
      recordDate,
      title,
      summary,
      details,
      doctorName,
      facility,
      confidential
    } = req.body;
    
    const doctorId = req.user?.id || req.user?.dataValues?.id;
    
    const record = await EHRRecord.create({
      patientId,
      recordType,
      recordDate: recordDate || new Date(),
      title,
      summary,
      details,
      doctorId,
      doctorName: doctorName || `${req.user?.firstName || ''} ${req.user?.lastName || ''}`.trim(),
      facility,
      confidential: confidential || false,
      status: 'active'
    });
    
    res.status(201).json({
      success: true,
      message: 'EHR record created',
      record
    });
  } catch (error) {
    console.error('Create EHR record error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create record',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/ehr/admin/stats
 * @desc    Get EHR statistics for admin dashboard
 * @access  Private (Admin)
 */
router.get('/admin/stats', authUser, async (req, res) => {
  try {
    const userRole = req.user?.role || req.userRole;
    if (userRole !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    
    const totalRecords = await EHRRecord.count({ where: { status: 'active' } });
    const prescriptionRecords = await EHRRecord.count({ 
      where: { status: 'active', recordType: 'prescription' } 
    });
    
    // Records by type
    const allRecords = await EHRRecord.findAll({
      where: { status: 'active' },
      attributes: ['recordType']
    });
    
    const byType = {};
    allRecords.forEach(r => {
      byType[r.recordType] = (byType[r.recordType] || 0) + 1;
    });
    
    // Recent records
    const recentRecords = await EHRRecord.findAll({
      where: { status: 'active' },
      order: [['createdAt', 'DESC']],
      limit: 10
    });
    
    res.json({
      success: true,
      stats: {
        totalRecords,
        prescriptionRecords,
        byType,
        recentRecords: recentRecords.map(r => ({
          id: r.id,
          patientId: r.patientId,
          type: r.recordType,
          title: r.title,
          date: r.recordDate,
          doctor: r.doctorName
        }))
      }
    });
  } catch (error) {
    console.error('Get EHR stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch stats',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/ehr/reports/:patientId
 * @desc    Get all medical reports for a patient (for EHR dashboard)
 * @access  Private (Admin/Doctor or the patient themselves)
 */
router.get('/reports/:patientId', authUser, async (req, res) => {
  try {
    const { patientId } = req.params;
    const { type, status = 'active' } = req.query;

    // Authorization check
    const userRole = req.user?.role || req.userRole;
    const userId = req.user?.id || req.user?.dataValues?.id || req.user?._id;

    if (userRole !== 'admin' && userRole !== 'doctor' && parseInt(patientId) !== parseInt(userId)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const where = { userId: parseInt(patientId), status: status || 'active' };
    if (type && ['lab', 'imaging', 'prescription', 'general'].includes(type)) {
      where.reportType = type;
    }

    const reports = await Report.findAll({
      where,
      order: [['uploadedAt', 'DESC']],
      attributes: [
        'id', 'fileName', 'fileSize', 'mimeType', 'reportType',
        'description', 'testName', 'labName', 'reportDate',
        'analysisStatus', 'aiAnalysis', 'status', 'uploadedAt', 'createdAt'
      ]
    });

    res.json({
      success: true,
      count: reports.length,
      reports: reports.map(r => ({
        id: r.id,
        fileName: r.fileName,
        fileSize: r.fileSize,
        mimeType: r.mimeType,
        reportType: r.reportType,
        description: r.description,
        testName: r.testName,
        labName: r.labName,
        reportDate: r.reportDate,
        analysisStatus: r.analysisStatus,
        aiSummary: r.aiAnalysis?.summary || null,
        aiCategory: r.aiAnalysis?.reportCategory || null,
        keyFindings: r.aiAnalysis?.keyFindings || [],
        uploadedAt: r.uploadedAt,
        createdAt: r.createdAt
      }))
    });
  } catch (error) {
    console.error('Get EHR reports error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reports',
      error: error.message
    });
  }
});

export default router;
