const express = require('express');
const router = express.Router();
const { DelegationLog } = require('../models/delegation-log.model');
const { authDoctor } = require('../middleware/doctor.middleware');

// Get delegation logs
router.get('/logs', authDoctor, async (req, res) => {
  try {
    const { status, riskLevel } = req.query;
    const where = { supervisorId: req.doctor.id };
    if (status) where.reviewStatus = status;
    if (riskLevel) where.riskLevel = riskLevel;
    
    const logs = await DelegationLog.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: 100
    });
    
    res.json({ success: true, data: logs });
  } catch (error) {
    console.error('Fetch delegation logs error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch delegation logs', error: error.message });
  }
});

// Create delegation log
router.post('/logs', authDoctor, async (req, res) => {
  try {
    const log = await DelegationLog.create({
      ...req.body,
      supervisorId: req.doctor.id
    });
    res.status(201).json({ success: true, data: log });
  } catch (error) {
    console.error('Create delegation log error:', error);
    res.status(500).json({ success: false, message: 'Failed to create delegation log', error: error.message });
  }
});

// Review delegated action
router.patch('/logs/:id/review', authDoctor, async (req, res) => {
  try {
    const log = await DelegationLog.findOne({
      where: { id: req.params.id, supervisorId: req.doctor.id }
    });
    
    if (!log) return res.status(404).json({ success: false, message: 'Log not found' });
    
    await log.update({
      reviewStatus: req.body.status,
      reviewedAt: new Date(),
      reviewNotes: req.body.notes
    });
    
    res.json({ success: true, data: log });
  } catch (error) {
    console.error('Review delegation error:', error);
    res.status(500).json({ success: false, message: 'Failed to review delegation', error: error.message });
  }
});

// Co-sign delegated action
router.patch('/logs/:id/cosign', authDoctor, async (req, res) => {
  try {
    const log = await DelegationLog.findOne({
      where: { id: req.params.id, supervisorId: req.doctor.id }
    });
    
    if (!log) return res.status(404).json({ success: false, message: 'Log not found' });
    
    await log.update({
      coSignedBy: req.doctor.id,
      coSignedAt: new Date(),
      reviewStatus: 'approved'
    });
    
    res.json({ success: true, data: log });
  } catch (error) {
    console.error('Co-sign delegation error:', error);
    res.status(500).json({ success: false, message: 'Failed to co-sign delegation', error: error.message });
  }
});

module.exports = router;
