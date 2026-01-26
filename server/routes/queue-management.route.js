const express = require('express');
const router = express.Router();
const { QueueEntry } = require('../models/queue-management.model');
const { authDoctor } = require('../middleware/doctor.middleware');
const { notificationService } = require('../services/notification.service');

// Get doctor's current queue
router.get('/my-queue', authDoctor, async (req, res) => {
  try {
    const queue = await QueueEntry.findAll({
      where: { 
        doctorId: req.doctor.id,
        status: ['waiting', 'called', 'in_consultation']
      },
      order: [
        ['priority', 'DESC'],
        ['arrivedAt', 'ASC']
      ]
    });
    
    res.json({ success: true, data: queue });
  } catch (error) {
    console.error('Fetch queue error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch queue', error: error.message });
  }
});

// Add patient to queue
router.post('/add', authDoctor, async (req, res) => {
  try {
    const { patientId, queueType, triageLevel, chiefComplaint } = req.body;
    
    // Calculate priority based on triage level
    const priorityMap = {
      'ESI-1': 5,
      'ESI-2': 4,
      'ESI-3': 3,
      'ESI-4': 2,
      'ESI-5': 1
    };
    
    // Estimate wait time based on current queue
    const currentQueue = await QueueEntry.count({
      where: { doctorId: req.doctor.id, status: ['waiting', 'called'] }
    });
    const estimatedWaitMinutes = currentQueue * 20; // Assume 20 min per patient
    
    const eta = new Date();
    eta.setMinutes(eta.getMinutes() + estimatedWaitMinutes);
    
    const entry = await QueueEntry.create({
      patientId,
      doctorId: req.doctor.id,
      queueType: queueType || 'walk-in',
      priority: priorityMap[triageLevel] || 1,
      triageLevel,
      chiefComplaint,
      estimatedWaitMinutes,
      eta,
      arrivedAt: new Date()
    });
    
    res.status(201).json({ success: true, data: entry });
  } catch (error) {
    console.error('Add to queue error:', error);
    res.status(500).json({ success: false, message: 'Failed to add to queue', error: error.message });
  }
});

// Call patient from queue
router.patch('/:id/call', authDoctor, async (req, res) => {
  try {
    const entry = await QueueEntry.findOne({
      where: { id: req.params.id, doctorId: req.doctor.id }
    });
    
    if (!entry) {
      return res.status(404).json({ success: false, message: 'Queue entry not found' });
    }
    
    await entry.update({
      status: 'called',
      calledAt: new Date()
    });
    
    // Send notification to patient
    await notificationService.sendNotification({
      userId: entry.patientId,
      type: 'queue_called',
      title: 'You are being called',
      message: 'Please proceed to the consultation room',
      priority: 'urgent'
    });
    
    res.json({ success: true, data: entry });
  } catch (error) {
    console.error('Call patient error:', error);
    res.status(500).json({ success: false, message: 'Failed to call patient', error: error.message });
  }
});

// Mark consultation as started
router.patch('/:id/start', authDoctor, async (req, res) => {
  try {
    const entry = await QueueEntry.findOne({
      where: { id: req.params.id, doctorId: req.doctor.id }
    });
    
    if (!entry) {
      return res.status(404).json({ success: false, message: 'Queue entry not found' });
    }
    
    const consultationStartedAt = new Date();
    const actualWaitMinutes = Math.floor((consultationStartedAt - new Date(entry.arrivedAt)) / 60000);
    
    await entry.update({
      status: 'in_consultation',
      consultationStartedAt,
      actualWaitMinutes
    });
    
    res.json({ success: true, data: entry });
  } catch (error) {
    console.error('Start consultation error:', error);
    res.status(500).json({ success: false, message: 'Failed to start consultation', error: error.message });
  }
});

// Complete consultation
router.patch('/:id/complete', authDoctor, async (req, res) => {
  try {
    const entry = await QueueEntry.findOne({
      where: { id: req.params.id, doctorId: req.doctor.id }
    });
    
    if (!entry) {
      return res.status(404).json({ success: false, message: 'Queue entry not found' });
    }
    
    const completedAt = new Date();
    const consultationDurationMinutes = Math.floor((completedAt - new Date(entry.consultationStartedAt)) / 60000);
    
    await entry.update({
      status: 'completed',
      completedAt,
      consultationDurationMinutes
    });
    
    res.json({ success: true, data: entry });
  } catch (error) {
    console.error('Complete consultation error:', error);
    res.status(500).json({ success: false, message: 'Failed to complete consultation', error: error.message });
  }
});

// Mark as no-show
router.patch('/:id/no-show', authDoctor, async (req, res) => {
  try {
    const entry = await QueueEntry.findOne({
      where: { id: req.params.id, doctorId: req.doctor.id }
    });
    
    if (!entry) {
      return res.status(404).json({ success: false, message: 'Queue entry not found' });
    }
    
    await entry.update({
      status: 'no_show',
      noShowReason: req.body.reason || 'Patient did not respond to call',
      noShowHandling: 'rescheduled' // Can be 'rescheduled', 'cancelled', 'charged'
    });
    
    res.json({ success: true, data: entry });
  } catch (error) {
    console.error('Mark no-show error:', error);
    res.status(500).json({ success: false, message: 'Failed to mark no-show', error: error.message });
  }
});

// Get queue analytics
router.get('/analytics', authDoctor, async (req, res) => {
  try {
    const { Op } = require('sequelize');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const completedToday = await QueueEntry.count({
      where: {
        doctorId: req.doctor.id,
        status: 'completed',
        completedAt: { [Op.gte]: today }
      }
    });
    
    const noShowsToday = await QueueEntry.count({
      where: {
        doctorId: req.doctor.id,
        status: 'no_show',
        createdAt: { [Op.gte]: today }
      }
    });
    
    const avgWaitTime = await QueueEntry.findAll({
      where: {
        doctorId: req.doctor.id,
        status: 'completed',
        completedAt: { [Op.gte]: today }
      },
      attributes: [
        [require('sequelize').fn('AVG', require('sequelize').col('actualWaitMinutes')), 'avgWait']
      ]
    });
    
    res.json({
      success: true,
      data: {
        completedToday,
        noShowsToday,
        avgWaitTimeMinutes: avgWaitTime[0]?.dataValues.avgWait || 0
      }
    });
  } catch (error) {
    console.error('Fetch analytics error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch analytics', error: error.message });
  }
});

module.exports = router;
