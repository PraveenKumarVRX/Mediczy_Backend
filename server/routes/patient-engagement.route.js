import express from 'express';
const router = express.Router();
import PatientEngagement from '../models/patient-engagement.model.js';
import { authDoctor } from '../middleware/doctor.middleware.js';
import { notificationService } from '../services/notification.service.js';

// Get patient engagement records
router.get('/patient/:patientId', authDoctor, async (req, res) => {
  try {
    const records = await PatientEngagement.findAll({
      where: { patientId: req.params.patientId },
      order: [['createdAt', 'DESC']]
    });
    res.json({ success: true, data: records });
  } catch (error) {
    console.error('Fetch engagement records error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch engagement records', error: error.message });
  }
});

// Create post-visit instructions
router.post('/', authDoctor, async (req, res) => {
  try {
    const engagement = await PatientEngagement.create({
      ...req.body,
      doctorId: req.doctor.id,
      sentAt: new Date(),
      deliveryStatus: { email: 'pending', sms: 'pending', app: 'pending' }
    });
    
    // Send multi-channel notifications
    const { patientId, instructions, warningSigns } = req.body;
    await notificationService.sendNotification({
      userId: patientId,
      type: 'post_visit_instructions',
      title: 'Post-Visit Instructions',
      message: instructions,
      channels: ['email', 'sms', 'app'],
      data: { engagementId: engagement.id, warningSigns }
    });
    
    res.status(201).json({ success: true, data: engagement });
  } catch (error) {
    console.error('Create engagement error:', error);
    res.status(500).json({ success: false, message: 'Failed to create engagement', error: error.message });
  }
});

// Mark as acknowledged by patient
router.patch('/:id/acknowledge', async (req, res) => {
  try {
    const engagement = await PatientEngagement.findByPk(req.params.id);
    if (!engagement) return res.status(404).json({ success: false, message: 'Engagement record not found' });
    
    await engagement.update({
      patientAcknowledged: true,
      acknowledgedAt: new Date()
    });
    
    res.json({ success: true, data: engagement });
  } catch (error) {
    console.error('Acknowledge engagement error:', error);
    res.status(500).json({ success: false, message: 'Failed to acknowledge engagement', error: error.message });
  }
});

export default router;
