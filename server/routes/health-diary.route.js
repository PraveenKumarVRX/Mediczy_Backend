/**
 * Health Diary Routes
 * Patient health journal with linked prescriptions and EHR records
 */

import express from 'express';
import { HealthDiary, EHRRecord } from '../models/postgres/ehr.model.postgres.js';
import { authUser } from '../middleware/auth.middleware.js';
import { Op } from 'sequelize';
import healthDiaryService from '../services/health-diary.service.js';
import * as prescriptionRepository from '../repositories/prescription.repository.js';

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
    const prescriptions = await prescriptionRepository.findAllForPatient(req, userId);
    
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
    const recentPrescriptions = await prescriptionRepository.findAllForPatient(req, userId, { limit: 5 });
    
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

/**
 * @route   GET /api/health-diary/sources
 * @desc    Return status of all auto-logging data sources
 * @access  Private
 */
router.get('/sources', authUser, async (req, res) => {
  try {
    const userId = parseInt(req.user?.id || req.user?.dataValues?.id || req.user?._id);

    // Count diary entries per source type
    const typeCounts = await HealthDiary.findAll({
      where: { userId },
      attributes: ['entryType', [HealthDiary.sequelize.fn('COUNT', HealthDiary.sequelize.col('id')), 'count'],
        [HealthDiary.sequelize.fn('MAX', HealthDiary.sequelize.col('createdAt')), 'lastAt']],
      group: ['entryType'],
      raw: true
    });

    const countMap = {};
    typeCounts.forEach(r => { countMap[r.entryType] = { count: parseInt(r.count), lastAt: r.lastAt }; });

    const sources = [
      {
        id: 'ai_consult',
        name: 'Dr. iSHA (AI)',
        description: 'Auto-logged from every AI health consultation',
        icon: 'brain',
        status: 'active',
        entryTypes: ['ai_consultation'],
        count: countMap['ai_consultation']?.count || 0,
        lastSync: countMap['ai_consultation']?.lastAt || null,
      },
      {
        id: 'appointments',
        name: 'Doctor Consultations',
        description: 'Auto-logged when appointments are booked and completed',
        icon: 'stethoscope',
        status: 'active',
        entryTypes: ['consultation', 'appointment'],
        count: (countMap['consultation']?.count || 0) + (countMap['appointment']?.count || 0),
        lastSync: countMap['consultation']?.lastAt || countMap['appointment']?.lastAt || null,
      },
      {
        id: 'prescriptions',
        name: 'Prescriptions & Medications',
        description: 'Auto-logged when prescriptions are issued',
        icon: 'pill',
        status: 'active',
        entryTypes: ['prescription', 'medication'],
        count: (countMap['prescription']?.count || 0) + (countMap['medication']?.count || 0),
        lastSync: countMap['prescription']?.lastAt || null,
      },
      {
        id: 'lab',
        name: 'Lab Tests & Reports',
        description: 'Auto-logged from uploaded reports and lab orders',
        icon: 'activity',
        status: 'active',
        entryTypes: ['lab_test', 'lab_result'],
        count: (countMap['lab_test']?.count || 0) + (countMap['lab_result']?.count || 0),
        lastSync: countMap['lab_result']?.lastAt || countMap['lab_test']?.lastAt || null,
      },
      {
        id: 'vitals',
        name: 'Remote Health Monitoring',
        description: 'Vitals from wearables and manual readings',
        icon: 'heart',
        status: 'active',
        entryTypes: ['vital', 'device_reading'],
        count: (countMap['vital']?.count || 0) + (countMap['device_reading']?.count || 0),
        lastSync: countMap['vital']?.lastAt || countMap['device_reading']?.lastAt || null,
      },
      {
        id: 'ehr',
        name: 'EHR / EMR Records',
        description: 'Synced from electronic health records and uploaded reports',
        icon: 'file-text',
        status: 'active',
        entryTypes: ['diagnosis'],
        count: countMap['diagnosis']?.count || 0,
        lastSync: countMap['diagnosis']?.lastAt || null,
      },
      {
        id: 'hra',
        name: 'Health Risk Assessment',
        description: 'Periodic AI-powered health risk analysis',
        icon: 'shield',
        status: 'active',
        entryTypes: ['note'],
        count: 0,
        lastSync: null,
      },
      {
        id: 'manual',
        name: 'Manual Entries',
        description: 'Events you log yourself (mood, sleep, diet, symptoms)',
        icon: 'edit',
        status: 'active',
        entryTypes: ['mood', 'sleep', 'diet', 'note', 'symptom'],
        count: ['mood', 'sleep', 'diet', 'note', 'symptom'].reduce((s, t) => s + (countMap[t]?.count || 0), 0),
        lastSync: null,
      },
    ];

    res.json({ success: true, sources });
  } catch (error) {
    console.error('Sources error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch sources', error: error.message });
  }
});

