/**
 * Health Diary Routes
 * Patient health journal with linked prescriptions and EHR records
 */

import express from 'express';
import { HealthDiary, EHRRecord } from '../models/postgres/ehr.model.postgres.js';
import { Prescription } from '../models/index.js';
import { authUser } from '../middleware/auth.middleware.js';
import { Op } from 'sequelize';

const router = express.Router();

/**
 * @route   GET /api/health-diary
 * @desc    Get health diary entries for logged-in user
 * @access  Private
 */
router.get('/', authUser, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.dataValues?.id || req.user?._id;
    const { entryType, startDate, endDate, limit = 50 } = req.query;
    
    const where = { userId: parseInt(userId) };
    if (entryType) where.entryType = entryType;
    if (startDate || endDate) {
      where.entryDate = {};
      if (startDate) where.entryDate[Op.gte] = startDate;
      if (endDate) where.entryDate[Op.lte] = endDate;
    }
    
    const entries = await HealthDiary.findAll({
      where,
      order: [['entryDate', 'DESC'], ['createdAt', 'DESC']],
      limit: parseInt(limit)
    });
    
    res.json({
      success: true,
      count: entries.length,
      entries
    });
  } catch (error) {
    console.error('Get health diary error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch diary entries',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/health-diary/prescriptions
 * @desc    Get prescription-related diary entries
 * @access  Private
 */
router.get('/prescriptions', authUser, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.dataValues?.id || req.user?._id;
    
    // Get prescription diary entries
    const diaryEntries = await HealthDiary.findAll({
      where: { 
        userId: parseInt(userId),
        entryType: { [Op.in]: ['prescription', 'medication'] }
      },
      order: [['entryDate', 'DESC']]
    });
    
    // Get actual prescriptions
    const prescriptions = await Prescription.findAll({
      where: { patientId: parseInt(userId) },
      order: [['createdAt', 'DESC']]
    });
    
    res.json({
      success: true,
      diaryEntries,
      prescriptions
    });
  } catch (error) {
    console.error('Get prescription diary error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch prescription entries',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/health-diary/summary
 * @desc    Get health diary summary for dashboard
 * @access  Private
 */
router.get('/summary', authUser, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.dataValues?.id || req.user?._id;
    const { days = 30 } = req.query;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    
    const entries = await HealthDiary.findAll({
      where: {
        userId: parseInt(userId),
        entryDate: { [Op.gte]: startDate.toISOString().split('T')[0] }
      }
    });
    
    // Group by type
    const byType = {};
    const byDate = {};
    
    entries.forEach(e => {
      byType[e.entryType] = (byType[e.entryType] || 0) + 1;
      byDate[e.entryDate] = (byDate[e.entryDate] || 0) + 1;
    });
    
    // Get active medications
    const activeMeds = await HealthDiary.findAll({
      where: {
        userId: parseInt(userId),
        entryType: 'medication'
      },
      order: [['createdAt', 'DESC']],
      limit: 10
    });
    
    // Get recent prescriptions
    const recentPrescriptions = await Prescription.findAll({
      where: { patientId: parseInt(userId) },
      order: [['createdAt', 'DESC']],
      limit: 5
    });
    
    res.json({
      success: true,
      summary: {
        totalEntries: entries.length,
        byType,
        byDate,
        activeMedications: activeMeds.map(m => ({
          id: m.id,
          name: m.title,
          data: m.data,
          date: m.entryDate
        })),
        recentPrescriptions: recentPrescriptions.map(p => ({
          id: p.id,
          number: p.prescriptionId,
          diagnosis: p.diagnosis,
          doctor: p.doctorName,
          date: p.createdAt,
          status: p.status
        }))
      }
    });
  } catch (error) {
    console.error('Get diary summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch summary',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/health-diary
 * @desc    Create a new diary entry
 * @access  Private
 */
router.post('/', authUser, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.dataValues?.id || req.user?._id;
    
    const {
      entryDate,
      entryType,
      title,
      description,
      data,
      mood,
      severity,
      tags,
      isPrivate
    } = req.body;
    
    const entry = await HealthDiary.create({
      userId: parseInt(userId),
      entryDate: entryDate || new Date(),
      entryType: entryType || 'note',
      title,
      description,
      data,
      mood,
      severity,
      tags: tags || [],
      isPrivate: isPrivate || false
    });
    
    res.status(201).json({
      success: true,
      message: 'Diary entry created',
      entry
    });
  } catch (error) {
    console.error('Create diary entry error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create entry',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/health-diary/:id
 * @desc    Update a diary entry
 * @access  Private
 */
router.put('/:id', authUser, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || req.user?.dataValues?.id || req.user?._id;
    
    const entry = await HealthDiary.findByPk(id);
    if (!entry) {
      return res.status(404).json({ success: false, message: 'Entry not found' });
    }
    
    if (entry.userId !== parseInt(userId)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    const {
      title,
      description,
      data,
      mood,
      severity,
      tags,
      isPrivate
    } = req.body;
    
    await entry.update({
      title: title !== undefined ? title : entry.title,
      description: description !== undefined ? description : entry.description,
      data: data !== undefined ? data : entry.data,
      mood: mood !== undefined ? mood : entry.mood,
      severity: severity !== undefined ? severity : entry.severity,
      tags: tags !== undefined ? tags : entry.tags,
      isPrivate: isPrivate !== undefined ? isPrivate : entry.isPrivate
    });
    
    res.json({
      success: true,
      message: 'Entry updated',
      entry
    });
  } catch (error) {
    console.error('Update diary entry error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update entry',
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/health-diary/:id
 * @desc    Delete a diary entry
 * @access  Private
 */
router.delete('/:id', authUser, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || req.user?.dataValues?.id || req.user?._id;
    
    const entry = await HealthDiary.findByPk(id);
    if (!entry) {
      return res.status(404).json({ success: false, message: 'Entry not found' });
    }
    
    if (entry.userId !== parseInt(userId)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    await entry.destroy();
    
    res.json({
      success: true,
      message: 'Entry deleted'
    });
  } catch (error) {
    console.error('Delete diary entry error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete entry',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/health-diary/log-medication
 * @desc    Quick log a medication taken
 * @access  Private
 */
router.post('/log-medication', authUser, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.dataValues?.id || req.user?._id;
    
    const { medicationName, dosage, prescriptionId, notes } = req.body;
    
    const entry = await HealthDiary.create({
      userId: parseInt(userId),
      entryDate: new Date(),
      entryType: 'medication',
      title: `Took ${medicationName}`,
      description: notes || `Dosage: ${dosage}`,
      data: {
        medicationName,
        dosage,
        takenAt: new Date().toISOString(),
        prescriptionId
      },
      linkedRecordId: prescriptionId,
      linkedRecordType: prescriptionId ? 'prescription' : null,
      tags: ['medication-log']
    });
    
    res.status(201).json({
      success: true,
      message: 'Medication logged',
      entry
    });
  } catch (error) {
    console.error('Log medication error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to log medication',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/health-diary/log-symptom
 * @desc    Quick log a symptom
 * @access  Private
 */
router.post('/log-symptom', authUser, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.dataValues?.id || req.user?._id;
    
    const { symptom, severity, description, prescriptionId } = req.body;
    
    const entry = await HealthDiary.create({
      userId: parseInt(userId),
      entryDate: new Date(),
      entryType: 'symptom',
      title: symptom,
      description,
      severity: severity || 3,
      data: {
        symptom,
        reportedAt: new Date().toISOString()
      },
      linkedRecordId: prescriptionId,
      linkedRecordType: prescriptionId ? 'prescription' : null,
      tags: ['symptom']
    });
    
    res.status(201).json({
      success: true,
      message: 'Symptom logged',
      entry
    });
  } catch (error) {
    console.error('Log symptom error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to log symptom',
      error: error.message
    });
  }
});

export default router;