/**
 * @route   POST /api/health-diary/sync
 * @desc    Pull unlogged records from appointments, prescriptions, EHR and write them to the diary
 * @access  Private
 */
router.post('/sync', authUser, async (req, res) => {
  try {
    const userId = parseInt(req.user?.id || req.user?.dataValues?.id || req.user?._id);
    const synced = { appointments: 0, prescriptions: 0, ehr: 0, total: 0 };

    // ── 1. Sync completed appointments ─────────────────────────────────────
    try {
      const { Appointment } = await import('../models/index.js');
      const alreadyLinked = new Set(
        (await HealthDiary.findAll({
          where: { userId, linkedRecordType: 'appointment' },
          attributes: ['linkedRecordId'],
          raw: true
        })).map(r => String(r.linkedRecordId))
      );

      const completedAppts = await Appointment.findAll({
        where: { userId, status: { [Op.in]: ['completed', 'scheduled', 'confirmed'] } },
        order: [['scheduledTime', 'DESC']],
        limit: 50
      });

      for (const appt of completedAppts) {
        if (alreadyLinked.has(String(appt.id))) continue;
        await healthDiaryService.logConsultation(userId, {
          id: appt.id,
          doctorId: appt.doctorId,
          doctorName: appt.doctorName || appt.doctor?.name || 'Doctor',
          consultationType: appt.consultationType || 'General',
          status: appt.status,
          scheduledTime: appt.scheduledTime,
          duration: appt.duration
        });
        synced.appointments++;
      }
    } catch (apptErr) {
      console.warn('Appointment sync partial failure:', apptErr.message);
    }

    // ── 2. Sync prescriptions ───────────────────────────────────────────────
    try {
      const alreadyLinked = new Set(
        (await HealthDiary.findAll({
          where: { userId, linkedRecordType: 'prescription' },
          attributes: ['linkedRecordId'],
          raw: true
        })).map(r => String(r.linkedRecordId))
      );

      const prescriptions = await prescriptionRepository.findAllForPatient(req, userId, { limit: 50 });

      for (const rx of prescriptions) {
        if (alreadyLinked.has(String(rx.id))) continue;
        await healthDiaryService.logPrescription(userId, {
          id: rx.id,
          doctorId: rx.doctorId,
          doctorName: rx.doctorName || 'Doctor',
          medications: rx.medications || [],
          diagnosis: rx.diagnosis,
          prescriptionDate: rx.createdAt
        });
        synced.prescriptions++;
      }
    } catch (rxErr) {
      console.warn('Prescription sync partial failure:', rxErr.message);
    }

    // ── 3. Sync EHR records ─────────────────────────────────────────────────
    try {
      const alreadyLinked = new Set(
        (await HealthDiary.findAll({
          where: { userId, linkedRecordType: 'ehr' },
          attributes: ['linkedRecordId'],
          raw: true
        })).map(r => String(r.linkedRecordId))
      );

      const ehrRecords = await EHRRecord.findAll({
        where: { patientId: userId },
        order: [['createdAt', 'DESC']],
        limit: 30
      });

      for (const ehr of ehrRecords) {
        if (alreadyLinked.has(String(ehr.id))) continue;
        await healthDiaryService.logHealthEvent({
          userId,
          entryType: ehr.recordType === 'diagnosis' ? 'diagnosis' : 'consultation',
          title: ehr.summary || ehr.recordType || 'EHR Record',
          description: ehr.notes || '',
          data: {
            ehrId: ehr.id,
            recordType: ehr.recordType,
            provider: ehr.provider,
            source: 'ehr_sync'
          },
          linkedRecordId: ehr.id,
          linkedRecordType: 'ehr',
          timestamp: ehr.recordDate || ehr.createdAt
        });
        synced.ehr++;
      }
    } catch (ehrErr) {
      console.warn('EHR sync partial failure:', ehrErr.message);
    }

    synced.total = synced.appointments + synced.prescriptions + synced.ehr;

    res.json({
      success: true,
      message: synced.total > 0
        ? `Synced ${synced.total} new event${synced.total !== 1 ? 's' : ''} from your health records`
        : 'Your diary is already up to date',
      synced
    });
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({ success: false, message: 'Sync failed', error: error.message });
  }
});

export default router;
